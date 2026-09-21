import ButlerCore
import SwiftUI

struct BriefingView: View {
    @Environment(AppModel.self) private var app
    @State private var busy: String?
    @State private var note: String?

    var body: some View {
        Loading(load: { try await app.api!.briefing(space: app.spaceId) }, refreshOn: ["drafts", "commitments", "threads", "events"]) { data, reload in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    header(data, reload: reload)
                    doNow(data)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 12)], alignment: .leading, spacing: 12) {
                        events(data)
                        unread(data)
                        due(data)
                        drafts(data, reload: reload)
                    }
                    meetings(data)
                }
                .padding(16)
                .padding(.bottom, 80)
            }
            .refreshable { reload() }
        }
        .screenBackground()
        .navigationTitle("Sabah brifingi")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { CockpitToolbar() }
    }

    private func header(_ data: MorningBriefing, reload: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Sabah brifingi").font(Theme.display(28))
            Text("Önce senden beklenenler, sonra bugünün takvimi. Aynı özet Teams kanalına da yazılır.")
                .font(.footnote).foregroundStyle(Theme.faint)
            HStack(spacing: 8) {
                Button(busy == "gen" ? "Taslaklar…" : "Gece yanıtlarını tasarla") {
                    run("gen") { _ = try await app.api!.generateDrafts(space: app.spaceId); reload() }
                }
                .buttonStyle(PrimaryButtonStyle(prominent: false))
                Button(busy == "teams" ? "Yazılıyor…" : "Brifingi Teams’e yaz") {
                    run("teams") {
                        let r = try await app.api!.postBriefingToTeams(space: app.spaceId)
                        note = r.posted ? "Teams kanalına yazıldı." : (r.skipped ?? "Atlandı.")
                    }
                }
                .buttonStyle(PrimaryButtonStyle(prominent: false))
            }
            .disabled(busy != nil)
            if let note { Text(note).font(.footnote).foregroundStyle(Theme.ok) }
        }
    }

    private func doNow(_ data: MorningBriefing) -> some View {
        Card {
            Text("Şimdi yap").font(.subheadline.weight(.bold))
            Text("\(data.waitingOnMe.count + data.dueCommitments.count) aksiyon sende · \(data.events.count) toplantı · \(data.unread.count) okunmamış · \(data.drafts.count) taslak")
                .font(.body).foregroundStyle(Theme.text)
            ForEach(data.dueCommitments.prefix(4)) { c in
                row(title: c.text, sub: c.displayName)
            }
            ForEach(data.waitingOnMe.prefix(6)) { r in
                Button { app.open(r.source) } label: {
                    row(title: "Yanıtla: \(r.source.label)", sub: Address.name(r.counterpart))
                }.buttonStyle(.plain)
            }
            if data.waitingOnMe.isEmpty && data.dueCommitments.isEmpty {
                Text("Sende bekleyen aksiyon yok.").font(.footnote).foregroundStyle(Theme.faint)
            }
        }
    }

    private func events(_ data: MorningBriefing) -> some View {
        Card {
            SectionTitle(text: "Bugün", count: data.events.count)
            if data.events.isEmpty { Text("Toplantı yok.").font(.footnote).foregroundStyle(Theme.faint) }
            ForEach(data.events) { e in
                Button { app.open(SourceRef(kind: .event, id: e.id, label: e.title)) } label: {
                    row(title: e.title, sub: Fmt.dateTime(e.start))
                }.buttonStyle(.plain)
            }
        }
    }

    private func unread(_ data: MorningBriefing) -> some View {
        Card {
            SectionTitle(text: "Gece gelenler", count: data.unread.count)
            if data.unread.isEmpty { Text("Okunmamış posta yok.").font(.footnote).foregroundStyle(Theme.faint) }
            ForEach(data.unread.prefix(8)) { t in
                Button { app.open(SourceRef(kind: .thread, id: t.id, label: t.subject)) } label: {
                    row(title: t.subject, sub: Address.name(t.lastFrom))
                }.buttonStyle(.plain)
            }
        }
    }

    private func due(_ data: MorningBriefing) -> some View {
        Card {
            SectionTitle(text: "Bugün biten sözler", count: data.dueCommitments.count)
            Text("İş taahhütleri @conforcus.com içinde paylaşılır.").font(.caption).foregroundStyle(Theme.faint)
            if data.dueCommitments.isEmpty { Text("Bugün biten söz yok.").font(.footnote).foregroundStyle(Theme.faint) }
            ForEach(data.dueCommitments) { c in row(title: c.text, sub: c.displayName) }
        }
    }

    private func drafts(_ data: MorningBriefing, reload: @escaping () -> Void) -> some View {
        Card {
            SectionTitle(text: "Butler taslakları", count: data.drafts.count)
            if data.drafts.isEmpty { Text("Onay bekleyen taslak yok.").font(.footnote).foregroundStyle(Theme.faint) }
            ForEach(data.drafts) { d in
                VStack(alignment: .leading, spacing: 6) {
                    Text(d.subject).font(.subheadline.weight(.semibold))
                    Text(d.body).font(.footnote).foregroundStyle(Theme.faint).lineLimit(3)
                    HStack {
                        Button("Aç ve düzenle") {
                            run(d.id) {
                                _ = try await app.api!.setDraft(d.id, status: "accepted")
                                app.open(SourceRef(kind: .thread, id: d.threadId, label: d.subject), prefill: d.body)
                            }
                        }.buttonStyle(PrimaryButtonStyle())
                        Button("Vazgeç") { run(d.id) { _ = try await app.api!.setDraft(d.id, status: "dismissed"); reload() } }
                            .buttonStyle(PrimaryButtonStyle(prominent: false))
                    }.disabled(busy != nil)
                }
                .padding(.vertical, 4)
            }
        }
    }

    private func meetings(_ data: MorningBriefing) -> some View {
        Card {
            SectionTitle(text: "Son toplantılar", count: data.recentMeetings.count)
            Text("Transkript varsa takip taslağı bir dokunuş uzakta.").font(.caption).foregroundStyle(Theme.faint)
            if data.recentMeetings.isEmpty { Text("Yeni toplantı yok.").font(.footnote).foregroundStyle(Theme.faint) }
            ForEach(data.recentMeetings) { m in
                Button { app.open(SourceRef(kind: .meeting, id: m.id, label: m.title)) } label: {
                    row(title: m.title, sub: "\(Fmt.dateTime(m.start)) · \(m.hasTranscript ? "transkript" : "yalnız takvim")")
                }.buttonStyle(.plain)
            }
        }
    }

    private func row(title: String, sub: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.subheadline).foregroundStyle(Theme.text).multilineTextAlignment(.leading)
            Text(sub).font(.caption).foregroundStyle(Theme.faint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }

    private func run(_ key: String, _ work: @escaping () async throws -> Void) {
        busy = key
        Task {
            defer { busy = nil }
            do { try await work() } catch { note = error.localizedDescription }
        }
    }
}
