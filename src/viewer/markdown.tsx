import type { ReactNode } from 'react';

function inline(text: string): ReactNode[] {
 const parts: ReactNode[] = [];
 const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
 let last = 0;
 for (const match of text.matchAll(pattern)) {
  const index = match.index ?? 0;
  if (index > last) parts.push(text.slice(last, index));
  const token = match[0];
  if (token.startsWith('**')) parts.push(<strong key={`${index}-b`}>{token.slice(2, -2)}</strong>);
  else parts.push(<code key={`${index}-c`}>{token.slice(1, -1)}</code>);
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
