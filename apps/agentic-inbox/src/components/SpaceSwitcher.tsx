import type { Space } from "../../shared/types.ts";
import { inQuietHours } from "../../shared/types.ts";

export function SpaceSwitcher({
  spaces,
  activeId,
  onChange,
}: {
  spaces: Space[];
  activeId: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="space-switcher" role="tablist" aria-label="Space">
      <button
        role="tab"
        aria-selected={activeId === null}
        className={`space-tab ${activeId === null ? "is-active" : ""}`}
        onClick={() => onChange(null)}
      >
        All
      </button>
      {spaces.map((s) => (
        <button
          key={s.id}
          role="tab"
          aria-selected={activeId === s.id}
          className={`space-tab ${activeId === s.id ? "is-active" : ""}`}
          style={{ "--tab-color": s.color } as React.CSSProperties}
          onClick={() => onChange(s.id)}
        >
          <span className="space-dot" />
          {s.name}
          {inQuietHours(s) && (
            <span className="space-quiet" title="Quiet hours — notifications muted">
              🌙
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SpaceBadge({ spaces, spaceId }: { spaces: Space[]; spaceId: string }) {
  const s = spaces.find((x) => x.id === spaceId);
  if (!s) return null;
  return (
    <span className="space-badge" style={{ color: s.color, borderColor: `${s.color}66` }}>
      {s.name}
    </span>
  );
}
