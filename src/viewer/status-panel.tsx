import { type FormEvent } from 'react';
import { X } from 'lucide-react';
import { frameActivity, type Frame, type FrameActivity, type Workspace } from '../protocol';
import { t } from '../i18n';
import { mutate, snapshot, update } from './store';

const GROUPS: Array<{ activity: FrameActivity; key: 'status.working' | 'status.needsYou' | 'status.ready' }> = [
  { activity: 'needs-you', key: 'status.needsYou' },
  { activity: 'working', key: 'status.working' },
  { activity: 'ready', key: 'status.ready' },
];

function answerQuestion(event: FormEvent<HTMLFormElement>, frameId: string, questionId: string) {
  event.preventDefault();
  const answer = new FormData(event.currentTarget).get('answer');
  if (typeof answer !== 'string' || !answer.trim()) return;
  void mutate(`frames/${encodeURIComponent(frameId)}/questions/${encodeURIComponent(questionId)}`, { answer: answer.trim() });
}

function FrameDecisions({ frame, workspace }: { frame: Frame; workspace: Workspace }) {
  const summary = workspace.summaries?.find(item => item.frameId === frame.id);
  const questions = (workspace.questions ?? []).filter(item => item.frameId === frame.id && item.status === 'open');
  const comments = workspace.feedback.filter(item => item.frameId === frame.id && item.status === 'open');
  return <div className="status-frame">
    <strong>{frame.title}</strong>
    {questions.map(question => <form key={question.id} className="status-question" onSubmit={event => answerQuestion(event, frame.id, question.id)}>
      <span className="muted">{t('status.question')}</span>
      <p>{question.prompt}</p>
      <label>{t('status.answer')}<textarea name="answer" required maxLength={4000} placeholder={t('status.answerPlaceholder')} /></label>
      <button className="primary" type="submit" disabled={snapshot().busy}>{t('status.sendAnswer')}</button>
    </form>)}
    {comments.map(comment => <button key={comment.id} className="status-comment" onClick={() => update({ comments: true, selected: frame.id, feedback: comment.id, inspector: false })}><span className="muted">{t('status.comment')}</span>{comment.message}</button>)}
    {summary && <div className="status-summary"><span className="muted">{t('status.summary')}</span><p>{summary.text}</p>
      {!!summary.assumptions.length && <ul className="assumptions">{summary.assumptions.map(assumption => <li key={assumption.id}><p>{assumption.text}</p><span className={`assumption-${assumption.status}`}>{assumption.status === 'pending' ? t('status.assumptions') : assumption.status === 'accepted' ? t('status.accept') : t('status.reject')}</span>
        {assumption.status === 'pending' && !workspace.readOnly && <span className="assumption-actions"><button type="button" onClick={() => void mutate(`frames/${encodeURIComponent(frame.id)}/assumptions/${encodeURIComponent(assumption.id)}`, { status: 'accepted' })}>{t('status.accept')}</button><button type="button" onClick={() => void mutate(`frames/${encodeURIComponent(frame.id)}/assumptions/${encodeURIComponent(assumption.id)}`, { status: 'rejected' })}>{t('status.reject')}</button></span>}
      </li>)}</ul>}
    </div>}
  </div>;
}

export function StatusPanel() {
  const workspace = snapshot().workspace;
  if (!snapshot().statusOpen || !workspace) return null;
  const grouped = GROUPS.map(group => ({ ...group, frames: workspace.experiment.frames.filter(frame => frameActivity(frame.id, workspace) === group.activity) }));
  const filters = workspace.experiment.frames.filter(frame => frame.state);
  return <aside className="side-panel status-panel" aria-label={t('status.title')}>
    <header><h2>{t('status.title')}</h2><button aria-label={t('status.close')} onClick={() => update({ statusOpen: false })}><X /></button></header>
    {!!filters.length && <section className="status-group" aria-label={t('meta.state')}>
      <h3>{t('meta.state')}</h3>
      {filters.map(frame => <div key={frame.id} className="status-filter"><strong>{frame.title}</strong><span>{frame.state}</span></div>)}
    </section>}
    {!grouped.some(group => group.frames.length) && !filters.length && <p className="empty-copy">{t('status.empty')}</p>}
    {grouped.filter(group => group.frames.length).map(group => <section key={group.activity} className="status-group" aria-label={t(group.key)}>
      <h3>{t(group.key)}</h3>
      {group.frames.map(frame => <FrameDecisions key={frame.id} frame={frame} workspace={workspace} />)}
    </section>)}
  </aside>;
}
