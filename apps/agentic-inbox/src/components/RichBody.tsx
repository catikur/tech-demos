import { displayHtml } from "../../shared/html.ts";

/** Sanitized HTML for mail, chat and calendar bodies (Outlook/Teams/Gmail). */
export function RichBody({ text, html, className }: { text: string; html?: string | null; className?: string }) {
  const inner = displayHtml(html, text);
  if (!inner) return null;
  return <div className={`rich-body ${className ?? ""}`.trim()} dangerouslySetInnerHTML={{ __html: inner }} />;
}
