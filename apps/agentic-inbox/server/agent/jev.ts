import { llmConfig } from "./config.ts";

/**
 * OpenRouter Decisions API client for TypeSafe Jev.
 * Jev is not a chat model: it answers Choice / Score / Noul questions about a
 * state and returns probabilities. Prose stays on the OpenRouter chat model.
 */

export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "score"; instructions: string; criteria: string[] };

export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface JevNoulAnswer {
  type: "noul";
  noul: number;
}

export interface JevScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
}

export type JevAnswer = JevChoiceAnswer | JevNoulAnswer | JevScoreAnswer;

type JevFetch = (url: string, init: RequestInit) => Promise<Response>;

let testTransport: JevFetch | null = null;

/** Tests inject a fake Decisions endpoint without touching the process-wide API key. */
export function setJevTransportForTests(transport: JevFetch | null): void {
  testTransport = transport;
}

export function jevModel(): string {
  return process.env.JEV_MODEL?.trim() || "typesafe/jev-1.13";
}

/** Map the chat base URL onto the Decisions API. A non-v1 base (tests) uses `/decisions`. */
export function decisionsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  if (base.endsWith("/api/v1")) return base.replace(/\/api\/v1$/, "/api/alpha/decisions");
  return `${base}/decisions`;
}

export function jevEnabled(): boolean {
  if (testTransport) return true;
  const cfg = llmConfig();
  return cfg.provider !== "mock" && Boolean(cfg.apiKey);
}

const TIMEOUT_MS = 5_000;

export async function jevDecide(
  state: unknown,
  questions: Record<string, JevQuestion>,
): Promise<Record<string, JevAnswer> | null> {
  if (!jevEnabled()) return null;
  const cfg = llmConfig();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const fetcher = testTransport ?? fetch;
    const res = await fetcher(decisionsUrl(cfg.baseUrl), {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey ?? "test"}`,
        "HTTP-Referer": cfg.siteUrl,
        "X-Title": cfg.appName,
      },
      body: JSON.stringify({ model: jevModel(), state, questions }),
    });
    if (!res.ok) {
      console.warn(`[jev] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as { answers?: Record<string, JevAnswer> };
    if (!data.answers || typeof data.answers !== "object") return null;
    return data.answers;
  } catch (err) {
    console.warn(`[jev] decision failed: ${err instanceof Error ? err.message : err}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function asChoice(answer: JevAnswer | undefined): JevChoiceAnswer | null {
  if (!answer || answer.type !== "choice" || typeof answer.choice !== "string") return null;
  return answer;
}

export function asNoul(answer: JevAnswer | undefined): number | null {
  if (!answer || answer.type !== "noul" || typeof answer.noul !== "number") return null;
  return answer.noul;
}

export function asScore(answer: JevAnswer | undefined): JevScoreAnswer | null {
  if (!answer || answer.type !== "score" || typeof answer.score !== "number") return null;
  return answer;
}
