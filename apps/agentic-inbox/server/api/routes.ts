import type { BunRequest } from "bun";
import type { AgentContext, AppStatus } from "../../shared/types.ts";
import { env } from "../env.ts";
import { isDemoMode } from "../bootstrap.ts";
import {
  accounts,
  audit,
  chats,
  events,
  meetings,
  notifications,
  people,
  settings,
  spaces,
  threads,
} from "../db/repo.ts";
import { syncAccount, syncAll } from "../sync/engine.ts";
import { sendChat, sendReply } from "../services/messaging.ts";
import { llmStatus, runAgent } from "../agent/index.ts";
import { agentStream, broadcast, sseResponse } from "./events.ts";
import { authRoutes } from "./auth.ts";
import { featureRoutes } from "./features.ts";
import { badRequest, h, notFound, num, ok, query, readJson, spaceParam } from "./util.ts";

type P<T extends string> = BunRequest<T>;

export const routes = {
  ...authRoutes,
  ...featureRoutes,
  "/api/health": h(() => ok({ ok: true })),

  "/api/status": h(() => {
    const status: AppStatus = {
      spaces: spaces.all(),
      accounts: accounts.all(),
      llm: llmStatus(),
      oauth: { microsoft: !!env.microsoft.clientId, google: !!env.google.clientId && !!env.google.clientSecret },
      demoMode: isDemoMode(),
      unreadNotifications: notifications.unreadCount(null),
    };
    return ok(status);
  }),

  "/api/events-stream": h(() => sseResponse()),

  /* ---------- spaces ---------- */
  "/api/spaces": h(() => ok(spaces.all())),
  "/api/spaces/:id": {
    PATCH: h(async (req: P<"/api/spaces/:id">) => {
      const current = spaces.get(req.params.id) ?? notFound("Space not found");
      const patch = await readJson<Partial<typeof current>>(req);
      spaces.upsert({ ...current, ...patch, id: current.id, kind: current.kind });
      return ok(spaces.get(current.id));
    }),
  },

  /* ---------- accounts & sync ---------- */
  "/api/accounts": h(() => ok(accounts.all())),
  "/api/accounts/:id": {
    PATCH: h(async (req: P<"/api/accounts/:id">) => {
      const account = accounts.get(req.params.id) ?? notFound("Account not found");
      const body = await readJson<{ spaceId?: string }>(req);
      if (body.spaceId) {
        if (!spaces.get(body.spaceId)) badRequest("Unknown space");
        accounts.setSpace(account.id, body.spaceId);
        audit.log({ spaceId: body.spaceId, actor: "user", action: "account.move", detail: account.email });
      }
      broadcast({ type: "data", entity: "accounts", spaceId: null });
      return ok(accounts.get(account.id));
    }),
    DELETE: h((req: P<"/api/accounts/:id">) => {
      const account = accounts.get(req.params.id) ?? notFound("Account not found");
      accounts.remove(account.id);
      if (account.provider === "demo" && !accounts.all().some((a) => a.provider === "demo")) {
        settings.set("demo_removed", "1");
      }
      audit.log({ spaceId: account.spaceId, actor: "user", action: "account.remove", detail: account.email });
      broadcast({ type: "data", entity: "accounts", spaceId: null });
      return ok({ ok: true });
    }),
  },
  "/api/accounts/:id/sync": {
    POST: h(async (req: P<"/api/accounts/:id/sync">) => {
      const account = accounts.get(req.params.id) ?? notFound("Account not found");
      const stats = await syncAccount(account, { full: query(req).get("full") === "1" });
      return ok(stats);
    }),
  },
  "/api/sync": { POST: h(async () => ok(await syncAll())) },

  /* ---------- mail ---------- */
  "/api/threads": h((req) => {
    const q = query(req);
    return ok(
      threads.list(spaceParam(req), {
        query: q.get("q") ?? undefined,
        since: q.get("since") ? num(q.get("since"), 0) : undefined,
        limit: num(q.get("limit"), 200),
      }),
    );
  }),
  "/api/threads/:id": h((req: P<"/api/threads/:id">) => ok(threads.get(req.params.id) ?? notFound("Thread not found"))),
  "/api/threads/:id/read": {
    POST: h(async (req: P<"/api/threads/:id/read">) => {
      const body = await readJson<{ unread?: boolean }>(req).catch(() => ({}) as { unread?: boolean });
      threads.markRead(req.params.id, body.unread ?? false);
      return ok({ ok: true });
    }),
  },
  "/api/threads/:id/reply": {
    POST: h(async (req: P<"/api/threads/:id/reply">) => {
      const body = await readJson<{ body: string; actor?: "user" | "agent" }>(req);
      if (!body.body?.trim()) badRequest("Empty reply");
      const message = await sendReply(req.params.id, body.body.trim(), body.actor === "agent" ? "agent" : "user");
      return ok(message);
    }),
  },

  /* ---------- calendar ---------- */
  "/api/events": h((req) => {
    const q = query(req);
    const now = Date.now();
    return ok(events.list(spaceParam(req), num(q.get("from"), now - 7 * 86_400_000), num(q.get("to"), now + 14 * 86_400_000)));
  }),
  "/api/events/:id": h((req: P<"/api/events/:id">) => ok(events.get(req.params.id) ?? notFound("Event not found"))),

  /* ---------- chats ---------- */
  "/api/chats": h((req) => ok(chats.list(spaceParam(req), query(req).get("q") ?? undefined))),
  "/api/chats/:id": h((req: P<"/api/chats/:id">) => {
    const chat = chats.get(req.params.id) ?? notFound("Chat not found");
    return ok({ ...chat, messages: chats.messages(chat.id) });
  }),
  "/api/chats/:id/read": {
    POST: h((req: P<"/api/chats/:id/read">) => {
      chats.markRead(req.params.id);
      return ok({ ok: true });
    }),
  },
  "/api/chats/:id/send": {
    POST: h(async (req: P<"/api/chats/:id/send">) => {
      const body = await readJson<{ body: string; actor?: "user" | "agent"; replyToId?: string | null }>(req);
      if (!body.body?.trim()) badRequest("Empty message");
      return ok(await sendChat(req.params.id, body.body.trim(), body.actor === "agent" ? "agent" : "user", body.replyToId ?? null));
    }),
  },

  /* ---------- meetings ---------- */
  "/api/meetings": h((req) => ok(meetings.list(spaceParam(req)))),
  "/api/meetings/:id": h((req: P<"/api/meetings/:id">) => {
    const m = meetings.get(req.params.id) ?? notFound("Meeting not found");
    return ok({ ...m, transcript: meetings.transcript(m.id)?.lines ?? null });
  }),

  /* ---------- people ---------- */
  "/api/people": h((req) => ok(people.list(spaceParam(req)))),

  /* ---------- notifications ---------- */
  "/api/notifications": h((req) => ok(notifications.list(spaceParam(req)))),
  "/api/notifications/read": {
    POST: h(async (req) => {
      const body = await readJson<{ id?: string }>(req).catch(() => ({}) as { id?: string });
      if (body.id) notifications.markRead(body.id);
      else notifications.markAllRead(spaceParam(req));
      return ok({ ok: true });
    }),
  },

  /* ---------- audit ---------- */
  "/api/audit": h(() => ok(audit.list(200))),

  /* ---------- agent ---------- */
  "/api/agent": {
    POST: h(async (req) => {
      const body = await readJson<{ input: string; context: Partial<AgentContext> }>(req);
      if (!body.input?.trim()) badRequest("Empty input");
      const ctx: AgentContext = {
        spaceId: body.context?.spaceId ?? null,
        selectedThreadId: body.context?.selectedThreadId ?? null,
        selectedChatId: body.context?.selectedChatId ?? null,
        selectedEventId: body.context?.selectedEventId ?? null,
      };
      return agentStream(async (emit) => {
        for await (const ev of runAgent(body.input.trim(), ctx)) emit(ev);
      });
    }),
  },
};
