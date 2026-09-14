import type { Space } from "../shared/types.ts";
import { accounts, settings, spaces, wipeDerivedData } from "./db/repo.ts";

export const WORK_SPACE_ID = "space_work";
export const PERSONAL_SPACE_ID = "space_personal";

const DEFAULT_SPACES: Space[] = [
  {
    id: WORK_SPACE_ID,
    kind: "work",
    name: "Work",
    color: "#f6821f",
    quietHours: [19, 8],
    digestHour: 8,
    agentTone: "concise",
    signature: "Best,\nYou",
  },
  {
    id: PERSONAL_SPACE_ID,
    kind: "personal",
    name: "Personal",
    color: "#38bdf8",
    quietHours: [9, 18],
    digestHour: 19,
    agentTone: "warm",
    signature: "",
  },
];

/**
 * Idempotent startup: ensure Work + Personal spaces exist. Demo mailboxes are
 * never seeded here — connect real Microsoft 365 / Gmail from Settings.
 * Leftover demo accounts from an older install are removed.
 */
export function bootstrap(): { seededDemo: boolean } {
  for (const s of DEFAULT_SPACES) {
    if (!spaces.get(s.id)) spaces.upsert(s);
  }
  for (const account of accounts.all().filter((a) => a.provider === "demo")) {
    accounts.remove(account.id);
  }
  if (accounts.all().length === 0) wipeDerivedData();
  if (accounts.all().every((a) => a.provider !== "demo")) settings.set("demo_removed", "1");
  return { seededDemo: false };
}

export function isDemoMode(): boolean {
  return accounts.all().some((a) => a.provider === "demo");
}
