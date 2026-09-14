import { openMemoryDb } from "../server/db/index.ts";
import { bootstrap, PERSONAL_SPACE_ID, WORK_SPACE_ID } from "../server/bootstrap.ts";
import { demoAccounts } from "../server/connectors/demo.ts";
import { accounts } from "../server/db/repo.ts";
import { syncAccount } from "../server/sync/engine.ts";

export { WORK_SPACE_ID, PERSONAL_SPACE_ID };

/** Fresh in-memory database with the fixture Work + Personal demo mailboxes (tests only). */
export async function seededDb(): Promise<void> {
  openMemoryDb();
  bootstrap();
  for (const a of demoAccounts({ work: WORK_SPACE_ID, personal: PERSONAL_SPACE_ID })) {
    accounts.insert(a, null);
  }
  for (const account of accounts.all()) await syncAccount(account, {});
}

export async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}
