import { useState } from "react";
import type { Space, Thread, ThreadSummary } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { useData } from "../state.ts";
import { InboxList } from "../components/InboxList.tsx";
import { ThreadCrashGuard, ThreadView } from "../components/ThreadView.tsx";

export function InboxView({
  spaceId,
  spaces,
  selectedId,
  onSelect,
  prefill,
  onPrefillConsumed,
}: {
  spaceId: string | null;
  spaces: Space[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  prefill: { threadId: string; body: string } | null;
  onPrefillConsumed: () => void;
}) {
  const [query, setQuery] = useState("");
  const list = useData<ThreadSummary[]>(
    () => api.get(`/api/threads?${spaceQuery(spaceId)}${query ? `&q=${encodeURIComponent(query)}` : ""}`),
    [spaceId, query],
    (ev) => ev.type === "sync" || (ev.type === "data" && ev.entity === "threads"),
  );
  const thread = useData<Thread | null>(
    () => (selectedId ? api.get<Thread>(`/api/threads/${selectedId}`) : Promise.resolve(null)),
    [selectedId],
    (ev) => ev.type === "data" && ev.entity === "threads",
  );

  const visible = list.data ?? [];
  const selected = thread.data && thread.data.id === selectedId ? thread.data : null;
  const unread = visible.filter((t) => t.unread).length;

  const select = async (id: string) => {
    onSelect(id);
    const t = visible.find((x) => x.id === id);
    if (t?.unread) {
      try {
        await api.post(`/api/threads/${id}/read`, {});
        list.reload();
      } catch {
        /* mark-read is best-effort; opening the thread still works */
      }
    }
  };

  return (
    <div className={`split split-3 ${selectedId ? "has-selection" : ""}`}>
      <InboxList
        threads={visible}
        spaces={spaces}
        showSpace={spaceId === null}
        selectedId={selectedId}
        unreadCount={unread}
        query={query}
        onQuery={setQuery}
        onSelect={select}
        loading={list.loading && !list.data}
      />
      <ThreadCrashGuard resetKey={selectedId}>
        <ThreadView
          thread={selected}
          loading={!!selectedId && thread.loading && !selected}
          error={selectedId ? thread.error : null}
          onBack={() => onSelect(null)}
          prefill={prefill && prefill.threadId === selectedId ? prefill.body : null}
          onPrefillConsumed={onPrefillConsumed}
          onSend={async (threadId, body) => {
            await api.post(`/api/threads/${threadId}/reply`, { body });
            thread.reload();
            list.reload();
          }}
        />
      </ThreadCrashGuard>
    </div>
  );
}
