import { classifyVendor, extractStrings, makePreview } from "./classify";
import type { CleanResult, FoundMark, MarkKind } from "./types";

export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/** Chunk types that carry provenance / metadata and are safe to drop. */
const STRIP_TYPES = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME", "caBX"]);

const decoder = new TextDecoder("utf-8", { fatal: false });
const latin1 = new TextDecoder("latin1");

interface PngChunk {
  type: string;
  start: number; // offset of length field
  end: number; // offset past CRC
  dataStart: number;
  dataEnd: number;
}

function* chunks(bytes: Uint8Array): Generator<PngChunk> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8;
  while (off + 12 <= bytes.length) {
    const len = view.getUint32(off);
    const type = latin1.decode(bytes.subarray(off + 4, off + 8));
    const dataStart = off + 8;
    const dataEnd = dataStart + len;
    const end = dataEnd + 4;
    if (dataEnd > bytes.length) return;
    yield { type, start: off, end, dataStart, dataEnd };
    if (type === "IEND") return;
    off = end;
  }
}

function describeChunk(type: string, data: Uint8Array): FoundMark {
  let kind: MarkKind = "text";
  let label = `PNG ${type} chunk`;
  let text = "";

  if (type === "eXIf") {
    kind = "exif";
    label = "EXIF metadata (eXIf chunk)";
    text = extractStrings(data);
  } else if (type === "caBX") {
    kind = "c2pa";
    label = "C2PA / Content Credentials manifest (caBX chunk)";
    text = extractStrings(data);
  } else if (type === "tIME") {
    kind = "time";
    label = "Last-modified timestamp (tIME chunk)";
  } else {
    // tEXt / zTXt / iTXt share a leading NUL-terminated keyword.
    const nul = data.indexOf(0);
    const keyword = nul > 0 ? latin1.decode(data.subarray(0, nul)) : "";
    if (type === "iTXt") {
      // keyword \0 compFlag compMethod lang \0 translated \0 text
      let p = nul + 1;
      const compFlag = data[p];
      p += 2;
      while (p < data.length && data[p] !== 0) p++;
      p++;
      while (p < data.length && data[p] !== 0) p++;
      p++;
      text = compFlag === 0 ? decoder.decode(data.subarray(p)) : extractStrings(data.subarray(p));
    } else if (type === "tEXt") {
      text = latin1.decode(data.subarray(nul + 1));
    } else {
      // zTXt payload is deflate-compressed; classify on keyword + printable runs.
      text = extractStrings(data.subarray(nul + 1));
    }
    if (/xml:com\.adobe\.xmp/i.test(keyword)) {
      kind = "xmp";
      label = "XMP packet (iTXt chunk)";
    } else {
      label = keyword ? `Text metadata "${keyword}" (${type} chunk)` : `Text metadata (${type} chunk)`;
    }
    text = keyword + " " + text;
  }

  const vendor = classifyVendor(text, kind === "c2pa" ? "c2pa" : "generic");
  return {
    kind: kind === "text" && vendor === "c2pa" ? "c2pa" : kind,
    vendor,
    container: `PNG ${type}`,
    label,
    bytes: data.length + 12,
    preview: makePreview(text),
  };
}

export function cleanPng(bytes: Uint8Array): CleanResult {
  const marks: FoundMark[] = [];
  const kept: Array<[number, number]> = [[0, 8]];

  for (const chunk of chunks(bytes)) {
    if (STRIP_TYPES.has(chunk.type)) {
      marks.push(describeChunk(chunk.type, bytes.subarray(chunk.dataStart, chunk.dataEnd)));
    } else {
      kept.push([chunk.start, chunk.end]);
    }
  }

  const total = kept.reduce((n, [s, e]) => n + (e - s), 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const [s, e] of kept) {
    out.set(bytes.subarray(s, e), off);
    off += e - s;
  }

  return {
    format: "png",
    marks,
    originalBytes: bytes.length,
    cleanedBytes: out.length,
    cleaned: out,
    changed: marks.length > 0,
  };
}
