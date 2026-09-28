import { classifyVendor, extractStrings, makePreview } from "./classify";
import type { CleanResult, FoundMark } from "./types";

export function isWebp(bytes: Uint8Array): boolean {
  const latin1 = new TextDecoder("latin1");
  return (
    bytes.length > 16 &&
    latin1.decode(bytes.subarray(0, 4)) === "RIFF" &&
    latin1.decode(bytes.subarray(8, 12)) === "WEBP"
  );
}

const STRIP_FOURCC = new Set(["EXIF", "XMP ", "C2PA"]);

export function cleanWebp(bytes: Uint8Array): CleanResult {
  const latin1 = new TextDecoder("latin1");
  const marks: FoundMark[] = [];
  const keptChunks: Array<[number, number]> = [];
  let vp8xStart = -1;

  let off = 12;
  while (off + 8 <= bytes.length) {
    const fourcc = latin1.decode(bytes.subarray(off, off + 4));
    const view = new DataView(bytes.buffer, bytes.byteOffset + off + 4, 4);
    const size = view.getUint32(0, true);
    const padded = size + (size % 2);
    const end = Math.min(off + 8 + padded, bytes.length);

    if (STRIP_FOURCC.has(fourcc)) {
      const payload = bytes.subarray(off + 8, off + 8 + size);
      const text = extractStrings(payload);
      const isC2pa = fourcc === "C2PA";
      marks.push({
        kind: isC2pa ? "c2pa" : fourcc === "EXIF" ? "exif" : "xmp",
        vendor: classifyVendor(text, isC2pa ? "c2pa" : "generic"),
        container: `WebP ${fourcc.trim()}`,
        label:
          fourcc === "EXIF"
            ? "EXIF metadata (EXIF chunk)"
            : fourcc === "XMP "
              ? "XMP packet (XMP chunk)"
              : "C2PA manifest (C2PA chunk)",
        bytes: end - off,
        preview: makePreview(text),
      });
    } else {
      if (fourcc === "VP8X") vp8xStart = off;
      keptChunks.push([off, end]);
    }
    off = end;
  }

  const body = keptChunks.reduce((n, [s, e]) => n + (e - s), 0);
  const out = new Uint8Array(12 + body);
  out.set(bytes.subarray(0, 12), 0);
  let p = 12;
  let vp8xOut = -1;
  for (const [s, e] of keptChunks) {
    if (s === vp8xStart) vp8xOut = p;
    out.set(bytes.subarray(s, e), p);
    p += e - s;
  }

  // Fix RIFF size
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  // Clear EXIF (bit 3) / XMP (bit 2) flags in VP8X so decoders don't look for them
  if (vp8xOut >= 0 && marks.length > 0) {
    out[vp8xOut + 8] &= ~0b0000_1100;
  }

  return {
    format: "webp",
    marks,
    originalBytes: bytes.length,
    cleanedBytes: out.length,
    cleaned: out,
    changed: marks.length > 0,
  };
}
