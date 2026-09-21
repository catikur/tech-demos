import ButlerCore
import SwiftUI
import UIKit

/// Mail / Teams / calendar bodies: sanitized HTML → attributed text, styled for the dark cockpit.
/// Plain-text rows from older syncs go through `HTMLText.textToHtml`, same as the web.
struct RichBodyView: View {
    var text: String
    var html: String?
    var font: UIFont = .preferredFont(forTextStyle: .body)

    @State private var attributed: AttributedString?

    var body: some View {
        Group {
            if let attributed {
                Text(attributed).textSelection(.enabled)
            } else {
                Text(text).font(.body).foregroundStyle(Theme.dim)
            }
        }
        .tint(Theme.accent)
        .task(id: html ?? text) { attributed = await Self.render(HTMLText.display(html: html, text: text), font: font) }
    }

    @MainActor
    private static func render(_ html: String, font: UIFont) async -> AttributedString? {
        let css = """
        <style>
        body { font-family: -apple-system; font-size: \(font.pointSize)px; color: #C4B8AA; line-height: 1.5; }
        b, strong { color: #F6F1EA; }
        a { color: #F6821F; }
        blockquote { color: #8A8076; border-left: 2px solid #3a3530; margin: 0.5em 0 0; padding-left: 10px; }
        li { margin: 0.15em 0; }
        td, th { border: 1px solid #2a2622; padding: 4px 8px; }
        </style>
        """
        guard let data = (css + html).data(using: .utf8) else { return nil }
        let options: [NSAttributedString.DocumentReadingOptionKey: Any] = [
            .documentType: NSAttributedString.DocumentType.html,
            .characterEncoding: String.Encoding.utf8.rawValue,
        ]
        guard let ns = try? NSMutableAttributedString(data: data, options: options, documentAttributes: nil) else { return nil }
        // Trim the trailing newline WebKit likes to append.
        while ns.string.hasSuffix("\n") { ns.deleteCharacters(in: NSRange(location: ns.length - 1, length: 1)) }
        return try? AttributedString(ns, including: \.uiKit)
    }
}
