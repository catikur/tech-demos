# Connecting Gmail (and Google Calendar)

Gmail is meant for the **Personal** space, but any account can be attached to any space.

You need a Google Cloud **OAuth client ID** and **client secret**. Paste them in
**Settings → Gmail / Google Cloud** after you sign in with Microsoft 365 (stored
encrypted, same as the Entra app). Alternatively set `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` on the server — env wins and the Settings form becomes read-only.

## 1. Create an OAuth client

1. [Google Cloud console](https://console.cloud.google.com) → create/select a project.
2. **APIs & Services → Library**: enable **Gmail API** and **Google Calendar API** on the *same* project.
   Butler Settings has **one** OAuth client form (id + secret), not separate Gmail vs Calendar fields.
3. **APIs & Services → OAuth consent screen**: External, add yourself as a test user while the
   app is in *Testing* (no verification needed for personal use). Add the scopes below.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized redirect URIs (add both if you develop locally):
   - Production: `https://butler.conforcus.com/api/auth/google/callback`
   - Local: `http://localhost:3000/api/auth/google/callback`
5. Copy the **Client ID** (`….apps.googleusercontent.com`) and **Client secret**.

Scopes requested:

- `openid email profile`
- `https://www.googleapis.com/auth/gmail.modify` — read threads, labels, history
- `https://www.googleapis.com/auth/gmail.send` — send replies
- `https://www.googleapis.com/auth/calendar.readonly` — only when `GOOGLE_CALENDAR=true` (default)

## 2. Configure and connect

**In the app (preferred):** sign in → **Settings → Gmail / Google Cloud** → paste client id +
secret → save. The page shows the exact redirect URI to register on the Google client.

**Or via env** (locks the form):

```sh
# apps/agentic-inbox/.env  (or /opt/butler/.env on the VPS)
GOOGLE_CLIENT_ID=<client id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<client secret>
GOOGLE_CALENDAR=true
```

Then **Settings → Connect Gmail** under the space you want (usually Personal). The consent
screen is requested with `access_type=offline` so a refresh token is stored (encrypted) and
the account keeps syncing without re-login.

## What gets synced

- **Mail**: threads from the last 30 days on first sync (`threads.list`), then incremental via
  `history.list` from the stored `historyId`. If Google reports the history as expired (404) the
  connector transparently falls back to a full 30-day window.
- **Calendar** (optional): primary calendar from −14 to +30 days, including Meet links.

## Sending

Replies are sent with `messages.send` as an RFC 2822 message that carries `In-Reply-To` and
`References` headers (fetched from the message you are replying to) plus the Gmail `threadId`,
so they stay in the same conversation in Gmail. As everywhere in the app, nothing is sent
without your confirmation and every send is written to the audit log.

## Troubleshooting

- `access_denied` during consent → your Google account is not listed as a *test user*.
- `redirect_uri_mismatch` → the URI on the OAuth client must match Settings exactly
  (`https://butler.conforcus.com/api/auth/google/callback` in production).
- `invalid_grant` on refresh → the refresh token was revoked (e.g. password change); remove and reconnect the account.
- Calendar events missing → the Calendar API is not enabled in the Cloud project or `GOOGLE_CALENDAR=false`.
