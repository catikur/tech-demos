import type { MorningBriefing } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { audit, settings, spaces } from "../db/repo.ts";
import { sendChat } from "../services/messaging.ts";
import { buildMorningBriefing } from "./briefing.ts";
import { readOrgConfig, resolveBriefingChannel } from "./org-config.ts";

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function line(text: string, max = 160): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`;
}

/** Teams-friendly plain text for the morning briefing (no HTML). */
export function formatTeamsBriefing(brief: MorningBriefing, channelTitle: string): string {
  const day = new Date(brief.generatedAt).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const blocks: string[] = [`Butler · sabah brifingi`, day, `Kanal: ${channelTitle}`, ""];

  blocks.push(`Takvim (${brief.events.length})`);
  if (brief.events.length === 0) blocks.push("• Bugün toplantı yok.");
  else for (const e of brief.events.slice(0, 12)) blocks.push(`• ${clock(e.start)} ${line(e.title)}`);
  blocks.push("");

  blocks.push(`Okunmamış (${brief.unread.length})`);
  if (brief.unread.length === 0) blocks.push("• Gelen kutusu temiz.");
  else for (const t of brief.unread.slice(0, 10)) blocks.push(`• ${line(t.subject || "(konu yok)")} — ${senderName(t.lastFrom)}`);
  blocks.push("");

  blocks.push(`Taahhütler (${brief.dueCommitments.length})`);
  if (brief.dueCommitments.length === 0) blocks.push("• Yakın vadeli taahhüt yok.");
  else for (const c of brief.dueCommitments.slice(0, 10)) blocks.push(`• ${line(c.text)}`);
  blocks.push("");

  blocks.push(`Taslak yanıtlar (${brief.drafts.length})`);
  if (brief.drafts.length === 0) blocks.push("• Onay bekleyen taslak yok.");
  else for (const d of brief.drafts.slice(0, 8)) blocks.push(`• ${line(d.subject)}`);
  blocks.push("");

  blocks.push(`Toplantılar (${brief.recentMeetings.length})`);
  if (brief.recentMeetings.length === 0) blocks.push("• Yakın tarihli kayıt yok.");
  else
    for (const m of brief.recentMeetings.slice(0, 8)) {
      const tag = m.hasTranscript ? "transkript var" : m.recordingLocked ? "kayıt kilitli" : "takvim";
      blocks.push(`• ${line(m.title)} (${tag})`);
    }

  return blocks.join("\n").slice(0, 12_000);
}

export async function postMorningBriefing(
  spaceId: string,
  opts: { now?: number; force?: boolean; ownerEmail?: string | null } = {},
): Promise<{ posted: boolean; chatId: string | null; skipped?: string; preview: string }> {
  const space = spaces.get(spaceId);
  if (!space) return { posted: false, chatId: null, skipped: "Unknown space", preview: "" };
  const cfg = readOrgConfig();
  const channel = resolveBriefingChannel(spaceId, cfg.briefChannelTitle);
  if (!channel) {
    return {
      posted: false,
      chatId: null,
      skipped: `Teams channel "${cfg.briefChannelTitle}" is not in the synced chat list yet. Pick it in Settings after a Teams sync.`,
      preview: "",
    };
  }
  const now = opts.now ?? Date.now();
  const key = `briefing.teams.${spaceId}.${dateKey(new Date(now))}`;
  if (!opts.force && settings.get(key)) {
    return { posted: false, chatId: channel.id, skipped: "Already posted today", preview: "" };
  }
  const brief = buildMorningBriefing(spaceId, { now, ownerEmail: opts.ownerEmail ?? null });
  const preview = formatTeamsBriefing(brief, channel.title);
  await sendChat(channel.id, preview, "agent");
  settings.set(key, "1");
  audit.log({ spaceId, actor: "agent", action: "briefing.teams", detail: channel.title });
  return { posted: true, chatId: channel.id, preview };
}
