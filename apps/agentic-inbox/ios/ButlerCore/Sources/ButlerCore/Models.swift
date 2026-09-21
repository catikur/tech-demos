import Foundation

/// Epoch milliseconds, as the Bun server emits them.
public typealias Millis = Double

public extension Millis {
    var date: Date { Date(timeIntervalSince1970: self / 1000) }
}

public extension Date {
    var millis: Millis { timeIntervalSince1970 * 1000 }
}

/// Decodes a string-backed enum but never fails on values the server adds later.
public protocol LenientEnum: RawRepresentable, Codable, Hashable, Sendable where RawValue == String {
    static var fallback: Self { get }
}

public extension LenientEnum {
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? Self.fallback
    }
}

// MARK: - Spaces & accounts

public enum SpaceKind: String, LenientEnum {
    case work, personal
    public static let fallback: SpaceKind = .work
}

public struct Space: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var kind: SpaceKind
    public var name: String
    public var color: String
    public var quietHours: [Int]?
    public var digestHour: Int
    public var agentTone: String
    public var signature: String

    public var quietRange: (from: Int, to: Int)? {
        guard let q = quietHours, q.count == 2 else { return nil }
        return (q[0], q[1])
    }
}

public enum Provider: String, LenientEnum {
    case demo, m365, gmail
    public static let fallback: Provider = .demo
}

public struct Account: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var provider: Provider
    public var email: String
    public var displayName: String
    public var connectedAt: Millis
    public var lastSyncAt: Millis?
    public var lastSyncError: String?
    public var capabilities: [String]
    public var ownerEmail: String?
}

public struct LlmStatus: Codable, Hashable, Sendable {
    public var provider: String
    public var model: String?
    public var configured: Bool
}

public struct AppStatus: Codable, Hashable, Sendable {
    public var spaces: [Space]
    public var accounts: [Account]
    public var llm: LlmStatus
    public var oauth: OAuthFlags
    public var demoMode: Bool
    public var unreadNotifications: Int

    public struct OAuthFlags: Codable, Hashable, Sendable {
        public var microsoft: Bool
        public var google: Bool
    }
}

public struct SessionView: Codable, Hashable, Sendable {
    public var authenticated: Bool
    public var loginRequired: Bool
    public var allowedDomain: String
    public var email: String?
    public var accountId: String?
    public var microsoftConfigured: Bool
    public var googleConfigured: Bool
}

// MARK: - Mail

public enum ThreadCategory: String, LenientEnum {
    case newsletter, support, invite, billing, recruiting, personal, security, project, other
    public static let fallback: ThreadCategory = .other
}

public struct EmailMessage: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var threadId: String
    public var from: String
    public var to: [String]
    public var cc: [String]
    public var body: String
    public var bodyHtml: String?
    public var at: Millis
    public var isMine: Bool
}

public struct ThreadSummary: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var accountId: String
    public var subject: String
    public var category: ThreadCategory
    public var labels: [String]
    public var unread: Bool
    public var lastAt: Millis
    public var participants: [String]
    public var snippet: String
    public var lastFrom: String
    public var messageCount: Int
}

public struct MailThread: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var accountId: String
    public var subject: String
    public var category: ThreadCategory
    public var labels: [String]
    public var unread: Bool
    public var lastAt: Millis
    public var participants: [String]
    public var messages: [EmailMessage]
}

// MARK: - Calendar & meetings

public enum ResponseStatus: String, LenientEnum {
    case accepted, tentative, declined, none
    public static let fallback: ResponseStatus = .none
}

public struct CalendarEvent: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var accountId: String
    public var title: String
    public var start: Millis
    public var end: Millis
    public var location: String
    public var organizer: String
    public var attendees: [String]
    public var joinUrl: String?
    public var description: String
    public var descriptionHtml: String?
    public var meetingId: String?
    public var responseStatus: ResponseStatus
}

public struct TranscriptLine: Codable, Hashable, Sendable {
    public var speaker: String
    public var at: Millis
    public var text: String
}

public struct Meeting: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var accountId: String
    public var eventId: String?
    public var title: String
    public var start: Millis
    public var end: Millis
    public var attendees: [String]
    public var hasTranscript: Bool
    public var hasRecording: Bool
    public var recordingUrl: String?
    public var recordingLocked: Bool
    public var joinUrl: String?
}

public struct MeetingDetail: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var accountId: String
    public var eventId: String?
    public var title: String
    public var start: Millis
    public var end: Millis
    public var attendees: [String]
    public var hasTranscript: Bool
    public var hasRecording: Bool
    public var recordingUrl: String?
    public var recordingLocked: Bool
    public var joinUrl: String?
    public var transcript: [TranscriptLine]?

    public var meeting: Meeting {
        Meeting(id: id, spaceId: spaceId, accountId: accountId, eventId: eventId, title: title, start: start, end: end,
                attendees: attendees, hasTranscript: hasTranscript, hasRecording: hasRecording,
                recordingUrl: recordingUrl, recordingLocked: recordingLocked, joinUrl: joinUrl)
    }
}

// MARK: - Chats

public enum ChatKind: String, LenientEnum {
    case oneOnOne, group, channel
    public static let fallback: ChatKind = .group
}

public struct Chat: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var accountId: String
    public var kind: ChatKind
    public var title: String
    public var members: [String]
    public var lastAt: Millis
    public var unreadCount: Int
}

public struct ChatMessage: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var chatId: String
    public var from: String
    public var body: String
    public var bodyHtml: String?
    public var at: Millis
    public var isMine: Bool
    public var mentionsMe: Bool
    public var replyToId: String?
}

public struct ChatDetail: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var accountId: String
    public var kind: ChatKind
    public var title: String
    public var members: [String]
    public var lastAt: Millis
    public var unreadCount: Int
    public var messages: [ChatMessage]
}

// MARK: - Commitments / board

public enum CommitmentDirection: String, LenientEnum {
    case owedByMe = "owed_by_me"
    case owedToMe = "owed_to_me"
    public static let fallback: CommitmentDirection = .owedByMe
}

public enum CommitmentStatus: String, LenientEnum {
    case open, done, dropped
    public static let fallback: CommitmentStatus = .open
}

public enum BoardLane: String, LenientEnum, CaseIterable {
    case todo, doing, waiting, done
    public static let fallback: BoardLane = .todo
}

public enum SourceKind: String, LenientEnum {
    case thread, chat, meeting, event, manual
    public static let fallback: SourceKind = .manual
}

public struct SourceRef: Codable, Hashable, Sendable {
    public var kind: SourceKind
    public var id: String
    public var label: String

    public init(kind: SourceKind, id: String, label: String) {
        self.kind = kind
        self.id = id
        self.label = label
    }
}

public struct Commitment: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var direction: CommitmentDirection
    public var counterpart: String
    public var counterpartName: String?
    public var text: String
    public var dueAt: Millis?
    public var status: CommitmentStatus
    public var boardLane: BoardLane?
    public var source: SourceRef
    public var createdAt: Millis
    public var confidence: Double
    public var msTaskId: String?
    public var ownerEmail: String?

    /// Mirrors `laneOf()` in the web cockpit: done wins, then stored lane, then direction.
    public var lane: BoardLane {
        if status == .done { return .done }
        if let boardLane { return boardLane }
        return direction == .owedToMe ? .waiting : .todo
    }

    public var displayName: String { counterpartName ?? Address.name(counterpart) }
}

// MARK: - Feature DTOs

public struct RadarItem: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var direction: String
    public var source: SourceRef
    public var counterpart: String
    public var excerpt: String
    public var ageMs: Millis
    public var score: Double
    public var vip: Bool
    public var suggestedReply: String

    public var waitingOnMe: Bool { direction == "waiting_on_me" }
}

public struct CatchUpItem: Codable, Hashable, Sendable {
    public var source: SourceRef
    public var spaceId: String
    public var title: String
    public var excerpt: String
    public var at: Millis
    public var score: Double
    public var reason: String
}

public struct CatchUpSection: Codable, Hashable, Sendable {
    public var title: String
    public var items: [CatchUpItem]
}

public struct CatchUp: Codable, Hashable, Sendable {
    public var fromAt: Millis
    public var toAt: Millis
    public var summaryMarkdown: String
    public var sections: [CatchUpSection]
}

public struct Topic: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var name: String
    public var keywords: [String]
    public var links: [SourceRef]
    public var firstAt: Millis
    public var lastAt: Millis
    public var summary: String
}

public struct Note: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var kind: String
    public var eventId: String?
    public var meetingId: String?
    public var title: String
    public var bodyMarkdown: String
    public var createdAt: Millis
}

public struct Digest: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var period: String
    public var fromAt: Millis
    public var toAt: Millis
    public var bodyMarkdown: String
    public var createdAt: Millis
}

public struct AppNotification: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String?
    public var kind: String
    public var title: String
    public var body: String
    public var link: String?
    public var read: Bool
    public var createdAt: Millis
}

public struct Person: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var email: String
    public var name: String
    public var vip: Bool
    public var notes: String
    public var summary: String
    public var summaryAt: Millis?
}

public struct PersonProfile: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var email: String
    public var name: String
    public var vip: Bool
    public var notes: String
    public var summary: String
    public var summaryAt: Millis?
    public var lastContactAt: Millis?
    public var threadCount: Int
    public var chatCount: Int
    public var meetingCount: Int
    public var openCommitments: [Commitment]
    public var recentThreads: [ThreadSummary]
    public var recentChats: [Chat]
    public var upcomingMeetings: [CalendarEvent]
    public var topics: [String]
}

public struct ProposedDraft: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var spaceId: String
    public var ownerEmail: String
    public var threadId: String
    public var subject: String
    public var body: String
    public var status: String
    public var createdAt: Millis
}

public struct MorningBriefing: Codable, Hashable, Sendable {
    public var generatedAt: Millis
    public var fromAt: Millis
    public var toAt: Millis
    public var events: [CalendarEvent]
    public var unread: [ThreadSummary]
    public var dueCommitments: [Commitment]
    public var drafts: [ProposedDraft]
    public var recentMeetings: [Meeting]
    public var waitingOnMe: [RadarItem]
    public var waitingOnThem: [RadarItem]
}

public struct MeetingBrief: Codable, Hashable, Sendable {
    public struct Attendee: Codable, Hashable, Sendable {
        public var email: String
        public var name: String
        public var lastContactAt: Millis?
        public var openCommitments: Int
    }

    public var eventId: String
    public var title: String
    public var start: Millis
    public var attendees: [Attendee]
    public var recentThreads: [ThreadSummary]
    public var recentChats: [Chat]
    public var openCommitments: [Commitment]
    public var previousNotes: [Note]
    public var agendaSuggestions: [String]
    public var bodyMarkdown: String
}

public struct FollowUp: Codable, Hashable, Sendable {
    public struct Action: Codable, Hashable, Sendable {
        public var owner: String
        public var text: String
        public var dueAt: Millis?
    }

    public var meetingId: String
    public var decisions: [String]
    public var actions: [Action]
    public var draftSubject: String
    public var draftBody: String
    public var noteId: String
    public var createdCommitments: Int
    public var recipients: [String]?
}

public struct LlmConfigView: Codable, Hashable, Sendable {
    public var provider: String
    public var configured: Bool
    public var model: String
    public var modelSource: String
    public var envModel: String?
    public var apiKeyConfigured: Bool
    public var apiKeySource: String?
    public var apiKeyMasked: String?
    public var baseUrl: String
    public var embedModel: String
    public var embedModelSource: String
    public var envEmbedModel: String?
    public var mockForced: Bool
}

public struct OrgSettingsView: Codable, Hashable, Sendable {
    public struct ChannelOption: Codable, Hashable, Identifiable, Sendable {
        public var id: String
        public var title: String
    }

    public struct Template: Codable, Hashable, Identifiable, Sendable {
        public var path: String
        public var name: String
        public var id: String { path }
    }

    public struct Plaud: Codable, Hashable, Sendable {
        public var configured: Bool
        public var canTranscribe: Bool
        public var clientIdMasked: String?
        public var hasSecret: Bool
        public var hasApiKey: Bool
        public var mcpUrl: String
    }

    public var briefChannelTitle: String
    public var briefChatId: String?
    public var briefResolved: Bool
    public var channelOptions: [ChannelOption]
    public var vaultUrl: String
    public var templateFolder: String
    public var folders: [String]
    public var templates: [Template]
    public var vaultSyncedAt: Millis?
    public var vaultFileCount: Int
    public var vaultError: String?
    public var plaud: Plaud
}

public struct BriefingPostResult: Codable, Hashable, Sendable {
    public var posted: Bool
    public var skipped: String?
}

public struct OkResponse: Codable, Hashable, Sendable {
    public var ok: Bool?
}

// MARK: - Agent

public struct AgentContext: Codable, Hashable, Sendable {
    public var spaceId: String?
    public var selectedThreadId: String?
    public var selectedChatId: String?
    public var selectedEventId: String?

    public init(spaceId: String? = nil, selectedThreadId: String? = nil, selectedChatId: String? = nil, selectedEventId: String? = nil) {
        self.spaceId = spaceId
        self.selectedThreadId = selectedThreadId
        self.selectedChatId = selectedChatId
        self.selectedEventId = selectedEventId
    }
}

public enum DraftTargetKind: String, LenientEnum {
    case thread, chat, followup
    public static let fallback: DraftTargetKind = .thread
}

public struct DraftTarget: Codable, Hashable, Sendable {
    public var kind: DraftTargetKind
    public var id: String
}

public enum AgentEvent: Hashable, Sendable {
    case thought(String)
    case tool(name: String, input: String, output: String)
    case reply(String)
    case draft(target: DraftTarget, subject: String, body: String)
    case error(String)
    case done
}

extension AgentEvent: Decodable {
    private enum Keys: String, CodingKey { case kind, text, tool, input, output, target, subject, body }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "thought": self = .thought(try c.decodeIfPresent(String.self, forKey: .text) ?? "")
        case "tool":
            self = .tool(
                name: try c.decodeIfPresent(String.self, forKey: .tool) ?? "",
                input: try c.decodeIfPresent(String.self, forKey: .input) ?? "",
                output: try c.decodeIfPresent(String.self, forKey: .output) ?? ""
            )
        case "reply": self = .reply(try c.decodeIfPresent(String.self, forKey: .text) ?? "")
        case "draft":
            self = .draft(
                target: try c.decode(DraftTarget.self, forKey: .target),
                subject: try c.decodeIfPresent(String.self, forKey: .subject) ?? "",
                body: try c.decodeIfPresent(String.self, forKey: .body) ?? ""
            )
        case "error": self = .error(try c.decodeIfPresent(String.self, forKey: .text) ?? "")
        default: self = .done
        }
    }
}

/// Server-side change broadcasts (`/api/events-stream`).
public enum ServerEvent: Hashable, Sendable {
    case sync(accountId: String, spaceId: String, error: String?)
    case notification(spaceId: String?, title: String)
    case data(entity: String, spaceId: String?)

    /// Entities a view depends on; `sync` invalidates everything.
    public func touches(_ entities: Set<String>) -> Bool {
        switch self {
        case .sync: return true
        case .notification: return entities.contains("notifications")
        case let .data(entity, _): return entities.contains(entity)
        }
    }
}

extension ServerEvent: Decodable {
    private enum Keys: String, CodingKey { case type, accountId, spaceId, error, title, entity }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .type) {
        case "sync":
            self = .sync(
                accountId: try c.decodeIfPresent(String.self, forKey: .accountId) ?? "",
                spaceId: try c.decodeIfPresent(String.self, forKey: .spaceId) ?? "",
                error: try c.decodeIfPresent(String.self, forKey: .error)
            )
        case "notification":
            self = .notification(spaceId: try c.decodeIfPresent(String.self, forKey: .spaceId), title: try c.decodeIfPresent(String.self, forKey: .title) ?? "")
        default:
            self = .data(entity: try c.decodeIfPresent(String.self, forKey: .entity) ?? "", spaceId: try c.decodeIfPresent(String.self, forKey: .spaceId))
        }
    }
}

// MARK: - Address helpers (mirror shared/types.ts)

public enum Address {
    public static func name(_ from: String?) -> String {
        guard let from, !from.isEmpty else { return "" }
        if let lt = from.firstIndex(of: "<") {
            let raw = from[from.startIndex..<lt]
            return raw.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
        }
        return from.trimmingCharacters(in: .whitespaces)
    }

    public static func email(_ from: String?) -> String {
        guard let from, !from.isEmpty else { return "" }
        if let lt = from.firstIndex(of: "<"), let gt = from.firstIndex(of: ">"), lt < gt {
            return String(from[from.index(after: lt)..<gt]).trimmingCharacters(in: .whitespaces).lowercased()
        }
        return from.trimmingCharacters(in: .whitespaces).lowercased()
    }

    public static func initials(_ name: String) -> String {
        let parts = name.split(whereSeparator: { $0.isWhitespace }).filter { !$0.isEmpty }
        let first = parts.first?.first.map(String.init) ?? "?"
        let second = parts.dropFirst().first?.first.map(String.init) ?? ""
        return (first + second).uppercased()
    }
}
