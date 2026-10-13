import { useState } from "react";
import type { MailTag } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { t } from "../i18n.ts";
import { useData } from "../state.ts";

export function MailTagsPanel({ spaceId }: { spaceId: string | null }) {
  const tags = useData<MailTag[]>(() => api.get("/api/mail-tags"), [], () => false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const list = tags.data ?? [];

  const save = async (next: MailTag[]) => {
    await api.patch("/api/mail-tags", { tags: next });
    tags.reload();
  };

  return (
    <div className="form-grid">
      <div className="form-card">
        <p className="muted small">{t("tags.hint")}</p>
        {list.map((tag) => (
          <div key={tag.id} className="briefing-item is-static">
            <strong>{tag.name}</strong>
            <span className="muted small">{tag.id}{tag.system ? ` · ${t("tags.system")}` : ""}</span>
            <input
              defaultValue={tag.description}
              key={`${tag.id}-${tag.description}`}
              onBlur={(e) => {
                const description = e.target.value;
                if (description !== tag.description) void save(list.map((item) => (item.id === tag.id ? { ...item, description } : item)));
              }}
            />
            {!tag.system && (
              <div className="row-actions">
                <button className="btn btn-small" type="button" onClick={() => void save(list.map((item) => (item.id === tag.id ? { ...item, enabled: !item.enabled } : item)))}>
                  {tag.enabled ? t("tags.disable") : t("tags.enable")}
                </button>
                <button className="btn btn-small btn-ghost" type="button" onClick={() => void save(list.filter((item) => item.id !== tag.id))}>
                  {t("tags.delete")}
                </button>
              </div>
            )}
          </div>
        ))}
        <label className="form-row">
          {t("tags.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="form-row">
          {t("tags.description")}
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="row-actions">
          <button
            className="btn btn-small btn-primary"
            type="button"
            disabled={name.trim().length < 2}
            onClick={() => {
              void save([...list, { id: name, name: name.trim(), description: description.trim(), enabled: true, system: false }]).then(() => {
                setName("");
                setDescription("");
              });
            }}
          >
            {t("tags.add")}
          </button>
          <button
            className="btn btn-small"
            type="button"
            onClick={() => {
              void api.post<{ queued: number }>(`/api/mail-tags/scan?${spaceQuery(spaceId)}`).then((r) => setNote(t("tags.queued", { n: r.queued })));
            }}
          >
            {t("tags.scan")}
          </button>
        </div>
        {note && <p className="muted small">{note}</p>}
      </div>
    </div>
  );
}
