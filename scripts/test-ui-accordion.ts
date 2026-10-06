#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The shared kernel ACCORDION primitive — behaviour rig.
//
//   node scripts/test-ui-accordion.ts
//
// `kernel/src/ui/accordion.ts` is the flat-panel-into-collapsible-sections
// retrofit dash/slides/spaces each wrote independently (dash's own comment
// says "Copied from slides' applyAccordion"). This rig checks the union of
// what the three needed: the DOM walk (gather a header's siblings into a
// body, stop at the next header), per-title persistence across a fresh
// call (a rebuild), closed-by-default keys, the static opt-out, a custom
// key override, aria-expanded, and — the one bug neither dash nor spaces
// had guarded against — not re-attaching a second click listener to a
// header that survives a rebuild.

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
  dataset: Record<string, string> = {}
  style: Record<string, string> = {}
  private text = ''
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
  set textContent(v: string) { this.text = v; this.children = [] }
  get textContent() { return this.text }
  setAttribute(k: string, v: string) { this.attrs.set(k, v) }
  getAttribute(k: string) { return this.attrs.get(k) ?? null }
  appendChild(x: El) { x.parent = this; this.children.push(x); return x }
  append(...xs: El[]) { for (const x of xs) this.appendChild(x) }
  after(x: El) {
    if (!this.parent) return
    x.parent = this.parent
    const i = this.parent.children.indexOf(this)
    this.parent.children.splice(i + 1, 0, x)
  }
  get nextSibling(): El | null {
    if (!this.parent) return null
    const i = this.parent.children.indexOf(this)
    return this.parent.children[i + 1] ?? null
  }
  get nextElementSibling(): El | null { return this.nextSibling }
  addEventListener(t: string, fn: Handler) { this.bub.set(t, [...(this.bub.get(t) ?? []), fn]) }
  fire(t: string) { for (const fn of [...(this.bub.get(t) ?? [])]) fn({ target: this }) }
  click() { this.fire('click') }
  private descend(out: El[]) { for (const c of this.children) { out.push(c); c.descend(out) } }
  /** Only ever called here with a bare class selector ('.foo'). */
  querySelectorAll(sel: string): El[] {
    const cls = sel.replace(/^\./, '')
    const all: El[] = []; this.descend(all)
    return all.filter((e) => e.classList.contains(cls))
  }
}
class Doc {
  createElement(t: string) { return new El(t) }
}
const doc = new Doc()
;(globalThis as Record<string, unknown>).document = doc
// accordion.ts does `n instanceof HTMLElement` to tell a real node from a
// text node while walking siblings — this shim's El IS the stand-in.
;(globalThis as Record<string, unknown>).HTMLElement = El

// A minimal localStorage, since lsJson/lsSetJson (kernel/src/storage.ts)
// read it through `globalThis.localStorage`.
class FakeStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
const storage = new FakeStorage()
;(globalThis as Record<string, unknown>).localStorage = storage

const { applyAccordion } = await import('../kernel/src/ui/accordion.ts')

let failures = 0, checks = 0
function ok(cond: unknown, msg: string) { checks++; if (!cond) { failures++; console.error(`  ✗ ${msg}`) } }
function eq(msg: string, got: unknown, want: unknown) { checks++; if (got !== want) { failures++; console.error(`  ✗ ${msg}\n      got ${JSON.stringify(got)} want ${JSON.stringify(want)}`) } }
const E = (x: unknown) => x as unknown as El

/** A flat host: header/row/row/header/row, the shape every call site builds. */
function flatHost(): { host: El; headers: El[]; rows: El[] } {
  const host = new El('div')
  const h1 = new El('h3'); h1.className = 'sec'; h1.textContent = 'Alpha'
  const r1 = new El('div'); r1.className = 'row'; r1.textContent = 'row 1'
  const h2 = new El('h3'); h2.className = 'sec'; h2.textContent = 'Beta'
  const r2 = new El('div'); r2.className = 'row'; r2.textContent = 'row 2'
  host.append(h1, r1, h2, r2)
  return { host, headers: [h1, h2], rows: [r1, r2] }
}
const opts = { headerClass: 'sec', bodyClass: 'body', closedClass: 'shut', storageKey: 'test-acc' }

// ——— gathers a header's siblings into a body, stops at the next header ———
{
  storage.clear()
  const { host, headers, rows } = flatHost()
  applyAccordion(E(host) as unknown as HTMLElement, opts)
  const h1 = E(headers[0])
  const body1 = h1.nextSibling!
  ok(E(body1).classList.contains('body'), "the header's next sibling is the generated body")
  eq('row 1 landed inside it', body1.children.length, 1)
  eq('and it is the right row', body1.children[0], E(rows[0]))
  const h2 = E(headers[1])
  const body2 = h2.nextSibling!
  eq('the second body did not swallow the first header\'s row', body2.children.length, 1)
}

// ——— everything starts open unless told otherwise, and stays that way ———
{
  storage.clear()
  const { host, headers } = flatHost()
  applyAccordion(E(host) as unknown as HTMLElement, opts)
  for (const h of headers) {
    ok(!E(h).classList.contains('shut'), 'a never-seen section defaults OPEN')
    eq('and says so in aria-expanded', E(h).getAttribute('aria-expanded'), 'true')
  }
}

// ——— closedByDefault closes a never-seen key, but only that key ———
{
  storage.clear()
  const { host, headers } = flatHost()
  applyAccordion(E(host) as unknown as HTMLElement, { ...opts, closedByDefault: new Set(['Alpha']) })
  ok(E(headers[0]).classList.contains('shut'), 'Alpha starts closed — it is in closedByDefault')
  ok(!E(headers[1]).classList.contains('shut'), 'Beta does not — closedByDefault names sections, not "everything"')
}

// ——— clicking toggles, flips the body's display, and persists by TITLE ———
{
  storage.clear()
  const { host, headers } = flatHost()
  applyAccordion(E(host) as unknown as HTMLElement, opts)
  const h1 = E(headers[0])
  const body1 = h1.nextSibling! as unknown as El
  h1.click()
  ok(h1.classList.contains('shut'), 'a click closes an open section')
  eq('and hides its body', body1.style.display, 'none')
  eq('aria-expanded flips too', h1.getAttribute('aria-expanded'), 'false')
  h1.click()
  ok(!h1.classList.contains('shut'), 'a second click reopens it')
  eq('and shows the body again', body1.style.display, '')
}

// ——— a SECOND call (the rebuild every real caller does) reads the SAME
// persisted state back, by title, even though it is fresh DOM ———
{
  storage.clear()
  const first = flatHost()
  applyAccordion(E(first.host) as unknown as HTMLElement, opts)
  E(first.headers[0]).click() // close Alpha

  const second = flatHost() // a different set of nodes — the rebuild
  applyAccordion(E(second.host) as unknown as HTMLElement, opts)
  ok(E(second.headers[0]).classList.contains('shut'), 'Alpha reopens closed across a rebuild — same title, fresh nodes')
  ok(!E(second.headers[1]).classList.contains('shut'), 'Beta is unaffected')
}

// ——— staticClass opts a header out entirely — no body, no listener,
// and (with toggleClass set) no cursor/chevron styling either ———
{
  storage.clear()
  const { host, headers } = flatHost()
  E(headers[0]).classList.add('pin')
  applyAccordion(E(host) as unknown as HTMLElement, { ...opts, staticClass: 'pin', toggleClass: 'tgl' })
  ok(E(headers[0]).nextSibling === null || !E(E(headers[0]).nextSibling!).classList.contains('body'),
    'a static header gets no generated body')
  E(headers[0]).click()
  ok(!E(headers[0]).classList.contains('shut'), 'and clicking it does nothing — no listener was attached')
  ok(!E(headers[0]).classList.contains('tgl'), 'and it never gets the interactive toggleClass')
  ok(E(headers[1]).classList.contains('tgl'), 'an ordinary header does')
}

// ——— keyOf overrides what identifies a section (spaces' data-key) ———
{
  storage.clear()
  const { host, headers } = flatHost()
  E(headers[0]).dataset.key = 'stable-id'
  applyAccordion(E(host) as unknown as HTMLElement, { ...opts, keyOf: (h) => E(h).dataset.key ?? (h.textContent ?? '') })
  E(headers[0]).click()
  const state = JSON.parse(storage.getItem('test-acc') ?? '{}')
  ok('stable-id' in state, 'the persisted key is the override, not the header text')
  ok(!('Alpha' in state), 'and not the title it would have used by default')
}

// ——— a header that OUTLIVES a rebuild (passed to applyAccordion again
// without being recreated) gets exactly ONE listener — two would toggle
// `shut` on and then back off on a single click, cancelling out ———
{
  storage.clear()
  const { host, headers } = flatHost()
  applyAccordion(E(host) as unknown as HTMLElement, opts)
  applyAccordion(E(host) as unknown as HTMLElement, opts) // the same header, offered again
  E(headers[0]).click()
  ok(E(headers[0]).classList.contains('shut'), 'one click, one listener, one toggle — not two listeners cancelling out')
}

// ——— groupClass wraps header + body TOGETHER in a generated card —
// dash/slides' adopted look; omitted entirely is spaces' own flat one ———
{
  storage.clear()
  const { host, headers, rows } = flatHost()
  applyAccordion(E(host) as unknown as HTMLElement, { ...opts, groupClass: 'card' })
  const h1 = E(headers[0])
  const group1 = h1.parent!
  ok(group1.classList.contains('card'), "the header's parent is the generated group")
  eq('the group holds exactly the header and its body', group1.children.length, 2)
  eq('header first', group1.children[0], h1)
  ok(E(group1.children[1]).classList.contains('body'), 'body second')
  eq('the row is still inside the body, inside the group', E(group1.children[1]).children[0], E(rows[0]))
  const h2 = E(headers[1])
  ok(h2.parent!.classList.contains('card') && h2.parent !== group1, 'the second header gets its OWN group, not the first one\'s')

  // Click-to-toggle still finds the live body via nextElementSibling —
  // now a sibling inside the group, not inside the host.
  h1.click()
  ok(h1.classList.contains('shut'), 'closing still works once grouped')
  const body1 = E(group1.children[1])
  eq('and still hides the right body', body1.style.display, 'none')
}
{
  // Without groupClass, no group is created at all (spaces' path).
  storage.clear()
  const { host, headers } = flatHost()
  applyAccordion(E(host) as unknown as HTMLElement, opts)
  ok(E(headers[0]).parent === E(host), 'omitting groupClass leaves the header a direct child of the host')
}

console.log(`test-ui-accordion: ${checks} checks ${failures ? `FAILED (${failures})` : 'OK'}`)
process.exit(failures ? 1 : 0)
