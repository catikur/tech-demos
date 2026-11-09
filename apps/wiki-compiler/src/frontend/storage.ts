import { seedVault } from "../data/seed.ts";
import { normalizeVault } from "../lib/vault.ts";
import { DEFAULT_SKILLS, type RawSource, type SkillToggles, type Vault } from "../lib/types.ts";

const KEY = "wiki-compiler.v1";

export type Persisted = {
  vault: Vault;
  skills: SkillToggles;
  theme: "light" | "dark";
  extras: RawSource[];
};

export function loadState(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (!parsed.vault || !Array.isArray(parsed.vault.notes)) return fresh();
    return {
      vault: normalizeVault(parsed.vault),
      skills: { ...DEFAULT_SKILLS, ...parsed.skills },
      theme: parsed.theme === "dark" ? "dark" : "light",
      extras: Array.isArray(parsed.extras) ? parsed.extras.filter(isRawSource) : [],
    };
  } catch {
    return fresh();
  }
}

export function saveState(state: Persisted): void {
  localStorage.setItem(
    KEY,
    JSON.stringify({ vault: state.vault, skills: state.skills, theme: state.theme, extras: state.extras }),
  );
}

function isRawSource(value: unknown): value is RawSource {
  if (!value || typeof value !== "object") return false;
  const source = value as RawSource;
  return typeof source.id === "string" && typeof source.title === "string" && typeof source.markdown === "string" && Array.isArray(source.claims);
}

export function fresh(): Persisted {
  return { vault: seedVault(), skills: { ...DEFAULT_SKILLS }, theme: "light", extras: [] };
}
