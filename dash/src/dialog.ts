// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The modal chrome the app's two settings-shaped surfaces share.
//
// WHY THIS FILE EXISTS. There used to be ONE dialog behind the ⓘ button and it
// held eight sections: what this file is, its properties, updates, language,
// appearance, password, version history and the JSON round trip. Measured in
// the running app it was 1361px tall in a 429px viewport — three and a bit
// screens — and the reader who came to find out what language the interface is
// in scrolled past their own password to get there.
//
// So it is two surfaces now (see about.ts for the seam), and the moment there
// were two, every part of the chrome became a thing that could be got subtly
// different in one of them: the Escape key, the backdrop click, and above all
// the two DOCUMENT-LEVEL handlers main.ts owns, which a dialog sits inside:
//
//   · a keydown that routes any bare printable key into the selected cell —
//     its guard is `INPUT || isContentEditable`, so a TEXTAREA is NOT covered:
//     typing JSON in a dialog typed into the grid as well.
//   · a paste sniffer that treats any clipboard text with a comma or a tab as
//     a CSV import, and calls preventDefault — so pasting a workbook, or an
//     author name with a comma in it, imported a junk sheet instead.
//
// Both are stopped at the backdrop, which contains everything in the dialog.
// ⌘S is stopped with them, deliberately: saving from behind a modal that may be
// mid-edit is not a gesture worth preserving. A second dialog that forgot any
// one of these would not look broken — it would look like the grid had gone
// mad — so there is one implementation and both surfaces call it.
//
// The stylesheet stays about.css and the class names stay `.dx-about-*`: this
// is one visual surface with two contents, and a second stylesheet declaring
// the same box would be one more thing to keep in step.

import './about.css'
import '../../kernel/src/ui/dialog.css'
import '../../kernel/src/ui/sheet.css'
import '../../kernel/src/ui/bar.css'
import { createSheet, type Sheet } from '../../kernel/src/ui/sheet.ts'
import { t } from './i18n.ts'

// BUILT ON THE SUITE'S SHARED SHEET (kernel/src/ui/sheet.ts) — the same card,
// sections, rows, small print and footer every Bento app's About, Settings and
// shortcut windows use. dash's layout is the one the suite adopted; this file
// keeps its small API so about.ts and settings.ts read as they always did.

export interface Dialog {
  /** the backdrop; removing it closes everything */
  back: HTMLElement
  /** the card's BODY — content goes here, the footer is the sheet's */
  card: HTMLElement
  close: () => void
  /** a section heading */
  h: (label: string) => HTMLElement
  /** small print under a section — the app explains itself rather than not */
  note: (text: string) => HTMLElement
  /** a monospaced value (a file name, an id, a size) */
  value: (text: string) => HTMLElement
  /** label · control */
  row: (label: string, node: HTMLElement) => HTMLElement
  button: (label: string, fn: () => void) => HTMLButtonElement
  actions: (...nodes: HTMLElement[]) => HTMLElement
  /** a checkbox whose LABEL is part of the hit target */
  check: (label: string, on: boolean, onChange: (v: boolean) => void) => HTMLElement
  /** footer buttons, before Close (the way across, e.g. About ⇄ Settings) */
  foot: (...nodes: HTMLElement[]) => void
  /** put it on screen and take focus. Call once, after the card is filled. */
  mount: () => void
  readonly sheet: Sheet
}

/**
 * Open a modal. ONE AT A TIME, by construction: an existing one is removed
 * first, which is also what makes "Settings…" inside About a navigation rather
 * than a stack of two modals nobody can get out of.
 */
export function openDialog(label: string): Dialog {
  const sheet = createSheet({ title: label, closeLabel: t('Close') })
  const back = sheet.dialog.root
  // The paste sniffer is a document-level BUBBLE listener: stopped here, at
  // the overlay that contains everything in the dialog. (Keys are stopped by
  // the kernel dialog's capture-phase handler.)
  back.addEventListener('paste', (e) => e.stopPropagation())
  const heading = (text: string) => {
    const el = document.createElement('h3')
    el.className = 'bks-h'
    el.textContent = text
    return el
  }
  return {
    back,
    card: sheet.body,
    close: () => sheet.close(),
    h: heading,
    note: sheet.note,
    value: sheet.value,
    row: sheet.row,
    button: (text, fn) => sheet.button(text, fn),
    actions: sheet.actions,
    check: sheet.check,
    foot: sheet.foot,
    mount: () => sheet.open(),
    sheet,
  }
}
