import {
  SOURCE_ORDER,
  type Evidence,
  type Mention,
  type Opportunity,
  type ScoutReport,
  type SourceId,
} from "./types";
import { ANCHOR_ISO, hashString, shiftDays, slugify } from "./text";

export const WINDOW_START = shiftDays(ANCHOR_ISO, -30);

export function compositeScore(input: {
  demand: number;
  evidence: number;
  competition: number;
  timing: number;
  fit: number;
}): number {
  const raw =
    0.28 * input.demand +
    0.24 * input.evidence +
    0.16 * (100 - input.competition) +
    0.16 * input.timing +
    0.16 * input.fit;
  return Math.round(raw);
}

function opportunity(
  input: Omit<Opportunity, "composite">,
): Opportunity {
  return { ...input, composite: compositeScore(input) };
}

function fixtureUrl(source: SourceId, topic: string, id: string): string {
  return `https://fixtures.social-crew.test/${source}/${slugify(topic)}/${id}`;
}

function finish(report: Omit<ScoutReport, "sources" | "windowStart" | "windowEnd">): ScoutReport {
  const opportunities = [...report.opportunities].sort(
    (a, b) => b.composite - a.composite || a.id.localeCompare(b.id),
  );
  const mentions = [...report.mentions].sort(
    (a, b) => b.matchScore - a.matchScore || a.id.localeCompare(b.id),
  );
  const present = new Set(report.evidence.map((item) => item.source));
  return {
    ...report,
    opportunities,
    mentions,
    windowStart: WINDOW_START,
    windowEnd: ANCHOR_ISO,
    sources: SOURCE_ORDER.filter((source) => present.has(source)),
  };
}

function agentsReport(topic: string): ScoutReport {
  const evidence: Evidence[] = [
    {
      id: "ev-x-gate",
      source: "x",
      title: "One manager, not a group chat of bots",
      excerpt: "People comparing agent desks keep landing on the same complaint: six bots in one room spend the allowance on messages nobody asked for.",
      url: fixtureUrl("x", topic, "ev-x-gate"),
      date: "2026-11-09",
      engagement: 2480,
    },
    {
      id: "ev-reddit-voice",
      source: "reddit",
      title: "Adjectives did not teach the voice",
      excerpt: "A builder pasted ten real posts after calling the tone direct. The next draft was the first one they did not rewrite from scratch.",
      url: fixtureUrl("reddit", topic, "ev-reddit-voice"),
      date: "2026-11-04",
      engagement: 186,
    },
    {
      id: "ev-yt-pause",
      source: "youtube",
      title: "The useful frame is the pause",
      excerpt: "A walkthrough of a six-role social desk spends its last minute on the approval card, not on the model picker.",
      url: fixtureUrl("youtube", topic, "ev-yt-pause"),
      date: "2026-10-28",
      engagement: 910,
    },
    {
      id: "ev-hn-lock",
      source: "hn",
      title: "Job text is not a lock",
      excerpt: "Commenters note that every bot on a shared machine can reach a posting tool. The ask-first rule is the gate that actually sits on the account.",
      url: fixtureUrl("hn", topic, "ev-hn-lock"),
      date: "2026-10-22",
      engagement: 142,
    },
    {
      id: "ev-web-manual",
      source: "web",
      title: "Hand-run it before you save a routine",
      excerpt: "The writeups that hold up show one full manual pass, a fix in the job description, and only then a morning brief.",
      url: fixtureUrl("web", topic, "ev-web-manual"),
      date: "2026-10-16",
      engagement: 64,
    },
    {
      id: "ev-x-reply",
      source: "x",
      title: "Reply bots are where accounts get filtered",
      excerpt: "Threads from the last month treat keyword replies as the line X has already enforced, not as a clever growth trick.",
      url: fixtureUrl("x", topic, "ev-x-reply"),
      date: "2026-11-01",
      engagement: 3210,
    },
    {
      id: "ev-reddit-paste",
      source: "reddit",
      title: "The same caption on four networks looks automated",
      excerpt: "Readers can tell when a LinkedIn post is an X draft with a line break. The ask is to rebuild, not to paste.",
      url: fixtureUrl("reddit", topic, "ev-reddit-paste"),
      date: "2026-10-19",
      engagement: 97,
    },
    {
      id: "ev-hn-cap",
      source: "hn",
      title: "A cap does not stop a run already moving",
      excerpt: "Operators who hit a usage ceiling say the check has to happen before the task starts. Mid-flight, the work finishes.",
      url: fixtureUrl("hn", topic, "ev-hn-cap"),
      date: "2026-11-07",
      engagement: 88,
    },
  ];
  return finish({
    topic,
    summary:
      "Simulated sweep only: the human still owes the yes. Across the last 30 days the loudest pattern is the handoff, not a new model. People want one manager, five specialists, and a gate before anything is public. Reply bots are where the sources disagree with the demos: the demos show speed, the threads show suspensions and thin voice.",
    evidence,
    opportunities: [
      opportunity({
        id: "op-yes-gate",
        claim: "The desk people trust is the one that cannot post until a human says yes.",
        angle: "Lead with the gate, not with the number of bots.",
        demand: 80,
        evidence: 90,
        competition: 30,
        timing: 70,
        fit: 85,
        evidenceIds: ["ev-x-gate", "ev-hn-lock"],
        counterexample: "Some operators say a gate just creates a pile of stale drafts they never open.",
        nextTest: "Run one subject by hand and see whether the pending card is understandable without a tour.",
      }),
      opportunity({
        id: "op-voice-file",
        claim: "Voice shows up in real posts, not in words like direct or witty.",
        angle: "Train on samples and a banned list, then compare against a post you already shipped.",
        demand: 74,
        evidence: 70,
        competition: 48,
        timing: 66,
        fit: 80,
        evidenceIds: ["ev-reddit-voice"],
        counterexample: "A thin sample still produces a generic draft, and the file can overfit one mood.",
        nextTest: "Paste four posts, draft a topic you have already covered, and mark the sentence you would not say.",
      }),
      opportunity({
        id: "op-rebuild",
        claim: "Each network needs its own cut. Pasting the X draft is how a feed starts to look unattended.",
        angle: "Show the four lengths side by side before anyone approves.",
        demand: 68,
        evidence: 64,
        competition: 55,
        timing: 60,
        fit: 72,
        evidenceIds: ["ev-reddit-paste"],
        counterexample: "A small account may only need one extra network, and four cuts can burn the allowance.",
        nextTest: "Approve one post for X only, and rebuild a second network after that cut stops needing edits.",
      }),
      opportunity({
        id: "op-manual",
        claim: "A routine should wait until one manual pass has survived a correction.",
        angle: "Keep the morning brief visible and disarmed.",
        demand: 62,
        evidence: 78,
        competition: 40,
        timing: 58,
        fit: 70,
        evidenceIds: ["ev-web-manual", "ev-hn-cap"],
        counterexample: "Waiting feels slow if the first pass was already clean.",
        nextTest: "Correct one job in the desk, rerun the same subject, and check that the fix is still there.",
      }),
    ],
    mentions: [
      {
        id: "mn-reply-overnight",
        source: "x",
        text: "Did anyone's agent reply to strangers overnight, or is that just my timeline?",
        why: "A question about unattended replies. List it. Do not answer it.",
        url: fixtureUrl("x", topic, "mn-reply-overnight"),
        date: "2026-11-08",
        matchScore: 91,
        humanOnly: true,
      },
      {
        id: "mn-rejected",
        source: "reddit",
        text: "How do you stop a scheduler from posting the draft you already rejected?",
        why: "The gate is the subject. A human reply can explain the hold.",
        url: fixtureUrl("reddit", topic, "mn-rejected"),
        date: "2026-11-02",
        matchScore: 84,
        humanOnly: true,
      },
      {
        id: "mn-voice",
        source: "hn",
        text: "What did you actually paste to stop the drafts sounding like a brochure?",
        why: "A voice question. Answer from your own samples if you want to join.",
        url: fixtureUrl("hn", topic, "mn-voice"),
        date: "2026-10-27",
        matchScore: 77,
        humanOnly: true,
      },
    ],
  });
}

function localFirstReport(topic: string): ScoutReport {
  const evidence: Evidence[] = [
    {
      id: "ev-x-disk",
      source: "x",
      title: "The file never left the laptop",
      excerpt: "Notes apps that sync later are getting the praise this month. The complaint is a sync that moved a private draft before the author was ready.",
      url: fixtureUrl("x", topic, "ev-x-disk"),
      date: "2026-11-06",
      engagement: 980,
    },
    {
      id: "ev-reddit-format",
      source: "reddit",
      title: "Plain files beat another account",
      excerpt: "A long thread prefers a folder of markdown over a hosted notebook, mostly because export is the default rather than a project.",
      url: fixtureUrl("reddit", topic, "ev-reddit-format"),
      date: "2026-10-30",
      engagement: 240,
    },
    {
      id: "ev-yt-offline",
      source: "youtube",
      title: "Offline is the demo, not a settings page",
      excerpt: "The videos that travel are the ones that pull the network cable and keep typing.",
      url: fixtureUrl("youtube", topic, "ev-yt-offline"),
      date: "2026-10-21",
      engagement: 1500,
    },
    {
      id: "ev-hn-sync",
      source: "hn",
      title: "Sync is a feature you opt into",
      excerpt: "The skeptical comments want conflict copies on disk, not a silent merge.",
      url: fixtureUrl("hn", topic, "ev-hn-sync"),
      date: "2026-10-14",
      engagement: 210,
    },
    {
      id: "ev-web-export",
      source: "web",
      title: "Leave with the folder",
      excerpt: "Reviews this window reward tools that still make sense as files if the company disappears.",
      url: fixtureUrl("web", topic, "ev-web-export"),
      date: "2026-11-10",
      engagement: 40,
    },
  ];
  return finish({
    topic,
    summary:
      "Simulated sweep only: the notes stay on the machine until you say yes. The 30-day read is about ownership of the file, not about another AI sidebar. People praise offline typing and punish a sync that publishes a draft early.",
    evidence,
    opportunities: [
      opportunity({
        id: "op-disk",
        claim: "A local-first note is easier to trust when the draft cannot leave the machine by accident.",
        angle: "Show the file path, not a cloud metaphor.",
        demand: 77,
        evidence: 72,
        competition: 44,
        timing: 69,
        fit: 84,
        evidenceIds: ["ev-x-disk", "ev-hn-sync"],
        counterexample: "Teams that already live in a shared doc will hear this as nostalgia.",
        nextTest: "Draft the post as a file, then decide if the public version is shorter.",
      }),
      opportunity({
        id: "op-export",
        claim: "Export is the feature people actually test, not the theme picker.",
        angle: "One concrete leave-with-the-folder claim.",
        demand: 70,
        evidence: 66,
        competition: 38,
        timing: 61,
        fit: 75,
        evidenceIds: ["ev-web-export", "ev-reddit-format"],
        counterexample: "A perfect export story still loses if the editor is unpleasant.",
        nextTest: "Film the export once. If you cannot explain it in a sentence, do not post the slogan.",
      }),
      opportunity({
        id: "op-offline",
        claim: "Offline has to be the demo, not a footnote in settings.",
        angle: "A short thread: unplug, type, show the file.",
        demand: 64,
        evidence: 80,
        competition: 52,
        timing: 57,
        fit: 68,
        evidenceIds: ["ev-yt-offline"],
        counterexample: "Most readers will not unplug anything. They need the result described.",
        nextTest: "Write the unplug sentence and cut any line that needs a screenshot to make sense.",
      }),
    ],
    mentions: [
      {
        id: "mn-sync",
        source: "reddit",
        text: "Which notes app will not upload the draft the moment I close the lid?",
        why: "A product question. Answer only if you have used the tool.",
        url: fixtureUrl("reddit", topic, "mn-sync"),
        date: "2026-11-03",
        matchScore: 88,
        humanOnly: true,
      },
      {
        id: "mn-files",
        source: "hn",
        text: "Is markdown on disk still a serious pitch, or are we pretending?",
        why: "A skeptic. Worth a human reply if you want the argument.",
        url: fixtureUrl("hn", topic, "mn-files"),
        date: "2026-10-18",
        matchScore: 73,
        humanOnly: true,
      },
    ],
  });
}

function devtoolsReport(topic: string): ScoutReport {
  const evidence: Evidence[] = [
    {
      id: "ev-x-cli",
      source: "x",
      title: "Show the command, then the result",
      excerpt: "Posts that open with a command and a one-line result are outrunning tool announcements with no artifact.",
      url: fixtureUrl("x", topic, "ev-x-cli"),
      date: "2026-11-05",
      engagement: 1760,
    },
    {
      id: "ev-reddit-readme",
      source: "reddit",
      title: "The README is the product surface",
      excerpt: "A recurring complaint: the demo video hides the install. Readers want the three commands and the failure mode.",
      url: fixtureUrl("reddit", topic, "ev-reddit-readme"),
      date: "2026-10-25",
      engagement: 132,
    },
    {
      id: "ev-yt-diff",
      source: "youtube",
      title: "A diff teaches faster than a roadmap",
      excerpt: "Short videos that stay on one diff keep their audience. Roadmap tours do not.",
      url: fixtureUrl("youtube", topic, "ev-yt-diff"),
      date: "2026-10-17",
      engagement: 640,
    },
    {
      id: "ev-hn-bench",
      source: "hn",
      title: "Name the machine and the caveat",
      excerpt: "Benchmark threads punish a number without the hardware and the workload.",
      url: fixtureUrl("hn", topic, "ev-hn-bench"),
      date: "2026-11-08",
      engagement: 305,
    },
    {
      id: "ev-web-changelog",
      source: "web",
      title: "Changelogs written as sentences",
      excerpt: "The pieces people forward are changelogs that say what broke and what you do now.",
      url: fixtureUrl("web", topic, "ev-web-changelog"),
      date: "2026-10-12",
      engagement: 51,
    },
  ];
  return finish({
    topic,
    summary:
      "Simulated sweep only: the tool does not post for you. Developers in this window reward a command, a result, and a caveat. They skip announcements that never show the artifact.",
    evidence,
    opportunities: [
      opportunity({
        id: "op-command",
        claim: "A developer-tool post should open with the command and the thing it changed.",
        angle: "One command, one result, one caveat.",
        demand: 82,
        evidence: 76,
        competition: 46,
        timing: 71,
        fit: 79,
        evidenceIds: ["ev-x-cli", "ev-yt-diff"],
        counterexample: "A command with no context reads as a puzzle, not a post.",
        nextTest: "Write the command in the first line and delete any sentence that does not change what the reader does.",
      }),
      opportunity({
        id: "op-caveat",
        claim: "A number without the machine is how a tool post loses the thread.",
        angle: "Put the caveat in the same post as the claim.",
        demand: 69,
        evidence: 84,
        competition: 33,
        timing: 63,
        fit: 74,
        evidenceIds: ["ev-hn-bench"],
        counterexample: "Too many caveats and the post never makes a point.",
        nextTest: "Keep one number and one sentence on what it does not prove.",
      }),
      opportunity({
        id: "op-readme",
        claim: "Readers are judging the README, not the launch adjective.",
        angle: "Quote the install, including the boring failure.",
        demand: 61,
        evidence: 67,
        competition: 58,
        timing: 54,
        fit: 66,
        evidenceIds: ["ev-reddit-readme", "ev-web-changelog"],
        counterexample: "Install docs are a poor hook if the reader has no reason to care yet.",
        nextTest: "Lead with the result, then the three commands, and stop.",
      }),
    ],
    mentions: [
      {
        id: "mn-install",
        source: "reddit",
        text: "What is the actual install, not the thirty-second cut?",
        why: "They want the boring steps. Reply yourself if you maintain the tool.",
        url: fixtureUrl("reddit", topic, "mn-install"),
        date: "2026-11-09",
        matchScore: 86,
        humanOnly: true,
      },
      {
        id: "mn-bench",
        source: "hn",
        text: "Post the hardware next to the number or don't post the number.",
        why: "A correction, not a prompt for a bot.",
        url: fixtureUrl("hn", topic, "mn-bench"),
        date: "2026-10-29",
        matchScore: 80,
        humanOnly: true,
      },
    ],
  });
}

function band(seed: number, salt: number): number {
  return 36 + ((seed >>> salt) % 58);
}

function synthesize(topic: string): ScoutReport {
  const seed = hashString(topic);
  const frames = [
    `People comparing notes on ${topic} keep asking for a human yes before anything goes out.`,
    `The useful argument around ${topic} is specific: one claim, one source, one next test.`,
    `A quieter thread on ${topic} wants the post to sound like a person who has done the work.`,
  ];
  const summaryLead = frames[seed % frames.length] ?? frames[0]!;
  const sources: SourceId[] = ["x", "reddit", "youtube", "hn", "web"];
  const evidence: Evidence[] = sources.map((source, index) => {
    const id = `ev-${source}-gen`;
    const delta = -((seed >>> (index + 1)) % 31);
    return {
      id,
      source,
      title: `${source.toUpperCase()} note on ${topic}`,
      excerpt: `${summaryLead} This ${source} fixture is a simulated signal inside the 30-day window, not a live read.`,
      url: fixtureUrl(source, topic, id),
      date: shiftDays(ANCHOR_ISO, delta),
      engagement: 40 + ((seed >>> (index + 3)) % 4000),
    };
  });
  const angles = [
    `Lead with the part of ${topic} a reader can try this week.`,
    `Name the counterexample before you praise ${topic}.`,
    `Cut ${topic} into one claim and one source.`,
    `Keep a yes in the middle of any post about ${topic}.`,
  ];
  const opportunities = angles.map((angle, index) => {
    const scores = {
      demand: band(seed, index + 2),
      evidence: band(seed, index + 5),
      competition: band(seed, index + 8),
      timing: band(seed, index + 11),
      fit: band(seed, index + 14),
    };
    const evidenceId = evidence[index % evidence.length]!.id;
    return opportunity({
      id: `op-gen-${index + 1}`,
      claim: angle.replace(/\.$/, "") + ".",
      angle,
      ...scores,
      evidenceIds: [evidenceId],
      counterexample: `A skeptical read: ${topic} may not need a public post until the example is concrete.`,
      nextTest: `Write one sentence on ${topic} that a stranger could check without trusting you.`,
    });
  });
  const mentions: Mention[] = [0, 1, 2].map((index) => ({
    id: `mn-gen-${index + 1}`,
    source: sources[index] ?? "web",
    text: `Has anyone shipped something small around ${topic} without letting a bot speak for them?`,
    why: "A human conversation. The crew records it and leaves the reply to you.",
    url: fixtureUrl(sources[index] ?? "web", topic, `mn-gen-${index + 1}`),
    date: shiftDays(ANCHOR_ISO, -((seed >>> (index + 6)) % 31)),
    matchScore: 70 + ((seed >>> (index + 9)) % 25),
    humanOnly: true as const,
  }));
  return finish({
    topic,
    summary: `Simulated sweep only: nothing here is a live post. ${summaryLead} The five sources disagree on tone and agree on one limit: a draft is not a publish.`,
    evidence,
    opportunities,
    mentions,
  });
}

function withAccount(report: ScoutReport, account: string): ScoutReport {
  const handle = account.trim();
  if (!handle) return report;
  const mention: Mention = {
    id: "mn-account",
    source: "x",
    text: `${handle} is the account in this brief. Mentions are listed so you can answer them yourself.`,
    why: "You named the handle. The crew does not speak as that account.",
    url: fixtureUrl("x", report.topic, "mn-account"),
    date: ANCHOR_ISO,
    matchScore: 97,
    humanOnly: true,
  };
  const mentions = [...report.mentions, mention].sort(
    (a, b) => b.matchScore - a.matchScore || a.id.localeCompare(b.id),
  );
  return { ...report, mentions };
}

export function researchTopic(topic: string, account = ""): ScoutReport {
  const display = topic.trim() || account.trim() || "untitled";
  const key = display.toLowerCase();
  const base = key.includes("local-first") || key.includes("local first")
    ? localFirstReport(display)
    : key.includes("developer tool") || key.includes("devtool")
      ? devtoolsReport(display)
      : key.includes("agent")
        ? agentsReport(display)
        : synthesize(display);
  return withAccount(base, account);
}
