// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// THE SHARED INFO SHEET — one look and one structure for every "card" dialog in
// the suite: the app's card (the mark), About (the document), Settings (the
// reader), Keyboard shortcuts, and anything else built of sections, label ·
// control rows and small print. Before this, each app drew those five windows
// its own way — four headings styles, three footers, close buttons present or
// not — so the same question looked different in every app.
//
// The layout is dash's (the maintainer's pick): a titled card; sections under
// small-caps headings; rows of a muted label and a control; notes in small
// print; a footer behind a rule holding the way across (e.g. Keyboard
// shortcuts) and the way out (Close). The modal behaviour — focus trap,
// Escape, backdrop, focus restore, the z above the topbar — is createDialog's.
//
// No t(): kernel has no app catalog, so every string arrives from the app (the
// colorpicker's rule), and each app's string extractor sees it at the call.
// Values are the host's through `--bks-*` chains (sheet.css), checked by the
// shared theme guard. Apps import dialog.css and sheet.css themselves, as with
// every kernel primitive (a .css import would break the node rigs).

import { createDialog, type Dialog } from './dialog.ts'
import { BENTO_MARK_SVG, wordmarkHtml } from './mark.ts'

export interface SheetOpts {
  /** the card's visible title — also its accessible name */
  title?: string
  /** accessible name when the card draws its own heading (the app card) */
  label?: string
  /** the footer's way out */
  closeLabel: string
  /** extra class on the card, for the one app-specific rule a sheet may need */
  className?: string
  onClose?: () => void
}

export interface Sheet {
  readonly dialog: Dialog
  /** the scrolling body the builders below append to */
  readonly body: HTMLElement
  /** a section: a small-caps heading, then whatever is appended to the return */
  section(title: string): HTMLElement
  /** muted label · control */
  row(label: string, control: HTMLElement): HTMLElement
  /** small print */
  note(text: string): HTMLElement
  /** a monospaced value (an id, a file name, a size) */
  value(text: string): HTMLElement
  /** a checkbox whose label is part of the hit target */
  check(label: string, on: boolean, onChange: (on: boolean) => void): HTMLElement
  button(label: string, onClick: () => void, opts?: { primary?: boolean }): HTMLButtonElement
  /** a wrapping row of buttons */
  actions(...nodes: HTMLElement[]): HTMLElement
  /** put nodes in the footer, before Close */
  foot(...nodes: HTMLElement[]): void
  open(): void
  close(): void
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text !== undefined) n.textContent = text
  return n
}

// ONE SHEET AT A TIME, by construction: opening one closes the last through
// its own close() — never by removing its overlay, which would leave its
// capture-phase key handler on the document.
let current: Sheet | null = null

export function createSheet(opts: SheetOpts): Sheet {
  const content = el('div', 'bks')
  const body = el('div', 'bks-body')
  const footer = el('div', 'bks-foot')
  const extra = el('div', 'bks-foot-extra')
  footer.append(extra)
  content.append(body, footer)

  const dialog = createDialog({
    title: opts.title, label: opts.label, content,
    onClose: () => { if (current === api) current = null; opts.onClose?.() },
  })
  dialog.card.classList.add('bks-card')
  if (opts.className) dialog.card.classList.add(opts.className)

  const button = (label: string, onClick: () => void, o: { primary?: boolean } = {}) => {
    const b = el('button', o.primary ? 'bks-btn bks-primary' : 'bks-btn', label)
    b.type = 'button'
    b.addEventListener('click', onClick)
    return b
  }
  footer.append(button(opts.closeLabel, () => dialog.close()))

  const api: Sheet = {
    dialog,
    body,
    section(title) {
      const s = el('section', 'bks-sec')
      s.append(el('h3', 'bks-h', title))
      body.append(s)
      return s
    },
    row(label, control) {
      const r = el('div', 'bks-row')
      r.append(el('span', 'bks-label', label), control)
      return r
    },
    note: (text) => el('p', 'bks-note', text),
    value: (text) => el('span', 'bks-val', text),
    check(label, on, onChange) {
      const l = el('label', 'bks-check')
      const box = el('input')
      box.type = 'checkbox'
      box.checked = on
      box.addEventListener('change', () => onChange(box.checked))
      l.append(box, document.createTextNode(label))
      return l
    },
    button,
    actions(...nodes) {
      const a = el('div', 'bks-actions')
      a.append(...nodes)
      return a
    },
    foot(...nodes) { extra.append(...nodes) },
    open: () => {
      if (current && current !== api) current.close()
      current = api
      dialog.open()
    },
    close: () => dialog.close(),
  }
  return api
}

// the suite's mark lives in mark.ts; re-exported for the app card's callers
export { BENTO_MARK_SVG, wordmarkHtml } from './mark.ts'

export interface AppCardOpts {
  /** 'slides' | 'dash' | … — the part after the slash */
  app: string
  version: string
  /** the document format version, shown beside the app's */
  format?: string | number
  /** the localized "New to Bento? … {home} … {gh}" sentence, with the two
   *  placeholders already replaced by the links appCardLinks() returns */
  promoHtml: string
  /** small print, in order: what the update check sends, licenses */
  notes: string[]
  title: string
  closeLabel: string
  /** footer extras (e.g. a way across to Settings) */
  foot?: HTMLElement[]
}

/** The links the promo sentence interpolates — ours, never the document's. */
export const appCardLinks = {
  home: '<a href="https://bento.page" target="_blank" rel="noopener">bento.page</a>',
  gh: '<a href="https://github.com/nyblnet/bento" target="_blank" rel="noopener">GitHub</a>',
}

/** The mark's card: which app, which version, where it comes from. The same
 *  card in every app — only the name, the version and the credits differ. */
export function openAppCard(o: AppCardOpts): Sheet {
  // The head IS the title here — the mark and the wordmark say which card this
  // is better than a sentence above them would; `title` names it for a reader.
  const s = createSheet({ label: o.title, closeLabel: o.closeLabel, className: 'bks-appcard' })
  const head = el('div', 'bks-app-head')
  const ver = o.format === undefined ? `v${o.version}` : `v${o.version} · format v${o.format}`
  head.innerHTML = BENTO_MARK_SVG(36) +
    `<div>${wordmarkHtml(o.app)}<span class="bks-app-ver"></span></div>`
  head.querySelector('.bks-app-ver')!.textContent = ver
  const promo = el('p', 'bks-lede')
  promo.innerHTML = o.promoHtml
  s.body.append(head, promo, ...o.notes.map((n) => s.note(n)))
  if (o.foot) s.foot(...o.foot)
  s.open()
  return s
}

export interface ShortcutGroup {
  title: string
  rows: Array<{ label: string; keys: string[] }>
}

/** Keyboard shortcuts: sections of label · key chips, the same in every app.
 *  The app supplies the list (each app's key map is its own). */
export function openShortcuts(o: { title: string; closeLabel: string; groups: ShortcutGroup[]; foot?: HTMLElement[] }): Sheet {
  const s = createSheet({ title: o.title, closeLabel: o.closeLabel, className: 'bks-keys' })
  for (const g of o.groups) {
    const sec = s.section(g.title)
    for (const r of g.rows) {
      const keys = el('span', 'bks-kbds')
      r.keys.forEach((k, i) => {
        if (i) keys.append(document.createTextNode(' / '))
        keys.append(el('kbd', 'bk-kbd', k))
      })
      const row = el('div', 'bks-keyrow')
      row.append(el('span', '', r.label), keys)
      sec.append(row)
    }
  }
  if (o.foot) s.foot(...o.foot)
  s.open()
  return s
}

/** The theme row every Settings carries: one select, applied live. */
export function themeSelect(
  labels: { auto: string; light: string; dark: string },
  current: 'auto' | 'light' | 'dark',
  onChange: (v: 'auto' | 'light' | 'dark') => void,
): HTMLSelectElement {
  const sel = el('select', 'bks-select')
  for (const v of ['auto', 'light', 'dark'] as const) {
    const o = el('option', '', labels[v])
    o.value = v
    if (v === current) o.selected = true
    sel.append(o)
  }
  sel.value = current
  sel.addEventListener('change', () => onChange(sel.value as 'auto' | 'light' | 'dark'))
  return sel
}

/** A plain select from {value,label} pairs, styled like every sheet field. */
export function sheetSelect(choices: Array<{ value: string; label: string }>, current: string, onChange: (v: string) => void): HTMLSelectElement {
  const sel = el('select', 'bks-select')
  for (const c of choices) {
    const o = el('option', '', c.label)
    o.value = c.value
    if (c.value === current) o.selected = true
    sel.append(o)
  }
  sel.value = current
  sel.addEventListener('change', () => onChange(sel.value))
  return sel
}
