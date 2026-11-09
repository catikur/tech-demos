import type { ReactNode } from "react";
import { extractWikilinks } from "./wikilink.ts";

type Props = {
  text: string;
  onOpen?: (target: string) => void;
};

export function MarkdownView({ text, onOpen }: Props) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="md">
      {blocks.map((block, index) => (
        <Block key={index} text={block} onOpen={onOpen} />
      ))}
    </div>
  );
}

function Block({ text, onOpen }: Props) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("# ")) return <h1>{inline(trimmed.slice(2), onOpen)}</h1>;
  if (trimmed.startsWith("## ")) return <h2>{inline(trimmed.slice(3), onOpen)}</h2>;
  if (trimmed.startsWith("### ")) return <h3>{inline(trimmed.slice(4), onOpen)}</h3>;
  if (trimmed.split("\n").every((line) => line.trim().startsWith("- "))) {
    return (
      <ul>
        {trimmed.split("\n").map((line, index) => (
          <li key={index}>{inline(line.replace(/^\s*-\s+/, ""), onOpen)}</li>
        ))}
      </ul>
    );
  }
  return <p>{inline(trimmed, onOpen)}</p>;
}

function inline(text: string, onOpen?: (target: string) => void): ReactNode[] {
  const links = extractWikilinks(text);
  if (links.length === 0) return [decorate(text)];
  const parts: ReactNode[] = [];
  let cursor = 0;
  links.forEach((link, index) => {
    if (link.start > cursor) parts.push(decorate(text.slice(cursor, link.start)));
    parts.push(
      <button
        key={`w-${index}-${link.start}`}
        type="button"
        className="wikilink"
        onClick={() => onOpen?.(link.target)}
      >
        {link.alias ?? link.target}
      </button>,
    );
    cursor = link.end;
  });
  if (cursor < text.length) parts.push(decorate(text.slice(cursor)));
  return parts;
}

function decorate(text: string): ReactNode {
  const chunks: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null = re.exec(text);
  let i = 0;
  while (match) {
    if (match.index > last) chunks.push(text.slice(last, match.index));
    if (match[1]) chunks.push(<strong key={`b${i}`}>{match[1]}</strong>);
    else chunks.push(<code key={`c${i}`}>{match[2]}</code>);
    last = match.index + match[0].length;
    i += 1;
    match = re.exec(text);
  }
  if (last < text.length) chunks.push(text.slice(last));
  return chunks.length === 1 ? chunks[0] : chunks;
}
