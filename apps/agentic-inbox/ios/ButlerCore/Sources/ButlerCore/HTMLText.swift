import Foundation

/// Display-side HTML hygiene, mirroring `shared/html.ts` in the web cockpit.
/// The server stores raw Graph/Gmail HTML; the client decides what is safe to show.
public enum HTMLText {
    /// Tags whose whole subtree must go (scripts, styles, remote images, frames).
    private static let dropSubtree = ["script", "style", "iframe", "object", "embed", "svg", "head", "title"]
    /// Tags that are removed but whose text content stays.
    private static let stripTag = ["img", "video", "audio", "source", "form", "input", "button", "meta", "link", "base"]

    public static func looksLikeHtml(_ text: String) -> Bool {
        text.range(of: #"<\/?[a-zA-Z][^>]*>"#, options: .regularExpression) != nil
    }

    /// Remove dangerous markup, keep structure (p, ul/li, b, a, blockquote, table).
    public static func sanitize(_ html: String) -> String {
        var out = html
        for tag in dropSubtree {
            out = out.replacingOccurrences(
                of: "(?is)<\(tag)\\b[^>]*>.*?</\(tag)\\s*>", with: "", options: .regularExpression)
            out = out.replacingOccurrences(of: "(?is)<\(tag)\\b[^>]*/?>", with: "", options: .regularExpression)
        }
        for tag in stripTag {
            out = out.replacingOccurrences(of: "(?is)</?\(tag)\\b[^>]*>", with: "", options: .regularExpression)
        }
        // Teams mentions: <at id="0">Name</at> → bold.
        out = out.replacingOccurrences(of: "(?is)<at\\b[^>]*>", with: "<strong>", options: .regularExpression)
        out = out.replacingOccurrences(of: "(?is)</at\\s*>", with: "</strong>", options: .regularExpression)
        // Inline handlers and javascript: URLs.
        out = out.replacingOccurrences(of: "(?is)\\son[a-z]+\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+)", with: "", options: .regularExpression)
        out = out.replacingOccurrences(of: "(?is)href\\s*=\\s*([\"'])\\s*javascript:[^\"']*\\1", with: "href=\"#\"", options: .regularExpression)
        out = out.replacingOccurrences(of: "(?is)\\sstyle\\s*=\\s*(\"[^\"]*\"|'[^']*')", with: "", options: .regularExpression)
        return out
    }

    /// Plain text → paragraphs, simple lists and Outlook-style quoted replies.
    public static func textToHtml(_ text: String) -> String {
        let escaped = escape(text)
        let normalized = escaped.replacingOccurrences(of: "\r\n", with: "\n")
        var blocks: [String] = []
        var quoting = false
        for rawBlock in normalized.components(separatedBy: "\n\n") {
            let block = rawBlock.trimmingCharacters(in: .whitespacesAndNewlines)
            if block.isEmpty { continue }
            if block.hasPrefix("-----Original Message-----") || block.hasPrefix("From: ") || block.hasPrefix("Kimden: ") {
                quoting = true
            }
            let lines = block.components(separatedBy: "\n")
            let html: String
            if lines.allSatisfy({ $0.range(of: #"^\s*([-•*]|\d+[.)])\s+"#, options: .regularExpression) != nil }) {
                let items = lines.map { line -> String in
                    let stripped = line.replacingOccurrences(of: #"^\s*([-•*]|\d+[.)])\s+"#, with: "", options: .regularExpression)
                    return "<li>\(stripped)</li>"
                }
                let ordered = lines.first?.range(of: #"^\s*\d+"#, options: .regularExpression) != nil
                html = ordered ? "<ol>\(items.joined())</ol>" : "<ul>\(items.joined())</ul>"
            } else {
                html = "<p>\(lines.joined(separator: "<br>"))</p>"
            }
            blocks.append(quoting ? "<blockquote>\(html)</blockquote>" : html)
        }
        return blocks.joined()
    }

    /// What the cockpit should render for a body: stored HTML if any, else the flattened text.
    public static func display(html: String?, text: String) -> String {
        let source = (html?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 } ?? text
        return looksLikeHtml(source) ? sanitize(source) : textToHtml(source)
    }

    /// Strip all tags; good enough for previews and accessibility labels.
    public static func plain(_ html: String) -> String {
        var s = sanitize(html)
        s = s.replacingOccurrences(of: "(?is)<br\\s*/?>|</p>|</li>|</div>|</tr>", with: "\n", options: .regularExpression)
        s = s.replacingOccurrences(of: "(?is)<[^>]+>", with: "", options: .regularExpression)
        return unescape(s).replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public static func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }

    public static func unescape(_ text: String) -> String {
        text.replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&amp;", with: "&")
    }
}
