import { useEffect, useState } from "react";
import type { Space } from "../../shared/types.ts";
import { api } from "../api/client.ts";
import { t } from "../i18n.ts";

/** Per-space rules: quiet hours, digest time, agent tone and signature. */
export function SpaceRules({ space, onSaved }: { space: Space; onSaved: () => void }) {
  const [form, setForm] = useState<Space>(space);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setForm(space), [space]);

  const quiet = form.quietHours ?? null;
  const save = async () => {
    setState("saving");
    try {
      await api.patch(`/api/spaces/${space.id}`, {
        name: form.name,
        color: form.color,
        quietHours: form.quietHours,
        digestHour: form.digestHour,
        agentTone: form.agentTone,
        signature: form.signature,
      });
      setState("saved");
      onSaved();
      setTimeout(() => setState("idle"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  return (
    <div className="form-card" style={{ borderColor: `${form.color}66` }}>
      <div className="connect-title" style={{ color: form.color }}>
        {t(`space.kind.${space.kind}`)}
      </div>
      <label className="form-row">
        {t("rules.name")}
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label className="form-row form-row-inline">
        {t("rules.color")}
        <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ width: 48, padding: 2 }} />
        <code>{form.color}</code>
      </label>
      <div className="form-row">
        <label className="form-row form-row-inline" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={quiet !== null}
            onChange={(e) => setForm({ ...form, quietHours: e.target.checked ? [19, 8] : null })}
            style={{ width: "auto" }}
          />
          {t("rules.quiet")}
        </label>
        {quiet && (
          <div className="form-row form-row-inline">
            {t("rules.from")}
            <input type="number" min={0} max={23} value={quiet[0]} onChange={(e) => setForm({ ...form, quietHours: [Number(e.target.value), quiet[1]] })} />
            {t("rules.to")}
            <input type="number" min={0} max={23} value={quiet[1]} onChange={(e) => setForm({ ...form, quietHours: [quiet[0], Number(e.target.value)] })} />
            <span className="muted small">{t("rules.quietHint")}</span>
          </div>
        )}
      </div>
      <label className="form-row form-row-inline">
        {t("rules.digest")}
        <input type="number" min={0} max={23} value={form.digestHour} onChange={(e) => setForm({ ...form, digestHour: Number(e.target.value) })} />
        <span className="muted small">{t("rules.digestHint")}</span>
      </label>
      <label className="form-row">
        {t("rules.tone")}
        <select value={form.agentTone} onChange={(e) => setForm({ ...form, agentTone: e.target.value as Space["agentTone"] })}>
          <option value="concise">{t("rules.tone.concise")}</option>
          <option value="warm">{t("rules.tone.warm")}</option>
          <option value="formal">{t("rules.tone.formal")}</option>
        </select>
      </label>
      <label className="form-row">
        {t("rules.signature")}
        <textarea rows={2} value={form.signature} onChange={(e) => setForm({ ...form, signature: e.target.value })} />
      </label>
      <div className="composer-actions" style={{ marginTop: 4 }}>
        {state === "saved" && <span className="sent-note">✓ {t("common.saved")}</span>}
        {state === "error" && <span className="error-note">{error}</span>}
        <button className="btn btn-primary btn-small" onClick={() => void save()} disabled={state === "saving"}>
          {t("rules.save")}
        </button>
      </div>
    </div>
  );
}
