import type { Account } from "../../shared/types.ts";
import { GraphClient, type GraphLike } from "../connectors/m365.ts";
import { walkVaultLibrary } from "../connectors/sharepoint.ts";
import { z } from "zod";
import { chunks } from "../db/repo.ts";
import { registerTool, external } from "../agent/tools.ts";
import { embedTexts, hashEmbed, hybridSearch } from "./embed.ts";
import { contentHash, truncate } from "./text.ts";
import { WORK_SPACE_ID } from "../bootstrap.ts";
import {
  listedTemplates,
  readOrgConfig,
  workM365Account,
  writeVaultCache,
  type VaultCache,
  type VaultFileCache,
} from "./org-config.ts";
import { parseSharePointLibraryUrl } from "./sharepoint-url.ts";

export function extractWikilinks(markdown: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    const name = m[1].trim();
    if (name) out.push(name);
  }
  return [...new Set(out)];
}

export function splitMarkdownChunks(path: string, markdown: string): { sourceId: string; text: string }[] {
  const cleaned = markdown.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  const sections = cleaned.split(/^#{1,3} /m).map((s) => s.trim()).filter(Boolean);
  const pieces = sections.length > 1 ? sections : [cleaned];
  const links = extractWikilinks(cleaned);
  const linkLine = links.length ? `Wikilinks: ${links.join(", ")}` : "";
  return pieces.map((body, i) => {
    const text = truncate([path, linkLine, body].filter(Boolean).join("\n"), 1200);
    return { sourceId: `kb:${path}#${i}`, text };
  });
}

export async function indexVaultFiles(spaceId: string, files: VaultFileCache[], opts?: { embedder?: (texts: string[]) => Promise<number[][]> }): Promise<number> {
  chunks.deleteForKind(spaceId, "kb");
  const pending: { sourceId: string; text: string; hash: string }[] = [];
  for (const f of files) {
    for (const piece of splitMarkdownChunks(f.path, f.markdown)) {
      pending.push({
        sourceId: piece.sourceId,
        text: piece.text,
        hash: contentHash(`${spaceId}|${piece.sourceId}|${piece.text}`),
      });
    }
  }
  if (pending.length === 0) return 0;
  const vectors = await embedTexts(
    pending.map((p) => p.text),
    opts?.embedder,
  );
  let inserted = 0;
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    if (
      chunks.upsert({
        spaceId,
        sourceKind: "kb",
        sourceId: p.sourceId,
        text: p.text,
        embedding: vectors[i] ?? hashEmbed(p.text),
        hash: p.hash,
      })
    )
      inserted++;
  }
  return inserted;
}

export async function syncSharePointVault(opts?: {
  graph?: GraphLike;
  account?: Account | null;
  spaceId?: string;
}): Promise<VaultCache> {
  const cfg = readOrgConfig();
  const parsed = parseSharePointLibraryUrl(cfg.vaultUrl);
  if (!parsed) {
    const cache: VaultCache = {
      syncedAt: Date.now(),
      fileCount: 0,
      error: "Vault URL is not a SharePoint library link.",
      folders: [],
      files: [],
    };
    writeVaultCache(cache);
    return cache;
  }
  const account = opts?.account !== undefined ? opts.account : workM365Account();
  if (!account) {
    const cache: VaultCache = {
      syncedAt: Date.now(),
      fileCount: 0,
      error: "Connect a Microsoft 365 account, then reconnect it so Files.Read.All / Sites.Read.All are on the token.",
      folders: [],
      files: [],
    };
    writeVaultCache(cache);
    return cache;
  }
  const g = opts?.graph ?? new GraphClient(account.id);
  try {
    const walked = await walkVaultLibrary(g, parsed);
    const files: VaultFileCache[] = walked.files.map((f) => ({ path: f.path, name: f.name, markdown: f.markdown }));
    const spaceId = opts?.spaceId ?? account.spaceId ?? WORK_SPACE_ID;
    await indexVaultFiles(spaceId, files);
    const err =
      walked.skippedLocked > 0
        ? `${walked.skippedLocked} file(s) skipped (403/423). Check SharePoint download policy on the vault.`
        : null;
    const cache: VaultCache = {
      syncedAt: Date.now(),
      fileCount: files.length,
      error: err,
      folders: walked.folders,
      files,
    };
    writeVaultCache(cache);
    return cache;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cache: VaultCache = {
      syncedAt: Date.now(),
      fileCount: 0,
      error: message.slice(0, 400),
      folders: [],
      files: [],
    };
    writeVaultCache(cache);
    return cache;
  }
}

export function templateByPath(path: string): VaultFileCache | null {
  return listedTemplates().find((t) => t.path === path) ?? null;
}

registerTool({
  name: "search_vault",
  description:
    "Search the Conforcus SharePoint vault (Obsidian-style markdown + wikilinks). Use this before writing actions, drafts or meeting notes that need company context.",
  schema: z.object({ query: z.string().min(1) }),
  async run(input, ctx) {
    const spaceId = ctx.spaceId ?? WORK_SPACE_ID;
    const hits = await hybridSearch(spaceId, input.query, { sourceKind: "kb", limit: 8 });
    if (hits.length === 0) return { output: "No vault matches. Sync the SharePoint vault from Settings if it has not been indexed yet." };
    return {
      output: hits.map((h) => `${h.sourceId} (${h.score.toFixed(2)})\n${external(h.text)}`).join("\n\n"),
    };
  },
});
