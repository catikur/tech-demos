export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as T & { error?: string };
  if (res.status === 401) throw new ApiError(data.error || "Giriş gerekli", 401);
  if (!res.ok) throw new ApiError(data.error || `${res.status} ${path}`, res.status);
  return data;
}

export async function readSse(
  path: string,
  body: unknown,
  onEvent: (event: string, data: unknown) => void,
): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      message = data.error || message;
    } catch {
      message = await res.text();
    }
    throw new ApiError(message, res.status);
  }
  if (!res.body) throw new Error("No stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const ev = part.match(/^event: (.+)$/m)?.[1];
      const dataLine = part.match(/^data: (.*)$/m)?.[1];
      if (!ev || dataLine == null) continue;
      const data = JSON.parse(dataLine);
      if (ev === "error") throw new Error((data as { message?: string }).message || "debate failed");
      onEvent(ev, data);
    }
  }
}
