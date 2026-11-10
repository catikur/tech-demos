// Career-agnostic life loop.
// A pack names the stats. Each year the player chooses, then one check
// computes a probability from those stats and resolves hit or miss.

export type Stats = Record<string, number>;

export type Origin = {
  id: string;
  name: string;
  weight: number;
  blurb: string;
  hue: number;
  mods: Stats;
};

export type Lifestyle = {
  id: string;
  name: string;
  weight: number;
  blurb: string;
  mods: Stats;
};

export type Choice = {
  id: string;
  label: string;
  detail: string;
  effects: Stats;
  flag?: string;
};

export type Outcome = {
  log: string;
  effects?: Stats;
  flag?: string;
  prop: string;
  /** Closes the life after this year. */
  end?: boolean;
  epitaph?: string;
};

export type Check = {
  id: string;
  title: string;
  /** Chance when every weighted stat sits at 50. */
  base: number;
  /** Added chance per point above 50. */
  weights: Stats;
  originBias?: Record<string, number>;
  lifestyleBias?: Record<string, number>;
  flagBias?: Record<string, number>;
  hit: Outcome;
  miss: Outcome;
};

export type Beat = {
  id: string;
  years: string;
  title: string;
  hook: string;
  choices: Choice[];
  check: Check;
};

export type StatDef = { key: string; label: string };

export type Pack = {
  id: string;
  name: string;
  role: string;
  pitch: string;
  names: string[];
  stats: StatDef[];
  /** Falls to zero and the life closes. */
  vital: string;
  origins: Origin[];
  lifestyles: Lifestyle[];
  beats: Beat[];
};

export type Reason = { key: string; delta: number };

export type Year = {
  beatId: string;
  choiceId: string;
  p: number;
  roll: number;
  hit: boolean;
  reasons: Reason[];
  prop: string;
  line: string;
  epitaph?: string;
  stats: Stats;
  flags: string[];
};

export type Run = {
  seed: number;
  rng: number;
  packId: string;
  name: string;
  originId: string;
  lifestyleId: string;
  stats: Stats;
  flags: string[];
  years: Year[];
  closed: boolean;
  cause: string;
};

export function clampStat(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function clampChance(n: number): number {
  return Math.min(0.92, Math.max(0.08, n));
}

export function makeRng(seed: number): { next: () => number; state: () => number } {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state: () => a >>> 0,
  };
}

export function weightedPick<T extends { weight: number }>(items: T[], rnd: () => number): T {
  if (items.length === 0) throw new Error("weightedPick: empty");
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rnd() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1]!;
}

function mergeStats(base: Stats, extra: Stats | undefined): Stats {
  const next = { ...base };
  for (const [key, value] of Object.entries(extra ?? {})) {
    next[key] = clampStat((next[key] ?? 50) + value);
  }
  return next;
}

export function explainChance(
  check: Check,
  stats: Stats,
  originId: string,
  lifestyleId: string,
  flags: string[],
): { p: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  let p = check.base;
  for (const [key, weight] of Object.entries(check.weights)) {
    const delta = ((stats[key] ?? 50) - 50) * weight;
    p += delta;
    if (Math.abs(delta) >= 0.015) reasons.push({ key, delta });
  }
  const origin = check.originBias?.[originId] ?? 0;
  if (origin) {
    p += origin;
    reasons.push({ key: `yer:${originId}`, delta: origin });
  }
  const life = check.lifestyleBias?.[lifestyleId] ?? 0;
  if (life) {
    p += life;
    reasons.push({ key: `tarz:${lifestyleId}`, delta: life });
  }
  for (const flag of flags) {
    const bias = check.flagBias?.[flag] ?? 0;
    if (bias) {
      p += bias;
      reasons.push({ key: `iz:${flag}`, delta: bias });
    }
  }
  reasons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { p: clampChance(p), reasons: reasons.slice(0, 3) };
}

export function beginRun(pack: Pack, seed: number): Run {
  const rng = makeRng(seed);
  const origin = weightedPick(pack.origins, rng.next);
  const lifestyle = weightedPick(pack.lifestyles, rng.next);
  const name = pack.names[Math.floor(rng.next() * pack.names.length)] ?? "Kimse";
  let stats: Stats = {};
  for (const stat of pack.stats) stats[stat.key] = 48;
  stats = mergeStats(stats, origin.mods);
  stats = mergeStats(stats, lifestyle.mods);
  return {
    seed,
    rng: rng.state(),
    packId: pack.id,
    name,
    originId: origin.id,
    lifestyleId: lifestyle.id,
    stats,
    flags: [],
    years: [],
    closed: false,
    cause: "",
  };
}

export function currentBeat(pack: Pack, run: Run): Beat | null {
  if (run.closed) return null;
  return pack.beats[run.years.length] ?? null;
}

export function leanChoice(pack: Pack, run: Run): Choice {
  const beat = currentBeat(pack, run);
  if (!beat) throw new Error("no beat");
  const rng = makeRng(run.rng ^ 0x51ed);
  let best = beat.choices[0]!;
  let bestScore = -Infinity;
  for (const choice of beat.choices) {
    const sum = Object.values(choice.effects).reduce((total, value) => total + value, 0);
    const score = sum + rng.next() * 5;
    if (score > bestScore) {
      best = choice;
      bestScore = score;
    }
  }
  return best;
}

function fill(template: string, run: Run, pack: Pack): string {
  const origin = pack.origins.find((item) => item.id === run.originId);
  const lifestyle = pack.lifestyles.find((item) => item.id === run.lifestyleId);
  return template
    .replaceAll("{name}", run.name)
    .replaceAll("{origin}", origin?.name ?? "")
    .replaceAll("{life}", lifestyle?.name ?? "");
}

export function playYear(pack: Pack, run: Run, choiceId: string): { run: Run; year: Year } {
  if (run.closed) throw new Error("life already closed");
  const beat = currentBeat(pack, run);
  if (!beat) throw new Error("no year left");
  const choice = beat.choices.find((item) => item.id === choiceId);
  if (!choice) throw new Error(`unknown choice ${choiceId}`);

  let stats = mergeStats(run.stats, choice.effects);
  const flags = choice.flag && !run.flags.includes(choice.flag) ? [...run.flags, choice.flag] : [...run.flags];
  const explained = explainChance(beat.check, stats, run.originId, run.lifestyleId, flags);
  const rng = makeRng(run.rng);
  const roll = rng.next();
  const hit = roll < explained.p;
  const outcome = hit ? beat.check.hit : beat.check.miss;
  stats = mergeStats(stats, outcome.effects);
  if (outcome.flag && !flags.includes(outcome.flag)) flags.push(outcome.flag);

  const vital = stats[pack.vital] ?? 0;
  const last = run.years.length + 1 >= pack.beats.length;
  const closed = Boolean(outcome.end) || vital <= 0 || last;
  const line = fill(outcome.log, run, pack);
  const epitaph = outcome.epitaph ? fill(outcome.epitaph, run, pack) : undefined;
  const year: Year = {
    beatId: beat.id,
    choiceId,
    p: explained.p,
    roll,
    hit,
    reasons: explained.reasons,
    prop: outcome.prop,
    line,
    epitaph,
    stats,
    flags,
  };
  const cause = closed ? (epitaph ?? line) : "";
  return {
    year,
    run: {
      ...run,
      rng: rng.state(),
      stats,
      flags,
      years: [...run.years, year],
      closed,
      cause,
    },
  };
}

export function autoRest(pack: Pack, run: Run): Run {
  let cursor = run;
  while (!cursor.closed && currentBeat(pack, cursor)) {
    const choice = leanChoice(pack, cursor);
    cursor = playYear(pack, cursor, choice.id).run;
  }
  return cursor;
}

export function statLabel(pack: Pack, key: string): string {
  return pack.stats.find((stat) => stat.key === key)?.label ?? key;
}
