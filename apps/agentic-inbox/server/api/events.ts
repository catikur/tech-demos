/**
 * Server-sent events fan-out. The client keeps one EventSource open and
 * refreshes views when a sync finishes or a notification arrives.
 */

export type ServerEvent =
  | { type: "sync"; accountId: string; spaceId: string; stats?: unknown; error?: string }
  | { type: "notification"; spaceId: string | null; title: string }
  | { type: "data"; entity: string; spaceId: string | null };

const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
const encoder = new TextEncoder();

export function broadcast(event: ServerEvent): void {
  const payload = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  for (const c of clients) {
    try {
      c.enqueue(payload);
    } catch {
      clients.delete(c);
    }
  }
}

export function sseResponse(): Response {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      clients.add(c);
      c.enqueue(encoder.encode(`: connected\n\n`));
      keepAlive = setInterval(() => {
        try {
          c.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clients.delete(c);
          if (keepAlive) clearInterval(keepAlive);
        }
      }, 10_000);
    },
    cancel() {
      clients.delete(controller);
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
