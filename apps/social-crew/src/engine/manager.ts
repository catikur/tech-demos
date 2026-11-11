import { scoreHistory, buildDailyReport } from "./analyst";
import { canAfford, FULL_RUN_COST, ROSTER_COST, STEP_COSTS } from "./budget";
import { renderCard } from "./designer";
import type { BrandKit, DailyReport, QueueItem, ScoutReport, TimelineStep, VoiceProfile } from "./types";
import { researchTopic } from "./scout";
import { skillsForAgent, skillsForRun } from "./skills";
import { buildHeatmap, formatSlot, suggestUpcoming } from "./timing";
import { hashString } from "./text";
import { writeDraft } from "./writer";

export const ROSTER = [
  {
    id: "manager",
    name: "Manager",
    job: "The only desk you talk to. It delegates and brings back one result.",
  },
  {
    id: "scout",
    name: "Scout",
    job: "Reads a simulated 30-day window across X, Reddit, YouTube, HN, and the web. Eyes only.",
  },
  {
    id: "writer",
    name: "Writer",
    job: "Drafts from your samples, with hook options and a cut for each network.",
  },
  {
    id: "designer",
    name: "Designer",
    job: "Builds an on-brand card from the kit. Nothing photographic is fetched.",
  },
  {
    id: "scheduler",
    name: "Scheduler",
    job: "Holds the queue. The calendar moves only after your yes.",
  },
  {
    id: "analyst",
    name: "Analyst",
    job: "Scores a simulated history and writes the daily note, including when the sample is thin.",
  },
] as const;

export type CrewRun = {
  topic: string;
  account: string;
  scout: ScoutReport;
  steps: TimelineStep[];
  skillsUsed: string[];
  item: QueueItem;
  daily: DailyReport;
  reply: string;
  cost: number;
};

export type RunResult =
  | { ok: true; spent: number; run: CrewRun }
  | { ok: false; reason: "empty" | "cap"; spent: number; message: string; cost: number };

function queueId(topic: string, sequence: number): string {
  const salt = (hashString(topic) % 36 ** 4).toString(36);
  return `q-${salt}-${sequence}`;
}

export function runCrew(input: {
  topic: string;
  account: string;
  voice: VoiceProfile;
  brand: BrandKit;
  spent: number;
  cap: number;
  sequence: number;
}): RunResult {
  const topic = input.topic.trim();
  const account = input.account.trim();
  if (!topic && !account) {
    return {
      ok: false,
      reason: "empty",
      spent: input.spent,
      cost: 0,
      message: "Give me a topic or an account to brief. I will not invent a subject.",
    };
  }
  if (!canAfford(input.spent, input.cap, FULL_RUN_COST)) {
    const left = Math.max(input.cap - input.spent, 0);
    return {
      ok: false,
      reason: "cap",
      spent: input.spent,
      cost: FULL_RUN_COST,
      message: `This run costs ${FULL_RUN_COST}. The cap has ${left} left, so I did not start it. A run already moving would be allowed to finish.`,
    };
  }

  const subject = topic || account;
  const scout = researchTopic(subject, account);
  const draft = writeDraft({ topic: subject, report: scout, voice: input.voice });
  const headline = draft.hooks[0]?.text ?? subject;
  const cardSvg = renderCard({ brand: input.brand, kicker: subject, headline });
  const suggested = suggestUpcoming(buildHeatmap(subject), 3);
  const daily = buildDailyReport(scoreHistory(subject), subject);
  const skillsUsed = skillsForRun();
  const top = scout.opportunities[0];
  const bestSlot = suggested[0];
  const steps: TimelineStep[] = [
    {
      id: "manager",
      agent: "manager",
      title: "Brief accepted",
      detail: `One subject: ${subject}. Account ${account || "not named"}. Voice file has ${input.voice.postCount} sample${input.voice.postCount === 1 ? "" : "s"}.`,
      skills: skillsForAgent("manager", skillsUsed),
      cost: STEP_COSTS.manager,
    },
    {
      id: "scout",
      agent: "scout",
      title: "Thirty-day sweep",
      detail: top
        ? `${scout.evidence.length} fixtures in the window. Top angle scores ${top.composite}. ${scout.mentions.length} mentions are listed for you, not for a reply bot.`
        : "No angle cleared the sweep.",
      skills: skillsForAgent("scout", skillsUsed),
      cost: STEP_COSTS.scout,
    },
    {
      id: "writer",
      agent: "writer",
      title: "Drafts in your voice",
      detail: `${draft.hooks.length} hooks, preferred style ${input.voice.prefers}. X thread is ${draft.thread.length} part${draft.thread.length === 1 ? "" : "s"}. LinkedIn, Bluesky, and Instagram are separate cuts.`,
      skills: skillsForAgent("writer", skillsUsed),
      cost: STEP_COSTS.writer,
    },
    {
      id: "designer",
      agent: "designer",
      title: "Card on the kit",
      detail: `${input.brand.name} · logo “${input.brand.logoText}”. The card is a draft, not a post.`,
      skills: skillsForAgent("designer", skillsUsed),
      cost: STEP_COSTS.designer,
    },
    {
      id: "scheduler",
      agent: "scheduler",
      title: "Parked, not scheduled",
      detail: bestSlot
        ? `Status is pending. Suggested hour is ${formatSlot(bestSlot)} (score ${bestSlot.score}). Nothing is on the calendar.`
        : "Status is pending. Nothing is on the calendar.",
      skills: skillsForAgent("scheduler", skillsUsed),
      cost: STEP_COSTS.scheduler,
    },
    {
      id: "analyst",
      agent: "analyst",
      title: "Daily note",
      detail: daily.caveat
        ? daily.caveat
        : `Simulated history favors ${daily.bestId} at blended ${daily.bestBlended}. This is not a live pull.`,
      skills: skillsForAgent("analyst", skillsUsed),
      cost: STEP_COSTS.analyst,
    },
  ];

  const item: QueueItem = {
    id: queueId(subject, input.sequence),
    topic: subject,
    kind: "post",
    status: "pending",
    hooks: draft.hooks,
    hookIndex: 0,
    support: draft.support,
    counterexample: draft.counterexample,
    nextTest: draft.nextTest,
    platforms: draft.platforms,
    thread: draft.thread,
    cardSvg,
    scheduledFor: null,
    intentUrl: null,
    suggested,
    evidenceIds: draft.evidenceIds,
    edited: false,
  };

  const reply = [
    top ? `Scout ranked “${top.claim}” highest (${top.composite}).` : "Scout came back empty.",
    `Writer left ${draft.hooks.length} hooks and a ${draft.thread.length}-part X thread, plus LinkedIn, Bluesky, and Instagram.`,
    `Designer laid a card for ${input.brand.logoText}.`,
    "Scheduler parked it. It is not on the calendar, and I will not post.",
    "Say yes in the queue if you want an intent link to open yourself.",
  ].join(" ");

  return {
    ok: true,
    spent: input.spent + FULL_RUN_COST,
    run: {
      topic: subject,
      account,
      scout,
      steps,
      skillsUsed,
      item,
      daily,
      reply,
      cost: FULL_RUN_COST,
    },
  };
}

export function rosterReply(): { cost: number; text: string } {
  const lines = ROSTER.map((seat) => `${seat.name}: ${seat.job}`);
  return {
    cost: ROSTER_COST,
    text: `You talk to me. I hand work to the other five.\n${lines.join("\n")}`,
  };
}

export function isRosterQuestion(text: string): boolean {
  return /who does what/i.test(text);
}
