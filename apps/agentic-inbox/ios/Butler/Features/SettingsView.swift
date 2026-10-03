import ButlerCore
import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @State private var busy: String?
    @State private var error: String?

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(Theme.danger).listRowBackground(Theme.raised) }

            Section {
                ForEach(app.spaces) { s in NavigationLink(s.kind == .work ? "İş alanı" : "Kişisel alan") { SpaceRulesView(space: s) } }
            } header: { Text("Alanlar") } footer: {
                Text("İş ve Kişisel katı sınırlardır: ajan, özetler ve bildirimler etkin alanla sınırlıdır. Yalnızca açık bir istek (“her iki alanda da”) sınırı geçer ve denetim kaydına yazılır.")
            }

            Section {
                ForEach(app.status?.accounts ?? []) { a in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack { Text(a.displayName).font(.subheadline.weight(.semibold)); Spacer(); SpaceBadge(spaceId: a.spaceId) }
                        Text(a.email).font(.footnote).foregroundStyle(Theme.faint)
                        Text(a.lastSyncError.map { "Hata: \($0)" } ?? a.lastSyncAt.map { "Son senkron \(Fmt.ago($0)) önce" } ?? "Henüz senkron yok")
                            .font(.caption).foregroundStyle(a.lastSyncError == nil ? Theme.faint : Theme.danger)
                        HStack {
                            Button(busy == a.id ? "…" : "Senkronla") { run(a.id) { try await app.api!.syncAccount(a.id) } }.buttonStyle(PrimaryButtonStyle(prominent: false))
                            if a.provider != .m365 || app.session?.loginRequired == false {
                                Button("Kaldır", role: .destructive) { run("rm-\(a.id)") { try await app.api!.removeAccount(a.id); await app.refreshStatus() } }.buttonStyle(PrimaryButtonStyle(prominent: false))
                            }
                        }.disabled(busy != nil)
                    }.padding(.vertical, 4)
                }
                Button(busy == "all" ? "Senkronlanıyor…" : "Tümünü senkronla") { run("all") { try await app.api!.syncAll() } }.disabled(busy != nil)
                if app.status?.oauth.google == true {
                    Text("Gmail bağlamak tarayıcı OAuth’u gerektirir: web kokpitinde Ayarlar → Gmail.").font(.footnote).foregroundStyle(Theme.faint)
                }
            } header: { Text("Hesaplar") }

            Section {
                NavigationLink("Ajan (OpenRouter)") { LlmSettingsView() }
                NavigationLink("Posta etiketleri") { MailTagsView() }
                NavigationLink("Kurumsal asistan") { OrgAssistantView() }
                if let llm = app.status?.llm {
                    Text("Sağlayıcı: \(llm.provider)\(llm.model.map { " · \($0)" } ?? "")").font(.footnote).foregroundStyle(Theme.faint)
                }
            } header: { Text("Butler") }

            Section {
                LabeledContent("Sunucu", value: app.serverURLString)
                if let email = app.session?.email { LabeledContent("Hesap", value: email) }
                Button("Sunucuyu değiştir") { app.session = nil; app.serverURLString = "" }
                if app.session?.loginRequired == true {
                    Button("Çıkış yap", role: .destructive) { Task { await app.signOut() } }
                }
            } header: { Text("Oturum") }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .navigationTitle("Ayarlar")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func run(_ key: String, _ work: @escaping () async throws -> Void) {
        busy = key
        Task { defer { busy = nil }; do { try await work(); error = nil; await app.refreshStatus() } catch { self.error = error.localizedDescription } }
    }
}

struct SpaceRulesView: View {
    var space: Space
    @Environment(AppModel.self) private var app
    @State private var name = ""
    @State private var quiet = false
    @State private var from = 22
    @State private var to = 8
    @State private var digestHour = 8
    @State private var tone = "concise"
    @State private var signature = ""
    @State private var saved = false
    @State private var error: String?

    var body: some View {
        Form {
            Section("Ad") { TextField("Ad", text: $name) }
            Section {
                Toggle("Sessiz saatler (bildirimleri kapat)", isOn: $quiet)
                if quiet {
                    Stepper("Başlangıç: \(from):00", value: $from, in: 0...23)
                    Stepper("Bitiş: \(to):00", value: $to, in: 0...23)
                }
                Stepper("Günlük özet saati: \(digestHour):00", value: $digestHour, in: 0...23)
            } header: { Text("Zamanlama") }
            Section {
                Picker("Ajan tonu", selection: $tone) {
                    Text("Kısa").tag("concise"); Text("Sıcak").tag("warm"); Text("Resmi").tag("formal")
                }
                TextField("İmza", text: $signature, axis: .vertical).lineLimit(2...4)
            } header: { Text("Ajan") }
            if let error { Text(error).foregroundStyle(Theme.danger) }
            Button(saved ? "Kaydedildi" : "Kaydet") {
                Task {
                    do {
                        _ = try await app.api!.updateSpace(space.id, name: name, quietHours: .some(quiet ? [from, to] : nil), digestHour: digestHour, agentTone: tone, signature: signature)
                        saved = true; error = nil
                        await app.refreshStatus()
                    } catch { self.error = error.localizedDescription }
                }
            }
        }
        .scrollContentBackground(.hidden).screenBackground()
        .navigationTitle(space.kind == .work ? "İş alanı" : "Kişisel alan")
        .onAppear {
            name = space.name; digestHour = space.digestHour; tone = space.agentTone; signature = space.signature
            if let q = space.quietRange { quiet = true; from = q.from; to = q.to } else { quiet = false }
        }
    }
}

struct LlmSettingsView: View {
    @Environment(AppModel.self) private var app
    @State private var apiKey = ""
    @State private var model = ""
    @State private var embedModel = ""
    @State private var jevModel = ""
    @State private var message: String?

    var body: some View {
        Loading(load: { try await app.api!.llmConfig() }, refreshOn: ["llm"]) { cfg, reload in
            Form {
                Section {
                    LabeledContent("Durum", value: cfg.configured ? "OpenRouter bağlı" : "Kural tabanlı yedek (anahtar yok)")
                    if let masked = cfg.apiKeyMasked { LabeledContent("Anahtar", value: "\(masked) · \(cfg.apiKeySource ?? "")") }
                    LabeledContent("Model", value: "\(cfg.model) · \(cfg.modelSource)")
                    LabeledContent("Gömme modeli", value: "\(cfg.embedModel) · \(cfg.embedModelSource)")
                    LabeledContent("Jev", value: "\(cfg.jevModel) · \(cfg.jevModelSource)")
                } header: { Text("Şu an") } footer: { Text("Anahtar sunucuda şifreli saklanır; .env değerini geçersiz kılar. Jev sohbet modeli değildir: mail sınıfı, araç seçimi ve yazma kapısı.") }
                Section {
                    SecureField("sk-or-… (boş bırak = değiştirme)", text: $apiKey)
                    TextField("sohbet modeli (örn. openai/gpt-4o-mini)", text: $model).textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("gömme modeli (örn. openai/text-embedding-3-small)", text: $embedModel).textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Jev (örn. typesafe/jev-1.13 veya ~typesafe/jev-latest)", text: $jevModel).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Kaydet") {
                        Task {
                            do {
                                _ = try await app.api!.updateLlm(
                                    apiKey: apiKey.isEmpty ? nil : .some(apiKey),
                                    model: model.isEmpty ? nil : .some(model),
                                    embedModel: embedModel.isEmpty ? nil : .some(embedModel),
                                    jevModel: jevModel.isEmpty ? nil : .some(jevModel)
                                )
                                apiKey = ""; model = ""; embedModel = ""; jevModel = ""; message = "Kaydedildi."; reload(); await app.refreshStatus()
                            } catch { message = error.localizedDescription }
                        }
                    }.disabled(apiKey.isEmpty && model.isEmpty && embedModel.isEmpty && jevModel.isEmpty)
                    if cfg.jevModelSource == "settings" {
                        Button("Jev’i varsayılana al") {
                            Task {
                                do {
                                    _ = try await app.api!.updateLlm(jevModel: .some(""))
                                    message = "Jev varsayılan sürüme döndü."; reload()
                                } catch { message = error.localizedDescription }
                            }
                        }
                    }
                    if let message { Text(message).font(.footnote).foregroundStyle(Theme.dim) }
                } header: { Text("Değiştir") } footer: { Text("Gömme modelini değiştirmek arama indeksini sıfırlar. Jev kimliği OpenRouter’da yeni sürüm çıkınca buradan değişir; boş bırakılan alan değişmez.") }
            }
            .scrollContentBackground(.hidden)
        }
        .screenBackground()
        .navigationTitle("Ajan")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Teams briefing channel, SharePoint vault, template folder, Plaud credentials.
struct OrgAssistantView: View {
    @Environment(AppModel.self) private var app
    @State private var channel = ""
    @State private var vault = ""
    @State private var folder = ""
    @State private var plaudId = ""
    @State private var plaudSecret = ""
    @State private var plaudKey = ""
    @State private var busy: String?
    @State private var message: String?

    var body: some View {
        Loading(load: { try await app.api!.org(space: app.spaceId) }) { org, reload in
            Form {
                Section {
                    TextField("Kanal başlığı (örn. Yonetim › Butler)", text: $channel)
                    Text(org.briefResolved ? "Kanal çözüldü ✓" : "Kanal henüz eşleşmedi — Teams kanalları senkronlansın.").font(.footnote).foregroundStyle(org.briefResolved ? Theme.ok : Theme.warn)
                    if !org.channelOptions.isEmpty {
                        Picker("Seç", selection: $channel) { ForEach(org.channelOptions) { Text($0.title).tag($0.title) } }
                    }
                    Button(busy == "brief" ? "…" : "Kanalı kaydet") { run("brief") { _ = try await app.api!.updateOrg(space: app.spaceId, briefChannelTitle: channel); reload() } }
                } header: { Text("Teams sabah brifingi") }

                Section {
                    TextField("SharePoint kütüphane URL’si", text: $vault).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Text(org.vaultError ?? org.vaultSyncedAt.map { "\(org.vaultFileCount) dosya · \(Fmt.ago($0)) önce" } ?? "Henüz senkronlanmadı")
                        .font(.footnote).foregroundStyle(org.vaultError == nil ? Theme.faint : Theme.danger)
                    HStack {
                        Button(busy == "vault" ? "…" : "URL’yi kaydet") { run("vault") { _ = try await app.api!.updateOrg(space: app.spaceId, vaultUrl: vault); reload() } }
                        Button(busy == "sync" ? "Senkronlanıyor…" : "Vault’u senkronla") { run("sync") { _ = try await app.api!.syncVault(space: app.spaceId); reload() } }
                    }.buttonStyle(PrimaryButtonStyle(prominent: false))
                    if !org.folders.isEmpty {
                        Picker("Şablon klasörü", selection: $folder) { Text("(yok)").tag(""); ForEach(org.folders, id: \.self) { Text($0).tag($0) } }
                        Button("Klasörü kaydet") { run("folder") { _ = try await app.api!.updateOrg(space: app.spaceId, templateFolder: folder); reload() } }
                        Text("\(org.templates.count) şablon").font(.footnote).foregroundStyle(Theme.faint)
                    }
                } header: { Text("Conforcus Vault") } footer: { Text("Markdown notlar bilgi tabanı olarak indekslenir; toplantı notu şablonları bu klasörden okunur.") }

                Section {
                    LabeledContent("Durum", value: org.plaud.canTranscribe ? "Çözümleme hazır" : org.plaud.configured ? "Eksik alan var" : "Tanımlı değil")
                    if let id = org.plaud.clientIdMasked { LabeledContent("Client id", value: id) }
                    TextField("Client id", text: $plaudId).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("Client secret", text: $plaudSecret)
                    SecureField("API key", text: $plaudKey)
                    Button(busy == "plaud" ? "…" : "Plaud’u kaydet") {
                        run("plaud") {
                            _ = try await app.api!.savePlaud(space: app.spaceId, clientId: plaudId.isEmpty ? nil : plaudId, clientSecret: plaudSecret.isEmpty ? nil : plaudSecret, apiKey: plaudKey.isEmpty ? nil : plaudKey)
                            plaudSecret = ""; plaudKey = ""; reload()
                        }
                    }.disabled(plaudId.isEmpty && plaudSecret.isEmpty && plaudKey.isEmpty)
                } header: { Text("Plaud Embedded") } footer: { Text("Butler’ın indirdiği mp4’leri çözümler. Graph 423 ile kilitli kayıtlar Teams bağlantısı olarak kalır.") }

                if let message { Text(message).font(.footnote).foregroundStyle(Theme.dim) }
            }
            .scrollContentBackground(.hidden)
            .onAppear { channel = org.briefChannelTitle; vault = org.vaultUrl; folder = org.templateFolder }
        }
        .screenBackground()
        .navigationTitle("Kurumsal asistan")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func run(_ key: String, _ work: @escaping () async throws -> Void) {
        busy = key
        Task { defer { busy = nil }; do { try await work(); message = "Kaydedildi." } catch { message = error.localizedDescription } }
    }
}

struct MailTagsView: View {
    @Environment(AppModel.self) private var app
    @State private var name = ""
    @State private var detail = ""
    @State private var note: String?

    var body: some View {
        Loading(load: { try await app.api!.mailTags() }) { tags, reload in
            Form {
                Section {
                    Text("Jev yalnızca bu listedeki etiketleri basar. Bülten ve güvenlik kapatılamaz.").font(.footnote).foregroundStyle(Theme.faint)
                    ForEach(tags) { tag in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(tag.name).font(.subheadline.weight(.semibold))
                            Text(tag.description).font(.caption).foregroundStyle(Theme.faint)
                            if !tag.system {
                                HStack {
                                    Button(tag.enabled ? "Kapat" : "Aç") {
                                        Task { _ = try? await app.api!.saveMailTags(tags.map { $0.id == tag.id ? MailTag(id: tag.id, name: tag.name, description: tag.description, enabled: !tag.enabled, system: tag.system) : $0 }); reload() }
                                    }
                                    Button("Sil", role: .destructive) {
                                        Task { _ = try? await app.api!.saveMailTags(tags.filter { $0.id != tag.id }); reload() }
                                    }
                                }.font(.footnote)
                            }
                        }
                    }
                }
                Section {
                    TextField("Ad", text: $name)
                    TextField("Ne demek", text: $detail)
                    Button("Ekle") {
                        Task {
                            let next = tags + [MailTag(id: name, name: name, description: detail, enabled: true, system: false)]
                            _ = try? await app.api!.saveMailTags(next)
                            name = ""; detail = ""; reload()
                        }
                    }.disabled(name.trimmingCharacters(in: .whitespaces).count < 2)
                    Button("Henüz etiketlenmemiş postayı tara") {
                        Task {
                            let n = try? await app.api!.scanMailTags(space: app.spaceId)
                            note = "\(n ?? 0) sıraya alındı"
                        }
                    }
                    if let note { Text(note).font(.footnote).foregroundStyle(Theme.dim) }
                }
            }
            .scrollContentBackground(.hidden)
        }
        .screenBackground()
        .navigationTitle("Posta etiketleri")
        .navigationBarTitleDisplayMode(.inline)
    }
}
