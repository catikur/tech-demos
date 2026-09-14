import type { BunRequest } from "bun";
import type { Commitment } from "../../shared/types.ts";
import { audit, commitments, events, meetings, notes, people, spaces, topics } from "../db/repo.ts";
import { extractForSpace } from "../features/commitments.ts";
import { briefForEvent } from "../features/briefs.ts";
import { buildFollowUp, followUpRecipients } from "../features/followup.ts";
import { buildCatchUp, lastSeen, markSeen } from "../features/catchup.ts";
import { rebuildTopics } from "../features/topics.ts";
import { computeRadar } from "../features/radar.ts";
import { findPerson, personProfile } from "../features/people.ts";
import { parseDue } from "../features/text.ts";
import { produceDigest } from "../features/digests.ts";
import { schedulerState, tick } from "../sync/scheduler.ts";
import { digests } from "../db/repo.ts";
import { sendNewMail } from "../services/messaging.ts";
import { broadcast } from "./events.ts";
import { badRequest, h, notFound, num, ok, query, readJson, spaceParam } from "./util.ts";

type P<T extends string> = BunRequest<T>;

export const featureRoutes = {
  /* ---------- commitments ---------- */
  "/api/commitments": {
    GET: h((req) => ok(commitments.list(spaceParam(req), { status: query(req).get("status") ?? undefined }))),
    POST: h(async (req) => {
      const body = await readJson<{ spaceId: string; direction: Commitment["direction"]; counterpart: string; text: string; due?: string }>(req);
      if (!body.spaceId || !spaces.get(body.spaceId)) badRequest("spaceId required");
      if (!body.text?.trim() || !body.counterpart?.trim()) badRequest("text and counterpart required");
      const person = findPerson(body.spaceId, body.counterpart);
      commitments.insertUnique({
        spaceId: body.spaceId,
        direction: body.direction === "owed_to_me" ? "owed_to_me" : "owed_by_me",
        counterpart: person?.email ?? body.counterpart,
        text: body.text.trim(),
        dueAt: body.due ? (Date.parse(body.due) || parseDue(body.due)) : null,
        status: "open",
        source: { kind: "manual", id: "ui", label: "Added manually" },
        confidence: 1,
      });
      broadcast({ type: "data", entity: "commitments", spaceId: body.spaceId });
      return ok({ ok: true });
    }),
  },
  "/api/commitments/extract": {
    POST: h((req) => {
      const spaceId = spaceParam(req);
      const targets = spaceId ? [spaceId] : spaces.all().map((s) => s.id);
      const inserted = targets.reduce((n, id) => n + extractForSpace(id), 0);
      broadcast({ type: "data", entity: "commitments", spaceId });
      return ok({ inserted });
    }),
  },
  "/api/commitments/:id": {
    PATCH: h(async (req: P<"/api/commitments/:id">) => {
      const c = commitments.get(req.params.id) ?? notFound("Commitment not found");
      const body = await readJson<{ status: Commitment["status"] }>(req);
      if (!["open", "done", "dropped"].includes(body.status)) badRequest("Invalid status");
      commitments.setStatus(c.id, body.status);
      audit.log({ spaceId: c.spaceId, actor: "user", action: `commitment.${body.status}`, detail: c.text });
      broadcast({ type: "data", entity: "commitments", spaceId: c.spaceId });
      return ok(commitments.get(c.id));
    }),
  },

  /* ---------- meeting briefs ---------- */
  "/api/events/:id/brief": h(async (req: P<"/api/events/:id/brief">) => {
    const event = events.get(req.params.id) ?? notFound("Event not found");
    // `existing=1` only returns a brief the scheduler (or user) already produced; never generates.
    if (query(req).get("existing") === "1" && notes.list(event.spaceId, { eventId: event.id, kind: "brief" }).length === 0) return ok(null);
    return ok(await briefForEvent(req.params.id, { refresh: query(req).get("refresh") === "1" }));
  }),

  /* ---------- follow-through ---------- */
  "/api/meetings/:id/followup": {
    GET: h(async (req: P<"/api/meetings/:id/followup">) => {
      const m = meetings.get(req.params.id) ?? notFound("Meeting not found");
      return ok({ ...(await buildFollowUp(m, { refresh: query(req).get("refresh") === "1" })), recipients: followUpRecipients(m) });
    }),
    POST: h(async (req: P<"/api/meetings/:id/followup">) => {
      const m = meetings.get(req.params.id) ?? notFound("Meeting not found");
      return ok({ ...(await buildFollowUp(m, { refresh: true })), recipients: followUpRecipients(m) });
    }),
  },
  "/api/meetings/:id/followup/send": {
    POST: h(async (req: P<"/api/meetings/:id/followup/send">) => {
      const m = meetings.get(req.params.id) ?? notFound("Meeting not found");
      const body = await readJson<{ body: string; subject?: string; actor?: "user" | "agent" }>(req);
      if (!body.body?.trim()) badRequest("Empty body");
      const to = followUpRecipients(m);
      if (to.length === 0) badRequest("No recipients");
      const thread = await sendNewMail(m.spaceId, to, body.subject?.trim() || `Follow-up: ${m.title}`, body.body.trim(), body.actor === "agent" ? "agent" : "user");
      return ok(thread);
    }),
  },

  /* ---------- catch-up ---------- */
  "/api/catchup": h(async (req) => {
    const q = query(req);
    const spaceId = spaceParam(req);
    const to = num(q.get("to"), Date.now());
    const preset = q.get("preset");
    const from = preset === "seen" ? (lastSeen(spaceId) ?? to - 24 * 3_600_000) : num(q.get("from"), to - 24 * 3_600_000);
    const result = await buildCatchUp(spaceId, from, to, { polish: q.get("polish") !== "0" });
    return ok(result);
  }),
  "/api/catchup/seen": { POST: h((req) => (markSeen(spaceParam(req)), ok({ ok: true }))) },

  /* ---------- topics ---------- */
  "/api/topics": h((req) => ok(topics.list(spaceParam(req)))),
  "/api/topics/rebuild": {
    POST: h((req) => {
      const spaceId = spaceParam(req);
      const targets = spaceId ? [spaceId] : spaces.all().map((s) => s.id);
      const count = targets.reduce((n, id) => n + rebuildTopics(id).length, 0);
      broadcast({ type: "data", entity: "topics", spaceId });
      return ok({ topics: count });
    }),
  },

  /* ---------- digests & scheduler ---------- */
  "/api/digests": h((req) => ok(digests.list(spaceParam(req)))),
  "/api/digests/run": {
    POST: h(async (req) => {
      const q = query(req);
      const period = q.get("period") === "weekly" ? "weekly" : "daily";
      const spaceId = spaceParam(req);
      const targets = spaceId ? [spaces.get(spaceId) ?? badRequest("Unknown space")] : spaces.all();
      const out = [];
      for (const s of targets) out.push(await produceDigest(s, period, { mail: q.get("mail") === "1" }));
      return ok(out);
    }),
  },
  "/api/scheduler": {
    GET: h(() => ok(schedulerState)),
    POST: h(async () => {
      await tick();
      return ok(schedulerState);
    }),
  },

  /* ---------- radar ---------- */
  "/api/radar": h((req) => ok(computeRadar(spaceParam(req)))),

  /* ---------- people ---------- */
  "/api/people/by-email": h((req) => {
    const email = query(req).get("email") ?? badRequest("email required");
    const p = people.byEmail(spaceParam(req), email);
    return ok(p ? personProfile(p) : null);
  }),
  "/api/people/:id": {
    GET: h((req: P<"/api/people/:id">) => ok(personProfile(people.get(req.params.id) ?? notFound("Person not found")))),
    PATCH: h(async (req: P<"/api/people/:id">) => {
      const patch = await readJson<{ vip?: boolean; notes?: string; name?: string }>(req);
      people.update(req.params.id, patch);
      broadcast({ type: "data", entity: "people", spaceId: null });
      return ok(people.get(req.params.id));
    }),
  },
};
