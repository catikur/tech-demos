import type { Space } from "../shared/types.ts";
import { accounts, settings, spaces } from "./db/repo.ts";
import { demoAccounts } from "./connectors/demo.ts";

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
 * Idempotent startup: make sure both spaces exist and, when the user has never
 * connected anything, seed the two demo accounts so the app is useful with zero
 * credentials. Demo accounts can be removed from Settings once real ones exist.
 */
export function bootstrap(): { seededDemo: boolean } {
  for (const s of DEFAULT_SPACES) {
    if (!spaces.get(s.id)) spaces.upsert(s);
  }
  let seededDemo = false;
  if (accounts.all().length === 0 && settings.get("demo_removed") !== "1") {
    for (const a of demoAccounts({ work: WORK_SPACE_ID, personal: PERSONAL_SPACE_ID })) {
      accounts.insert(a, null);
    }
    seededDemo = true;
  }
  return { seededDemo };
}

export function isDemoMode(): boolean {
  return accounts.all().some((a) => a.provider === "demo");
}
