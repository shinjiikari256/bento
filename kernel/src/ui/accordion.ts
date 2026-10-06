// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Retrofit a flat panel into an accordion: every section header gathers the
// siblings that follow it (up to the next header) into a collapsible body,
// and the open/closed state is remembered per section TITLE — not by index
// or position, which is what lets a section keep its state when the panel
// above it changes shape (a different element selected, a row added).
//
// slides/dash/spaces each wrote this exact walk independently (dash's own
// comment says so outright: "Copied from slides' applyAccordion including
// that detail"). The three differed in small, real ways — dash's opt-out
// class for a plain heading, spaces' aria-expanded and explicit key
// override, neither dash nor spaces' guard against re-attaching a click
// listener to a header that outlives a rebuild (slides' own fix, for its
// Layers section) — so this keeps the union of all three rather than
// picking one app's version as the answer.
//
// CALLED ONCE PER FULL REBUILD, same as every call site already does: the
// host's content is rebuilt flat (one header, its rows, the next header, …)
// and this walks it fresh each time. It does not try to detect or preserve
// an accordion from a PREVIOUS call — the caller's own rebuild already threw
// that DOM away.

import { lsJson, lsSetJson } from '../storage.ts'

export interface AccordionOpts {
  /** CSS class marking a section header (e.g. 'ed-section'), no leading dot. */
  headerClass: string
  /** Class the primitive adds to the body it wraps a section's rows in. */
  bodyClass: string
  /** Class toggled onto a header while its section is closed — style a
   *  chevron or dimmed text off it; the primitive itself only sets
   *  `display`, never relies on this class for behaviour. */
  closedClass: string
  /** Class added to every INTERACTIVE header (everything but a
   *  `staticClass` one) — cursor/chevron styling that a plain heading
   *  should not get. Omit if the header's own class already implies it. */
  toggleClass?: string
  /** localStorage key the open/closed map is kept under (one key per panel,
   *  shared across every section in it — same key dash/slides/spaces each
   *  already used for exactly this). */
  storageKey: string
  /** Section keys that start CLOSED the first time they are ever seen.
   *  Omit for "everything starts open", spaces' own default. */
  closedByDefault?: Set<string>
  /** A header carrying this class is skipped — a plain heading, not a
   *  drawer (dash's "Sheets" label in its left panel). */
  staticClass?: string
  /** Wrap each header + its body TOGETHER in a generated element of this
   *  class — a card the section reads as, on a dimmer panel backdrop
   *  (`accordion.css`'s `.bka-group`, if the caller styles with it).
   *  Omit to leave header and body as plain siblings in the host, the
   *  flat look spaces keeps for its own, different header design. */
  groupClass?: string
  /** What identifies a section, read off its header. Defaults to the
   *  header's own text; spaces overrides with `header.dataset.key` so a
   *  key can stay stable while the visible title changes. */
  keyOf?: (header: HTMLElement) => string
}

export function applyAccordion(host: HTMLElement, opts: AccordionOpts): void {
  const open = lsJson<Record<string, boolean>>(opts.storageKey, {})
  const keyOf = opts.keyOf ?? ((h: HTMLElement) => h.textContent ?? '')
  const headers = [...host.querySelectorAll<HTMLElement>(`.${opts.headerClass}`)]
    .filter((h) => !opts.staticClass || !h.classList.contains(opts.staticClass))

  for (const header of headers) {
    const key = keyOf(header)
    if (opts.toggleClass) header.classList.add(opts.toggleClass)
    const body = document.createElement('div')
    body.className = opts.bodyClass
    let n: ChildNode | null = header.nextSibling
    while (n && !(n instanceof HTMLElement && n.classList.contains(opts.headerClass))) {
      const next: ChildNode | null = n.nextSibling
      body.appendChild(n)
      n = next
    }
    if (opts.groupClass) {
      const group = document.createElement('div')
      group.className = opts.groupClass
      header.after(group)
      group.append(header, body)
    } else {
      header.after(body)
    }

    const isOpen = open[key] ?? !(opts.closedByDefault?.has(key) ?? false)
    header.classList.toggle(opts.closedClass, !isOpen)
    body.style.display = isOpen ? '' : 'none'
    header.setAttribute('aria-expanded', String(isOpen))

    // A header can outlive a rebuild (a panel section mounted once and
    // re-appended rather than recreated, the way slides' own Layers list
    // is) — attached once, read fresh from the DOM each time rather than
    // closing over a body a later rebuild threw away.
    if (header.dataset.bkAcc) continue
    header.dataset.bkAcc = '1'
    header.addEventListener('click', () => {
      const nowClosed = header.classList.toggle(opts.closedClass)
      const live = header.nextElementSibling as HTMLElement | null
      if (live?.classList.contains(opts.bodyClass)) live.style.display = nowClosed ? 'none' : ''
      header.setAttribute('aria-expanded', String(!nowClosed))
      const state = lsJson<Record<string, boolean>>(opts.storageKey, {})
      state[key] = !nowClosed
      lsSetJson(opts.storageKey, state)
    })
  }
}
