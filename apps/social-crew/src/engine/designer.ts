import type { BrandFont, BrandKit } from "./types";
import { escapeXml, roundTo } from "./text";

export const DEFAULT_BRAND: BrandKit = {
  name: "Nera Desk",
  logoText: "ND",
  ink: "#1C1915",
  paper: "#F4EFE4",
  accent: "#C2410C",
  font: "serif",
};

const FONT_STACK: Record<BrandFont, string> = {
  serif: "Georgia, Palatino, serif",
  sans: "Avenir Next, Segoe UI, sans-serif",
  mono: "ui-monospace, SFMono-Regular, monospace",
};

export function normalizeHex(value: string, fallback: string): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
  return match ? `#${match[1]!.toUpperCase()}` : fallback;
}

function channel(value: number): number {
  const scale = value / 255;
  return scale <= 0.03928 ? scale / 12.92 : ((scale + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const raw = hex.slice(1);
  const red = channel(Number.parseInt(raw.slice(0, 2), 16));
  const green = channel(Number.parseInt(raw.slice(2, 4), 16));
  const blue = channel(Number.parseInt(raw.slice(4, 6), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(paper: string, ink: string): number {
  const left = relativeLuminance(normalizeHex(paper, "#FFFFFF"));
  const right = relativeLuminance(normalizeHex(ink, "#000000"));
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return roundTo((lighter + 0.05) / (darker + 0.05), 2);
}

export function wrapHeadline(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = "";
  let index = 0;
  while (index < words.length && lines.length < maxLines) {
    const word = words[index] ?? "";
    const room = lines.length === maxLines - 1 ? maxChars - 1 : maxChars;
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= room) {
      current = candidate;
      index += 1;
      continue;
    }
    if (!current) {
      lines.push(`${word.slice(0, Math.max(1, room - 1))}…`);
      index = words.length;
      current = "";
      break;
    }
    lines.push(current);
    current = "";
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (index < words.length && lines.length > 0) {
    const last = lines[lines.length - 1] ?? "";
    lines[lines.length - 1] = last.endsWith("…") ? last : `${last}…`;
  }
  return lines.slice(0, maxLines);
}

export function renderCard(input: { brand: BrandKit; kicker: string; headline: string }): string {
  const ink = normalizeHex(input.brand.ink, DEFAULT_BRAND.ink);
  const paper = normalizeHex(input.brand.paper, DEFAULT_BRAND.paper);
  const accent = normalizeHex(input.brand.accent, DEFAULT_BRAND.accent);
  const font = FONT_STACK[input.brand.font];
  const lines = wrapHeadline(input.headline, 34, 4);
  const text = lines
    .map(
      (line, index) =>
        `<text x="72" y="${250 + index * 68}" fill="${ink}" font-family="${escapeXml(font)}" font-size="54">${escapeXml(line)}</text>`,
    )
    .join("");
  const ratio = contrastRatio(paper, ink);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="628" viewBox="0 0 1200 628" role="img" aria-label="${escapeXml(input.headline)}">
  <rect width="1200" height="628" fill="${paper}"/>
  <rect width="18" height="628" fill="${accent}"/>
  <text x="72" y="92" fill="${accent}" font-family="${escapeXml(font)}" font-size="28" letter-spacing="4">${escapeXml(input.brand.logoText)}</text>
  <text x="72" y="168" fill="${ink}" opacity="0.72" font-family="${escapeXml(font)}" font-size="18">${escapeXml(input.kicker.toUpperCase())}</text>
  ${text}
  <text x="72" y="560" fill="${ink}" font-family="${escapeXml(font)}" font-size="18">Draft · not posted · contrast ${ratio.toFixed(2)}</text>
</svg>`;
}
