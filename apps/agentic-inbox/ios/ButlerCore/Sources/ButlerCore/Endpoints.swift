import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// `?space=<id>`; `all` (or nil) means every space — same contract as the web client.
func spaceQuery(_ spaceId: String?) -> [String: String?] {
    ["space": spaceId ?? "all"]
}

public extension ButlerAPI {
    // MARK: session & status

    func session() async throws -> SessionView { try await get("/api/session") }
    func signOut() async throws { _ = try await delete("/api/session") as OkResponse }
    func status() async throws -> AppStatus { try await get("/api/status") }
    func health() async throws -> Bool { (try await get("/api/health") as OkResponse).ok ?? false }

    /// URL the app opens in `ASWebAuthenticationSession`; the server bounces to `butler://signed-in`.
    func nativeSignInURL() throws -> URL { try url("/api/auth/microsoft/start", query: ["client": "native"]) }

    // MARK: mail

    func threads(space: String?, query q: String? = nil) async throws -> [ThreadSummary] {
        var query = spaceQuery(space)
        if let q, !q.isEmpty { query["q"] = q }
        return try await get("/api/threads", query: query)
    }

    func thread(_ id: String) async throws -> MailThread { try await get("/api/threads/\(id)") }

    func markThreadRead(_ id: String, unread: Bool = false) async throws {
        _ = try await post("/api/threads/\(id)/read", body: ["unread": unread]) as OkResponse
    }

    func reply(thread id: String, body: String, actor: String = "user") async throws -> EmailMessage {
        try await post("/api/threads/\(id)/reply", body: ["body": body, "actor": actor])
    }

    // MARK: calendar

    func events(space: String?, from: Date, to: Date) async throws -> [CalendarEvent] {
        var query = spaceQuery(space)
        query["from"] = String(Int(from.millis))
        query["to"] = String(Int(to.millis))
        return try await get("/api/events", query: query)
    }

    func event(_ id: String) async throws -> CalendarEvent { try await get("/api/events/\(id)") }

    func brief(event id: String, refresh: Bool = false, existingOnly: Bool = false) async throws -> MeetingBrief? {
        var query: [String: String?] = [:]
        if refresh { query["refresh"] = "1" }
        if existingOnly { query["existing"] = "1" }
        return try await get("/api/events/\(id)/brief", query: query)
    }

    // MARK: chats

    func chats(space: String?) async throws -> [Chat] { try await get("/api/chats", query: spaceQuery(space)) }
    func chat(_ id: String) async throws -> ChatDetail { try await get("/api/chats/\(id)") }
    func markChatRead(_ id: String) async throws { try await postEmpty("/api/chats/\(id)/read") }

    func sendChat(_ id: String, body: String, replyToId: String? = nil, actor: String = "user") async throws -> ChatMessage {
        struct Body: Encodable { var body: String; var actor: String; var replyToId: String? }
        return try await post("/api/chats/\(id)/send", body: Body(body: body, actor: actor, replyToId: replyToId))
    }

    // MARK: meetings

    func meetings(space: String?) async throws -> [Meeting] { try await get("/api/meetings", query: spaceQuery(space)) }
    func meeting(_ id: String) async throws -> MeetingDetail { try await get("/api/meetings/\(id)") }

    func followUp(meeting id: String, refresh: Bool = false) async throws -> FollowUp {
        if refresh { return try await post("/api/meetings/\(id)/followup") }
        return try await get("/api/meetings/\(id)/followup")
    }

    func sendFollowUp(meeting id: String, body: String, subject: String? = nil, actor: String = "user") async throws -> MailThread {
        struct Body: Encodable { var body: String; var subject: String?; var actor: String }
        return try await post("/api/meetings/\(id)/followup/send", body: Body(body: body, subject: subject, actor: actor))
    }

    func minutes(meeting id: String) async throws -> Note? { try await get("/api/meetings/\(id)/minutes") }

    func buildMinutes(meeting id: String, templatePath: String? = nil) async throws -> Note {
        struct Body: Encodable { var templatePath: String?; var refresh: Bool }
        return try await post("/api/meetings/\(id)/minutes", body: Body(templatePath: templatePath, refresh: true))
    }

    func transcribeWithPlaud(meeting id: String) async throws -> PlaudResult { try await post("/api/meetings/\(id)/plaud") }

    struct PlaudResult: Codable, Hashable, Sendable {
        public var ok: Bool
        public var message: String?
        public var segments: Int?
    }

    // MARK: commitments / board

    func commitments(space: String?, status: String? = nil) async throws -> [Commitment] {
        var query = spaceQuery(space)
        if let status { query["status"] = status }
        return try await get("/api/commitments", query: query)
    }

    func setLane(_ id: String, lane: BoardLane) async throws -> Commitment {
        try await patch("/api/commitments/\(id)", body: ["boardLane": lane.rawValue])
    }

    func setStatus(_ id: String, status: CommitmentStatus) async throws -> Commitment {
        try await patch("/api/commitments/\(id)", body: ["status": status.rawValue])
    }

    func createCommitment(space: String, text: String, counterpart: String, direction: CommitmentDirection = .owedByMe, due: String? = nil) async throws {
        struct Body: Encodable { var spaceId: String; var direction: String; var counterpart: String; var text: String; var due: String? }
        _ = try await post("/api/commitments", query: spaceQuery(space),
                           body: Body(spaceId: space, direction: direction.rawValue, counterpart: counterpart, text: text, due: due)) as OkResponse
    }

    func extractCommitments(space: String?) async throws -> Int {
        struct Out: Decodable { var inserted: Int }
        return (try await post("/api/commitments/extract", query: spaceQuery(space)) as Out).inserted
    }

    func pushToTodo(_ id: String) async throws -> Commitment { try await post("/api/commitments/\(id)/todo") }

    // MARK: briefing, drafts, radar, catch-up, topics, digests

    func briefing(space: String?) async throws -> MorningBriefing { try await get("/api/briefing", query: spaceQuery(space)) }

    func generateDrafts(space: String?) async throws -> Int {
        struct Out: Decodable { var created: Int }
        return (try await post("/api/drafts", query: spaceQuery(space)) as Out).created
    }

    func setDraft(_ id: String, status: String) async throws -> ProposedDraft {
        try await patch("/api/drafts/\(id)", body: ["status": status])
    }

    func postBriefingToTeams(space: String?) async throws -> BriefingPostResult {
        try await post("/api/org/briefing/post", query: spaceQuery(space))
    }

    func radar(space: String?) async throws -> [RadarItem] { try await get("/api/radar", query: spaceQuery(space)) }

    func catchUp(space: String?, from: Date?, sinceSeen: Bool = false) async throws -> CatchUp {
        var query = spaceQuery(space)
        if sinceSeen { query["preset"] = "seen" } else if let from { query["from"] = String(Int(from.millis)) }
        return try await get("/api/catchup", query: query)
    }

    func markCatchUpSeen(space: String?) async throws { try await postEmpty("/api/catchup/seen", query: spaceQuery(space)) }

    func topics(space: String?) async throws -> [Topic] { try await get("/api/topics", query: spaceQuery(space)) }

    func rebuildTopics(space: String?) async throws -> Int {
        struct Out: Decodable { var topics: Int }
        return (try await post("/api/topics/rebuild", query: spaceQuery(space)) as Out).topics
    }

    func digests(space: String?) async throws -> [Digest] { try await get("/api/digests", query: spaceQuery(space)) }

    func runDigest(space: String?, period: String) async throws -> [Digest] {
        var query = spaceQuery(space)
        query["period"] = period
        return try await post("/api/digests/run", query: query)
    }

    // MARK: people

    func people(space: String?) async throws -> [Person] { try await get("/api/people", query: spaceQuery(space)) }
    func person(_ id: String) async throws -> PersonProfile { try await get("/api/people/\(id)") }

    func person(byEmail email: String, space: String?) async throws -> PersonProfile? {
        var query = spaceQuery(space)
        query["email"] = email
        return try await get("/api/people/by-email", query: query)
    }

    func updatePerson(_ id: String, vip: Bool? = nil, notes: String? = nil) async throws -> Person {
        struct Body: Encodable { var vip: Bool?; var notes: String? }
        return try await patch("/api/people/\(id)", body: Body(vip: vip, notes: notes))
    }

    // MARK: notifications

    func notifications(space: String?) async throws -> [AppNotification] { try await get("/api/notifications", query: spaceQuery(space)) }

    func markNotificationRead(_ id: String) async throws {
        _ = try await post("/api/notifications/read", body: ["id": id]) as OkResponse
    }

    func markAllNotificationsRead(space: String?) async throws {
        try await postEmpty("/api/notifications/read", query: spaceQuery(space))
    }

    // MARK: settings

    func updateSpace(_ id: String, name: String? = nil, quietHours: [Int]?? = nil, digestHour: Int? = nil, agentTone: String? = nil, signature: String? = nil) async throws -> Space {
        struct Body: Encodable {
            var name: String?
            var quietHours: [Int]??
            var digestHour: Int?
            var agentTone: String?
            var signature: String?

            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: Keys.self)
                try c.encodeIfPresent(name, forKey: .name)
                if let quietHours { try c.encode(quietHours, forKey: .quietHours) }
                try c.encodeIfPresent(digestHour, forKey: .digestHour)
                try c.encodeIfPresent(agentTone, forKey: .agentTone)
                try c.encodeIfPresent(signature, forKey: .signature)
            }

            enum Keys: String, CodingKey { case name, quietHours, digestHour, agentTone, signature }
        }
        return try await patch("/api/spaces/\(id)", body: Body(name: name, quietHours: quietHours, digestHour: digestHour, agentTone: agentTone, signature: signature))
    }

    func syncAccount(_ id: String, full: Bool = false) async throws {
        _ = try await post("/api/accounts/\(id)/sync", query: full ? ["full": "1"] : [:]) as JSONValue
    }

    func syncAll() async throws { _ = try await post("/api/sync") as JSONValue }
    func removeAccount(_ id: String) async throws { _ = try await delete("/api/accounts/\(id)") as OkResponse }

    func moveAccount(_ id: String, to spaceId: String) async throws -> Account {
        try await patch("/api/accounts/\(id)", body: ["spaceId": spaceId])
    }

    func llmConfig() async throws -> LlmConfigView { try await get("/api/llm/config") }

    func updateLlm(apiKey: String?? = nil, model: String?? = nil, embedModel: String?? = nil) async throws -> LlmConfigView {
        struct Body: Encodable {
            var apiKey: String??
            var model: String??
            var embedModel: String??
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: Keys.self)
                if let apiKey { try c.encode(apiKey, forKey: .apiKey) }
                if let model { try c.encode(model, forKey: .model) }
                if let embedModel { try c.encode(embedModel, forKey: .embedModel) }
            }
            enum Keys: String, CodingKey { case apiKey, model, embedModel }
        }
        return try await patch("/api/llm/config", body: Body(apiKey: apiKey, model: model, embedModel: embedModel))
    }

    func org(space: String?) async throws -> OrgSettingsView { try await get("/api/org", query: spaceQuery(space)) }

    func updateOrg(space: String?, briefChannelTitle: String? = nil, vaultUrl: String? = nil, templateFolder: String? = nil) async throws -> OrgSettingsView {
        struct Body: Encodable { var briefChannelTitle: String?; var vaultUrl: String?; var templateFolder: String? }
        return try await patch("/api/org", query: spaceQuery(space), body: Body(briefChannelTitle: briefChannelTitle, vaultUrl: vaultUrl, templateFolder: templateFolder))
    }

    func syncVault(space: String?) async throws -> OrgSettingsView { try await post("/api/org/vault/sync", query: spaceQuery(space)) }

    func savePlaud(space: String?, clientId: String?, clientSecret: String?, apiKey: String?) async throws -> OrgSettingsView {
        struct Body: Encodable { var clientId: String?; var clientSecret: String?; var apiKey: String? }
        return try await post("/api/org/plaud", query: spaceQuery(space), body: Body(clientId: clientId, clientSecret: clientSecret, apiKey: apiKey))
    }

    // MARK: agent + live events

    /// Streams agent events until `done`. Cancel the task to abort.
    func askAgent(_ input: String, context: AgentContext) -> AsyncThrowingStream<AgentEvent, Error> {
        struct Body: Encodable { var input: String; var context: AgentContext }
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let req = try request("POST", "/api/agent", body: try Self.encoder.encode(Body(input: input, context: context)), accept: "text/event-stream")
                    for try await payload in stream(req) {
                        guard let data = payload.data(using: .utf8) else { continue }
                        let event = try Self.decoder.decode(AgentEvent.self, from: data)
                        continuation.yield(event)
                        if event == .done { break }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// Long-lived change feed; the caller reconnects on failure.
    func serverEvents() -> AsyncThrowingStream<ServerEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let req = try request("GET", "/api/events-stream", accept: "text/event-stream")
                    for try await payload in stream(req) {
                        guard let data = payload.data(using: .utf8),
                              let event = try? Self.decoder.decode(ServerEvent.self, from: data) else { continue }
                        continuation.yield(event)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

/// Untyped JSON for endpoints whose payload the app only needs to acknowledge (sync stats).
public enum JSONValue: Decodable, Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }
}
