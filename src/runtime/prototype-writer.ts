import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { parse, type HTMLElement } from 'node-html-parser';
import postcss from 'postcss';
import type { Frame, VisualEdit } from '../protocol.js';
import { confined, publicPath, RequestError } from './workspace.js';

export type EditLocation = { kind: 'inline' } | { kind: 'draft-rule'; rule: string } | { kind: 'sheet'; rule: string; index: number };
export interface EditWrite { file: string; location: EditLocation; property: string; previous: string | null; written: string }
export interface EditBaseline {
  frameId: string;
  selector: string;
  writes: EditWrite[];
  text?: { previousHtml: string; written: string };
}

const STYLE_ATTR = /([a-z-]+)\s*:\s*([^;]+)/gi;
const DRAFT_STYLE = 'data-draft';

function kebab(property: string) {
  return property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

function parseInline(style: string | undefined) {
  const values: Record<string, string> = {};
  if (!style) return values;
  for (const match of style.matchAll(STYLE_ATTR)) values[match[1].trim().toLowerCase()] = match[2].trim();
  return values;
}

function serializeInline(values: Record<string, string>) {
  return Object.entries(values).map(([name, value]) => `${name}: ${value}`).join('; ');
}

function setInline(node: HTMLElement, property: string, value: string | null) {
  const inline = parseInline(node.getAttribute('style'));
  if (value === null) delete inline[property];
  else inline[property] = value;
  if (Object.keys(inline).length) node.setAttribute('style', serializeInline(inline));
  else node.removeAttribute('style');
}

function specificSelector(node: HTMLElement, fallback: string) {
  const draftId = node.getAttribute('data-draftroom-id');
  if (draftId) return `[data-draftroom-id="${draftId.replace(/"/g, '\\"')}"]`;
  const id = node.getAttribute('id');
  if (id) return `#${id.replace(/"/g, '\\"')}`;
  return fallback;
}

async function writeText(root: string, relative: string, content: string) {
  const destination = await confined(root, relative);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { flag: 'wx' });
  await rename(temporary, destination);
}

function linkedStylesheets(htmlRelative: string, document: HTMLElement) {
  const sheets: string[] = [];
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    const href = link.getAttribute('href');
    if (!href || /^[a-z]+:/i.test(href)) continue;
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(htmlRelative.replace(/\\/g, '/')), href.replace(/\\/g, '/')));
    if (publicPath(relative)) sheets.push(relative);
  }
  return sheets;
}

export async function stylesheetsOf(root: string, frame: Frame): Promise<string[]> {
  try {
    const htmlRelative = frame.entry.replace(/\\/g, '/');
    return linkedStylesheets(htmlRelative, parse(await readFile(await confined(root, htmlRelative), 'utf8')) as HTMLElement);
  } catch { return []; }
}

function draftStyle(document: HTMLElement, create: boolean) {
  let styleEl = document.querySelector(`style[${DRAFT_STYLE}]`) as HTMLElement | null;
  if (!styleEl && create) {
    const head = document.querySelector('head');
    const tag = `<style ${DRAFT_STYLE}></style>`;
    if (head) head.insertAdjacentHTML('beforeend', tag);
    else document.insertAdjacentHTML('afterbegin', tag);
    styleEl = document.querySelector(`style[${DRAFT_STYLE}]`) as HTMLElement;
  }
  return styleEl;
}

function findDecl(rule: postcss.Rule, property: string) {
  return rule.nodes.filter(node => node.type === 'decl' && (node as postcss.Declaration).prop === property).at(-1) as postcss.Declaration | undefined;
}

function setDecl(rule: postcss.Rule, property: string, value: string | null) {
  const existing = findDecl(rule, property);
  if (value === null) { existing?.remove(); return; }
  if (existing) existing.value = value;
  else rule.append(postcss.decl({ prop: property, value }));
}

function queryAll(document: HTMLElement, selector: string) {
  try { return document.querySelectorAll(selector); } catch { return []; }
}

function rulesBySelector(sheet: postcss.Root, selector: string) {
  const rules: postcss.Rule[] = [];
  sheet.walkRules(rule => { if (rule.parent?.type === 'root' && rule.selector === selector) rules.push(rule); });
  return rules;
}

async function linkedCandidate(root: string, sheets: string[], document: HTMLElement, target: HTMLElement, property: string) {
  let chosen: { file: string; rule: string; index: number; hasProperty: boolean } | undefined;
  for (const file of sheets) {
    const sheet = postcss.parse(await readFile(await confined(root, file), 'utf8'));
    const seen = new Map<string, number>();
    for (const node of sheet.nodes) {
      if (node.type !== 'rule' || !node.selector) continue;
      const rule = node as postcss.Rule;
      const index = seen.get(rule.selector) ?? 0;
      seen.set(rule.selector, index + 1);
      if (/[:[]/.test(rule.selector)) continue;
      const matches = queryAll(document, rule.selector);
      if (matches.length !== 1 || matches[0] !== target) continue;
      const hasProperty = !!findDecl(rule, property);
      if (hasProperty || !chosen?.hasProperty) chosen = { file, rule: rule.selector, index, hasProperty };
    }
  }
  return chosen;
}

export interface AppliedEdit { writes: EditWrite[]; text?: { previousHtml: string; written: string } }

export async function applyEdit(root: string, frame: Frame, edit: VisualEdit, sharedSheets: Set<string> = new Set()): Promise<AppliedEdit> {
  const htmlRelative = frame.entry.replace(/\\/g, '/');
  const html = await readFile(await confined(root, htmlRelative), 'utf8');
  const document = parse(html, { comment: true }) as HTMLElement;
  const nodes = queryAll(document, edit.selector);
  if (nodes.length > 1) throw new RequestError('O seletor casa com mais de um elemento. Use um seletor único (id ou data-draftroom-id).', 409);
  const node = nodes[0] as HTMLElement | undefined;
  if (!node) throw new RequestError('Elemento não encontrado no protótipo.', 404);
  const applied: AppliedEdit = { writes: [] };
  if (edit.text !== undefined) {
    if (node.childNodes.some(child => child.nodeType === 1)) throw new RequestError('Edite texto apenas em elementos sem filhos.', 400);
    applied.text = { previousHtml: node.innerHTML, written: edit.text };
    node.textContent = edit.text;
  }
  const ruleSelector = specificSelector(node, edit.selector);
  const sheets = linkedStylesheets(htmlRelative, document).filter(sheet => !sharedSheets.has(sheet));
  const sheetEdits = new Map<string, postcss.Root>();
  for (const [property, value] of Object.entries(edit.styles)) {
    const cssProperty = kebab(property);
    const inline = parseInline(node.getAttribute('style'));
    if (cssProperty in inline) {
      applied.writes.push({ file: htmlRelative, location: { kind: 'inline' }, property: cssProperty, previous: inline[cssProperty], written: value });
      setInline(node, cssProperty, value);
      continue;
    }
    const candidate = await linkedCandidate(root, sheets, document, node, cssProperty);
    if (candidate) {
      const sheet = sheetEdits.get(candidate.file) ?? postcss.parse(await readFile(await confined(root, candidate.file), 'utf8'));
      sheetEdits.set(candidate.file, sheet);
      const rule = rulesBySelector(sheet, candidate.rule)[candidate.index];
      applied.writes.push({ file: candidate.file, location: { kind: 'sheet', rule: candidate.rule, index: candidate.index }, property: cssProperty, previous: findDecl(rule, cssProperty)?.value ?? null, written: value });
      setDecl(rule, cssProperty, value);
      continue;
    }
    if (node.getAttribute('data-draftroom-id') || node.getAttribute('id') || ruleSelector !== edit.selector) {
      const styleEl = draftStyle(document, true)!;
      const sheet = postcss.parse(styleEl.text || '');
      let rule = rulesBySelector(sheet, ruleSelector)[0];
      if (!rule) { rule = postcss.rule({ selector: ruleSelector }); sheet.append(rule); }
      applied.writes.push({ file: htmlRelative, location: { kind: 'draft-rule', rule: ruleSelector }, property: cssProperty, previous: findDecl(rule, cssProperty)?.value ?? null, written: value });
      setDecl(rule, cssProperty, value);
      styleEl.set_content(sheet.toString());
      continue;
    }
    applied.writes.push({ file: htmlRelative, location: { kind: 'inline' }, property: cssProperty, previous: null, written: value });
    setInline(node, cssProperty, value);
  }
  for (const [file, sheet] of sheetEdits) await writeText(root, file, sheet.toString());
  await writeText(root, htmlRelative, document.toString());
  return applied;
}

function sameSlot(a: EditWrite, b: EditWrite) {
  return a.file === b.file && a.property === b.property && JSON.stringify(a.location) === JSON.stringify(b.location);
}

export function mergeBaseline(frameId: string, selector: string, existing: EditBaseline | undefined, applied: AppliedEdit): EditBaseline {
  const baseline: EditBaseline = existing ? { ...existing, writes: [...existing.writes] } : { frameId, selector, writes: [] };
  for (const write of applied.writes) {
    const index = baseline.writes.findIndex(saved => sameSlot(saved, write));
    if (index >= 0) baseline.writes[index] = { ...baseline.writes[index], written: write.written };
    else baseline.writes.push(write);
  }
  if (applied.text) baseline.text = baseline.text ? { previousHtml: baseline.text.previousHtml, written: applied.text.written } : applied.text;
  return baseline;
}

export function isBaseline(value: unknown): value is EditBaseline {
  return typeof value === 'object' && value !== null && Array.isArray((value as EditBaseline).writes);
}

/** Restores only declarations that still hold the value Draft wrote, so later edits by people or agents survive. */
export async function revertBaseline(root: string, frame: Frame, baseline: EditBaseline): Promise<{ restored: number; skipped: number }> {
  const htmlRelative = frame.entry.replace(/\\/g, '/');
  const document = parse(await readFile(await confined(root, htmlRelative), 'utf8'), { comment: true }) as HTMLElement;
  const matches = queryAll(document, baseline.selector);
  const node = matches.length === 1 ? matches[0] as HTMLElement : undefined;
  const sheets = new Map<string, postcss.Root>();
  let restored = 0, skipped = 0, htmlChanged = false;
  let draftSheet: postcss.Root | undefined;
  const styleEl = draftStyle(document, false);
  for (const write of baseline.writes) {
    if (write.location.kind === 'inline') {
      if (!node || parseInline(node.getAttribute('style'))[write.property] !== write.written) { skipped++; continue; }
      setInline(node, write.property, write.previous); restored++; htmlChanged = true;
      continue;
    }
    if (write.location.kind === 'draft-rule') {
      if (!styleEl) { skipped++; continue; }
      draftSheet ??= postcss.parse(styleEl.text || '');
      const rule = rulesBySelector(draftSheet, write.location.rule)[0];
      if (!rule || findDecl(rule, write.property)?.value !== write.written) { skipped++; continue; }
      setDecl(rule, write.property, write.previous);
      if (!rule.nodes.length) rule.remove();
      restored++; htmlChanged = true;
      continue;
    }
    let sheet = sheets.get(write.file);
    if (!sheet) {
      try { sheet = postcss.parse(await readFile(await confined(root, write.file), 'utf8')); } catch { skipped++; continue; }
      sheets.set(write.file, sheet);
    }
    const rule = rulesBySelector(sheet, write.location.rule)[write.location.index];
    if (!rule || findDecl(rule, write.property)?.value !== write.written) { skipped++; continue; }
    setDecl(rule, write.property, write.previous); restored++;
  }
  if (baseline.text) {
    if (node && !node.childNodes.some(child => child.nodeType === 1) && node.textContent === baseline.text.written) { node.set_content(baseline.text.previousHtml); restored++; htmlChanged = true; }
    else skipped++;
  }
  if (styleEl && draftSheet) {
    if (draftSheet.nodes.length) styleEl.set_content(draftSheet.toString());
    else styleEl.remove();
  }
  for (const [file, sheet] of sheets) await writeText(root, file, sheet.toString());
  if (htmlChanged) await writeText(root, htmlRelative, document.toString());
  return { restored, skipped };
}
