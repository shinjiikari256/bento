// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The TS half of the shared form-field primitive — see field.css for the
// styling and why it exists. `fieldize(el)` is what actually attaches
// `.bk-field`/`.bk-check` to an element; kept here rather than copied into
// each app (which is exactly the duplication this primitive exists to end).
//
// `.bk-check` (checkbox/radio) was, for a while, simply EXCLUDED here —
// "a switch is not a text field" — on the reasoning that field.css's
// bordered/padded look was for its text/select siblings, not itself. That
// held right up until every app styled its own checkbox independently
// anyway: dash alone had accepted three different accent colours across
// three files (a custom-drawn field-shaped box in one, `--accent` in
// another, `--blue` in a third) before this landed, slides had a bare hex
// colour with no token behind it, and type had never styled one at all. A
// primitive that excludes a control does not stop four apps from
// reinventing it — it just means nothing was ever there to converge on. So
// checkbox/radio get their OWN shared class now, `.bk-check`, not `.bk-field`
// — same reasoning as ctxmenu.ts declining to share menu.ts's row markup:
// the honest amount of sharing is a class for what a checkbox actually is,
// not bolting it onto the text-field class and fighting the fallout with
// `all: revert`.

/** Input types neither `.bk-field` nor `.bk-check` touch: a color input is
 *  a swatch, a file input is a button, a range input is a slider, and
 *  button/submit/reset/image/hidden are not fields at all. */
const UNSTYLED_TYPES = new Set(['color', 'file', 'range', 'button', 'submit', 'reset', 'image', 'hidden'])
const CHECK_TYPES = new Set(['checkbox', 'radio'])

/**
 * Add `.bk-field` to a real text-like input/select/textarea, `.bk-check` to
 * a checkbox/radio, or nothing to the excluded input types above. Safe to
 * call on every control passed through a panel's row-building helper —
 * that is the one call site each app needs, not a per-field decision.
 *
 * Dispatches on `tagName`/the `type` ATTRIBUTE rather than
 * `instanceof HTMLSelectElement`/`.type` — every app's own Node test rig
 * (`scripts/lib/*-dom.ts`) is a minimal shim with no `HTMLSelectElement`
 * global and no `.type` IDL reflection, so `instanceof` throws a
 * `ReferenceError` and `.type` reads back `undefined` outside a real
 * browser. `tagName` and `getAttribute('type')` are plain strings either
 * way, and mean the same thing in a shim as in a browser (the `type`
 * PROPERTY is a reflected attribute, so setting `el.type = 'checkbox'` in a
 * real browser updates the attribute too — reading it back through
 * `getAttribute` is not a weaker check, just a portable one).
 */
export function fieldize(el: HTMLElement): void {
  const tag = el.tagName
  if (tag === 'SELECT' || tag === 'TEXTAREA') { el.classList.add('bk-field'); return }
  if (tag !== 'INPUT') return
  const type = (el.getAttribute('type') ?? 'text').toLowerCase()
  if (CHECK_TYPES.has(type)) el.classList.add('bk-check')
  else if (!UNSTYLED_TYPES.has(type)) el.classList.add('bk-field')
}
