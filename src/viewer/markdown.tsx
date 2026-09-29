import type { ReactNode } from 'react';

// Emphasis markers must hug their text (no inner edge spaces), so "2 * 3" and a stray "*" stay literal.
const INLINE = /(`[^`]+`|\*\*(?=\S)[^*]*?\S\*\*|\*(?=[^\s*])[^*]*?[^\s*]\*|\*[^\s*]\*)/g;

function inline(text: string, keyPrefix = ''): ReactNode[] {
 const parts: ReactNode[] = [];
 let last = 0;
 for (const match of text.matchAll(INLINE)) {
  const index = match.index ?? 0;
  if (index > last) parts.push(text.slice(last, index));
  const token = match[0];
  const key = `${keyPrefix}${index}`;
  if (token.startsWith('`')) parts.push(<code key={`${key}-c`}>{token.slice(1, -1)}</code>);
  else if (token.startsWith('**')) parts.push(<strong key={`${key}-b`}>{inline(token.slice(2, -2), `${key}-b-`)}</strong>);
  else parts.push(<em key={`${key}-i`}>{inline(token.slice(1, -1), `${key}-i-`)}</em>);
  last = index + token.length;
 }
 if (last < text.length) parts.push(text.slice(last));
 return parts.length ? parts : [text];
}

export function Markdown({ source }: { source: string }) {
 const blocks: ReactNode[] = [];
 const lines = source.replace(/\r\n/g, '\n').split('\n');
 let paragraph: string[] = [];
 let list: string[] = [];

 const flushParagraph = () => {
  if (!paragraph.length) return;
  blocks.push(<p key={`p-${blocks.length}`}>{inline(paragraph.join(' '))}</p>);
  paragraph = [];
 };
 const flushList = () => {
  if (!list.length) return;
  blocks.push(<ul key={`ul-${blocks.length}`}>{list.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>);
  list = [];
 };

 for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) {
   flushParagraph();
   flushList();
   continue;
  }
  const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
  if (heading) {
   flushParagraph();
   flushList();
   const level = heading[1].length;
   const text = heading[2];
   if (level === 1) blocks.push(<h2 key={`h-${blocks.length}`}>{inline(text)}</h2>);
   else if (level === 2) blocks.push(<h3 key={`h-${blocks.length}`}>{inline(text)}</h3>);
   else blocks.push(<h4 key={`h-${blocks.length}`}>{inline(text)}</h4>);
   continue;
  }
  if (trimmed.startsWith('- ')) {
   flushParagraph();
   list.push(trimmed.slice(2));
   continue;
  }
  flushList();
  paragraph.push(trimmed);
 }
 flushParagraph();
 flushList();

 return <article className="markdown-doc">{blocks}</article>;
}
