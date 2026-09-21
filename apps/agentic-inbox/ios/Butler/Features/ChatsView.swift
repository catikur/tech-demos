import ButlerCore
import SwiftUI

extension ChatKind {
    var label: String {
        switch self {
        case .oneOnOne: return "1:1"
        case .group: return "grup"
        case .channel: return "kanal"
        }
    }
}

struct ChatsView: View {
    @Environment(AppModel.self) private var app
    @State private var selected: String?

    var body: some View {
        Loading(load: { try await app.api!.chats(space: app.spaceId) }, refreshOn: ["chats"]) { chats, reload in
            List(chats) { c in
                Button { selected = c.id; if c.unreadCount > 0 { Task { try? await app.api?.markChatRead(c.id) } } } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Avatar(name: c.kind == .channel ? "# " : c.title)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack { Text(c.title).font(.subheadline.weight(.semibold)).lineLimit(1); Spacer(); Text(Fmt.ago(c.lastAt)).font(.caption).foregroundStyle(Theme.faint) }
                            Text("\(c.kind.label) · \(c.members.count) üye").font(.footnote).foregroundStyle(Theme.faint)
                            if app.spaceId == nil { SpaceBadge(spaceId: c.spaceId) }
                        }
                        if c.unreadCount > 0 {
                            Text("\(c.unreadCount)").font(.caption2.weight(.bold)).padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Theme.accent, in: Capsule()).foregroundStyle(Theme.onAccent)
                        }
                    }.padding(.vertical, 4)
                }
                .listRowBackground(Theme.bg).listRowSeparatorTint(Theme.border)
            }
            .listStyle(.plain)
            .overlay { if chats.isEmpty { EmptyState(icon: "bubble.left.and.bubble.right", title: "Sohbet yok", hint: "Teams senkronu sonrası 1:1, grup ve kanal mesajları burada.") } }
            .refreshable { reload() }
            .navigationDestination(isPresented: Binding(get: { selected != nil }, set: { if !$0 { selected = nil } })) {
                if let selected { ChatDetailView(chatId: selected) }
            }
        }
        .screenBackground()
        .navigationTitle("Sohbetler")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { consumeJump() }
        .onChange(of: app.jump) { _, _ in consumeJump() }
    }

    private func consumeJump() {
        if let jump = app.consumeJump(for: .chat) { selected = jump.ref.id }
    }
}

struct ChatDetailView: View {
    var chatId: String
    @Environment(AppModel.self) private var app
    @State private var draft = ""
    @State private var replyTo: ChatMessage?
    @State private var sending = false
    @State private var error: String?

    var body: some View {
        Loading(load: { try await app.api!.chat(chatId) }, refreshOn: ["chats"]) { chat, reload in
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(chat.messages) { m in
                                Bubble(message: m, isReplyTarget: replyTo?.id == m.id)
                                    .id(m.id)
                                    .onTapGesture { replyTo = replyTo?.id == m.id ? nil : chat.messages.first { $0.id == (m.replyToId ?? m.id) } ?? m }
                            }
                        }
                        .padding(14)
                    }
                    .onAppear { if let last = chat.messages.last { proxy.scrollTo(last.id, anchor: .bottom) } }
                    .onChange(of: chat.messages.count) { _, _ in if let last = chat.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } } }
                }
                if let replyTo {
                    HStack {
                        Text("\(replyTo.isMine ? "Siz" : Address.name(replyTo.from)) kişisine yanıt: \(HTMLText.plain(replyTo.bodyHtml ?? replyTo.body))")
                            .font(.caption).foregroundStyle(Theme.dim).lineLimit(1)
                        Spacer()
                        Button { self.replyTo = nil } label: { Image(systemName: "xmark") }
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8).background(Theme.sunken)
                }
                HStack(spacing: 8) {
                    TextField("\(chat.title) sohbetine yaz…", text: $draft).textFieldStyle(.plain)
                        .padding(10).background(Theme.sunken, in: RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous).stroke(Theme.border))
                        .onSubmit { send(chat, reload: reload) }
                    Button { send(chat, reload: reload) } label: { Image(systemName: "arrow.up").font(.headline) }
                        .frame(width: 42, height: 42).background(Theme.accent, in: Circle()).foregroundStyle(Theme.onAccent)
                        .disabled(sending || draft.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(12).background(Theme.raised)
                if let error { Text(error).font(.caption).foregroundStyle(Theme.danger).padding(.horizontal) }
            }
            .navigationTitle(chat.title)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Pill(text: chat.kind.label) } }
        }
        .screenBackground()
        .navigationBarTitleDisplayMode(.inline)
    }

    private func send(_ chat: ChatDetail, reload: @escaping () -> Void) {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        sending = true
        Task {
            defer { sending = false }
            do {
                _ = try await app.api!.sendChat(chat.id, body: body, replyToId: chat.kind == .channel ? replyTo?.id : nil)
                draft = ""; replyTo = nil; error = nil
                reload()
            } catch { self.error = error.localizedDescription }
        }
    }
}

private struct Bubble: View {
    var message: ChatMessage
    var isReplyTarget: Bool

    var body: some View {
        VStack(alignment: message.isMine ? .trailing : .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text(message.isMine ? "Siz" : Address.name(message.from)).font(.caption.weight(.semibold))
                Text(Fmt.time(message.at)).font(.caption2).foregroundStyle(Theme.faint)
            }
            RichBodyView(text: message.body, html: message.bodyHtml, font: .preferredFont(forTextStyle: .subheadline))
                .padding(.horizontal, 12).padding(.vertical, 9)
                .background(message.isMine ? Theme.accentSoft : Theme.raised, in: UnevenRoundedRectangle(
                    topLeadingRadius: 18, bottomLeadingRadius: message.isMine ? 18 : 6, bottomTrailingRadius: message.isMine ? 6 : 18, topTrailingRadius: 18, style: .continuous))
                .overlay(UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: message.isMine ? 18 : 6, bottomTrailingRadius: message.isMine ? 6 : 18, topTrailingRadius: 18, style: .continuous)
                    .stroke(isReplyTarget ? Theme.accent : (message.mentionsMe ? Theme.agent.opacity(0.5) : Theme.border)))
        }
        .frame(maxWidth: .infinity, alignment: message.isMine ? .trailing : .leading)
        .padding(.leading, message.replyToId != nil && !message.isMine ? 18 : 0)
    }
}
