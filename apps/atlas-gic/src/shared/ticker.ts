/** Allowed Yahoo-style equity symbols for the desk (no URLs/paths). */
export function sanitizeTicker(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  if (!t || t.includes("\0") || t.length > 16) return null;
  if (!/^\^?[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(t)) return null;
  return t;
}
