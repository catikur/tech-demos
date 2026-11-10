import { describe, expect, test } from "bun:test";
import { PACKS } from "../data/packs.ts";
import {
  autoRest,
  beginRun,
  choose,
  claims,
  clampStat,
  pickEnding,
  topStat,
  weightedPick,
  type Pack,
} from "./sim.ts";

const liman = PACKS[0]!;
const orbit = PACKS[1]!;

describe("çekiliş", () => {
  test("yüksek ağırlık daha sık düşer", () => {
    const items = [
      { id: "az", weight: 1 },
      { id: "çok", weight: 9 },
    ];
    let heavy = 0;
    for (let seed = 1; seed <= 400; seed++) {
      let a = seed >>> 0;
      const rnd = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      if (weightedPick(items, rnd).id === "çok") heavy++;
    }
    expect(heavy).toBeGreaterThan(300);
  });

  test("aynı tohum aynı doğumu verir", () => {
    const a = beginRun(liman, 42);
    const b = beginRun(liman, 42);
    expect(a.run.name).toBe(b.run.name);
    expect(a.run.placeId).toBe(b.run.placeId);
    expect(a.run.householdId).toBe(b.run.householdId);
    expect(a.shadow.endingId).toBe(b.shadow.endingId);
  });
});

describe("perde", () => {
  test("altı seçim bir kapanışa varır", () => {
    let { run } = beginRun(orbit, 7);
    let ending = null;
    for (const stage of orbit.stages) {
      const step = choose(orbit, run, stage.choices[0]!.id);
      run = step.run;
      ending = step.ending;
    }
    expect(run.beats).toHaveLength(6);
    expect(ending?.id).toBeTruthy();
    expect(claims(orbit, run, ending!).length).toBeGreaterThan(1);
  });

  test("izle modu hayatı bitirir", () => {
    const { run } = beginRun(liman, 99);
    const done = autoRest(liman, run);
    expect(done.run.beats).toHaveLength(liman.stages.length);
    expect(done.ending.title.length).toBeGreaterThan(0);
    for (const key of ["body", "joy", "bond"] as const) {
      expect(done.run.stats[key]).toBeGreaterThanOrEqual(0);
      expect(done.run.stats[key]).toBeLessThanOrEqual(100);
    }
  });

  test("bilinmeyen seçim reddedilir", () => {
    const { run } = beginRun(liman, 3);
    expect(() => choose(liman, run, "yok")).toThrow();
  });
});

describe("kapanış", () => {
  test("bayrak kuralı, en yüksek halkadan önce gelir", () => {
    const pack = {
      endings: [
        { id: "iz", title: "İz", flag: "leave", text: "" },
        { id: "beden", title: "Beden", top: "body", text: "" },
        { id: "son", title: "Son", text: "" },
      ],
    } as Pack;
    expect(pickEnding(pack, ["leave"], { body: 90, joy: 10, bond: 10 }).id).toBe("iz");
  });

  test("bayrak yoksa en yüksek halka kazanır", () => {
    const pack = liman;
    expect(pickEnding(pack, [], { body: 10, joy: 80, bond: 20 }).id).toBe("defter");
    expect(topStat({ body: 10, joy: 80, bond: 20 })).toBe("joy");
  });

  test("halkalar 0 ile 100 arasında kalır", () => {
    expect(clampStat(-4)).toBe(0);
    expect(clampStat(140)).toBe(100);
  });
});
