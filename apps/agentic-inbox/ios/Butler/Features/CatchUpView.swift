import ButlerCore
import SwiftUI

struct CatchUpView: View {
    @Environment(AppModel.self) private var app
    @State private var preset = "24"

    private let presets: [(id: String, label: String, hours: Double?)] = [
        ("seen", "Son bakışımdan beri", nil),
        ("8", "Son 8 saat", 8),
        ("24", "Dün", 24),
        ("168", "Geçen hafta", 168),
        ("digests", "Özetler", nil),
    ]

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(presets, id: \.id) { p in
                        Button(p.label) { preset = p.id }
                            .font(.footnote.weight(.semibold))
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(preset == p.id ? Theme.accentSoft : Theme.hover, in: Capsule())
                            .foregroundStyle(preset == p.id ? Theme.text : Theme.dim)
                    }
                }.padding(.horizontal, 16).padding(.vertical, 10)
            }
            if preset == "digests" {
                DigestsPanel()
            } else {
                Loading(load: {
                    let p = presets.first { $0.id == preset }!
                    return try await app.api!.catchUp(space: app.spaceId, from: p.hours.map { Date().addingTimeInterval(-$0 * 3600) }, sinceSeen: p.id == "seen")
                }) { data, reload in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("\(Fmt.dateTime(data.fromAt)) → \(Fmt.dateTime(data.toAt))").font(.caption).foregroundStyle(Theme.faint)
                            Card {
                                SectionTitle(text: "Özet")
                                MarkdownText(text: data.summaryMarkdown)
                                if data.sections.isEmpty { Text("Sessiz bir dönem.").font(.footnote).foregroundStyle(Theme.faint) }
                            }
                            ForEach(data.sections, id: \.title) { section in
                                SectionTitle(text: section.title, count: section.items.count)
                                ForEach(Array(section.items.enumerated()), id: \.offset) { _, item in
                                    Button { app.open(item.source) } label: {
                                        Card {
                                            HStack { Text(item.title).font(.subheadline.weight(.semibold)).lineLimit(1); Spacer(); Text(Fmt.ago(item.at)).font(.caption).foregroundStyle(Theme.faint) }
                                            Text(item.excerpt).font(.footnote).foregroundStyle(Theme.dim).lineLimit(3)
                                            HStack { Pill(text: item.reason, color: Theme.agent); Pill(text: item.source.kind.rawValue); if app.spaceId == nil { SpaceBadge(spaceId: item.spaceId) } }
                                        }
                                    }.buttonStyle(.plain)
                                }
                            }
                        }.padding(16).padding(.bottom, 80)
                    }
                    .refreshable { reload() }
                }
                .id(preset)
            }
        }
        .screenBackground()
        .navigationTitle("Neyi kaçırdım")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { Task { try? await app.api?.markCatchUpSeen(space: app.spaceId) } }
    }
}

struct DigestsPanel: View {
    @Environment(AppModel.self) private var app
    @State private var busy: String?

    var body: some View {
        Loading(load: { try await app.api!.digests(space: app.spaceId) }, refreshOn: ["digests"]) { digests, reload in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Button(busy == "daily" ? "…" : "Günlük özet üret") { run("daily", reload) }.buttonStyle(PrimaryButtonStyle(prominent: false))
                        Button(busy == "weekly" ? "…" : "Haftalık özet üret") { run("weekly", reload) }.buttonStyle(PrimaryButtonStyle(prominent: false))
                    }.disabled(busy != nil)
                    if digests.isEmpty { Text("Henüz özet yok. Zamanlayıcı günlük/haftalık üretir; elle de tetikleyebilirsin.").font(.footnote).foregroundStyle(Theme.faint) }
                    ForEach(digests) { d in
                        Card {
                            HStack { Pill(text: d.period, color: Theme.agent); Text("\(Fmt.dateTime(d.fromAt)) → \(Fmt.dateTime(d.toAt))").font(.caption).foregroundStyle(Theme.faint) }
                            MarkdownText(text: d.bodyMarkdown)
                        }
                    }
                }.padding(16).padding(.bottom, 80)
            }
            .refreshable { reload() }
        }
    }

    private func run(_ period: String, _ reload: @escaping () -> Void) {
        busy = period
        Task { defer { busy = nil }; _ = try? await app.api?.runDigest(space: app.spaceId, period: period); reload() }
    }
}
