#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The shared kernel TOPBAR FIT — behaviour rig.
//
//   node scripts/test-ui-topbar.ts
//
// kernel/src/ui/topbar.ts replaces three hand-rolled measuring loops (slides,
// spaces, type). The differences between them were rules, not looks: slides
// folds only on real overflow, type drops its title as a last resort, slides
// folds every phone outright, spaces holds still while a menu is open. Each
// check below pins one of those, plus the loop guard (the fit's own mutations
// must not re-trigger it). Self-contained fake DOM, like test-ui-panel.ts.

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  ok   ${name}`)
  else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ——— a fake bar whose content width depends on its tier classes ———
// Widths per tier: full labels 900 → no labels 700 → no wordmark 640 →
// folded 420. The title gets whatever is left, capped at 300.
const WIDTH: Record<string, number> = { base: 900, compact: 700, tight: 640, fold: 420 }
class FakeBar {
  classes = new Set<string>()
  clientWidth = 1200
  extra = 0 // live content (an avatar joining) at constant viewport
  isConnected = true
  get content(): number {
    const c = this.classes
    const w = c.has('fold') ? WIDTH.fold : c.has('tight') ? WIDTH.tight : c.has('compact') ? WIDTH.compact : WIDTH.base
    return w + this.extra + (c.has('micro') ? -60 : 0)
  }
  get scrollWidth(): number { return Math.max(this.clientWidth, this.content + 60) }
  classList = {
    add: (...xs: string[]) => { for (const x of xs) this.classes.add(x); queueRecord() },
    remove: (...xs: string[]) => { for (const x of xs) this.classes.delete(x); queueRecord() },
    contains: (x: string) => this.classes.has(x),
  }
}
const bar = new FakeBar()
const title = {
  getBoundingClientRect: () => ({ width: bar.classes.has('micro') ? 0 : Math.min(300, Math.max(48, bar.clientWidth - bar.content)) }),
}

// ——— observers: capture callbacks, let the test fire them ———
let roCb: (() => void) | null = null
let moCb: (() => void) | null = null
let pending = 0
function queueRecord(): void { pending++ }
const g = globalThis as Record<string, unknown>
g.ResizeObserver = class { constructor(cb: () => void) { roCb = cb } observe() {} disconnect() { roCb = null } }
g.MutationObserver = class {
  constructor(cb: () => void) { moCb = cb }
  observe() {}
  disconnect() { moCb = null }
  takeRecords() { pending = 0; return [] }
}
const winHandlers = new Map<string, () => void>()
g.window = {
  innerWidth: 1200,
  addEventListener: (t: string, fn: () => void) => winHandlers.set(t, fn),
  removeEventListener: (t: string) => winHandlers.delete(t),
}
/** Deliver queued mutation records the way the browser would. */
function flushMutations(): number {
  let runs = 0
  while (pending > 0 && moCb && runs < 50) { pending = 0; moCb(); runs++ }
  return runs
}

const { fitTopbar } = await import('../kernel/src/ui/topbar.ts')
const tiers = ['compact', 'tight', 'fold']
const set = (): string => tiers.concat('micro').filter((t) => bar.classes.has(t)).join(',') || '(none)'

console.log('tiers step down only as far as needed')
const folds: boolean[] = []
let fit = fitTopbar(bar as unknown as HTMLElement, {
  tiers, title: title as unknown as HTMLElement, titleMin: 110, onFold: (f) => folds.push(f),
})
check('wide bar: no tier', set() === '(none)', set())
bar.clientWidth = 880; roCb?.()
check('title squeezed (<110) → compact', set() === 'compact', set())
bar.clientWidth = 760; roCb?.()
check('still cramped → tight', set() === 'compact,tight', set())
bar.clientWidth = 600; roCb?.()
check('overflowing → fold', set() === 'compact,tight,fold', set())
check('onFold(true) once', folds.join() === 'true', folds.join())
bar.clientWidth = 1200; winHandlers.get('resize')?.()
check('window resize unfolds', set() === '(none)', set())
check('onFold(false) on the way back', folds.join() === 'true,false', folds.join())
roCb?.()
check('onFold not repeated without a change', folds.join() === 'true,false', folds.join())

console.log('the fit\'s own mutations do not loop')
bar.clientWidth = 600; bar.extra = 0; roCb?.()
check('records dropped after refit', pending === 0, `pending=${pending}`)
check('a content change re-fits exactly once', (() => { bar.clientWidth = 1200; queueRecord(); return flushMutations() === 1 })())
check('…and lands on the right tier', set() === '(none)', set())

console.log('content changes at a constant viewport')
bar.clientWidth = 1100
queueRecord(); flushMutations()
check('room enough: no tier', set() === '(none)', set())
bar.extra = 200; queueRecord(); flushMutations()
check('an avatar joining tightens the bar', set() !== '(none)', set())
fit.destroy()
check('destroy disconnects everything', roCb === null && moCb === null && !winHandlers.has('resize'))

console.log('foldOnOverflowOnly (slides)')
bar.classes.clear(); bar.extra = 0; folds.length = 0
// title-squeezed but nothing overflows at the tight tier → no fold
bar.clientWidth = 740
fit = fitTopbar(bar as unknown as HTMLElement, {
  tiers, title: title as unknown as HTMLElement, titleMin: 120, foldOnOverflowOnly: true, onFold: (f) => folds.push(f),
})
check('squeezed title alone does not fold', set() === 'compact,tight', set())
bar.clientWidth = 690; roCb?.()
check('real overflow folds', set() === 'compact,tight,fold', set())
fit.destroy()

console.log('lastResort (type\'s micro)')
bar.classes.clear(); folds.length = 0
bar.clientWidth = 460
fit = fitTopbar(bar as unknown as HTMLElement, {
  tiers, title: title as unknown as HTMLElement, titleMin: 96, lastResort: 'micro',
})
check('cramped after folding → last resort', set() === 'compact,tight,fold,micro', set())
bar.clientWidth = 700; roCb?.()
check('last resort cleared when room returns', !bar.classes.has('micro'), set())
fit.destroy()

console.log('foldBelow (phones) and hold')
bar.classes.clear(); folds.length = 0
const w = g.window as { innerWidth: number }
w.innerWidth = 390; bar.clientWidth = 2000
let holding = false
fit = fitTopbar(bar as unknown as HTMLElement, {
  tiers, foldBelow: 700, hold: () => holding, onFold: (f) => folds.push(f),
})
check('phone: every tier without measuring', set() === 'compact,tight,fold', set())
check('phone: onFold(true)', folds.join() === 'true', folds.join())
w.innerWidth = 1200; holding = true; roCb?.()
check('hold keeps the tiers while a menu is open', set() === 'compact,tight,fold', set())
holding = false; roCb?.()
check('released hold re-fits', set() === '(none)', set())
fit.destroy()

console.log('a disconnected bar is left alone')
bar.classes.clear(); bar.isConnected = false; bar.clientWidth = 300
fit = fitTopbar(bar as unknown as HTMLElement, { tiers })
check('no tiers on a bar not in the document', set() === '(none)', set())
bar.isConnected = true; fit.refit()
check('refit() once mounted measures it', set() === 'compact,tight,fold', set())
check('folded getter reflects state', fit.folded)
fit.destroy()

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1) }
console.log('\nall topbar-fit checks passed')
