import ButlerCore
import SwiftUI

struct MeetingsView: View {
    @Environment(AppModel.self) private var app
    @State private var selected: String?

    var body: some View {
        Loading(load: { try await app.api!.meetings(space: app.spaceId) }, refreshOn: ["meetings"]) { meetings, reload in
            List(meetings) { m in
                Button { selected = m.id } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Avatar(name: "◉", color: Theme.agent)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(m.title).font(.subheadline.weight(.semibold))
                            Text("\(Fmt.dateTime(m.start)) · \(m.attendees.count) katılımcı").font(.footnote).foregroundStyle(Theme.faint)
                            HStack(spacing: 6) {
                                if m.hasTranscript { Pill(text: "transkript", color: Theme.agent) }
                                if m.recordingLocked { Pill(text: "kayıt kilitli", color: Theme.warn) }
                                if m.hasRecording && !m.recordingLocked { Pill(text: "kayıt") }
                                if !m.hasTranscript { Pill(text: "yalnız takvim") }
                                if app.spaceId == nil { SpaceBadge(spaceId: m.spaceId) }
                            }
                        }
                    }.padding(.vertical, 4)
                }
                .listRowBackground(Theme.bg).listRowSeparatorTint(Theme.border)
            }
            .listStyle(.plain)
            .overlay { if meetings.isEmpty { EmptyState(icon: "video", title: "Toplantı yok") } }
            .refreshable { reload() }
            .navigationDestination(isPresented: Binding(get: { selected != nil }, set: { if !$0 { selected = nil } })) {
                if let selected { MeetingDetailView(meetingId: selected) }
            }
        }
        .screenBackground()
        .navigationTitle("Toplantılar")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { consumeJump() }
        .onChange(of: app.jump) { _, _ in consumeJump() }
    }

    private func consumeJump() {
        if let jump = app.consumeJump(for: .meeting) { selected = jump.ref.id }
    }
}

struct MeetingDetailView: View {
    var meetingId: String
    @Environment(AppModel.self) private var app

    var body: some View {
        Loading(load: { try await app.api!.meeting(meetingId) }, refreshOn: ["meetings"]) { m, reload in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(m.title).font(Theme.display(24))
                    VStack(alignment: .leading, spacing: 4) {
                        Text(Fmt.dateTime(m.start))
                        Text(m.attendees.map { Address.name($0) }.joined(separator: ", "))
                        if let join = m.joinUrl, let url = URL(string: join) { Link("Katılım bağlantısı", destination: url) }
                        if let rec = m.recordingUrl, let url = URL(string: rec) {
                            Link(m.recordingLocked ? "Teams’te aç" : "Kayıt", destination: url)
                            if m.recordingLocked { Text("Graph kaydı kilitli (423); dosya yalnızca Teams’ten izlenir.").font(.caption).foregroundStyle(Theme.faint) }
                        }
                    }.font(.subheadline).foregroundStyle(Theme.dim)
                    MinutesPanel(meeting: m.meeting, reload: reload)
                    FollowUpPanel(meeting: m.meeting)
                    SectionTitle(text: "Transkript", count: m.transcript?.count)
                    if let lines = m.transcript, !lines.isEmpty {
                        ForEach(Array(lines.enumerated()), id: \.offset) { _, l in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(offset(l.at)).font(.caption).monospacedDigit().foregroundStyle(Theme.faint)
                                Text(Address.name(l.speaker)).font(.footnote.weight(.semibold))
                                Text(l.text).font(.footnote).foregroundStyle(Theme.dim)
                            }
                        }
                    } else {
                        Text("Transkript yok. Graph izin verirse senkronda gelir; yerel mp4 varsa Plaud ile çözümlenebilir.").font(.footnote).foregroundStyle(Theme.faint)
                    }
                }
                .padding(16)
            }
        }
        .screenBackground()
        .navigationBarTitleDisplayMode(.inline)
    }

    private func offset(_ ms: Double) -> String {
        let s = Int(ms / 1000)
        return String(format: "%02d:%02d", s / 60, s % 60)
    }
}

/// Meeting minutes from the vault template (+ Plaud transcription for local recordings).
struct MinutesPanel: View {
    var meeting: Meeting
    var reload: () -> Void
    @Environment(AppModel.self) private var app
    @State private var note: Note?
    @State private var busy: String?
    @State private var message: String?

    var body: some View {
        Card {
            HStack {
                Text("Toplantı notu").font(.subheadline.weight(.bold))
                Spacer()
                Button(busy == "min" ? "…" : (note == nil ? "Şablondan doldur" : "Yeniden üret")) {
                    run("min") { note = try await app.api!.buildMinutes(meeting: meeting.id) }
                }.buttonStyle(PrimaryButtonStyle()).disabled(busy != nil)
            }
            if meeting.hasRecording && !meeting.recordingLocked && !meeting.hasTranscript {
                Button(busy == "plaud" ? "Plaud çözümlüyor…" : "Plaud ile çözümle") {
                    run("plaud") {
                        let r = try await app.api!.transcribeWithPlaud(meeting: meeting.id)
                        message = r.message ?? "Transkript hazır."
                        reload()
                    }
                }.buttonStyle(PrimaryButtonStyle(prominent: false)).disabled(busy != nil)
            }
            if let message { Text(message).font(.footnote).foregroundStyle(Theme.dim) }
            if let note { MarkdownText(text: note.bodyMarkdown) }
            else { Text("Conforcus Vault şablonu transkriptten doldurulur.").font(.footnote).foregroundStyle(Theme.faint) }
        }
        .task(id: meeting.id) { note = try? await app.api?.minutes(meeting: meeting.id) }
    }

    private func run(_ key: String, _ work: @escaping () async throws -> Void) {
        busy = key
        Task { defer { busy = nil }; do { try await work() } catch { message = error.localizedDescription } }
    }
}

/// Decisions + action items → follow-up mail to attendees, sent only after confirmation.
struct FollowUpPanel: View {
    var meeting: Meeting
    @Environment(AppModel.self) private var app
    @State private var followUp: FollowUp?
    @State private var body_ = ""
    @State private var busy = false
    @State private var sentThread: String?
    @State private var error: String?

    var body: some View {
        Card {
            HStack {
                Text("Takip").font(.subheadline.weight(.bold))
                Spacer()
                Button(busy ? "…" : (followUp == nil ? "Taslak çıkar" : "Yenile")) { load(refresh: followUp != nil) }
                    .buttonStyle(PrimaryButtonStyle()).disabled(busy || !meeting.hasTranscript)
            }
            if !meeting.hasTranscript { Text("Transkript olmadan takip çıkarılamaz.").font(.footnote).foregroundStyle(Theme.faint) }
            if let f = followUp {
                if !f.decisions.isEmpty {
                    SectionTitle(text: "Kararlar")
                    ForEach(f.decisions, id: \.self) { Text("• \($0)").font(.footnote).foregroundStyle(Theme.dim) }
                }
                if !f.actions.isEmpty {
                    SectionTitle(text: "Aksiyonlar")
                    ForEach(Array(f.actions.enumerated()), id: \.offset) { _, a in
                        Text("• \(Address.name(a.owner)): \(a.text)").font(.footnote).foregroundStyle(Theme.dim)
                    }
                }
                Text("Takip postası → \((f.recipients ?? []).map { Address.name($0) }.joined(separator: ", "))").font(.caption).foregroundStyle(Theme.faint)
                TextEditor(text: $body_).frame(minHeight: 140).scrollContentBackground(.hidden)
                    .padding(8).background(Theme.sunken, in: RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous))
                if let sentThread {
                    Button("Gönderildi — konuyu aç") { app.open(SourceRef(kind: .thread, id: sentThread, label: f.draftSubject)) }.font(.footnote)
                } else {
                    Button("Onayla ve takip gönder") {
                        busy = true
                        Task {
                            defer { busy = false }
                            do { sentThread = try await app.api!.sendFollowUp(meeting: meeting.id, body: body_, subject: f.draftSubject).id } catch { self.error = error.localizedDescription }
                        }
                    }.buttonStyle(PrimaryButtonStyle()).disabled(busy || body_.isEmpty)
                }
            }
            if let error { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
        }
    }

    private func load(refresh: Bool) {
        busy = true
        Task {
            defer { busy = false }
            do {
                let f = try await app.api!.followUp(meeting: meeting.id, refresh: refresh)
                followUp = f; body_ = f.draftBody; error = nil
            } catch { self.error = error.localizedDescription }
        }
    }
}
