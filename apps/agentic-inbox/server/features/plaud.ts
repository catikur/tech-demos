import { createHash } from "node:crypto";
import { join } from "node:path";
import type { TranscriptLine } from "../../shared/types.ts";
import { env } from "../env.ts";
import { meetings } from "../db/repo.ts";
import { DEFAULT_PLAUD_MCP, readPlaud } from "./org-config.ts";

export const PLAUD_API = "https://platform-us.plaud.ai/developer/api";

export type PlaudFetch = (input: string, init?: RequestInit) => Promise<Response>;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function pick(obj: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { raw: text.slice(0, 240) };
  }
}

export function localRecordingPath(meetingId: string): string {
  const safe = meetingId.replace(/[^a-z0-9_]/gi, "");
  return join(env.dataDir, "recordings", `${safe}.mp4`);
}

const defaultFetch: PlaudFetch = (input, init) => fetch(input, init);

export async function probePlaud(fetcher: PlaudFetch = defaultFetch): Promise<{ ok: boolean; message: string }> {
  const stored = readPlaud();
  if (!stored || (!stored.clientId && !stored.apiKey)) {
    return { ok: false, message: "Plaud kimliği boş. Ayarlar’a client id ve API key yapıştır." };
  }
  if (stored.clientId && stored.clientSecret) {
    try {
      const token = await partnerAccessToken(stored.clientId, stored.clientSecret, fetcher);
      const extra = stored.apiKey
        ? " Teams’ten inen ses dosyasını Toplantılar → Plaud ile çözümle ile ASR’ye verebilirsin."
        : " Transkripsiyon için bir de API key lazım (portal → App Settings → API Keys).";
      return {
        ok: true,
        message: `Plaud Embedded kimliği geçerli (partner token ${token.slice(0, 8)}…). Bu anahtarlar Plaud Note kütüphanesini çekmez — o kayıtlar Cursor’daki Plaud MCP (${stored.mcpUrl || DEFAULT_PLAUD_MCP}) ile okunur.${extra}`,
      };
    } catch (err) {
      return {
        ok: false,
        message: `Plaud partner token reddedildi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  if (stored.clientId && stored.apiKey) {
    try {
      const res = await fetcher(`${PLAUD_API}/open/partner/ai/transcriptions/probe-butler-health`, {
        method: "GET",
        headers: { "X-Client-Id": stored.clientId, "X-Client-Api-Key": stored.apiKey },
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: `Plaud API key geçersiz (HTTP ${res.status}). Portal’daki API Keys değerini kontrol et.` };
      }
      return {
        ok: res.status !== 401,
        message: `Plaud Transcription API yanıtı HTTP ${res.status}. Client secret yoksa ses yüklenemez; Note kütüphanesi yine Cursor MCP’de. Secret’i Ayarlar’a ekle, sonra Toplantılar’dan çözümle.`,
      };
    } catch (err) {
      return { ok: false, message: `Plaud’a ulaşılamadı (${err instanceof Error ? err.message : String(err)}).` };
    }
  }
  return {
    ok: false,
    message: `Kayıtlı (MCP ${stored.mcpUrl || DEFAULT_PLAUD_MCP}). Partner token için client id + secret, ASR için ayrıca API key gerekir.`,
  };
}

export async function transcribeMeetingRecording(
  meetingId: string,
  opts: { fetch?: PlaudFetch; sleep?: (ms: number) => Promise<void>; maxWaitMs?: number } = {},
): Promise<{ ok: boolean; message: string; lines: TranscriptLine[] }> {
  const meeting = meetings.get(meetingId);
  if (!meeting) return { ok: false, message: "Toplantı bulunamadı.", lines: [] };
  if (meeting.recordingLocked) {
    return {
      ok: false,
      message: "Bu kayıt Graph 423 ile kilitli; Plaud Embedded dosyayı Teams’ten çekemez. Plaud Note’taki kopya Cursor MCP ile okunur.",
      lines: [],
    };
  }
  const path = localRecordingPath(meetingId);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return {
      ok: false,
      message: "Yerel ses/mp4 yok. Plaud Embedded, Butler’ın indirdiği kaydı çözer; Plaud Note kütüphanesini listelemez.",
      lines: [],
    };
  }
  const stored = readPlaud();
  if (!stored?.clientId || !stored.clientSecret || !stored.apiKey) {
    return {
      ok: false,
      message: "Plaud için client id + secret + API key gerekir. Ayarlar’da üçünü de kaydet.",
      lines: [],
    };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const lines = await transcribeAudioBytes(bytes, {
      clientId: stored.clientId,
      clientSecret: stored.clientSecret,
      apiKey: stored.apiKey,
      filetype: "mp4",
      fetch: opts.fetch ?? defaultFetch,
      sleep: opts.sleep ?? sleep,
      maxWaitMs: opts.maxWaitMs ?? 90_000,
    });
    if (lines.length) meetings.setTranscript(meetingId, lines);
    return { ok: true, message: `Plaud ${lines.length} satır transkript üretti.`, lines };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err), lines: [] };
  }
}

export async function partnerAccessToken(clientId: string, clientSecret: string, fetcher: PlaudFetch = defaultFetch): Promise<string> {
  const res = await fetcher(`${PLAUD_API}/oauth/partner/access-token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "",
  });
  const json = await readJson(res);
  const token = String(pick(json, "access_token", "accessToken") ?? "");
  if (!res.ok || !token) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 220)}`);
  }
  return token;
}

async function userAccessToken(partnerToken: string, userId: string, fetcher: PlaudFetch): Promise<string> {
  const res = await fetcher(`${PLAUD_API}/open/partner/users/access-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${partnerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, expires_in: 86_400 }),
  });
  const json = await readJson(res);
  const token = String(pick(json, "access_token", "accessToken") ?? "");
  if (!res.ok || !token) throw new Error(`user token HTTP ${res.status}: ${JSON.stringify(json).slice(0, 220)}`);
  return token;
}

async function transcribeAudioBytes(
  bytes: Uint8Array,
  opts: {
    clientId: string;
    clientSecret: string;
    apiKey: string;
    filetype: string;
    fetch: PlaudFetch;
    sleep: (ms: number) => Promise<void>;
    maxWaitMs: number;
  },
): Promise<TranscriptLine[]> {
  const partner = await partnerAccessToken(opts.clientId, opts.clientSecret, opts.fetch);
  const user = await userAccessToken(partner, "butler-conforcus", opts.fetch);
  const downloadUrl = await uploadAudio(bytes, opts.filetype, user, opts.fetch);
  const created = await opts.fetch(`${PLAUD_API}/open/partner/ai/transcriptions/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": opts.clientId,
      "X-Client-Api-Key": opts.apiKey,
    },
    body: JSON.stringify({
      file_url: downloadUrl,
      params: {
        transcribe: { language: "auto", model: "plaud-fast-whisper" },
        diarization: { enabled: true, return_embedding: false },
      },
    }),
  });
  const createdJson = await readJson(created);
  const transcriptionId = String(pick(createdJson, "transcription_id", "transcriptionId") ?? "");
  if (!created.ok || !transcriptionId) {
    throw new Error(`transcription submit HTTP ${created.status}: ${JSON.stringify(createdJson).slice(0, 220)}`);
  }
  const deadline = Date.now() + opts.maxWaitMs;
  while (Date.now() < deadline) {
    const poll = await opts.fetch(`${PLAUD_API}/open/partner/ai/transcriptions/${encodeURIComponent(transcriptionId)}`, {
      headers: { "X-Client-Id": opts.clientId, "X-Client-Api-Key": opts.apiKey },
    });
    const json = await readJson(poll);
    const status = String(pick(json, "status") ?? "").toUpperCase();
    if (status === "SUCCESS") return segmentsToLines(pick(json, "data") as Record<string, unknown> | undefined);
    if (status === "FAILURE" || status === "FAILED" || status === "ERROR") {
      throw new Error(`Plaud transcription failed: ${JSON.stringify(json).slice(0, 220)}`);
    }
    await opts.sleep(2_000);
  }
  throw new Error("Plaud transcription timed out — later retry from Meetings.");
}

async function uploadAudio(bytes: Uint8Array, filetype: string, userToken: string, fetcher: PlaudFetch): Promise<string> {
  const signed = await fetcher(`${PLAUD_API}/open/partner/files/upload/generate-presigned-urls`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ filesize: bytes.byteLength, filetype }),
  });
  const meta = await readJson(signed);
  if (!signed.ok) throw new Error(`presign HTTP ${signed.status}: ${JSON.stringify(meta).slice(0, 220)}`);
  const fileId = String(pick(meta, "FileId", "file_id", "fileId") ?? "");
  const uploadId = String(pick(meta, "UploadId", "upload_id", "uploadId") ?? "");
  const chunkSize = Number(pick(meta, "ChunkSize", "chunk_size", "chunkSize") ?? bytes.byteLength);
  const partsRaw = (pick(meta, "Parts", "parts") as Array<Record<string, unknown>> | undefined) ?? [];
  if (!fileId || !uploadId || partsRaw.length === 0) {
    throw new Error(`presign missing fields: ${JSON.stringify(meta).slice(0, 220)}`);
  }
  const partList: { PartNumber: number; ETag: string }[] = [];
  for (const part of partsRaw) {
    const n = Number(pick(part, "PartNumber", "part_number", "partNumber") ?? 0);
    const url = String(pick(part, "PresignedUrl", "presigned_url", "presignedUrl") ?? "");
    const start = (n - 1) * chunkSize;
    const chunk = bytes.subarray(start, Math.min(start + chunkSize, bytes.byteLength));
    const put = await fetcher(url, { method: "PUT", body: Buffer.from(chunk) });
    if (!put.ok) throw new Error(`S3 PUT part ${n} HTTP ${put.status}`);
    const etag = put.headers.get("ETag") || put.headers.get("etag") || `"part-${n}"`;
    partList.push({ PartNumber: n, ETag: etag });
  }
  const md5 = createHash("md5").update(bytes).digest("hex");
  const done = await fetcher(`${PLAUD_API}/open/partner/files/upload/complete-upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId, upload_id: uploadId, part_list: partList, filetype, file_md5: md5 }),
  });
  const doneJson = await readJson(done);
  const download = String(pick(doneJson, "DownloadUrl", "download_url", "downloadUrl") ?? "");
  if (!done.ok || !download) throw new Error(`complete-upload HTTP ${done.status}: ${JSON.stringify(doneJson).slice(0, 220)}`);
  return download;
}

function segmentsToLines(data: Record<string, unknown> | undefined): TranscriptLine[] {
  const segments = (pick(data, "segments", "source_list", "sourceList") as Array<Record<string, unknown>> | undefined) ?? [];
  const lines = segments
    .map((s) => {
      const start = Number(pick(s, "start", "start_at", "startAt") ?? 0);
      const text = String(pick(s, "text", "content") ?? "").trim();
      const speaker = String(pick(s, "speaker", "spk") ?? "Speaker");
      return { speaker, at: start > 1000 ? Math.round(start) : Math.round(start * 1000), text };
    })
    .filter((l) => l.text);
  if (lines.length) return lines;
  const blob = String(pick(data, "text") ?? "").trim();
  if (!blob) return [];
  return blob.split(/\n+/).map((text, i) => ({ speaker: "Speaker", at: i * 1000, text: text.trim() })).filter((l) => l.text);
}
