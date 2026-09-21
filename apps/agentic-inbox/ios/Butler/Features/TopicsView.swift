import ButlerCore
import SwiftUI

struct TopicsView: View {
    @Environment(AppModel.self) private var app
    @State private var busy = false

    var body: some View {
        Loading(load: { try await app.api!.topics(space: app.spaceId) }, refreshOn: ["topics"]) { topics, reload in
            List {
                Section {
                    HStack {
                        Text("Posta, sohbet ve toplantıları ortak konular altında birleştirir.").font(.footnote).foregroundStyle(Theme.faint)
                        Spacer()
                        Button(busy ? "…" : "Yeniden kur") {
                            busy = true
                            Task { defer { busy = false }; _ = try? await app.api?.rebuildTopics(space: app.spaceId); reload() }
                        }.buttonStyle(PrimaryButtonStyle(prominent: false)).disabled(busy)
                    }.listRowBackground(Theme.bg)
                }
                ForEach(topics) { topic in
                    NavigationLink(value: topic) {
                        HStack(alignment: .top, spacing: 12) {
                            Avatar(name: "# ", color: Theme.agent)
                            VStack(alignment: .leading, spacing: 4) {
                                HStack { Text(topic.name).font(.subheadline.weight(.semibold)); Spacer(); Text(Fmt.ago(topic.lastAt)).font(.caption).foregroundStyle(Theme.faint) }
                                Text(topic.summary).font(.footnote).foregroundStyle(Theme.faint).lineLimit(2)
                                HStack(spacing: 6) {
                                    ForEach(topic.keywords.prefix(4), id: \.self) { Pill(text: $0, color: Theme.faint) }
                                    if app.spaceId == nil { SpaceBadge(spaceId: topic.spaceId) }
                                }
                            }
                        }.padding(.vertical, 4)
                    }
                    .listRowBackground(Theme.bg).listRowSeparatorTint(Theme.border)
                }
            }
            .listStyle(.plain)
            .overlay { if topics.isEmpty { EmptyState(icon: "number", title: "Konu yok", hint: "Senkron sonrası “Yeniden kur” ile oluştur.") } }
            .refreshable { reload() }
            .navigationDestination(for: Topic.self) { TopicDetailView(topic: $0) }
        }
        .screenBackground()
        .navigationTitle("Konular")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct TopicDetailView: View {
    var topic: Topic
    @Environment(AppModel.self) private var app

    private func icon(_ kind: SourceKind) -> String {
        switch kind {
        case .thread: return "envelope"
        case .chat: return "bubble.left"
        case .meeting: return "video"
        case .event: return "calendar"
        case .manual: return "pencil"
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(topic.name).font(Theme.display(24))
                Text(topic.summary).font(.subheadline).foregroundStyle(Theme.dim)
                Text("\(Fmt.dateTime(topic.firstAt)) → \(Fmt.dateTime(topic.lastAt))").font(.caption).foregroundStyle(Theme.faint)
                SectionTitle(text: "Anahtar kelimeler")
                FlowChips(items: topic.keywords)
                SectionTitle(text: "Zaman çizelgesi", count: topic.links.count)
                ForEach(Array(topic.links.enumerated()), id: \.offset) { _, link in
                    Button { app.open(link) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: icon(link.kind)).foregroundStyle(Theme.agent).frame(width: 24)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(link.label).font(.subheadline).foregroundStyle(Theme.text)
                                Text(link.kind.rawValue).font(.caption).foregroundStyle(Theme.faint)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.faint)
                        }
                        .padding(12)
                        .background(Theme.raised, in: RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous))
                    }.buttonStyle(.plain)
                }
            }.padding(16)
        }
        .screenBackground()
        .navigationBarTitleDisplayMode(.inline)
    }
}
