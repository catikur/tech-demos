/**
 * Parse a browser SharePoint library URL into Graph site + drive coordinates.
 * Accepts AllItems.aspx links, sharing /:f:/r/ links, and bare library paths.
 */

export interface SharePointLibraryRef {
  hostname: string;
  /** e.g. `/sites/ConforcusVault` */
  sitePath: string;
  /** Document library display name, e.g. `VaultConforcus`. */
  libraryName: string;
  /** Path under the library, no leading slash. */
  folderPath: string;
}

function dropForms(parts: string[]): string[] {
  const forms = parts.findIndex((p) => /^forms$/i.test(p));
  return forms >= 0 ? parts.slice(0, forms) : parts.filter((p) => !/\.aspx$/i.test(p));
}

export function parseSharePointLibraryUrl(raw: string): SharePointLibraryRef | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  if (!/\.sharepoint\.com$/i.test(u.hostname)) return null;
  const parts = u.pathname
    .split("/")
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });

  const sitesIdx = parts.findIndex((p) => p.toLowerCase() === "sites");
  if (sitesIdx < 0 || !parts[sitesIdx + 1]) return null;
  const site = parts[sitesIdx + 1];
  const after = dropForms(parts.slice(sitesIdx + 2));
  const libraryName = after[0] || "Documents";
  const folderPath = after.slice(1).join("/");
  return {
    hostname: u.hostname.toLowerCase(),
    sitePath: `/sites/${site}`,
    libraryName,
    folderPath,
  };
}

export function graphSiteKey(ref: SharePointLibraryRef): string {
  return `${ref.hostname}:${ref.sitePath}`;
}
