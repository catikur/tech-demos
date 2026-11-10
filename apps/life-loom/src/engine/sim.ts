// Pure, seed-deterministic life loop.
// A world pack supplies places, households, stages, and endings.
// The engine only draws, applies a choice, rolls a little luck, and closes.

export type StatKey = "body" | "joy" | "bond";

export type Stats = Record<StatKey, number>;

export const STAT_KEYS: StatKey[] = ["body", "joy", "bond"];

export type Choice = {
  id: string;
  label: string;
  detail: string;
  effects: Partial<Stats>;
  /** Sticky tag. Ending rules look at these. */
  flag?: string;
  /** Chronicle sentence. Tokens: {name} {place} {home} */
  line: string;
};

export type Stage = {
  id: string;
  years: string;
  title: string;
  prompt: string;
  motif: string;
  choices: Choice[];
};

export type Place = {
  id: string;
  name: string;
  weight: number;
  blurb: string;
  /** 0–360, drives the scene color. */
  hue: number;
};

export type Household = {
  id: string;
  name: string;
  weight: number;
  blurb: string;
  start: Partial<Stats>;
};

export type Ending = {
  id: string;
  title: string;
  /** If set, the life must carry this flag. */
  flag?: string;
  /** If set, this stat must be the highest. */
  top?: StatKey;
  text: string;
};

export type Pack = {
  id: string;
  name: string;
  pitch: string;
  names: string[];
  places: Place[];
  households: Household[];
  stages: Stage[];
  /** First match wins. Keep a condition-free ending last. */
  endings: Ending[];
};

export type Luck = { stat: StatKey; delta: number };

export type Beat = {
  stageId: string;
  choiceId: string;
  line: string;
  luck: Luck;
  stats: Stats;
  flags: string[];
};

export type Run = {
  seed: number;
  rng: number;
  packId: string;
  name: string;
  placeId: string;
  householdId: string;
  /** Halkalar, ilk seçimden önce. */
  origin: Stats;
  stats: Stats;
  flags: string[];
  beats: Beat[];
};

export type Shadow = {
  name: string;
  placeName: string;
  endingId: string;
  choices: string[];
};

export type Claim = {
  text: string;
  stageId?: string;
};

export function clampStat(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
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

export function topStat(stats: Stats): StatKey {
  let best: StatKey = "body";
  for (const key of STAT_KEYS) {
    if (stats[key] > stats[best]) best = key;
  }
  return best;
}

export function pickEnding(pack: Pack, flags: string[], stats: Stats): Ending {
  const top = topStat(stats);
  for (const ending of pack.endings) {
    if (ending.flag && !flags.includes(ending.flag)) continue;
    if (ending.top && ending.top !== top) continue;
    return ending;
  }
  const last = pack.endings[pack.endings.length - 1];
  if (!last) throw new Error(`pack ${pack.id} has no endings`);
  return last;
}

function initialStats(home: Household): Stats {
  return {
    body: clampStat(48 + (home.start.body ?? 0)),
    joy: clampStat(48 + (home.start.joy ?? 0)),
    bond: clampStat(48 + (home.start.bond ?? 0)),
  };
}

function fill(template: string, name: string, place: string, home: string): string {
  return template
    .replaceAll("{name}", name)
    .replaceAll("{place}", place)
    .replaceAll("{home}", home);
}

function rollLuck(rnd: () => number): Luck {
  const stat = STAT_KEYS[Math.floor(rnd() * STAT_KEYS.length)]!;
  let delta = Math.floor(rnd() * 7) - 3;
  if (delta === 0) delta = 1;
  return { stat, delta };
}

function apply(stats: Stats, effects: Partial<Stats>, luck: Luck): Stats {
  const next: Stats = {
    body: stats.body + (effects.body ?? 0),
    joy: stats.joy + (effects.joy ?? 0),
    bond: stats.bond + (effects.bond ?? 0),
  };
  next[luck.stat] = next[luck.stat] + luck.delta;
  return {
    body: clampStat(next.body),
    joy: clampStat(next.joy),
    bond: clampStat(next.bond),
  };
}

export function beginRun(pack: Pack, seed: number): { run: Run; shadow: Shadow } {
  const rng = makeRng(seed);
  const place = weightedPick(pack.places, rng.next);
  const home = weightedPick(pack.households, rng.next);
  const name = pack.names[Math.floor(rng.next() * pack.names.length)] ?? pack.names[0] ?? "Kimse";
  const origin = initialStats(home);
  const run: Run = {
    seed,
    rng: rng.state(),
    packId: pack.id,
    name,
    placeId: place.id,
    householdId: home.id,
    origin,
    stats: { ...origin },
    flags: [],
    beats: [],
  };
  return { run, shadow: shadowLife(pack, seed ^ 0x9e3779b9) };
}

function leanScore(choice: Choice, rnd: () => number): number {
  const sum = (choice.effects.body ?? 0) + (choice.effects.joy ?? 0) + (choice.effects.bond ?? 0);
  return sum + rnd() * 6;
}

export function currentStage(pack: Pack, run: Run): Stage | null {
  return pack.stages[run.beats.length] ?? null;
}

export function choose(pack: Pack, run: Run, choiceId: string): { run: Run; ending: Ending | null } {
  const stage = currentStage(pack, run);
  if (!stage) {
    return { run, ending: pickEnding(pack, run.flags, run.stats) };
  }
  const choice = stage.choices.find((item) => item.id === choiceId);
  if (!choice) throw new Error(`unknown choice ${choiceId}`);
  return commit(pack, run, stage, choice);
}

/** Finish every remaining stage by leaning on effects, with a little noise. */
export function autoRest(pack: Pack, run: Run): { run: Run; ending: Ending } {
  let cursor = run;
  while (currentStage(pack, cursor)) {
    const stage = currentStage(pack, cursor)!;
    const rng = makeRng(cursor.rng);
    let best = stage.choices[0]!;
    let bestScore = -Infinity;
    for (const choice of stage.choices) {
      const score = leanScore(choice, rng.next);
      if (score > bestScore) {
        best = choice;
        bestScore = score;
      }
    }
    cursor = { ...cursor, rng: rng.state() };
    const step = commit(pack, cursor, stage, best);
    cursor = step.run;
    if (step.ending) return { run: cursor, ending: step.ending };
  }
  return { run: cursor, ending: pickEnding(pack, cursor.flags, cursor.stats) };
}

function commit(pack: Pack, run: Run, stage: Stage, choice: Choice): { run: Run; ending: Ending | null } {
  const place = pack.places.find((item) => item.id === run.placeId);
  const home = pack.households.find((item) => item.id === run.householdId);
  const rng = makeRng(run.rng);
  const luck = rollLuck(rng.next);
  const stats = apply(run.stats, choice.effects, luck);
  const flags = choice.flag && !run.flags.includes(choice.flag) ? [...run.flags, choice.flag] : run.flags;
  const beat: Beat = {
    stageId: stage.id,
    choiceId: choice.id,
    line: fill(choice.line, run.name, place?.name ?? "", home?.name ?? ""),
    luck,
    stats,
    flags,
  };
  const next: Run = {
    ...run,
    rng: rng.state(),
    stats,
    flags,
    beats: [...run.beats, beat],
  };
  const ending = next.beats.length >= pack.stages.length ? pickEnding(pack, next.flags, next.stats) : null;
  return { run: next, ending };
}

function shadowLife(pack: Pack, seed: number): Shadow {
  const rng = makeRng(seed);
  const place = weightedPick(pack.places, rng.next);
  const home = weightedPick(pack.households, rng.next);
  const name = pack.names[Math.floor(rng.next() * pack.names.length)] ?? "Kimse";
  let stats = initialStats(home);
  const flags: string[] = [];
  const choices: string[] = [];
  let state = rng.state();
  for (const stage of pack.stages) {
    const roll = makeRng(state);
    let best = stage.choices[0]!;
    let bestScore = -Infinity;
    for (const choice of stage.choices) {
      const score = leanScore(choice, roll.next);
      if (score > bestScore) {
        best = choice;
        bestScore = score;
      }
    }
    state = roll.state();
    const luck = rollLuck(roll.next);
    state = roll.state();
    stats = apply(stats, best.effects, luck);
    if (best.flag && !flags.includes(best.flag)) flags.push(best.flag);
    choices.push(best.label);
  }
  return {
    name,
    placeName: place.name,
    endingId: pickEnding(pack, flags, stats).id,
    choices,
  };
}

const STAT_LABEL: Record<StatKey, string> = {
  body: "beden",
  joy: "neşe",
  bond: "bağ",
};

export function claims(pack: Pack, run: Run, ending: Ending): Claim[] {
  const place = pack.places.find((item) => item.id === run.placeId);
  const home = pack.households.find((item) => item.id === run.householdId);
  const out: Claim[] = [
    {
      text: `${run.name}, ${place?.name ?? "bir yer"} bölgesine düştü. Çekiliş ağırlığa göre yapıldı; bu yerin ağırlığı ${place?.weight ?? 0}. Hane: ${home?.name ?? ""}.`,
    },
  ];
  const flagged = run.beats.find((beat) => {
    const stage = pack.stages.find((item) => item.id === beat.stageId);
    const choice = stage?.choices.find((item) => item.id === beat.choiceId);
    return Boolean(choice?.flag && ending.flag === choice.flag);
  });
  if (flagged) {
    const stage = pack.stages.find((item) => item.id === flagged.stageId);
    out.push({
      text: `${stage?.title ?? "Bir perde"} perdesindeki seçim «${ending.title}» kapanışını açan izi bıraktı.`,
      stageId: flagged.stageId,
    });
  }
  const top = topStat(run.stats);
  out.push({
    text: `Kapanışta en yüksek halka ${STAT_LABEL[top]} (${run.stats[top]}). Kurallar listedeki ilk eşleşeni seçer.`,
  });
  const last = run.beats[run.beats.length - 1];
  if (last) {
    out.push({
      text: `Son şans zarı ${STAT_LABEL[last.luck.stat]} ${last.luck.delta > 0 ? "+" : ""}${last.luck.delta} geldi. Zar sonucu garanti etmez, sadece kaydırır.`,
      stageId: last.stageId,
    });
  }
  return out;
}
