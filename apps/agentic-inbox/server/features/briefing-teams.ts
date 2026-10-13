import type { Commitment, MorningBriefing, RadarItem } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { audit, settings, spaces } from "../db/repo.ts";
import { tryComplete } from "../agent/llm.ts";
import { sendChat } from "../services/messaging.ts";
import { buildMorningBriefing } from "./briefing.ts";
import { readOrgConfig, resolveBriefingChannel } from "./org-config.ts";

const TZ = "Europe/Istanbul";
const HOUR = 3_600_000;

function dateKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
}

function dayLabel(at: number): string {
  return new Date(at).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  });
}

function line(text: string, max = 120): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`;
}

function ageTr(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))} dk`;
  if (ms < 48 * HOUR) return `${Math.round(ms / HOUR)} sa`;
  return `${Math.round(ms / (24 * HOUR))} g`;
}

function who(item: { counterpart?: string; counterpartName?: string } | RadarItem): string {
  if ("counterpartName" in item && item.counterpartName) return item.counterpartName;
  return senderName(item.counterpart ?? "") || "birisi";
}

type BriefSection = { title: string; items: string[] };

function owedByMe(brief: MorningBriefing): Commitment[] {
  return brief.dueCommitments.filter((c) => c.direction === "owed_by_me");
}

function owedToMe(brief: MorningBriefing): Commitment[] {
  return brief.dueCommitments.filter((c) => c.direction === "owed_to_me");
}

function upcomingEvents(brief: MorningBriefing) {
  const upcoming = brief.events.filter((e) => e.end >= brief.generatedAt);
  return (upcoming.length ? upcoming : brief.events).slice(0, 6);
}

function nowItems(brief: MorningBriefing): string[] {
  return brief.waitingOnMe.slice(0, 5).map((r) => `${who(r)} — ${line(r.source.label, 70)} — ${line(r.excerpt || "cevap bekliyor", 60)} (${ageTr(r.ageMs)})`);
}

function readyItems(brief: MorningBriefing): string[] {
  const out: string[] = [];
  for (const d of brief.drafts.slice(0, 4)) out.push(`Taslak: ${line(d.subject || "(konu yok)", 90)}`);
  for (const c of [...owedByMe(brief), ...owedToMe(brief)].slice(0, 4)) {
    const due = c.dueAt ? ` · ${clock(c.dueAt)}` : "";
    out.push(`${c.direction === "owed_by_me" ? "Sen" : who(c)}: ${line(c.text, 80)}${due}`);
  }
  return out.slice(0, 6);
}

function eventItems(brief: MorningBriefing): string[] {
  return upcomingEvents(brief).map((e) => `${clock(e.start)}  ${line(e.title, 90)}`);
}

function briefSections(brief: MorningBriefing): BriefSection[] {
  const sections: BriefSection[] = [];
  const now = nowItems(brief);
  const today = eventItems(brief);
  const ready = readyItems(brief);
  if (now.length) sections.push({ title: "Şimdi", items: now });
  if (today.length) sections.push({ title: "Bugün", items: today });
  if (ready.length) sections.push({ title: "Hazır", items: ready });
  return sections;
}

function summaryLine(brief: MorningBriefing, sections: BriefSection[]): string {
  const bits: string[] = [];
  const nAct = sections.find((s) => s.title === "Şimdi")?.items.length ?? 0;
  if (nAct) bits.push(`${nAct} aksiyon sende`);
  if (brief.events.length) bits.push(`${brief.events.length} toplantı`);
  if (brief.drafts.length) bits.push(`${brief.drafts.length} taslak hazır`);
  return bits.length ? bits.join(" · ") : "Sakin bir gün — acil aksiyon yok.";
}

/** Teams-friendly plain text: summary first, then numbered actions. */
export function formatTeamsBriefing(brief: MorningBriefing, _channelTitle?: string): string {
  const sections = briefSections(brief);
  const lines = [`Butler · ${dayLabel(brief.generatedAt)}`, `Özet: ${summaryLine(brief, sections)}`, ""];
  if (sections.length === 0) {
    lines.push("Bugün için listelenecek aksiyon yok.");
    return lines.join("\n").trim();
  }
  for (const section of sections) {
    lines.push(section.title);
    section.items.forEach((item, i) => lines.push(`${i + 1}. ${item}`));
    lines.push("");
  }
  return lines.join("\n").trim().slice(0, 8_000);
}

const SECTION_TITLES = /^(Şimdi|Bugün|Hazır)$/i;

export function briefingTextToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks: string[] = [];
  let items: string[] = [];
  const flushList = () => {
    if (!items.length) return;
    blocks.push(`<ol>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>`);
    items = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    const numbered = line.match(/^\d+\.\s+(.*)$/);
    if (numbered) {
      items.push(numbered[1]);
      continue;
    }
    flushList();
    if (line.startsWith("Butler ·") || SECTION_TITLES.test(line)) {
      blocks.push(`<p><b>${esc(line)}</b></p>`);
    } else {
      blocks.push(`<p>${esc(line)}</p>`);
    }
  }
  flushList();
  return blocks.join("");
}

function looksLikeBrief(text: string): boolean {
  const t = text.trim();
  if (t.length < 40 || t.length > 8_000) return false;
  return /Özet:|Şimdi|Bugün/i.test(t);
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
  let preview = formatTeamsBriefing(brief, channel.title);
  const llm = await tryComplete(
    "You write a Turkish executive morning brief for Microsoft Teams. Use only the facts. No invented items. Short. Action first. Keep the headings Şimdi / Bugün / Hazır when those lists are non-empty. Start with 'Butler ·' and an 'Özet:' line. Plain text, numbered lists, no markdown tables.",
    preview,
    700,
  );
  if (llm && looksLikeBrief(llm)) preview = llm.trim().slice(0, 8_000);
  await sendChat(channel.id, preview, "agent", null, { contentType: "html", providerBody: briefingTextToHtml(preview) });
  settings.set(key, "1");
  audit.log({ spaceId, actor: "agent", action: "briefing.teams", detail: channel.title });
  return { posted: true, chatId: channel.id, preview };
}
