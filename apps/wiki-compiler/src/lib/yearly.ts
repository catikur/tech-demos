import { YEARLY_QUESTIONS } from "../data/questions.ts";
import { backlinksTo } from "./wikilink.ts";
import type { Citation, Vault, VaultNote, YearlyAnswer } from "./types.ts";

export function draftYearlyAnswers(vault: Vault, questionIds: string[]): YearlyAnswer[] {
  return questionIds.map((id) => {
    const question = YEARLY_QUESTIONS.find((item) => item.id === id);
    if (!question) {
      return { questionId: id, prompt: id, draft: "Unknown question.", citations: [] };
    }
    return answerQuestion(vault, question.id, question.prompt);
  });
}

function answerQuestion(vault: Vault, id: string, prompt: string): YearlyAnswer {
  const notes = vault.notes;
  switch (id) {
    case "q-return": {
      const hits = pick(notes, (note) =>
        /compil|wiki|filing cabinet|ingest/i.test(`${note.title}\n${note.body}`),
      );
      return make(
        id,
        prompt,
        hits.length
          ? `The compile-at-ingest idea keeps resurfacing. ${hits[0]?.title} is the densest page; other notes orbit it instead of restating it.`
          : "No compiled pages mention compiling at ingest yet.",
        hits,
      );
    }
    case "q-contradict": {
      const hits = notes.filter((note) => note.frontmatter.type === "contradiction");
      return make(
        id,
        prompt,
        hits.length
          ? `Open flags: ${hits.map((note) => note.title).join("; ")}. The compiler did not pick a winner — that is curator work.`
          : "Contradiction checker found nothing (or the skill was off).",
        hits,
      );
    }
    case "q-changed-work": {
      const hits = pick(notes, (note) => /standup|async|cadence|meeting/i.test(`${note.title}\n${note.body}`));
      return make(
        id,
        prompt,
        hits.length
          ? `Meeting-cadence notes are the ones that changed the week. See ${hits.map((note) => `[[${note.title}]]`).join(", ")}.`
          : "No work-cadence notes compiled.",
        hits,
      );
    }
    case "q-highest": {
      const hits = notes
        .filter((note) => (note.frontmatter.rating ?? 0) >= 6)
        .sort((a, b) => (b.frontmatter.rating ?? 0) - (a.frontmatter.rating ?? 0));
      return make(
        id,
        prompt,
        hits.length
          ? `Rated 6–7: ${hits.map((note) => `${note.title} (${note.frontmatter.rating})`).join("; ")}. These are the pages the profile should keep quoting.`
          : "Nothing rated 6 or 7 yet.",
        hits,
      );
    }
    case "q-uncompiled": {
      const compiledIds = new Set(
        notes.filter((note) => note.folder !== "raw").flatMap((note) => note.frontmatter.sources ?? []),
      );
      const hits = notes.filter((note) => {
        if (note.folder !== "raw") return false;
        const sourceId = note.frontmatter.sources?.[0];
        return !sourceId || !compiledIds.has(sourceId);
      });
      return make(
        id,
        prompt,
        hits.length
          ? `Still only in raw/, never compiled: ${hits.map((note) => note.title).join("; ")}.`
          : "Every raw buffer already has a compiled page. Nothing is sitting there as an uncompiled belief.",
        hits,
      );
    }
    case "q-people": {
      const refs = notes.filter((note) => note.folder === "References");
      const ranked = refs
        .map((note) => ({ note, n: backlinksTo(notes, note.path).length }))
        .sort((a, b) => b.n - a.n);
      const hits = ranked.map((item) => item.note);
      return make(
        id,
        prompt,
        hits.length
          ? ranked
              .map((item) => `[[${item.note.title}]] has ${item.n} backlink${item.n === 1 ? "" : "s"}.`)
              .join(" ")
          : "No reference notes compiled.",
        hits,
      );
    }
    case "q-profile": {
      const hits = notes.filter((note) => note.frontmatter.type === "profile" || (note.frontmatter.rating ?? 0) >= 7);
      return make(
        id,
        prompt,
        "Refuse to forget: compile at ingest, flag contradictions instead of averaging them, keep ratings human.",
        hits,
      );
    }
    case "q-unfinished": {
      const hits = notes.filter(
        (note) =>
          note.folder === "Daily" ||
          (note.folder !== "raw" && note.frontmatter.type !== "index" && /open loop/i.test(note.body)),
      );
      return make(
        id,
        prompt,
        hits.length
          ? `Daily / open-loop pages: ${hits.map((note) => note.title).join("; ")}.`
          : "No daily notes compiled.",
        hits,
      );
    }
    default: {
      return { questionId: id, prompt, draft: "No evidence rule for this question.", citations: [] };
    }
  }
}

function pick(notes: VaultNote[], pred: (note: VaultNote) => boolean): VaultNote[] {
  const skip = new Set(["category", "index", "log", "brief", "profile", "contradiction", "raw"]);
  return notes
    .filter((note) => note.folder !== "raw" && !skip.has(String(note.frontmatter.type ?? "")) && pred(note))
    .sort((a, b) => (b.frontmatter.rating ?? 0) - (a.frontmatter.rating ?? 0));
}

function make(id: string, prompt: string, draft: string, notes: VaultNote[]): YearlyAnswer {
  const citations: Citation[] = notes.slice(0, 5).map((note) => ({ path: note.path, title: note.title }));
  return { questionId: id, prompt, draft, citations };
}
