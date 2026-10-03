import type { AgentContext } from "../../shared/types.ts";
import { audit } from "../db/repo.ts";
import { asNoul, jevDecide, jevEnabled } from "./jev.ts";

/** A side effect runs only when Jev is this sure the user asked for that write. */
const ALLOW = 0.6;

/**
 * Gate a ledger or external write. Jev does not compose the write.
 * Unavailable Jev fails open so a decisions outage does not freeze the inbox.
 * No `ask` on the context (tests, scheduler) also fails open.
 */
export async function jevAllowsSideEffect(ctx: AgentContext, action: string, detail: string): Promise<boolean> {
  const ask = ctx.ask?.trim();
  if (!ask || !jevEnabled()) return true;
  const answers = await jevDecide(
    { ask: ask.slice(0, 2_000), action, detail: detail.slice(0, 500) },
    {
      allowed: {
        type: "noul",
        instructions:
          "Does `ask` request the side effect named in `action` for `detail`? Summaries, questions, and drafts are not requests to record or push.",
        criteria: {
          true: "The user asked for this write to happen.",
          false: "The user did not ask for this write.",
        },
      },
    },
  );
  const noul = answers ? asNoul(answers.allowed) : null;
  if (noul === null) return true;
  const allowed = noul >= ALLOW;
  audit.log({
    spaceId: ctx.spaceId,
    actor: "agent",
    action: "jev.gate",
    detail: `${action} noul=${noul.toFixed(2)} ${allowed ? "allow" : "hold"}`,
  });
  return allowed;
}
