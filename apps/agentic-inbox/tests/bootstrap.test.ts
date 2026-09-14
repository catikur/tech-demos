import { describe, expect, test } from "bun:test";
import { openMemoryDb } from "../server/db/index.ts";
import { bootstrap, isDemoMode, WORK_SPACE_ID } from "../server/bootstrap.ts";
import { demoAccounts } from "../server/connectors/demo.ts";
import { accounts, commitments, spaces } from "../server/db/repo.ts";

describe("bootstrap (no demo seed)", () => {
  test("creates Work and Personal spaces and does not insert demo accounts", () => {
    openMemoryDb();
    const result = bootstrap();
    expect(result.seededDemo).toBe(false);
    expect(spaces.all().map((s) => s.id).sort()).toEqual(["space_personal", "space_work"]);
    expect(accounts.all()).toEqual([]);
    expect(isDemoMode()).toBe(false);
  });

  test("removing leftover demo accounts also drops the extracted ledger", () => {
    openMemoryDb();
    bootstrap();
    for (const a of demoAccounts({ work: WORK_SPACE_ID, personal: "space_personal" })) {
      accounts.insert(a, null);
    }
    commitments.insertUnique({
      spaceId: WORK_SPACE_ID,
      direction: "owed_by_me",
      counterpart: "marcus@lumenlabs.io",
      text: "Write the postmortem",
      dueAt: null,
      status: "open",
      source: { kind: "manual", id: "ui", label: "Added manually" },
      confidence: 1,
    });
    expect(commitments.list(WORK_SPACE_ID)).toHaveLength(1);
    bootstrap();
    expect(accounts.all()).toEqual([]);
    expect(commitments.list(null)).toEqual([]);
    expect(isDemoMode()).toBe(false);
  });
});
