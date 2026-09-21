import SwiftUI

/// Same palette as `src/styles.css`: warm obsidian + Conforcus orange, serif wordmark.
enum Theme {
    static let bg = Color(hex: 0x0C0B0A)
    static let raised = Color(hex: 0x161412)
    static let hover = Color(hex: 0x1E1B18)
    static let sunken = Color(hex: 0x080706)
    static let border = Color.white.opacity(0.08)
    static let borderStrong = Color.white.opacity(0.14)
    static let text = Color(hex: 0xF6F1EA)
    static let dim = Color(hex: 0xC4B8AA)
    static let faint = Color(hex: 0x8A8076)
    static let accent = Color(hex: 0xF6821F)
    static let accentSoft = accent.opacity(0.16)
    static let agent = Color(hex: 0xC4B5FD)
    static let agentSoft = agent.opacity(0.16)
    static let ok = Color(hex: 0x4ADE80)
    static let warn = Color(hex: 0xFBBF24)
    static let danger = Color(hex: 0xFB7185)
    static let onAccent = Color(hex: 0x1A1206)

    static let radius: CGFloat = 18
    static let radiusSmall: CGFloat = 12

    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .semibold, design: .serif).italic()
    }

    static let category: [String: Color] = [
        "newsletter": Color(hex: 0x8B7CF6),
        "support": Color(hex: 0xF97316),
        "invite": Color(hex: 0x22C55E),
        "billing": Color(hex: 0xEAB308),
        "recruiting": Color(hex: 0x38BDF8),
        "personal": Color(hex: 0xF472B6),
        "security": Color(hex: 0xEF4444),
        "project": Color(hex: 0x2DD4BF),
        "other": Color(hex: 0x94A3B8),
    ]
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }

    /// `#f6821f` strings from the server (space colours).
    init(css: String) {
        var s = css.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        self.init(hex: UInt32(s, radix: 16) ?? 0x94A3B8)
    }
}

/// Turkish-first formatting; the web cockpit defaults to `tr-TR` too.
enum Fmt {
    static let locale = Locale(identifier: "tr_TR")

    static func time(_ ms: Double) -> String {
        ms.date.formatted(.dateTime.hour().minute().locale(locale))
    }

    static func dateTime(_ ms: Double) -> String {
        ms.date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).hour().minute().locale(locale))
    }

    static func day(_ ms: Double) -> String {
        ms.date.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(locale))
    }

    static func ago(_ ms: Double) -> String {
        let mins = max(1, Int((Date().timeIntervalSince1970 * 1000 - ms) / 60_000))
        if mins < 60 { return "\(mins) dk" }
        let hours = mins / 60
        if hours < 48 { return "\(hours) sa" }
        return "\(hours / 24) g"
    }

    static func until(_ ms: Double) -> String {
        let diff = ms - Date().timeIntervalSince1970 * 1000
        if diff < 0 { return "geçti" }
        let mins = Int(diff / 60_000)
        if mins < 60 { return "\(mins) dk içinde" }
        let hours = mins / 60
        if hours < 36 { return "\(hours) sa içinde" }
        return "\(hours / 24) g içinde"
    }

    static func dueLabel(_ dueAt: Double?) -> (text: String, color: Color) {
        guard let dueAt else { return ("son tarih yok", Theme.faint) }
        let diff = dueAt - Date().timeIntervalSince1970 * 1000
        let days = Int((diff / 86_400_000).rounded())
        if diff < 0 { return ("\(max(1, abs(days))) g gecikti", Theme.danger) }
        if days <= 1 { return ("bugün/yarın", Theme.warn) }
        return ("\(days) g içinde", Theme.ok)
    }
}
