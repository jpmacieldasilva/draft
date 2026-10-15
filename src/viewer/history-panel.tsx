import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../i18n';
import { mutate, snapshot, update } from './store';

interface Commit { sha: string; short: string; date: string; subject: string }

export function HistoryPanel() {
  const frameId = snapshot().historyFrame;
  const frame = snapshot().workspace?.experiment.frames.find(item => item.id === frameId);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [available, setAvailable] = useState(true);
  const [selected, setSelected] = useState('');
  const [against, setAgainst] = useState('');
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!frameId) return;
    let cancel = false;
    setLoading(true);
    void fetch(`./api/frames/${encodeURIComponent(frameId)}/history`).then(async response => {
      const body = await response.json() as { available?: boolean; commits?: Commit[]; error?: string };
      if (!response.ok) throw new Error(body.error || t('history.empty'));
      return body;
    }).then(body => {
      if (cancel) return;
      setAvailable(body.available !== false);
      setCommits(body.commits ?? []);
      setSelected(body.commits?.[0]?.sha ?? '');
      setAgainst('');
      setLoading(false);
    }).catch(() => { if (!cancel) { setAvailable(false); setCommits([]); setLoading(false); } });
    return () => { cancel = true; };
  }, [frameId]);
  useEffect(() => {
    if (!frameId || !selected) { setDiff(''); return; }
    let cancel = false;
    const query = against ? `?against=${encodeURIComponent(against)}` : '';
    void fetch(`./api/frames/${encodeURIComponent(frameId)}/history/${encodeURIComponent(selected)}${query}`).then(async response => {
      const body = await response.json() as { diff?: string };
      if (!cancel) setDiff(body.diff ?? '');
    }).catch(() => { if (!cancel) setDiff(''); });
    return () => { cancel = true; };
  }, [frameId, selected, against]);
  if (!frameId || !frame) return null;
  const close = () => update({ historyFrame: undefined });
  return <div className="scrim" onClick={close}><section role="dialog" aria-modal="true" aria-label={t('history.title')} className="info-sheet history-sheet" onClick={event => event.stopPropagation()}>
    <button className="close" aria-label={t('history.close')} onClick={close}><X /></button>
    <p className="muted">{frame.title}</p>
    <h1>{t('history.title')}</h1>
    {loading && <p role="status">{t('history.loading')}</p>}
    {!loading && !available && <p role="status">{t('history.unavailable')}</p>}
    {!loading && available && !commits.length && <p>{t('history.empty')}</p>}
    {!!commits.length && <div className="history-layout">
      <ul className="history-list">{commits.map(commit => <li key={commit.sha}><button type="button" aria-pressed={selected === commit.sha} onClick={() => setSelected(commit.sha)}><strong>{commit.subject}</strong><span>{commit.short} · {commit.date.slice(0, 10)}</span></button>
        {selected === commit.sha && !snapshot().workspace?.readOnly && <button type="button" className="primary" onClick={() => void mutate(`frames/${encodeURIComponent(frameId)}/history/${encodeURIComponent(commit.sha)}/restore`, {}).then(() => { if (!snapshot().error) close(); })}>{t('history.restore')}</button>}
      </li>)}</ul>
      <div className="history-diff"><label>{t('history.against')}<select value={against} onChange={event => setAgainst(event.currentTarget.value)}><option value="">{t('history.diff')}</option>{commits.filter(commit => commit.sha !== selected).map(commit => <option key={commit.sha} value={commit.sha}>{commit.subject}</option>)}</select></label><pre>{diff}</pre></div>
    </div>}
  </section></div>;
}
