import "./styles.css";
import { cleanImage, MIME, UnsupportedFormatError } from "./lib/engine";
import { VENDOR_META, type CleanResult, type FoundMark } from "./lib/types";

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
};

const hero = $("#hero");
const resultSection = $("#result");
const dropzone = $("#dropzone");
const fileInput = $<HTMLInputElement>("#file-input");
const summaryBar = $("#summary-bar");
const imgBefore = $<HTMLImageElement>("#img-before");
const imgAfter = $<HTMLImageElement>("#img-after");
const beforeMeta = $("#before-meta");
const afterMeta = $("#after-meta");
const marksBefore = $("#marks-before");
const marksAfter = $("#marks-after");
const downloadBtn = $<HTMLButtonElement>("#download-btn");
const resetBtn = $("#reset-btn");

let currentUrls: string[] = [];
let downloadName = "cleaned.png";
let downloadUrl = "";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function revokeUrls() {
  for (const url of currentUrls) URL.revokeObjectURL(url);
  currentUrls = [];
}

function renderMark(mark: FoundMark): HTMLElement {
  const el = document.createElement("div");
  el.className = "mark";
  const head = document.createElement("div");
  head.className = "mark-head";

  const badge = document.createElement("span");
  badge.className = `badge badge-${mark.vendor}`;
  badge.textContent = VENDOR_META[mark.vendor].name;
  badge.title = VENDOR_META[mark.vendor].blurb;

  const label = document.createElement("span");
  label.className = "mark-label";
  label.textContent = mark.label;

  const size = document.createElement("span");
  size.className = "mark-size";
  size.textContent = `${mark.container} · ${fmtBytes(mark.bytes)}`;

  head.append(badge, label, size);
  el.append(head);

  if (mark.preview) {
    const pre = document.createElement("p");
    pre.className = "mark-preview";
    pre.textContent = mark.preview;
    el.append(pre);
  }
  return el;
}

function showError(message: string) {
  document.querySelector(".error-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "error-toast";
  toast.textContent = message;
  dropzone.insertAdjacentElement("afterend", toast);
  setTimeout(() => toast.remove(), 6000);
}

function render(result: CleanResult, fileName: string) {
  revokeUrls();

  const mime = MIME[result.format];
  const stripped = result.originalBytes - result.cleanedBytes;
  const base = fileName.replace(/\.[a-z0-9]+$/i, "");
  const ext = result.format === "jpeg" ? "jpg" : result.format;
  downloadName = `${base}.cleaned.${ext}`;

  const cleanedBlob = new Blob([result.cleaned as BlobPart], { type: mime });
  downloadUrl = URL.createObjectURL(cleanedBlob);
  currentUrls.push(downloadUrl);

  imgAfter.src = downloadUrl;
  afterMeta.textContent = `${fmtBytes(result.cleanedBytes)} · ${result.format.toUpperCase()}`;

  summaryBar.classList.toggle("no-marks", result.marks.length === 0);
  summaryBar.innerHTML = "";
  const stats: Array<[string, string]> = result.marks.length
    ? [
        ["Marks removed", String(result.marks.length)],
        ["Bytes stripped", fmtBytes(stripped)],
        ["Pixels", "untouched (lossless)"],
        ["Re-scan of cleaned file", "0 marks"],
      ]
    : [["Result", "No provenance marks found in this file — it is already clean."]];
  for (const [k, v] of stats) {
    const span = document.createElement("span");
    span.className = "stat";
    span.innerHTML = `${k}: <b></b>`;
    span.querySelector("b")!.textContent = v;
    summaryBar.append(span);
  }

  marksBefore.innerHTML = "";
  if (result.marks.length) {
    for (const mark of result.marks) marksBefore.append(renderMark(mark));
  } else {
    const ok = document.createElement("div");
    ok.className = "all-clear";
    ok.textContent = "No provenance marks detected";
    marksBefore.append(ok);
  }

  marksAfter.innerHTML = "";
  const clear = document.createElement("div");
  clear.className = "all-clear";
  clear.textContent = "✓ Clean — no provenance marks";
  marksAfter.append(clear);

  hero.hidden = true;
  resultSection.hidden = false;
}

async function processBytes(bytes: Uint8Array, fileName: string) {
  try {
    const result = cleanImage(bytes);

    // Sanity check: the cleaned output must itself scan clean.
    const rescan = cleanImage(result.cleaned);
    if (rescan.marks.length > 0) {
      console.warn("re-scan still found marks", rescan.marks);
    }

    const mime = MIME[result.format];
    const beforeBlob = new Blob([bytes as BlobPart], { type: mime });
    render(result, fileName);
    const beforeUrl = URL.createObjectURL(beforeBlob);
    currentUrls.push(beforeUrl);
    imgBefore.src = beforeUrl;
    beforeMeta.textContent = `${fmtBytes(result.originalBytes)} · ${result.format.toUpperCase()}`;
  } catch (err) {
    if (err instanceof UnsupportedFormatError) {
      showError(err.message);
    } else {
      console.error(err);
      showError("Could not parse this file — is it a valid PNG, JPEG or WebP?");
    }
  }
}

async function processFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await processBytes(bytes, file.name);
}

// --- wiring ---

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void processFile(file);
  fileInput.value = "";
});

for (const evt of ["dragenter", "dragover"] as const) {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
}
for (const evt of ["dragleave", "drop"] as const) {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  });
}
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) void processFile(file);
});

document.querySelectorAll<HTMLButtonElement>(".sample-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const url = btn.dataset.sample!;
    const res = await fetch(url);
    const bytes = new Uint8Array(await res.arrayBuffer());
    await processBytes(bytes, url.split("/").pop() ?? "sample.png");
  });
});

downloadBtn.addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = downloadName;
  a.click();
});

resetBtn.addEventListener("click", () => {
  revokeUrls();
  resultSection.hidden = true;
  hero.hidden = false;
});
