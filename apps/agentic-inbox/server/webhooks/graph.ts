import type { Account } from "../../shared/types.ts";
import { env } from "../env.ts";
import { accounts, graphSubscriptions, settings, type GraphSubscriptionRow } from "../db/repo.ts";
import { GraphClient, GraphError } from "../connectors/m365.ts";
import { syncAccount } from "../sync/engine.ts";

export { graphSubscriptions as subscriptionsRepo } from "../db/repo.ts";

/** Mail/calendar max is ~4230 minutes; stay a little under. Chats are typically ~60 minutes. */
const MAIL_TTL_MS = 4200 * 60_000;
const CHAT_TTL_MS = 55 * 60_000;
const RENEW_BEFORE_MS = 12 * 3_600_000;
const DEFAULT_DEBOUNCE_MS = 2_000;
const SECRET_KEY = "graph_webhook_secret";

type SyncHook = (accountId: string) => void | Promise<void>;

let syncHook: SyncHook | null = null;
let debounceMs = DEFAULT_DEBOUNCE_MS;
const pendingSync = new Map<string, ReturnType<typeof setTimeout>>();

export function setGraphWebhookHooks(opts: { sync?: SyncHook | null; debounceMs?: number } = {}): void {
  if ("sync" in opts) syncHook = opts.sync ?? null;
  if (opts.debounceMs !== undefined) debounceMs = opts.debounceMs;
}

/** Push is only useful when Graph can reach a public HTTPS notification URL. */
export function graphPushEnabled(): boolean {
  const base = (process.env.APP_BASE_URL ?? env.baseUrl).replace(/\/$/, "");
  return base.startsWith("https://") && !/localhost|127\.0\.0\.1/i.test(base);
}

function notificationUrl(): string {
  const base = (process.env.APP_BASE_URL ?? env.baseUrl).replace(/\/$/, "");
  return `${base}/api/webhooks/graph`;
}

export function webhookSecret(): string {
  const fromEnv = process.env.GRAPH_WEBHOOK_SECRET ?? env.graphWebhookSecret;
  if (fromEnv) return fromEnv.slice(0, 128);
  const existing = settings.get(SECRET_KEY);
  if (existing) return existing;
  const generated = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 64);
  settings.set(SECRET_KEY, generated);
  return generated;
}

interface GraphNotification {
  subscriptionId?: string;
  clientState?: string;
  changeType?: string;
  resource?: string;
  resourceData?: unknown;
  lifecycleEvent?: "reauthorizationRequired" | "missed" | "subscriptionRemoved" | string;
}

interface ResourceSpec {
  resource: string;
  ttlMs: number;
  fallback?: string;
}

const RESOURCES: ResourceSpec[] = [
  { resource: "/me/mailFolders('inbox')/messages", ttlMs: MAIL_TTL_MS },
  { resource: "/me/events", ttlMs: MAIL_TTL_MS },
  // Prefer getAllMessages; /me/chats is a fallback. Skip channels (needs application permissions).
  { resource: "/me/chats/getAllMessages", ttlMs: CHAT_TTL_MS, fallback: "/me/chats" },
];

export async function handleGraphWebhook(req: Request): Promise<Response> {
  try {
    const token = new URL(req.url).searchParams.get("validationToken");
    if (token !== null) {
      return new Response(token, { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    let payload: { value?: GraphNotification[] };
    try {
      payload = (await req.json()) as { value?: GraphNotification[] };
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    const notes = Array.isArray(payload.value) ? payload.value : [];
    const globalSecret = webhookSecret();
    for (const n of notes) {
      const stored = n.subscriptionId ? graphSubscriptions.get(n.subscriptionId) : null;
      const expected = stored?.clientState ?? globalSecret;
      if (!n.clientState || n.clientState !== expected) {
        return new Response("clientState mismatch", { status: 401 });
      }
    }

    for (const n of notes) {
      const sub = n.subscriptionId ? graphSubscriptions.get(n.subscriptionId) : null;
      if (!sub) continue;
      if (n.lifecycleEvent) {
        if (n.lifecycleEvent === "missed") scheduleSync(sub.accountId);
        if (
          n.lifecycleEvent === "reauthorizationRequired" ||
          n.lifecycleEvent === "missed" ||
          n.lifecycleEvent === "subscriptionRemoved"
        ) {
          void recreateSubscription(sub).catch((err) =>
            console.warn(`[graph-webhook] recreate ${sub.resource} failed: ${describe(err)}`),
          );
        }
        continue;
      }
      scheduleSync(sub.accountId);
    }

    return new Response("", { status: 202 });
  } catch (err) {
    console.error("[graph-webhook] handler failed:", err);
    return new Response("webhook error", { status: 500 });
  }
}

export async function ensureSubscriptions(account: Account): Promise<void> {
  if (!graphPushEnabled() || account.provider !== "m365") return;
  const client = new GraphClient(account.id);
  const secret = webhookSecret();
  const existing = graphSubscriptions.byAccount(account.id);
  for (const spec of RESOURCES) {
    const current = existing.find((s) => resourceMatches(s.resource, spec));
    const ttl = spec.ttlMs;
    if (current && current.expiresAt - Date.now() > renewWindow(ttl)) continue;
    if (current && current.expiresAt > Date.now()) {
      const patched = await patchExpiration(client, current, ttl).catch((err) => {
        console.warn(`[graph-webhook] PATCH ${current.resource} failed: ${describe(err)}`);
        return false as const;
      });
      if (patched) continue;
    }
    await subscribeResource(client, account, spec, secret);
  }
}

export async function renewExpiringSubscriptions(): Promise<void> {
  if (!graphPushEnabled()) return;
  for (const account of accounts.all()) {
    if (account.provider !== "m365") continue;
    await ensureSubscriptions(account).catch((err) =>
      console.warn(`[graph-webhook] ensure ${account.email} failed: ${describe(err)}`),
    );
  }
}

function scheduleSync(accountId: string): void {
  const run = () => {
    pendingSync.delete(accountId);
    void fireSync(accountId).catch((err) => console.error(`[graph-webhook] sync ${accountId} failed:`, err));
  };
  if (debounceMs <= 0) {
    run();
    return;
  }
  const prev = pendingSync.get(accountId);
  if (prev) clearTimeout(prev);
  pendingSync.set(accountId, setTimeout(run, debounceMs));
}

async function fireSync(accountId: string): Promise<void> {
  if (syncHook) {
    await syncHook(accountId);
    return;
  }
  const account = accounts.get(accountId);
  if (!account) return;
  await syncAccount(account);
}

async function recreateSubscription(sub: GraphSubscriptionRow): Promise<void> {
  const account = accounts.get(sub.accountId);
  graphSubscriptions.remove(sub.id);
  if (!account || !graphPushEnabled()) return;
  const client = new GraphClient(account.id);
  await client.request(`/subscriptions/${encodeURIComponent(sub.id)}`, { method: "DELETE" }).catch(() => undefined);
  const spec = RESOURCES.find((s) => resourceMatches(sub.resource, s)) ?? {
    resource: sub.resource,
    ttlMs: ttlFor(sub.resource),
  };
  await subscribeResource(client, account, spec, webhookSecret());
}

async function subscribeResource(client: GraphClient, account: Account, spec: ResourceSpec, secret: string): Promise<void> {
  const candidates = spec.fallback ? [spec.resource, spec.fallback] : [spec.resource];
  for (const resource of candidates) {
    try {
      const created = await createSubscription(client, resource, spec.ttlMs, secret);
      for (const old of graphSubscriptions.byAccount(account.id)) {
        if (old.id === created.id || !resourceMatches(old.resource, spec)) continue;
        await client.request(`/subscriptions/${encodeURIComponent(old.id)}`, { method: "DELETE" }).catch(() => undefined);
        graphSubscriptions.remove(old.id);
      }
      graphSubscriptions.upsert({
        id: created.id,
        accountId: account.id,
        resource: created.resource ?? resource,
        clientState: secret,
        expiresAt: Date.parse(created.expirationDateTime) || Date.now() + spec.ttlMs,
      });
      return;
    } catch (err) {
      if (err instanceof GraphError && (err.status === 400 || err.status === 403)) {
        console.warn(`[graph-webhook] skip ${resource} for ${account.email}: ${err.message}`);
        continue;
      }
      console.warn(`[graph-webhook] subscribe ${resource} for ${account.email} failed: ${describe(err)}`);
      return;
    }
  }
}

async function createSubscription(
  client: GraphClient,
  resource: string,
  ttlMs: number,
  secret: string,
): Promise<{ id: string; resource?: string; expirationDateTime: string }> {
  return await client.request("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      changeType: "created,updated,deleted",
      notificationUrl: notificationUrl(),
      lifecycleNotificationUrl: notificationUrl(),
      resource,
      expirationDateTime: new Date(Date.now() + ttlMs).toISOString(),
      clientState: secret,
    }),
  });
}

async function patchExpiration(client: GraphClient, sub: GraphSubscriptionRow, ttlMs: number): Promise<boolean> {
  const expirationDateTime = new Date(Date.now() + ttlMs).toISOString();
  const updated = await client.request<{ expirationDateTime?: string }>(`/subscriptions/${encodeURIComponent(sub.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ expirationDateTime }),
  });
  graphSubscriptions.upsert({
    ...sub,
    expiresAt: Date.parse(updated?.expirationDateTime ?? expirationDateTime) || Date.now() + ttlMs,
  });
  return true;
}

function resourceMatches(resource: string, spec: ResourceSpec): boolean {
  return resource === spec.resource || (spec.fallback !== undefined && resource === spec.fallback);
}

function renewWindow(ttlMs: number): number {
  // Mail/events: 12h. Short-lived chat subs (~60m): renew when under 15 minutes remain.
  return Math.min(RENEW_BEFORE_MS, Math.max(15 * 60_000, Math.floor(ttlMs * 0.25)));
}

function ttlFor(resource: string): number {
  return /chat/i.test(resource) ? CHAT_TTL_MS : MAIL_TTL_MS;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
