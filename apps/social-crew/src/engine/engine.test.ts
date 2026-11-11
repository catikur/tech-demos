import { describe, expect, test } from "bun:test";
import { buildDailyReport, HISTORY, HOOK_SCORES, scoreHistory, scorePost } from "./analyst";
import { canAfford, DEFAULT_CAP, FULL_RUN_COST } from "./budget";
import { contrastRatio, renderCard } from "./designer";
import { createInitialDesk, deskReducer, emptyDesk } from "./desk";
import { approvePost, buildIntentUrl, schedulePost } from "./gate";
import { runCrew } from "./manager";
import { adaptPlatforms, linkedinFirstLine } from "./platforms";
import { setAutoReply, tryQueueMention } from "./rules";
import { compositeScore, researchTopic, WINDOW_START } from "./scout";
import { addSkill, isHumanSkill, skillsForRun, validateSkillGraph } from "./skills";
import { fit, shiftDays, splitThread, topicTag, ANCHOR_ISO } from "./text";
import { buildHeatmap, suggestBestTimes } from "./timing";
import { PLATFORM_LIMITS } from "./types";
import { DEFAULT_BANNED, extractVoice, SAMPLE_POSTS, stripBanned } from "./voice";
import { writeDraft } from "./writer";

const voice = extractVoice(SAMPLE_POSTS);

describe("scout", () => {
  test("the same topic returns the same sweep", () => {
    expect(researchTopic("ai agents", "@nera.quill")).toEqual(researchTopic("ai agents", "@nera.quill"));
    expect(researchTopic("weekend coffee roasting")).toEqual(researchTopic("weekend coffee roasting"));
  });

  test("different subjects do not collapse into one brief", () => {
    const agents = researchTopic("ai agents");
    const notes = researchTopic("local-first notes");
    const tools = researchTopic("developer tools");
    const coffee = researchTopic("weekend coffee roasting");
    expect(agents.summary).not.toEqual(notes.summary);
    expect(tools.summary).not.toEqual(coffee.summary);
    expect(agents.summary).toContain("the human still owes the yes");
    expect(notes.summary).toContain("the notes stay on the machine");
    expect(tools.summary).toContain("the tool does not post for you");
  });

  test("every sweep covers five sources inside the 30-day window", () => {
    for (const topic of ["ai agents", "local-first notes", "developer tools", "weekend coffee roasting"]) {
      const report = researchTopic(topic, "@desk");
      expect(report.sources).toEqual(["x", "reddit", "youtube", "hn", "web"]);
      expect(report.windowStart).toBe(WINDOW_START);
      expect(report.windowEnd).toBe(ANCHOR_ISO);
      expect(shiftDays(ANCHOR_ISO, -30)).toBe("2026-10-12");
      for (const item of [...report.evidence, ...report.mentions]) {
        expect(item.date >= WINDOW_START && item.date <= ANCHOR_ISO).toBe(true);
      }
      for (const mention of report.mentions) expect(mention.humanOnly).toBe(true);
      expect(report.mentions.some((mention) => mention.text.includes("@desk"))).toBe(true);
      const sorted = [...report.opportunities].sort(
        (a, b) => b.composite - a.composite || a.id.localeCompare(b.id),
      );
      expect(report.opportunities.map((item) => item.id)).toEqual(sorted.map((item) => item.id));
      for (const angle of report.opportunities) {
        expect(angle.composite).toBe(compositeScore(angle));
        expect(angle.counterexample.length).toBeGreaterThan(0);
        expect(angle.nextTest.length).toBeGreaterThan(0);
        for (const id of angle.evidenceIds) {
          expect(report.evidence.some((item) => item.id === id)).toBe(true);
        }
      }
    }
  });

  test("the yes-gate angle is scored from the published weights", () => {
    expect(
      compositeScore({ demand: 80, evidence: 90, competition: 30, timing: 70, fit: 85 }),
    ).toBe(80);
    const top = researchTopic("ai agents").opportunities[0];
    expect(top?.id).toBe("op-yes-gate");
    expect(top?.composite).toBe(80);
  });
});

describe("voice", () => {
  test("sample posts produce a punchy, first-person profile", () => {
    expect(voice).toMatchObject({
      postCount: 4,
      avgWordsPerSentence: 6.1,
      avgWordLength: 3.9,
      questionRate: 0.14,
      exclamationRate: 0,
      firstPersonRate: 0.29,
      contractionRate: 0.14,
      emojiPerPost: 0,
      prefers: "punchy",
    });
    expect(voice.banned).toEqual([...DEFAULT_BANNED]);
  });

  test("questions outrank punchy lines when they dominate", () => {
    const profile = extractVoice(["Why this? Why now? Why you?"]);
    expect(profile.prefers).toBe("question");
    expect(profile.questionRate).toBe(1);
  });

  test("an empty paste stays neutral", () => {
    expect(extractVoice(["  ", ""]).prefers).toBe("story");
    expect(extractVoice([]).postCount).toBe(0);
  });

  test("banned phrases are stripped without eating the rest of the line", () => {
    expect(stripBanned("Please delve into the game-changer later.", DEFAULT_BANNED)).toBe(
      "Please into the later.",
    );
  });
});

describe("platforms and threads", () => {
  test("cuts stay inside each network limit and LinkedIn opens short", () => {
    for (const topic of ["ai agents", "local-first notes", "developer tools", "a very long custom subject about roasting"]) {
      const draft = writeDraft({ topic, report: researchTopic(topic), voice });
      for (const platform of ["x", "linkedin", "bluesky", "instagram"] as const) {
        expect(draft.platforms[platform].length).toBeLessThanOrEqual(PLATFORM_LIMITS[platform]);
        expect(draft.platforms[platform].length).toBeGreaterThan(0);
      }
      expect(linkedinFirstLine(draft.platforms.linkedin).length).toBeLessThanOrEqual(180);
      expect(draft.platforms.linkedin).toContain("\n\n");
      for (const part of draft.thread) expect(part.length).toBeLessThanOrEqual(PLATFORM_LIMITS.x);
      const cited = draft.evidenceIds[0];
      expect(cited).toBeDefined();
      expect(`${draft.platforms.linkedin}\n${draft.thread.join("\n")}`).toContain(cited ?? "");
      for (const phrase of DEFAULT_BANNED) {
        expect(draft.platforms.x.toLowerCase().includes(phrase)).toBe(false);
      }
    }
  });

  test("a long X draft splits into numbered parts that fit", () => {
    const sentence = "The draft stays on the desk until a person says yes. ";
    const parts = splitThread(sentence.repeat(40), 280);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(280);
      expect(part).toMatch(/^\d+\/\d+ /);
    }
    expect(splitThread("Short and done.", 280)).toEqual(["Short and done."]);
  });

  test("topic tags and hard clamps keep a marker", () => {
    expect(topicTag("ai agents")).toBe("#AiAgents");
    expect(fit("alpha beta gamma", 8).length).toBeLessThanOrEqual(8);
    expect(fit("alpha beta gamma", 8).endsWith("…")).toBe(true);
  });

  test("a high emoji rate can add a mark and still respect the cap", () => {
    const loud = { ...voice, emojiPerPost: 2, banned: voice.banned };
    const cuts = adaptPlatforms({
      topic: "ai agents",
      hook: "Ship the gate.",
      support: "Then wait.",
      voice: loud,
    });
    expect(cuts.x).toContain("🔥");
    expect(cuts.x.length).toBeLessThanOrEqual(280);
  });
});

describe("approval gate", () => {
  test("a fresh run is pending and cannot be scheduled", () => {
    const desk = createInitialDesk();
    const item = desk.queue[0];
    expect(item?.status).toBe("pending");
    expect(item?.scheduledFor).toBeNull();
    expect(item?.intentUrl).toBeNull();
    expect(desk.spent).toBe(FULL_RUN_COST);
    expect(desk.skillsUsed.includes("intent-link")).toBe(false);
    expect(desk.skillsUsed.includes("calendar-place")).toBe(false);
    if (!item) throw new Error("missing item");
    const blocked = schedulePost(item, item.suggested[0] ?? { day: 1, hour: 9, score: 1 }, {
      askFirst: false,
      confirmed: true,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("needs-approval");
    expect(blocked.item.scheduledFor).toBeNull();
  });

  test("ask-first holds the yes, then an intent link appears, then the calendar", () => {
    let desk = createInitialDesk();
    const id = desk.queue[0]?.id;
    if (!id) throw new Error("missing id");
    desk = deskReducer(desk, { type: "approve", id, confirmed: false });
    expect(desk.queue[0]?.status).toBe("pending");
    expect(desk.confirm).toEqual({ kind: "approve", id });
    desk = deskReducer(desk, { type: "approve", id, confirmed: true });
    expect(desk.queue[0]?.status).toBe("approved");
    expect(desk.queue[0]?.intentUrl).toContain("https://x.com/intent/post?text=");
    expect(desk.skillsUsed).toContain("intent-link");
    expect(desk.queue[0]?.scheduledFor).toBeNull();

    const slotId = "1-9";
    desk = deskReducer(desk, { type: "schedule", id, slotId, confirmed: false });
    expect(desk.queue[0]?.status).toBe("approved");
    expect(desk.confirm?.kind).toBe("schedule");
    desk = deskReducer(desk, { type: "schedule", id, slotId, confirmed: true });
    expect(desk.queue[0]?.status).toBe("scheduled");
    expect(desk.queue[0]?.scheduledFor).toBe("Tue 09:00");
    expect(desk.skillsUsed).toContain("calendar-place");
  });

  test("reject and edit both clear a yes", () => {
    let desk = createInitialDesk();
    const id = desk.queue[0]?.id ?? "";
    desk = deskReducer(desk, { type: "set-ask", key: "publish", value: false });
    desk = deskReducer(desk, { type: "set-ask", key: "schedule", value: false });
    desk = deskReducer(desk, { type: "approve", id, confirmed: true });
    desk = deskReducer(desk, { type: "schedule", id, slotId: "1-9", confirmed: true });
    expect(desk.queue[0]?.status).toBe("scheduled");
    desk = deskReducer(desk, { type: "edit", id, body: "A shorter opening after the edit." });
    expect(desk.queue[0]?.status).toBe("pending");
    expect(desk.queue[0]?.scheduledFor).toBeNull();
    expect(desk.queue[0]?.intentUrl).toBeNull();
    expect(desk.queue[0]?.platforms.x.length).toBeLessThanOrEqual(280);

    desk = deskReducer(desk, { type: "approve", id, confirmed: true });
    desk = deskReducer(desk, { type: "reject", id });
    expect(desk.queue[0]?.status).toBe("rejected");
    const rejected = desk.queue[0];
    if (!rejected) throw new Error("missing");
    const again = approvePost(rejected, { askFirst: false, confirmed: true });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("rejected");
  });

  test("mentions never enter the queue and auto-reply cannot be enabled", () => {
    const before = createInitialDesk();
    const after = deskReducer(before, { type: "keep-reply-human" });
    expect(after.queue).toHaveLength(before.queue.length);
    expect(tryQueueMention()).toEqual({ ok: false, reason: "replies-are-human" });
    expect(setAutoReply(true)).toEqual({ ok: false, reason: "replies-are-human" });
    expect(setAutoReply(false)).toEqual({ ok: true });
  });

  test("the cap blocks a new run and an empty brief does not spend", () => {
    const quiet = deskReducer(
      { ...emptyDesk(), topic: "  ", account: " " },
      { type: "run", text: "   " },
    );
    expect(quiet.spent).toBe(0);
    expect(quiet.queue).toHaveLength(0);

    const tight = deskReducer({ ...createInitialDesk(), cap: 40 }, { type: "run", text: "second pass" });
    expect(tight.queue).toHaveLength(1);
    expect(tight.spent).toBe(FULL_RUN_COST);
    expect(canAfford(54, DEFAULT_CAP, FULL_RUN_COST)).toBe(false);
    expect(canAfford(53, DEFAULT_CAP, FULL_RUN_COST)).toBe(true);
  });

  test("the same brief run twice matches, and who-does-what does not queue a post", () => {
    const first = runCrew({
      topic: "ai agents",
      account: "@nera.quill",
      voice,
      brand: emptyDesk().brand,
      spent: 0,
      cap: 80,
      sequence: 1,
    });
    const second = runCrew({
      topic: "ai agents",
      account: "@nera.quill",
      voice,
      brand: emptyDesk().brand,
      spent: 0,
      cap: 80,
      sequence: 1,
    });
    expect(first).toEqual(second);
    if (!first.ok) throw new Error("run failed");
    expect(first.run.item.status).toBe("pending");
    expect(first.run.steps.reduce((sum, step) => sum + step.cost, 0)).toBe(FULL_RUN_COST);
    const used = new Set(first.run.steps.flatMap((step) => step.skills));
    expect([...used].sort()).toEqual([...first.run.skillsUsed].sort());

    const desk = deskReducer(createInitialDesk(), { type: "run", text: "Who does what on this team?" });
    expect(desk.queue).toHaveLength(1);
    expect(desk.messages.at(-1)?.text).toContain("Manager:");
    expect(desk.spent).toBe(FULL_RUN_COST + 1);
  });
});

describe("timing", () => {
  test("best hours are the highest cells, ties broken by day then hour", () => {
    const heatmap = [
      [1, 5],
      [9, 9],
      [3, 9],
    ];
    expect(suggestBestTimes(heatmap, 3)).toEqual([
      { day: 1, hour: 0, score: 9 },
      { day: 1, hour: 1, score: 9 },
      { day: 2, hour: 1, score: 9 },
    ]);
  });

  test("the built heatmap prefers a midweek morning and stays stable", () => {
    expect(buildHeatmap("ai agents")).toEqual(buildHeatmap("ai agents"));
    const [top] = suggestBestTimes(buildHeatmap("local-first notes"), 1);
    expect(top?.day).toBe(1);
    expect(top?.hour).toBeGreaterThanOrEqual(8);
    expect(top?.hour).toBeLessThanOrEqual(10);
  });
});

describe("analytics", () => {
  test("a saturated post scores 100 before the hook and time blend", () => {
    const post = {
      id: "sat",
      text: "What now?",
      platform: "x" as const,
      hookPattern: "question" as const,
      day: 1,
      hour: 9,
      impressions: 10000,
      bookmarks: 500,
      replies: 200,
      reposts: 100,
      likes: 800,
      profileClicks: 300,
      threadParts: 6,
    };
    const score = scorePost(post, 62);
    expect(score.algorithm).toBe(100);
    expect(score.bookmarkRate).toBe(0.05);
    expect(score.hookScore).toBe(HOOK_SCORES.question);
    expect(score.threadDepth).toBe(6);
    expect(score.timeScore).toBe(62);
    expect(score.blended).toBe(93);
  });

  test("the daily note ranks the simulated history and admits a tiny sample", () => {
    const full = buildDailyReport(scoreHistory("ai agents"), "ai agents");
    expect(full.caveat).toBeNull();
    expect(full.posts[0]?.id).toBe(full.bestId);
    expect(full.date).toBe(ANCHOR_ISO);
    expect(full.recommendations.length).toBeGreaterThan(0);
    const ranked = [...full.posts].sort(
      (a, b) => b.score.blended - a.score.blended || a.id.localeCompare(b.id),
    );
    expect(full.posts.map((post) => post.id)).toEqual(ranked.map((post) => post.id));

    const tiny = buildDailyReport(scoreHistory("ai agents").slice(0, 2), "ai agents");
    expect(tiny.caveat).toContain("too small");
    expect(HISTORY.length).toBe(8);
  });
});

describe("intent and skill graph", () => {
  test("intent links encode the draft and never exceed a post", () => {
    const url = buildIntentUrl("a&b\n?");
    expect(url.startsWith("https://x.com/intent/post?text=")).toBe(true);
    const decoded = new URL(url).searchParams.get("text");
    expect(decoded).toBe("a&b\n?");
    const long = buildIntentUrl("word ".repeat(200));
    const body = new URL(long).searchParams.get("text") ?? "";
    expect(body.length).toBeLessThanOrEqual(280);
  });

  test("the graph has 12 functions, 37 skills, and a clean report", () => {
    expect(validateSkillGraph()).toEqual([]);
    const used = skillsForRun();
    expect(new Set(used).size).toBe(used.length);
    expect(used).toContain("thirty-day-sweep");
    expect(used).toContain("hook-variants");
    expect(used).toContain("approval-hold");
    expect(used).toContain("bookmark-rate");
    expect(used).toContain("ask-first");
    expect(used.some((id) => isHumanSkill(id))).toBe(false);
    expect(addSkill(used, "intent-link")).toContain("intent-link");
    expect(addSkill(used, "not-a-skill")).toEqual(used);
  });

  test("the card escapes text and carries the logo", () => {
    const svg = renderCard({
      brand: emptyDesk().brand,
      kicker: "ai agents",
      headline: `Keep the <script> out & "quote"`,
    });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("ND");
    expect(svg).toContain("#C2410C");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<script>");
    expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);
  });
});
