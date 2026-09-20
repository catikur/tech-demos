import { t } from "../i18n.ts";
import { Icon } from "./Icon.tsx";

export function BackButton({ onBack }: { onBack?: () => void }) {
  if (!onBack) return null;
  return (
    <button type="button" className="back-btn" onClick={onBack} aria-label={t("shell.back")}>
      <Icon name="back" />
    </button>
  );
}
