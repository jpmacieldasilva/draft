export const SCHEMA_VERSION = 2;
export interface Viewport { width: number; height: number }
export type FrameRole = 'control' | 'variant';
export interface Frame { id: string; title: string; entry: string; viewport: Viewport; state?: string; role?: FrameRole; group?: string; tests?: string; signal?: string; error?: string; readme?: string; url?: string }
export interface Edge { from: string; to: string; label: string }
export interface Decision { hypothesis?: string; criteria?: string }
export interface Experiment { schemaVersion: number; id: string; title: string; frames: Frame[]; edges: Edge[]; decision?: Decision; locale?: string; allowNetwork?: string[] }
export interface Rect { x: number; y: number; width: number; height: number }
export interface Target { kind: 'element' | 'region'; selector?: string; label: string; rect: Rect }
export interface Feedback { event: 'created' | 'resolved' | 'reopened'; eventId: string; id: string; frameId: string; target: Target; message: string; status: 'open' | 'resolved'; createdAt: string }
export interface Position extends Viewport { x: number; y: number; hidden?: boolean }
/** Legacy shape of flow links stored in `.draft/layout.json` before schemaVersion 2; migrated into `Experiment.edges`. */
export interface Connection extends Edge { id: string }
export interface VisualEdit { id: string; frameId: string; selector: string; styles: Record<string,string>; text?: string }
export interface Layout { frames: Record<string, Position>; zoom: number; x: number; y: number; connections?: Connection[] }
export interface PresenceActor { id: string; label: string; frameId?: string | null; since: string; expiresAt: string }
export interface PresenceState { actors: PresenceActor[] }
export type FrameActivity = 'working' | 'needs-you' | 'ready';
export type AssumptionStatus = 'pending' | 'accepted' | 'rejected';
export interface Assumption { id: string; text: string; status: AssumptionStatus }
export interface FrameSummary { frameId: string; text: string; submittedAt: string; actor: string; assumptions: Assumption[] }
export interface AgentQuestion { id: string; frameId: string; prompt: string; askedAt: string; askedBy: string; status: 'open' | 'answered'; answer?: string; answeredAt?: string }
export interface Workspace { experiment: Experiment; readme: string; feedback: Feedback[]; layout: Layout | null; revision: string; token: string; readOnly: boolean; diagnostics: string[]; edits?: VisualEdit[]; presence?: PresenceActor[]; locale?: string; questions?: AgentQuestion[]; summaries?: FrameSummary[]; research?: string; git?: boolean; folder?: string }

/** Derived from claim, open comments, open questions and a submitted summary. Open questions and comments win, then an active claim, then a summary left after release. */
export function frameActivity(frameId: string, source: { presence?: PresenceActor[]; feedback: Array<Pick<Feedback, 'frameId' | 'status'>>; questions?: AgentQuestion[]; summaries?: FrameSummary[] }, now = Date.now()): FrameActivity | null {
  if (source.feedback.some(item => item.frameId === frameId && item.status === 'open') || (source.questions ?? []).some(item => item.frameId === frameId && item.status === 'open')) return 'needs-you';
  if ((source.presence ?? []).some(actor => actor.frameId === frameId && Date.parse(actor.expiresAt) > now)) return 'working';
  if ((source.summaries ?? []).some(item => item.frameId === frameId && item.text.trim())) return 'ready';
  return null;
}
export interface BridgeSelection { type: 'draftroom:selection'; target: Target }
export const edgeId = (edge: Edge) => `${edge.from}->${edge.to}`;
