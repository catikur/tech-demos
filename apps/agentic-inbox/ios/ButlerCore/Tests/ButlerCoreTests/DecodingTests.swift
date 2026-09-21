import XCTest
@testable import ButlerCore

/// Fixtures are real responses captured from the Bun server in `SEED_DEMO=1` mode.
/// If the server contract drifts, these fail before the iOS app does.
final class DecodingTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        guard let url = Bundle.module.url(forResource: name, withExtension: nil, subdirectory: "Fixtures") else {
            throw XCTSkip("Fixture \(name) missing")
        }
        return try Data(contentsOf: url)
    }

    private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try ButlerAPI.decoder.decode(T.self, from: try fixture(name))
    }

    func testSessionAndStatus() throws {
        let session = try decode(SessionView.self, "session.json")
        XCTAssertEqual(session.allowedDomain, "conforcus.com")
        XCTAssertFalse(session.loginRequired)

        let status = try decode(AppStatus.self, "status.json")
        XCTAssertEqual(status.spaces.map(\.kind), [.work, .personal])
        XCTAssertEqual(status.accounts.count, 2)
        XCTAssertTrue(status.demoMode)
    }

    func testThreadsKeepHtmlBodies() throws {
        let list = try decode([ThreadSummary].self, "threads.json")
        XCTAssertGreaterThanOrEqual(list.count, 5)
        XCTAssertTrue(list.contains { $0.category == .project })

        let thread = try decode(MailThread.self, "thread.json")
        XCTAssertEqual(thread.id, "t-postmortem")
        let first = try XCTUnwrap(thread.messages.first)
        XCTAssertTrue(first.bodyHtml?.contains("<ul>") == true)
        XCTAssertEqual(Address.name(first.from), "Marcus Chen")
        XCTAssertEqual(Address.email(first.from), "marcus@lumenlabs.io")
    }

    func testCalendarChatsMeetings() throws {
        let events = try decode([CalendarEvent].self, "events.json")
        let roadmap = try XCTUnwrap(events.first { $0.id == "ev-roadmap" })
        XCTAssertTrue(roadmap.descriptionHtml?.contains("<b>Agenda</b>") == true)
        XCTAssertEqual(roadmap.responseStatus, .none)

        let chats = try decode([Chat].self, "chats.json")
        XCTAssertFalse(chats.isEmpty)
        let chat = try decode(ChatDetail.self, "chat.json")
        XCTAssertFalse(chat.messages.isEmpty)

        let meetings = try decode([Meeting].self, "meetings.json")
        XCTAssertTrue(meetings.contains { $0.recordingLocked })
        let meeting = try decode(MeetingDetail.self, "meeting.json")
        XCTAssertEqual(meeting.meeting.id, meeting.id)
    }

    func testCommitmentsAndLanes() throws {
        let list = try decode([Commitment].self, "commitments.json")
        XCTAssertFalse(list.isEmpty)
        XCTAssertTrue(list.contains { $0.lane == .waiting && $0.direction == .owedToMe })
        XCTAssertTrue(list.contains { $0.lane == .todo && $0.direction == .owedByMe })
        for c in list where c.status == .done { XCTAssertEqual(c.lane, .done) }
    }

    func testFeatureDTOs() throws {
        let briefing = try decode(MorningBriefing.self, "briefing.json")
        XCTAssertFalse(briefing.waitingOnMe.isEmpty)

        let radar = try decode([RadarItem].self, "radar.json")
        XCTAssertTrue(radar.contains(where: \.waitingOnMe))

        let catchUp = try decode(CatchUp.self, "catchup.json")
        XCTAssertFalse(catchUp.summaryMarkdown.isEmpty)

        let topics = try decode([Topic].self, "topics.json")
        XCTAssertTrue(topics.contains { !$0.links.isEmpty })

        let people = try decode([Person].self, "people.json")
        XCTAssertFalse(people.isEmpty)
        let profile = try decode(PersonProfile.self, "person.json")
        XCTAssertEqual(profile.email, profile.email.lowercased())

        _ = try decode([AppNotification].self, "notifications.json")
        _ = try decode([Digest].self, "digests.json")

        let brief = try decode(MeetingBrief.self, "brief.json")
        XCTAssertEqual(brief.eventId, "ev-roadmap")
        XCTAssertFalse(brief.attendees.isEmpty)

        let followUp = try decode(FollowUp.self, "followup.json")
        XCTAssertNotNil(followUp.recipients)
    }

    func testSettingsViews() throws {
        let llm = try decode(LlmConfigView.self, "llm.json")
        XCTAssertFalse(llm.model.isEmpty)
        let org = try decode(OrgSettingsView.self, "org.json")
        XCTAssertFalse(org.briefChannelTitle.isEmpty)
    }

    func testLenientEnumsSurviveUnknownValues() throws {
        let json = #"{"kind":"holo","id":"x","label":"?"}"#.data(using: .utf8)!
        let ref = try ButlerAPI.decoder.decode(SourceRef.self, from: json)
        XCTAssertEqual(ref.kind, .manual)
    }

    func testAgentStreamFixtureDecodes() throws {
        var parser = SSEParser()
        let payloads = parser.feed(try fixture("agent-stream.txt"))
        let events = try payloads.map { try ButlerAPI.decoder.decode(AgentEvent.self, from: $0.data(using: .utf8)!) }
        XCTAssertEqual(events.last, .done)
        XCTAssertTrue(events.contains { if case .tool(let name, _, _) = $0 { return name == "catch_up" } else { return false } })
        XCTAssertTrue(events.contains { if case .reply = $0 { return true } else { return false } })
    }
}
