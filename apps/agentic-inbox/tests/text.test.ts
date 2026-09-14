import { describe, expect, test } from "bun:test";
import { isAsk, isPromise, normalizeTitle, parseDue, tokens } from "../server/features/text.ts";

// Monday 2026-09-14 09:00 UTC
const REF = Date.UTC(2026, 8, 14, 9);
const day = (d: number) => new Date(d).toISOString().slice(0, 10);

describe("parseDue", () => {
  test("weekdays resolve to the next occurrence at 17:00 UTC", () => {
    const due = parseDue("can you send it by Wednesday?", REF)!;
    expect(day(due)).toBe("2026-09-16");
    expect(new Date(due).getUTCHours()).toBe(17);
  });
  test("same weekday means next week unless 'this'", () => {
    expect(day(parseDue("Monday works", REF)!)).toBe("2026-09-21");
    expect(day(parseDue("this monday", REF)!)).toBe("2026-09-14");
  });
  test("relative words", () => {
    expect(day(parseDue("by tomorrow", REF)!)).toBe("2026-09-15");
    expect(day(parseDue("EOD please", REF)!)).toBe("2026-09-14");
    expect(day(parseDue("end of week", REF)!)).toBe("2026-09-18");
  });
  test("explicit dates", () => {
    expect(day(parseDue("sign by 30 Sep", REF)!)).toBe("2026-09-30");
    expect(day(parseDue("renews on the 30th", REF)!)).toBe("2026-09-30");
  });
  test("nothing → null", () => {
    expect(parseDue("no date in here", REF)).toBeNull();
  });
  test("Turkish relative words and weekdays", () => {
    expect(day(parseDue("yarın gönderirim", REF)!)).toBe("2026-09-15");
    expect(day(parseDue("bugün EOD", REF)!)).toBe("2026-09-14");
    expect(day(parseDue("Cuma'ya kadar", REF)!)).toBe("2026-09-18");
    expect(day(parseDue("haftaya bakacağım", REF)!)).toBe("2026-09-25");
  });
  test("Turkish explicit month dates", () => {
    expect(day(parseDue("30 eylül'e yetiştir", REF)!)).toBe("2026-09-30");
    expect(day(parseDue("imza 15 ekim", REF)!)).toBe("2026-10-15");
  });
});

describe("ask / promise detection", () => {
  test("asks", () => {
    expect(isAsk("Can you send me the postmortem?")).toBe(true);
    expect(isAsk("Please reply to confirm.")).toBe(true);
    expect(isAsk("Let me know by Friday.")).toBe(true);
    expect(isAsk("Deploy window moved to 16:00.")).toBe(false);
  });
  test("promises", () => {
    expect(isPromise("I'll write the postmortem by Wednesday.")).toBe(true);
    expect(isPromise("We will go with the background job.")).toBe(true);
    expect(isPromise("Thanks for the update.")).toBe(false);
  });
  test("Turkish asks", () => {
    expect(isAsk("Raporu Cuma'ya gönderir misin?")).toBe(true);
    expect(isAsk("Lütfen postmortem'e bir bak.")).toBe(true);
    expect(isAsk("Pencere 16:00'a alındı.")).toBe(false);
  });
  test("Turkish promises", () => {
    expect(isPromise("Checklist'i pazartesiye kadar paylaşacağım.")).toBe(true);
    expect(isPromise("Yarın döneceğim.")).toBe(true);
    expect(isPromise("Teşekkürler, güncelleme için.")).toBe(false);
  });
});

describe("tokens / titles", () => {
  test("drops stopwords, weekdays and short words", () => {
    expect(tokens("Re: the Export incident on Friday — postmortem draft")).toEqual(["export", "incident", "postmortem", "draft"]);
  });
  test("drops Turkish stopwords", () => {
    expect(tokens("ve için bir rapor taslağı hazırla")).toEqual(["rapor", "taslağı", "hazırla"]);
  });
  test("normalizeTitle strips reply prefixes and trailing dates", () => {
    expect(normalizeTitle("RE: Fwd: Q3 roadmap sync — Thu 14:00 UTC")).toBe("q3 roadmap sync");
  });
});
