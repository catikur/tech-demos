import ButlerCore
import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        Loading(load: { try await app.api!.home(space: app.spaceId) }, refreshOn: ["drafts", "commitments", "threads", "events"]) { data, reload in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Durum").font(Theme.display(28))
                    Text("İlk bakışta senden beklenenler.").font(.footnote).foregroundStyle(Theme.faint)
                    if let next = data.nextMeeting {
                        Button { app.open(SourceRef(kind: .event, id: next.id, label: next.title)) } label: {
                            Card {
                                Text("Sıradaki toplantı").font(.caption).foregroundStyle(Theme.faint)
                                Text(next.title).font(.headline)
                                Text("\(Fmt.dateTime(next.start)) · Hazırlamak için aç").font(.footnote).foregroundStyle(Theme.dim)
                            }
                        }.buttonStyle(.plain)
                    }
                    kpiGrid(data)
                }
                .padding(16)
                .padding(.bottom, 80)
            }
            .refreshable { reload() }
        }
        .screenBackground()
        .navigationTitle("Durum")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { CockpitToolbar() }
    }

    @ViewBuilder
    private func kpiGrid(_ data: HomeDashboard) -> some View {
        let columns = gridColumns
        LazyVGrid(columns: columns, alignment: .leading, spacing: 12) {
            ForEach(data.cards) { card in
                Card {
                    HStack {
                        Text(title(card.id)).font(.subheadline.weight(.semibold))
                        Spacer()
                        Text("\(card.count)").font(.title3.weight(.bold)).foregroundStyle(Theme.accent)
                    }
                    if card.lines.isEmpty {
                        Text("Bu kümede bir şey yok.").font(.footnote).foregroundStyle(Theme.faint)
                    }
                    ForEach(Array(card.lines.enumerated()), id: \.offset) { _, line in
                        Button { app.open(line.source) } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(line.title).font(.footnote.weight(.semibold)).lineLimit(1)
                                Text(line.detail).font(.caption).foregroundStyle(Theme.dim).lineLimit(1)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var gridColumns: [GridItem] {
        if sizeClass == .regular {
            return [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
        }
        return [GridItem(.flexible())]
    }

    private func title(_ id: String) -> String {
        switch id {
        case "waiting": return "Senden beklenen"
        case "reply": return "Cevap bekleyen"
        case "meetings": return "Bugün"
        case "due": return "48 saatte vadesi gelen"
        case "drafts": return "Onay bekleyen taslak"
        default: return id
        }
    }
}
