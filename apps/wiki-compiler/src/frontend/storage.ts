import { seedVault } from "../data/seed.ts";
import { DEFAULT_SKILLS, type SkillToggles, type Vault } from "../lib/types.ts";

const KEY = "wiki-compiler.v1";

export type Persisted = {
  vault: Vault;
  skills: SkillToggles;
  theme: "light" | "dark";
  extraSources?: unknown;
};

export function loadState(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (!parsed.vault || !Array.isArray(parsed.vault.notes)) return fresh();
    return {
      vault: parsed.vault,
      skills: { ...DEFAULT_SKILLS, ...parsed.skills },
      theme: parsed.theme === "dark" ? "dark" : "light",
    };
  } catch {
    return fresh();
  }
}

export function saveState(state: Persisted): void {
  localStorage.setItem(KEY, JSON.stringify({ vault: state.vault, skills: state.skills, theme: state.theme }));
}

export function fresh(): Persisted {
  return { vault: seedVault(), skills: { ...DEFAULT_SKILLS }, theme: "light" };
}
