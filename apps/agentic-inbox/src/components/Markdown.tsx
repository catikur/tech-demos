import type { ReactNode } from "react";

/** Tiny markdown renderer for agent/feature output: headings, bullets, numbered lists, bold, italics. */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let list: { type: "ul" | "ol"; items: ReactNode[] } | null = null;
  const flush = () => {
    if (!list) return;
    const key = `list-${out.length}`;
    out.push(list.type === "ul" ? <ul key={key}>{list.items}</ul> : <ol key={key}>{list.items}</ol>);
    list = null;
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^\s*[-•*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) {
      flush();
      const Tag = (`h${Math.min(h[1].length + 2, 5)}` as "h3" | "h4" | "h5");
      out.push(<Tag key={`h-${i}`}>{inline(h[2])}</Tag>);
    } else if (ul) {
      if (!list || list.type !== "ul") {
        flush();
        list = { type: "ul", items: [] };
      }
      list.items.push(<li key={`li-${i}`}>{inline(ul[1])}</li>);
    } else if (ol) {
      if (!list || list.type !== "ol") {
        flush();
        list = { type: "ol", items: [] };
      }
      list.items.push(<li key={`li-${i}`}>{inline(ol[1])}</li>);
    } else if (line.trim() === "") {
      flush();
    } else {
      flush();
      out.push(<p key={`p-${i}`}>{inline(line)}</p>);
    }
  });
  flush();
  return <div className="md">{out}</div>;
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) parts.push(<code key={k++}>{tok.slice(1, -1)}</code>);
    else parts.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
