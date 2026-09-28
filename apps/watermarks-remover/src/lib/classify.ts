import type { VendorClass } from "./types";

const SIGNATURES: Array<[VendorClass, RegExp]> = [
  [
    "claude",
    /anthropic|claude/i,
  ],
  [
    "openai",
    /openai|dall[-·]?e|chatgpt|gpt-?4o|gpt-?image|\bsora\b/i,
  ],
  [
    "gemini",
    /synthid|gemini|imagen|google\s*(ai|llc|inc)|made with google/i,
  ],
];

/** Classify a blob of extracted metadata text into a vendor class. */
export function classifyVendor(text: string, fallback: VendorClass = "generic"): VendorClass {
  for (const [vendor, re] of SIGNATURES) {
    if (re.test(text)) return vendor;
  }
  if (/c2pa|contentauth|jumbf|content\s*credentials|adobe_cai/i.test(text)) return "c2pa";
  return fallback;
}

/** Extract printable ASCII runs from raw bytes (cheap "strings" pass). */
export function extractStrings(bytes: Uint8Array, minLen = 4, maxTotal = 4000): string {
  const out: string[] = [];
  let run: number[] = [];
  let total = 0;
  for (let i = 0; i < bytes.length && total < maxTotal; i++) {
    const b = bytes[i];
    if (b >= 0x20 && b < 0x7f) {
      run.push(b);
    } else {
      if (run.length >= minLen) {
        const s = String.fromCharCode(...run);
        out.push(s);
        total += s.length;
      }
      run = [];
    }
  }
  if (run.length >= minLen) out.push(String.fromCharCode(...run));
  return out.join(" ");
}

/** Short human-readable excerpt for the UI. */
export function makePreview(text: string, max = 180): string | undefined {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  return cleaned.length > max ? cleaned.slice(0, max) + "…" : cleaned;
}
