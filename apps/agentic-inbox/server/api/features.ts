import type { BunRequest } from "bun";
import type { Commitment, MemoryKind } from "../../shared/types.ts";
import { audit, commitments, events, meetings, memories, notes, people, proposedDrafts, spaces, topics } from "../db/repo.ts";
import { extractForSpace } from "../features/commitments.ts";
import { completeTodoTask, pushCommitmentToTodo } from "../features/ms-tasks.ts";
import { briefForEvent } from "../features/briefs.ts";
import { buildFollowUp, followUpRecipients } from "../features/followup.ts";
import { buildCatchUp, lastSeen, markSeen } from "../features/catchup.ts";
import { rebuildTopics } from "../features/topics.ts";
import { computeRadar } from "../features/radar.ts";
import { findPerson, personProfile } from "../features/people.ts";
import { parseDue } from "../features/text.ts";
import { produceDigest } from "../features/digests.ts";
import { buildMorningBriefing } from "../features/briefing.ts";
import { postMorningBriefing } from "../features/briefing-teams.ts";
import { orgSettingsView, patchOrgConfig, savePlaud } from "../features/org-config.ts";
import { syncSharePointVault } from "../features/vault.ts";
import { probePlaud, transcribeMeetingRecording } from "../features/plaud.ts";
import { buildMeetingMinutes } from "../features/minutes.ts";
import { produceOvernightDrafts } from "../features/overnight-drafts.ts";
import { digests } from "../db/repo.ts";
import { sendNewMail } from "../services/messaging.ts";
import { broadcast } from "./events.ts";
import { badRequest, h, notFound, num, ok, query, readJson, spaceParam } from "./util.ts";
import { ensureVisibleAccount, contactEmails, viewerEmail, visibleAccountIds } from "../auth/scope.ts";

type P<T extends string> = BunRequest<T>;

export const featureRoutes = {
  /* ---------- commitments ---------- */
  "/api/commitments": {
    GET: h((req) =>
      ok(
        commitments.list(spaceParam(req), {
          status: query(req).get("status") ?? undefined,
          ownerEmail: viewerEmail(req),
          shareWork: true,
        }),
      ),
    ),
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
        ownerEmail: viewerEmail(req) || undefined,
      });
      broadcast({ type: "data", entity: "commitments", spaceId: body.spaceId });
      return ok({ ok: true });
    }),
  },
  "/api/commitments/extract": {
    POST: h(async (req) => {
      const spaceId = spaceParam(req);
      const targets = spaceId ? [spaceId] : spaces.all().map((s) => s.id);
      const owner = viewerEmail(req) || undefined;
      const accountIds = visibleAccountIds(req);
      let inserted = 0;
      for (const id of targets) {
        if (accountIds === null) inserted += await extractForSpace(id, { ownerEmail: owner });
        else for (const accountId of accountIds) inserted += await extractForSpace(id, { ownerEmail: owner, accountId });
      }
      broadcast({ type: "data", entity: "commitments", spaceId });
      return ok({ inserted });
    }),
  },
  "/api/commitments/:id/todo": {
    POST: h(async (req: P<"/api/commitments/:id/todo">) => {
      const c = commitments.get(req.params.id) ?? notFound("Commitment not found");
      try {
        const ids = await pushCommitmentToTodo(c.id);
        audit.log({ spaceId: c.spaceId, actor: "user", action: "commitment.todo", detail: `${c.text} → ${ids.taskId}` });
        broadcast({ type: "data", entity: "commitments", spaceId: c.spaceId });
        return ok({ ...commitments.get(c.id), ...ids });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/microsoft 365/i.test(msg)) badRequest(msg);
        throw err;
      }
    }),
  },
  "/api/commitments/:id": {
    PATCH: h(async (req: P<"/api/commitments/:id">) => {
      const c = commitments.get(req.params.id) ?? notFound("Commitment not found");
      const body = await readJson<{ status: Commitment["status"] }>(req);
      if (!["open", "done", "dropped"].includes(body.status)) badRequest("Invalid status");
      commitments.setStatus(c.id, body.status);
      if (body.status === "done") {
        await completeTodoTask(c.id).catch((err) =>
          console.error(`[todo] complete ${c.id}:`, err instanceof Error ? err.message : err),
        );
      }
      audit.log({ spaceId: c.spaceId, actor: "user", action: `commitment.${body.status}`, detail: c.text });
      broadcast({ type: "data", entity: "commitments", spaceId: c.spaceId });
      return ok(commitments.get(c.id));
    }),
  },

  /* ---------- meeting briefs ---------- */
  "/api/events/:id/brief": h(async (req: P<"/api/events/:id/brief">) => {
    const event = events.get(req.params.id) ?? notFound("Event not found");
    ensureVisibleAccount(req, event.accountId);
    // `existing=1` only returns a brief the scheduler (or user) already produced; never generates.
    if (query(req).get("existing") === "1" && notes.list(event.spaceId, { eventId: event.id, kind: "brief" }).length === 0) return ok(null);
    return ok(await briefForEvent(req.params.id, { refresh: query(req).get("refresh") === "1" }));
  }),

  /* ---------- follow-through ---------- */
  "/api/meetings/:id/followup": {
    GET: h(async (req: P<"/api/meetings/:id/followup">) => {
      const m = meetings.get(req.params.id) ?? notFound("Meeting not found");
      ensureVisibleAccount(req, m.accountId);
      return ok({ ...(await buildFollowUp(m, { refresh: query(req).get("refresh") === "1" })), recipients: followUpRecipients(m) });
    }),
    POST: h(async (req: P<"/api/meetings/:id/followup">) => {
      const m = meetings.get(req.params.id) ?? notFound("Meeting not found");
      ensureVisibleAccount(req, m.accountId);
      return ok({ ...(await buildFollowUp(m, { refresh: true })), recipients: followUpRecipients(m) });
    }),
  },
  "/api/meetings/:id/followup/send": {
    POST: h(async (req: P<"/api/meetings/:id/followup/send">) => {
      const m = meetings.get(req.params.id) ?? notFound("Meeting not found");
      ensureVisibleAccount(req, m.accountId);
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
    const result = await buildCatchUp(spaceId, from, to, { polish: q.get("polish") !== "0", accountIds: visibleAccountIds(req) });
    return ok(result);
  }),
  "/api/catchup/seen": { POST: h((req) => (markSeen(spaceParam(req)), ok({ ok: true }))) },

  /* ---------- morning briefing + overnight drafts ---------- */
  "/api/briefing": h((req) =>
    ok(
      buildMorningBriefing(spaceParam(req), {
        accountIds: visibleAccountIds(req),
        ownerEmail: viewerEmail(req),
      }),
    ),
  ),

  /* ---------- org assistant (Teams brief, SharePoint vault, Plaud) ---------- */
  "/api/org": {
    GET: h((req) => ok(orgSettingsView(spaceParam(req)))),
    PATCH: h(async (req) => {
      const body = await readJson<{
        briefChannelTitle?: string;
        vaultUrl?: string;
        templateFolder?: string;
      }>(req);
      patchOrgConfig({
        briefChannelTitle: body.briefChannelTitle,
        vaultUrl: body.vaultUrl,
        templateFolder: body.templateFolder,
      });
      return ok(orgSettingsView(spaceParam(req)));
    }),
  },
  "/api/org/vault/sync": {
    POST: h(async (req) => {
      await syncSharePointVault();
      return ok(orgSettingsView(spaceParam(req)));
    }),
  },
  "/api/org/briefing/post": {
    POST: h(async (req) => {
      const spaceId = spaceParam(req) ?? "space_work";
      const result = await postMorningBriefing(spaceId, { force: true, ownerEmail: viewerEmail(req) });
      if (!result.posted && result.skipped && /unknown space/i.test(result.skipped)) badRequest(result.skipped);
      return ok(result);
    }),
  },
  "/api/org/plaud": {
    POST: h(async (req) => {
      const body = await readJson<{ clientId?: string; clientSecret?: string | null; apiKey?: string | null; mcpUrl?: string }>(req);
      savePlaud({
        clientId: body.clientId,
        clientSecret: body.clientSecret,
        apiKey: body.apiKey,
        mcpUrl: body.mcpUrl,
      });
      return ok(orgSettingsView(spaceParam(req)));
    }),
  },
  "/api/org/plaud/probe": {
    POST: h(async () => ok(await probePlaud())),
  },
  "/api/meetings/:id/plaud": {
    POST: h(async (req: P<"/api/meetings/:id/plaud">) => {
      const m = meetings.get(req.params.id) ?? notFound("Meeting not found");
      ensureVisibleAccount(req, m.accountId);
      const result = await transcribeMeetingRecording(m.id);
      if (!result.ok) badRequest(result.message);
      broadcast({ type: "data", entity: "meetings", spaceId: m.spaceId });
      return ok(result);
    }),
  },

  "/api/meetings/:id/minutes": {
    GET: h(async (req: P<"/api/meetings/:id/minutes">) => {
      const m = meetings.get(req.params.id) ?? notFound("Meeting not found");
      ensureVisibleAccount(req, m.accountId);
      const existing = notes.list(m.spaceId, { meetingId: m.id, kind: "minutes" })[0];
      return ok(existing ?? null);
    }),
    POST: h(async (req: P<"/api/meetings/:id/minutes">) => {
      const m = meetings.get(req.params.id) ?? notFound("Meeting not found");
      ensureVisibleAccount(req, m.accountId);
      const body = await readJson<{ templatePath?: string; refresh?: boolean }>(req).catch(() => ({}) as { templatePath?: string; refresh?: boolean });
      return ok(await buildMeetingMinutes(m, { templatePath: body.templatePath, refresh: body.refresh !== false }));
    }),
  },
  "/api/drafts": {
    GET: h((req) =>
      ok(proposedDrafts.list(spaceParam(req), { status: (query(req).get("status") as "pending" | "accepted" | "dismissed") || "pending", ownerEmail: viewerEmail(req) || undefined })),
    ),
    POST: h((req) => {
      const spaceId = spaceParam(req);
      const targets = spaceId ? [spaces.get(spaceId) ?? badRequest("Unknown space")] : spaces.all();
      const owner = viewerEmail(req) || "";
      let created = 0;
      for (const s of targets) {
        created += produceOvernightDrafts(s, { accountIds: visibleAccountIds(req), ownerEmail: owner }).length;
      }
      broadcast({ type: "data", entity: "drafts", spaceId });
      return ok({ created });
    }),
  },
  "/api/drafts/:id": {
    PATCH: h(async (req: P<"/api/drafts/:id">) => {
      const row = proposedDrafts.get(req.params.id) ?? notFound("Draft not found");
      const owner = viewerEmail(req);
      if (owner && row.ownerEmail && row.ownerEmail !== owner) notFound("Draft not found");
      const body = await readJson<{ status: "accepted" | "dismissed" }>(req);
      if (body.status !== "accepted" && body.status !== "dismissed") badRequest("status must be accepted or dismissed");
      proposedDrafts.setStatus(row.id, body.status);
      return ok(proposedDrafts.get(row.id));
    }),
  },

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

  /* ---------- digests ---------- */
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

  /* ---------- radar ---------- */
  "/api/radar": h((req) => ok(computeRadar(spaceParam(req), visibleAccountIds(req)))),

  /* ---------- people ---------- */
  "/api/people/by-email": h((req) => {
    const email = (query(req).get("email") ?? badRequest("email required")).toLowerCase();
    const spaceId = spaceParam(req);
    const allowed = contactEmails(spaceId, visibleAccountIds(req));
    if (allowed && !allowed.has(email)) return ok(null);
    const p = people.byEmail(spaceId, email);
    return ok(p ? personProfile(p) : null);
  }),
  "/api/people/:id": {
    GET: h((req: P<"/api/people/:id">) => {
      const p = people.get(req.params.id) ?? notFound("Person not found");
      const allowed = contactEmails(p.spaceId, visibleAccountIds(req));
      if (allowed && !allowed.has(p.email.toLowerCase())) notFound("Person not found");
      return ok(personProfile(p));
    }),
    PATCH: h(async (req: P<"/api/people/:id">) => {
      const current = people.get(req.params.id) ?? notFound("Person not found");
      const allowed = contactEmails(current.spaceId, visibleAccountIds(req));
      if (allowed && !allowed.has(current.email.toLowerCase())) notFound("Person not found");
      const patch = await readJson<{ vip?: boolean; notes?: string; name?: string }>(req);
      people.update(req.params.id, patch);
      broadcast({ type: "data", entity: "people", spaceId: null });
      return ok(people.get(req.params.id));
    }),
  },

  /* ---------- agent memories ---------- */
  "/api/memories": {
    GET: h((req) => ok(memories.list(spaceParam(req)))),
    POST: h(async (req) => {
      const body = await readJson<{ spaceId: string; kind: MemoryKind; text: string }>(req);
      if (!body.spaceId || !spaces.get(body.spaceId)) badRequest("spaceId required");
      if (!["preference", "correction", "fact"].includes(body.kind)) badRequest("kind must be preference, correction or fact");
      if (!body.text?.trim() || body.text.trim().length < 3) badRequest("text required");
      const row = memories.add({ spaceId: body.spaceId, kind: body.kind, text: body.text.trim() });
      broadcast({ type: "data", entity: "memories", spaceId: body.spaceId });
      return ok(row);
    }),
  },
  "/api/memories/:id": {
    DELETE: h((req: P<"/api/memories/:id">) => {
      const row = memories.get(req.params.id) ?? notFound("Memory not found");
      memories.remove(row.id);
      broadcast({ type: "data", entity: "memories", spaceId: row.spaceId });
      return ok({ ok: true });
    }),
  },
};
