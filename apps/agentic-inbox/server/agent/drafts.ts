import type { Space, Thread } from "../../shared/types.ts";
import { senderEmail, senderName } from "../../shared/types.ts";

function firstName(from: string): string {
  return senderName(from).split(/\s+/)[0] || "there";
}

function closing(space: Space | null): string {
  if (space?.signature) return `\n\n${space.signature}`;
  return space?.kind === "personal" ? "" : "\n\nBest,\nYou";
}

/**
 * Deterministic reply templates used when no LLM is configured (and as a
 * fallback if the model returns nothing). Category-aware so the demo reads well.
 */
export function templateDraft(thread: Thread, me: string, space: Space | null): string {
  const sender = [...thread.messages].reverse().find((m) => senderEmail(m.from) !== me.toLowerCase());
  const name = sender ? firstName(sender.from) : "there";
  const warm = space?.agentTone === "warm";
  switch (thread.category) {
    case "support":
      return `Hi ${name},

Thanks for the detailed report — sorry about the Friday crunch. The spinning export on 2,000+ row boards matches a known timeout in /api/export; the 504 you saw confirms it.

Two things right away:
1. Workaround: filter the board to under ~1,500 rows and export in two passes — chunked export works today, it just isn't exposed as one button yet.
2. Fix: we're moving export to a background job with an emailed download link. I'll follow up here the moment it ships, and I'll walk you through both on tomorrow's call.

You'll be unblocked before your Friday reporting run.${closing(space)}`;
    case "invite":
      return `Hi ${name},

Confirming — I'll be there. Count me toward quorum for the shipping-cut decision.

One agenda ask: can we reserve five minutes for the export-timeout follow-up? The postmortem will be with you beforehand.${closing(space)}`;
    case "billing":
      return `Hello${name !== "there" ? ` ${name}` : ""},

Thanks for the heads-up. I've updated the payment details on my side — please retry the charge at your convenience and confirm once it goes through.${closing(space)}`;
    case "recruiting":
      return `Hi ${name},

Thanks for sending the role doc — the replication team sounds interesting.

Wednesday afternoon works best for the intro call; anytime between 14:00 and 17:00 UTC. Send over an invite and I'll be there.${closing(space)}`;
    case "project":
      return `Hi ${name},

Yes — the postmortem draft will be with you by Wednesday morning, using the wiki template. I'll include the root cause (synchronous CSV build in the request path), the 1,500-row cap shipping this week, and sizing notes for the background-job version so we can discuss it at the roadmap sync.${closing(space)}`;
    case "personal":
      return warm
        ? `Hey ${name}!\n\nCount me in — sounds great. Let me know if anything changes and I'll adjust. ${thread.subject.toLowerCase().includes("lunch") ? "I'll be there Sunday, and yes, dentist is booked for Tuesday." : "Fine, I'll rent the shoes. Loser buys coffee after?"}`
        : `Hi ${name},\n\nCount me in — thanks for organizing.${closing(space)}`;
    case "security":
      return `That sign-in was me (travelling with the Linux laptop), so no action needed — thanks for flagging it.`;
    case "newsletter":
      return `Thanks for the issue — the agentic-inbox write-up was a good read.`;
    default:
      return `Hi ${name},

Thanks for your email — noted on "${thread.subject}". Let me get back to you with specifics shortly.${closing(space)}`;
  }
}

export function templateNudge(counterpart: string, subject: string, direction: "waiting_on_me" | "waiting_on_them"): string {
  const name = firstName(counterpart);
  if (direction === "waiting_on_them") {
    return `Hi ${name},\n\nQuick nudge on "${subject}" — whenever you get a moment, could you send that over? Happy to help if anything is blocking.\n\nThanks!`;
  }
  return `Hi ${name},\n\nThanks for your patience on "${subject}". Here's where things stand: [one-line status]. I'll have a full answer to you by [day].\n\nBest,\nYou`;
}
