import XCTest
@testable import ButlerCore

/// Round-trips against a running Butler server. Skipped unless `BUTLER_TEST_BASE_URL` is set,
/// e.g. `BUTLER_TEST_BASE_URL=http://127.0.0.1:3011 swift test` with `SEED_DEMO=1 LOGIN_REQUIRED=0`.
final class LiveServerTests: XCTestCase {
    private func api() throws -> ButlerAPI {
        guard let raw = ProcessInfo.processInfo.environment["BUTLER_TEST_BASE_URL"], let url = URL(string: raw) else {
            throw XCTSkip("BUTLER_TEST_BASE_URL not set")
        }
        return ButlerAPI(baseURL: url, token: ProcessInfo.processInfo.environment["BUTLER_TEST_TOKEN"])
    }

    func testStatusThreadsAndBoardRoundTrip() async throws {
        let api = try api()
        let healthy = try await api.health()
        XCTAssertTrue(healthy)
        let status = try await api.status()
        XCTAssertFalse(status.spaces.isEmpty)

        let threads = try await api.threads(space: nil)
        let first = try XCTUnwrap(threads.first)
        let thread = try await api.thread(first.id)
        XCTAssertEqual(thread.id, first.id)

        let board = try await api.commitments(space: nil)
        if let card = board.first(where: { $0.status == .open }) {
            let moved = try await api.setLane(card.id, lane: .doing)
            XCTAssertEqual(moved.lane, .doing)
            let back = try await api.setLane(card.id, lane: card.lane)
            XCTAssertEqual(back.lane, card.lane)
        }
    }

    func testAgentStreamsToDone() async throws {
        let api = try api()
        let spaceId = try await api.status().spaces.first?.id
        var kinds: [String] = []
        for try await ev in api.askAgent("Neyi bekliyorum?", context: AgentContext(spaceId: spaceId)) {
            switch ev {
            case .thought: kinds.append("thought")
            case .tool: kinds.append("tool")
            case .reply: kinds.append("reply")
            case .draft: kinds.append("draft")
            case .error: kinds.append("error")
            case .done: kinds.append("done")
            }
        }
        XCTAssertEqual(kinds.last, "done")
        XCTAssertTrue(kinds.contains("reply"))
    }

    func testUnauthorizedIsTyped() async throws {
        let api = try api()
        let session = try await api.session()
        guard session.loginRequired else { throw XCTSkip("Server runs without login gate") }
        let bad = ButlerAPI(baseURL: api.baseURL, token: "nope")
        do {
            _ = try await bad.status()
            XCTFail("expected 401")
        } catch let error as APIError {
            XCTAssertEqual(error, .unauthorized)
        }
    }
}
