export const SOURCE_ORDER = ["x", "reddit", "youtube", "hn", "web"] as const;
export type SourceId = (typeof SOURCE_ORDER)[number];

export const AGENT_ORDER = [
  "manager",
  "scout",
  "writer",
  "designer",
  "scheduler",
  "analyst",
] as const;
export type AgentId = (typeof AGENT_ORDER)[number];

export const PLATFORM_LIMITS = {
  x: 280,
  linkedin: 3000,
  bluesky: 300,
  instagram: 2200,
} as const;
export type PlatformId = keyof typeof PLATFORM_LIMITS;

export type HookPattern =
  | "question"
  | "number"
  | "contrarian"
  | "how-to"
  | "story"
  | "statement";

export type VoicePreference = "question" | "punchy" | "story";

export type VoiceProfile = {
  postCount: number;
  avgWordsPerSentence: number;
  avgWordLength: number;
  questionRate: number;
  exclamationRate: number;
  firstPersonRate: number;
  contractionRate: number;
  emojiPerPost: number;
  prefers: VoicePreference;
  banned: string[];
};

export type Evidence = {
  id: string;
  source: SourceId;
  title: string;
  excerpt: string;
  url: string;
  date: string;
  engagement: number;
};

export type Opportunity = {
  id: string;
  claim: string;
  angle: string;
  demand: number;
  evidence: number;
  competition: number;
  timing: number;
  fit: number;
  composite: number;
  evidenceIds: string[];
  counterexample: string;
  nextTest: string;
};

export type Mention = {
  id: string;
  source: SourceId;
  text: string;
  why: string;
  url: string;
  date: string;
  matchScore: number;
  humanOnly: true;
};

export type ScoutReport = {
  topic: string;
  windowStart: string;
  windowEnd: string;
  summary: string;
  evidence: Evidence[];
  opportunities: Opportunity[];
  mentions: Mention[];
  sources: SourceId[];
};

export type HookId = "question" | "proof" | "story";

export type HookVariant = {
  id: HookId;
  label: string;
  text: string;
};

export type DraftBundle = {
  hooks: HookVariant[];
  support: string;
  counterexample: string;
  nextTest: string;
  platforms: Record<PlatformId, string>;
  thread: string[];
  evidenceIds: string[];
};

export type BrandFont = "serif" | "sans" | "mono";

export type BrandKit = {
  name: string;
  logoText: string;
  ink: string;
  paper: string;
  accent: string;
  font: BrandFont;
};

export type Slot = {
  day: number;
  hour: number;
  score: number;
};

export type QueueStatus = "pending" | "approved" | "scheduled" | "rejected";

export type QueueItem = {
  id: string;
  topic: string;
  kind: "post";
  status: QueueStatus;
  hooks: HookVariant[];
  hookIndex: number;
  support: string;
  counterexample: string;
  nextTest: string;
  platforms: Record<PlatformId, string>;
  thread: string[];
  cardSvg: string;
  scheduledFor: string | null;
  intentUrl: string | null;
  suggested: Slot[];
  evidenceIds: string[];
  edited: boolean;
};

export type MetricPost = {
  id: string;
  text: string;
  platform: PlatformId;
  hookPattern: HookPattern;
  day: number;
  hour: number;
  impressions: number;
  bookmarks: number;
  replies: number;
  reposts: number;
  likes: number;
  profileClicks: number;
  threadParts: number;
};

export type PostScore = {
  bookmarkRate: number;
  hookScore: number;
  threadDepth: number;
  timeScore: number;
  algorithm: number;
  blended: number;
};

export type ScoredPost = MetricPost & { score: PostScore };

export type DailyReport = {
  date: string;
  topic: string;
  postCount: number;
  impressions: number;
  bookmarks: number;
  bookmarkRate: number;
  bestId: string;
  bestBlended: number;
  hookLeader: HookPattern;
  caveat: string | null;
  recommendations: string[];
  posts: ScoredPost[];
};

export type TimelineStep = {
  id: string;
  agent: AgentId;
  title: string;
  detail: string;
  skills: string[];
  cost: number;
};

export type SkillDef = {
  id: string;
  name: string;
  functionId: string;
  agent: AgentId;
  summary: string;
};

export type FunctionDef = {
  id: string;
  name: string;
  summary: string;
};
