import { adaptPlatforms, guardThread, linkedinFirstLine } from "./platforms";
import type { DraftBundle, HookVariant, ScoutReport, VoiceProfile } from "./types";
import { PLATFORM_LIMITS } from "./types";
import { fit } from "./text";

function orderHooks(voice: VoiceProfile, hooks: HookVariant[]): HookVariant[] {
  const rank: Record<HookVariant["id"], number> =
    voice.prefers === "question"
      ? { question: 0, proof: 1, story: 2 }
      : voice.prefers === "punchy"
        ? { proof: 0, question: 1, story: 2 }
        : { story: 0, question: 1, proof: 2 };
  return [...hooks].sort((a, b) => rank[a.id] - rank[b.id] || a.id.localeCompare(b.id));
}

export function writeDraft(input: {
  topic: string;
  report: ScoutReport;
  voice: VoiceProfile;
}): DraftBundle {
  const top = input.report.opportunities[0];
  if (!top) throw new Error("scout-empty");
  const evidenceId = top.evidenceIds[0] ?? input.report.evidence[0]?.id ?? "ev-none";
  const claim = fit(top.claim, 180);
  const cite = `(src ${evidenceId})`;
  const person = input.voice.firstPersonRate >= 0.2;
  const hooks = orderHooks(input.voice, [
    {
      id: "question",
      label: "Question",
      text: fit(`What should stay human when you post about ${input.topic}?`, 180),
    },
    {
      id: "proof",
      label: "Proof",
      text: claim,
    },
    {
      id: "story",
      label: "Story",
      text: fit(
        person
          ? `I drafted this on ${input.topic} and left it unsent.`
          : `The draft on ${input.topic} stayed unsent.`,
        180,
      ),
    },
  ]);
  const chosen = hooks[0];
  const support = `${fit(top.angle, 140)} ${cite}`;
  const counter = `Counterexample: ${top.counterexample}`;
  const next = `Next test: ${top.nextTest}`;
  const platforms = adaptPlatforms({
    topic: input.topic,
    hook: chosen?.text ?? claim,
    support,
    voice: input.voice,
  });
  const thread = guardThread([chosen?.text ?? claim, support, counter, next], PLATFORM_LIMITS.x);
  return {
    hooks,
    support,
    counterexample: top.counterexample,
    nextTest: top.nextTest,
    platforms,
    thread,
    evidenceIds: top.evidenceIds,
  };
}

export function rebuildDraft(input: {
  topic: string;
  hook: string;
  support: string;
  counterexample: string;
  nextTest: string;
  voice: VoiceProfile;
}): { platforms: DraftBundle["platforms"]; thread: string[] } {
  const platforms = adaptPlatforms({
    topic: input.topic,
    hook: input.hook,
    support: input.support,
    voice: input.voice,
  });
  const thread = guardThread(
    [
      input.hook,
      input.support,
      `Counterexample: ${input.counterexample}`,
      `Next test: ${input.nextTest}`,
    ],
    PLATFORM_LIMITS.x,
  );
  return { platforms, thread };
}

export { linkedinFirstLine };
