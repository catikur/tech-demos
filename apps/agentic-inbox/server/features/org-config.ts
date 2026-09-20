import { decryptJson, encryptJson } from "../auth/crypto.ts";
import { accounts, chats, settings, spaces } from "../db/repo.ts";
import { parseSharePointLibraryUrl, type SharePointLibraryRef } from "./sharepoint-url.ts";

export const ORG_CONFIG_KEY = "org.config";
export const ORG_VAULT_CACHE_KEY = "org.vault.cache";
export const PLAUD_SETTING = "plaud.oauth";

export const DEFAULT_BRIEF_CHANNEL = "Yonetim › Butler";
export const DEFAULT_VAULT_URL =
  "https://conforcus.sharepoint.com/sites/ConforcusVault/VaultConforcus/Forms/AllItems.aspx";
export const DEFAULT_PLAUD_MCP = "https://mcp.plaud.ai/mcp";

export interface OrgConfig {
  briefChannelTitle: string;
  vaultUrl: string;
  templateFolder: string;
}

export interface VaultFileCache {
  path: string;
  name: string;
  markdown: string;
}

export interface VaultCache {
  syncedAt: number | null;
  fileCount: number;
  error: string | null;
  folders: string[];
  files: VaultFileCache[];
}

export interface PlaudStored {
  clientId: string;
  clientSecret: string | null;
  apiKey: string | null;
  mcpUrl: string;
}

export interface OrgSettingsView {
  briefChannelTitle: string;
  briefChatId: string | null;
  briefResolved: boolean;
  channelOptions: { id: string; title: string }[];
  vaultUrl: string;
  vaultParsed: SharePointLibraryRef | null;
  templateFolder: string;
  folders: string[];
  templates: { path: string; name: string }[];
  vaultSyncedAt: number | null;
  vaultFileCount: number;
  vaultError: string | null;
  plaud: {
    configured: boolean;
    canTranscribe: boolean;
    clientIdMasked: string | null;
    hasSecret: boolean;
    hasApiKey: boolean;
    mcpUrl: string;
  };
}

const emptyCache = (): VaultCache => ({
  syncedAt: null,
  fileCount: 0,
  error: null,
  folders: [],
  files: [],
});

export function defaultOrgConfig(): OrgConfig {
  return {
    briefChannelTitle: DEFAULT_BRIEF_CHANNEL,
    vaultUrl: DEFAULT_VAULT_URL,
    templateFolder: "",
  };
}

export function ensureOrgDefaults(): OrgConfig {
  const current = readOrgConfig();
  writeOrgConfig(current);
  if (!settings.get(ORG_VAULT_CACHE_KEY)) settings.set(ORG_VAULT_CACHE_KEY, JSON.stringify(emptyCache()));
  return current;
}

export function readOrgConfig(): OrgConfig {
  const raw = settings.get(ORG_CONFIG_KEY);
  const fallback = defaultOrgConfig();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<OrgConfig>;
    return {
      briefChannelTitle: (parsed.briefChannelTitle ?? fallback.briefChannelTitle).trim() || fallback.briefChannelTitle,
      vaultUrl: (parsed.vaultUrl ?? fallback.vaultUrl).trim() || fallback.vaultUrl,
      templateFolder: (parsed.templateFolder ?? "").trim(),
    };
  } catch {
    return fallback;
  }
}

export function writeOrgConfig(cfg: OrgConfig): void {
  settings.set(ORG_CONFIG_KEY, JSON.stringify(cfg));
}

export function patchOrgConfig(patch: Partial<OrgConfig>): OrgConfig {
  const next = { ...readOrgConfig(), ...patch };
  if (typeof patch.briefChannelTitle === "string") next.briefChannelTitle = patch.briefChannelTitle.trim() || DEFAULT_BRIEF_CHANNEL;
  if (typeof patch.vaultUrl === "string") next.vaultUrl = patch.vaultUrl.trim() || DEFAULT_VAULT_URL;
  if (typeof patch.templateFolder === "string") next.templateFolder = patch.templateFolder.trim();
  writeOrgConfig(next);
  return next;
}

export function readVaultCache(): VaultCache {
  const raw = settings.get(ORG_VAULT_CACHE_KEY);
  if (!raw) return emptyCache();
  try {
    const parsed = JSON.parse(raw) as Partial<VaultCache>;
    return {
      syncedAt: parsed.syncedAt ?? null,
      fileCount: parsed.fileCount ?? 0,
      error: parsed.error ?? null,
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      files: Array.isArray(parsed.files) ? parsed.files.filter((f) => f && typeof f.path === "string") : [],
    };
  } catch {
    return emptyCache();
  }
}

export function writeVaultCache(cache: VaultCache): void {
  settings.set(ORG_VAULT_CACHE_KEY, JSON.stringify(cache));
}

function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("İ", "i")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s*[›>\/|]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveBriefingChannel(
  spaceId: string | null,
  title = readOrgConfig().briefChannelTitle,
): { id: string; title: string } | null {
  const wanted = fold(title);
  if (!wanted) return null;
  const list = chats.list(spaceId).filter((c) => c.kind === "channel");
  const exact = list.find((c) => fold(c.title) === wanted);
  if (exact) return { id: exact.id, title: exact.title };
  const parts = wanted.split(" ").filter(Boolean);
  const channelWord = parts.at(-1);
  const teamWords = parts.slice(0, -1).join(" ");
  if (channelWord) {
    const hits = list.filter((c) => {
      const t = fold(c.title);
      const hasChannel = t === channelWord || t.endsWith(` ${channelWord}`);
      return hasChannel && (!teamWords || t.includes(teamWords));
    });
    if (hits.length === 1) return { id: hits[0].id, title: hits[0].title };
    if (hits.length > 1 && teamWords) {
      const tighter = hits.find((c) => fold(c.title).includes(teamWords));
      if (tighter) return { id: tighter.id, title: tighter.title };
    }
  }
  return null;
}

export function workM365Account() {
  const all = accounts.all().filter((a) => a.provider === "m365");
  return all.find((a) => spaces.get(a.spaceId)?.kind === "work") ?? all[0] ?? null;
}

function maskId(id: string): string {
  const t = id.trim();
  if (t.length <= 8) return `${t.slice(0, 2)}…`;
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

export function readPlaud(): PlaudStored | null {
  const blob = settings.get(PLAUD_SETTING);
  if (!blob) return null;
  try {
    const parsed = decryptJson<PlaudStored>(blob);
    if (!parsed) return null;
    return {
      clientId: parsed.clientId?.trim() ?? "",
      clientSecret: parsed.clientSecret?.trim() || null,
      apiKey: parsed.apiKey?.trim() || null,
      mcpUrl: parsed.mcpUrl?.trim() || DEFAULT_PLAUD_MCP,
    };
  } catch {
    return null;
  }
}

export function savePlaud(patch: Partial<PlaudStored>): PlaudStored {
  const prev = readPlaud() ?? { clientId: "", clientSecret: null, apiKey: null, mcpUrl: DEFAULT_PLAUD_MCP };
  const next: PlaudStored = {
    clientId: patch.clientId !== undefined ? patch.clientId.trim() : prev.clientId,
    clientSecret: patch.clientSecret !== undefined ? patch.clientSecret?.trim() || null : prev.clientSecret,
    apiKey: patch.apiKey !== undefined ? patch.apiKey?.trim() || null : prev.apiKey,
    mcpUrl: patch.mcpUrl !== undefined ? patch.mcpUrl.trim() || DEFAULT_PLAUD_MCP : prev.mcpUrl,
  };
  settings.set(PLAUD_SETTING, encryptJson(next));
  return next;
}

export const BUILTIN_TEMPLATE_PATH = "__builtin__/conforcus.md";

export function builtinTemplate(): VaultFileCache {
  return {
    path: BUILTIN_TEMPLATE_PATH,
    name: "Conforcus (built-in)",
    markdown: [
      "# {{title}}",
      "",
      "- Tarih: {{date}}",
      "- Katılımcılar: {{attendees}}",
      "",
      "## Özet",
      "{{summary}}",
      "",
      "## Kararlar",
      "{{decisions}}",
      "",
      "## Aksiyonlar",
      "{{actions}}",
      "",
      "## Kaynak",
      "{{source}}",
      "",
    ].join("\n"),
  };
}

export function listedTemplates(cache = readVaultCache(), folder = readOrgConfig().templateFolder): VaultFileCache[] {
  const out = [builtinTemplate()];
  const prefix = folder.replace(/^\/+|\/+$/g, "");
  for (const f of cache.files) {
    if (!/\.md$/i.test(f.path)) continue;
    if (!prefix) continue;
    const under = f.path === prefix || f.path.startsWith(`${prefix}/`);
    if (under) out.push(f);
  }
  return out;
}

export function orgSettingsView(spaceId: string | null): OrgSettingsView {
  ensureOrgDefaults();
  const cfg = readOrgConfig();
  const cache = readVaultCache();
  const resolved = resolveBriefingChannel(spaceId, cfg.briefChannelTitle);
  const channelOptions = chats
    .list(spaceId)
    .filter((c) => c.kind === "channel")
    .map((c) => ({ id: c.id, title: c.title }));
  const plaud = readPlaud();
  const templates = listedTemplates(cache, cfg.templateFolder).map((f) => ({ path: f.path, name: f.name }));
  return {
    briefChannelTitle: cfg.briefChannelTitle,
    briefChatId: resolved?.id ?? null,
    briefResolved: !!resolved,
    channelOptions,
    vaultUrl: cfg.vaultUrl,
    vaultParsed: parseSharePointLibraryUrl(cfg.vaultUrl),
    templateFolder: cfg.templateFolder,
    folders: cache.folders,
    templates,
    vaultSyncedAt: cache.syncedAt,
    vaultFileCount: cache.fileCount,
    vaultError: cache.error,
    plaud: {
      configured: !!(plaud && (plaud.clientId || plaud.apiKey)),
      canTranscribe: !!(plaud?.clientId && plaud.clientSecret && plaud.apiKey),
      clientIdMasked: plaud?.clientId ? maskId(plaud.clientId) : null,
      hasSecret: !!plaud?.clientSecret,
      hasApiKey: !!plaud?.apiKey,
      mcpUrl: plaud?.mcpUrl ?? DEFAULT_PLAUD_MCP,
    },
  };
}
