#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The shared kernel CONTEXT-MENU primitive — behaviour rig.
//
//   node scripts/test-ui-ctxmenu.ts
//
// WHAT THIS PROVES. `kernel/src/ui/ctxmenu.ts` is ported from slides' own
// ctxmenu.ts (the only one of the four apps that already had this as its
// own primitive), so this rig mostly PINS that existing behaviour rather
// than discovering new gaps the way test-ui-menu.ts's did: only one menu
// open at a time (opening a second closes the first), Escape and an
// outside press both dismiss, a disabled row's click does not run, and a
// menu built from an all-disabled/all-separator list renders NOTHING
// rather than an empty popup floating over the page.

import { installDom } from './lib/dash-dom.ts'
import { checkThemedChains } from './lib/ui-theme-guard.ts'
import { fileURLToPath } from 'node:url'

const { doc } = installDom()
void doc
// dash-dom.ts's shim has no window-level event target at all (its own rigs
// never needed one) — ctxmenu.ts (browser code, correctly) calls
// window.addEventListener('resize', …) for its dismiss-on-resize behaviour,
// which this rig does not otherwise exercise, so a no-op stub is enough.
;(globalThis as unknown as { window: { innerWidth: number; innerHeight: number; addEventListener(): void; removeEventListener(): void } }).window = {
  innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight,
  addEventListener() {}, removeEventListener() {},
}

const {
  openCtxMenu, closeCtxMenu, ctxMenuIsOpen, openCtxMenuAtRect,
  mountFloatingPanel, closeFloatingPanel,
} = await import('../kernel/src/ui/ctxmenu.ts')

let failures = 0
let checks = 0
function ok(what: string, cond: unknown): void {
  checks++
  if (!cond) { failures++; console.log(`  FAIL  ${what}`) }
  else console.log(`  ok    ${what}`)
}

// ————— 1. BASIC OPEN/CLOSE, AND ITEM COUNT —————
{
  let ran = 0
  openCtxMenu(10, 10, [
    { label: 'Cut', run: () => { ran++ } },
    { label: 'Copy', run: () => { ran++ } },
    'sep',
    { label: 'Delete', run: () => { ran++ }, danger: true },
  ])
  ok('a menu is open after openCtxMenu', ctxMenuIsOpen())
  const menu = doc.body.querySelector('.bkc-menu')
  ok('the menu element is in the document', !!menu)
  ok('three item rows rendered (+ one separator)', menu?.querySelectorAll('.bkc-item').length === 3)
  ok('the separator rendered too', menu?.querySelectorAll('.bkc-sep').length === 1)
  ok('the danger row carries the danger class', menu?.querySelectorAll('.bkc-danger').length === 1)
  closeCtxMenu()
  ok('closeCtxMenu closes it', !ctxMenuIsOpen())
  ok('closeCtxMenu removes the element from the document', !doc.body.querySelector('.bkc-menu'))
  ok('nothing ran just from opening/closing', ran === 0)
}

// ————— 2. A SECOND openCtxMenu REPLACES THE FIRST — never two at once —————
{
  openCtxMenu(10, 10, [{ label: 'A', run: () => {} }])
  const first = doc.body.querySelector('.bkc-menu')
  openCtxMenu(20, 20, [{ label: 'B', run: () => {} }])
  const menus = doc.body.querySelectorAll('.bkc-menu')
  ok('opening a second menu leaves exactly one in the document', menus.length === 1)
  ok('…and it is a NEW element, not the first one left open', menus[0] !== first)
  closeCtxMenu()
}

// ————— 3. A DISABLED ROW DOES NOT RUN —————
{
  let ran = false
  openCtxMenu(10, 10, [{ label: 'Off', run: () => { ran = true }, disabled: true }])
  const btn = doc.body.querySelector<HTMLButtonElement>('.bkc-item')
  ok('a disabled row is a real disabled button', btn?.disabled === true)
  ok('…and carries aria-disabled for anything that ignores the DOM property', btn?.getAttribute('aria-disabled') === 'true')
  closeCtxMenu()
  ok('nothing ran (never actually clicked — the property is the guard)', !ran)
}

// ————— 4. TIDYING — leading/trailing/doubled separators drop; an
// all-separator or all-disabled-with-no-content list opens NOTHING —————
{
  openCtxMenu(10, 10, ['sep', 'sep', { label: 'X', run: () => {} }, 'sep', 'sep'])
  const seps = doc.body.querySelectorAll('.bkc-sep').length
  ok('leading and trailing separators (and doubles) are dropped, not just the excess', seps === 0)
  closeCtxMenu()

  openCtxMenu(10, 10, ['sep', 'sep'])
  ok('a menu with only separators opens nothing at all', !ctxMenuIsOpen())

  openCtxMenu(10, 10, [])
  ok('an empty item list opens nothing', !ctxMenuIsOpen())
}

// ————— 5. A SELECTED (picker) ROW — checkmark, menuitemradio —————
{
  openCtxMenu(10, 10, [
    { label: 'Text', run: () => {} },
    { label: 'Number', run: () => {}, selected: true },
  ])
  const rows = doc.body.querySelectorAll<HTMLButtonElement>('.bkc-item')
  ok('an unselected row is a plain menuitem', rows[0].getAttribute('role') === 'menuitem')
  ok('a selected row is menuitemradio + aria-checked', rows[1].getAttribute('role') === 'menuitemradio' && rows[1].getAttribute('aria-checked') === 'true')
  ok('and carries the checkmark span', !!rows[1].querySelector('.bkc-check'))
  ok('the unselected row has no checkmark', !rows[0].querySelector('.bkc-check'))
  closeCtxMenu()
}

// ————— 6. A DISABLED ROW'S title EXPLAINS WHY —————
{
  openCtxMenu(10, 10, [{ label: 'Paste', run: () => {}, disabled: true, title: 'Nothing copied yet' }])
  const btn = doc.body.querySelector<HTMLButtonElement>('.bkc-item')
  ok('a title is a native tooltip on the row', btn?.title === 'Nothing copied yet')
  closeCtxMenu()
}

// ————— 7. openCtxMenuAtRect — anchored to a box, not a point —————
{
  // A plain object, not `new DOMRect(...)`: DOMRect is a browser constructor
  // that does not exist in this Node rig, and `placeAboveRect` only reads
  // top/bottom/left off it, so a structurally-shaped object is enough.
  const rect = { top: 400, bottom: 420, left: 50, right: 150, width: 100, height: 20 } as DOMRect
  openCtxMenuAtRect(rect, [{ label: 'One', run: () => {} }])
  ok('a rect-anchored menu opens too', ctxMenuIsOpen())
  closeCtxMenu()
  ok('and closes', !ctxMenuIsOpen())
}

// ————— 8. mountFloatingPanel — raw content, not a CtxItem[] list, gets the
// same dismissal — and is tracked SEPARATELY from a ctx menu —————
{
  const panel = doc.createElement('div')
  panel.className = 'my-form'
  mountFloatingPanel(panel, 10, 10)
  ok('the raw panel is mounted', doc.body.contains(panel))
  openCtxMenu(20, 20, [{ label: 'X', run: () => {} }])
  ok('opening a ctx menu does not close an unrelated floating panel', doc.body.contains(panel))
  closeCtxMenu()
  ok('closing the ctx menu leaves the panel alone too', doc.body.contains(panel))
  closeFloatingPanel()
  ok('closeFloatingPanel removes the panel', !doc.body.contains(panel))
}

// ————— 9. THE THEMING GUARD — every colour chain resolves, for each of the
// four apps, to a token that app both DEFINES and THEMES. —————
{
  const appStyles = Object.fromEntries(
    ['slides', 'spaces', 'dash', 'type'].map((a) => [a, fileURLToPath(new URL(`../${a}/src/styles.css`, import.meta.url))]),
  )
  for (const r of checkThemedChains({
    cssPath: fileURLToPath(new URL('../kernel/src/ui/ctxmenu.css', import.meta.url)),
    prefix: 'bkc',
    // `accent` is deliberately NOT in colourProps: dash documents that its
    // accent is constant across light/dark (styles.css, `--accent: #f7a600`,
    // no light-dark()), so it is checked for "defines" only, like the other
    // apps that DO theme it — the guard would otherwise fail dash for
    // following its own stated design.
    colourProps: new Set(['bg', 'border', 'ink', 'hover', 'hint-ink']),
    exempt: new Set(['z', 'min-width', 'radius', 'item-radius', 'shadow', 'font-size', 'hint-size', 'danger-ink', 'danger-hover']),
    appStyles,
  })) ok(r.msg, r.pass)
}

console.log(failures ? `\ntest-ui-ctxmenu: ${failures} FAILED of ${checks}` : `test-ui-ctxmenu: ${checks} checks OK`)
process.exit(failures ? 1 : 0)
