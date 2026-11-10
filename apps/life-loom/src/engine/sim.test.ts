import { describe, expect, test } from "bun:test";
import { PACKS } from "../data/packs.ts";
import { autoRest, beginRun, explainChance, playYear, type Check, type Pack } from "./sim.ts";

const futbol = PACKS[0]!;

describe("olasılık", () => {
  const check: Check = {
    id: "t",
    title: "deneme",
    base: 0.4,
    weights: { form: 0.006 },
    originBias: { akademi: 0.1 },
    flagBias: { risk: -0.2 },
    hit: { prop: "ball", log: "tuttu" },
    miss: { prop: "crack", log: "kaçtı" },
  };

  test("yüksek form ihtimali büyütür", () => {
    const low = explainChance(check, { form: 20 }, "mahalle", "kanat", []);
    const high = explainChance(check, { form: 90 }, "mahalle", "kanat", []);
    expect(high.p).toBeGreaterThan(low.p);
  });

  test("yer ve iz sapması işler", () => {
    const plain = explainChance(check, { form: 50 }, "mahalle", "kanat", []);
    const academy = explainChance(check, { form: 50 }, "akademi", "kanat", []);
    const risky = explainChance(check, { form: 50 }, "mahalle", "kanat", ["risk"]);
    expect(academy.p).toBeGreaterThan(plain.p);
    expect(risky.p).toBeLessThan(plain.p);
  });

  test("yüzde 8 ile 92 arasında kalır", () => {
    const crushed = explainChance(check, { form: 0 }, "mahalle", "kanat", ["risk"]);
    const boosted = explainChance(check, { form: 100 }, "akademi", "kanat", []);
    expect(crushed.p).toBeGreaterThanOrEqual(0.08);
    expect(boosted.p).toBeLessThanOrEqual(0.92);
  });
});

describe("yıl", () => {
  test("aynı tohum aynı hayatı üretir", () => {
    const a = beginRun(futbol, 11);
    const b = beginRun(futbol, 11);
    expect(a.name).toBe(b.name);
    expect(a.originId).toBe(b.originId);
    const ya = playYear(futbol, a, futbol.beats[0]!.choices[0]!.id);
    const yb = playYear(futbol, b, futbol.beats[0]!.choices[0]!.id);
    expect(ya.year.roll).toBe(yb.year.roll);
    expect(ya.year.hit).toBe(yb.year.hit);
  });

  test("zar, açıklanan yüzdenin altında kalırsa tutar", () => {
    const run = beginRun(futbol, 3);
    const year = playYear(futbol, run, "antrenman").year;
    expect(year.hit).toBe(year.roll < year.p);
    expect(year.p).toBeGreaterThan(0);
    expect(year.p).toBeLessThan(1);
  });

  test("izle modu her mesleği kapatır", () => {
    for (const pack of PACKS) {
      const done = autoRest(pack, beginRun(pack, 21));
      expect(done.closed).toBe(true);
      expect(done.years.length).toBeGreaterThan(0);
      expect(done.years.length).toBeLessThanOrEqual(pack.beats.length);
      expect(done.cause.length).toBeGreaterThan(8);
      for (const stat of pack.stats) {
        expect(done.stats[stat.key]).toBeGreaterThanOrEqual(0);
        expect(done.stats[stat.key]).toBeLessThanOrEqual(100);
      }
    }
  });

  test("bilinmeyen seçim reddedilir", () => {
    const run = beginRun(futbol, 1);
    expect(() => playYear(futbol, run, "yok")).toThrow();
  });
});

describe("paket sözleşmesi", () => {
  test("her perdede seçim ve iki sonuç vardır", () => {
    for (const pack of PACKS as Pack[]) {
      expect(pack.beats.length).toBeGreaterThanOrEqual(5);
      expect(pack.stats.some((stat) => stat.key === pack.vital)).toBe(true);
      for (const beat of pack.beats) {
        expect(beat.choices.length).toBeGreaterThanOrEqual(2);
        expect(beat.check.hit.prop.length).toBeGreaterThan(0);
        expect(beat.check.miss.prop.length).toBeGreaterThan(0);
      }
      expect(pack.beats[pack.beats.length - 1]!.check.hit.end).toBe(true);
      expect(pack.beats[pack.beats.length - 1]!.check.miss.end).toBe(true);
    }
  });
});
