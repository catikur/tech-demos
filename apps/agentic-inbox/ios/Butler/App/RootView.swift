import ButlerCore
import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        @Bindable var app = app
        Group {
            if app.booting && app.session == nil {
                ProgressView().tint(Theme.accent).frame(maxWidth: .infinity, maxHeight: .infinity).screenBackground()
            } else if app.needsServer || app.session == nil {
                ServerView()
            } else if !app.signedIn {
                LoginView()
            } else {
                Cockpit()
            }
        }
        .sheet(isPresented: $app.agentOpen) {
            AgentSheet().presentationDetents([.large, .fraction(0.85)]).presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $app.notificationsOpen) {
            NotificationsSheet().presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
        }
    }
}

/// Bottom tabs on iPhone (Brifing / Gelen / Takvim / Pano / Daha) — same grouping as the web bottom nav.
private struct Cockpit: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        @Bindable var app = app
        TabView(selection: $app.tab) {
            NavigationStack { BriefingView() }
                .tabItem { Label("Brifing", systemImage: "sun.max") }
                .tag(Tab.briefing)
            NavigationStack { InboxView() }
                .tabItem { Label("Gelen", systemImage: "tray") }
                .tag(Tab.inbox)
            NavigationStack { CalendarView() }
                .tabItem { Label("Takvim", systemImage: "calendar") }
                .tag(Tab.calendar)
            NavigationStack { BoardView() }
                .tabItem { Label("Pano", systemImage: "rectangle.split.3x1") }
                .tag(Tab.board)
            NavigationStack { MoreView() }
                .tabItem { Label("Daha", systemImage: "ellipsis.circle") }
                .tag(Tab.more)
        }
        .toolbarBackground(Theme.raised, for: .tabBar)
        .overlay(alignment: .bottomTrailing) {
            if !app.agentOpen {
                Button { app.agentOpen = true } label: {
                    Image(systemName: "sparkles").font(.title3.weight(.semibold))
                        .frame(width: 52, height: 52)
                        .background(Theme.accent, in: Circle())
                        .foregroundStyle(Theme.onAccent)
                        .shadow(color: Theme.accent.opacity(0.35), radius: 14, y: 8)
                }
                .padding(.trailing, 16)
                .padding(.bottom, 64)
                .accessibilityLabel("Butler’a sor")
            }
        }
    }
}

/// Shared top chrome: wordmark, space tabs, bell, agent.
struct CockpitToolbar: ToolbarContent {
    @Environment(AppModel.self) private var app

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            HStack(spacing: 8) {
                Text("B").font(.system(size: 16, weight: .bold, design: .serif))
                    .frame(width: 26, height: 26)
                    .background(Theme.accent, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .foregroundStyle(Theme.onAccent)
                Text("Butler").font(Theme.display(20))
            }
        }
        ToolbarItem(placement: .principal) { SpacePicker() }
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button { app.notificationsOpen = true } label: {
                Image(systemName: "bell")
                    .overlay(alignment: .topTrailing) {
                        if let n = app.status?.unreadNotifications, n > 0 {
                            Text(n > 9 ? "9+" : "\(n)").font(.system(size: 9, weight: .bold))
                                .padding(.horizontal, 4).padding(.vertical, 1)
                                .background(Theme.accent, in: Capsule()).foregroundStyle(Theme.onAccent)
                                .offset(x: 8, y: -6)
                        }
                    }
            }
            .accessibilityLabel("Bildirimler")
        }
    }
}

struct SpacePicker: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        Menu {
            Picker("Alan", selection: Binding(get: { app.spaceId ?? "all" }, set: { app.spaceId = $0 == "all" ? nil : $0 })) {
                Text("Tümü").tag("all")
                ForEach(app.spaces) { s in
                    Label(s.kind == .work ? "İş" : "Kişisel", systemImage: "circle.fill").tag(s.id)
                }
            }
        } label: {
            HStack(spacing: 6) {
                Circle().fill(app.activeSpace.map { Color(css: $0.color) } ?? Theme.dim).frame(width: 7, height: 7)
                Text(app.activeSpace.map { $0.kind == .work ? "İş" : "Kişisel" } ?? "Tümü").font(.subheadline.weight(.semibold))
                Image(systemName: "chevron.down").font(.caption2.weight(.bold))
            }
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(Theme.sunken, in: Capsule())
            .overlay(Capsule().stroke(Theme.border))
        }
    }
}

struct MoreView: View {
    @Environment(AppModel.self) private var app

    private let items: [(MoreDestination, String, String)] = [
        (.chats, "Sohbetler", "bubble.left.and.bubble.right"),
        (.meetings, "Toplantılar", "video"),
        (.catchup, "Neyi kaçırdım", "arrow.counterclockwise"),
        (.radar, "Radar", "scope"),
        (.topics, "Konular", "number"),
        (.people, "Kişiler", "person.2"),
        (.settings, "Ayarlar", "gearshape"),
    ]

    var body: some View {
        @Bindable var app = app
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 10)], spacing: 10) {
                ForEach(items, id: \.0) { item in
                    NavigationLink(value: item.0) {
                        VStack(spacing: 8) {
                            Image(systemName: item.2).font(.title3)
                            Text(item.1).font(.footnote.weight(.semibold)).multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity, minHeight: 88)
                        .background(Theme.hover, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.border))
                        .foregroundStyle(Theme.text)
                    }
                }
            }
            .padding(16)
            if let email = app.session?.email {
                Text(email).font(.footnote).foregroundStyle(Theme.faint)
            }
        }
        .screenBackground()
        .navigationTitle("Daha")
        .navigationBarTitleDisplayMode(.large)
        .toolbar { CockpitToolbar() }
        .navigationDestination(for: MoreDestination.self) { dest in
            switch dest {
            case .chats: ChatsView()
            case .meetings: MeetingsView()
            case .catchup: CatchUpView()
            case .radar: RadarView()
            case .topics: TopicsView()
            case .people: PeopleView()
            case .settings: SettingsView()
            }
        }
        .navigationDestination(isPresented: Binding(get: { app.moreDestination != nil }, set: { if !$0 { app.moreDestination = nil } })) {
            switch app.moreDestination {
            case .chats: ChatsView()
            case .meetings: MeetingsView()
            case .catchup: CatchUpView()
            case .radar: RadarView()
            case .topics: TopicsView()
            case .people: PeopleView()
            case .settings: SettingsView()
            case nil: EmptyView()
            }
        }
    }
}
