/**
 * Server-sent events fan-out. The client keeps one EventSource open and
 * refreshes views when a sync finishes or a notification arrives.
 */

import { viewerEmail } from "../auth/scope.ts";
import { accounts, spaces } from "../db/repo.ts";

export type ServerEvent =
  | { type: "sync"; accountId: string; spaceId: string; stats?: unknown; error?: string }
  | { type: "notification"; spaceId: string | null; title: string; ownerEmail?: string }
  | { type: "data"; entity: string; spaceId: string | null };

type LiveClient = {
  email: string | null;
  enqueue: (chunk: Uint8Array) => void;
};

const clients = new Set<LiveClient>();
const encoder = new TextEncoder();

/** Login-off demo sees every event. Otherwise a title reaches only its owner, or a shared Work space the viewer belongs to. */
export function deliversNotification(viewer: string | null, event: { spaceId: string | null; ownerEmail?: string }): boolean {
  if (viewer == null) return true;
  const owner = (event.ownerEmail || "").toLowerCase();
  if (owner) return owner === viewer.toLowerCase();
  if (!event.spaceId || spaces.get(event.spaceId)?.kind !== "work") return false;
  return accounts.ownedBy(viewer).some((a) => a.spaceId === event.spaceId);
}

export function broadcast(event: ServerEvent): void {
  const payload = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  for (const c of clients) {
    if (event.type === "notification" && !deliversNotification(c.email, event)) continue;
    try {
      c.enqueue(payload);
    } catch {
      clients.delete(c);
    }
  }
}

export function sseResponse(req: Request): Response {
  const email = viewerEmail(req);
  let client!: LiveClient;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      client = {
        email,
        enqueue: (chunk) => controller.enqueue(chunk),
      };
      clients.add(client);
      controller.enqueue(encoder.encode(`: connected\n\n`));
      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clients.delete(client);
          if (keepAlive) clearInterval(keepAlive);
        }
      }, 10_000);
    },
    cancel() {
      clients.delete(client);
      if (keepAlive) clearInterval(keepAlive);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export function agentStream(run: (emit: (event: unknown) => void) => Promise<void>): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      const emit = (event: unknown) => c.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        await run(emit);
      } catch (err) {
        emit({ kind: "error", text: err instanceof Error ? err.message : String(err) });
      } finally {
        emit({ kind: "done" });
        c.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
