import type { GraphLike } from "../connectors/m365.ts";
import { GraphError } from "../connectors/m365.ts";
import type { SharePointLibraryRef } from "../features/sharepoint-url.ts";

export interface VaultRemoteFile {
  path: string;
  name: string;
  markdown: string;
}

export interface VaultWalkResult {
  folders: string[];
  files: VaultRemoteFile[];
  skippedLocked: number;
}

interface DriveItem {
  id?: string;
  name?: string;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
}

const MAX_FILES = 400;
const MAX_FOLDERS = 250;
const MAX_DEPTH = 8;
const MAX_BYTES = 120_000;

function joinPath(prefix: string, name: string): string {
  return prefix ? `${prefix}/${name}` : name;
}

function isMarkdown(name: string): boolean {
  return /\.md$/i.test(name) || /\.markdown$/i.test(name);
}

async function children(g: GraphLike, driveId: string, itemId: string | "root"): Promise<DriveItem[]> {
  const path =
    itemId === "root"
      ? `/drives/${driveId}/root/children?$select=id,name,folder,file&$top=200`
      : `/drives/${driveId}/items/${itemId}/children?$select=id,name,folder,file&$top=200`;
  const page = await g.collect<DriveItem>(path, { maxPages: 5 });
  return page.items;
}

async function downloadText(g: GraphLike, driveId: string, itemId: string): Promise<string | null> {
  try {
    const body = await g.request<string>(`/drives/${driveId}/items/${itemId}/content`);
    if (typeof body !== "string") return null;
    if (body.length > MAX_BYTES) return body.slice(0, MAX_BYTES);
    return body;
  } catch (err) {
    if (err instanceof GraphError && (err.status === 403 || err.status === 423)) return null;
    throw err;
  }
}

export async function resolveLibraryDrive(g: GraphLike, ref: SharePointLibraryRef): Promise<{ siteId: string; driveId: string; driveName: string }> {
  const site = await g.request<any>(`/sites/${ref.hostname}:${ref.sitePath}`);
  if (!site?.id) throw new Error(`SharePoint site not found: ${ref.sitePath}`);
  const drives = (await g.collect<any>(`/sites/${site.id}/drives?$select=id,name,driveType`, { maxPages: 3 })).items;
  const want = ref.libraryName.toLowerCase();
  const drive =
    drives.find((d: any) => String(d.name ?? "").toLowerCase() === want) ??
    drives.find((d: any) => String(d.name ?? "").toLowerCase().replace(/\s+/g, "") === want.replace(/\s+/g, "")) ??
    drives.find((d: any) => d.driveType === "documentLibrary");
  if (!drive?.id) throw new Error(`Document library "${ref.libraryName}" not found on ${ref.sitePath}`);
  return { siteId: site.id, driveId: drive.id, driveName: drive.name ?? ref.libraryName };
}

async function startItem(g: GraphLike, driveId: string, folderPath: string): Promise<{ id: string | "root"; prefix: string }> {
  if (!folderPath) return { id: "root", prefix: "" };
  const encoded = folderPath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const item = await g.request<any>(`/drives/${driveId}/root:/${encoded}`);
  return { id: item.id ?? "root", prefix: folderPath.replace(/^\/+|\/+$/g, "") };
}

export async function walkVaultLibrary(g: GraphLike, ref: SharePointLibraryRef): Promise<VaultWalkResult> {
  const { driveId } = await resolveLibraryDrive(g, ref);
  const start = await startItem(g, driveId, ref.folderPath);
  const folders: string[] = [];
  const files: VaultRemoteFile[] = [];
  let skippedLocked = 0;

  const visit = async (itemId: string | "root", prefix: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES || folders.length >= MAX_FOLDERS) return;
    let kids: DriveItem[] = [];
    try {
      kids = await children(g, driveId, itemId);
    } catch (err) {
      if (err instanceof GraphError && (err.status === 403 || err.status === 423)) {
        skippedLocked++;
        return;
      }
      throw err;
    }
    for (const child of kids) {
      if (!child.name || !child.id) continue;
      const path = joinPath(prefix, child.name);
      if (child.folder) {
        folders.push(path);
        await visit(child.id, path, depth + 1);
        continue;
      }
      if (!child.file || !isMarkdown(child.name)) continue;
      const markdown = await downloadText(g, driveId, child.id);
      if (markdown === null) {
        skippedLocked++;
        continue;
      }
      files.push({ path, name: child.name.replace(/\.md$/i, ""), markdown });
      if (files.length >= MAX_FILES) return;
    }
  };

  await visit(start.id, start.prefix, 0);
  folders.sort((a, b) => a.localeCompare(b));
  return { folders, files, skippedLocked };
}
