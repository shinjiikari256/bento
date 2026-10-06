// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// THE SUITE'S TOAST — one short message, bottom centre, gone on its own.
//
// Every app grew one: slides `.ed-toast`, dash `.dxs-toast`, type an inline
// style, spaces a status span in the top bar that shoved the bar's controls
// around while it spoke. Same job, four looks and four lifetimes. This is the
// one: a pill in the ink colour, one at a time (a new message replaces the
// last instead of stacking), polite to screen readers, never a click target.
// Values are the host's through `--bkto-*` chains (toast.css).

let el: HTMLElement | null = null
let hideT: ReturnType<typeof setTimeout> | undefined
let removeT: ReturnType<typeof setTimeout> | undefined

/** Show `message`. Empty clears whatever is showing. */
export function toast(message: string, opts: { ms?: number } = {}): void {
  clearTimeout(hideT)
  clearTimeout(removeT)
  if (!message) { el?.classList.remove('bkto-show'); return }
  if (!el || !el.isConnected) {
    el = document.createElement('div')
    el.className = 'bkto'
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    document.body.appendChild(el)
  }
  const node = el
  node.textContent = message
  // a frame later, so a fresh node transitions in rather than appearing
  requestAnimationFrame(() => node.classList.add('bkto-show'))
  hideT = setTimeout(() => {
    node.classList.remove('bkto-show')
    removeT = setTimeout(() => { if (!node.classList.contains('bkto-show')) node.textContent = '' }, 300)
  }, opts.ms ?? Math.min(6000, 1800 + message.length * 35))
}
