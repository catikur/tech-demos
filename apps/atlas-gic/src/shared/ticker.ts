/** Allowed symbols for Yahoo or Bybit (no URLs/paths). Bybit perps can run to 19+ chars. */
export function sanitizeTicker(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  if (!t || t.includes("\0") || t.length > 24) return null;
  if (!/^\^?[A-Z0-9][A-Z0-9.\-]{0,23}$/.test(t)) return null;
  return t;
}
