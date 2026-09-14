import { describe, expect, test } from "bun:test";
import { openMemoryDb } from "../server/db/index.ts";
import { bootstrap, isDemoMode } from "../server/bootstrap.ts";
import { accounts, spaces } from "../server/db/repo.ts";

describe("bootstrap (no demo seed)", () => {
  test("creates Work and Personal spaces and does not insert demo accounts", () => {
    openMemoryDb();
    const result = bootstrap();
    expect(result.seededDemo).toBe(false);
    expect(spaces.all().map((s) => s.id).sort()).toEqual(["space_personal", "space_work"]);
    expect(accounts.all()).toEqual([]);
    expect(isDemoMode()).toBe(false);
  });
});
