import { useState } from "react";
import type { Notification, Space } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { t } from "../i18n.ts";
import { ago, useData } from "../state.ts";
import { SpaceBadge } from "./SpaceSwitcher.tsx";

const KIND_ICON: Record<Notification["kind"], string> = {
  brief: "◉",
  digest: "▤",
  commitment: "✓",
  radar: "◎",
  sync: "⟳",
  info: "ℹ",
};

/** Phase 6 — in-app notification center fed by the scheduler (briefs, digests, reminders). */
export function NotificationBell({ spaceId, spaces, onOpenLink }: { spaceId: string | null; spaces: Space[]; onOpenLink: (link: string) => void }) {
  const [open, setOpen] = useState(false);
  const list = useData<Notification[]>(
    () => api.get(`/api/notifications?${spaceQuery(spaceId)}`),
    [spaceId],
    (ev) => ev.type === "notification" || (ev.type === "data" && ev.entity === "notifications"),
  );
  const items = list.data ?? [];
  const unread = items.filter((n) => !n.read).length;

  const openItem = async (n: Notification) => {
    if (!n.read) {
      await api.post(`/api/notifications/read`, { id: n.id });
      list.reload();
    }
    setOpen(false);
    if (n.link) onOpenLink(n.link);
  };

  return (
    <div className="bell-wrap">
      <button className={`icon-btn ${unread ? "has-unread" : ""}`} title={t("notif.title")} onClick={() => setOpen((o) => !o)}>
        🔔{unread > 0 && <span className="bell-count">{unread}</span>}
      </button>
      {open && (
        <div className="drawer">
          <div className="drawer-head">
            <strong>{t("notif.title")}</strong>
            <button
              className="link-btn"
              onClick={async () => {
                await api.post(`/api/notifications/read?${spaceQuery(spaceId)}`, {});
                list.reload();
              }}
            >
              {t("notif.markAll")}
            </button>
          </div>
          <div className="drawer-body">
            {items.length === 0 && <div className="list-empty">{t("notif.empty")}</div>}
            {items.map((n) => (
              <button key={n.id} className={`notif ${n.read ? "" : "is-unread"}`} onClick={() => void openItem(n)}>
                <span className="notif-icon">{KIND_ICON[n.kind]}</span>
                <span className="notif-main">
                  <span className="notif-title">{n.title}</span>
                  <span className="notif-body">{n.body}</span>
                  <span className="notif-meta">
                    {t("time.agoSuffix", { rel: ago(n.createdAt) })}
                    {n.spaceId && spaceId === null && <SpaceBadge spaces={spaces} spaceId={n.spaceId} />}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
