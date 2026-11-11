import type { AgentId, FunctionDef, SkillDef } from "./types";
import { AGENT_ORDER } from "./types";

export const FUNCTIONS: readonly FunctionDef[] = [
  { id: "foundation", name: "Foundation", summary: "What the account stands for before a line is drafted." },
  { id: "listening", name: "Listening", summary: "A bounded 30-day read across the five sources." },
  { id: "opportunity", name: "Opportunity radar", summary: "Claims with evidence, a counterexample, and a next test." },
  { id: "planning", name: "Planning", summary: "Cadence and the handoff from one desk to the next." },
  { id: "copy", name: "Drafting", summary: "Voice, hooks, threads, and a source on every claim." },
  { id: "adapt", name: "Network cuts", summary: "One idea rebuilt for each network's length and shape." },
  { id: "visual", name: "Visual system", summary: "A brand kit and a card that can leave as a PNG." },
  { id: "gate", name: "Approval gate", summary: "Pending until a yes. Edits send it back. Replies stay human." },
  { id: "timing", name: "Timing", summary: "Suggested hours, a calendar cell, and an intent link." },
  { id: "crosspost", name: "Crosspost", summary: "Compose once, then preview the cut for every channel." },
  { id: "performance", name: "Performance", summary: "Bookmark rate, hooks, thread depth, and the daily note." },
  { id: "safety", name: "Safety", summary: "Ask-first, a spending cap, and the automation line." },
];

export const SKILLS: readonly SkillDef[] = [
  { id: "stance-line", name: "Stance line", functionId: "foundation", agent: "manager", summary: "One sentence the account will actually defend." },
  { id: "audience-promise", name: "Audience promise", functionId: "foundation", agent: "manager", summary: "Who the post is for, stated before the hook." },
  { id: "banned-list", name: "Banned list", functionId: "foundation", agent: "manager", summary: "Phrases the voice file refuses, even if a draft reaches for them." },
  { id: "thirty-day-sweep", name: "Thirty-day sweep", functionId: "listening", agent: "scout", summary: "Search the window, not the whole archive." },
  { id: "mention-watch", name: "Mention watch", functionId: "listening", agent: "scout", summary: "List conversations. Do not join them." },
  { id: "source-label", name: "Source label", functionId: "listening", agent: "scout", summary: "Every hit names X, Reddit, YouTube, HN, or the web." },
  { id: "evidence-score", name: "Evidence score", functionId: "opportunity", agent: "scout", summary: "Weight a claim by how grounded the fixtures are." },
  { id: "counterexample-check", name: "Counterexample", functionId: "opportunity", agent: "scout", summary: "Put the opposing read on the card." },
  { id: "angle-rank", name: "Angle rank", functionId: "opportunity", agent: "scout", summary: "Sort opportunities by the composite, not by vibe." },
  { id: "cadence-pick", name: "Cadence pick", functionId: "planning", agent: "manager", summary: "A weekday plan that is not armed." },
  { id: "brief-handoff", name: "Brief handoff", functionId: "planning", agent: "manager", summary: "Manager passes one subject to the specialists." },
  { id: "voice-features", name: "Voice features", functionId: "copy", agent: "writer", summary: "Measure samples instead of adjectives." },
  { id: "hook-variants", name: "Hook variants", functionId: "copy", agent: "writer", summary: "Three openings, ordered by the voice profile." },
  { id: "thread-split", name: "Thread split", functionId: "copy", agent: "writer", summary: "Break a long X draft on the character limit." },
  { id: "fact-cite", name: "Fact cite", functionId: "copy", agent: "writer", summary: "A claim in the draft points at an evidence id." },
  { id: "x-cut", name: "X cut", functionId: "adapt", agent: "writer", summary: "A single post inside 280 characters." },
  { id: "linkedin-open", name: "LinkedIn open", functionId: "adapt", agent: "writer", summary: "A short first line, then the rest after the fold." },
  { id: "bluesky-cut", name: "Bluesky cut", functionId: "adapt", agent: "writer", summary: "The same idea inside 300 characters." },
  { id: "caption-rebuild", name: "Caption rebuild", functionId: "adapt", agent: "writer", summary: "An Instagram caption, not a pasted tweet." },
  { id: "brand-kit", name: "Brand kit", functionId: "visual", agent: "designer", summary: "Ink, paper, accent, and a logo word." },
  { id: "card-layout", name: "Card layout", functionId: "visual", agent: "designer", summary: "One SVG card from the kit and the hook." },
  { id: "png-export", name: "PNG export", functionId: "visual", agent: "designer", summary: "Rasterize the card in the browser." },
  { id: "approval-hold", name: "Approval hold", functionId: "gate", agent: "scheduler", summary: "Pending is the default. The calendar cannot move first." },
  { id: "edit-reset", name: "Edit reset", functionId: "gate", agent: "scheduler", summary: "A changed draft drops its yes." },
  { id: "human-reply-lock", name: "Human reply lock", functionId: "gate", agent: "scheduler", summary: "Mentions never become queue items." },
  { id: "heatmap-slots", name: "Heatmap slots", functionId: "timing", agent: "scheduler", summary: "Suggest hours from the weekday pattern." },
  { id: "calendar-place", name: "Calendar place", functionId: "timing", agent: "scheduler", summary: "A cell fills only after approval." },
  { id: "intent-link", name: "Intent link", functionId: "timing", agent: "scheduler", summary: "Build the X intent URL. Do not open it." },
  { id: "compose-once", name: "Compose once", functionId: "crosspost", agent: "scheduler", summary: "One canonical idea feeds every cut." },
  { id: "channel-preview", name: "Channel preview", functionId: "crosspost", agent: "scheduler", summary: "Read the four cuts side by side before a yes." },
  { id: "bookmark-rate", name: "Bookmark rate", functionId: "performance", agent: "analyst", summary: "Bookmarks over impressions, not likes alone." },
  { id: "hook-score", name: "Hook score", functionId: "performance", agent: "analyst", summary: "Score the opening pattern." },
  { id: "thread-depth", name: "Thread depth", functionId: "performance", agent: "analyst", summary: "Count the self-reply chain." },
  { id: "daily-digest", name: "Daily digest", functionId: "performance", agent: "analyst", summary: "A memo that admits a small sample." },
  { id: "ask-first", name: "Ask first", functionId: "safety", agent: "manager", summary: "Confirm publish and schedule when the toggles are on." },
  { id: "spend-cap", name: "Spend cap", functionId: "safety", agent: "manager", summary: "Refuse a new run that would start over the cap." },
  { id: "automation-checklist", name: "Automation checklist", functionId: "safety", agent: "manager", summary: "Keep the X rules visible on the desk." },
];

const HUMAN_SKILLS = new Set(["png-export", "calendar-place", "intent-link"]);

const SKILL_IDS = new Set(SKILLS.map((skill) => skill.id));

export function isHumanSkill(id: string): boolean {
  return HUMAN_SKILLS.has(id);
}

export function skillsForRun(): string[] {
  return SKILLS.map((skill) => skill.id).filter((id) => !HUMAN_SKILLS.has(id));
}

export function addSkill(used: readonly string[], id: string): string[] {
  if (!SKILL_IDS.has(id) || used.includes(id)) return [...used];
  return [...used, id];
}

export function skillById(id: string): SkillDef | undefined {
  return SKILLS.find((skill) => skill.id === id);
}

export function validateSkillGraph(): string[] {
  const problems: string[] = [];
  if (FUNCTIONS.length !== 12) problems.push(`functions:${FUNCTIONS.length}`);
  if (SKILLS.length !== 37) problems.push(`skills:${SKILLS.length}`);
  const functionIds = new Set<string>();
  for (const fn of FUNCTIONS) {
    if (functionIds.has(fn.id)) problems.push(`dup-function:${fn.id}`);
    functionIds.add(fn.id);
    if (!fn.name.trim() || !fn.summary.trim()) problems.push(`empty-function:${fn.id}`);
  }
  const skillIds = new Set<string>();
  const agents = new Set<string>(AGENT_ORDER);
  for (const skill of SKILLS) {
    if (skillIds.has(skill.id)) problems.push(`dup-skill:${skill.id}`);
    skillIds.add(skill.id);
    if (!functionIds.has(skill.functionId)) problems.push(`orphan-skill:${skill.id}`);
    if (!agents.has(skill.agent)) problems.push(`bad-agent:${skill.id}`);
    if (!skill.name.trim() || !skill.summary.trim()) problems.push(`empty-skill:${skill.id}`);
  }
  for (const fn of FUNCTIONS) {
    const count = SKILLS.filter((skill) => skill.functionId === fn.id).length;
    if (count < 1) problems.push(`empty-function-skills:${fn.id}`);
  }
  for (const agent of AGENT_ORDER) {
    const count = SKILLS.filter((skill) => skill.agent === agent).length;
    if (count < 1) problems.push(`agent-without-skill:${agent}`);
  }
  return problems;
}

export function skillsForAgent(agent: AgentId, used: readonly string[]): string[] {
  return used.filter((id) => skillById(id)?.agent === agent);
}
