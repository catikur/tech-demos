import ButlerCore
import SwiftUI

/// Butler’a sor — streams thoughts, tool calls, replies and draft cards. Nothing is sent without a tap.
struct AgentSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var items: [Item] = [Item(kind: .reply("Merhaba — ben Butler. Etkin alandaki postayı, takvimi, Teams sohbetlerini ve toplantı transkriptlerini okurum; siz açıkça onaylamadan hiçbir şey göndermem."))]
    @State private var input = ""
    @State private var running = false
    @State private var streamTask: Task<Void, Never>?

    struct Item: Identifiable {
        let id = UUID()
        var kind: Kind
        var draftStatus: DraftStatus = .pending

        enum Kind {
            case user(String)
            case thought(String)
            case tool(String, String, String)
            case reply(String)
            case draft(DraftTarget, String, String)
            case error(String)
        }

        enum DraftStatus { case pending, sending, sent, discarded, failed(String) }
    }

    private var suggestions: [String] {
        ["Dünden beri neyi kaçırdım?", app.tab == .inbox ? "Buna bir yanıt taslağı yaz" : "Neyi bekliyorum?", app.tab == .calendar ? "Bu toplantı için beni hazırla" : "Kime ne borçluyum?"]
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 10) {
                            ForEach(items) { item in row(item).id(item.id) }
                            if running {
                                HStack(spacing: 8) { ProgressView().tint(Theme.agent); Text("Düşünüyor…").font(.footnote).foregroundStyle(Theme.agent) }.id("typing")
                            }
                        }.padding(14)
                    }
                    .onChange(of: items.count) { _, _ in withAnimation { proxy.scrollTo(running ? "typing" : items.last?.id, anchor: .bottom) } }
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(suggestions, id: \.self) { s in
                            Button(s) { ask(s) }.font(.footnote).padding(.horizontal, 12).padding(.vertical, 8)
                                .background(Theme.hover, in: Capsule()).foregroundStyle(Theme.dim).disabled(running)
                        }
                    }.padding(.horizontal, 12).padding(.bottom, 8)
                }
                HStack(spacing: 8) {
                    TextField("Postayı, takvimi veya sohbetleri sor…", text: $input).textFieldStyle(.plain)
                        .padding(10).background(Theme.sunken, in: RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous).stroke(Theme.border))
                        .onSubmit { ask(input) }.disabled(running)
                    Button { ask(input) } label: { Image(systemName: "arrow.up").font(.headline) }
                        .frame(width: 42, height: 42).background(Theme.accent, in: Circle()).foregroundStyle(Theme.onAccent)
                        .disabled(running || input.trimmingCharacters(in: .whitespaces).isEmpty)
                }.padding(12).background(Theme.raised)
            }
            .screenBackground()
            .navigationTitle("E-posta ajanı")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: 6) {
                        Circle().fill(Theme.agent).frame(width: 8, height: 8).shadow(color: Theme.agent, radius: 4)
                        Pill(text: app.activeSpace.map { "kapsam: \($0.kind == .work ? "İş" : "Kişisel")" } ?? "kapsam: tüm alanlar", color: app.activeSpace.map { Color(css: $0.color) } ?? Theme.dim)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) { Button("Kapat") { dismiss() } }
            }
        }
        .onDisappear { streamTask?.cancel() }
    }

    @ViewBuilder
    private func row(_ item: Item) -> some View {
        switch item.kind {
        case .user(let text):
            HStack { Spacer(); Text(text).padding(.horizontal, 14).padding(.vertical, 10).background(Theme.accent, in: RoundedRectangle(cornerRadius: 16, style: .continuous)).foregroundStyle(Theme.onAccent) }
        case .thought(let text):
            HStack(alignment: .top, spacing: 6) { Text("düşünce").font(.caption.weight(.bold)).foregroundStyle(Theme.agent); Text(text).font(.caption).foregroundStyle(Theme.faint) }
        case .tool(let name, let inputText, let output):
            VStack(alignment: .leading, spacing: 6) {
                Text(name).font(.system(.caption2, design: .monospaced)).padding(.horizontal, 6).padding(.vertical, 2).background(Theme.agentSoft, in: RoundedRectangle(cornerRadius: 6)).foregroundStyle(Theme.agent)
                if !inputText.isEmpty { Text(inputText).font(.caption).foregroundStyle(Theme.faint).lineLimit(3) }
                if !output.isEmpty { MarkdownText(text: output).lineLimit(8) }
            }
            .padding(10).frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.sunken, in: RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous)).overlay(RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous).stroke(Theme.border))
        case .reply(let text):
            MarkdownText(text: text).foregroundStyle(Theme.text).padding(.horizontal, 14).padding(.vertical, 10)
                .background(Theme.hover, in: RoundedRectangle(cornerRadius: 16, style: .continuous)).overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.border))
        case .error(let text):
            Text(text).font(.footnote).foregroundStyle(Theme.danger).padding(10).background(Theme.danger.opacity(0.12), in: RoundedRectangle(cornerRadius: Theme.radiusSmall))
        case .draft(let target, let subject, let body):
            draftCard(item, target: target, subject: subject, body: body)
        }
    }

    private func draftCard(_ item: Item, target: DraftTarget, subject: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(target.kind == .thread ? "ÖNERİLEN YANIT" : target.kind == .chat ? "ÖNERİLEN SOHBET İLETİSİ" : "ÖNERİLEN TAKİP POSTASI")
                .font(.caption2.weight(.bold)).kerning(0.6).foregroundStyle(Theme.agent)
            if !subject.isEmpty { Text(subject).font(.subheadline.weight(.semibold)) }
            ScrollView { Text(body).font(.footnote).foregroundStyle(Theme.dim) }.frame(maxHeight: 160)
            switch item.draftStatus {
            case .pending:
                HStack {
                    Button("Onayla ve gönder") { confirm(item, target: target, body: body) }.buttonStyle(PrimaryButtonStyle())
                    Button(target.kind == .followup ? "Toplantıyı aç" : "Düzenleyicide aç") {
                        dismiss()
                        switch target.kind {
                        case .thread: app.open(SourceRef(kind: .thread, id: target.id, label: subject), prefill: body)
                        case .chat: app.open(SourceRef(kind: .chat, id: target.id, label: subject))
                        case .followup: app.open(SourceRef(kind: .meeting, id: target.id, label: subject))
                        }
                    }.buttonStyle(PrimaryButtonStyle(prominent: false))
                    Button("Vazgeç") { set(item, .discarded) }.buttonStyle(PrimaryButtonStyle(prominent: false))
                }
            case .sending: ProgressView().tint(Theme.accent)
            case .sent: Label("Gönderildi", systemImage: "checkmark").font(.footnote).foregroundStyle(Theme.ok)
            case .discarded: Text("Vazgeçildi").font(.footnote).foregroundStyle(Theme.faint)
            case .failed(let msg): Text(msg).font(.footnote).foregroundStyle(Theme.danger)
            }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.bg, in: RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).stroke(Theme.borderStrong))
        .opacity({ if case .discarded = item.draftStatus { return 0.55 } else { return 1 } }())
    }

    private func set(_ item: Item, _ status: Item.DraftStatus) {
        if let i = items.firstIndex(where: { $0.id == item.id }) { items[i].draftStatus = status }
    }

    private func confirm(_ item: Item, target: DraftTarget, body: String) {
        set(item, .sending)
        Task {
            do {
                switch target.kind {
                case .thread: _ = try await app.api!.reply(thread: target.id, body: body, actor: "agent")
                case .chat: _ = try await app.api!.sendChat(target.id, body: body, actor: "agent")
                case .followup: _ = try await app.api!.sendFollowUp(meeting: target.id, body: body, actor: "agent")
                }
                set(item, .sent)
                items.append(Item(kind: .reply("Gönderildi — artık konuşmada. Denetim kaydına işlendi.")))
            } catch { set(item, .failed(error.localizedDescription)) }
        }
    }

    private func ask(_ text: String) {
        let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !running, let api = app.api else { return }
        input = ""
        items.append(Item(kind: .user(q)))
        running = true
        let context = AgentContext(spaceId: app.spaceId)
        streamTask = Task {
            defer { running = false }
            do {
                for try await ev in api.askAgent(q, context: context) {
                    switch ev {
                    case .thought(let t): items.append(Item(kind: .thought(t)))
                    case .tool(let n, let i, let o): items.append(Item(kind: .tool(n, i, o)))
                    case .reply(let t): items.append(Item(kind: .reply(t)))
                    case .draft(let target, let subject, let body): items.append(Item(kind: .draft(target, subject, body)))
                    case .error(let t): items.append(Item(kind: .error(t)))
                    case .done: break
                    }
                }
            } catch is CancellationError {
            } catch { items.append(Item(kind: .error(error.localizedDescription))) }
        }
    }
}

struct NotificationsSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    private func icon(_ kind: String) -> String {
        switch kind {
        case "brief": return "video"
        case "digest": return "list.bullet.rectangle"
        case "commitment": return "checkmark.circle"
        case "radar": return "scope"
        case "sync": return "arrow.triangle.2.circlepath"
        default: return "info.circle"
        }
    }

    var body: some View {
        NavigationStack {
            Loading(load: { try await app.api!.notifications(space: app.spaceId) }, refreshOn: ["notifications"]) { items, reload in
                List(items) { n in
                    Button {
                        Task {
                            if !n.read { try? await app.api?.markNotificationRead(n.id) }
                            await app.refreshStatus()
                            if let link = n.link { dismiss(); app.openLink(link) }
                        }
                    } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: icon(n.kind)).foregroundStyle(Theme.agent).frame(width: 22)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(n.title).font(.subheadline.weight(.semibold))
                                Text(n.body).font(.footnote).foregroundStyle(Theme.dim).lineLimit(2)
                                HStack { Text(Fmt.ago(n.createdAt) + " önce").font(.caption).foregroundStyle(Theme.faint); if let s = n.spaceId, app.spaceId == nil { SpaceBadge(spaceId: s) } }
                            }
                            if !n.read { Circle().fill(Theme.accent).frame(width: 8, height: 8).padding(.top, 6) }
                        }.padding(.vertical, 4)
                    }
                    .listRowBackground(Theme.bg).listRowSeparatorTint(Theme.border)
                }
                .listStyle(.plain)
                .overlay { if items.isEmpty { EmptyState(icon: "bell", title: "Henüz bildirim yok", hint: "Özetler, brifingler ve hatırlatmalar buraya düşer.") } }
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Tümünü okundu say") { Task { try? await app.api?.markAllNotificationsRead(space: app.spaceId); await app.refreshStatus(); reload() } }.font(.footnote)
                    }
                }
            }
            .screenBackground()
            .navigationTitle("Bildirimler")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
