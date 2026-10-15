import type { AgentQuestion, Assumption, FrameSummary } from '../protocol.js';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function frameFolder(entry: string): string | null {
  const normalized = entry.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  const directory = slash >= 0 ? normalized.slice(0, slash) : '';
  if (!directory.startsWith('frames/') || directory.split('/').some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) return null;
  return directory;
}

export function parseQuestions(frameId: string, raw: string): AgentQuestion[] | null {
  if (!raw.trim()) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!record(value) || !Array.isArray(value.questions)) return null;
  const questions: AgentQuestion[] = [];
  for (const item of value.questions) {
    if (!record(item) || typeof item.id !== 'string' || !item.id.trim() || typeof item.prompt !== 'string' || !item.prompt.trim()) continue;
    const answer = typeof item.answer === 'string' && item.answer.trim() ? item.answer.trim() : undefined;
    questions.push({
      id: item.id.trim(),
      frameId,
      prompt: item.prompt.trim(),
      askedAt: typeof item.askedAt === 'string' ? item.askedAt : new Date(0).toISOString(),
      askedBy: typeof item.askedBy === 'string' && item.askedBy.trim() ? item.askedBy.trim() : 'Agent',
      status: answer ? 'answered' : 'open',
      ...(answer ? { answer, ...(typeof item.answeredAt === 'string' ? { answeredAt: item.answeredAt } : {}) } : {}),
    });
  }
  return questions;
}

export function parseSummary(frameId: string, raw: string): FrameSummary | null {
  if (!raw.trim()) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!record(value) || typeof value.text !== 'string' || !value.text.trim() || !Array.isArray(value.assumptions)) return null;
  const assumptions: Assumption[] = [];
  for (const item of value.assumptions) {
    if (!record(item) || typeof item.id !== 'string' || !item.id.trim() || typeof item.text !== 'string' || !item.text.trim()) continue;
    const status = item.status === 'accepted' || item.status === 'rejected' ? item.status : 'pending';
    assumptions.push({ id: item.id.trim(), text: item.text.trim(), status });
  }
  return {
    frameId,
    text: value.text.trim(),
    submittedAt: typeof value.submittedAt === 'string' ? value.submittedAt : new Date(0).toISOString(),
    actor: typeof value.actor === 'string' && value.actor.trim() ? value.actor.trim() : 'Agent',
    assumptions,
  };
}

export function questionsDocument(questions: AgentQuestion[]) {
  return {
    questions: questions.map(question => ({
      id: question.id,
      prompt: question.prompt,
      askedAt: question.askedAt,
      askedBy: question.askedBy,
      ...(question.answer ? { answer: question.answer, ...(question.answeredAt ? { answeredAt: question.answeredAt } : {}) } : {}),
    })),
  };
}

export function summaryDocument(summary: FrameSummary) {
  return { text: summary.text, submittedAt: summary.submittedAt, actor: summary.actor, assumptions: summary.assumptions };
}
