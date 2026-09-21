import ButlerCore
import SwiftUI

struct PeopleView: View {
    @Environment(AppModel.self) private var app
    @State private var query = ""

    var body: some View {
        Loading(load: { try await app.api!.people(space: app.spaceId) }, refreshOn: ["people"]) { people, reload in
            let filtered = people.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) || $0.email.contains(query.lowercased()) }
            List(filtered) { p in
                NavigationLink(value: p.id) {
                    HStack(spacing: 12) {
                        Avatar(name: p.name)
                        VStack(alignment: .leading, spacing: 2) {
                            Text((p.vip ? "★ " : "") + p.name).font(.subheadline.weight(.semibold))
                            Text(p.email).font(.footnote).foregroundStyle(Theme.faint)
                            if app.spaceId == nil { SpaceBadge(spaceId: p.spaceId) }
                        }
                    }.padding(.vertical, 4)
                }
                .listRowBackground(Theme.bg).listRowSeparatorTint(Theme.border)
            }
            .listStyle(.plain)
            .searchable(text: $query, prompt: "Kişi ara…")
            .refreshable { reload() }
            .navigationDestination(for: String.self) { PersonDetailView(personId: $0) }
        }
        .screenBackground()
        .navigationTitle("Kişiler")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct PersonDetailView: View {
    var personId: String
    @Environment(AppModel.self) private var app
    @State private var notes = ""
    @State private var savingNotes = false

    var body: some View {
        Loading(load: { try await app.api!.person(personId) }, refreshOn: ["people", "commitments"]) { p, reload in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 14) {
                        Avatar(name: p.name, size: 56)
                        VStack(alignment: .leading) {
                            Text(p.name).font(Theme.display(24))
                            Text(p.email).font(.footnote).foregroundStyle(Theme.faint)
                        }
                        Spacer()
                        Button(p.vip ? "★ VIP" : "VIP yap") {
                            Task { _ = try? await app.api?.updatePerson(p.id, vip: !p.vip); reload() }
                        }.buttonStyle(PrimaryButtonStyle(prominent: p.vip))
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 8) {
                        stat("\(p.threadCount)", "konu")
                        stat("\(p.chatCount)", "sohbet")
                        stat("\(p.meetingCount)", "toplantı")
                        stat(p.lastContactAt.map { Fmt.ago($0) } ?? "hiç", "son")
                    }
                    if !p.summary.isEmpty {
                        Card { SectionTitle(text: "İlişki özeti"); Text(p.summary).font(.subheadline).foregroundStyle(Theme.dim) }
                    }
                    Card {
                        SectionTitle(text: "Notlarım")
                        TextEditor(text: $notes).frame(minHeight: 80).scrollContentBackground(.hidden)
                            .padding(6).background(Theme.sunken, in: RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous))
                        Button(savingNotes ? "…" : "Kaydet") {
                            savingNotes = true
                            Task { defer { savingNotes = false }; _ = try? await app.api?.updatePerson(p.id, notes: notes) }
                        }.buttonStyle(PrimaryButtonStyle(prominent: false)).disabled(savingNotes || notes == p.notes)
                    }
                    if !p.openCommitments.isEmpty {
                        SectionTitle(text: "Açık taahhütler", count: p.openCommitments.count)
                        ForEach(p.openCommitments) { c in
                            HStack { Pill(text: c.direction == .owedByMe ? "ben borçluyum" : "bana borçlu", color: c.direction == .owedByMe ? Theme.warn : Theme.ok); Text(c.text).font(.footnote).foregroundStyle(Theme.dim) }
                        }
                    }
                    if !p.recentThreads.isEmpty {
                        SectionTitle(text: "Son postalar", count: p.recentThreads.count)
                        ForEach(p.recentThreads) { t in
                            Button { app.open(SourceRef(kind: .thread, id: t.id, label: t.subject)) } label: {
                                HStack { Text(t.subject).font(.subheadline).foregroundStyle(Theme.text).lineLimit(1); Spacer(); Text(Fmt.ago(t.lastAt)).font(.caption).foregroundStyle(Theme.faint) }
                            }.buttonStyle(.plain)
                        }
                    }
                    if !p.upcomingMeetings.isEmpty {
                        SectionTitle(text: "Yaklaşan", count: p.upcomingMeetings.count)
                        ForEach(p.upcomingMeetings) { e in
                            Button { app.open(SourceRef(kind: .event, id: e.id, label: e.title)) } label: {
                                HStack { Text(e.title).font(.subheadline).foregroundStyle(Theme.text); Spacer(); Text(Fmt.dateTime(e.start)).font(.caption).foregroundStyle(Theme.faint) }
                            }.buttonStyle(.plain)
                        }
                    }
                    if !p.topics.isEmpty { SectionTitle(text: "Konular"); FlowChips(items: p.topics) }
                }
                .padding(16)
            }
            .onAppear { notes = p.notes }
        }
        .screenBackground()
        .navigationBarTitleDisplayMode(.inline)
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.system(.title3, design: .serif).weight(.bold))
            Text(label.uppercased()).font(.system(size: 10, weight: .semibold)).kerning(0.5).foregroundStyle(Theme.faint)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 10)
        .background(Theme.raised, in: RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous).stroke(Theme.border))
    }
}
