import { LAYER_ORDER } from "../src/shared/agents";
import { layerMap, synthesize } from "../src/shared/engine";
import type { AgentTake, AutoresearchProposal, CroResult } from "../src/shared/types";
import {
  getSettings,
  getWeights,
  listAgents,
  listCommits,
  latestDebate,
  maskKey,
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

const PORT = Number(process.env.ATLAS_API_PORT || 5200);

let pendingProposal: AutoresearchProposal | null = null;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function fail(message: string, status = 400) {
  return json({ error: message }, status);
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text) return {};
  return JSON.parse(text) as Record<string, unknown>;
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
        emit("error", { message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function statePayload() {
  const settings = getSettings();
  const book = await snapshotBook();
  return {
    settings,
    keyConfigured: Boolean(resolveApiKey()),
    keyMasked: maskKey(resolveApiKey()),
    agents: listAgents(),
    weights: getWeights(),
    commits: listCommits(),
    book,
    pendingProposal,
    latest: latestDebate(),
  };
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    try {
      if (url.pathname === "/api/health") {
        return json({ ok: true, keyConfigured: Boolean(resolveApiKey()) });
      }

      if (url.pathname === "/api/state" && req.method === "GET") {
        return json(await statePayload());
      }

      if (url.pathname === "/api/settings" && req.method === "GET") {
        return json({
          settings: getSettings(),
          keyConfigured: Boolean(resolveApiKey()),
          keyMasked: maskKey(resolveApiKey()),
        });
      }

      if (url.pathname === "/api/settings" && req.method === "PUT") {
        const body = await readBody(req);
        if (typeof body.apiKey === "string") {
          setApiKeyOverride(body.apiKey.trim() || null);
          delete body.apiKey;
        }
        const settings = saveSettings(body);
        return json({ settings, keyConfigured: Boolean(resolveApiKey()), keyMasked: maskKey(resolveApiKey()) });
      }

      if (url.pathname === "/api/models" && req.method === "GET") {
        const key = resolveApiKey();
        if (!key) return fail("OPENROUTER_API_KEY missing", 401);
        return json({ models: await listModels(getSettings(), key) });
      }

      if (url.pathname === "/api/briefing" && req.method === "GET") {
        const ticker = String(url.searchParams.get("ticker") ?? "").trim();
        if (!ticker) return fail("ticker required");
        const briefing = await fetchBriefing(ticker, getSettings());
        return json({ briefing, cap: briefing.regime });
      }

      if (url.pathname === "/api/debate" && req.method === "POST") {
        const key = resolveApiKey();
        if (!key) return fail("OPENROUTER_API_KEY missing — set it in Settings or the environment", 401);
        const body = await readBody(req);
        const ticker = String(body.ticker ?? "").trim();
        if (!ticker) return fail("ticker required");
        const settings = getSettings();
        const weights = getWeights();

        return sse(async (emit) => {
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
        if (!key) return fail("OPENROUTER_API_KEY missing", 401);
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

      return fail("not found", 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const client =
        /required|missing|not found|Already booked|STAND DOWN|Need at least|disabled|quantity is 0|Not enough cash|Could not identify|incomplete patch/i.test(
          message,
        );
      return fail(message, client ? 400 : 500);
    }
  },
});

console.log(`atlas-gic api http://localhost:${server.port}`);
