import { classifyVendor, extractStrings, makePreview } from "./classify";
import type { CleanResult, FoundMark, MarkKind } from "./types";

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

const latin1 = new TextDecoder("latin1");

function startsWith(bytes: Uint8Array, off: number, ascii: string): boolean {
  if (off + ascii.length > bytes.length) return false;
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[off + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

interface SegmentInfo {
  strip: boolean;
  mark?: FoundMark;
}

function inspectSegment(marker: number, bytes: Uint8Array, dataStart: number, dataEnd: number): SegmentInfo {
  const size = dataEnd - dataStart + 4; // marker + length + payload
  const payload = () => bytes.subarray(dataStart, dataEnd);

  if (marker === 0xe1) {
    // APP1: EXIF, XMP, Extended XMP
    let kind: MarkKind = "exif";
    let label = "EXIF metadata (APP1)";
    if (startsWith(bytes, dataStart, "http://ns.adobe.com/xap/1.0/")) {
      kind = "xmp";
      label = "XMP packet (APP1)";
    } else if (startsWith(bytes, dataStart, "http://ns.adobe.com/xmp/extension/")) {
      kind = "xmp";
      label = "Extended XMP packet (APP1)";
    } else if (!startsWith(bytes, dataStart, "Exif\0")) {
      label = "APP1 metadata segment";
    }
    const text = kind === "xmp" ? latin1.decode(payload()) : extractStrings(payload());
    return {
      strip: true,
      mark: {
        kind,
        vendor: classifyVendor(text),
        container: "JPEG APP1",
        label,
        bytes: size,
        preview: makePreview(text.replace(/^https?:\S+\s*\0?/, "")),
      },
    };
  }

  if (marker === 0xeb && (startsWith(bytes, dataStart, "JP") || extractStrings(payload(), 4, 200).includes("jumb"))) {
    // APP11 JPEG XT / JUMBF — where C2PA manifests live
    const text = extractStrings(payload());
    return {
      strip: true,
      mark: {
        kind: "c2pa",
        vendor: classifyVendor(text, "c2pa"),
        container: "JPEG APP11",
        label: "C2PA / Content Credentials manifest (APP11 JUMBF)",
        bytes: size,
        preview: makePreview(text),
      },
    };
  }

  if (marker === 0xed) {
    // APP13: Photoshop IRB / IPTC
    const text = extractStrings(payload());
    return {
      strip: true,
      mark: {
        kind: "iptc",
        vendor: classifyVendor(text),
        container: "JPEG APP13",
        label: "IPTC / Photoshop metadata (APP13)",
        bytes: size,
        preview: makePreview(text),
      },
    };
  }

  if (marker === 0xfe) {
    const text = latin1.decode(payload());
    return {
      strip: true,
      mark: {
        kind: "comment",
        vendor: classifyVendor(text),
        container: "JPEG COM",
        label: "Comment segment (COM)",
        bytes: size,
        preview: makePreview(text),
      },
    };
  }

  return { strip: false };
}

export function cleanJpeg(bytes: Uint8Array): CleanResult {
  const marks: FoundMark[] = [];
  const kept: Array<[number, number]> = [[0, 2]]; // SOI
  let off = 2;

  while (off + 4 <= bytes.length) {
    if (bytes[off] !== 0xff) break; // corrupt stream; keep the rest verbatim
    const marker = bytes[off + 1];

    // Standalone markers without a length field
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push([off, off + 2]);
      off += 2;
      continue;
    }

    const len = (bytes[off + 2] << 8) | bytes[off + 3];
    const segEnd = off + 2 + len;
    if (len < 2 || segEnd > bytes.length) break;

    if (marker === 0xda) {
      // SOS: entropy-coded data follows — copy everything from here on
      kept.push([off, bytes.length]);
      off = bytes.length;
      break;
    }

    const info = inspectSegment(marker, bytes, off + 4, segEnd);
    if (info.strip && info.mark) {
      marks.push(info.mark);
    } else {
      kept.push([off, segEnd]);
    }
    off = segEnd;
  }

  if (off < bytes.length) kept.push([off, bytes.length]);

  const total = kept.reduce((n, [s, e]) => n + (e - s), 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const [s, e] of kept) {
    out.set(bytes.subarray(s, e), p);
    p += e - s;
  }

  return {
    format: "jpeg",
    marks,
    originalBytes: bytes.length,
    cleanedBytes: out.length,
    cleaned: out,
    changed: marks.length > 0,
  };
}
