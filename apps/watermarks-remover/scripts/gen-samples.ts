/**
 * Generates the demo sample images in public/samples/.
 * Each sample is a real PNG with vendor-class provenance metadata embedded
 * the same way real tools do it (tEXt / iTXt XMP / eXIf / caBX JUMBF).
 *
 *   bun run gen:samples
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caBX, eXIf, idat, ihdr, iTXtXmp, png, tEXt } from "./png-write";

const W = 432;
const H = 288;
const OUT = join(import.meta.dir, "..", "public", "samples");

type RGB = [number, number, number];
const lerp = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

function art(top: RGB, bottom: RGB, accent: RGB) {
  return (x: number, y: number): RGB => {
    let c = lerp(top, bottom, y / H);
    // a soft "sun" disc
    const dx = x - W * 0.72;
    const dy = y - H * 0.3;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 46) c = accent;
    else if (d < 52) c = lerp(accent, c, (d - 46) / 6);
    // rolling hills
    const hill = H * 0.72 + Math.sin(x / 36) * 16;
    if (y > hill) c = lerp(c, [16, 20, 30], 0.55);
    return c;
  };
}

const xmp = (creatorTool: string, agent: string, extra = "") => `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmp:CreatorTool="${creatorTool}">
   <dc:creator><rdf:Seq><rdf:li>${agent}</rdf:li></rdf:Seq></dc:creator>
   ${extra}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

mkdirSync(OUT, { recursive: true });

const samples: Array<[string, Uint8Array]> = [
  [
    "claude-watermarked.png",
    png(
      ihdr(W, H),
      tEXt("Software", "Claude by Anthropic"),
      tEXt("Comment", "Generated with Claude (Anthropic). Provenance surface for demo purposes."),
      iTXtXmp(xmp("Claude", "Anthropic Claude", `<xmp:Label>anthropic.provenance</xmp:Label>`)),
      caBX("Anthropic Claude/1.0 c2pa-rs/0.32", ["c2pa.actions:created", "com.anthropic.claude:generated"]),
      idat(W, H, art([222, 120, 88], [40, 24, 32], [255, 214, 170])),
    ),
  ],
  [
    "openai-watermarked.png",
    png(
      ihdr(W, H),
      eXIf("OpenAI DALL-E 3", "ChatGPT / GPT-4o image generation"),
      iTXtXmp(xmp("OpenAI ChatGPT", "OpenAI", `<xmp:Label>openai.provenance</xmp:Label>`)),
      caBX("ChatGPT GPT-4o OpenAI-API c2pa-rs/0.32", ["c2pa.actions:created", "com.openai.dalle:generated"]),
      idat(W, H, art([100, 168, 150], [18, 34, 40], [214, 255, 236])),
    ),
  ],
  [
    "gemini-watermarked.png",
    png(
      ihdr(W, H),
      tEXt("Software", "Made with Google AI"),
      eXIf("Google Gemini (Imagen 3)", "Google LLC"),
      iTXtXmp(xmp("Google Gemini", "Google", `<xmp:Label>synthid.watermark.present</xmp:Label>`)),
      caBX("Google Gemini Imagen/3.0 SynthID", ["c2pa.actions:created", "com.google.synthid:marked"]),
      idat(W, H, art([120, 156, 240], [22, 22, 48], [200, 220, 255])),
    ),
  ],
];

for (const [name, bytes] of samples) {
  writeFileSync(join(OUT, name), bytes);
  console.log(`wrote ${name} (${bytes.length} bytes)`);
}
