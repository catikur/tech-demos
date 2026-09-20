import { existsSync } from "node:fs";
import { join } from "node:path";
import { LAYER_ORDER } from "../src/shared/agents";
import { layerMap, synthesize } from "../src/shared/engine";
import type { AgentTake, AutoresearchProposal, CroResult } from "../src/shared/types";
import {
  getSettings,
  getWeights,
  listAgents,
  listCommits,
  latestDebate,
  resetBook,
  resolveApiKey,
  saveSettings,
  setApiKeyOverride,
} from "./db";
import { persistDebate, runCio, runCro, runLayer } from "./debate";
import { fetchBriefing } from "./market";
import { listModels } from "./openrouter";
import { bookDebate, closePos, snapshotBook } from "./paper";
import { markSession, proposeAutoresearch, resolveAutoresearch } from "./scoring";
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

let pendingProposal: AutoresearchProposal | null = null;
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

async function statePayload() {
  const settings = getSettings();
  const book = await snapshotBook();
  return {
    settings,
    keyConfigured: Boolean(resolveApiKey()),
    keyMasked: maskKeyPublic(resolveApiKey()),
    agents: listAgents(),
    weights: getWeights(),
    commits: listCommits(),
    book,
    pendingProposal,
    latest: latestDebate(),
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
            const briefing = await fetchBriefing(ticker, settings);
            emit("briefing", briefing);
            const takes: AgentTake[] = [];
            for (const layer of LAYER_ORDER) {
              const batch = await runLayer(settings, key, briefing, weights, layer, takes);
              takes.push(...batch);
              emit("layer", { layer, takes: batch });
            }
            const cro: CroResult = await runCro(settings, key, briefing, takes);
            emit("cro", cro);
            const synthesis = synthesize(takes, weights, cro.veto ? 0 : cro.capPct, layerMap());
            const bullets = await runCio(
              settings,
              key,
              briefing,
              takes,
              cro,
              synthesis.direction,
              synthesis.sizePct,
            );
            const { debateId } = persistDebate({ briefing, takes, cro, bullets, weights });
            emit("cio", { debateId, synthesis, bullets, cro, takes, briefing });
            emit("done", { debateId });
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
        const book = await markSession(getSettings());
        return json({ book, weights: getWeights() });
      }

      if (url.pathname === "/api/autoresearch" && req.method === "POST") {
        const key = resolveApiKey();
        if (!key) return fail("OPENROUTER_API_KEY missing", 400);
        const ip = clientIp(req);
        if (!rateLimit(`auto:${ip}`, 4, 60 * 60 * 1000)) return fail("Too many requests", 429);
        pendingProposal = await proposeAutoresearch(getSettings(), key);
        return json({ proposal: pendingProposal });
      }

      if (url.pathname === "/api/autoresearch/resolve" && req.method === "POST") {
        if (!pendingProposal) return fail("No pending proposal");
        const body = await readBody(req);
        const kind = body.kind === "revert" ? "revert" : "keep";
        resolveAutoresearch(pendingProposal, kind, getSettings());
        pendingProposal = null;
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

console.log(`atlas-gic ${SERVE_WEB ? "web+api" : "api"} http://${HOST}:${server.port}${AUTH_TOKEN ? " (gated)" : ""}`);
