import SwiftUI

@main
struct ButlerApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
                .task { await model.boot() }
                .onOpenURL { url in model.handleSignInCallback(url) }
        }
    }
}
