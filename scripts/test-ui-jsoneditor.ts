#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The shared kernel JSON-EDITOR primitive — behaviour rig.
//
//   node scripts/test-ui-jsoneditor.ts
//
// `kernel/src/ui/jsoneditor.ts` is the plain value<->textarea<->value round
// trip five independently-written "paste JSON, parse it, show an error"
// panels converged on (dash/spaces/slides/type's "Replace from JSON…", and
// slides' chart "Advanced (JSON)" escape hatch). This rig checks what the
// primitive owns: textarea creation + fieldize(), read()/write(), live
// invalid-state as the reader types, and that an empty box starts neutral
// rather than already red.

import { registerHooks } from 'node:module'

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
  value = ''
  placeholder = ''
  spellcheck = true
  rows = 0
  constructor(tag: string) { this.tagName = tag.toUpperCase() }
  get classList() { const c = this.classes; return { add: (...xs: string[]) => xs.forEach((x) => c.add(x)), remove: (x: string) => c.delete(x), contains: (x: string) => c.has(x) } }
  set className(v: string) { this.classes = new Set(v.split(/\s+/).filter(Boolean)) }
  get className() { return [...this.classes].join(' ') }
  setAttribute(k: string, v: string) { this.attrs.set(k, v) }
  getAttribute(k: string) { return this.attrs.get(k) ?? null }
  addEventListener(t: string, fn: Handler) { this.bub.set(t, [...(this.bub.get(t) ?? []), fn]) }
  fire(t: string) { for (const fn of [...(this.bub.get(t) ?? [])]) fn({ target: this }) }
}
class Doc {
  createElement(t: string) { return new El(t) }
}
const doc = new Doc()
;(globalThis as Record<string, unknown>).document = doc

const { createJsonEditor } = await import('../kernel/src/ui/jsoneditor.ts')

let failures = 0, checks = 0
function ok(cond: unknown, msg: string) { checks++; if (!cond) { failures++; console.error(`  ✗ ${msg}`) } }
function eq(msg: string, got: unknown, want: unknown) { checks++; if (got !== want) { failures++; console.error(`  ✗ ${msg}\n      got ${JSON.stringify(got)} want ${JSON.stringify(want)}`) } }
const E = (x: unknown) => x as unknown as El

// ——— creation: a textarea, fieldize()'d, empty and NOT marked invalid ———
{
  const e = createJsonEditor({ rows: 8, placeholder: 'Paste JSON here' })
  eq('a <textarea>', e.el.tagName, 'TEXTAREA')
  ok(E(e.el).classList.contains('bk-field'), 'fieldize() ran — it looks like every other field')
  ok(E(e.el).classList.contains('bkj-editor'), 'and carries the primitive\'s own class')
  ok(!E(e.el).classList.contains('bkj-invalid'), 'an untouched EMPTY box starts neutral, not red')
  eq('rows passed through', E(e.el).rows, 8)
  eq('placeholder passed through', E(e.el).placeholder, 'Paste JSON here')
}

// ——— pre-filled with a value: pretty-printed, read() round-trips it ———
{
  const e = createJsonEditor({ value: { a: 1, b: [2, 3] } })
  ok(e.el.value.includes('\n'), 'a pre-filled value is pretty-printed (indented, multi-line)')
  const r = e.read()
  ok(r.ok, 'read() parses the pretty-printed text back')
  eq('and recovers the original value', JSON.stringify(r.value), JSON.stringify({ a: 1, b: [2, 3] }))
}

// ——— typing invalid JSON marks it live, valid JSON clears it ———
{
  const e = createJsonEditor()
  e.el.value = '{ not json'
  E(e.el).fire('input')
  ok(E(e.el).classList.contains('bkj-invalid'), 'invalid text is flagged as the reader types — no Apply click needed')
  eq('read() reports it', e.read().ok, false)

  e.el.value = '{"ok": true}'
  E(e.el).fire('input')
  ok(!E(e.el).classList.contains('bkj-invalid'), 'valid text clears the flag again')
  eq('read() recovers it', JSON.stringify(e.read().value), '{"ok":true}')
}

// ——— clearing back to empty returns to neutral, not invalid ———
{
  const e = createJsonEditor()
  e.el.value = '{ not json'
  E(e.el).fire('input')
  ok(E(e.el).classList.contains('bkj-invalid'), 'sanity: it is flagged first')
  e.el.value = ''
  E(e.el).fire('input')
  ok(!E(e.el).classList.contains('bkj-invalid'), 'an emptied box goes back to neutral, not invalid')
}

// ——— write() replaces the content and re-validates ———
{
  const e = createJsonEditor()
  e.el.value = 'garbage'
  E(e.el).fire('input')
  ok(E(e.el).classList.contains('bkj-invalid'), 'sanity: starts invalid')
  e.write({ replaced: true })
  ok(!E(e.el).classList.contains('bkj-invalid'), 'write() replaces the text and clears the invalid flag')
  eq('write() pretty-prints too', JSON.stringify(e.read().value), '{"replaced":true}')
}

// No theming guard here, unlike promptdialog.ts/ctxmenu.ts: this sheet has
// no token chain to check — `--bkj-danger`'s fallback is a bare literal
// (no app defines a cross-app "error" colour; dash alone has `--err-ink`),
// same as promptdialog.css's own `--bkp-danger`, and `--bkj-mono-font`'s
// fallback is a plain font stack. Both are non-colour/no-token chains by
// the guard's own rule (themedChains() drops a fallback with no var()
// inside it) — there is nothing here for checkThemedChains to find.

console.log(`test-ui-jsoneditor: ${checks} checks ${failures ? `FAILED (${failures})` : 'OK'}`)
process.exit(failures ? 1 : 0)
