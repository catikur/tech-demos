import type { VoicePreference, VoiceProfile } from "./types";
import { roundTo } from "./text";

export const DEFAULT_BANNED = [
  "game-changer",
  "delve",
  "unlock your",
  "in today's world",
  "let's dive in",
  "as an ai",
];

export const SAMPLE_POSTS = [
  "I keep the draft on my machine until I say yes.",
  "Why did the agent reply? Because nobody told it to stop.",
  "Short lines. One claim. A source under it.",
  "I don't automate the part that makes the account sound like a person.",
];

const CONTRACTION = /\b[\p{L}]+'(?:t|re|ve|ll|d|m)\b/iu;
const EMOJI = /\p{Extended_Pictographic}/gu;
const FIRST_PERSON =
  /\b(i|i'm|i've|i'd|i'll|my|mine|we|we're|we've|our|ours)\b/i;

type Sentence = {
  text: string;
  question: boolean;
  exclaim: boolean;
};

export function splitSentences(post: string): Sentence[] {
  const matches = post.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const sentences: Sentence[] = [];
  for (const raw of matches) {
    const text = raw.trim();
    if (!text) continue;
    const question = text.includes("?");
    sentences.push({
      text,
      question,
      exclaim: !question && text.includes("!"),
    });
  }
  return sentences;
}

function emptyProfile(): VoiceProfile {
  return {
    postCount: 0,
    avgWordsPerSentence: 14,
    avgWordLength: 4.5,
    questionRate: 0,
    exclamationRate: 0,
    firstPersonRate: 0,
    contractionRate: 0,
    emojiPerPost: 0,
    prefers: "story",
    banned: [...DEFAULT_BANNED],
  };
}

export function extractVoice(samples: string[]): VoiceProfile {
  const posts = samples.map((sample) => sample.trim()).filter((sample) => sample.length > 0);
  if (posts.length === 0) return emptyProfile();

  let sentences = 0;
  let words = 0;
  let wordChars = 0;
  let questions = 0;
  let exclamations = 0;
  let firstPerson = 0;
  let contractions = 0;
  let emojis = 0;

  for (const post of posts) {
    emojis += post.match(EMOJI)?.length ?? 0;
    const parts = splitSentences(post);
    const usable = parts.length > 0 ? parts : [{ text: post, question: false, exclaim: false }];
    for (const sentence of usable) {
      sentences += 1;
      if (sentence.question) questions += 1;
      if (sentence.exclaim) exclamations += 1;
      if (FIRST_PERSON.test(sentence.text)) firstPerson += 1;
      if (CONTRACTION.test(sentence.text)) contractions += 1;
      const bare = sentence.text.replace(/[.!?]+$/g, "").trim();
      const tokens = bare.split(/\s+/).filter((token) => token.length > 0);
      words += tokens.length;
      for (const token of tokens) wordChars += token.length;
    }
  }

  const safeSentences = Math.max(sentences, 1);
  const avgWordsPerSentence = roundTo(words / safeSentences, 1);
  const questionRate = roundTo(questions / safeSentences, 2);
  const prefers: VoicePreference =
    questionRate >= 0.34 ? "question" : avgWordsPerSentence <= 12 ? "punchy" : "story";

  return {
    postCount: posts.length,
    avgWordsPerSentence,
    avgWordLength: roundTo(wordChars / Math.max(words, 1), 1),
    questionRate,
    exclamationRate: roundTo(exclamations / safeSentences, 2),
    firstPersonRate: roundTo(firstPerson / safeSentences, 2),
    contractionRate: roundTo(contractions / safeSentences, 2),
    emojiPerPost: roundTo(emojis / posts.length, 2),
    prefers,
    banned: [...DEFAULT_BANNED],
  };
}

export function parseSamples(raw: string): string[] {
  const blocks = raw
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  if (blocks.length > 1) return blocks;
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function stripBanned(text: string, banned: readonly string[]): string {
  let next = text;
  for (const phrase of banned) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(escaped, "gi"), "");
  }
  return next.replace(/[ \t]{2,}/g, " ").trim();
}
