import { DEFAULT_PLAUD_MCP, readPlaud } from "./org-config.ts";

/**
 * Plaud account data has no public REST API. Credentials are stored for when
 * the user pastes Embedded client id / api key (or a future token). This
 * module never talks to Cursor MCP — the VPS scheduler is not an MCP client.
 */
export async function probePlaud(): Promise<{ ok: boolean; message: string }> {
  const stored = readPlaud();
  if (!stored || (!stored.clientId && !stored.apiKey)) {
    return { ok: false, message: "Plaud credentials are empty. Paste client id and API key in Settings when you have them." };
  }
  if (!stored.apiKey || !stored.clientId) {
    return {
      ok: false,
      message: `Saved (MCP ${stored.mcpUrl || DEFAULT_PLAUD_MCP}). Both client id and API key are needed to pull recordings from Plaud Embedded. MCP stays in Cursor, not in this app.`,
    };
  }
  try {
    const res = await fetch("https://platform-us.plaud.ai/developer/api/open/partner/ai/transcriptions/probe-butler", {
      method: "GET",
      headers: {
        "X-Client-Id": stored.clientId,
        "X-Client-Api-Key": stored.apiKey,
      },
    });
    return {
      ok: false,
      message: `Plaud Embedded answered HTTP ${res.status}. Credentials are stored encrypted; listing recordings will use this key on the next connector pass once Plaud exposes account-file list for this app.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Could not reach Plaud (${err instanceof Error ? err.message : String(err)}). Client id / API key stay saved for retry.`,
    };
  }
}
