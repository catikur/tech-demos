import { existsSync } from "node:fs";
import { join } from "node:path";
import { diffTickers } from "../src/shared/screen";
import { timeframeById } from "../src/shared/forecast";
import type { AutoresearchProposal } from "../src/shared/types";
import { currentVenue } from "./bybit";
import {
  agentMarkRows,
  agentScore,
  deleteAgent,
  exportBundle,
  getAgent,
  getDebate,
  getSettings,
  getWeights,
  lastLlmError,
  lastMarkedAt,
  listAgents,
  listCommits,
  listDebates,
  listEquity,
  listEvents,
  listScreenRuns,
  listTakes,
  latestDebate,
  nextDueAt,
  pendingProposal as loadPending,
  resetBook,
  resolveApiKey,
  saveSettings,
  screenTickers,
  setApiKeyOverride,
  upsertAgent,
  weightSeries,
} from "./db";
import { runDeskDebate } from "./desk";
import { loadForecastChart } from "./forecast";
import { fetchBriefing } from "./market";
import { listModels } from "./openrouter";
import { bookDebate, closePos, snapshotBook } from "./paper";
import { nextScreenAt, startScheduler } from "./scheduler";
import { markSession, proposeAutoresearch, resolveAutoresearch } from "./scoring";
import { runScreen } from "./screen";
import {
  clientIp,
  isAuthed,
  maskKeyPublic,
  publicErrorMessage,
  rateLimit,
  readJsonLimit,
  safeStaticPath,
  sanitizeTicker,
  securityHeaders,
  sessionClearCookie,
  sessionSetCookie,
  timingSafeEqual,
} from "./security";

const PORT = Number(process.env.PORT || process.env.ATLAS_API_PORT || 5200);
const HOST = process.env.HOST || "0.0.0.0";
const DIST = join(import.meta.dir, "..", "dist");
const SERVE_WEB = existsSync(join(DIST, "index.html"));
const AUTH_TOKEN = process.env.ATLAS_AUTH_TOKEN?.trim() || null;

if (process.env.NODE_ENV === "production" && !AUTH_TOKEN) {
  console.error("ATLAS_AUTH_TOKEN is required in production");
  process.exit(1);
}

let debateBusy = false;

function mime(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function headers(extra?: Record<string, string>, json = false) {
  return { ...securityHeaders(json), ...extra };
}

async function serveStatic(pathname: string): Promise<Response | null> {
  if (!SERVE_WEB) return null;
  const filePath = safeStaticPath(DIST, pathname);
  if (!filePath) return new Response("Forbidden", { status: 403, headers: headers() });
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file, { headers: headers({ "Content-Type": mime(filePath) }) });
  }
  const indexPath = safeStaticPath(DIST, "/");
  if (!indexPath) return new Response("Forbidden", { status: 403, headers: headers() });
  const index = Bun.file(indexPath);
  return new Response(index, { headers: headers({ "Content-Type": "text/html; charset=utf-8" }) });
}

function json(data: unknown, status = 200, extra?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: headers(extra, true),
  });
}

function fail(message: string, status = 400) {
  return json({ error: message }, status);
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  return readJsonLimit(text);
}

function cookieSecure(req: Request): boolean {
  const pub = process.env.PUBLIC_URL || "";
  if (pub.startsWith("https:")) return true;
  return req.headers.get("x-forwarded-proto") === "https";
}

function gate(req: Request, pathname: string): Response | null {
  if (!AUTH_TOKEN) return null;
  if (pathname === "/api/health" || pathname === "/api/login" || pathname === "/api/logout") return null;
  if (!pathname.startsWith("/api/")) return null;
  if (isAuthed(req, AUTH_TOKEN)) return null;
  return fail("Unauthorized", 401);
}

function sse(send: (emit: (event: string, data: unknown) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        await send(emit);
      } catch (err) {
        emit("error", { message: publicErrorMessage(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    }),
  });
}

function statusCard() {
  const settings = getSettings();
  return {
    venue: currentVenue(),
    openRouter: Boolean(resolveApiKey()),
    lastLlmError: lastLlmError(),
    lastMark: lastMarkedAt(),
    nextDue: nextDueAt(),
    schedule: settings.screenSchedule,
    nextScreen: nextScreenAt(settings),
  };
}

async function statePayload() {
  const settings = getSettings();
  const book = await snapshotBook();
  const pending: AutoresearchProposal | null = loadPending();
  return {
    settings,
    keyConfigured: Boolean(resolveApiKey()),
    keyMasked: maskKeyPublic(resolveApiKey()),
    agents: listAgents(),
    weights: getWeights(),
    commits: listCommits(),
    book,
    pendingProposal: pending,
    latest: latestDebate(),
    equity: listEquity(120),
    events: listEvents(40),
    nextDue: nextDueAt(),
    status: statusCard(),
  };
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    const blocked = gate(req, url.pathname);
    if (blocked) return blocked;

    try {
      if (url.pathname === "/api/health") {
        return json({ ok: true });
      }

      if (url.pathname === "/api/login" && req.method === "POST") {
        if (!AUTH_TOKEN) return json({ ok: true, auth: false });
        const ip = clientIp(req);
        if (!rateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) return fail("Too many login attempts", 429);
        const body = await readBody(req);
        const submitted = String(body.token ?? body.password ?? "");
        if (!submitted || !timingSafeEqual(submitted, AUTH_TOKEN)) return fail("Unauthorized", 401);
        return json({ ok: true }, 200, { "Set-Cookie": sessionSetCookie(AUTH_TOKEN, cookieSecure(req)) });
      }

      if (url.pathname === "/api/logout" && req.method === "POST") {
        return json({ ok: true }, 200, { "Set-Cookie": sessionClearCookie(cookieSecure(req)) });
      }

      if (url.pathname === "/api/state" && req.method === "GET") {
        return json(await statePayload());
      }

      if (url.pathname === "/api/status" && req.method === "GET") {
        return json(statusCard());
      }

      if (url.pathname === "/api/events" && req.method === "GET") {
        return json({ events: listEvents(80) });
      }

      if (url.pathname === "/api/equity" && req.method === "GET") {
        return json({ equity: listEquity(180) });
      }

      if (url.pathname === "/api/export" && req.method === "GET") {
        return json(exportBundle());
      }

      if (url.pathname === "/api/settings" && req.method === "GET") {
        return json({
          settings: getSettings(),
          keyConfigured: Boolean(resolveApiKey()),
          keyMasked: maskKeyPublic(resolveApiKey()),
        });
      }

      if (url.pathname === "/api/settings" && req.method === "PUT") {
        const body = await readBody(req);
        delete body.openrouterBaseUrl;
        if (typeof body.apiKey === "string") {
          setApiKeyOverride(body.apiKey.trim() || null);
          delete body.apiKey;
        }
        const settings = saveSettings(body);
        return json({
          settings,
          keyConfigured: Boolean(resolveApiKey()),
          keyMasked: maskKeyPublic(resolveApiKey()),
        });
      }

      if (url.pathname === "/api/models" && req.method === "GET") {
        const key = resolveApiKey();
        if (!key) return fail("OPENROUTER_API_KEY missing", 400);
        const ip = clientIp(req);
        if (!rateLimit(`models:${ip}`, 30, 60 * 60 * 1000)) return fail("Too many requests", 429);
        return json({ models: await listModels(getSettings(), key) });
      }

      if (url.pathname === "/api/briefing" && req.method === "GET") {
        const ticker = sanitizeTicker(String(url.searchParams.get("ticker") ?? ""));
        if (!ticker) return fail("Invalid ticker");
        const ip = clientIp(req);
        if (!rateLimit(`briefing:${ip}`, 60, 60 * 60 * 1000)) return fail("Too many requests", 429);
        const briefing = await fetchBriefing(ticker, getSettings());
        return json({ briefing, cap: briefing.regime });
      }

      if (url.pathname === "/api/chart" && req.method === "GET") {
        const symbol = sanitizeTicker(String(url.searchParams.get("symbol") ?? ""));
        if (!symbol) return fail("Invalid ticker");
        const rawInterval = url.searchParams.get("interval");
        if (rawInterval && !timeframeById(rawInterval)) return fail("Invalid interval");
        const ip = clientIp(req);
        if (!rateLimit(`chart:${ip}`, 60, 60 * 60 * 1000)) return fail("Too many requests", 429);
        const chart = await loadForecastChart(symbol, getSettings(), rawInterval ?? undefined);
        return json({ chart });
      }

      if (url.pathname === "/api/screen" && req.method === "POST") {
        const ip = clientIp(req);
        if (!rateLimit(`screen:${ip}`, 30, 60 * 60 * 1000)) return fail("Too many requests", 429);
        const body = await readBody(req);
        const theme = String(body.theme ?? "").trim();
        const key = resolveApiKey();
        return json(
          await runScreen(getSettings(), key, theme, {
            universe: body.universe,
            bybitClass: body.bybitClass,
          }),
        );
      }

      if (url.pathname === "/api/screens" && req.method === "GET") {
        return json({ runs: listScreenRuns(30) });
      }

      if (url.pathname === "/api/screens/diff" && req.method === "GET") {
        const a = Number(url.searchParams.get("a"));
        const b = Number(url.searchParams.get("b"));
        if (!a || !b) return fail("run ids required");
        return json(diffTickers(screenTickers(a), screenTickers(b)));
      }

      if (url.pathname === "/api/debates" && req.method === "GET") {
        const limit = Math.min(80, Math.max(1, Number(url.searchParams.get("limit") ?? 40) || 40));
        const ticker = sanitizeTicker(String(url.searchParams.get("ticker") ?? "")) ?? undefined;
        return json({ debates: listDebates(limit, ticker || undefined) });
      }

      const debateMatch = url.pathname.match(/^\/api\/debates\/(\d+)$/);
      if (debateMatch && req.method === "GET") {
        const debate = getDebate(Number(debateMatch[1]));
        if (!debate) return fail("Debate not found", 404);
        return json({ debate, takes: listTakes(debate.id) });
      }

      const cardMatch = url.pathname.match(/^\/api\/agents\/([a-z0-9-]+)\/card$/);
      if (cardMatch && req.method === "GET") {
        const agent = getAgent(cardMatch[1]);
        if (!agent) return fail("Invalid agent", 404);
        const score = agentScore(agent.id);
        return json({
          agent,
          weight: getWeights()[agent.id] ?? agent.baseWeight,
          hitRate: score.n ? score.hits / score.n : 0,
          avgContribution: score.avg,
          n: score.n,
          takes: agentMarkRows(agent.id),
          series: weightSeries(agent.id),
        });
      }

      const agentDelete = url.pathname.match(/^\/api\/agents\/([a-z0-9-]+)$/);
      if (agentDelete && req.method === "DELETE") {
        deleteAgent(agentDelete[1]);
        return json({ agents: listAgents() });
      }

      if (url.pathname === "/api/agents" && req.method === "PUT") {
        const ip = clientIp(req);
        if (!rateLimit(`agents:${ip}`, 40, 60 * 60 * 1000)) return fail("Too many requests", 429);
        const body = await readBody(req);
        const agent = upsertAgent({
          id: String(body.id ?? ""),
          name: typeof body.name === "string" ? body.name : undefined,
          role: typeof body.role === "string" ? body.role : undefined,
          layer: typeof body.layer === "string" ? body.layer : undefined,
          emoji: typeof body.emoji === "string" ? body.emoji : undefined,
          prompt: typeof body.prompt === "string" ? body.prompt : undefined,
          kind: typeof body.kind === "string" ? body.kind : undefined,
          surfaces: typeof body.surfaces === "string" ? body.surfaces : undefined,
          enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
          baseWeight: typeof body.baseWeight === "number" ? body.baseWeight : undefined,
        });
        return json({ agent, agents: listAgents() });
      }

      if (url.pathname === "/api/debate" && req.method === "POST") {
        const key = resolveApiKey();
        if (!key) return fail("OPENROUTER_API_KEY missing — set it in Settings or the environment", 400);
        const ip = clientIp(req);
        if (!rateLimit(`debate:${ip}`, 8, 60 * 60 * 1000)) return fail("Too many requests", 429);
        if (debateBusy) return fail("A debate is already running", 429);
        const body = await readBody(req);
        const ticker = sanitizeTicker(String(body.ticker ?? ""));
        if (!ticker) return fail("Invalid ticker");
        const settings = getSettings();
        const weights = getWeights();
        debateBusy = true;
        return sse(async (emit) => {
          try {
            await runDeskDebate({ ticker, settings, apiKey: key, weights, emit });
          } finally {
            debateBusy = false;
          }
        });
      }

      if (url.pathname === "/api/debate/batch" && req.method === "POST") {
        const key = resolveApiKey();
        if (!key) return fail("OPENROUTER_API_KEY missing", 400);
        if (debateBusy) return fail("A debate is already running", 429);
        const ip = clientIp(req);
        const body = await readBody(req);
        const tickers = (Array.isArray(body.tickers) ? body.tickers : [])
          .map((t) => sanitizeTicker(String(t ?? "")))
          .filter((t): t is string => Boolean(t))
          .slice(0, 12);
        if (!tickers.length) return fail("Invalid ticker");
        debateBusy = true;
        return sse(async (emit) => {
          try {
            for (let i = 0; i < tickers.length; i++) {
              if (!rateLimit(`debate:${ip}`, 8, 60 * 60 * 1000)) {
                emit("progress", { index: i, ticker: tickers[i], status: "rate-limited", total: tickers.length });
                break;
              }
              emit("progress", { index: i, ticker: tickers[i], status: "start", total: tickers.length });
              const settings = getSettings();
              await runDeskDebate({
                ticker: tickers[i],
                settings,
                apiKey: key,
                weights: getWeights(),
                emit: (event, data) => emit(event, { ...(data as object), batchIndex: i }),
              });
              emit("progress", { index: i, ticker: tickers[i], status: "done", total: tickers.length });
            }
          } finally {
            debateBusy = false;
          }
        });
      }

      if (url.pathname === "/api/book" && req.method === "POST") {
        const body = await readBody(req);
        const debateId = Number(body.debateId);
        if (!debateId) return fail("debateId required");
        const book = await bookDebate(debateId, getSettings());
        return json({ book });
      }

      if (url.pathname === "/api/book/reset" && req.method === "POST") {
        resetBook(getSettings().startingCash);
        return json({ book: await snapshotBook() });
      }

      if (url.pathname.startsWith("/api/positions/") && url.pathname.endsWith("/close") && req.method === "POST") {
        const id = Number(url.pathname.split("/")[3]);
        if (!id) return fail("id required");
        return json({ book: await closePos(id) });
      }

      if (url.pathname === "/api/mark" && req.method === "POST") {
        const marked = await markSession(getSettings());
        return json(marked);
      }

      if (url.pathname === "/api/autoresearch" && req.method === "POST") {
        const key = resolveApiKey();
        if (!key) return fail("OPENROUTER_API_KEY missing", 400);
        const ip = clientIp(req);
        if (!rateLimit(`auto:${ip}`, 4, 60 * 60 * 1000)) return fail("Too many requests", 429);
        const proposal = await proposeAutoresearch(getSettings(), key);
        return json({ proposal });
      }

      if (url.pathname === "/api/autoresearch/resolve" && req.method === "POST") {
        const body = await readBody(req);
        const kind = body.kind === "revert" ? "revert" : "keep";
        resolveAutoresearch(kind, getSettings());
        return json(await statePayload());
      }

      const web = await serveStatic(url.pathname);
      if (web) return web;
      return fail("not found", 404);
    } catch (err) {
      const message = publicErrorMessage(err);
      const client = message !== "Request failed" && message !== "Upstream model request failed";
      return fail(message, client ? 400 : 500);
    }
  },
});

startScheduler();
console.log(`atlas-gic ${SERVE_WEB ? "web+api" : "api"} http://${HOST}:${server.port}${AUTH_TOKEN ? " (gated)" : ""}`);
