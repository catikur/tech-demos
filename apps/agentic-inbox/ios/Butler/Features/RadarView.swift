import ButlerCore
import SwiftUI

/// Response-debt radar: unanswered asks in both directions, bars fill over 72h, VIPs float up.
struct RadarView: View {
    @Environment(AppModel.self) private var app
    @State private var side = 0

    var body: some View {
        Loading(load: { try await app.api!.radar(space: app.spaceId) }, refreshOn: ["threads", "chats", "people"]) { items, reload in
            let mine = items.filter(\.waitingOnMe)
            let theirs = items.filter { !$0.waitingOnMe }
            VStack(spacing: 0) {
                Picker("", selection: $side) {
                    Text("Sende bekleyen (\(mine.count))").tag(0)
                    Text("Onlarda bekleyen (\(theirs.count))").tag(1)
                }.pickerStyle(.segmented).padding(16)
                Text("Her iki yönde yanıtlanmamış istekler. Çubuklar 72 saatte dolar; VIP’ler üste çıkar.")
                    .font(.caption).foregroundStyle(Theme.faint).padding(.horizontal, 16)
                ScrollView {
                    LazyVStack(spacing: 10) {
                        let rows = side == 0 ? mine : theirs
                        if rows.isEmpty {
                            EmptyState(icon: "scope", title: side == 0 ? "Sende bekleyen yok." : "Kimseden bir şey beklemiyorsun.").frame(height: 260)
                        }
                        ForEach(rows) { item in RadarCard(item: item, action: side == 0 ? "Yanıt öner" : "Hatırlat") }
                    }.padding(16).padding(.bottom, 80)
                }
                .refreshable { reload() }
            }
        }
        .screenBackground()
        .navigationTitle("Radar")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct RadarCard: View {
    var item: RadarItem
    var action: String
    @Environment(AppModel.self) private var app

    var body: some View {
        let hours = item.ageMs / 3_600_000
        let tone: Color = hours > 48 ? Theme.danger : hours > 12 ? Theme.warn : Theme.ok
        Card {
            HStack(spacing: 8) {
                Avatar(name: Address.name(item.counterpart), color: tone, size: 28)
                Text(Address.name(item.counterpart)).font(.subheadline.weight(.bold))
                if item.vip { Pill(text: "★ VIP", color: Theme.warn) }
                Pill(text: age(item.ageMs))
                Pill(text: item.source.kind.rawValue, color: Theme.agent)
                if app.spaceId == nil { SpaceBadge(spaceId: item.spaceId) }
            }
            Text(item.source.label).font(.footnote.weight(.semibold)).foregroundStyle(Theme.dim)
            Text(item.excerpt).font(.subheadline).foregroundStyle(Theme.dim).lineLimit(4)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.hover)
                    Capsule().fill(LinearGradient(colors: [Theme.ok, Theme.warn, Theme.danger], startPoint: .leading, endPoint: .trailing))
                        .frame(width: geo.size.width * min(1, item.ageMs / (72 * 3_600_000)))
                }
            }.frame(height: 4)
            HStack {
                Button(action) { app.open(item.source, prefill: item.source.kind == .thread ? item.suggestedReply : nil) }.buttonStyle(PrimaryButtonStyle())
                Button("Aç") { app.open(item.source) }.buttonStyle(PrimaryButtonStyle(prominent: false))
            }
        }
        .overlay(alignment: .leading) { RoundedRectangle(cornerRadius: 2).fill(tone).frame(width: 3).padding(.vertical, 12) }
    }

    private func age(_ ms: Double) -> String {
        let h = ms / 3_600_000
        if h < 1 { return "\(Int(ms / 60_000)) dk" }
        if h < 48 { return "\(Int(h)) sa" }
        return "\(Int(h / 24)) g"
    }
}
