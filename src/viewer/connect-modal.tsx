import { useState } from 'react';
import { X } from 'lucide-react';
import { t, type MessageKey } from '../i18n';
import { snapshot, update } from './store';

function quote(folder: string) { return `"${folder.replace(/(["\\$`])/g, '\\$1')}"`; }

export function connectCommands(folder: string) {
  const quoted = quote(folder);
  const json = JSON.stringify({ mcpServers: { draft: { command: 'npx', args: ['-y', 'draft-viewer', 'mcp', folder] } } }, null, 2);
  return {
    claude: `claude mcp add --transport stdio draft -- npx -y draft-viewer mcp ${quoted}`,
    cursor: json,
    codex: `codex mcp add draft -- npx -y draft-viewer mcp ${quoted}`,
    manual: `npx -y draft-viewer mcp ${quoted}\n\n${json}`,
  };
}

const TABS = [
  { id: 'claude', label: 'connect.claude' },
  { id: 'cursor', label: 'connect.cursor' },
  { id: 'codex', label: 'connect.codex' },
  { id: 'manual', label: 'connect.manual' },
] as const;

export function ConnectModal() {
  const folder = snapshot().workspace?.folder;
  const open = snapshot().connectOpen;
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('claude');
  const [copied, setCopied] = useState(false);
  if (!open || !folder) return null;
  const command = connectCommands(folder)[tab];
  const copy = () => { void navigator.clipboard?.writeText(command).then(() => setCopied(true)).catch(() => setCopied(false)); };
  return <div className="scrim" onClick={() => update({ connectOpen: false })}><section role="dialog" aria-modal="true" aria-label={t('connect.title')} className="info-sheet connect-sheet" onClick={event => event.stopPropagation()}>
    <button className="close" aria-label={t('connect.close')} onClick={() => update({ connectOpen: false })}><X /></button>
    <h1>{t('connect.title')}</h1>
    <div className="connect-tabs" role="tablist" aria-label={t('connect.title')}>{TABS.map(item => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => { setTab(item.id); setCopied(false); }}>{t(item.label as MessageKey)}</button>)}</div>
    <div role="tabpanel"><pre className="connect-command">{command}</pre><button type="button" className="primary" onClick={copy}>{copied ? t('connect.copied') : t('connect.copy')}</button></div>
  </section></div>;
}
