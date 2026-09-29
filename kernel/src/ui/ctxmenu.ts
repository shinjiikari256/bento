// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// THE SHARED CONTEXT-MENU PRIMITIVE — a SIBLING of menu.ts, not a layer over
// it. `createMenu()` renders its OWN trigger button and opens from it; this
// opens at an arbitrary point (a right-click, a long-press) with no trigger
// at all — a different entry point onto a related but not identical row
// shape: a context-menu row carries a keyboard-shortcut HINT trailing the
// label (`⌘C`, rendered as `<kbd>`) and a DANGER tone, where menu.ts's row
// carries a leading icon, a secondary hint LINE under the label, a SELECTED
// state and a KEEP-OPEN escape hatch — none of which a right-click menu in
// this codebase has ever needed. Forcing one shared item-render function
// across both would mean bolting five fields nobody uses onto whichever
// side is missing them; this file shares menu.ts's SINGLETON/dismissal
// PHILOSOPHY (one open at a time, Escape, outside-press, no listener leak)
// without sharing its row markup, which is the honest amount of code to
// share given the two rows are genuinely different things.
//
// Ported from slides/src/editor/ctxmenu.ts (the only one of the four apps
// with this as its own primitive). dash's `gridmenu.ts`/`main.ts`/`panels.ts`
// built THREE near-identical copies of the same point/rect placement and
// Escape/outside-press/scroll dismissal logic around raw HTML template
// strings with a `data-a="…"` action-dispatch convention — a shape too
// different from `CtxItem[]` to swap mechanically wherever it carried
// arbitrary content (a form, a search box), but the underlying placement and
// dismissal ARE the same problem solved three times, which is what
// `attachDismiss`/`placeAtPoint`/`placeAboveRect`/`mountFloatingPanel` below
// exist to end — see docs/DECISIONS.md.

/** A separator, or a row. `hint` is a keyboard shortcut, shown trailing and
 *  dim. `selected` renders a checkmark and `role="menuitemradio"` — for a
 *  picker menu (a column's current type, an aggregate) rather than a verb
 *  list. `title` is a native tooltip, mainly for explaining WHY a disabled
 *  row is disabled (a refusal reason) without a second UI for it. */
export type CtxItem =
  | 'sep'
  | {
      label: string
      run: () => void
      hint?: string
      disabled?: boolean
      /** destructive — rendered in the danger tone, conventionally last */
      danger?: boolean
      /** a picker row's current choice — checkmark, `menuitemradio` */
      selected?: boolean
      /** native tooltip — typically why a disabled row is disabled */
      title?: string
    }

let open: HTMLElement | null = null
let detach: (() => void) | null = null

/** Close the open menu, if any. Safe to call when nothing is open. */
export function closeCtxMenu(): void {
  detach?.()
  detach = null
  open?.remove()
  open = null
}

export function ctxMenuIsOpen(): boolean {
  return !!open
}

/**
 * Open a menu at a viewport point. Items with no enabled entries are dropped
 * along with any separator that would be left dangling, so callers can build
 * a list unconditionally and let the menu decide what is worth showing.
 */
export function openCtxMenu(x: number, y: number, items: CtxItem[]): void {
  mount(items, (menu) => placeAtPoint(menu, x, y))
}

/**
 * Open a menu against an element's RECT rather than a point — a footer cell,
 * a column header's caret — preferring to sit ABOVE the rect and falling
 * back below only when there is no room (`placeAboveRect`). The same picker
 * use (`selected`) that a point menu serves; the anchor is just a box
 * instead of a click coordinate.
 */
export function openCtxMenuAtRect(rect: DOMRect, items: CtxItem[]): void {
  mount(items, (menu) => placeAboveRect(menu, rect))
}

function mount(items: CtxItem[], place: (menu: HTMLElement) => void): void {
  closeCtxMenu()
  const rows = tidy(items)
  if (!rows.length) return

  const menu = document.createElement('div')
  menu.className = 'bkc-menu'
  menu.setAttribute('role', 'menu')
  for (const item of rows) {
    if (item === 'sep') {
      const s = document.createElement('div')
      s.className = 'bkc-sep'
      s.setAttribute('role', 'separator')
      menu.appendChild(s)
      continue
    }
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'bkc-item' + (item.danger ? ' bkc-danger' : '') + (item.selected ? ' bkc-selected' : '')
    b.setAttribute('role', item.selected === undefined ? 'menuitem' : 'menuitemradio')
    if (item.selected !== undefined) b.setAttribute('aria-checked', String(item.selected))
    if (item.disabled) b.setAttribute('aria-disabled', 'true')
    if (item.title) b.title = item.title
    b.disabled = !!item.disabled
    const label = document.createElement('span')
    label.textContent = item.label
    b.appendChild(label)
    if (item.selected) {
      const mark = document.createElement('span')
      mark.className = 'bkc-check'
      mark.textContent = '✓'
      mark.setAttribute('aria-hidden', 'true')
      b.appendChild(mark)
    }
    if (item.hint) {
      const h = document.createElement('kbd')
      h.textContent = item.hint
      b.appendChild(h)
    }
    // click, not pointerdown: the dismiss listener below is on pointerdown,
    // and acting on the press would run the item and then immediately
    // re-close over a menu that had already gone.
    b.addEventListener('click', () => {
      closeCtxMenu()
      item.run()
    })
    menu.appendChild(b)
  }

  // Measured off-screen first: the flip below needs a real size, and a menu
  // built from a variable number of rows has no size until it is in the DOM.
  menu.style.visibility = 'hidden'
  document.body.appendChild(menu)
  place(menu)
  menu.style.visibility = ''
  open = menu
  detach = attachDismiss(menu, closeCtxMenu)
}

/**
 * Wire the four ways a floating surface dismisses itself — Escape, an
 * outside press, a scroll, a resize — and return a function that removes
 * those listeners (WITHOUT touching `el`; the caller decides what "closed"
 * means for its own element). Shared by `openCtxMenu`/`openCtxMenuAtRect`
 * and by `mountFloatingPanel`, so a plain-HTML popover (a form, a search
 * box — content that does not reduce to a `CtxItem[]` row list) gets the
 * same dismissal behaviour as a command menu, rather than a second,
 * independent implementation that quietly drifts (dash's own popovers had
 * three near-identical copies of this before they were pulled onto this).
 *
 * Capture phase throughout, so a press anywhere closes the surface before
 * that press does anything else — what makes it feel modal without being
 * modal. `scroll` is captured too: a fixed-position surface pinned to a
 * point while the canvas moves under it would end up pointing at the wrong
 * element.
 */
export function attachDismiss(el: HTMLElement, onClose: () => void): () => void {
  const onDown = (ev: Event) => {
    if (el.contains(ev.target as Node)) return
    onClose()
  }
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation() // Escape closes THIS, not whatever is behind it
      onClose()
    }
  }
  const onScroll = () => onClose()
  document.addEventListener('pointerdown', onDown, true)
  document.addEventListener('wheel', onScroll, true)
  document.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onScroll)
  document.addEventListener('keydown', onKey, true)
  return () => {
    document.removeEventListener('pointerdown', onDown, true)
    document.removeEventListener('wheel', onScroll, true)
    document.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', onScroll)
    document.removeEventListener('keydown', onKey, true)
  }
}

let panelOpen: HTMLElement | null = null
let panelDetach: (() => void) | null = null

/** Close the open plain-content floating panel, if any. */
export function closeFloatingPanel(): void {
  panelDetach?.()
  panelDetach = null
  panelOpen?.remove()
  panelOpen = null
}

/**
 * Mount an already-built element (a form, a search box — arbitrary content
 * a caller assembled itself, not a `CtxItem[]` list) as a dismissable
 * floating surface, anchored at a point or against a rect exactly like
 * `openCtxMenu`/`openCtxMenuAtRect`. This is the escape hatch for content
 * that genuinely is not a flat row list: forcing it into `CtxItem` would
 * mean bolting arbitrary-HTML support onto a type that exists specifically
 * to keep menu rows uniform. Singleton like the two above (mounting a
 * second panel closes the first) but tracked SEPARATELY from `openCtxMenu`
 * — a raw panel and a command menu can coexist (a column-type picker opened
 * from within a still-open toolbar popover, say) without one silently
 * closing the other.
 *
 * Returns a close function; the caller does not have to use it (a click
 * inside the panel that removes it itself is fine — `attachDismiss`'s
 * outside-press check only cares that `el` has left the document to know
 * it should stop watching, via the same `gone()` pattern `closeCtxMenu`
 * relies on through `closeFloatingPanel`).
 *
 * Two entry points, mirroring `openCtxMenu`/`openCtxMenuAtRect`, rather than
 * one taking a `{x,y} | DOMRect` union — a `DOMRect` check would be
 * `instanceof DOMRect`, and that constructor does not exist in the Node test
 * rigs these primitives are unit-tested under (no real DOM), so the tagged
 * union would work in a browser and throw in every rig that imports this
 * file directly.
 */
export function mountFloatingPanel(el: HTMLElement, x: number, y: number): () => void {
  return mountPanel(el, (e) => placeAtPoint(e, x, y))
}

export function mountFloatingPanelAtRect(el: HTMLElement, rect: DOMRect): () => void {
  return mountPanel(el, (e) => placeAboveRect(e, rect))
}

function mountPanel(el: HTMLElement, place: (el: HTMLElement) => void): () => void {
  closeFloatingPanel()
  el.style.visibility = 'hidden'
  document.body.appendChild(el)
  place(el)
  el.style.visibility = ''
  panelOpen = el
  panelDetach = attachDismiss(el, closeFloatingPanel)
  return closeFloatingPanel
}

/** Drop leading, trailing and doubled separators, and empty menus. */
function tidy(items: CtxItem[]): CtxItem[] {
  const out: CtxItem[] = []
  for (const it of items) {
    if (it === 'sep') {
      if (!out.length || out[out.length - 1] === 'sep') continue
      out.push(it)
      continue
    }
    out.push(it)
  }
  while (out.length && out[out.length - 1] === 'sep') out.pop()
  return out.some((i) => i !== 'sep') ? out : []
}

/**
 * Put an element at (x, y), flipped back inside the viewport when it would
 * hang off an edge. Flipping rather than clamping keeps the pointer OUTSIDE
 * it: a clamped menu slides under the finger or cursor, and the first thing
 * that happens is a mis-click on whatever row landed there.
 */
export function placeAtPoint(menu: HTMLElement, x: number, y: number): void {
  const m = menu.getBoundingClientRect()
  const pad = 8
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = x
  let top = y
  if (left + m.width > vw - pad) left = Math.max(pad, x - m.width)
  if (top + m.height > vh - pad) top = Math.max(pad, y - m.height)
  // Still taller than the screen (a long menu on a short landscape phone):
  // pin it to the top and let it scroll rather than run off the bottom.
  if (m.height > vh - pad * 2) {
    top = pad
    menu.style.maxHeight = `${vh - pad * 2}px`
    menu.style.overflowY = 'auto'
  }
  menu.style.left = `${Math.round(Math.max(pad, left))}px`
  menu.style.top = `${Math.round(Math.max(pad, top))}px`
}

/**
 * Put an element against a RECT, preferring to sit ABOVE it and falling
 * back below only when there is no room — right for a menu hanging off a
 * bottom-pinned totals row (dropping below would open off-screen) and
 * equally fine for one hanging off a header near the top. Fixed
 * positioning throughout, so viewport coordinates are the right ones and
 * nothing the content scrolls underneath can clip it.
 */
export function placeAboveRect(menu: HTMLElement, rect: DOMRect): void {
  const m = menu.getBoundingClientRect()
  const pad = 4
  const vw = window.innerWidth
  const vh = window.innerHeight
  const above = rect.top - m.height - pad
  const top = above >= pad ? above : Math.max(pad, Math.min(rect.bottom + pad, vh - m.height - pad))
  const left = Math.max(pad, Math.min(rect.left, vw - m.width - pad))
  menu.style.top = `${Math.round(top)}px`
  menu.style.left = `${Math.round(left)}px`
}
