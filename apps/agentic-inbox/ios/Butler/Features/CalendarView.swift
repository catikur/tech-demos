import ButlerCore
import SwiftUI

struct CalendarView: View {
    @Environment(AppModel.self) private var app
    @State private var selected: CalendarEvent?

    var body: some View {
        Loading(load: {
            try await app.api!.events(space: app.spaceId, from: Date().addingTimeInterval(-2 * 86_400), to: Date().addingTimeInterval(14 * 86_400))
        }, refreshOn: ["events"]) { events, reload in
            let now = Date().millis
            let groups = Dictionary(grouping: events) { Calendar.current.startOfDay(for: $0.start.date) }
            let overlaps = Self.overlaps(events)
            List {
                ForEach(groups.keys.sorted(), id: \.self) { day in
                    Section {
                        ForEach(groups[day]!.sorted { $0.start < $1.start }) { e in
                            Button { selected = e } label: {
                                HStack(alignment: .top, spacing: 12) {
                                    Text(Fmt.time(e.start)).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(Theme.dim).frame(width: 52, alignment: .leading)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(e.title).font(.subheadline.weight(.semibold))
                                        HStack(spacing: 6) {
                                            Text("\(e.attendees.count) katılımcı · \(e.end < now ? "geçti" : Fmt.until(e.start))").font(.caption).foregroundStyle(Theme.faint)
                                            if e.meetingId != nil { Pill(text: "transkript", color: Theme.agent) }
                                            if e.responseStatus == .none && e.end > now { Pill(text: "yanıtlanmadı", color: Theme.warn) }
                                            if overlaps.contains(e.id) { Pill(text: "çakışma", color: Theme.danger) }
                                            if app.spaceId == nil { SpaceBadge(spaceId: e.spaceId) }
                                        }
                                    }
                                }
                                .opacity(e.end < now ? 0.6 : 1)
                                .padding(.vertical, 4)
                            }
                            .listRowBackground(Theme.bg)
                            .listRowSeparatorTint(Theme.border)
                        }
                    } header: {
                        Text(Fmt.day(day.millis).uppercased()).font(.caption.weight(.bold)).kerning(0.6).foregroundStyle(Theme.faint)
                    }
                }
            }
            .listStyle(.plain)
            .overlay { if events.isEmpty { EmptyState(icon: "calendar", title: "Bu aralıkta etkinlik yok") } }
            .refreshable { reload() }
        }
        .screenBackground()
        .navigationTitle("Takvim")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { CockpitToolbar() }
        .navigationDestination(item: $selected) { EventDetailView(event: $0) }
        .onAppear { consumeJump() }
        .onChange(of: app.jump) { _, _ in consumeJump() }
    }

    private func consumeJump() {
        guard let jump = app.consumeJump(for: .event) else { return }
        Task { selected = try? await app.api?.event(jump.ref.id) }
    }

    /// Cross-space overlaps (meaningful in the "All" view).
    static func overlaps(_ events: [CalendarEvent]) -> Set<String> {
        var out = Set<String>()
        for (i, a) in events.enumerated() {
            for b in events[(i + 1)...] where a.spaceId != b.spaceId && a.start < b.end && b.start < a.end {
                out.insert(a.id); out.insert(b.id)
            }
        }
        return out
    }
}

struct EventDetailView: View {
    var event: CalendarEvent
    @Environment(AppModel.self) private var app

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(event.title).font(Theme.display(24))
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(Fmt.dateTime(event.start)) → \(Fmt.time(event.end))")
                    Text(event.location.isEmpty ? "Konum yok" : event.location)
                    Text("Organizatör: \(Address.name(event.organizer))")
                    if let join = event.joinUrl, let url = URL(string: join) { Link("Katılım bağlantısı", destination: url) }
                }
                .font(.subheadline).foregroundStyle(Theme.dim)
                if !event.description.isEmpty {
                    RichBodyView(text: event.description, html: event.descriptionHtml)
                }
                SectionTitle(text: "Katılımcılar", count: event.attendees.count)
                FlowChips(items: event.attendees.map { Address.name($0) })
                BriefPanel(event: event)
            }
            .padding(16)
        }
        .screenBackground()
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct FlowChips: View {
    var items: [String]
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 8, alignment: .leading)], alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { item in
                Text(item).font(.footnote).padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Theme.raised, in: Capsule()).overlay(Capsule().stroke(Theme.border))
            }
        }
    }
}

/// Pre-meeting brief (attendees, open commitments, last time's notes, agenda). Generated on demand or at T-15 by the scheduler.
struct BriefPanel: View {
    var event: CalendarEvent
    @Environment(AppModel.self) private var app
    @State private var brief: MeetingBrief?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Card {
            HStack {
                Text("Toplantı özeti").font(.subheadline.weight(.bold))
                Spacer()
                Button(busy ? "Hazırlanıyor…" : (brief == nil ? "Beni hazırla" : "Yenile")) { load(refresh: brief != nil) }
                    .buttonStyle(PrimaryButtonStyle()).disabled(busy)
            }
            if let error { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
            if let brief {
                MarkdownText(text: brief.bodyMarkdown)
                if !brief.agendaSuggestions.isEmpty {
                    SectionTitle(text: "Önerilen gündem")
                    ForEach(brief.agendaSuggestions, id: \.self) { Text("• \($0)").font(.footnote).foregroundStyle(Theme.dim) }
                }
                if !brief.openCommitments.isEmpty {
                    SectionTitle(text: "Açık taahhütler", count: brief.openCommitments.count)
                    ForEach(brief.openCommitments) { c in
                        Text("\(c.displayName): \(c.text)").font(.footnote).foregroundStyle(Theme.dim)
                    }
                }
            } else if !busy {
                Text("Katılımcılar, onlarla son konuştuklarınız, açık taahhütler, önceki kararlar ve önerilen gündem. Başlamadan 15 dakika önce otomatik üretilir.")
                    .font(.footnote).foregroundStyle(Theme.faint)
            }
        }
        .task(id: event.id) { brief = try? await app.api?.brief(event: event.id, existingOnly: true) }
    }

    private func load(refresh: Bool) {
        busy = true
        Task {
            defer { busy = false }
            do { brief = try await app.api!.brief(event: event.id, refresh: refresh); error = nil } catch { self.error = error.localizedDescription }
        }
    }
}
