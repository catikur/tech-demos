import { beforeEach, describe, expect, test } from "bun:test";
import type { Account } from "../shared/types.ts";
import { openMemoryDb } from "../server/db/index.ts";
import { bootstrap, WORK_SPACE_ID } from "../server/bootstrap.ts";
import { accounts, commitments } from "../server/db/repo.ts";
import type { GraphLike } from "../server/connectors/m365.ts";
import { featureRoutes } from "../server/api/features.ts";
import {
  completeTodoTask,
  createTodoTask,
  ensureList,
  pushCommitmentToTodo,
  todoConfigured,
} from "../server/features/ms-tasks.ts";

function fakeGraph(seedLists: { id: string; displayName: string }[] = []) {
  const lists = [...seedLists];
  const calls: { method: string; url: string; body?: any }[] = [];
  let tasks = 0;
  const g = {
    async request(url: string, init: RequestInit = {}) {
      const method = (init.method ?? "GET").toUpperCase();
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, url, body });
      if (method === "POST" && (url === "/me/todo/lists" || url.startsWith("/me/todo/lists?"))) {
        const created = { id: `list-${lists.length + 1}`, displayName: body.displayName };
        lists.push(created);
        return created;
      }
      if (method === "POST" && /\/me\/todo\/lists\/[^/]+\/tasks$/.test(url)) {
        tasks++;
        return { id: `task-${tasks}`, title: body.title };
      }
      if (method === "PATCH" && /\/me\/todo\/lists\/[^/]+\/tasks\/[^/]+$/.test(url)) {
        return { status: body.status };
      }
      throw new Error(`unexpected ${method} ${url}`);
    },
    async collect(url: string) {
      calls.push({ method: "GET", url });
      if (String(url).startsWith("/me/todo/lists")) return { items: lists, deltaLink: null };
      throw new Error(`unexpected collect ${url}`);
    },
  } as GraphLike;
  return { g, calls, lists };
}

const m365: Account = {
  id: "acc_m365",
  spaceId: WORK_SPACE_ID,
  provider: "m365",
  email: "you@lumenlabs.io",
  displayName: "You",
  connectedAt: 0,
  lastSyncAt: null,
  lastSyncError: null,
  capabilities: [],
};

function seedCommitment(id = "cm_todo_1") {
  commitments.insertUnique({
    id,
    spaceId: WORK_SPACE_ID,
    direction: "owed_by_me",
    counterpart: "marcus@lumenlabs.io",
    text: "Send the postmortem by Wednesday",
    dueAt: Date.UTC(2026, 8, 16, 12),
    status: "open",
    source: { kind: "thread", id: "t-postmortem", label: "Postmortem" },
    confidence: 0.9,
  });
}

describe("Microsoft To Do helpers", () => {
  test("todoConfigured is true only for m365 accounts", () => {
    expect(todoConfigured(m365)).toBe(true);
    expect(todoConfigured({ ...m365, provider: "demo" })).toBe(false);
    expect(todoConfigured({ ...m365, provider: "gmail" })).toBe(false);
  });

  test("ensureList reuses an existing list named Agentic Inbox", async () => {
    const { g, calls } = fakeGraph([{ id: "list-existing", displayName: "Agentic Inbox" }]);
    const id = await ensureList(g, "Agentic Inbox");
    expect(id).toBe("list-existing");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(calls.some((c) => c.method === "GET" && String(c.url).startsWith("/me/todo/lists"))).toBe(true);
  });

  test("ensureList POSTs a new list when none match the name", async () => {
    const { g, calls } = fakeGraph([{ id: "other", displayName: "Tasks" }]);
    const id = await ensureList(g, "Agentic Inbox");
    expect(id).toBe("list-2");
    const created = calls.find((c) => c.method === "POST" && c.url === "/me/todo/lists");
    expect(created?.body).toEqual({ displayName: "Agentic Inbox" });
  });

  test("createTodoTask posts title, UTC dueDateTime and text body", async () => {
    const { g, calls } = fakeGraph([{ id: "list-ai", displayName: "Agentic Inbox" }]);
    const dueAt = Date.UTC(2026, 8, 16, 12);
    const result = await createTodoTask(g, {
      title: "Send the postmortem",
      dueAt,
      body: "From thread: Postmortem",
    });
    expect(result).toEqual({ listId: "list-ai", taskId: "task-1" });
    const post = calls.find((c) => c.method === "POST" && String(c.url).includes("/tasks"));
    expect(post?.url).toBe("/me/todo/lists/list-ai/tasks");
    expect(post?.body.title).toBe("Send the postmortem");
    expect(post?.body.dueDateTime).toEqual({
      dateTime: new Date(dueAt).toISOString().replace(/\.\d{3}Z$/, ""),
      timeZone: "UTC",
    });
    expect(post?.body.body).toEqual({ content: "From thread: Postmortem", contentType: "text" });
  });

  test("createTodoTask omits due and body when not provided", async () => {
    const { g, calls } = fakeGraph([{ id: "list-ai", displayName: "Agentic Inbox" }]);
    await createTodoTask(g, { title: "No due" });
    const post = calls.find((c) => c.method === "POST" && String(c.url).includes("/tasks"));
    expect(post?.body.title).toBe("No due");
    expect(post?.body.dueDateTime).toBeUndefined();
    expect(post?.body.body).toBeUndefined();
  });
});

describe("push and complete against a memory db", () => {
  beforeEach(() => {
    openMemoryDb();
    bootstrap();
    accounts.insert(m365, null);
    seedCommitment();
  });

  test("pushCommitmentToTodo errors when the space has no m365 account", async () => {
    accounts.remove(m365.id);
    const { g } = fakeGraph();
    await expect(pushCommitmentToTodo("cm_todo_1", g)).rejects.toThrow(/microsoft 365/i);
  });

  test("pushCommitmentToTodo creates a To Do task and stores list + task ids", async () => {
    const { g, calls } = fakeGraph();
    const result = await pushCommitmentToTodo("cm_todo_1", g);
    expect(result.listId).toBeTruthy();
    expect(result.taskId).toBe("task-1");
    const stored = commitments.get("cm_todo_1")!;
    expect(stored.msTaskId).toBe("task-1");
    expect(calls.some((c) => c.method === "POST" && String(c.url).endsWith("/tasks"))).toBe(true);
    const post = calls.find((c) => c.method === "POST" && String(c.url).endsWith("/tasks"));
    expect(post?.body.title).toBe("Send the postmortem by Wednesday");
  });

  test("pushCommitmentToTodo is idempotent when already linked", async () => {
    const { g, calls } = fakeGraph();
    await pushCommitmentToTodo("cm_todo_1", g);
    calls.length = 0;
    const again = await pushCommitmentToTodo("cm_todo_1", g);
    expect(again.taskId).toBe("task-1");
    expect(calls).toHaveLength(0);
  });

  test("completeTodoTask is a no-op when the commitment has no ms_task_id", async () => {
    const { g, calls } = fakeGraph();
    await completeTodoTask("cm_todo_1", g);
    expect(calls).toHaveLength(0);
  });

  test("completeTodoTask PATCHes status completed on the linked task", async () => {
    const { g, calls } = fakeGraph();
    await pushCommitmentToTodo("cm_todo_1", g);
    calls.length = 0;
    await completeTodoTask("cm_todo_1", g);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.url).toBe("/me/todo/lists/list-1/tasks/task-1");
    expect(patch?.body).toEqual({ status: "completed" });
  });
});

describe("commitment API routes", () => {
  beforeEach(() => {
    openMemoryDb();
    bootstrap();
    accounts.insert(m365, null);
    seedCommitment("cm_api_1");
  });

  test("POST /api/commitments/:id/todo returns 404 for an unknown id", async () => {
    const req = Object.assign(new Request("http://local/api/commitments/nope/todo", { method: "POST" }), {
      params: { id: "nope" },
    });
    const res = await featureRoutes["/api/commitments/:id/todo"].POST(req as any);
    expect(res.status).toBe(404);
  });

  test("POST /api/commitments/:id/todo returns 400 when the space has no m365 account", async () => {
    accounts.remove(m365.id);
    const req = Object.assign(new Request("http://local/api/commitments/cm_api_1/todo", { method: "POST" }), {
      params: { id: "cm_api_1" },
    });
    const res = await featureRoutes["/api/commitments/:id/todo"].POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/microsoft 365/i);
  });

  test("PATCH /api/commitments/:id to done succeeds when no To Do task is linked", async () => {
    const req = Object.assign(
      new Request("http://local/api/commitments/cm_api_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      }),
      { params: { id: "cm_api_1" } },
    );
    const res = await featureRoutes["/api/commitments/:id"].PATCH(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("done");
  });
});
