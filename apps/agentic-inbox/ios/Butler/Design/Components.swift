import ButlerCore
import SwiftUI

struct Pill: View {
    var text: String
    var color: Color = Theme.dim
    var filled = false

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(filled ? color : color.opacity(0.12), in: Capsule())
            .foregroundStyle(filled ? Theme.onAccent : color)
            .overlay(Capsule().stroke(color.opacity(filled ? 0 : 0.35), lineWidth: 1))
    }
}

struct SpaceBadge: View {
    var spaceId: String
    @Environment(AppModel.self) private var app

    var body: some View {
        if let space = app.spaces.first(where: { $0.id == spaceId }) {
            Pill(text: space.kind == .work ? "İş" : "Kişisel", color: Color(css: space.color))
        }
    }
}

struct Avatar: View {
    var name: String
    var color: Color = Theme.agent
    var size: CGFloat = 42

    var body: some View {
        Text(Address.initials(name))
            .font(.system(size: size * 0.32, weight: .bold))
            .frame(width: size, height: size)
            .background(color.opacity(0.16), in: RoundedRectangle(cornerRadius: size * 0.33, style: .continuous))
            .foregroundStyle(color)
    }
}

struct Card<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.raised, in: RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).stroke(Theme.border, lineWidth: 1))
    }
}

struct SectionTitle: View {
    var text: String
    var count: Int?

    var body: some View {
        HStack(spacing: 8) {
            Text(text.uppercased())
                .font(.caption.weight(.bold))
                .kerning(0.6)
                .foregroundStyle(Theme.dim)
            if let count {
                Text("\(count)")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(Theme.hover, in: Capsule())
                    .foregroundStyle(Theme.dim)
            }
            Spacer()
        }
    }
}

struct EmptyState: View {
    var icon: String
    var title: String
    var hint: String? = nil

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(Theme.faint)
            Text(title).font(.body.weight(.semibold)).foregroundStyle(Theme.dim)
            if let hint { Text(hint).font(.footnote).foregroundStyle(Theme.faint).multilineTextAlignment(.center) }
        }
        .frame(maxWidth: 280)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }
}

struct ErrorBanner: View {
    var message: String
    var retry: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.danger)
            Text(message).font(.footnote).foregroundStyle(Theme.dim).lineLimit(3)
            Spacer()
            if let retry {
                Button("Yenile", action: retry).font(.footnote.weight(.semibold))
            }
        }
        .padding(12)
        .background(Theme.danger.opacity(0.12), in: RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous))
        .padding(.horizontal, 16)
    }
}

/// Async loader with the same refresh semantics as the web `useData` hook.
struct Loading<T, Content: View>: View {
    var load: () async throws -> T
    /// Entities whose `data` broadcasts should trigger a reload.
    var refreshOn: Set<String> = []
    @ViewBuilder var content: (T, _ reload: @escaping () -> Void) -> Content

    @Environment(AppModel.self) private var app
    @State private var value: T?
    @State private var error: String?
    @State private var tick = 0

    var body: some View {
        Group {
            if let value {
                content(value) { tick += 1 }
            } else if let error {
                VStack { ErrorBanner(message: error) { tick += 1 }; Spacer() }.padding(.top, 12)
            } else {
                ProgressView().tint(Theme.accent).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task(id: TaskKey(tick: tick, space: app.spaceId)) {
            do {
                value = try await load()
                error = nil
            } catch is CancellationError {
            } catch let apiError as APIError where apiError == .unauthorized {
                // Token expired or revoked: drop back to the login screen.
                await app.refreshStatus()
            } catch {
                self.error = error.localizedDescription
            }
        }
        .onChange(of: app.lastEvent?.1) { _, _ in
            guard let ev = app.lastEvent?.0, ev.touches(refreshOn) else { return }
            tick += 1
        }
    }

    private struct TaskKey: Equatable { var tick: Int; var space: String? }
}

struct PrimaryButtonStyle: ButtonStyle {
    var prominent = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .frame(minHeight: 40)
            .background(prominent ? Theme.accent : Theme.hover, in: RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous))
            .foregroundStyle(prominent ? Theme.onAccent : Theme.text)
            .opacity(configuration.isPressed ? 0.75 : 1)
    }
}

extension View {
    func cardRow() -> some View {
        padding(.horizontal, 16).padding(.vertical, 6)
    }

    func screenBackground() -> some View {
        background(Theme.bg.ignoresSafeArea())
    }
}

struct MarkdownText: View {
    var text: String
    var body: some View {
        Text((try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(text))
            .font(.subheadline)
            .foregroundStyle(Theme.dim)
            .textSelection(.enabled)
    }
}

struct LabeledField: View {
    var label: String
    @Binding var text: String
    var placeholder = ""
    var secure = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption).foregroundStyle(Theme.dim)
            Group {
                if secure { SecureField(placeholder, text: $text) } else { TextField(placeholder, text: $text) }
            }
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .padding(10)
            .background(Theme.sunken, in: RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous).stroke(Theme.border))
        }
    }
}
