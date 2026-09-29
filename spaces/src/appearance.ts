// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// The Appearance control: Match my system / Light / Dark.
//
// WHY IT IS ITS OWN FILE, and not eleven lines inside about.ts. It renders one
// section of the About dialog, which is where the other VIEWER preferences
// already live — the interface language sits directly below it, and both
// follow the reader rather than the file. But about.ts is a 355-line function
// that several branches are editing at once, and a section built here costs
// that file one import and one `card.append(...)`. The seam is the smallest
// one that puts the control in the right place.
//
// The choice itself is kernel/src/theme.ts's: localStorage, never the
// document. See the theme-token comment at the top of styles.css for what dark
// covers in this app and what it deliberately does not.

import { THEME_CHOICES, setTheme, themeChoice, type ThemeChoice } from '../../kernel/src/theme.ts'
import { t } from './i18n'
import { h } from '../../kernel/src/dom.ts'
import '../../kernel/src/ui/field.css'

const label = (c: ThemeChoice): string =>
  c === 'auto' ? t('Match my system') : c === 'light' ? t('Light') : t('Dark')

/**
 * The heading, the picker and its note, ready to append.
 *
 * Returns nodes rather than mounting them so the caller decides where the
 * section sits — and so nothing here needs to know what a dialog is.
 */
export function appearanceSection(): HTMLElement[] {
  const h2El = h('h2.sp-card-h', { textContent: t('Appearance') })

  const sel = h('select.sp-select.bk-field')
  for (const c of THEME_CHOICES) {
    const o = h('option', { value: c, textContent: label(c) })
    if (c === themeChoice()) o.selected = true
    sel.append(o)
  }
  // No repaint and no dialog close: the theme is CSS variables, so the whole
  // window — the dialog included — changes under the picker while it is still
  // open. That is the point of doing it in tokens; it is also how you compare
  // the two without losing your place.
  sel.addEventListener('change', () => setTheme(sel.value as ThemeChoice))

  const row = h('div.sp-row')
  const lbl = h('span', { textContent: t('Interface theme') })
  row.append(lbl, sel)

  // the same rule as the language below it, and PLATFORM §8's
  const note = h('p.sp-note', {
    textContent: t('The theme follows whoever opens the file. It is never written into the document.'),
  })

  return [h2El, row, note]
}
