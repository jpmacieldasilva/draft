export interface Viewport { width: number; height: number }
export interface Frame { id: string; title: string; entry: string; viewport: Viewport; error?: string; readme?: string; url?: string }
export interface Experiment { id: string; title: string; frames: Frame[] }
export interface Rect { x: number; y: number; width: number; height: number }
export interface Target { kind: 'element' | 'region'; selector?: string; label: string; rect: Rect }
export interface Feedback { event: 'created' | 'resolved' | 'reopened'; eventId: string; id: string; frameId: string; target: Target; message: string; status: 'open' | 'resolved'; createdAt: string }
export interface Position extends Viewport { x: number; y: number; hidden?: boolean }
export interface Connection { id: string; from: string; to: string; label: string }
export interface VisualEdit { id: string; frameId: string; selector: string; styles: Record<string,string>; text?: string }
export interface Layout { frames: Record<string, Position>; zoom: number; x: number; y: number; connections?: Connection[] }
export interface PresenceActor { id: string; label: string; frameId?: string | null; since: string; expiresAt: string }
export interface PresenceState { actors: PresenceActor[] }
export interface Workspace { experiment: Experiment; readme: string; feedback: Feedback[]; layout: Layout | null; revision: string; token: string; readOnly: boolean; diagnostics: string[]; edits?: VisualEdit[]; presence?: PresenceActor[] }
export interface BridgeSelection { type: 'draftroom:selection'; target: Target }

