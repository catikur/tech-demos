import ButlerCore
import SwiftUI

struct InboxView: View {
    @Environment(AppModel.self) private var app
    @State private var query = ""
    @State private var selected: String?
    @State private var prefill: String?

    var body: some View {
        Loading(load: { try await app.api!.threads(space: app.spaceId, query: query) }, refreshOn: ["threads"]) { threads, reload in
            List(threads) { t in
                Button { open(t) } label: { ThreadRow(thread: t) }
                    .listRowBackground(Theme.bg)
                    .listRowSeparatorTint(Theme.border)
            }
            .listStyle(.plain)
            .overlay { if threads.isEmpty { EmptyState(icon: "tray", title: query.isEmpty ? "Gelen kutusu boş" : "Eşleşen posta yok") } }
            .refreshable { reload() }
            .searchable(text: $query, prompt: "Posta ara…")
            .navigationDestination(isPresented: Binding(get: { selected != nil }, set: { if !$0 { selected = nil; prefill = nil } })) {
                if let selected { ThreadView(threadId: selected, prefill: prefill) }
            }
        }
        .screenBackground()
        .navigationTitle("Gelen kutusu")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { CockpitToolbar() }
        .onAppear { consumeJump() }
        .onChange(of: app.jump) { _, _ in consumeJump() }
    }

    private func consumeJump() {
        guard let jump = app.consumeJump(for: .thread) else { return }
        prefill = jump.prefill
        selected = jump.ref.id
    }

    private func open(_ t: ThreadSummary) {
        selected = t.id
        if t.unread { Task { try? await app.api?.markThreadRead(t.id) } }
    }
}

struct ThreadRow: View {
    var thread: ThreadSummary
    @Environment(AppModel.self) private var app

    var body: some View {
        let name = Address.name(thread.lastFrom).isEmpty ? "Bilinmeyen" : Address.name(thread.lastFrom)
        let color = Theme.category[thread.category.rawValue] ?? Theme.category["other"]!
        HStack(alignment: .top, spacing: 12) {
            Avatar(name: name, color: color)
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(name).font(.subheadline.weight(.semibold)).lineLimit(1)
                    Spacer()
                    Text(Fmt.ago(thread.lastAt)).font(.caption).foregroundStyle(Theme.faint)
                }
                Text(thread.subject.isEmpty ? "(konu yok)" : thread.subject)
                    .font(.subheadline.weight(thread.unread ? .bold : .regular))
                    .foregroundStyle(thread.unread ? Theme.text : Theme.dim).lineLimit(1)
                Text(thread.snippet).font(.footnote).foregroundStyle(Theme.faint).lineLimit(2)
                HStack(spacing: 6) {
                    Pill(text: thread.category.rawValue, color: color)
                    if thread.messageCount > 1 { Pill(text: "\(thread.messageCount) ileti", color: Theme.faint) }
                    if app.spaceId == nil { SpaceBadge(spaceId: thread.spaceId) }
                }
            }
            if thread.unread { Circle().fill(Theme.accent).frame(width: 9, height: 9).padding(.top, 6) }
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }
}

struct ThreadView: View {
    var threadId: String
    var prefill: String?
    @Environment(AppModel.self) private var app
    @State private var draft = ""
    @State private var state: SendState = .idle
    @FocusState private var composing: Bool

    enum SendState: Equatable { case idle, sending, sent, failed(String) }

    var body: some View {
        Loading(load: { try await app.api!.thread(threadId) }, refreshOn: ["threads"]) { thread, reload in
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 14) {
                            if let counterpart = thread.messages.last(where: { !$0.isMine }) ?? thread.messages.first {
                                PersonChip(email: Address.email(counterpart.from), spaceId: thread.spaceId)
                            }
                            ForEach(thread.messages) { m in MessageCard(message: m).id(m.id) }
                        }
                        .padding(16)
                    }
                    .onAppear { if let last = thread.messages.last { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
                composer(thread, reload: reload)
            }
            .navigationTitle(thread.subject.isEmpty ? "(konu yok)" : thread.subject)
        }
        .screenBackground()
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { if let prefill { draft = prefill; composing = true } }
    }

    private func composer(_ thread: MailThread, reload: @escaping () -> Void) -> some View {
        let to = thread.messages.last(where: { !$0.isMine }).map { Address.name($0.from) } ?? "alıcı"
        return VStack(alignment: .leading, spacing: 8) {
            TextField("\(to) kişisine yanıtla…", text: $draft, axis: .vertical)
                .lineLimit(3...8)
                .focused($composing)
                .padding(10)
                .background(Theme.sunken, in: RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous).stroke(Theme.border))
            HStack {
                switch state {
                case .sent: Label("Gönderildi", systemImage: "checkmark").font(.footnote).foregroundStyle(Theme.ok)
                case .failed(let msg): Text(msg).font(.footnote).foregroundStyle(Theme.danger).lineLimit(2)
                default: EmptyView()
                }
                Spacer()
                Button(state == .sending ? "Gönderiliyor…" : "Yanıtı gönder") {
                    let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !body.isEmpty else { return }
                    state = .sending
                    Task {
                        do {
                            _ = try await app.api!.reply(thread: thread.id, body: body)
                            draft = ""
                            state = .sent
                            reload()
                        } catch { state = .failed(error.localizedDescription) }
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty || state == .sending)
            }
        }
        .padding(12)
        .background(Theme.raised)
        .overlay(alignment: .top) { Divider().overlay(Theme.border) }
    }
}

struct MessageCard: View {
    var message: EmailMessage

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(message.isMine ? "Siz" : Address.name(message.from)).font(.subheadline.weight(.bold))
                Text(Address.email(message.from)).font(.caption).foregroundStyle(Theme.faint).lineLimit(1)
                Spacer()
                Text(Fmt.dateTime(message.at)).font(.caption).foregroundStyle(Theme.faint)
            }
            RichBodyView(text: message.body, html: message.bodyHtml)
        }
        .padding(14)
        .background(message.isMine ? Theme.accentSoft : Theme.raised, in: RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).stroke(message.isMine ? Theme.accent.opacity(0.25) : Theme.border))
    }
}

/// Relationship strip above a thread: last contact, open commitments both ways, next meeting.
struct PersonChip: View {
    var email: String
    var spaceId: String
    @Environment(AppModel.self) private var app
    @State private var profile: PersonProfile?

    var body: some View {
        Group {
            if let p = profile {
                HStack(spacing: 10) {
                    Avatar(name: p.name, size: 32)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.name).font(.footnote.weight(.semibold))
                        HStack(spacing: 6) {
                            if let last = p.lastContactAt { Text("son iletişim \(Fmt.ago(last))").font(.caption2).foregroundStyle(Theme.faint) }
                            let mine = p.openCommitments.filter { $0.direction == .owedByMe }.count
                            let theirs = p.openCommitments.count - mine
                            if mine > 0 { Pill(text: "siz borçlusunuz: \(mine)", color: Theme.warn) }
                            if theirs > 0 { Pill(text: "size borçlu: \(theirs)", color: Theme.ok) }
                            if let next = p.upcomingMeetings.first { Pill(text: "sonraki: \(next.title)", color: Theme.agent) }
                        }
                    }
                    Spacer()
                }
                .padding(10)
                .background(Theme.agentSoft, in: RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous))
            }
        }
        .task(id: email) { profile = try? await app.api?.person(byEmail: email, space: spaceId) }
    }
}
