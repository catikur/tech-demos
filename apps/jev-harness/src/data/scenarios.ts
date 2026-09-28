// Scenario definitions for the mock agent harness.
// `weight` is a hidden prior only the server-side mock engine sees;
// it is stripped before options are sent to the client.

export type JevMode = "choice" | "score";

export interface OptionDef {
  id: string;
  label: string;
  detail: string;
  /** hidden prior in [0,1] used by the mock decision engine */
  weight: number;
}

export interface StepDef {
  id: string;
  title: string;
  /** what the frontier model proposed in natural language */
  proposal: string;
  /** the structured question the host puts to Jev */
  ask: string;
  mode: JevMode;
  options: OptionDef[];
  /** option id -> what the host does when that option wins */
  hostActions: Record<string, string>;
  /** what the host does when Jev returns Noul */
  noulAction: string;
}

export interface ScenarioDef {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  userRequest: string;
  steps: StepDef[];
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: "tool-route",
    name: "Tool routing",
    tagline: "Pick the next tool without waking the frontier model",
    icon: "🧭",
    userRequest:
      "“Summarize this PDF invoice and email the totals to finance@acme.com.”",
    steps: [
      {
        id: "route-1",
        title: "First hop: read the document",
        proposal:
          "Frontier plan: the user attached invoice.pdf. I need the raw text before I can total anything. Extract text first, then compute, then send.",
        ask: "Given the plan and attachment type application/pdf, which tool should run next?",
        mode: "choice",
        options: [
          { id: "pdf.extract_text", label: "pdf.extract_text", detail: "Parse text layer from the attached PDF", weight: 0.87 },
          { id: "vision.ocr", label: "vision.ocr", detail: "Rasterize pages and OCR them (slow, costly)", weight: 0.52 },
          { id: "email.send", label: "email.send", detail: "Send an email via the mail connector", weight: 0.14 },
          { id: "web.search", label: "web.search", detail: "Search the web for invoice context", weight: 0.08 },
        ],
        hostActions: {
          "pdf.extract_text": "Host ran pdf.extract_text(invoice.pdf) → 2 pages, 14 line items extracted.",
          "vision.ocr": "Host ran vision.ocr(invoice.pdf) → 2 pages OCR'd in 6.4s.",
          "email.send": "Host refused: email.send has no body yet — routed back to planner.",
          "web.search": "Host ran web.search — no useful results, routed back to planner.",
        },
        noulAction: "Host paused the run and asked the frontier model to re-plan with more context.",
      },
      {
        id: "route-2",
        title: "Second hop: compute totals",
        proposal:
          "Frontier plan: text extracted, 14 line items found. Now sum the line items and compute tax before drafting the email.",
        ask: "Line items are structured JSON. Which tool should run next?",
        mode: "choice",
        options: [
          { id: "calc.sum_line_items", label: "calc.sum_line_items", detail: "Deterministic sum + tax over structured rows", weight: 0.84 },
          { id: "sheets.append", label: "sheets.append", detail: "Append rows to the finance spreadsheet", weight: 0.33 },
          { id: "email.send", label: "email.send", detail: "Send the email now, totals inline “roughly”", weight: 0.22 },
          { id: "pdf.extract_text", label: "pdf.extract_text", detail: "Extract the same PDF again", weight: 0.06 },
        ],
        hostActions: {
          "calc.sum_line_items": "Host ran calc.sum_line_items → subtotal $4,210.00, tax $336.80, total $4,546.80.",
          "sheets.append": "Host appended 14 rows to Finance/Invoices — totals still pending.",
          "email.send": "Host blocked email.send: totals not computed yet.",
          "pdf.extract_text": "Host skipped duplicate extraction (idempotency guard).",
        },
        noulAction: "Host paused the run and asked the frontier model to re-plan the computation step.",
      },
      {
        id: "route-3",
        title: "Final hop: deliver",
        proposal:
          "Frontier plan: totals computed ($4,546.80). Draft a short summary email to finance@acme.com with the totals table and send it.",
        ask: "Draft is ready and recipient is on the allowlist. Which delivery tool?",
        mode: "choice",
        options: [
          { id: "email.send", label: "email.send", detail: "Send drafted summary to finance@acme.com", weight: 0.9 },
          { id: "slack.post", label: "slack.post", detail: "Post the summary to #finance instead", weight: 0.38 },
          { id: "docs.save_draft", label: "docs.save_draft", detail: "Save as a draft, do not deliver", weight: 0.27 },
          { id: "calc.sum_line_items", label: "calc.sum_line_items", detail: "Recompute the totals once more", weight: 0.07 },
        ],
        hostActions: {
          "email.send": "Host ran email.send → delivered to finance@acme.com (message id msg_8f31). Run complete ✅",
          "slack.post": "Host posted the summary to #finance. Run complete ✅",
          "docs.save_draft": "Host saved the draft; delivery left to the user.",
          "calc.sum_line_items": "Host recomputed totals — identical result, delivery still pending.",
        },
        noulAction: "Host held delivery and surfaced the draft to the user for manual review.",
      },
    ],
  },
  {
    id: "permission-gate",
    name: "Permission gate",
    tagline: "Score a risky command before the host lets it run",
    icon: "🛡️",
    userRequest:
      "Agent wants to run: rm -rf ./build && bun run deploy --prod",
    steps: [
      {
        id: "gate-1",
        title: "Gate the destructive command",
        proposal:
          "Frontier plan: the build directory is stale and blocking deploys. Delete ./build, then run the production deploy script in one shot.",
        ask: "Score each policy response for `rm -rf ./build && bun run deploy --prod` from a repo-scoped agent at trust tier 2.",
        mode: "score",
        options: [
          { id: "allow", label: "allow", detail: "Run the command as-is on the host shell", weight: 0.18 },
          { id: "allow_sandboxed", label: "allow_sandboxed", detail: "Run inside a scratch container, sync artifacts back", weight: 0.56 },
          { id: "human_approval", label: "human_approval", detail: "Hold the command and page a human approver", weight: 0.88 },
          { id: "deny", label: "deny", detail: "Reject and tell the agent to re-plan", weight: 0.41 },
        ],
        hostActions: {
          allow: "Host ran the command directly (policy override recorded).",
          allow_sandboxed: "Host ran the command in a scratch container; artifacts synced back.",
          human_approval: "Host held the command and paged @oncall-approver. Approval granted in 41s.",
          deny: "Host rejected the command; agent asked to re-plan.",
        },
        noulAction: "Host defaulted to deny — no policy response scored above the confidence floor.",
      },
      {
        id: "gate-2",
        title: "Re-check the approved remainder",
        proposal:
          "Human approved the cleanup. Frontier plan: ./build is deleted; now run only `bun run deploy --prod` under the deploy service account.",
        ask: "Cleanup already approved and executed. Which policy response for the narrowed command `bun run deploy --prod`?",
        mode: "choice",
        options: [
          { id: "allow", label: "allow", detail: "Deploy script is allowlisted for tier 2 after approval", weight: 0.81 },
          { id: "allow_sandboxed", label: "allow_sandboxed", detail: "Deploy from a container (slower, same effect)", weight: 0.44 },
          { id: "human_approval", label: "human_approval", detail: "Page the approver a second time", weight: 0.29 },
          { id: "deny", label: "deny", detail: "Reject the deploy outright", weight: 0.12 },
        ],
        hostActions: {
          allow: "Host ran bun run deploy --prod → deploy 2026.09.28-r3 live. Run complete ✅",
          allow_sandboxed: "Host deployed from a scratch container → deploy live. Run complete ✅",
          human_approval: "Host paged the approver again; approval granted, deploy queued.",
          deny: "Host rejected the deploy; incident note filed.",
        },
        noulAction: "Host defaulted to deny and asked the agent to split the command further.",
      },
    ],
  },
  {
    id: "recovery-path",
    name: "Recovery path",
    tagline: "Pick a recovery branch when a tool call fails mid-run",
    icon: "🩹",
    userRequest:
      "Mid-run failure: payments.charge(order_1289) → HTTP 429 rate_limited from provider A",
    steps: [
      {
        id: "recover-1",
        title: "First failure: 429 from provider A",
        proposal:
          "Frontier plan (cached): charge the card for order_1289, then trigger fulfillment. The charge call just failed with 429 rate_limited, retry-after 2s.",
        ask: "payments.charge failed with 429 (attempt 1/3, retry-after 2s). Which recovery path?",
        mode: "choice",
        options: [
          { id: "retry_backoff", label: "retry_backoff", detail: "Honor retry-after, exponential backoff, same provider", weight: 0.85 },
          { id: "switch_provider", label: "switch_provider", detail: "Fail over to payment provider B immediately", weight: 0.47 },
          { id: "degrade_cached", label: "degrade_cached", detail: "Queue the charge for async processing, continue run", weight: 0.31 },
          { id: "abort_notify", label: "abort_notify", detail: "Abort the run and notify the customer", weight: 0.2 },
        ],
        hostActions: {
          retry_backoff: "Host waited 2s and retried payments.charge on provider A…",
          switch_provider: "Host failed over to provider B and retried the charge…",
          degrade_cached: "Host queued the charge for async processing; run continued.",
          abort_notify: "Host aborted the run and emailed the customer.",
        },
        noulAction: "Host froze the payment step and escalated to the payments on-call.",
      },
      {
        id: "recover-2",
        title: "Second failure: 503 on retry",
        proposal:
          "Frontier plan (cached): still trying to complete the charge. The backoff retry also failed — provider A now returns 503 service_unavailable. Status page shows a partial outage.",
        ask: "Retry failed with 503; provider A status page shows partial outage (attempt 2/3). Which recovery path now?",
        mode: "choice",
        options: [
          { id: "switch_provider", label: "switch_provider", detail: "Fail over to provider B (same card token vault)", weight: 0.83 },
          { id: "retry_backoff", label: "retry_backoff", detail: "Back off again on provider A (outage ongoing)", weight: 0.28 },
          { id: "degrade_cached", label: "degrade_cached", detail: "Queue for async processing, continue run", weight: 0.45 },
          { id: "abort_notify", label: "abort_notify", detail: "Abort the run and notify the customer", weight: 0.22 },
        ],
        hostActions: {
          switch_provider: "Host failed over to provider B → charge submitted, response: “pending”.",
          retry_backoff: "Host backed off 8s and retried provider A — failed again (503).",
          degrade_cached: "Host queued the charge; fulfillment gated on settlement.",
          abort_notify: "Host aborted the run and emailed the customer.",
        },
        noulAction: "Host froze the payment step and escalated to the payments on-call.",
      },
      {
        id: "recover-3",
        title: "Ambiguous outcome: “charge pending”",
        proposal:
          "Frontier plan (cached): provider B accepted the charge but returned status “pending” with no settlement ETA and a webhook that hasn't fired in 90s. Fulfillment is blocked on knowing whether the customer was charged.",
        ask: "Charge state is ambiguous (pending, no webhook, 90s elapsed). Which terminal action is safe?",
        mode: "choice",
        options: [
          { id: "mark_paid", label: "mark_paid", detail: "Treat pending as success and start fulfillment", weight: 0.3 },
          { id: "refund_and_retry", label: "refund_and_retry", detail: "Void/refund the pending charge and start over", weight: 0.27 },
          { id: "charge_again", label: "charge_again", detail: "Submit a fresh charge on provider A (risk: double charge)", weight: 0.18 },
        ],
        hostActions: {
          mark_paid: "Host marked the order paid and started fulfillment (risk accepted).",
          refund_and_retry: "Host voided the pending charge and restarted the payment flow.",
          charge_again: "Host submitted a second charge — flagged for double-charge review.",
        },
        noulAction:
          "Noul: no option cleared the confidence floor. Host froze fulfillment, kept the pending charge untouched, and escalated to payments on-call with the full receipt trail. Run parked ⏸️",
      },
    ],
  },
];

export function getScenario(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function getStep(scenarioId: string, stepId: string): StepDef | undefined {
  return getScenario(scenarioId)?.steps.find((st) => st.id === stepId);
}
