import { useCallback, useEffect, useRef, useState } from "react";
import type { AppStatus } from "../shared/types.ts";
import { api, subscribe, type ServerEvent } from "./api/client.ts";
import { dateLocale, t } from "./i18n.ts";

/**
 * Minimal data hook: fetch on mount / when deps change, and refetch when the
 * server broadcasts a change that matches `refreshOn`.
 */
export function useData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  refreshOn: (ev: ServerEvent) => boolean = () => true,
): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcherRef
      .current()
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => subscribe((ev) => refreshOn(ev) && setTick((t) => t + 1)), [refreshOn]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

export function useStatus() {
  return useData<AppStatus>(() => api.get("/api/status"), [], (ev) => ev.type !== "data" || ev.entity === "accounts");
}

const SPACE_KEY = "agentic-inbox.space";

/** Active space id; `null` means "All spaces". Persisted across reloads. */
export function useActiveSpace(): [string | null, (id: string | null) => void] {
  const [space, setSpaceState] = useState<string | null>(() => {
    const raw = localStorage.getItem(SPACE_KEY);
    return raw === null || raw === "all" ? null : raw;
  });
  const setSpace = useCallback((id: string | null) => {
    localStorage.setItem(SPACE_KEY, id ?? "all");
    setSpaceState(id);
  }, []);
  return [space, setSpace];
}

export function fmtTime(at: number): string {
  return new Date(at).toLocaleString(dateLocale, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(at: number): string {
  return new Date(at).toLocaleString(dateLocale, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ago(at: number): string {
  const mins = Math.max(1, Math.round((Date.now() - at) / 60_000));
  if (mins < 60) return t("time.agoMinutes", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 48) return t("time.agoHours", { n: hours });
  return t("time.agoDays", { n: Math.round(hours / 24) });
}

export function untilLabel(at: number): string {
  const diff = at - Date.now();
  if (diff < 0) return t("time.past");
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return t("time.inMinutes", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 36) return t("time.inHours", { n: hours });
  return t("time.inDays", { n: Math.round(hours / 24) });
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export const CATEGORY_COLORS: Record<string, string> = {
  newsletter: "#8b7cf6",
  support: "#f97316",
  invite: "#22c55e",
  billing: "#eab308",
  recruiting: "#38bdf8",
  personal: "#f472b6",
  security: "#ef4444",
  project: "#2dd4bf",
  other: "#94a3b8",
};
