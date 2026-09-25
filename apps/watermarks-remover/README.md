# watermarks-remover

Privacy-first browser demo that strips **AI provenance marks** — C2PA / Content Credentials manifests, EXIF, XMP and text metadata left by **Claude**, **OpenAI** and **Gemini / SynthID**-class tools — from images you own.

Everything runs **locally in your browser tab**: the image is parsed byte-by-byte with hand-rolled PNG / JPEG / WebP container parsers, provenance segments are removed, and the file is reassembled. No uploads, no third-party APIs, and pixels are never re-encoded (lossless).

## Run it

```bash
bun install
bun run dev        # http://localhost:5173
```

Other scripts:

```bash
bun test               # container-parser + classification tests
bun run gen:samples    # regenerate public/samples/ demo images
bun run build          # production build
```

## What it does

| Format | Provenance surfaces removed |
| --- | --- |
| PNG | `tEXt` / `zTXt` / `iTXt` (incl. XMP), `eXIf`, `tIME`, `caBX` (C2PA JUMBF) |
| JPEG | `APP1` (EXIF, XMP, Extended XMP), `APP11` (C2PA JUMBF), `APP13` (IPTC), `COM` |
| WebP | `EXIF`, `XMP`, `C2PA` RIFF chunks + VP8X flag cleanup + RIFF size fix |

Each removed mark is classified into a vendor class (Claude / OpenAI / Gemini / generic C2PA) by scanning the extracted metadata text, and shown in a before/after comparison with a byte count and content preview. The cleaned file is re-scanned to verify zero remaining marks before download.

Three sample images with realistic embedded provenance metadata (valid TIFF/EXIF payloads, XMP packets, JUMBF-style C2PA stubs) live in `public/samples/` so you can try the flow without hunting for a watermarked file.

## Honest limitations

- This removes **metadata-level** provenance marks. Pixel-domain watermarks such as Google's SynthID image watermark are embedded in the pixels themselves and are *not* removed by a metadata strip.
- Demo-grade parsers: unusual or corrupt containers may fall back to "unsupported format".
- Use on content **you own**. Provenance marks serve legitimate transparency purposes.

## Credits

- Inspired by [guillaumemeyer/watermarks-remover](https://github.com/guillaumemeyer/watermarks-remover) — an agent skill + Python service that strips multi-vendor AI provenance marks from text and files. This demo is a small browser-native reimplementation of its image metadata layer.
- Source bookmark: [x.com/guillaumemeyer/status/2087275734608007415](https://x.com/guillaumemeyer/status/2087275734608007415)
