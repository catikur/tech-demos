import type { Claim, Contradiction } from "./types.ts";

export function detectContradictions(claims: Claim[]): Contradiction[] {
  const bySubject = new Map<string, Claim[]>();
  for (const claim of claims) {
    const key = claim.subject.trim().toLowerCase();
    const list = bySubject.get(key) ?? [];
    list.push(claim);
    bySubject.set(key, list);
  }
  const found: Contradiction[] = [];
  for (const [subject, list] of bySubject) {
    const affirms = list.filter((claim) => claim.polarity === "affirm");
    const denies = list.filter((claim) => claim.polarity === "deny");
    for (const left of affirms) {
      for (const right of denies) {
        found.push({
          id: `contra-${left.id}-${right.id}`,
          subject,
          left,
          right,
          notePath: contradictionPath(subject),
        });
      }
    }
  }
  found.sort((a, b) => a.id.localeCompare(b.id));
  return found;
}

export function contradictionPath(subject: string): string {
  const slug = subject
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `wiki/Contradiction — ${slug || "claim"}.md`;
}

export function contradictionBody(item: Contradiction): string {
  const affirm = item.left.sourceTitle ? ` ([[${item.left.sourceTitle}]])` : "";
  const deny = item.right.sourceTitle ? ` ([[${item.right.sourceTitle}]])` : "";
  return [
    `Flagged at compile. Same subject, opposite polarity.`,
    ``,
    `- Affirm (${item.left.id})${affirm}: ${item.left.statement}`,
    `- Deny (${item.right.id})${deny}: ${item.right.statement}`,
    ``,
    `Curator decides which claim stays in the living profile. The compiler does not pick a winner.`,
  ].join("\n");
}
