import { cleanJpeg, isJpeg } from "./jpeg";
import { cleanPng, isPng } from "./png";
import { cleanWebp, isWebp } from "./webp";
import type { CleanResult } from "./types";

export class UnsupportedFormatError extends Error {
  constructor() {
    super("Unsupported format — this demo handles PNG, JPEG and WebP.");
  }
}

/** Detect the container format and strip provenance marks losslessly. */
export function cleanImage(bytes: Uint8Array): CleanResult {
  if (isPng(bytes)) return cleanPng(bytes);
  if (isJpeg(bytes)) return cleanJpeg(bytes);
  if (isWebp(bytes)) return cleanWebp(bytes);
  throw new UnsupportedFormatError();
}

export const MIME: Record<CleanResult["format"], string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
