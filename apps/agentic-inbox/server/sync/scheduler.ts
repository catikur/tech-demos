import { inQuietHours } from "../../shared/types.ts";
import { env } from "../env.ts";
import { accounts, commitments, events, notes, notifications, settings, spaces } from "../db/repo.ts";
import { broadcast } from "../api/events.ts";
import { briefForEvent } from "../features/briefs.ts";
import { produceDigest } from "../features/digests.ts";
import { computeRadar } from "../features/radar.ts";
import { syncAll } from "./engine.ts";
import { graphPushEnabled, renewExpiringSubscriptions } from "../webhooks/graph.ts";

/**
 * In-process scheduler. One minute tick that:
 *  - renews Graph change-notification subscriptions when push is enabled,
 *  - syncs every account on the configured interval,
 *  - prepares briefs `briefLeadMinutes` before meetings,
 *  - produces daily/weekly digests at each space's digest hour,
 *  - reminds about commitments due in the next 24h,
 *  - flags response debt older than 48h once a day.
 * Notifications respect each space's quiet hours (they are deferred, not lost).
 */

const MIN = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;
let lastSyncAt = 0;
export const schedulerState = { running: false, lastTickAt: 0, lastSyncAt: 0, ticks: 0 };

function dateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function notifyUnlessQuiet(spaceId: string, n: Parameters<typeof notifications.push>[0]): boolean {
  const space = spaces.get(spaceId);
  if (space && inQuietHours(space)) return false;
  notifications.push(n);
  broadcast({ type: "notification", spaceId, title: n.title });
  return true;
}

export async function tick(now = Date.now()): Promise<void> {
  schedulerState.lastTickAt = now;
  schedulerState.ticks++;

  if (graphPushEnabled()) {
    await renewExpiringSubscriptions().catch((err) => console.error("[scheduler] graph subscription renew failed", err));
  }

  if (now - lastSyncAt >= env.sync.intervalMinutes * MIN && accounts.all().length > 0) {
    lastSyncAt = now;
    schedulerState.lastSyncAt = now;
    await syncAll().catch((err) => console.error("[scheduler] sync failed", err));
  }

  for (const space of spaces.all()) {
    // Briefs shortly before meetings with other people.
    const upcoming = events.list(space.id, now, now + env.sync.briefLeadMinutes * MIN).filter((e) => e.attendees.length > 1 && e.start > now - MIN);
    for (const e of upcoming) {
      if (notes.list(space.id, { eventId: e.id, kind: "brief" }).length > 0) continue;
      try {
        await briefForEvent(e.id, { polish: true });
        notifyUnlessQuiet(space.id, {
          spaceId: space.id,
          kind: "brief",
          title: `Brief ready: ${e.title}`,
          body: `Starts ${new Date(e.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC · ${e.attendees.length - 1} other attendee(s)`,
          link: `event:${e.id}`,
        });
      } catch (err) {
        console.warn(`[scheduler] brief failed for ${e.title}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Digests at the space's digest hour (local time), once per day; weekly on Mondays.
    const local = new Date(now);
    const dailyKey = `digest.daily.${space.id}.${dateKey(local)}`;
    if (local.getHours() === space.digestHour && !settings.get(dailyKey)) {
      settings.set(dailyKey, "1");
      await produceDigest(space, "daily").catch((err) => console.warn(`[scheduler] daily digest failed: ${err instanceof Error ? err.message : err}`));
      const weeklyKey = `digest.weekly.${space.id}.${dateKey(local)}`;
      if (local.getDay() === 1 && !settings.get(weeklyKey)) {
        settings.set(weeklyKey, "1");
        await produceDigest(space, "weekly").catch((err) => console.warn(`[scheduler] weekly digest failed: ${err instanceof Error ? err.message : err}`));
      }
    }

    // Commitment reminders (due within 24h), once per commitment.
    for (const c of commitments.dueSoon(space.id, 24 * 3_600_000)) {
      const key = `notified.commitment.${c.id}`;
      if (settings.get(key)) continue;
      const overdue = c.dueAt !== null && c.dueAt < now;
      const sent = notifyUnlessQuiet(space.id, {
        spaceId: space.id,
        kind: "commitment",
        title: `${overdue ? "Overdue" : "Due soon"}: ${c.direction === "owed_by_me" ? "you owe" : "owed to you"} — ${c.counterpartName ?? c.counterpart}`,
        body: c.text,
        link: `commitment:${c.id}`,
      });
      if (sent) settings.set(key, "1");
    }

    // Response debt older than 48h — one nudge a day.
    const radarKey = `notified.radar.${space.id}.${dateKey(local)}`;
    if (!settings.get(radarKey)) {
      const stale = computeRadar(space.id).filter((r) => r.direction === "waiting_on_me" && r.ageMs > 48 * 3_600_000);
      if (stale.length > 0) {
        const sent = notifyUnlessQuiet(space.id, {
          spaceId: space.id,
          kind: "radar",
          title: `${stale.length} reply(ies) waiting on you for 2+ days`,
          body: stale.slice(0, 3).map((s) => `${s.source.label}`).join(" · "),
          link: "radar",
        });
        if (sent) settings.set(radarKey, "1");
      }
    }
  }
}

export function startScheduler(): void {
  if (timer || !env.sync.schedulerEnabled) return;
  schedulerState.running = true;
  timer = setInterval(() => void tick().catch((err) => console.error("[scheduler] tick failed", err)), MIN);
  // First tick soon after boot so briefs/reminders appear without waiting a minute.
  setTimeout(() => void tick().catch((err) => console.error("[scheduler] tick failed", err)), 5_000);
  console.log(`   Scheduler: sync every ${env.sync.intervalMinutes}m, briefs ${env.sync.briefLeadMinutes}m before meetings`);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  schedulerState.running = false;
}
