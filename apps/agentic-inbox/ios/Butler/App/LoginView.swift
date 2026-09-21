import SwiftUI

struct LoginView: View {
    @Environment(AppModel.self) private var app
    @State private var busy = false

    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.accent.opacity(0.22), Theme.bg], startPoint: .top, endPoint: .center).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 12) {
                Text("B").font(.system(size: 32, weight: .bold, design: .serif))
                    .frame(width: 52, height: 52)
                    .background(Theme.accent, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .foregroundStyle(Theme.onAccent)
                Text("CONFORCUS").font(.caption.weight(.bold)).kerning(2).foregroundStyle(Theme.accent).padding(.top, 8)
                Text("Butler").font(Theme.display(40))
                Text("Posta, toplantı ve açık iş — tek sakin kokpit.").font(.title3).foregroundStyle(Theme.dim)
                Text("@\(app.session?.allowedDomain ?? "conforcus.com") Microsoft 365 hesabınızla giriş yapın. Diğer etki alanları reddedilir.")
                    .font(.footnote).foregroundStyle(Theme.faint)
                if let error = app.bootError {
                    Text(error).font(.footnote).foregroundStyle(Theme.danger)
                }
                if app.session?.microsoftConfigured == false {
                    Text("Sunucuda Entra uygulaması henüz tanımlı değil. Web kokpitinden ilk kurulumu yapın: \(app.serverURLString)")
                        .font(.footnote).foregroundStyle(Theme.warn)
                }
                Button {
                    busy = true
                    Task { await app.signIn(); busy = false }
                } label: {
                    HStack {
                        if busy { ProgressView().tint(Theme.onAccent) }
                        Text("Microsoft 365 ile giriş")
                    }.frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(busy || app.session?.microsoftConfigured == false)
                .padding(.top, 8)
                Button("Sunucuyu değiştir") { app.session = nil; app.serverURLString = "" }
                    .font(.footnote).foregroundStyle(Theme.faint)
                    .frame(maxWidth: .infinity)
            }
            .padding(26)
            .frame(maxWidth: 440)
            .background(Theme.raised.opacity(0.9), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Theme.borderStrong))
            .padding(16)
        }
        .screenBackground()
    }
}

/// First launch: which Butler server this phone talks to (production or the local demo).
struct ServerView: View {
    @Environment(AppModel.self) private var app
    @State private var draft = ""
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Spacer()
            Text("Butler").font(Theme.display(40))
            Text("Sunucu adresi").font(.headline)
            Text("Üretim: https://butler.conforcus.com · Yerel demo: http://<mac-ip>:3000 (`SEED_DEMO=1 LOGIN_REQUIRED=0`).")
                .font(.footnote).foregroundStyle(Theme.faint)
            TextField("https://butler.conforcus.com", text: $draft)
                .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(12)
                .background(Theme.sunken, in: RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous).stroke(Theme.border))
            if let error = app.bootError { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
            Button {
                busy = true
                Task { await app.setServer(draft.isEmpty ? "https://butler.conforcus.com" : draft); busy = false }
            } label: {
                HStack { if busy { ProgressView().tint(Theme.onAccent) }; Text("Bağlan") }.frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(busy)
            Spacer()
        }
        .padding(24)
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .screenBackground()
        .onAppear { draft = app.serverURLString }
    }
}
