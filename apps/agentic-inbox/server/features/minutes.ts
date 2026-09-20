import type { Meeting, Note, TranscriptLine } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { meetings, notes } from "../db/repo.ts";
import { tryComplete } from "../agent/llm.ts";
import { hybridSearch } from "./embed.ts";
import { BUILTIN_TEMPLATE_PATH, listedTemplates, readOrgConfig } from "./org-config.ts";
import { templateByPath } from "./vault.ts";

export function fillPlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

function transcriptText(lines: TranscriptLine[]): string {
  return lines.map((l) => `${senderName(l.speaker)}: ${l.text}`).join("\n");
}

function bullet(items: string[]): string {
  return items.length ? items.map((d) => `- ${d}`).join("\n") : "- (yok)";
}

export async function buildMeetingMinutes(
  meeting: Meeting,
  opts: { templatePath?: string; refresh?: boolean } = {},
): Promise<Note> {
  const existing = notes.list(meeting.spaceId, { meetingId: meeting.id, kind: "minutes" })[0];
  if (existing && !opts.refresh) return existing;

  const cfg = readOrgConfig();
  const templates = listedTemplates();
  const wanted = opts.templatePath || (cfg.templateFolder && templates.find((t) => t.path.startsWith(cfg.templateFolder) && t.path !== BUILTIN_TEMPLATE_PATH)?.path) || BUILTIN_TEMPLATE_PATH;
  const tpl = templateByPath(wanted) ?? templates[0];
  const transcript = meetings.transcript(meeting.id);
  const lines = transcript?.lines ?? [];
  const rawTranscript = transcriptText(lines);
  const kbHits = await hybridSearch(meeting.spaceId, meeting.title, { sourceKind: "kb", limit: 6 });
  const kb = kbHits.map((h) => h.text).join("\n\n").slice(0, 4000);

  let decisions = "";
  let actions = "";
  let summary = "";
  const llm = await tryComplete(
    "You write Conforcus meeting minutes in Turkish. Fill the user's markdown template. Keep headings. Do not invent attendees. Reply with the filled markdown only.",
    [
      `Template:\n${tpl.markdown}`,
      `Title: ${meeting.title}`,
      `Date: ${new Date(meeting.start).toISOString()}`,
      `Attendees: ${meeting.attendees.map(senderName).join(", ")}`,
      kb ? `Vault context:\n${kb}` : "",
      rawTranscript ? `Transcript:\n${rawTranscript.slice(0, 10_000)}` : "No transcript.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    1400,
  );
  if (llm && llm.includes("#")) {
    const note = notes.insert({
      spaceId: meeting.spaceId,
      kind: "minutes",
      eventId: meeting.eventId,
      meetingId: meeting.id,
      title: `Not: ${meeting.title}`,
      bodyMarkdown: llm.trim(),
    });
    return note;
  }

  const heuristicDecisions = lines
    .map((l) => l.text)
    .filter((t) => /\b(karar|decided|agreed|onaylandı)\b/i.test(t))
    .slice(0, 8);
  const heuristicActions = lines
    .map((l) => `${senderName(l.speaker)}: ${l.text}`)
    .filter((t) => /\b(yapacağım|I'll|we will|aksiyon)\b/i.test(t))
    .slice(0, 8);
  summary = rawTranscript ? rawTranscript.split(/\n/).slice(0, 8).join("\n") : "Transkript yok — takvim satırından üretildi.";
  decisions = bullet(heuristicDecisions);
  actions = bullet(heuristicActions);

  const body = fillPlaceholders(tpl.markdown, {
    title: meeting.title,
    date: new Date(meeting.start).toLocaleString("tr-TR"),
    attendees: meeting.attendees.map(senderName).join(", "),
    summary,
    decisions,
    actions,
    transcript: rawTranscript.slice(0, 8000) || "(transkript yok)",
    source: transcript ? "Teams / Graph" : "takvim",
  });
  return notes.insert({
    spaceId: meeting.spaceId,
    kind: "minutes",
    eventId: meeting.eventId,
    meetingId: meeting.id,
    title: `Not: ${meeting.title}`,
    bodyMarkdown: body,
  });
}
