import type { ThreadCategory, TranscriptLine } from "../../shared/types.ts";

/** Heuristic category for a mail thread, used by every real connector. */
export function categorize(subject: string, from: string, body: string, hints: { listUnsubscribe?: boolean } = {}): ThreadCategory {
  const s = subject.toLowerCase();
  const f = from.toLowerCase();
  const b = body.slice(0, 4000).toLowerCase();
  if (hints.listUnsubscribe || /\b(newsletter|digest|weekly|unsubscribe)\b/.test(s + " " + f) || /unsubscribe/.test(b)) return "newsletter";
  if (/^(invitation|accepted|declined|tentative|updated invitation|canceled|cancelled):/.test(s) || /\bmeeting invite\b/.test(s)) return "invite";
  if (/\b(sign-?in|security alert|password|verification code|2fa|two-factor|suspicious)\b/.test(s + " " + b.slice(0, 300))) return "security";
  if (/\b(invoice|payment|receipt|billing|renewal|quote|subscription|charge)\b/.test(s) || /\b(billing|invoice)\b/.test(f)) return "billing";
  if (/\b(role|recruit|hiring|position|opportunity|candidate|interview)\b/.test(s) || /\brecruit/.test(f)) return "recruiting";
  if (/\b(fail|fails|failing|bug|issue|error|broken|not working|help|support|urgent|blocked|blocking)\b/.test(s + " " + b.slice(0, 500))) return "support";
  if (/\b(postmortem|roadmap|sprint|release|project|draft|review|spec|design doc|rfc)\b/.test(s)) return "project";
  if (/\b(gmail|hotmail|outlook|icloud|yahoo|postbox|proton)\./.test(f)) return "personal";
  return "other";
}

/** Strip HTML to readable text (Graph/Gmail bodies are often HTML). */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Parse WebVTT (Teams transcript format) into speaker-attributed lines. */
export function parseVtt(vtt: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  const blocks = vtt.replace(/\r/g, "").split(/\n\n+/);
  for (const block of blocks) {
    const rows = block.split("\n").filter((r) => r.trim().length > 0);
    const timingIdx = rows.findIndex((r) => r.includes("-->"));
    if (timingIdx < 0) continue;
    const start = rows[timingIdx].split("-->")[0].trim();
    const text = rows
      .slice(timingIdx + 1)
      .join(" ")
      .trim();
    if (!text) continue;
    const speakerMatch = text.match(/^<v\s+([^>]+)>([\s\S]*?)(<\/v>)?$/);
    const speaker = speakerMatch ? speakerMatch[1].trim() : "Unknown";
    const clean = (speakerMatch ? speakerMatch[2] : text).replace(/<[^>]+>/g, "").trim();
    lines.push({ speaker, at: vttTimeToMs(start), text: clean });
  }
  return mergeConsecutive(lines);
}

function vttTimeToMs(t: string): number {
  const parts = t.split(":").map(Number);
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  return 0;
}

function mergeConsecutive(lines: TranscriptLine[]): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev && prev.speaker === l.speaker && l.at - prev.at < 15_000) prev.text = `${prev.text} ${l.text}`;
    else out.push({ ...l });
  }
  return out;
}

export function snippet(text: string, n = 140): string {
  return text.replace(/\s+/g, " ").trim().slice(0, n);
}
