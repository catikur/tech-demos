import type { Digest, Space } from "../../shared/types.ts";
import { accounts, digests, notifications, spaces } from "../db/repo.ts";
import { env } from "../env.ts";
import { sendNewMail } from "../services/messaging.ts";
import { broadcast } from "../api/events.ts";
import { buildCatchUp } from "./catchup.ts";
import { computeRadar } from "./radar.ts";
import { commitments } from "../db/repo.ts";

/**
 * Daily / weekly digests per space: a catch-up over the period plus the state
 * of the ledger and the radar. Stored, surfaced as a notification and
 * optionally mailed to yourself.
 */
export async function produceDigest(space: Space, period: "daily" | "weekly", opts: { notify?: boolean; mail?: boolean } = {}): Promise<Digest> {
  const now = Date.now();
  const previous = digests.latest(space.id, period);
  const windowMs = period === "weekly" ? 7 * 86_400_000 : 24 * 3_600_000;
  const fromAt = previous ? Math.max(previous.toAt, now - 2 * windowMs) : now - windowMs;
  const catchup = await buildCatchUp(space.id, fromAt, now, { polish: true });
  const open = commitments.list(space.id, { status: "open" });
  const overdue = open.filter((c) => c.dueAt !== null && c.dueAt < now);
  const dueSoon = open.filter((c) => c.dueAt !== null && c.dueAt >= now && c.dueAt < now + 2 * 86_400_000);
  const radar = computeRadar(space.id);
  const waitingOnMe = radar.filter((r) => r.direction === "waiting_on_me");

  const body = [
    `# ${period === "weekly" ? "Weekly" : "Daily"} digest — ${space.name}`,
    `_${new Date(fromAt).toUTCString().slice(0, 22)} → ${new Date(now).toUTCString().slice(0, 22)}_`,
    "",
    "## What happened",
    catchup.summaryMarkdown,
    "",
    "## Your ledger",
    `- ${open.length} open commitment(s): ${open.filter((c) => c.direction === "owed_by_me").length} you owe, ${open.filter((c) => c.direction === "owed_to_me").length} owed to you`,
    ...(overdue.length ? [`- **${overdue.length} overdue**: ${overdue.slice(0, 3).map((c) => `"${c.text}"`).join("; ")}`] : []),
    ...(dueSoon.length ? [`- ${dueSoon.length} due in the next 48h: ${dueSoon.slice(0, 3).map((c) => `"${c.text}"`).join("; ")}`] : []),
    "",
    "## Response radar",
    waitingOnMe.length
      ? `- ${waitingOnMe.length} item(s) waiting on you; oldest: "${waitingOnMe.sort((a, b) => b.ageMs - a.ageMs)[0].source.label}"`
      : "- Nothing is waiting on you.",
    `- ${radar.length - waitingOnMe.length} item(s) you are waiting on from others`,
  ].join("\n");

  const digest = digests.insert({ spaceId: space.id, period, fromAt, toAt: now, bodyMarkdown: body });
  if (opts.notify !== false) {
    notifications.push({
      spaceId: space.id,
      kind: "digest",
      title: `${period === "weekly" ? "Weekly" : "Daily"} digest ready — ${space.name}`,
      body: catchup.summaryMarkdown.replace(/[*_#]/g, "").split("\n")[0].slice(0, 160),
      link: `digest:${digest.id}`,
    });
    broadcast({ type: "notification", spaceId: space.id, title: "Digest ready" });
  }
  if (opts.mail ?? env.sync.digestEmailToSelf) {
    const account = accounts.bySpace(space.id)[0];
    if (account) {
      await sendNewMail(space.id, [account.email], `${period === "weekly" ? "Weekly" : "Daily"} digest — ${space.name}`, body.replace(/^#+\s*/gm, "").replace(/\*\*/g, ""), "agent", "other").catch((err) =>
        console.warn(`[digest] mail-to-self failed: ${err instanceof Error ? err.message : err}`),
      );
    }
  }
  return digest;
}

export function allSpaces(): Space[] {
  return spaces.all();
}
