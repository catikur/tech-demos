import { useEffect, useState } from "react";
import type { Space } from "../../shared/types.ts";
import { api } from "../api/client.ts";

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
        {space.kind} space
      </div>
      <label className="form-row">
        Name
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label className="form-row form-row-inline">
        Color
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
          Quiet hours (mute notifications)
        </label>
        {quiet && (
          <div className="form-row form-row-inline">
            from
            <input type="number" min={0} max={23} value={quiet[0]} onChange={(e) => setForm({ ...form, quietHours: [Number(e.target.value), quiet[1]] })} />
            to
            <input type="number" min={0} max={23} value={quiet[1]} onChange={(e) => setForm({ ...form, quietHours: [quiet[0], Number(e.target.value)] })} />
            <span className="muted small">local time, overnight ranges allowed</span>
          </div>
        )}
      </div>
      <label className="form-row form-row-inline">
        Daily digest at
        <input type="number" min={0} max={23} value={form.digestHour} onChange={(e) => setForm({ ...form, digestHour: Number(e.target.value) })} />
        <span className="muted small">:00 local</span>
      </label>
      <label className="form-row">
        Agent tone
        <select value={form.agentTone} onChange={(e) => setForm({ ...form, agentTone: e.target.value as Space["agentTone"] })}>
          <option value="concise">Concise</option>
          <option value="warm">Warm</option>
          <option value="formal">Formal</option>
        </select>
      </label>
      <label className="form-row">
        Signature (appended to agent drafts)
        <textarea rows={2} value={form.signature} onChange={(e) => setForm({ ...form, signature: e.target.value })} />
      </label>
      <div className="composer-actions" style={{ marginTop: 4 }}>
        {state === "saved" && <span className="sent-note">✓ Saved</span>}
        {state === "error" && <span className="error-note">{error}</span>}
        <button className="btn btn-primary btn-small" onClick={() => void save()} disabled={state === "saving"}>
          Save rules
        </button>
      </div>
    </div>
  );
}
