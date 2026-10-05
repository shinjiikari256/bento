#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The shared kernel COLOUR-PICKER primitive — behaviour rig.
//
//   node scripts/test-ui-colorpicker.ts
//
// `kernel/src/ui/colorpicker.ts` is slides' own `createColorPicker` (an
// HSV square + hue strip + hex field, an eyedropper, recents, a theme
// palette, all in one popover — working/TZ-local-changes.md §A2), ported
// into kernel with two changes: no `t()` (every label is a required
// option) and no `ICONS` import (the eyedropper glyph is inlined). This
// rig checks what a shim without real layout CAN check — swatch creation,
// labels, getValue/setValue, the recents list surviving across pickers,
// and the `nullable` off-state this primitive adds beyond the ported
// original (dash's need, not slides'). The popover's own drag geometry
// needs a real viewport — that is what the Playwright screenshot pass
// (docs/DECISIONS.md) verifies instead.

import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
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
  private classes = new Set<string>()
  private bub = new Map<string, Handler[]>()
  value = ''
  type = ''
  title = ''
  textContent = ''
  disabled = false
  spellcheck = true
  style = new Proxy({} as Record<string, string>, {
    get: (t, k: string) => k === 'setProperty' ? (prop: string, v: string) => { t[prop] = v } : t[k],
    set: (t, k: string, v: string) => { t[k] = v; return true },
  })
  constructor(tag: string) { this.tagName = tag.toUpperCase() }
  get classList() {
    const c = this.classes
    return {
      add: (...xs: string[]) => xs.forEach((x) => c.add(x)),
      remove: (x: string) => c.delete(x),
      contains: (x: string) => c.has(x),
      toggle: (x: string, force?: boolean) => {
        const want = force !== undefined ? force : !c.has(x)
        if (want) c.add(x); else c.delete(x)
        return want
      },
    }
  }
  set className(v: string) { this.classes = new Set(v.split(/\s+/).filter(Boolean)) }
  get className() { return [...this.classes].join(' ') }
  appendChild(x: El) { x.parent = this; this.children.push(x); return x }
  append(...xs: El[]) { for (const x of xs) this.appendChild(x) }
  addEventListener(t: string, fn: Handler) { this.bub.set(t, [...(this.bub.get(t) ?? []), fn]) }
  fire(t: string) { for (const fn of [...(this.bub.get(t) ?? [])]) fn({ target: this }) }
  click() { this.fire('click') }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null } }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } }
  setPointerCapture() {}
  get offsetWidth() { return 0 }
  get offsetHeight() { return 0 }
}
class Doc {
  body = new El('body')
  createElement(t: string) { return new El(t) }
  addEventListener(t: string, fn: Handler) { void t; void fn }
  removeEventListener(t: string, fn: Handler) { void t; void fn }
}
const doc = new Doc()
;(globalThis as Record<string, unknown>).document = doc
;(globalThis as Record<string, unknown>).window = { innerWidth: 1200, innerHeight: 800 }

class FakeStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
const storage = new FakeStorage()
;(globalThis as Record<string, unknown>).localStorage = storage

const { createColorPicker } = await import('../kernel/src/ui/colorpicker.ts')

let failures = 0, checks = 0
function ok(cond: unknown, msg: string) { checks++; if (!cond) { failures++; console.error(`  ✗ ${msg}`) } }
function eq(msg: string, got: unknown, want: unknown) { checks++; if (got !== want) { failures++; console.error(`  ✗ ${msg}\n      got ${JSON.stringify(got)} want ${JSON.stringify(want)}`) } }
const E = (x: unknown) => x as unknown as El

const labels = { choose: 'Choose a colour', eyedropper: 'Pick from screen', theme: 'Theme', recent: 'Recent' }

// ——— a bare swatch button, titled, showing the given colour ———
{
  const p = createColorPicker('#ff8800', () => {}, { labels })
  eq('el is a button', E(p.el).tagName, 'BUTTON')
  eq('titled with the caller\'s label', E(p.el).title, 'Choose a colour')
  eq('getValue reflects the initial hex', p.getValue(), '#ff8800')
  eq('and the swatch shows it', E(p.el).style['--bkcp-rgb'], '255 136 0')
}

// ——— an invalid hex falls back — to opts.fallback if valid, else black ———
{
  const p1 = createColorPicker('not-a-colour', () => {}, { labels, fallback: '#abcdef' })
  eq('falls back to the caller\'s fallback', p1.getValue(), '#abcdef')
  const p2 = createColorPicker('not-a-colour', () => {}, { labels })
  eq('falls back to black with no fallback given', p2.getValue(), '#000000')
}

// ——— setValue updates getValue and the swatch, ignoring garbage ———
{
  const p = createColorPicker('#111111', () => {}, { labels })
  p.setValue('#2266aa')
  eq('setValue updates getValue', p.getValue(), '#2266aa')
  eq('and the swatch', E(p.el).style['--bkcp-rgb'], '34 102 170')
  p.setValue('nonsense')
  eq('a bad setValue is ignored, not applied', p.getValue(), '#2266aa')
}

// ——— nullable: the OFF control is a "Default" button INSIDE the popover
// (dash's need, not the ported original's — see this file's header and
// colorpicker.ts's own) — never a second control beside the swatch ———
{
  const p = createColorPicker('', () => {}, {
    labels, nullable: { clearTitle: 'Clear', onClear: () => {} },
  })
  eq('el is still just the swatch button, nullable or not', E(p.el).tagName, 'BUTTON')
  E(p.el).click()
  const pop = E(doc.body.children[0])
  const reset = pop.children.find((x) => x.classList.contains('bkcp-default'))!
  ok(!!reset, 'the popover carries a .bkcp-default button')
  eq('labelled with the caller\'s clearTitle', reset.textContent, 'Clear')
  ok(reset.disabled, 'already unset, so resetting again is disabled')
  E(p.el).click() // close
}
{
  let cleared = false
  const p = createColorPicker('#334455', () => {}, {
    labels, nullable: { clearTitle: 'Clear', onClear: () => { cleared = true } },
  })
  E(p.el).click()
  const pop = E(doc.body.children[0])
  const reset = pop.children.find((x) => x.classList.contains('bkcp-default'))!
  ok(!reset.disabled, 'a set value leaves the Default button enabled')
  reset.click()
  ok(cleared, 'clicking it calls onClear')
  eq('and it closes the popover', doc.body.children.length, 0)
}
{
  // Default starts disabled (opened unset) and must re-enable the moment the
  // SAME popover session picks a colour — not stay frozen at open-time
  // `isSet`, which left it stuck disabled after a hand-typed hex commit.
  const p = createColorPicker('', () => {}, {
    labels, nullable: { clearTitle: 'Clear', onClear: () => {} },
  })
  E(p.el).click()
  const pop = E(doc.body.children[0])
  const reset = pop.children.find((x) => x.classList.contains('bkcp-default'))!
  ok(reset.disabled, 'starts disabled — nothing set yet')
  const hexInput = pop.children.find((x) => x.classList.contains('bkcp-hexrow'))!.children.find((x) => x.classList.contains('bkcp-hex'))!
  hexInput.value = '#2266aa'
  hexInput.fire('blur')
  ok(!reset.disabled, 'typing a valid hex and committing it re-enables Default, within this same session')
  E(p.el).click()
}
{
  // no nullable at all — no .bkcp-default anywhere in the popover
  const p = createColorPicker('#334455', () => {}, { labels })
  E(p.el).click()
  const pop = E(doc.body.children[0])
  ok(!pop.children.some((x) => x.classList.contains('bkcp-default')), 'without nullable, no Default button is added')
  E(p.el).click() // close, so the next block's doc.body assertion starts clean
}

// ——— alpha: an opt-in slider in the popover, output collapsing to plain
// hex at full opacity and rgba() otherwise (not in the ported original —
// slides used to track opacity in a sibling number input; see this file's
// header and colorpicker.ts's own) ———
{
  const p = createColorPicker('rgba(34, 102, 170, 0.5)', () => {}, { labels, alpha: true })
  eq('the constructor parses rgba() alpha, not just hex', p.getValue(), 'rgba(34, 102, 170, 0.5)')
  E(p.el).click()
  const pop = E(doc.body.children[0])
  ok(pop.children.some((x) => x.classList.contains('bkcp-alpha')), 'opts.alpha adds a .bkcp-alpha strip')
  E(p.el).click()
}
{
  // a==1 collapses to plain hex — the shortest form, and what a non-alpha
  // caller downstream (dash's colourControl never sets opts.alpha) expects.
  const p = createColorPicker('#2266aa', () => {}, { labels, alpha: true })
  eq('full opacity collapses to plain hex', p.getValue(), '#2266aa')
}
{
  const p = createColorPicker('#2266aa', () => {}, { labels })
  E(p.el).click()
  const pop = E(doc.body.children[0])
  ok(!pop.children.some((x) => x.classList.contains('bkcp-alpha')), 'without opts.alpha, no strip is added')
  E(p.el).click()
}
{
  const p = createColorPicker('#2266aa', () => {}, { labels, alpha: true })
  p.setValue('#ff000080')
  eq('setValue accepts 8-digit hex alpha', p.getValue(), 'rgba(255, 0, 0, 0.502)')
  p.setValue('#334455')
  eq('and plain hex resets alpha to fully opaque', p.getValue(), '#334455')
}

// ——— the swatch is a toggle button for its own popover ———
{
  const p = createColorPicker('#102030', () => {}, { labels })
  eq('no popover before any click', doc.body.children.length, 0)
  E(p.el).click()
  eq('a click opens one, appended to body', doc.body.children.length, 1)
  ok(E(doc.body.children[0]).classList.contains('bkcp-pop'), 'the popover carries .bkcp-pop')
  E(p.el).click()
  eq('a second click on the swatch closes it again', doc.body.children.length, 0)
}

// ——— THE THEMING GUARD — every colour chain resolves, for each of the four
// apps, to a token that app both DEFINES and THEMES. ———
{
  const appStyles = Object.fromEntries(
    ['slides', 'spaces', 'dash', 'type'].map((a) => [a, fileURLToPath(new URL(`../${a}/src/styles.css`, import.meta.url))]),
  )
  for (const r of checkThemedChains({
    cssPath: fileURLToPath(new URL('../kernel/src/ui/colorpicker.css', import.meta.url)),
    prefix: 'bkcp',
    // `accent`/`accent-ink` deliberately not in colourProps — same
    // dash-constant-across-themes carve-out test-ui-promptdialog.ts documents.
    colourProps: new Set(['ink', 'border', 'bg', 'hint']),
    exempt: new Set(['radius', 'shadow', 'accent', 'accent-ink']),
    appStyles,
  })) ok(r.pass, r.msg)
}

console.log(`test-ui-colorpicker: ${checks} checks ${failures ? `FAILED (${failures})` : 'OK'}`)
process.exit(failures ? 1 : 0)
