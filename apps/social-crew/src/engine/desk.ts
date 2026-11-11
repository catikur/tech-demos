import { DEFAULT_CAP, canAfford, ROSTER_COST } from "./budget";
import { DEFAULT_BRAND, renderCard } from "./designer";
import { approvePost, rejectPost, schedulePost, markEdited } from "./gate";
import { isRosterQuestion, rosterReply, runCrew } from "./manager";
import { tryQueueMention } from "./rules";
import { addSkill } from "./skills";
import { parseSlotId } from "./timing";
import type {
  BrandKit,
  DailyReport,
  QueueItem,
  ScoutReport,
  TimelineStep,
  VoiceProfile,
} from "./types";
import { extractVoice, parseSamples, SAMPLE_POSTS } from "./voice";
import { rebuildDraft } from "./writer";

export type ChatMessage = {
  id: string;
  role: "user" | "manager";
  text: string;
};

export type ConfirmState =
  | { kind: "approve"; id: string }
  | { kind: "schedule"; id: string; slotId: string }
  | null;

export type AskFirst = {
  publish: boolean;
  schedule: boolean;
  connectTool: boolean;
};

export type DeskState = {
  topic: string;
  account: string;
  samples: string;
  voice: VoiceProfile;
  brand: BrandKit;
  askFirst: AskFirst;
  cap: number;
  spent: number;
  queue: QueueItem[];
  activeId: string | null;
  scout: ScoutReport | null;
  daily: DailyReport | null;
  steps: TimelineStep[];
  skillsUsed: string[];
  messages: ChatMessage[];
  notice: string | null;
  confirm: ConfirmState;
  routinesArmed: false;
};

export type DeskAction =
  | { type: "set-field"; field: "topic" | "account" | "samples"; value: string }
  | { type: "set-cap"; cap: number }
  | { type: "set-ask"; key: keyof AskFirst; value: boolean }
  | { type: "set-brand"; brand: BrandKit }
  | { type: "train" }
  | { type: "run"; text?: string }
  | { type: "approve"; id: string; confirmed: boolean }
  | { type: "reject"; id: string }
  | { type: "schedule"; id: string; slotId: string; confirmed: boolean }
  | { type: "edit"; id: string; body: string }
  | { type: "select-hook"; id: string; index: number }
  | { type: "select-item"; id: string }
  | { type: "note-export"; id: string }
  | { type: "keep-reply-human" }
  | { type: "dismiss-notice" };

function message(state: DeskState, role: ChatMessage["role"], text: string): ChatMessage {
  return { id: `m-${state.messages.length + 1}`, role, text };
}

export function emptyDesk(): DeskState {
  return {
    topic: "ai agents",
    account: "@nera.quill",
    samples: SAMPLE_POSTS.join("\n\n"),
    voice: extractVoice(SAMPLE_POSTS),
    brand: DEFAULT_BRAND,
    askFirst: { publish: true, schedule: true, connectTool: true },
    cap: DEFAULT_CAP,
    spent: 0,
    queue: [],
    activeId: null,
    scout: null,
    daily: null,
    steps: [],
    skillsUsed: [],
    messages: [],
    notice: null,
    confirm: null,
    routinesArmed: false,
  };
}

function replaceItem(state: DeskState, item: QueueItem): DeskState {
  return {
    ...state,
    queue: state.queue.map((current) => (current.id === item.id ? item : current)),
    activeId: item.id,
  };
}

function applyRun(state: DeskState, text: string): DeskState {
  const trimmed = text.trim();
  const nextTopic = trimmed && !isRosterQuestion(trimmed) ? trimmed : state.topic;
  if (isRosterQuestion(trimmed)) {
    if (!canAfford(state.spent, state.cap, ROSTER_COST)) {
      return {
        ...state,
        notice: "The roster answer costs 1 and the cap is already spent.",
        confirm: null,
      };
    }
    const roster = rosterReply();
    const withUser = {
      ...state,
      messages: [...state.messages, message(state, "user", trimmed)],
    };
    return {
      ...withUser,
      spent: state.spent + roster.cost,
      messages: [...withUser.messages, message(withUser, "manager", roster.text)],
      notice: null,
      confirm: null,
    };
  }

  const result = runCrew({
    topic: nextTopic,
    account: state.account,
    voice: state.voice,
    brand: state.brand,
    spent: state.spent,
    cap: state.cap,
    sequence: state.queue.length + 1,
  });
  const asked = trimmed || nextTopic;
  const withUser = {
    ...state,
    topic: result.ok ? result.run.topic : nextTopic,
    messages: [...state.messages, message(state, "user", asked)],
  };
  if (!result.ok) {
    return {
      ...withUser,
      messages: [...withUser.messages, message(withUser, "manager", result.message)],
      notice: result.message,
      confirm: null,
    };
  }
  return {
    ...withUser,
    topic: result.run.topic,
    spent: result.spent,
    scout: result.run.scout,
    daily: result.run.daily,
    steps: result.run.steps,
    skillsUsed: result.run.skillsUsed,
    queue: [...state.queue, result.run.item],
    activeId: result.run.item.id,
    messages: [...withUser.messages, message(withUser, "manager", result.run.reply)],
    notice: "Parked in the queue. Nothing is scheduled.",
    confirm: null,
  };
}

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
  switch (action.type) {
    case "set-field":
      return { ...state, [action.field]: action.value };
    case "set-cap":
      return { ...state, cap: Math.min(200, Math.max(20, Math.round(action.cap))) };
    case "set-ask":
      return { ...state, askFirst: { ...state.askFirst, [action.key]: action.value }, confirm: null };
    case "set-brand": {
      const active = state.queue.find((item) => item.id === state.activeId);
      if (!active) return { ...state, brand: action.brand, confirm: null };
      const headline = active.hooks[active.hookIndex]?.text ?? active.topic;
      const cardSvg = renderCard({ brand: action.brand, kicker: active.topic, headline });
      if (cardSvg === active.cardSvg) return { ...state, brand: action.brand, confirm: null };
      if (active.status === "pending") {
        return replaceItem({ ...state, brand: action.brand, confirm: null }, { ...active, cardSvg });
      }
      const edited = markEdited(active, {
        platforms: active.platforms,
        thread: active.thread,
        hooks: active.hooks,
        hookIndex: active.hookIndex,
        cardSvg,
      });
      return {
        ...replaceItem({ ...state, brand: action.brand }, edited),
        notice: "The card changed. Approval was cleared. It is pending again.",
        confirm: null,
      };
    }
    case "train": {
      const voice = extractVoice(parseSamples(state.samples));
      return {
        ...state,
        voice,
        notice:
          voice.postCount === 0
            ? "No samples to read. Paste posts you actually shipped."
            : `Voice file updated from ${voice.postCount} sample${voice.postCount === 1 ? "" : "s"}. The next run uses it.`,
      };
    }
    case "run":
      return applyRun(state, action.text ?? state.topic);
    case "dismiss-notice":
      return { ...state, notice: null, confirm: null };
    case "select-item":
      return { ...state, activeId: action.id, confirm: null };
    case "keep-reply-human": {
      const refused = tryQueueMention();
      return {
        ...state,
        notice:
          refused.reason === "replies-are-human"
            ? "Reply stays with you. Nothing was queued."
            : "Nothing was queued.",
      };
    }
    case "note-export":
      return {
        ...state,
        skillsUsed: addSkill(state.skillsUsed, "png-export"),
        notice: "PNG built in the browser. It was not uploaded.",
      };
    case "approve": {
      const current = state.queue.find((item) => item.id === action.id);
      if (!current) return state;
      if (current.status === "scheduled") {
        return {
          ...state,
          activeId: action.id,
          notice: "It stays on the calendar. Approving again does not take it off.",
          confirm: null,
        };
      }
      const result = approvePost(current, {
        askFirst: state.askFirst.publish,
        confirmed: action.confirmed,
      });
      if (!result.ok && result.reason === "ask-first") {
        return { ...state, confirm: { kind: "approve", id: action.id }, activeId: action.id };
      }
      if (!result.ok) {
        return { ...state, notice: "That draft cannot be approved.", confirm: null };
      }
      return {
        ...replaceItem(state, result.item),
        skillsUsed: addSkill(state.skillsUsed, "intent-link"),
        notice: "Approved. The intent link is ready. It does not open itself, and nothing is scheduled yet.",
        confirm: null,
      };
    }
    case "reject": {
      const current = state.queue.find((item) => item.id === action.id);
      if (!current) return state;
      return {
        ...replaceItem(state, rejectPost(current)),
        notice: "Rejected. It will not be scheduled.",
        confirm: null,
      };
    }
    case "schedule": {
      const current = state.queue.find((item) => item.id === action.id);
      const slot = parseSlotId(action.slotId) ?? current?.suggested[0] ?? null;
      if (!current || !slot) return state;
      const result = schedulePost(current, slot, {
        askFirst: state.askFirst.schedule,
        confirmed: action.confirmed,
      });
      if (!result.ok && result.reason === "ask-first") {
        return {
          ...state,
          confirm: { kind: "schedule", id: action.id, slotId: `${slot.day}-${slot.hour}` },
          activeId: action.id,
        };
      }
      if (!result.ok && result.reason === "past-slot") {
        return {
          ...state,
          notice: "That hour is before 2026-11-11. Pick a slot on the anchor day or later.",
          confirm: null,
        };
      }
      if (!result.ok) {
        return {
          ...state,
          notice: "Nothing was scheduled. Approve the draft first.",
          confirm: null,
        };
      }
      return {
        ...replaceItem(state, result.item),
        skillsUsed: addSkill(state.skillsUsed, "calendar-place"),
        notice: `On the local calendar at ${result.item.scheduledFor}. This demo does not publish.`,
        confirm: null,
      };
    }
    case "edit": {
      const current = state.queue.find((item) => item.id === action.id);
      const body = action.body.trim();
      if (!current || !body) return { ...state, notice: "The edit was empty, so the draft stayed as it was." };
      const rebuilt = rebuildDraft({
        topic: current.topic,
        hook: body,
        support: current.support,
        counterexample: current.counterexample,
        nextTest: current.nextTest,
        voice: state.voice,
      });
      const hooks = current.hooks.map((hook, index) =>
        index === current.hookIndex ? { ...hook, text: body } : hook,
      );
      const cardSvg = renderCard({
        brand: state.brand,
        kicker: current.topic,
        headline: body,
      });
      const edited = markEdited(current, {
        hooks,
        hookIndex: current.hookIndex,
        platforms: rebuilt.platforms,
        thread: rebuilt.thread,
        cardSvg,
      });
      return {
        ...replaceItem(state, edited),
        notice: "Edit saved. Approval was cleared. It is pending again.",
        confirm: null,
      };
    }
    case "select-hook": {
      const current = state.queue.find((item) => item.id === action.id);
      const hook = current?.hooks[action.index];
      if (!current || !hook) return state;
      const rebuilt = rebuildDraft({
        topic: current.topic,
        hook: hook.text,
        support: current.support,
        counterexample: current.counterexample,
        nextTest: current.nextTest,
        voice: state.voice,
      });
      const cardSvg = renderCard({
        brand: state.brand,
        kicker: current.topic,
        headline: hook.text,
      });
      const edited = markEdited(current, {
        hooks: current.hooks,
        hookIndex: action.index,
        platforms: rebuilt.platforms,
        thread: rebuilt.thread,
        cardSvg,
      });
      return {
        ...replaceItem(state, { ...edited, edited: current.edited || action.index !== current.hookIndex }),
        notice: "Hook changed. The draft is pending again.",
        confirm: null,
      };
    }
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function createInitialDesk(): DeskState {
  return deskReducer(emptyDesk(), { type: "run" });
}
