# Butler for iOS (SwiftUI)

Native client for the Butler cockpit. Same server, same features: morning briefing, inbox with
HTML mail bodies, calendar + meeting brief, Kanban board, Teams chats, meetings (transcript,
minutes, follow-up, Plaud), catch-up + digests, radar, topics, people, settings, and the
streaming **Butler’a sor** agent with tap-to-confirm drafts.

```
ios/
  project.yml        XcodeGen spec → Butler.xcodeproj
  Butler/            SwiftUI app (iOS 17+)
  ButlerCore/        SwiftPM package: models, API client, SSE parser, HTML hygiene (Linux-testable)
```

## Build (iPhone and iPad)

The target is universal (`TARGETED_DEVICE_FAMILY` 1 and 2, iOS 17). This repo stops at the Xcode project: pick your team, sign, and run. No Mac-side signing is done here.

```sh
brew install xcodegen
cd apps/agentic-inbox/ios
xcodegen generate
open Butler.xcodeproj
```

In Xcode: select the Butler scheme, set Signing & Capabilities → Team, then choose an iPhone or iPad destination (simulator or device) and Run. Archive the same scheme for a device install.

The phone talks to the same server as the web cockpit, including the Jev decision model. Change that model under Ayarlar → Ajan (OpenRouter) — `typesafe/jev-1.13` or `~typesafe/jev-latest`, or whatever id OpenRouter publishes next. That setting is stored on the server, so the phone and the web share it.

First launch asks for the server. Production: `https://butler.conforcus.com`. Local demo:
run the server with `SEED_DEMO=1 LOGIN_REQUIRED=0 bun run dev` and enter `http://<mac-ip>:3000`
(plain http is allowed only for local networking).

## Sign-in

The server owns the Entra redirect (`…/api/auth/microsoft/callback`), so no new Entra URI is
needed. The app opens `/api/auth/microsoft/start?client=native` in `ASWebAuthenticationSession`;
after Microsoft returns, the server bounces to `butler://signed-in?token=…`. The token is the same
encrypted session blob the web cookie carries, stored in the Keychain and sent as
`Authorization: Bearer`. `DELETE /api/session` signs out.

## Core package tests (no Mac needed)

```sh
cd apps/agentic-inbox/ios/ButlerCore
swift test                                              # fixtures captured from the demo server
BUTLER_TEST_BASE_URL=http://127.0.0.1:3011 swift test   # live round-trips incl. agent stream + board PATCH
```

## Not in this slice

- Push notifications (APNs) — the in-app bell reads `/api/notifications`; the server has no APNs sender yet.
- Gmail connect from the phone — Google OAuth stays in the web Settings.
- English strings — UI is Turkish like the web default; `Strings` can be lifted into `Localizable.xcstrings`.
