/**
 * Minimal PNG writer used to generate demo fixtures with embedded
 * provenance metadata. Runs under Bun (uses node:zlib).
 */
import { deflateSync } from "node:zlib";

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function ihdr(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = 8; // bit depth
  data[9] = 2; // color type: truecolor
  return chunk("IHDR", data);
}

/** rgb: (x, y) => [r, g, b] */
export function idat(width: number, height: number, rgb: (x: number, y: number) => [number, number, number]): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 3));
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgb(x, y);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
    }
  }
  return chunk("IDAT", new Uint8Array(deflateSync(raw)));
}

const ascii = (s: string) => new TextEncoder().encode(s);

export function tEXt(keyword: string, value: string): Uint8Array {
  return chunk("tEXt", ascii(`${keyword}\0${value}`));
}

export function iTXtXmp(xml: string): Uint8Array {
  return chunk("iTXt", ascii(`XML:com.adobe.xmp\0\0\0\0\0${xml}`));
}

/** Minimal but structurally valid little-endian TIFF/EXIF with Software + Artist tags. */
export function eXIf(software: string, artist: string): Uint8Array {
  const softBytes = ascii(software + "\0");
  const artistBytes = ascii(artist + "\0");
  const entryCount = 2;
  const ifdSize = 2 + entryCount * 12 + 4;
  const softOff = 8 + ifdSize;
  const artistOff = softOff + softBytes.length;
  const data = new Uint8Array(artistOff + artistBytes.length);
  const view = new DataView(data.buffer);
  // TIFF header
  data[0] = 0x49; data[1] = 0x49; // "II" little-endian
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true); // IFD0 offset
  view.setUint16(8, entryCount, true);
  let p = 10;
  const entry = (tag: number, count: number, valueOff: number) => {
    view.setUint16(p, tag, true);
    view.setUint16(p + 2, 2, true); // ASCII
    view.setUint32(p + 4, count, true);
    view.setUint32(p + 8, valueOff, true);
    p += 12;
  };
  entry(0x0131, softBytes.length, softOff); // Software
  entry(0x013b, artistBytes.length, artistOff); // Artist
  view.setUint32(p, 0, true); // next IFD
  data.set(softBytes, softOff);
  data.set(artistBytes, artistOff);
  return chunk("eXIf", data);
}

/** JUMBF-style stub payload for a caBX chunk (C2PA container shape, demo-grade). */
export function caBX(claimGenerator: string, assertions: string[]): Uint8Array {
  const inner = ascii(
    [
      "jumb", "jumd", "c2pa", "c2pa.manifest",
      `claim_generator=${claimGenerator}`,
      ...assertions.map((a) => `assertion=${a}`),
    ].join("\0"),
  );
  const data = new Uint8Array(8 + inner.length);
  const view = new DataView(data.buffer);
  view.setUint32(0, data.length);
  data[4] = 0x6a; data[5] = 0x75; data[6] = 0x6d; data[7] = 0x62; // "jumb"
  data.set(inner, 8);
  return chunk("caBX", data);
}

export function png(...parts: Uint8Array[]): Uint8Array {
  const all = [SIGNATURE, ...parts, chunk("IEND", new Uint8Array(0))];
  const total = all.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of all) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
