import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chats, chunks, meetings, notes, settings } from "../server/db/repo.ts";
import { GraphError, type GraphLike } from "../server/connectors/m365.ts";
import { walkVaultLibrary } from "../server/connectors/sharepoint.ts";
import { parseSharePointLibraryUrl } from "../server/features/sharepoint-url.ts";
import {
  BUILTIN_TEMPLATE_PATH,
  DEFAULT_BRIEF_CHANNEL,
  DEFAULT_VAULT_URL,
  orgSettingsView,
  patchOrgConfig,
  readOrgConfig,
  resolveBriefingChannel,
  savePlaud,
  readPlaud,
} from "../server/features/org-config.ts";
import { formatTeamsBriefing } from "../server/features/briefing-teams.ts";
import { postMorningBriefing } from "../server/features/briefing-teams.ts";
import { buildMorningBriefing } from "../server/features/briefing.ts";
import { extractWikilinks, indexVaultFiles, syncSharePointVault } from "../server/features/vault.ts";
import { buildMeetingMinutes, fillPlaceholders } from "../server/features/minutes.ts";
import { routes } from "../server/api/routes.ts";
import { seededDb, WORK_SPACE_ID } from "./helpers.ts";
import { runTool } from "../server/agent/tools.ts";
import "../server/features/index.ts";

const savedEnv = { ...process.env };
function restoreEnv() {
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  for (const [k, v] of Object.entries(savedEnv)) process.env[k] = v;
}

async function json(method: string, path: string, body?: unknown) {
  const key = path.split("?")[0] as keyof typeof routes;
  const route = routes[key] as Record<string, (req: Request) => Promise<Response>> | ((req: Request) => Promise<Response>);
  const handler = typeof route === "function" ? route : route[method];
  const res = await handler(
    new Request(`http://local${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

describe("sharepoint library URL", () => {
  test("parses AllItems.aspx vault link", () => {
    const ref = parseSharePointLibraryUrl(DEFAULT_VAULT_URL);
    expect(ref).toEqual({
      hostname: "conforcus.sharepoint.com",
      sitePath: "/sites/ConforcusVault",
      libraryName: "VaultConforcus",
      folderPath: "",
    });
  });

  test("parses sharing folder links and nested paths", () => {
    const sharing = parseSharePointLibraryUrl(
      "https://conforcus.sharepoint.com/:f:/r/sites/ConforcusVault/VaultConforcus/templates?cs=1",
    );
    expect(sharing?.libraryName).toBe("VaultConforcus");
    expect(sharing?.folderPath).toBe("templates");
    const nested = parseSharePointLibraryUrl(
      "https://conforcus.sharepoint.com/sites/ConforcusVault/VaultConforcus/templates/standup",
    );
    expect(nested?.folderPath).toBe("templates/standup");
  });

  test("rejects non-SharePoint hosts", () => {
    expect(parseSharePointLibraryUrl("https://example.com/sites/x/y")).toBeNull();
  });
});

describe("org assistant", () => {
  beforeEach(async () => {
    restoreEnv();
    process.env.LOGIN_REQUIRED = "0";
    process.env.LLM_PROVIDER = "mock";
    await seededDb();
  });
  afterEach(restoreEnv);

  test("defaults are Yonetim › Butler and the Conforcus Vault URL", () => {
    const cfg = readOrgConfig();
    expect(cfg.briefChannelTitle).toBe(DEFAULT_BRIEF_CHANNEL);
    expect(cfg.vaultUrl).toBe(DEFAULT_VAULT_URL);
    const view = orgSettingsView(WORK_SPACE_ID);
    expect(view.templates.some((t) => t.path === BUILTIN_TEMPLATE_PATH)).toBe(true);
    expect(view.plaud.configured).toBe(false);
  });

  test("resolves a Teams channel by folded title (Yonetim vs Yönetim)", () => {
    chats.upsert({
      id: "ch_butler",
      spaceId: WORK_SPACE_ID,
      accountId: "acc_demo_work",
      kind: "channel",
      title: "Yönetim › Butler",
      members: [],
      lastAt: Date.now(),
      unreadCount: 0,
    });
    const hit = resolveBriefingChannel(WORK_SPACE_ID, "Yonetim › Butler");
    expect(hit?.id).toBe("ch_butler");
  });

  test("GET /api/org hides Plaud secrets after save", async () => {
    savePlaud({ clientId: "cid-123456789", clientSecret: "sekrit", apiKey: "key-aaa", mcpUrl: "https://mcp.plaud.ai/mcp" });
    const stored = readPlaud();
    expect(stored?.clientSecret).toBe("sekrit");
    const res = await json("GET", "/api/org?space=space_work");
    expect(res.status).toBe(200);
    const body = res.body as { plaud: { configured: boolean; clientIdMasked: string; hasSecret: boolean; hasApiKey: boolean } };
    expect(body.plaud.configured).toBe(true);
    expect(body.plaud.hasSecret).toBe(true);
    expect(body.plaud.hasApiKey).toBe(true);
    expect(JSON.stringify(body)).not.toContain("sekrit");
    expect(JSON.stringify(body)).not.toContain("key-aaa");
  });

  test("posts the morning briefing into the configured channel", async () => {
    chats.upsert({
      id: "ch_butler",
      spaceId: WORK_SPACE_ID,
      accountId: "acc_demo_work",
      kind: "channel",
      title: "Yonetim › Butler",
      members: [],
      lastAt: Date.now(),
      unreadCount: 0,
    });
    patchOrgConfig({ briefChannelTitle: "Yonetim › Butler" });
    const result = await postMorningBriefing(WORK_SPACE_ID, { force: true });
    expect(result.posted).toBe(true);
    expect(result.preview).toContain("Butler ·");
    expect(result.preview).toContain("Özet:");
    const msgs = chats.messages("ch_butler");
    expect(msgs.at(-1)?.body).toContain("Butler");
    const again = await postMorningBriefing(WORK_SPACE_ID);
    expect(again.posted).toBe(false);
    expect(again.skipped).toMatch(/already posted/i);
  });

  test("formatTeamsBriefing leads with a summary and actions, not an unread dump", () => {
    const brief = buildMorningBriefing(WORK_SPACE_ID, { now: Date.now(), ownerEmail: "you@lumenlabs.io" });
    const text = formatTeamsBriefing(brief, "Yonetim › Butler");
    expect(text).toContain("Özet:");
    expect(text).toContain("Butler ·");
    expect(text).not.toContain("Okunmamış (");
    expect(text).not.toContain("Kanal:");
    expect(text.indexOf("Özet:")).toBeLessThan(text.indexOf("Bugün") === -1 ? text.length : text.indexOf("Bugün"));
  });

  test("indexes vault markdown (wikilinks) and search_vault finds it", async () => {
    const n = await indexVaultFiles(WORK_SPACE_ID, [
      {
        path: "people/atilla.md",
        name: "atilla",
        markdown: "# Atilla\nCEO. Related [[musteriler]] and [[pricing]].\n## Notes\nAlways confirm before sending mail.",
      },
      {
        path: "templates/standup.md",
        name: "standup",
        markdown: "# {{title}}\n{{transcript}}",
      },
    ]);
    expect(n).toBeGreaterThan(0);
    expect(extractWikilinks("See [[musteriler]] and [[pricing|fiyat]]")).toEqual(["musteriler", "pricing"]);
    expect(chunks.listForSpace(WORK_SPACE_ID, "kb").length).toBeGreaterThan(0);
    const tool = await runTool("search_vault", { query: "Atilla" }, { spaceId: WORK_SPACE_ID, selectedThreadId: null, selectedChatId: null, selectedEventId: null, accountIds: null });
    expect(tool.output).toContain("Atilla");
  });

  test("fills the built-in meeting template from a transcript", async () => {
    expect(fillPlaceholders("# {{title}}\n{{date}}", { title: "QBR", date: "pazartesi" })).toBe("# QBR\npazartesi");
    const meeting = meetings.list(WORK_SPACE_ID).find((m) => m.hasTranscript);
    expect(meeting).toBeTruthy();
    const note = await buildMeetingMinutes(meeting!, { templatePath: BUILTIN_TEMPLATE_PATH, refresh: true });
    expect(note.kind).toBe("minutes");
    expect(note.bodyMarkdown).toContain(meeting!.title);
    expect(notes.list(WORK_SPACE_ID, { meetingId: meeting!.id, kind: "minutes" }).length).toBeGreaterThan(0);
  });

  test("PATCH /api/org persists the template folder", async () => {
    const res = await json("PATCH", "/api/org?space=space_work", { templateFolder: "templates" });
    expect(res.status).toBe(200);
    expect((res.body as { templateFolder: string }).templateFolder).toBe("templates");
    expect(readOrgConfig().templateFolder).toBe("templates");
  });

  test("walkVaultLibrary lists folders and md files via Graph", async () => {
    const items: Record<string, unknown> = {
      root: [
        { id: "f1", name: "templates", folder: { childCount: 1 } },
        { id: "md1", name: "readme.md", file: { mimeType: "text/markdown" } },
      ],
      f1: [{ id: "md2", name: "standup.md", file: { mimeType: "text/markdown" } }],
    };
    const bodies: Record<string, string> = {
      md1: "# Vault\n[[templates]]",
      md2: "# {{title}}",
    };
    const g: GraphLike = {
      async request(path: string) {
        if (path.startsWith("/sites/conforcus.sharepoint.com:")) return { id: "site1" } as never;
        const content = path.match(/\/items\/([^/]+)\/content/);
        if (content) return bodies[content[1]] as never;
        throw new Error(path);
      },
      async collect<T = any>(path: string) {
        if (path.includes("/drives?")) {
          return { items: [{ id: "drv", name: "VaultConforcus", driveType: "documentLibrary" }] as T[], deltaLink: null };
        }
        if (path.includes("/root/children")) return { items: items.root as T[], deltaLink: null };
        const m = path.match(/\/items\/([^/]+)\/children/);
        if (m && items[m[1]]) return { items: items[m[1]] as T[], deltaLink: null };
        return { items: [] as T[], deltaLink: null };
      },
    };
    const walked = await walkVaultLibrary(g, {
      hostname: "conforcus.sharepoint.com",
      sitePath: "/sites/ConforcusVault",
      libraryName: "VaultConforcus",
      folderPath: "",
    });
    expect(walked.folders).toContain("templates");
    expect(walked.files.map((f) => f.path).sort()).toEqual(["readme.md", "templates/standup.md"]);
  });

  test("423 on a vault file is skipped, not fatal", async () => {
    const g: GraphLike = {
      async request(path: string) {
        if (path.startsWith("/sites/conforcus.sharepoint.com:")) return { id: "site1" } as never;
        if (path.includes("/content")) throw new GraphError(423, "locked");
        throw new Error(path);
      },
      async collect<T = any>(path: string) {
        if (path.includes("/drives?")) {
          return { items: [{ id: "drv", name: "VaultConforcus", driveType: "documentLibrary" }] as T[], deltaLink: null };
        }
        return { items: [{ id: "md1", name: "secret.md", file: { mimeType: "text/markdown" } }] as T[], deltaLink: null };
      },
    };
    const walked = await walkVaultLibrary(g, {
      hostname: "conforcus.sharepoint.com",
      sitePath: "/sites/ConforcusVault",
      libraryName: "VaultConforcus",
      folderPath: "",
    });
    expect(walked.files).toEqual([]);
    expect(walked.skippedLocked).toBe(1);
  });

  test("vault sync without Microsoft 365 records a clear error", async () => {
    const cache = await syncSharePointVault({ account: null });
    expect(cache.error).toMatch(/Microsoft 365/);
  });
});
