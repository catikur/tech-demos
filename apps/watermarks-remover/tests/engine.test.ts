import { describe, expect, test } from "bun:test";
import { cleanImage } from "../src/lib/engine";
import { cleanJpeg, isJpeg } from "../src/lib/jpeg";
import { cleanPng, isPng } from "../src/lib/png";
import { cleanWebp, isWebp } from "../src/lib/webp";
import { caBX, eXIf, idat, ihdr, iTXtXmp, png, tEXt } from "../scripts/png-write";

const ascii = (s: string) => new TextEncoder().encode(s);

function samplePng() {
  return png(
    ihdr(8, 8),
    tEXt("Software", "Claude by Anthropic"),
    eXIf("OpenAI DALL-E 3", "OpenAI"),
    iTXtXmp(`<x:xmpmeta xmp:CreatorTool="Google Gemini SynthID"></x:xmpmeta>`),
    caBX("Anthropic Claude/1.0", ["c2pa.actions:created"]),
    idat(8, 8, () => [128, 64, 32]),
  );
}

describe("png", () => {
  test("detects and classifies vendor-class marks", () => {
    const result = cleanPng(samplePng());
    expect(result.marks.length).toBe(4);
    const vendors = result.marks.map((m) => m.vendor).sort();
    expect(vendors).toEqual(["claude", "claude", "gemini", "openai"]);
    const kinds = result.marks.map((m) => m.kind).sort();
    expect(kinds).toEqual(["c2pa", "exif", "text", "xmp"]);
  });

  test("cleaned output is a valid PNG with zero marks and identical IDAT", () => {
    const original = samplePng();
    const result = cleanPng(original);
    expect(isPng(result.cleaned)).toBe(true);
    expect(result.cleanedBytes).toBeLessThan(result.originalBytes);

    const rescan = cleanPng(result.cleaned);
    expect(rescan.marks.length).toBe(0);
    expect(rescan.changed).toBe(false);

    // pixel data untouched: IDAT bytes present verbatim in cleaned file
    const idatChunk = idat(8, 8, () => [128, 64, 32]);
    expect(indexOfBytes(result.cleaned, idatChunk)).toBeGreaterThan(-1);
  });

  test("already-clean file passes through unchanged", () => {
    const clean = png(ihdr(4, 4), idat(4, 4, () => [0, 0, 0]));
    const result = cleanPng(clean);
    expect(result.changed).toBe(false);
    expect(result.cleaned).toEqual(clean);
  });
});

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length);
  out[0] = 0xff;
  out[1] = marker;
  out[2] = (payload.length + 2) >> 8;
  out[3] = (payload.length + 2) & 0xff;
  out.set(payload, 4);
  return out;
}

function sampleJpeg(): Uint8Array {
  const soi = Uint8Array.from([0xff, 0xd8]);
  const app0 = jpegSegment(0xe0, ascii("JFIF\0\x01\x02\0\0\x01\0\x01\0\0"));
  const exif = jpegSegment(0xe1, ascii("Exif\0\0II*\0 OpenAI DALL-E watermark demo"));
  const xmpSeg = jpegSegment(0xe1, ascii("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta CreatorTool='Anthropic Claude'/>"));
  const jumbf = jpegSegment(0xeb, ascii("JP\0\0jumb c2pa claim_generator=Google Gemini SynthID"));
  const com = jpegSegment(0xfe, ascii("Made with Google AI"));
  // Fake-but-well-formed tail: SOS then entropy data then EOI
  const sos = Uint8Array.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]);
  const parts = [soi, app0, exif, xmpSeg, jumbf, com, sos];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

describe("jpeg", () => {
  test("strips APP1/APP11/COM and keeps APP0 + scan data", () => {
    const original = sampleJpeg();
    expect(isJpeg(original)).toBe(true);
    const result = cleanJpeg(original);
    expect(result.marks.length).toBe(4);
    expect(result.marks.map((m) => m.vendor).sort()).toEqual(["claude", "gemini", "gemini", "openai"]);
    expect(result.marks.find((m) => m.container === "JPEG APP11")?.kind).toBe("c2pa");

    const rescan = cleanJpeg(result.cleaned);
    expect(rescan.marks.length).toBe(0);
    expect(indexOfBytes(result.cleaned, ascii("JFIF"))).toBeGreaterThan(-1);
    // entropy-coded bytes retained
    expect(indexOfBytes(result.cleaned, Uint8Array.from([0x11, 0x22, 0x33, 0xff, 0xd9]))).toBeGreaterThan(-1);
  });
});

function riffChunk(fourcc: string, payload: Uint8Array): Uint8Array {
  const padded = payload.length + (payload.length % 2);
  const out = new Uint8Array(8 + padded);
  out.set(ascii(fourcc), 0);
  new DataView(out.buffer).setUint32(4, payload.length, true);
  out.set(payload, 8);
  return out;
}

function sampleWebp(): Uint8Array {
  const vp8x = riffChunk("VP8X", Uint8Array.from([0b0000_1100, 0, 0, 0, 7, 0, 0, 7, 0, 0]));
  const vp8 = riffChunk("VP8 ", ascii("fake-bitstream"));
  const exif = riffChunk("EXIF", ascii("II*\0 Google Gemini SynthID demo"));
  const xmp = riffChunk("XMP ", ascii("<x:xmpmeta CreatorTool='OpenAI Sora'/>"));
  const body = [vp8x, exif, xmp, vp8];
  const size = body.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(12 + size);
  out.set(ascii("RIFF"), 0);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  out.set(ascii("WEBP"), 8);
  let off = 12;
  for (const p of body) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

describe("webp", () => {
  test("strips EXIF/XMP chunks, clears VP8X flags, fixes RIFF size", () => {
    const original = sampleWebp();
    expect(isWebp(original)).toBe(true);
    const result = cleanWebp(original);
    expect(result.marks.map((m) => m.vendor).sort()).toEqual(["gemini", "openai"]);

    const rescan = cleanWebp(result.cleaned);
    expect(rescan.marks.length).toBe(0);
    // RIFF size correct
    const view = new DataView(result.cleaned.buffer, result.cleaned.byteOffset);
    expect(view.getUint32(4, true)).toBe(result.cleaned.length - 8);
    // VP8X EXIF/XMP flag bits cleared
    const vp8xOff = indexOfBytes(result.cleaned, ascii("VP8X"));
    expect(result.cleaned[vp8xOff + 8] & 0b0000_1100).toBe(0);
  });
});

describe("engine", () => {
  test("dispatches by magic bytes", () => {
    expect(cleanImage(samplePng()).format).toBe("png");
    expect(cleanImage(sampleJpeg()).format).toBe("jpeg");
    expect(cleanImage(sampleWebp()).format).toBe("webp");
  });

  test("rejects unknown formats", () => {
    expect(() => cleanImage(ascii("GIF89a not supported here"))).toThrow();
  });
});

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
