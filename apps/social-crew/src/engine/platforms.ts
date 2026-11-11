import { PLATFORM_LIMITS, type PlatformId, type VoiceProfile } from "./types";
import { fit, splitThread, topicTag } from "./text";
import { stripBanned } from "./voice";

export function linkedinFirstLine(text: string): string {
  return text.split("\n")[0] ?? "";
}

export function adaptPlatforms(input: {
  topic: string;
  hook: string;
  support: string;
  voice: VoiceProfile;
}): Record<PlatformId, string> {
  const hook = stripBanned(input.hook, input.voice.banned);
  const support = stripBanned(input.support, input.voice.banned);
  const spark = input.voice.emojiPerPost >= 1 ? " 🔥" : "";
  const tag = topicTag(input.topic);
  const single = `${hook}${spark} ${support}`.replace(/\s+/g, " ").trim();

  const linkedinFirst = fit(hook, 180);
  const linkedin = fit(
    `${linkedinFirst}\n\n${support}\n\nIf it is worth posting, the next step is a human yes, not a routine.`,
    PLATFORM_LIMITS.linkedin,
  );
  const instagram = fit(
    `${hook}\n\n${support}\n\nSave it if you want the version with a yes in the middle.\n\n${tag} #FieldNotes #KeepTheYes`,
    PLATFORM_LIMITS.instagram,
  );

  return {
    x: fit(single, PLATFORM_LIMITS.x),
    linkedin,
    bluesky: fit(single, PLATFORM_LIMITS.bluesky),
    instagram,
  };
}

export function guardThread(parts: readonly string[], limit: number): string[] {
  const output: string[] = [];
  for (const part of parts) {
    const clean = part.trim();
    if (!clean) continue;
    if (clean.length <= limit) {
      output.push(clean);
      continue;
    }
    output.push(...splitThread(clean, limit));
  }
  return output;
}
