import type { Account } from "../../shared/types.ts";
import { GraphClient, type GraphLike } from "../connectors/m365.ts";
import { accounts, commitments } from "../db/repo.ts";
import { env } from "../env.ts";

export const TODO_LIST_NAME = "Agentic Inbox";

export function todoConfigured(account: Account): boolean {
  return account.provider === "m365";
}

function m365InSpace(spaceId: string): Account | undefined {
  return accounts.all().find((a) => a.spaceId === spaceId && a.provider === "m365");
}

function graphFor(account: Account, g?: GraphLike): GraphLike {
  return g ?? new GraphClient(account.id);
}

function utcDateTime(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "");
}

/** Find or create a To Do list by display name. Returns the list id. */
export async function ensureList(g: GraphLike, name: string): Promise<string> {
  const { items } = await g.collect<{ id: string; displayName?: string }>("/me/todo/lists");
  const existing = items.find((l) => l.displayName === name);
  if (existing?.id) return existing.id;
  const created = await g.request<{ id: string }>("/me/todo/lists", {
    method: "POST",
    body: JSON.stringify({ displayName: name }),
  });
  if (!created?.id) throw new Error("Microsoft To Do did not return a list id");
  return created.id;
}

export async function createTodoTask(
  g: GraphLike,
  opts: { title: string; dueAt?: number | null; body?: string; listId?: string },
): Promise<{ listId: string; taskId: string }> {
  const listId = opts.listId ?? (await ensureList(g, TODO_LIST_NAME));
  const payload: Record<string, unknown> = { title: opts.title };
  if (opts.dueAt) {
    payload.dueDateTime = { dateTime: utcDateTime(opts.dueAt), timeZone: "UTC" };
  }
  if (opts.body) {
    payload.body = { content: opts.body, contentType: "text" };
  }
  const created = await g.request<{ id: string }>(`/me/todo/lists/${listId}/tasks`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!created?.id) throw new Error("Microsoft To Do did not return a task id");
  return { listId, taskId: created.id };
}

export async function pushCommitmentToTodo(
  commitmentId: string,
  g?: GraphLike,
): Promise<{ listId: string; taskId: string }> {
  const c = commitments.get(commitmentId);
  if (!c) throw new Error("Commitment not found");
  const already = commitments.msTask(commitmentId);
  if (already) return already;
  const account = m365InSpace(c.spaceId);
  if (!account) throw new Error("No Microsoft 365 account in this space");
  const client = graphFor(account, g);
  const body = `From ${c.source.kind}: ${c.source.label}\nCounterpart: ${c.counterpart}`;
  const ids = await createTodoTask(client, { title: c.text, dueAt: c.dueAt, body });
  commitments.setMsTask(commitmentId, ids.listId, ids.taskId);
  await maybePushPlanner(client, c.text, c.dueAt);
  return ids;
}

/** No-op when the commitment has no linked To Do task. */
export async function completeTodoTask(commitmentId: string, g?: GraphLike): Promise<void> {
  const c = commitments.get(commitmentId);
  if (!c) return;
  const link = commitments.msTask(commitmentId);
  if (!link) return;
  const account = m365InSpace(c.spaceId);
  if (!account) return;
  const client = graphFor(account, g);
  await client.request(`/me/todo/lists/${link.listId}/tasks/${link.taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed" }),
  });
}

/** Optional: create a Planner task when `MS_PLANNER_PLAN_ID` is set. Failures are logged, not thrown. */
async function maybePushPlanner(g: GraphLike, title: string, dueAt: number | null): Promise<void> {
  const planId = env.microsoft.plannerPlanId;
  if (!planId) return;
  try {
    const payload: Record<string, unknown> = { planId, title };
    if (dueAt) payload.dueDateTime = new Date(dueAt).toISOString();
    await g.request("/planner/tasks", { method: "POST", body: JSON.stringify(payload) });
  } catch (err) {
    console.warn("[todo] Planner skip:", err instanceof Error ? err.message : err);
  }
}
