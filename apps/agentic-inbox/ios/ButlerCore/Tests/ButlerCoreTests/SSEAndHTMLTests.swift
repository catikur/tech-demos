import XCTest
@testable import ButlerCore

final class SSEParserTests: XCTestCase {
    func testSplitsFramesAcrossChunks() {
        var parser = SSEParser()
        XCTAssertEqual(parser.feed(": connected\n\ndata: {\"a\":1}\n\ndata: {\"b\""), ["{\"a\":1}"])
        XCTAssertEqual(parser.feed(":2}\n\n: ping\n\n"), ["{\"b\":2}"])
        XCTAssertEqual(parser.feed(""), [])
    }

    func testMultiLineDataJoins() {
        var parser = SSEParser()
        XCTAssertEqual(parser.feed("data: one\ndata: two\n\n"), ["one\ntwo"])
    }
}

final class HTMLTextTests: XCTestCase {
    func testSanitizeDropsDangerousMarkupKeepsStructure() {
        let html = "<p>Hi <b>there</b></p><script>alert(1)</script><img src=\"http://x/y.png\"><a href=\"javascript:evil()\" onclick=\"x()\">link</a><ul><li>one</li></ul>"
        let out = HTMLText.sanitize(html)
        XCTAssertFalse(out.contains("<script"))
        XCTAssertFalse(out.contains("<img"))
        XCTAssertFalse(out.contains("onclick"))
        XCTAssertFalse(out.contains("javascript:"))
        XCTAssertTrue(out.contains("<b>there</b>"))
        XCTAssertTrue(out.contains("<li>one</li>"))
    }

    func testTeamsMentionsBecomeStrong() {
        XCTAssertEqual(HTMLText.sanitize("<at id=\"0\">Atilla</at> ping"), "<strong>Atilla</strong> ping")
    }

    func testPlainTextBecomesParagraphsListsAndQuotes() {
        let text = "Hello,\n\n- first\n- second\n\n-----Original Message-----\nFrom: Bob\nold stuff"
        let out = HTMLText.textToHtml(text)
        XCTAssertTrue(out.hasPrefix("<p>Hello,</p>"))
        XCTAssertTrue(out.contains("<ul><li>first</li><li>second</li></ul>"))
        XCTAssertTrue(out.contains("<blockquote>"))
    }

    func testDisplayPrefersHtmlAndEscapesText() {
        XCTAssertEqual(HTMLText.display(html: "<p>x</p>", text: "ignored"), "<p>x</p>")
        XCTAssertEqual(HTMLText.display(html: "  ", text: "a < b"), "<p>a &lt; b</p>")
    }

    func testPlainStripsTags() {
        XCTAssertEqual(HTMLText.plain("<p>One</p><ul><li>two</li></ul>"), "One\ntwo")
    }

    func testAddressHelpers() {
        XCTAssertEqual(Address.name("\"Dana K\" <dana@x.io>"), "Dana K")
        XCTAssertEqual(Address.email("Dana <Dana@X.io>"), "dana@x.io")
        XCTAssertEqual(Address.initials("Marcus Chen"), "MC")
        XCTAssertEqual(Address.initials(""), "?")
    }
}
