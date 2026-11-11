import type { DeskAction, DeskState } from "../engine/desk";
import type { AgentId } from "../engine/types";

export type DeskProps = {
  state: DeskState;
  dispatch: (action: DeskAction) => void;
};

export const TABS = [
  ["desk", "Desk"],
  ["scout", "Scout"],
  ["writer", "Writer"],
  ["studio", "Studio"],
  ["queue", "Queue"],
  ["analyst", "Analyst"],
  ["ops", "Ops"],
] as const;

export type TabId = (typeof TABS)[number][0];

export const AGENT_COLOR: Record<AgentId, string> = {
  manager: "#1c1915",
  scout: "#0f6b62",
  writer: "#9a4d12",
  designer: "#3f4d34",
  scheduler: "#1e3a5f",
  analyst: "#8a3a2b",
};

export function activeItem(state: DeskState) {
  return state.queue.find((item) => item.id === state.activeId) ?? state.queue.at(-1) ?? null;
}
