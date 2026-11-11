import type { Slot } from "./types";
import { hashString } from "./text";

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const WEEK_DATES = [
  "2026-11-09",
  "2026-11-10",
  "2026-11-11",
  "2026-11-12",
  "2026-11-13",
  "2026-11-14",
  "2026-11-15",
] as const;

export function buildHeatmap(topic: string): number[][] {
  const bias = hashString(topic) % 5;
  const grid: number[][] = [];
  for (let day = 0; day < 7; day += 1) {
    const row: number[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const weekday = day < 5 ? 12 : 0;
      const morning = hour >= 8 && hour <= 10 ? 40 : 0;
      const late = hour >= 17 && hour <= 19 ? 28 : 0;
      const midweek = day === 1 || day === 3 ? 10 : 0;
      const nudge = (day + hour + bias) % 3;
      row.push(weekday + morning + late + midweek + nudge);
    }
    grid.push(row);
  }
  return grid;
}

export function suggestBestTimes(heatmap: readonly (readonly number[])[], count = 3): Slot[] {
  const slots: Slot[] = [];
  for (let day = 0; day < heatmap.length; day += 1) {
    const row = heatmap[day] ?? [];
    for (let hour = 0; hour < row.length; hour += 1) {
      slots.push({ day, hour, score: row[hour] ?? 0 });
    }
  }
  slots.sort((a, b) => b.score - a.score || a.day - b.day || a.hour - b.hour);
  return slots.slice(0, count);
}

export function slotId(slot: Slot): string {
  return `${slot.day}-${slot.hour}`;
}

export function formatSlot(slot: Slot): string {
  const label = DAY_LABELS[slot.day] ?? "Day";
  return `${label} ${String(slot.hour).padStart(2, "0")}:00`;
}

export function parseSlotId(id: string): Slot | null {
  const match = /^(\d)-(\d{1,2})$/.exec(id);
  if (!match) return null;
  const day = Number(match[1]);
  const hour = Number(match[2]);
  if (day > 6 || hour > 23) return null;
  return { day, hour, score: 0 };
}
