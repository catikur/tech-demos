import ButlerCore
import SwiftUI
import UniformTypeIdentifiers

extension BoardLane {
    var title: String {
        switch self {
        case .todo: return "Yapılacak"
        case .doing: return "Yapılıyor"
        case .waiting: return "Beklemede"
        case .done: return "Bitti"
        }
    }

    var emptyHint: String {
        switch self {
        case .todo: return "Sende açık kart yok — buraya taşı veya ekle."
        case .doing: return "Şu an ilerleyen iş yok."
        case .waiting: return "Başkasından beklenen iş yok."
        case .done: return "Bu turda biten yok."
        }
    }
}

/// Kanban over the commitment ledger. Columns page horizontally; cards move via the Taşı menu,
/// context menu, or drag & drop between columns.
struct BoardView: View {
    @Environment(AppModel.self) private var app
    @State private var showDropped = false
    @State private var adding = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Loading(load: { try await app.api!.commitments(space: app.spaceId) }, refreshOn: ["commitments"]) { cards, reload in
            let live = cards.filter { $0.status != .dropped }
            let dropped = cards.filter { $0.status == .dropped }
            VStack(alignment: .leading, spacing: 0) {
                header(dropped: dropped.count, reload: reload)
                if let error { ErrorBanner(message: error).padding(.bottom, 8) }
                if showDropped {
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            if dropped.isEmpty { Text("Bırakılan kart yok.").font(.footnote).foregroundStyle(Theme.faint).padding() }
                            ForEach(dropped) { c in CommitmentCard(card: c, onMove: { move(c, to: $0, reload: reload) }, onStatus: { setStatus(c, $0, reload: reload) }) }
                        }.padding(12)
                    }
                } else {
                    ScrollView(.horizontal) {
                        LazyHStack(alignment: .top, spacing: 12) {
                            ForEach(BoardLane.allCases, id: \.self) { lane in
                                LaneColumn(lane: lane, cards: live.filter { $0.lane == lane }, all: live,
                                           onMove: { c, target in move(c, to: target, reload: reload) },
                                           onStatus: { c, s in setStatus(c, s, reload: reload) })
                                    .containerRelativeFrame(.horizontal) { length, _ in min(length * 0.84, 360) }
                            }
                        }
                        .scrollTargetLayout()
                        .padding(.horizontal, 16)
                        .padding(.bottom, 90)
                    }
                    .scrollTargetBehavior(.viewAligned)
                    .scrollIndicators(.hidden)
                }
            }
            .sheet(isPresented: $adding) { AddCardSheet { reload() } }
        }
        .screenBackground()
        .navigationTitle("Pano")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { CockpitToolbar() }
    }

    private func header(dropped: Int, reload: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("İş panosu").font(Theme.display(24))
            Text("Kartları sürükle veya şerit seç. Butler’ın çıkardığı açık işler.").font(.footnote).foregroundStyle(Theme.faint)
            HStack(spacing: 8) {
                Button(busy ? "Taranıyor…" : "Yeniden tara") {
                    busy = true
                    Task { defer { busy = false }; _ = try? await app.api?.extractCommitments(space: app.spaceId); reload() }
                }.buttonStyle(PrimaryButtonStyle(prominent: false)).disabled(busy)
                Button(showDropped ? "Panoya dön" : "bırakıldı (\(dropped))") { showDropped.toggle() }
                    .buttonStyle(PrimaryButtonStyle(prominent: showDropped))
                Spacer()
                Button { adding = true } label: { Label("Kart ekle", systemImage: "plus") }
                    .buttonStyle(PrimaryButtonStyle()).disabled(app.spaceId == nil)
            }
            if app.spaceId == nil { Text("Kart eklemek için üstten bir alan seç (İş / Kişisel).").font(.caption).foregroundStyle(Theme.faint) }
        }
        .padding(16)
    }

    private func move(_ card: Commitment, to lane: BoardLane, reload: @escaping () -> Void) {
        guard card.lane != lane else { return }
        Task {
            do { _ = try await app.api!.setLane(card.id, lane: lane); error = nil; reload() } catch { self.error = error.localizedDescription }
        }
    }

    private func setStatus(_ card: Commitment, _ status: CommitmentStatus, reload: @escaping () -> Void) {
        Task {
            do { _ = try await app.api!.setStatus(card.id, status: status); error = nil; reload() } catch { self.error = error.localizedDescription }
        }
    }
}

private struct LaneColumn: View {
    var lane: BoardLane
    var cards: [Commitment]
    var all: [Commitment]
    var onMove: (Commitment, BoardLane) -> Void
    var onStatus: (Commitment, CommitmentStatus) -> Void
    @State private var targeted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(lane.title.uppercased()).font(.caption.weight(.bold)).kerning(0.6).foregroundStyle(Theme.dim)
                Spacer()
                Text("\(cards.count)").font(.caption2.weight(.bold)).padding(.horizontal, 7).padding(.vertical, 2)
                    .background(Theme.hover, in: Capsule()).foregroundStyle(Theme.dim)
            }
            .padding(14)
            Divider().overlay(Theme.border)
            ScrollView {
                LazyVStack(spacing: 8) {
                    if cards.isEmpty { Text(lane.emptyHint).font(.footnote).foregroundStyle(Theme.faint).multilineTextAlignment(.center).padding(24) }
                    ForEach(cards) { c in
                        CommitmentCard(card: c, onMove: { onMove(c, $0) }, onStatus: { onStatus(c, $0) })
                            .draggable(c.id)
                    }
                }
                .padding(8)
            }
        }
        .frame(minHeight: 320)
        .background(Theme.sunken, in: RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).stroke(targeted ? Theme.accent : Theme.border, lineWidth: targeted ? 2 : 1))
        .dropDestination(for: String.self) { ids, _ in
            // Drag payload is the card id; resolve it against the whole board, not just this lane.
            guard let id = ids.first, let card = all.first(where: { $0.id == id }) else { return false }
            onMove(card, lane)
            return true
        } isTargeted: { targeted = $0 }
    }
}

struct CommitmentCard: View {
    var card: Commitment
    var onMove: (BoardLane) -> Void
    var onStatus: (CommitmentStatus) -> Void
    @Environment(AppModel.self) private var app
    @State private var pushing = false
    @State private var note: String?

    var body: some View {
        let due = Fmt.dueLabel(card.dueAt)
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(card.displayName).font(.subheadline.weight(.bold)).lineLimit(1)
                Pill(text: due.text, color: due.color)
                if card.msTaskId != nil { Pill(text: "To Do", color: Theme.ok) }
                if app.spaceId == nil { SpaceBadge(spaceId: card.spaceId) }
            }
            Text(card.text).font(.subheadline).foregroundStyle(Theme.dim)
            if card.source.kind != .manual {
                Button { app.open(card.source) } label: {
                    Text("\(card.source.kind.rawValue) kaynağı: \(card.source.label)").font(.caption).foregroundStyle(Theme.accent).lineLimit(1)
                }.buttonStyle(.plain)
            }
            if let dueAt = card.dueAt { Text(Fmt.dateTime(dueAt)).font(.caption).foregroundStyle(Theme.faint) }
            HStack(spacing: 6) {
                Menu {
                    Picker("Taşı", selection: Binding(get: { card.lane }, set: { onMove($0) })) {
                        ForEach(BoardLane.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                } label: {
                    HStack(spacing: 4) { Text("Taşı: \(card.lane.title)"); Image(systemName: "chevron.up.chevron.down").font(.caption2) }
                        .font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Theme.hover, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                Spacer()
                if card.status == .open {
                    Button("Tamam") { onStatus(.done) }.buttonStyle(PrimaryButtonStyle(prominent: false))
                    if card.direction == .owedByMe && card.msTaskId == nil {
                        Button(pushing ? "…" : "To Do") {
                            pushing = true
                            Task { defer { pushing = false }; do { _ = try await app.api!.pushToTodo(card.id) } catch { note = error.localizedDescription } }
                        }.buttonStyle(PrimaryButtonStyle(prominent: false))
                    }
                } else {
                    Button("Yeniden aç") { onStatus(.open) }.buttonStyle(PrimaryButtonStyle(prominent: false))
                }
            }
            if let note { Text(note).font(.caption).foregroundStyle(Theme.danger) }
        }
        .padding(12)
        .background(Theme.raised, in: RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).stroke(Theme.border))
        .contextMenu {
            ForEach(BoardLane.allCases, id: \.self) { lane in
                Button(lane.title) { onMove(lane) }.disabled(lane == card.lane)
            }
            Divider()
            if card.status == .open { Button("Bırak", role: .destructive) { onStatus(.dropped) } }
            if card.direction == .owedToMe && card.source.kind == .thread {
                Button("Hatırlat") {
                    app.open(card.source, prefill: "Merhaba \(card.displayName.split(separator: " ").first.map(String.init) ?? ""),\n\nBu konuda kısa bir hatırlatma: \"\(card.text)\" — bir güncelleme var mı? Bir şey tıkandıysa yardımcı olurum.\n\nTeşekkürler!")
                }
            }
        }
    }
}

private struct AddCardSheet: View {
    var onAdded: () -> Void
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var who = ""
    @State private var due = ""
    @State private var direction: CommitmentDirection = .owedByMe
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Kart") {
                    TextField("Ne yapılacak?", text: $text, axis: .vertical).lineLimit(2...5)
                    TextField("Kim (ad veya e-posta)", text: $who).textInputAutocapitalization(.never)
                    TextField("Son tarih (örn. cuma, 25 Eylül)", text: $due)
                    Picker("Yön", selection: $direction) {
                        Text("Ben borçluyum").tag(CommitmentDirection.owedByMe)
                        Text("Bana borçlu").tag(CommitmentDirection.owedToMe)
                    }
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .scrollContentBackground(.hidden)
            .screenBackground()
            .navigationTitle("Kart ekle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Vazgeç") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "…" : "Ekle") {
                        guard let space = app.spaceId else { return }
                        busy = true
                        Task {
                            defer { busy = false }
                            do {
                                try await app.api!.createCommitment(space: space, text: text, counterpart: who, direction: direction, due: due.isEmpty ? nil : due)
                                onAdded(); dismiss()
                            } catch { self.error = error.localizedDescription }
                        }
                    }.disabled(busy || text.trimmingCharacters(in: .whitespaces).isEmpty || who.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
