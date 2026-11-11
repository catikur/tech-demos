import type {
  DailyReport,
  HookPattern,
  MetricPost,
  PostScore,
  ScoredPost,
} from "./types";
import { ANCHOR_ISO, roundTo } from "./text";
import { buildHeatmap } from "./timing";

export const ALGO_WEIGHTS = {
  bookmark: 0.3,
  reply: 0.22,
  repost: 0.18,
  profile: 0.12,
  like: 0.08,
  depth: 0.1,
} as const;

export const HOOK_SCORES: Record<HookPattern, number> = {
  question: 86,
  number: 80,
  contrarian: 78,
  "how-to": 74,
  story: 72,
  statement: 64,
};

function unit(rate: number, ceiling: number): number {
  if (ceiling <= 0) return 0;
  return Math.min(Math.max(rate / ceiling, 0), 1);
}

export function scorePost(post: MetricPost, timeScore: number): PostScore {
  const impressions = post.impressions;
  const rate = (value: number) => (impressions <= 0 ? 0 : value / impressions);
  const bookmarkRate = rate(post.bookmarks);
  const algorithm = Math.round(
    100 *
      (ALGO_WEIGHTS.bookmark * unit(bookmarkRate, 0.05) +
        ALGO_WEIGHTS.reply * unit(rate(post.replies), 0.02) +
        ALGO_WEIGHTS.repost * unit(rate(post.reposts), 0.01) +
        ALGO_WEIGHTS.profile * unit(rate(post.profileClicks), 0.03) +
        ALGO_WEIGHTS.like * unit(rate(post.likes), 0.08) +
        ALGO_WEIGHTS.depth * Math.min(Math.max(post.threadParts, 0) / 6, 1)),
  );
  const hookScore = HOOK_SCORES[post.hookPattern];
  return {
    bookmarkRate: roundTo(bookmarkRate, 4),
    hookScore,
    threadDepth: post.threadParts,
    timeScore,
    algorithm,
    blended: Math.round(0.7 * algorithm + 0.2 * hookScore + 0.1 * timeScore),
  };
}

export const HISTORY: readonly MetricPost[] = [
  {
    id: "p-question-thread",
    text: "What should stay human when the draft is already good?",
    platform: "x",
    hookPattern: "question",
    day: 1,
    hour: 9,
    impressions: 18200,
    bookmarks: 640,
    replies: 210,
    reposts: 90,
    likes: 740,
    profileClicks: 260,
    threadParts: 4,
  },
  {
    id: "p-number",
    text: "4 checks before a post leaves the queue.",
    platform: "x",
    hookPattern: "number",
    day: 3,
    hour: 8,
    impressions: 12100,
    bookmarks: 300,
    replies: 80,
    reposts: 40,
    likes: 510,
    profileClicks: 140,
    threadParts: 1,
  },
  {
    id: "p-story",
    text: "I left the reply unsent and wrote it myself an hour later.",
    platform: "linkedin",
    hookPattern: "story",
    day: 2,
    hour: 11,
    impressions: 6400,
    bookmarks: 90,
    replies: 40,
    reposts: 12,
    likes: 220,
    profileClicks: 70,
    threadParts: 1,
  },
  {
    id: "p-howto",
    text: "How to read a 30-day sweep without treating it as a brief to obey.",
    platform: "linkedin",
    hookPattern: "how-to",
    day: 0,
    hour: 18,
    impressions: 8800,
    bookmarks: 150,
    replies: 55,
    reposts: 20,
    likes: 310,
    profileClicks: 100,
    threadParts: 1,
  },
  {
    id: "p-contrarian",
    text: "More bots will not fix a post you have not approved.",
    platform: "bluesky",
    hookPattern: "contrarian",
    day: 4,
    hour: 17,
    impressions: 4200,
    bookmarks: 110,
    replies: 36,
    reposts: 18,
    likes: 190,
    profileClicks: 40,
    threadParts: 2,
  },
  {
    id: "p-statement",
    text: "The card can be beautiful and still be a draft.",
    platform: "instagram",
    hookPattern: "statement",
    day: 5,
    hour: 13,
    impressions: 5100,
    bookmarks: 40,
    replies: 12,
    reposts: 6,
    likes: 240,
    profileClicks: 20,
    threadParts: 1,
  },
  {
    id: "p-late",
    text: "A cap checked after the run is a note, not a brake.",
    platform: "x",
    hookPattern: "statement",
    day: 6,
    hour: 22,
    impressions: 2100,
    bookmarks: 18,
    replies: 9,
    reposts: 3,
    likes: 70,
    profileClicks: 11,
    threadParts: 1,
  },
  {
    id: "p-short-thread",
    text: "Two posts. One source. Then stop.",
    platform: "x",
    hookPattern: "number",
    day: 1,
    hour: 18,
    impressions: 7600,
    bookmarks: 160,
    replies: 44,
    reposts: 22,
    likes: 280,
    profileClicks: 90,
    threadParts: 2,
  },
];

export function scoreHistory(topic: string): ScoredPost[] {
  const heatmap = buildHeatmap(topic);
  return HISTORY.map((post) => ({
    ...post,
    score: scorePost(post, heatmap[post.day]?.[post.hour] ?? 0),
  }));
}

export function historyHeat(posts: readonly MetricPost[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const post of posts) {
    const row = grid[post.day];
    if (!row) continue;
    row[post.hour] = (row[post.hour] ?? 0) + 1;
  }
  return grid;
}

export function buildDailyReport(posts: readonly ScoredPost[], topic: string): DailyReport {
  const ranked = [...posts].sort(
    (a, b) => b.score.blended - a.score.blended || a.id.localeCompare(b.id),
  );
  const best = ranked[0];
  const impressions = posts.reduce((sum, post) => sum + post.impressions, 0);
  const bookmarks = posts.reduce((sum, post) => sum + post.bookmarks, 0);
  const hookTotals = new Map<HookPattern, { blended: number; count: number }>();
  for (const post of posts) {
    const current = hookTotals.get(post.hookPattern) ?? { blended: 0, count: 0 };
    current.blended += post.score.blended;
    current.count += 1;
    hookTotals.set(post.hookPattern, current);
  }
  let hookLeader: HookPattern = "statement";
  let hookBest = -1;
  for (const [pattern, stats] of hookTotals) {
    const average = stats.blended / stats.count;
    if (average > hookBest || (average === hookBest && pattern < hookLeader)) {
      hookLeader = pattern;
      hookBest = average;
    }
  }
  const avgDepth =
    posts.reduce((sum, post) => sum + post.threadParts, 0) / Math.max(posts.length, 1);
  const recommendations = [
    hookLeader === "question"
      ? "Question openings lead this sample. Keep one when the voice file agrees."
      : `The strongest hook pattern in this sample is ${hookLeader}. Try it once, then compare saves.`,
    avgDepth < 2
      ? "Most posts are a single unit. A short thread is the next test, not a daily requirement."
      : "Thread depth is already doing work. Do not add parts that repeat the first claim.",
    "Do not arm a routine off one strong post. The sample is a simulated history.",
  ];
  return {
    date: ANCHOR_ISO,
    topic,
    postCount: posts.length,
    impressions,
    bookmarks,
    bookmarkRate: roundTo(impressions === 0 ? 0 : bookmarks / impressions, 4),
    bestId: best?.id ?? "none",
    bestBlended: best?.score.blended ?? 0,
    hookLeader,
    caveat:
      posts.length < 5
        ? "The sample is too small to prove a pattern. Treat this as a note, not a verdict."
        : null,
    recommendations,
    posts: ranked,
  };
}
