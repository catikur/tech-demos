import type { AgentContext, AgentEvent } from "../../shared/types.ts";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function spaceQuery(spaceId: string | null): string {
  return `space=${spaceId ?? "all"}`;
}

/** Stream agent events for one question. Resolves when the server sends `done`. */
export async function askAgent(
  input: string,
  context: AgentContext,
  onEvent: (ev: AgentEvent) => void,
): Promise<void> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, context }),
  });
  if (!res.ok || !res.body) throw new Error(`Agent request failed (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const ev = JSON.parse(line.slice(6)) as AgentEvent;
        onEvent(ev);
        if (ev.kind === "done") return;
      }
    }
  }
}

export type ServerEvent =
  | { type: "sync"; accountId: string; spaceId: string; error?: string }
  | { type: "notification"; spaceId: string | null; title: string }
  | { type: "data"; entity: string; spaceId: string | null };

/** One shared EventSource; listeners are notified about server-side changes. */
const listeners = new Set<(ev: ServerEvent) => void>();
let source: EventSource | null = null;

export function subscribe(listener: (ev: ServerEvent) => void): () => void {
  listeners.add(listener);
  if (!source) {
    source = new EventSource("/api/events-stream");
    source.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as ServerEvent;
        listeners.forEach((l) => l(ev));
      } catch {
        /* ignore keepalives */
      }
    };
  }
  return () => {
    listeners.delete(listener);
  };
}
