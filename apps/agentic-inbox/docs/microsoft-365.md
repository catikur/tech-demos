# Connecting Microsoft 365 (Outlook, Calendar, Teams)

The app talks to Microsoft Graph with a **delegated** auth-code + PKCE flow. One sign-in
gives it mail, calendar, Teams chats, channel messages, meeting transcripts and recordings —
provided a tenant admin has granted consent for the three admin-only scopes below.

## 1. Register the app in Entra ID (Azure AD)

1. [Entra admin center](https://entra.microsoft.com) → **Identity → Applications → App registrations → New registration**.
2. Name: `Agentic Inbox (local)`. Supported account types: *Accounts in this organizational directory only* (or multitenant if you want personal Microsoft accounts too — Teams data needs a work/school account).
3. Redirect URI: platform **Web**, value `http://localhost:3000/api/auth/microsoft/callback`
   for local dev, or `https://butler.conforcus.com/api/auth/microsoft/callback` in production
   (`APP_BASE_URL` must match).
4. After creation copy the **Application (client) ID** and **Directory (tenant) ID**.
5. *(Optional but recommended)* **Certificates & secrets → New client secret**. Without a secret the app runs as a public client with PKCE, which Entra allows once you enable
   **Authentication → Advanced settings → Allow public client flows = Yes**.

## 2. API permissions

**API permissions → Add a permission → Microsoft Graph → Delegated permissions**, then add:

| Scope | Why | Admin consent |
|---|---|---|
| `User.Read`, `openid`, `profile`, `offline_access` | identity + refresh tokens | no |
| `Mail.ReadWrite`, `Mail.Send` | inbox/sent sync, send replies | no |
| `Calendars.ReadWrite` | calendar view, respond to invites | no |
| `Chat.Read`, `ChatMessage.Send` | 1:1 and group chats | no |
| `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Send` | list teams/channels, post | no |
| `ChannelMessage.Read.All` | read channel messages | **yes** |
| `OnlineMeetings.Read` | resolve meetings from join links | no |
| `OnlineMeetingTranscript.Read.All` | meeting transcripts | **yes** |
| `OnlineMeetingRecording.Read.All` | meeting recordings | **yes** |
| `People.Read` | people ranking | no |
| `Tasks.ReadWrite` | push commitments to Microsoft To Do | no |

Click **Grant admin consent for <tenant>**. That single click is what unlocks transcripts,
recordings and channel messages for this delegated flow — no application-permission
access policy is needed.

> If you prefer **application permissions** (daemon-style, no user session) you would
> additionally need a Teams *application access policy*
> (`New-CsApplicationAccessPolicy` + `Grant-CsApplicationAccessPolicy` in the Teams PowerShell
> module). The app does not use that mode today.

## 3. Configure and connect

```sh
# apps/agentic-inbox/.env
MS_CLIENT_ID=<application (client) id>
MS_TENANT_ID=<directory (tenant) id>      # or "common" / "organizations"
MS_CLIENT_SECRET=<secret value>            # optional (PKCE public client works without it)
APP_BASE_URL=http://localhost:3000
```

Start the app. If `MS_CLIENT_ID` / `MS_TENANT_ID` are not in the environment, the
**login screen** asks for them once (stored encrypted as `microsoft.oauth`). Then sign in
with a `@{ALLOWED_LOGIN_DOMAIN}` (default `conforcus.com`) Microsoft 365 account — that
mailbox becomes the Work account. Other domains are redirected with `login=denied`.
After you are in, **Settings → Microsoft Graph / Entra** shows the tenant/client (read-only
when they come from env). Gmail is still connected from Settings.

Redirect URIs to register on the Entra app:

- Local: `http://localhost:3000/api/auth/microsoft/callback`
- Production: `https://butler.conforcus.com/api/auth/microsoft/callback`

## What gets synced

- **Mail**: Inbox + Sent Items via delta queries (last 30 days on first sync, incremental after).
  Threads are grouped by `conversationId`.
- **Calendar**: `calendarView` from −14 to +30 days. Events with a Teams join link are
  matched to online meetings.
- **Chats**: your 40 most recently active 1:1/group chats and their messages (delta where
  supported). Unread counts come from the chat viewpoint.
- **Channels**: top-level messages in channels of teams you have joined, plus thread replies
  (capped) stored in the same chat with `replyToId` pointing at the parent.
- **Meetings**: for past events with a join link, the latest transcript (WebVTT → text) and
  the first recording (downloaded to `data/recordings/`, served at `/api/recordings/:id`).
  Transcripts are retried for 24 h after a meeting since Teams produces them asynchronously.

## Sending

Replies use `POST /me/messages/{id}/reply` (keeps the Outlook conversation intact) and fall
back to `sendMail`. Chat and channel messages use the corresponding `/messages` endpoints.
Every send requires your confirmation in the UI and is written to the audit log.

## Change notifications (webhooks)

When `APP_BASE_URL` is a **public HTTPS** origin (ngrok, Caddy, a reverse-proxied host) the
app creates Graph subscriptions after a Microsoft 365 account connects, and renews them on
scheduler ticks (PATCH `expirationDateTime` when less than 12 hours remain; chats use a
shorter window because Graph caps them at ~60 minutes).

Microsoft POSTs to `{APP_BASE_URL}/api/webhooks/graph`:

- Validation handshake: `?validationToken=...` → **200** `text/plain` with the token as the body.
- Notifications: JSON `{ value: [...] }` → **202**, `clientState` is checked, then a
  2-second-debounced `syncAccount` for the matching account.

`http://localhost` and `127.0.0.1` stay **poll-only** — Graph cannot deliver to loopback.
Optional `GRAPH_WEBHOOK_SECRET` sets the subscription `clientState`; otherwise a secret is
generated and stored in settings.

Inbox mail, calendar events, and (when the tenant allows it) chats are subscribed.
Org-wide channel `/teams/getAllMessages` is **not** — that needs application permissions.

## Microsoft To Do (commitments)

From the Commitments view, an open item you owe can be pushed to Microsoft To Do. Completing
it in-app marks the linked To Do task completed. Re-consent after adding `Tasks.ReadWrite`
if the account was connected before that scope existed.

Graph calls (delegated, `Tasks.ReadWrite`):

- `GET /me/todo/lists` — find a list named **Agentic Inbox**
- `POST /me/todo/lists` `{ displayName: "Agentic Inbox" }` — create it when missing
- `POST /me/todo/lists/{listId}/tasks` `{ title, dueDateTime?: { dateTime, timeZone: "UTC" }, body?: { content, contentType: "text" } }`
- `PATCH /me/todo/lists/{listId}/tasks/{taskId}` `{ status: "completed" }` when the commitment is marked done

Optional Planner: set `MS_PLANNER_PLAN_ID` to also `POST /planner/tasks` `{ planId, title, dueDateTime? }`.
Planner needs a plan id and typically `Group.ReadWrite.All`; failures are logged and do not
block the To Do task. Pulling tasks back from To Do is not implemented.

## Troubleshooting

- `AADSTS65001` / consent errors → admin consent has not been granted for the admin-only scopes.
- `403` on `/transcripts` or `/recordings` → the transcript/recording scopes are missing consent, or the meeting was not transcribed/recorded.
- Transcripts empty right after a meeting → normal; the app retries on the next sync.
- Throttling (`429`) → the client honours `Retry-After`; lower `SYNC_INTERVAL_MINUTES` only if you need it.
- `403` on `/me/todo/lists` → add `Tasks.ReadWrite` and reconnect the Microsoft 365 account (re-consent).
