import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { decisionsUrl, jevDecide, jevModel, setJevTransportForTests } from "../server/agent/jev.ts";
import { applyMailAnswers, flushMailJudgements, judgeMail, preserveJevLabels, resetMailJudgementQueue, scheduleMailJudgement } from "../server/agent/jev-mail.ts";
import { routeTools } from "../server/agent/jev-route.ts";
import { jevAllowsSideEffect } from "../server/agent/jev-gate.ts";
import { accounts, threads } from "../server/db/repo.ts";
import type { AgentContext } from "../shared/types.ts";
import { seededDb, WORK_SPACE_ID } from "./helpers.ts";

const ctx = (over: Partial<AgentContext> = {}): AgentContext => ({
  spaceId: WORK_SPACE_ID,
  selectedThreadId: null,
  selectedChatId: null,
  selectedEventId: null,
  ...over,
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Jev decisions client", () => {
  beforeAll(seededDb);
  afterEach(() => {
    setJevTransportForTests(null);
    resetMailJudgementQueue();
  });

  test("decisions URL sits beside the chat API, not inside chat/completions", () => {
    expect(decisionsUrl("https://openrouter.ai/api/v1")).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(decisionsUrl("http://127.0.0.1:9")).toBe("http://127.0.0.1:9/decisions");
    expect(jevModel()).toBe("typesafe/jev-1.13");
  });

  test("a mock provider never calls Jev", async () => {
    let called = false;
    setJevTransportForTests(async () => {
      called = true;
      return jsonResponse({});
    });
    setJevTransportForTests(null);
    expect(await jevDecide({ ticket: "x" }, { q: { type: "noul", instructions: "yes?" } })).toBeNull();
    expect(called).toBe(false);
  });

  test("mail judgement keeps the heuristic when the category is unsure", () => {
    const result = applyMailAnswers("other", {
      category: { type: "choice", choice: "billing", confidence: 0.2, probabilities: { billing: 0.3, other: 0.2 } },
      needs_reply: { type: "noul", noul: 0.9 },
      urgency: { type: "score", score: 1.8, confidence: 0.8, probabilities: {} },
    });
    expect(result.category).toBe("other");
    expect(result.labels).toContain("needs-reply");
    expect(result.labels).toContain("urgent");
    expect(result.judged).toBe(true);
  });

  test("gmail label rebuild keeps Jev labels", () => {
    expect(preserveJevLabels(["needs-reply", "jev:judged", "starred"], ["category_personal"])).toEqual([
      "category_personal",
      "needs-reply",
      "jev:judged",
    ]);
  });

  test("judgeMail sends Choice, Noul and Score and does not ask for prose", async () => {
    let body: any = null;
    setJevTransportForTests(async (_url, init) => {
      body = JSON.parse(String(init.body));
      return jsonResponse({
        answers: {
          category: { type: "choice", choice: "billing", confidence: 0.8, probabilities: { billing: 0.8 } },
          needs_reply: { type: "noul", noul: 0.2 },
          urgency: { type: "score", score: 0.2, confidence: 0.7, probabilities: {} },
        },
      });
    });
    const result = await judgeMail({ subject: "Fatura", from: "maliye@firma.com", body: "Ödeme bugün." });
    expect(body.model).toBe("typesafe/jev-1.13");
    expect(body.questions.category.type).toBe("choice");
    expect(body.questions.needs_reply.type).toBe("noul");
    expect(body.questions.urgency.type).toBe("score");
    expect(body.messages).toBeUndefined();
    expect(result.category).toBe("billing");
    expect(result.labels).toContain("no-reply");
  });

  test("a new thread is reclassified in the background", async () => {
    const account = accounts.all()[0]!;
    threads.upsert({
      id: "t-jev",
      externalId: "ext-jev",
      spaceId: WORK_SPACE_ID,
      accountId: account.id,
      subject: "Fatura",
      category: "other",
      labels: [],
      unread: true,
      lastAt: Date.now(),
      participants: [],
    });
    setJevTransportForTests(async () =>
      jsonResponse({
        answers: {
          category: { type: "choice", choice: "billing", confidence: 0.9, probabilities: {} },
          needs_reply: { type: "noul", noul: 0.95 },
          urgency: { type: "score", score: 0.4, confidence: 0.5, probabilities: {} },
        },
      }),
    );
    scheduleMailJudgement("t-jev", { subject: "Fatura", from: "a@b.c", body: "öde" });
    await flushMailJudgements();
    const saved = threads.get("t-jev");
    expect(saved?.category).toBe("billing");
    expect(saved?.labels).toContain("needs-reply");
    expect(saved?.labels).toContain("jev:judged");
  });

  test("a confident tool pick narrows the catalogue; a low need removes tools", async () => {
    const specs = [
      { name: "list_threads", description: "List mail", parameters: {} },
      { name: "search_vault", description: "Search files", parameters: {} },
    ];
    setJevTransportForTests(async () =>
      jsonResponse({
        answers: {
          needs_tool: { type: "noul", noul: 0.92 },
          tool: { type: "choice", choice: "list_threads", confidence: 0.8, probabilities: {} },
        },
      }),
    );
    const routed = await routeTools("okunmamışlar ne?", ctx(), specs);
    expect(routed?.specs.map((tool) => tool.name)).toEqual(["list_threads"]);

    setJevTransportForTests(async () =>
      jsonResponse({
        answers: {
          needs_tool: { type: "noul", noul: 0.1 },
          tool: { type: "choice", choice: "list_threads", confidence: 0.9, probabilities: {} },
        },
      }),
    );
    const direct = await routeTools("merhaba", ctx(), specs);
    expect(direct?.specs).toEqual([]);
  });

  test("a side effect is held when Jev says the question did not ask for it", async () => {
    setJevTransportForTests(async () => jsonResponse({ answers: { allowed: { type: "noul", noul: 0.15 } } }));
    expect(await jevAllowsSideEffect(ctx({ ask: "gelen kutusunu özetle" }), "push_commitment_to_todo", "faturayı öde")).toBe(false);
    setJevTransportForTests(async () => jsonResponse({ answers: { allowed: { type: "noul", noul: 0.9 } } }));
    expect(await jevAllowsSideEffect(ctx({ ask: "bunu todo'ya ekle" }), "push_commitment_to_todo", "faturayı öde")).toBe(true);
    setJevTransportForTests(null);
    expect(await jevAllowsSideEffect(ctx({ ask: "bunu todo'ya ekle" }), "push_commitment_to_todo", "faturayı öde")).toBe(true);
  });
});
