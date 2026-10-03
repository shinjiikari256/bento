#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The shared kernel PROMPT/CONFIRM primitive — behaviour rig.
//
//   node scripts/test-ui-promptdialog.ts
//
// `kernel/src/ui/promptdialog.ts` replaces `window.prompt`/`window.confirm`,
// which are not available everywhere a self-contained HTML file is opened
// (embedded webviews, sandboxed iframes, a tab with dialogs disabled) and
// cannot do what a real form needs (more than one field, an error shown as
// the reader types, a hint line). Built on createDialog, so this rig does
// NOT re-check the modal shell (focus trap, Escape, aria-*) — that is
// test-ui-dialog.ts's job — only what promptDialog/confirmDialog add on top:
// field rendering, live validation, Enter-to-submit, resolving null/false on
// every cancellation route, and every field going through fieldize() so a
// prompt's text field looks like every other field in the app.

import { fileURLToPath } from 'node:url'
import { registerHooks } from 'node:module'
import { checkThemedChains } from './lib/ui-theme-guard.ts'

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', source: 'export {}', shortCircuit: true }
    return next(url, context)
  },
})

type Handler = (e: unknown) => void
class El {
  tagName: string
  children: El[] = []
  parent: El | null = null
  private attrs = new Map<string, string>()
  private classes = new Set<string>()
  private bub = new Map<string, Handler[]>()
  tabIndex = -1
  text = ''
  value = ''
  placeholder = ''
  spellcheck = true
  disabled = false
  hidden = false
  offsetParent: unknown = {}
  constructor(tag: string) { this.tagName = tag.toUpperCase() }
  get classList() { const c = this.classes; return { add: (...xs: string[]) => xs.forEach((x) => c.add(x)), remove: (x: string) => c.delete(x), contains: (x: string) => c.has(x) } }
  set className(v: string) { this.classes = new Set(v.split(/\s+/).filter(Boolean)) }
  get className() { return [...this.classes].join(' ') }
  set textContent(v: string) { this.text = v }
  get textContent() { return this.text }
  setAttribute(k: string, v: string) { this.attrs.set(k, v) }
  getAttribute(k: string) { return this.attrs.get(k) ?? null }
  set type(v: string) { this.setAttribute('type', v) }
  get type() { return this.getAttribute('type') ?? 'text' }
  set id(v: string) { this.attrs.set('id', v) }
  get id() { return this.attrs.get('id') ?? '' }
  appendChild(x: El) { x.parent = this; this.children.push(x); return x }
  append(...xs: El[]) { for (const x of xs) this.appendChild(x) }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null } }
  contains(x: El | null) { for (let n = x; n; n = n.parent) if (n === this) return true; return false }
  addEventListener(t: string, fn: Handler) { this.bub.set(t, [...(this.bub.get(t) ?? []), fn]) }
  removeEventListener(t: string, fn: Handler) { this.bub.set(t, (this.bub.get(t) ?? []).filter((f) => f !== fn)) }
  fire(t: string, extra: Record<string, unknown> = {}) { for (const fn of [...(this.bub.get(t) ?? [])]) fn({ target: this, preventDefault() {}, stopPropagation() {}, ...extra }) }
  click() { this.fire('click') }
  focus() { doc.activeElement = this }
  select() {}
  private descend(out: El[]) { for (const c of this.children) { out.push(c); c.descend(out) } }
  /** Only ever called here with a bare tag name ('input'/'button'/'p') —
   *  no attribute/class selectors to parse. */
  querySelectorAll(sel: string): El[] {
    const all: El[] = []; this.descend(all)
    return all.filter((e) => e.tagName === sel.toUpperCase())
  }
}
class Doc {
  body = new El('body')
  activeElement: El | null = null
  private cap = new Map<string, Handler[]>()
  private bub = new Map<string, Handler[]>()
  createElement(t: string) { return new El(t) }
  addEventListener(t: string, fn: Handler, capture?: boolean) { const m = capture ? this.cap : this.bub; m.set(t, [...(m.get(t) ?? []), fn]) }
  removeEventListener(t: string, fn: Handler, capture?: boolean) { const m = capture ? this.cap : this.bub; m.set(t, (m.get(t) ?? []).filter((f) => f !== fn)) }
  fireKey(key: string) {
    let stopped = false
    const ev = { key, preventDefault() {}, stopPropagation() { stopped = true } }
    for (const fn of [...(this.cap.get('keydown') ?? [])]) { fn(ev); if (stopped) return }
    for (const fn of [...(this.bub.get('keydown') ?? [])]) fn(ev)
  }
}
const doc = new Doc()
;(globalThis as Record<string, unknown>).document = doc

const { promptDialog, confirmDialog } = await import('../kernel/src/ui/promptdialog.ts')

let failures = 0, checks = 0
function ok(cond: unknown, msg: string) { checks++; if (!cond) { failures++; console.error(`  ✗ ${msg}`) } }
function eq(msg: string, got: unknown, want: unknown) { checks++; if (got !== want) { failures++; console.error(`  ✗ ${msg}\n      got ${got} want ${want}`) } }
const E = (x: unknown) => x as unknown as El

// ——— promptDialog: fields render, fieldize applies, Cancel resolves null ———
{
  const p = promptDialog({
    title: 'New column', cancelLabel: 'Cancel', submitLabel: 'Insert',
    fields: [{ key: 'name', label: 'Column name', value: 'New column' }],
  })
  const inputs = doc.body.querySelectorAll('input')
  ok(inputs.length === 1, 'one field renders as one input')
  ok(E(inputs[0]).classList.contains('bk-field'), 'the field goes through fieldize() — same look as every other field')
  eq('the initial value is pre-filled', E(inputs[0]).value, 'New column')
  const cancelBtn = doc.body.querySelectorAll('button').find((b) => E(b).textContent === 'Cancel')!
  E(cancelBtn).click()
  ok(!doc.body.contains(E(cancelBtn)), 'Cancel closes the dialog')
  const got = await p
  eq('Cancel resolves null', got, null)
}

// ——— a mono field gets the monospace class, a plain one does not ———
{
  void promptDialog({
    title: 'T', cancelLabel: 'C', submitLabel: 'S',
    fields: [{ key: 'a', label: 'Plain' }, { key: 'b', label: 'Formula', mono: true }],
  })
  const inputs = doc.body.querySelectorAll('input')
  ok(!E(inputs[0]).classList.contains('bkp-mono'), 'the plain field has no monospace class')
  ok(E(inputs[1]).classList.contains('bkp-mono'), 'the mono field does')
  doc.body.querySelectorAll('button').find((b) => E(b).textContent === 'C')!.click()
}

// ——— a password field is masked, a plain one is not ———
{
  void promptDialog({
    title: 'T', cancelLabel: 'C', submitLabel: 'S',
    fields: [{ key: 'a', label: 'Name' }, { key: 'b', label: 'Password', password: true }],
  })
  const inputs = doc.body.querySelectorAll('input')
  eq('a plain field defaults to text', E(inputs[0]).type, 'text')
  eq('a password field is masked', E(inputs[1]).type, 'password')
  ok(E(inputs[1]).classList.contains('bk-field'), 'and still gets the shared field look via fieldize()')
  doc.body.querySelectorAll('button').find((b) => E(b).textContent === 'C')!.click()
}

// ——— live validation blocks submit, and shows the message as you type ———
{
  const p = promptDialog({
    title: 'T', cancelLabel: 'Cancel', submitLabel: 'OK',
    fields: [{ key: 'n', label: 'Value', value: '' }],
    check: (v) => (v.n.trim() === '' ? 'A value is required.' : null),
  })
  const submitBtn = doc.body.querySelectorAll('button').find((b) => E(b).textContent === 'OK')!
  ok(E(submitBtn).disabled, 'empty input starts invalid — submit is disabled')
  const err = doc.body.querySelectorAll('p').find((p2) => !E(p2).hidden)
  ok(!!err && E(err).textContent === 'A value is required.', 'the error shows inline, not after a failed submit')
  const input = doc.body.querySelectorAll('input')[0]
  E(input).value = '5'
  E(input).fire('input')
  ok(!E(submitBtn).disabled, 'typing a value re-validates and enables submit')
  E(submitBtn).click()
  eq('and OK resolves the field values', JSON.stringify(await p), JSON.stringify({ n: '5' }))
}

// ——— Enter in a field submits (when valid), through createDialog's own
// keydown handling (so it does not also leak to whatever is behind it) ———
{
  const p = promptDialog({
    title: 'T', cancelLabel: 'Cancel', submitLabel: 'OK',
    fields: [{ key: 'n', label: 'Value', value: 'ready' }],
  })
  const input = doc.body.querySelectorAll('input')[0]
  E(input).fire('keydown', { key: 'Enter' })
  eq('Enter submits with the current values', JSON.stringify(await p), JSON.stringify({ n: 'ready' }))
}

// ——— closing any other way (Escape, backdrop — createDialog's own paths)
// also resolves null, through onClose ———
{
  const p = promptDialog({ title: 'T', cancelLabel: 'C', submitLabel: 'S', fields: [{ key: 'n', label: 'N' }] })
  doc.fireKey('Escape')
  eq('Escape resolves null too, not just the Cancel button', await p, null)
}

// ——— confirmDialog: Cancel/Confirm resolve false/true, danger tone opts in ———
{
  const c1 = confirmDialog({ message: 'Delete this?', cancelLabel: 'Cancel', confirmLabel: 'Delete', danger: true })
  const delBtn = doc.body.querySelectorAll('button').find((b) => E(b).textContent === 'Delete')!
  ok(E(delBtn).classList.contains('bkp-btn-danger'), 'a danger confirm gets the danger tone')
  E(delBtn).click()
  eq('Confirm resolves true', await c1, true)

  const c2 = confirmDialog({ message: 'Discard changes?', cancelLabel: 'Keep editing', confirmLabel: 'Discard' })
  doc.body.querySelectorAll('button').find((b) => E(b).textContent === 'Keep editing')!.click()
  eq('Cancel resolves false', await c2, false)
}

// ——— a message built from several facts joined with '\n' renders as line
// breaks, not a run-on sentence — the one thing native confirm() did for
// free that plain HTML text does not ———
{
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(fileURLToPath(new URL('../kernel/src/ui/promptdialog.css', import.meta.url)), 'utf8')
  ok(/\.bkp-msg\s*\{[^}]*white-space:\s*pre-line/.test(css),
    'the confirm message honours embedded newlines')
}

// ——— THE THEMING GUARD — every colour chain resolves, for each of the four
// apps, to a token that app both DEFINES and THEMES. —————
{
  const appStyles = Object.fromEntries(
    ['slides', 'spaces', 'dash', 'type'].map((a) => [a, fileURLToPath(new URL(`../${a}/src/styles.css`, import.meta.url))]),
  )
  for (const r of checkThemedChains({
    cssPath: fileURLToPath(new URL('../kernel/src/ui/promptdialog.css', import.meta.url)),
    prefix: 'bkp',
    // `accent` is deliberately not in colourProps — dash's is constant
    // across light/dark by design (see the ctxmenu entry in
    // docs/DECISIONS.md), so it is checked for "defines" only.
    colourProps: new Set(['label', 'hint', 'danger', 'ink', 'border', 'bg', 'hover']),
    exempt: new Set(['radius', 'mono-font', 'accent-ink', 'danger-ink']),
    appStyles,
  })) ok(r.pass, r.msg)
}

console.log(failures ? `\ntest-ui-promptdialog: ${failures} FAILED of ${checks}` : `test-ui-promptdialog: ${checks} checks OK`)
process.exit(failures ? 1 : 0)
