import type { Vault, VaultNote, WikiChange, WikiDiff } from "./types.ts";

export function diffVault(before: Vault, after: Vault): WikiDiff {
  const beforeMap = new Map(before.notes.map((note) => [note.path, note]));
  const afterMap = new Map(after.notes.map((note) => [note.path, note]));
  const paths = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const changes: WikiChange[] = [];
  for (const path of [...paths].sort()) {
    const prev = beforeMap.get(path);
    const next = afterMap.get(path);
    if (!prev && next) {
      changes.push({ path, kind: "added", after: next.raw });
      continue;
    }
    if (prev && !next) {
      changes.push({ path, kind: "removed", before: prev.raw });
      continue;
    }
    if (prev && next && prev.raw !== next.raw) {
      changes.push({ path, kind: "updated", before: prev.raw, after: next.raw });
    }
  }
  return { changes };
}

export function unifiedHunk(change: WikiChange, maxLines = 12): string[] {
  const beforeLines = (change.before ?? "").split("\n");
  const afterLines = (change.after ?? "").split("\n");
  if (change.kind === "added") return afterLines.slice(0, maxLines).map((line) => `+ ${line}`);
  if (change.kind === "removed") return beforeLines.slice(0, maxLines).map((line) => `- ${line}`);
  const lines: string[] = [];
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < max && lines.length < maxLines; i += 1) {
    const a = beforeLines[i];
    const b = afterLines[i];
    if (a === b) continue;
    if (a !== undefined && b !== undefined) {
      lines.push(`- ${a}`);
      lines.push(`+ ${b}`);
    } else if (a !== undefined) {
      lines.push(`- ${a}`);
    } else if (b !== undefined) {
      lines.push(`+ ${b}`);
    }
  }
  return lines;
}

export function noteMap(notes: VaultNote[]): Map<string, VaultNote> {
  return new Map(notes.map((note) => [note.path, note]));
}
