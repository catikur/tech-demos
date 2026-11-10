import type { Pack, Run } from "../engine/sim.ts";

export function drawCard(pack: Pack, run: Run, shot: string): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve("");
  const origin = pack.origins.find((item) => item.id === run.originId);
  const lifestyle = pack.lifestyles.find((item) => item.id === run.lifestyleId);
  const hue = origin?.hue ?? 28;
  const hits = run.years.filter((year) => year.hit).length;

  ctx.fillStyle = "#14110e";
  ctx.fillRect(0, 0, 1080, 1440);
  ctx.fillStyle = `hsl(${hue} 62% 52%)`;
  ctx.fillRect(0, 0, 18, 1440);

  const paint = (image: CanvasImageSource | null) => {
    if (image) {
      ctx.save();
      roundRect(ctx, 70, 64, 940, 460, 28);
      ctx.clip();
      ctx.drawImage(image, 70, 64, 940, 460);
      ctx.restore();
    } else {
      ctx.fillStyle = "#1c1814";
      roundRect(ctx, 70, 64, 940, 200, 28);
      ctx.fill();
    }

    const top = image ? 570 : 300;
    ctx.fillStyle = `hsl(${hue} 70% 62%)`;
    ctx.font = "600 22px Georgia, serif";
    ctx.fillText(pack.role.toUpperCase(), 72, top);
    ctx.fillStyle = "#f4efe6";
    ctx.font = "600 78px Georgia, serif";
    ctx.fillText(run.name, 72, top + 86);
    ctx.fillStyle = "#b3a89a";
    ctx.font = "28px Georgia, serif";
    ctx.fillText(`${origin?.name ?? ""}  ·  ${lifestyle?.name ?? ""}`, 72, top + 136);
    wrap(ctx, run.cause, 72, top + 190, 930, 36, "#f4efe6", "32px Georgia, serif");

    ctx.fillStyle = "#e2b15a";
    ctx.font = "600 26px Georgia, serif";
    ctx.fillText(`${run.years.length} yıl   ·   ${hits} tuttu   ·   ${run.years.length - hits} kaçtı`, 72, top + 310);

    let y = top + 370;
    for (const stat of pack.stats) {
      const value = run.stats[stat.key] ?? 0;
      ctx.fillStyle = "#b3a89a";
      ctx.font = "22px sans-serif";
      ctx.fillText(stat.label, 72, y);
      ctx.fillStyle = "#2a241e";
      roundRect(ctx, 250, y - 18, 700, 14, 7);
      ctx.fill();
      ctx.fillStyle = `hsl(${hue} 65% 55%)`;
      roundRect(ctx, 250, y - 18, Math.max(8, 700 * (value / 100)), 14, 7);
      ctx.fill();
      ctx.fillStyle = "#f4efe6";
      ctx.fillText(String(value), 970, y);
      y += 42;
    }

    y += 20;
    for (const year of run.years) {
      const beat = pack.beats.find((item) => item.id === year.beatId);
      ctx.fillStyle = year.hit ? "#d7e38a" : "#e7a08c";
      ctx.font = "600 22px sans-serif";
      ctx.fillText(year.hit ? "TUTTU" : "KAÇTI", 72, y);
      ctx.fillStyle = "#f4efe6";
      ctx.fillText(`${beat?.years ?? ""}  ${beat?.check.title ?? ""}`, 190, y);
      ctx.fillStyle = "#b3a89a";
      ctx.fillText(`%${Math.round(year.p * 100)}`, 900, y);
      y += 36;
      if (y > 1360) break;
    }

    ctx.fillStyle = "#6d6258";
    ctx.font = "20px sans-serif";
    ctx.fillText("Life Loom  ·  olasılıkla kurulan bir hayat", 72, 1390);
    return canvas.toDataURL("image/png");
  };

  if (!shot) return Promise.resolve(paint(null));
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(paint(image));
    image.onerror = () => resolve(paint(null));
    image.src = shot;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  max: number,
  line: number,
  color: string,
  font: string,
) {
  ctx.fillStyle = color;
  ctx.font = font;
  const words = text.split(" ");
  let row = "";
  let cursor = y;
  for (const word of words) {
    const trial = row ? `${row} ${word}` : word;
    if (ctx.measureText(trial).width > max) {
      ctx.fillText(row, x, cursor);
      row = word;
      cursor += line;
    } else {
      row = trial;
    }
  }
  if (row) ctx.fillText(row, x, cursor);
}
