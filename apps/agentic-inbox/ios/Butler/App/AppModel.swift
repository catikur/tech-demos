import AuthenticationServices
import ButlerCore
import Observation
import SwiftUI

/// Where the user is in the cockpit; mirrors the web `ViewId`.
enum Tab: String, CaseIterable, Identifiable {
    case briefing, inbox, calendar, board, more
    var id: String { rawValue }
}

enum MoreDestination: String, CaseIterable, Identifiable {
    case chats, meetings, catchup, radar, topics, people, settings
    var id: String { rawValue }
}

/// Deep link produced by feature views (radar → thread, topic → meeting, …).
struct JumpRequest: Hashable {
    var ref: SourceRef
    var prefill: String?
}

/// Session, server address, active space and the live change feed. One instance for the app.
@MainActor
@Observable
final class AppModel {
    // MARK: persisted
    var serverURLString: String {
        didSet { UserDefaults.standard.set(serverURLString, forKey: "butler.server") }
    }
    private(set) var token: String? {
        didSet { Keychain.set(token, for: "butler.session") }
    }
    var spaceId: String? {
        didSet { UserDefaults.standard.set(spaceId ?? "all", forKey: "butler.space") }
    }

    // MARK: live state
    var api: ButlerAPI?
    var session: SessionView?
    var status: AppStatus?
    var bootError: String?
    var booting = true
    var tab: Tab = .briefing
    var agentOpen = false
    var notificationsOpen = false
    var jump: JumpRequest?
    var moreDestination: MoreDestination?
    /// Bumped whenever the server broadcasts a change; views compare against their entities.
    var lastEvent: (ServerEvent, Int)?
    private var eventLoop: Task<Void, Never>?
    private var authSession: ASWebAuthenticationSession?
    private var pendingSignIn: CheckedContinuation<URL, Error>?

    init() {
        serverURLString = UserDefaults.standard.string(forKey: "butler.server") ?? "https://butler.conforcus.com"
        let raw = UserDefaults.standard.string(forKey: "butler.space")
        spaceId = raw == nil || raw == "all" ? nil : raw
        token = Keychain.get("butler.session")
    }

    var spaces: [Space] { status?.spaces ?? [] }
    var activeSpace: Space? { spaces.first { $0.id == spaceId } }
    var signedIn: Bool { session.map { !$0.loginRequired || $0.authenticated } ?? false }
    var needsServer: Bool { URL(string: serverURLString)?.host == nil }

    // MARK: boot / session

    func boot() async {
        booting = true
        defer { booting = false }
        guard let url = URL(string: serverURLString), url.host != nil else {
            bootError = nil
            return
        }
        let client = ButlerAPI(baseURL: url, token: token)
        api = client
        do {
            session = try await client.session()
            bootError = nil
            if signedIn { await afterSignIn() }
        } catch {
            bootError = error.localizedDescription
        }
    }

    func setServer(_ raw: String) async {
        serverURLString = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        await boot()
    }

    private func afterSignIn() async {
        await refreshStatus()
        startEventLoop()
    }

    func refreshStatus() async {
        guard let api else { return }
        do {
            status = try await api.status()
            if let spaceId, !spaces.contains(where: { $0.id == spaceId }) { self.spaceId = nil }
        } catch let error as APIError where error == .unauthorized {
            token = nil
            api.token = nil
            session = try? await api.session()
        } catch {
            bootError = error.localizedDescription
        }
    }

    func signIn() async {
        guard let api else { return }
        do {
            let start = try api.nativeSignInURL()
            let callback = try await webAuth(start)
            handleSignInCallback(callback)
        } catch {
            if (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin {
                bootError = error.localizedDescription
            }
        }
    }

    /// `butler://signed-in?token=…` (or `?error=denied&email=…`).
    func handleSignInCallback(_ url: URL) {
        guard url.scheme == "butler", url.host == "signed-in" else { return }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let error = items.first(where: { $0.name == "error" })?.value {
            let email = items.first(where: { $0.name == "email" })?.value
            bootError = error == "denied"
                ? "Bu hesap izinli alanda değil (\(email ?? "?")). Şirket Microsoft 365 kutusuyla girin."
                : error
            return
        }
        guard let token = items.first(where: { $0.name == "token" })?.value else { return }
        self.token = token
        api?.token = token
        bootError = nil
        Task {
            session = try? await api?.session()
            await afterSignIn()
        }
    }

    private func webAuth(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { cont in
            let s = ASWebAuthenticationSession(url: url, callbackURLScheme: "butler") { url, error in
                if let url { cont.resume(returning: url) } else { cont.resume(throwing: error ?? APIError.transport("Sign-in cancelled")) }
            }
            s.prefersEphemeralWebBrowserSession = false
            s.presentationContextProvider = PresentationAnchor.shared
            authSession = s
            s.start()
        }
    }

    func signOut() async {
        try? await api?.signOut()
        token = nil
        api?.token = nil
        status = nil
        eventLoop?.cancel()
        session = try? await api?.session()
    }

    // MARK: live events

    private func startEventLoop() {
        eventLoop?.cancel()
        guard let api else { return }
        eventLoop = Task { [weak self] in
            var counter = 0
            while !Task.isCancelled {
                do {
                    for try await ev in api.serverEvents() {
                        counter += 1
                        self?.lastEvent = (ev, counter)
                        if case .data(let entity, _) = ev, entity == "accounts" || entity == "llm" { await self?.refreshStatus() }
                        if case .sync = ev { await self?.refreshStatus() }
                    }
                } catch {
                    // fall through to reconnect
                }
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }

    // MARK: navigation

    func open(_ ref: SourceRef, prefill: String? = nil) {
        agentOpen = false
        notificationsOpen = false
        switch ref.kind {
        case .thread: tab = .inbox
        case .event: tab = .calendar
        case .chat: tab = .more; moreDestination = .chats
        case .meeting: tab = .more; moreDestination = .meetings
        case .manual: tab = .board
        }
        jump = JumpRequest(ref: ref, prefill: prefill)
    }

    /// Notification links: `event:<id>`, `thread:<id>`, `meeting:<id>`, `digest:<id>`, `commitment`, `radar`.
    func openLink(_ link: String) {
        let parts = link.split(separator: ":", maxSplits: 1).map(String.init)
        let kind = parts.first ?? ""
        let id = parts.count > 1 ? parts[1] : ""
        switch kind {
        case "event" where !id.isEmpty: open(SourceRef(kind: .event, id: id, label: ""))
        case "thread" where !id.isEmpty: open(SourceRef(kind: .thread, id: id, label: ""))
        case "meeting" where !id.isEmpty: open(SourceRef(kind: .meeting, id: id, label: ""))
        case "digest": tab = .more; moreDestination = .catchup
        case "commitment": tab = .board
        case "radar": tab = .more; moreDestination = .radar
        default: break
        }
        notificationsOpen = false
    }

    func consumeJump(for kind: SourceKind) -> JumpRequest? {
        guard let jump, jump.ref.kind == kind else { return nil }
        self.jump = nil
        return jump
    }
}

/// ASWebAuthenticationSession needs a window; the key window is fine for a single-scene app.
final class PresentationAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = PresentationAnchor()
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
