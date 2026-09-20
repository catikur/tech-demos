import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { meetings } from "../server/db/repo.ts";
import { savePlaud } from "../server/features/org-config.ts";
import { PLAUD_API, localRecordingPath, probePlaud, transcribeMeetingRecording, type PlaudFetch } from "../server/features/plaud.ts";
import { seededDb, WORK_SPACE_ID } from "./helpers.ts";

const savedEnv = { ...process.env };
function restoreEnv() {
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  for (const [k, v] of Object.entries(savedEnv)) process.env[k] = v;
}

describe("Plaud Embedded", () => {
  beforeEach(async () => {
    restoreEnv();
    process.env.LOGIN_REQUIRED = "0";
    process.env.LLM_PROVIDER = "mock";
    await seededDb();
  });
  afterEach(restoreEnv);

  test("probe exchanges client id + secret for a partner token", async () => {
    savePlaud({ clientId: "cid-test", clientSecret: "sekrit", apiKey: "key-aaa", mcpUrl: "https://mcp.plaud.ai/mcp" });
    const urls: string[] = [];
    const fetcher: PlaudFetch = async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ access_token: "tok_abc123456", token_type: "bearer", expires_in: 3600 }), { status: 200 });
    };
    const result = await probePlaud(fetcher);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("geçerli");
    expect(result.message).toContain("Note");
    expect(urls[0]).toContain("/oauth/partner/access-token");
  });

  test("probe reports invalid partner credentials", async () => {
    savePlaud({ clientId: "cid-test", clientSecret: "bad", apiKey: "key-aaa" });
    const fetcher: PlaudFetch = async () => new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 });
    const result = await probePlaud(fetcher);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("401");
  });

  test("transcribeMeetingRecording skips when there is no mp4 on disk", async () => {
    savePlaud({ clientId: "cid-test", clientSecret: "sekrit", apiKey: "key-aaa" });
    const meeting = meetings.list(WORK_SPACE_ID).find((m) => m.id === "mt-cal-only");
    expect(meeting).toBeTruthy();
    try {
      await Bun.file(localRecordingPath(meeting!.id)).delete();
    } catch {
      /* nothing to delete */
    }
    const result = await transcribeMeetingRecording(meeting!.id, {
      fetch: async () => {
        throw new Error("should not call Plaud");
      },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Yerel ses/);
  });

  test("transcribeMeetingRecording uploads and maps segments", async () => {
    savePlaud({ clientId: "cid-test", clientSecret: "sekrit", apiKey: "key-aaa" });
    const meeting = meetings.list(WORK_SPACE_ID).find((m) => m.id === "mt-cal-only") ?? meetings.list(WORK_SPACE_ID)[0];
    const path = localRecordingPath(meeting.id);
    mkdirSync(join(path, ".."), { recursive: true });
    await Bun.write(path, "not-really-audio");
    meetings.upsert({ ...meeting, hasRecording: true, recordingLocked: false, hasTranscript: false });

    const fetcher: PlaudFetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/oauth/partner/access-token")) {
        return new Response(JSON.stringify({ access_token: "partner" }), { status: 200 });
      }
      if (url.endsWith("/open/partner/users/access-token")) {
        return new Response(JSON.stringify({ access_token: "user" }), { status: 200 });
      }
      if (url.endsWith("/generate-presigned-urls")) {
        return new Response(
          JSON.stringify({
            FileId: "file_1",
            UploadId: "up_1",
            ChunkSize: 1024,
            Parts: [{ PartNumber: 1, PresignedUrl: "https://s3.example/put" }],
          }),
          { status: 200 },
        );
      }
      if (url === "https://s3.example/put") {
        return new Response(null, { status: 200, headers: { ETag: '"etag1"' } });
      }
      if (url.endsWith("/complete-upload")) {
        return new Response(JSON.stringify({ DownloadUrl: "https://s3.example/file.mp4" }), { status: 200 });
      }
      if (url.endsWith("/open/partner/ai/transcriptions/") && init?.method === "POST") {
        return new Response(JSON.stringify({ transcription_id: "task_1", status: "PENDING" }), { status: 200 });
      }
      if (url.endsWith("/open/partner/ai/transcriptions/task_1")) {
        return new Response(
          JSON.stringify({
            transcription_id: "task_1",
            status: "SUCCESS",
            data: {
              segments: [{ start: 0, end: 2, text: "Karar: fiyatı kilitleyelim.", speaker: "Atilla" }],
            },
          }),
          { status: 200 },
        );
      }
      return new Response("unexpected " + url, { status: 500 });
    };

    const result = await transcribeMeetingRecording(meeting.id, { fetch: fetcher, sleep: async () => undefined, maxWaitMs: 5_000 });
    expect(result.ok).toBe(true);
    expect(result.lines[0]?.text).toContain("fiyatı");
    expect(meetings.get(meeting.id)?.hasTranscript).toBe(true);
    expect(PLAUD_API).toContain("plaud.ai");
  });
});
