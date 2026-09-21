import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { parse, type HTMLElement } from 'node-html-parser';
import postcss from 'postcss';
import type { Frame, VisualEdit } from '../protocol.js';
import { confined, publicPath, RequestError } from './workspace.js';

export interface EditBaseline {
  frameId: string;
  selector: string;
  files: Array<{ relative: string; content: string }>;
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

function upsertDraftRule(document: HTMLElement, ruleSelector: string, property: string, value: string) {
  let styleEl = document.querySelector(`style[${DRAFT_STYLE}]`) as HTMLElement | null;
  if (!styleEl) {
    const head = document.querySelector('head');
    const tag = `<style ${DRAFT_STYLE}></style>`;
    if (head) head.insertAdjacentHTML('beforeend', tag);
    else document.insertAdjacentHTML('afterbegin', tag);
    styleEl = document.querySelector(`style[${DRAFT_STYLE}]`) as HTMLElement;
  }
  const sheet = postcss.parse(styleEl.text || '');
  let rule = sheet.nodes.find(node => node.type === 'rule' && (node as postcss.Rule).selector === ruleSelector) as postcss.Rule | undefined;
  if (!rule) {
    rule = postcss.rule({ selector: ruleSelector });
    sheet.append(rule);
  }
  const existing = rule.nodes.find(node => node.type === 'decl' && (node as postcss.Declaration).prop === property) as postcss.Declaration | undefined;
  if (existing) existing.value = value;
  else rule.append(postcss.decl({ prop: property, value }));
  styleEl.set_content(sheet.toString());
}

function queryAll(document: HTMLElement, selector: string) {
  try { return document.querySelectorAll(selector); } catch { return []; }
}

async function tryLinkedCss(root: string, htmlRelative: string, document: HTMLElement, query: string, property: string, value: string) {
  const target = document.querySelector(query);
  if (!target) return undefined;
  for (const relative of linkedStylesheets(htmlRelative, document)) {
    const source = await readFile(await confined(root, relative), 'utf8');
    const sheet = postcss.parse(source);
    let updated = false;
    for (const node of sheet.nodes) {
      if (node.type !== 'rule' || !node.selector || /[:[]/.test(node.selector)) continue;
      const matches = queryAll(document, node.selector);
      if (matches.length !== 1 || matches[0] !== target) continue;
      const rule = node as postcss.Rule;
      const decl = rule.nodes.find(child => child.type === 'decl' && (child as postcss.Declaration).prop === property) as postcss.Declaration | undefined;
      if (decl) decl.value = value;
      else rule.append(postcss.decl({ prop: property, value }));
      updated = true;
    }
    if (updated) {
      await writeText(root, relative, sheet.toString());
      return relative;
    }
  }
  return undefined;
}

export async function captureBaseline(root: string, frame: Frame, selector: string): Promise<EditBaseline> {
  const files = new Map<string, string>();
  const htmlRelative = frame.entry.replace(/\\/g, '/');
  const html = await readFile(await confined(root, htmlRelative), 'utf8');
  files.set(htmlRelative, html);
  const document = parse(html) as HTMLElement;
  for (const relative of linkedStylesheets(htmlRelative, document)) {
    if (!files.has(relative)) files.set(relative, await readFile(await confined(root, relative), 'utf8'));
  }
  return { frameId: frame.id, selector, files: [...files.entries()].map(([relative, content]) => ({ relative, content })) };
}

export async function applyEdit(root: string, frame: Frame, edit: VisualEdit): Promise<string[]> {
  const htmlRelative = frame.entry.replace(/\\/g, '/');
  const html = await readFile(await confined(root, htmlRelative), 'utf8');
  const document = parse(html, { comment: true }) as HTMLElement;
  const node = document.querySelector(edit.selector) as HTMLElement | null;
  if (!node) throw new RequestError('Elemento não encontrado no protótipo.', 404);
  if (edit.text !== undefined) {
    if (node.childNodes.some(child => child.nodeType === 1)) throw new RequestError('Edite texto apenas em elementos sem filhos.', 400);
    node.textContent = edit.text;
  }
  const ruleSelector = specificSelector(node, edit.selector);
  const changed = new Set<string>([htmlRelative]);
  for (const [property, value] of Object.entries(edit.styles)) {
    const cssProperty = kebab(property);
    const inline = parseInline(node.getAttribute('style'));
    if (cssProperty in inline) {
      inline[cssProperty] = value;
      node.setAttribute('style', serializeInline(inline));
      continue;
    }
    const linked = await tryLinkedCss(root, htmlRelative, document, edit.selector, cssProperty, value);
    if (linked) { changed.add(linked); continue; }
    if (node.getAttribute('data-draftroom-id') || node.getAttribute('id') || ruleSelector !== edit.selector) {
      upsertDraftRule(document, ruleSelector, cssProperty, value);
      continue;
    }
    inline[cssProperty] = value;
    node.setAttribute('style', serializeInline(inline));
  }
  await writeText(root, htmlRelative, document.toString());
  return [...changed];
}

export async function revertBaseline(root: string, baseline: EditBaseline) {
  for (const file of baseline.files) await writeText(root, file.relative, file.content);
}
