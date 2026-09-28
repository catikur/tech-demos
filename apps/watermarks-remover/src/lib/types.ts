export type VendorClass = "claude" | "openai" | "gemini" | "c2pa" | "generic";

export type MarkKind = "c2pa" | "xmp" | "exif" | "text" | "iptc" | "comment" | "time";

export interface FoundMark {
  kind: MarkKind;
  vendor: VendorClass;
  container: string;
  label: string;
  bytes: number;
  preview?: string;
}

export interface CleanResult {
  format: "png" | "jpeg" | "webp";
  marks: FoundMark[];
  originalBytes: number;
  cleanedBytes: number;
  cleaned: Uint8Array;
  changed: boolean;
}

export const VENDOR_META: Record<VendorClass, { name: string; blurb: string }> = {
  claude: { name: "Claude class", blurb: "Anthropic / Claude provenance surface" },
  openai: { name: "OpenAI class", blurb: "OpenAI / DALL·E / GPT-4o / Sora provenance surface" },
  gemini: { name: "Gemini class", blurb: "Google / Gemini / Imagen / SynthID provenance surface" },
  c2pa: { name: "C2PA manifest", blurb: "Content Credentials (JUMBF) manifest" },
  generic: { name: "Metadata", blurb: "Generic embedded metadata" },
};
