import { Fragment } from "react";

// A small, safe markdown renderer for the integrative reading — headings,
// paragraphs, bold, italics, and simple lists, rendered as React elements (no
// dangerouslySetInnerHTML, so no injection surface). Crimson Pro throughout.

function renderInline(text: string, keyBase: string) {
  // **bold** and *italic* only.
  const parts: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(<Fragment key={`${keyBase}-t${i}`}>{text.slice(last, m.index)}</Fragment>);
    if (m[2] != null) parts.push(<strong key={`${keyBase}-b${i}`} className="font-semibold text-ink-strong">{m[2]}</strong>);
    else parts.push(<em key={`${keyBase}-i${i}`}>{m[3]}</em>);
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) parts.push(<Fragment key={`${keyBase}-t${i}`}>{text.slice(last)}</Fragment>);
  return parts;
}

export function ReadingProse({ content, className = "" }: { content: string; className?: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let key = 0;

  function flushList() {
    if (listBuffer.length === 0) return;
    const items = [...listBuffer];
    listBuffer = [];
    blocks.push(
      <ul key={`ul-${key++}`} className="flex list-disc flex-col gap-2 pl-6">
        {items.map((it, i) => (
          <li key={i} className="leading-relaxed">
            {renderInline(it, `li-${key}-${i}`)}
          </li>
        ))}
      </ul>,
    );
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) {
      listBuffer.push(line.replace(/^\s*[-*]\s+/, ""));
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    if (/^###\s+/.test(line)) {
      blocks.push(
        <h4 key={`h-${key++}`} className="mt-4 font-headline text-lg font-semibold text-wine">
          {line.replace(/^###\s+/, "")}
        </h4>,
      );
    } else if (/^##\s+/.test(line)) {
      blocks.push(
        <h3 key={`h-${key++}`} className="mt-8 font-headline text-2xl font-medium text-wine first:mt-0">
          {line.replace(/^##\s+/, "")}
        </h3>,
      );
    } else if (/^#\s+/.test(line)) {
      blocks.push(
        <h2 key={`h-${key++}`} className="mt-8 font-headline text-3xl font-medium text-wine first:mt-0">
          {line.replace(/^#\s+/, "")}
        </h2>,
      );
    } else {
      blocks.push(
        <p key={`p-${key++}`} className="font-headline text-lg leading-relaxed text-ink">
          {renderInline(line, `p-${key}`)}
        </p>,
      );
    }
  }
  flushList();

  return <div className={`flex flex-col gap-3 ${className}`}>{blocks}</div>;
}
