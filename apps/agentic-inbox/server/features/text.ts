/** Small, dependency-free text heuristics shared by the feature modules. */
import { createHash } from "node:crypto";

const DAY = 86_400_000;

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export const STOPWORDS = new Set(
  (
    "a an the and or but if then so of to in on at for from by with about as into like through after over between out against during without before under around among " +
    "i me my mine you your yours he him his she her hers it its we us our they them their this that these those what which who whom whose where when why how " +
    "is are was were be been being have has had do does did will would can could should may might must shall " +
    "not no nor yes just also very too really only even still already again here there all any both each few more most other some such own same " +
    "re fw fwd hi hello hey thanks thank please regards best cheers ok okay sure yeah today tomorrow yesterday week next last " +
    "email mail message thread meeting call invite invitation reply sent get got let know need want think going make take see " +
    "monday tuesday wednesday thursday friday saturday sunday mon tue wed thu fri sat sun morning afternoon tonight " +
    "attached attach happy keep send sending two three one first end month day days hour hours real now great following join moved seen " +
    "list include notes window reminder quick update updated chance mind time thing things way back over sure works work place new " +
    "ve veya ile bir bu şu o da de ki için gibi daha en çok az ben sen biz siz onlar evet hayır tamam merhaba selam teşekkür lütfen rica " +
    "eposta mesaj toplantı çağrı kadar olan olarak üzere mi mı mu mü misin mısın musun müsün " +
    "bugün yarın pazartesi salı çarşamba perşembe cuma cumartesi pazar " +
    "ocak şubat mart nisan mayıs haziran temmuz ağustos eylül ekim kasım aralık"
  ).split(/\s+/),
);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s#-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

export function normalizeTitle(title: string): string {
  return title
    .replace(/^((re|fw|fwd|aw|wg|invitation|accepted|declined|tentative|updated invitation|canceled|cancelled)\s*:\s*)+/i, "")
    .replace(/[—–-]\s*(thu|fri|mon|tue|wed|sat|sun)[^,]*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

const ASK_PATTERNS = [
  /\?\s*$/,
  /\b(can|could|would|will)\s+you\b/i,
  /\bplease\b/i,
  /\bneed(s)? you to\b/i,
  /\bsend (me|us|over)\b/i,
  /\blet (me|us) know\b/i,
  /\breply to confirm\b/i,
  /\bany chance\b/i,
  /\bwhat do you think\b/i,
  /\bthoughts\?/i,
  /\byou in\b/i,
  /\bare you (coming|able|free|around)\b/i,
  /\blütfen\b/iu,
  /(misin|mısın|musun|müsün)\b/iu,
  /\bolur\s+mu\b/iu,
  /\brica etsem\b/iu,
  /\bmümkün mü\b/iu,
  /\b(yapabilir|gönderir|bakar)\s+mi/iu,
];

export function isAsk(text: string): boolean {
  return ASK_PATTERNS.some((re) => re.test(text));
}

const PROMISE_PATTERNS = [
  /\bi'?ll\b/i,
  /\bi will\b/i,
  /\bwe'?ll\b/i,
  /\bwe will\b/i,
  /\bi can (ship|send|do|have|write|get|take|handle|circulate|share|add|follow)\b/i,
  /\blet me (send|check|get|write|circulate|share|handle|follow)\b/i,
  /\bi'?m going to\b/i,
  /\bwill (send|do|get|have|write|circulate|share|follow up|add|ship|notify|book|call)\b/i,
  /(eceğim|acağım|eceğiz|acağız|edeceğim|edeceğiz)\b/iu,
];

export function isPromise(text: string): boolean {
  return PROMISE_PATTERNS.some((re) => re.test(text));
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Longest first so "cumartesi" is not eaten by "cuma". */
const TR_WEEKDAYS: [number, string][] = [
  [6, "cumartesi"],
  [1, "pazartesi"],
  [3, "çarşamba"],
  [3, "carsamba"],
  [4, "perşembe"],
  [4, "persembe"],
  [2, "salı"],
  [2, "sali"],
  [5, "cuma"],
  [0, "pazar"],
];
const TR_MONTH_INDEX: Record<string, number> = {
  ocak: 0,
  subat: 1,
  şubat: 1,
  mart: 2,
  nisan: 3,
  mayis: 4,
  mayıs: 4,
  haziran: 5,
  temmuz: 6,
  agustos: 7,
  ağustos: 7,
  eylul: 8,
  eylül: 8,
  ekim: 9,
  kasim: 10,
  kasım: 10,
  aralik: 11,
  aralık: 11,
};
const TR_MONTH_RE = "ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik";

/**
 * Resolve a due date mentioned in text relative to `ref` (message time).
 * Returns end-of-day (17:00 UTC) timestamps; null when nothing is found.
 */
export function parseDue(text: string, ref: number = Date.now()): number | null {
  const t = text.toLowerCase().replace(/['’][^\s]*/g, "");
  const base = new Date(ref);
  const eod = (d: Date) => {
    const x = new Date(d);
    x.setUTCHours(17, 0, 0, 0);
    return x.getTime();
  };
  if (/\b(today|eod|end of day|by tonight|bugün)\b/.test(t)) return eod(base);
  if (/\b(tomorrow|yarın)\b/.test(t)) return eod(new Date(ref + DAY));
  if (/\b(end of (the )?week|eow|this week|bu hafta)\b/.test(t)) {
    const d = new Date(base);
    const delta = (5 - d.getUTCDay() + 7) % 7 || 5;
    return eod(new Date(ref + delta * DAY));
  }
  if (/\b(next week|haftaya)\b/.test(t)) {
    const d = new Date(base);
    const delta = ((1 - d.getUTCDay() + 7) % 7 || 7) + 4; // next Friday
    return eod(new Date(ref + delta * DAY));
  }
  const trMonth = t.match(new RegExp(`\\b(\\d{1,2})\\s+(${TR_MONTH_RE})\\b`, "u"));
  if (trMonth) {
    const dayNum = Number(trMonth[1]);
    const mon = TR_MONTH_INDEX[trMonth[2]];
    if (mon !== undefined) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), mon, dayNum, 17));
      if (d.getTime() < ref - 30 * DAY) d.setUTCFullYear(d.getUTCFullYear() + 1);
      return d.getTime();
    }
  }
  const monthMatch = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthMatch) {
    const day = Number(monthMatch[1] ?? monthMatch[4]);
    const mon = MONTHS.indexOf((monthMatch[2] ?? monthMatch[3]).slice(0, 3));
    const d = new Date(Date.UTC(base.getUTCFullYear(), mon, day, 17));
    if (d.getTime() < ref - 30 * DAY) d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.getTime();
  }
  const onThe = t.match(/\bon the (\d{1,2})(?:st|nd|rd|th)\b/);
  if (onThe) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), Number(onThe[1]), 17));
    if (d.getTime() < ref) d.setUTCMonth(d.getUTCMonth() + 1);
    return d.getTime();
  }
  for (const [i, name] of TR_WEEKDAYS) {
    if (t.includes(name)) {
      let delta = (i - base.getUTCDay() + 7) % 7;
      if (delta === 0 && !/\b(this|bu)\b/.test(t)) delta = 7;
      return eod(new Date(ref + delta * DAY));
    }
  }
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const re = new RegExp(`\\b(${WEEKDAYS[i]}|${WEEKDAYS[i].slice(0, 3)})\\b`);
    if (re.test(t)) {
      let delta = (i - base.getUTCDay() + 7) % 7;
      if (delta === 0 && !/\bthis\b/.test(t)) delta = 7;
      return eod(new Date(ref + delta * DAY));
    }
  }
  return null;
}

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function truncate(text: string, n = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n - 1)}…` : clean;
}

export function isAutomatedSender(from: string): boolean {
  return /\b(no-?reply|noreply|do-?not-?reply|notifications?|digest|newsletter|billing|accounts?|mailer|alerts?)@|<(no-?reply|noreply)/i.test(from);
}
