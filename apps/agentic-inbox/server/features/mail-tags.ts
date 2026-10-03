import type { MailTag } from "../../shared/types.ts";
import { settings } from "../db/repo.ts";

const KEY = "mail.tags";

const SYSTEM: MailTag[] = [
  { id: "newsletter", name: "Bülten", description: "Toplu bülten veya pazarlama. Kişisel yanıt beklenmez.", enabled: true, system: true },
  { id: "security", name: "Güvenlik", description: "Oturum, parola, doğrulama kodu veya güvenlik uyarısı.", enabled: true, system: true },
];

const DEFAULTS: MailTag[] = [
  { id: "support", name: "Destek", description: "Sorun, hata veya yardım isteği.", enabled: true, system: false },
  { id: "invite", name: "Davet", description: "Takvim daveti veya RSVP.", enabled: true, system: false },
  { id: "billing", name: "Fatura", description: "Fatura, ödeme, makbuz veya abonelik.", enabled: true, system: false },
  { id: "recruiting", name: "İşe alım", description: "Pozisyon, aday veya mülakat.", enabled: true, system: false },
  { id: "personal", name: "Kişisel", description: "Kişisel not, iş süreci değil.", enabled: true, system: false },
  { id: "project", name: "Proje", description: "Spec, inceleme, yol haritası veya taslak.", enabled: true, system: false },
  { id: "other", name: "Diğer", description: "Diğer etiketlerin hiçbiri uymuyor.", enabled: true, system: false },
];

function slug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return base.length >= 2 ? base : "tag";
}

export function listMailTags(): MailTag[] {
  const raw = settings.get(KEY);
  if (!raw) return [...SYSTEM, ...DEFAULTS];
  try {
    const parsed = JSON.parse(raw) as MailTag[];
    if (!Array.isArray(parsed)) return [...SYSTEM, ...DEFAULTS];
    const byId = new Map(parsed.filter((t) => t && typeof t.id === "string").map((t) => [t.id, t]));
    const system = SYSTEM.map((s) => ({ ...s, ...(byId.get(s.id) ?? {}), id: s.id, system: true, enabled: true }));
    const rest = parsed.filter((t) => !SYSTEM.some((s) => s.id === t.id) && /^[a-z0-9-]{2,32}$/.test(t.id));
    return [...system, ...rest.map((t) => ({ ...t, system: false, enabled: t.enabled !== false }))].slice(0, 24);
  } catch {
    return [...SYSTEM, ...DEFAULTS];
  }
}

export function saveMailTags(input: MailTag[]): MailTag[] {
  const current = listMailTags();
  const systemIds = new Set(SYSTEM.map((s) => s.id));
  const next: MailTag[] = [];
  const seen = new Set<string>();
  for (const tag of input) {
    const name = tag.name?.trim().slice(0, 40);
    if (!name) continue;
    let id = systemIds.has(tag.id) ? tag.id : slug(tag.id || name);
    if (!systemIds.has(id)) {
      let n = 2;
      const base = id;
      while (seen.has(id) || systemIds.has(id)) id = `${base}-${n++}`.slice(0, 32);
    }
    if (seen.has(id)) continue;
    seen.add(id);
    next.push({
      id,
      name,
      description: (tag.description ?? "").trim().slice(0, 180),
      enabled: systemIds.has(id) ? true : tag.enabled !== false,
      system: systemIds.has(id),
    });
  }
  for (const s of SYSTEM) {
    if (!seen.has(s.id)) next.unshift({ ...s, ...(current.find((t) => t.id === s.id) ?? {}) , id: s.id, system: true, enabled: true });
  }
  const stored = next.slice(0, 24);
  settings.set(KEY, JSON.stringify(stored));
  return stored;
}
