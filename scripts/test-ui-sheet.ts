#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The shared INFO SHEET — behaviour rig.
//
//   node scripts/test-ui-sheet.ts
//
// kernel/src/ui/sheet.ts is the one card every Bento app's app-card, About,
// Settings and Keyboard-shortcuts windows are built on, so the windows look and
// behave the same in every app. The checks pin the structure an app relies on
// (title, sections, rows, a footer that always ends in Close and takes extras
// before it), that the app card draws its own head, that shortcuts render as
// label · key chips, and the rule that makes "one at a time" safe: opening a
// sheet CLOSES the last one through its own close(), so no stale key handler
// is left on the document. Plus the shared theme guard, for the sheet and for
// the suite's Save button (savebutton.css).

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installDom } from './lib/dash-dom.ts'
import { checkThemedChains } from './lib/ui-theme-guard.ts'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let checks = 0, failures = 0
const ok = (cond: boolean, msg: string) => { checks++; if (cond) console.log(`  ok    ${msg}`); else { failures++; console.log(`  FAIL  ${msg}`) } }

const { doc } = installDom()
const { createSheet, openAppCard, openShortcuts, themeSelect, sheetSelect } = await import('../kernel/src/ui/sheet.ts')

console.log('structure')
{
  const s = createSheet({ title: 'Settings', closeLabel: 'Close' })
  const sec = s.section('Language')
  sec.append(s.row('Interface language', sheetSelect([{ value: 'en', label: 'English' }, { value: 'ja', label: '日本語' }], 'ja', () => {})))
  sec.append(s.note('small print'))
  let on = false
  sec.append(s.check('Offline', false, (v) => { on = v }))
  s.foot(s.button('Keyboard shortcuts', () => {}))
  s.open()
  const card = doc.body.querySelector('.bkd-card')!
  ok(!!card && card.classList.contains('bks-card'), 'opens a dialog card dressed as a sheet')
  ok(card.querySelector('.bkd-title')?.textContent === 'Settings', 'the title is the card\'s heading')
  ok(card.querySelector('.bks-h')?.textContent === 'Language', 'a section has a small-caps heading')
  ok(card.querySelector('.bks-row .bks-label')?.textContent === 'Interface language', 'a row is label · control')
  const sel = card.querySelector('.bks-select') as unknown as { value: string }
  ok(sel?.value === 'ja', 'sheetSelect starts on the current value')
  const foot = card.querySelector('.bks-foot')!
  const btns = foot.querySelectorAll('button').map((b) => b.textContent)
  ok(btns.join('|') === 'Keyboard shortcuts|Close', `the footer ends in Close, extras before it (${btns.join(', ')})`)
  const box = card.querySelector('.bks-check input') as unknown as { checked: boolean; dispatchEvent(e: unknown): void }
  box.checked = true
  box.dispatchEvent({ type: 'change' })
  ok(on, 'a check reports its new state')
  foot.querySelectorAll('button').pop()!.dispatchEvent({ type: 'click' })
  ok(!doc.body.querySelector('.bkd-overlay'), 'Close closes it')
}

console.log('\none at a time')
{
  const a = createSheet({ title: 'A', closeLabel: 'Close' })
  let closedA = 0
  const b = createSheet({ title: 'B', closeLabel: 'Close', onClose: () => {} })
  a.dialog // touch
  const aWithHook = createSheet({ title: 'A2', closeLabel: 'Close', onClose: () => { closedA++ } })
  aWithHook.open()
  b.open()
  ok(closedA === 1, 'opening a second sheet closes the first through its own close()')
  ok(!aWithHook.dialog.isOpen && b.dialog.isOpen, 'and only the second is open')
  ok(doc.body.querySelectorAll('.bkd-overlay').length === 1, 'one overlay in the document')
  b.close()
}

console.log('\nthe app card')
{
  openAppCard({
    app: 'slides', version: '1.2.6', format: 1, title: 'About bento/slides', closeLabel: 'Close',
    promoHtml: 'New to Bento?', notes: ['privacy', 'licenses'],
  })
  const card = doc.body.querySelector('.bkd-card')!
  ok(!card.querySelector('.bkd-title'), 'draws its own head instead of a title')
  ok(card.getAttribute('aria-label') === 'About bento/slides', 'and is named for a screen reader')
  ok(/bento.*slides/.test(card.querySelector('.bk-wordmark')?.textContent ?? ''), 'the wordmark names the app')
  ok(card.querySelector('.bks-app-ver')?.textContent === 'v1.2.6 · format v1', 'version · format')
  ok(card.querySelectorAll('.bks-note').length === 2, 'the small print, in order')
  card.querySelector('.bks-foot')!.querySelectorAll('button').pop()!.dispatchEvent({ type: 'click' })
}

console.log('\nkeyboard shortcuts')
{
  openShortcuts({
    title: 'Keyboard shortcuts', closeLabel: 'Close',
    groups: [{ title: 'Editing', rows: [{ label: 'Undo', keys: ['⌘Z'] }, { label: 'Redo', keys: ['⇧⌘Z', '⌘Y'] }] }],
  })
  const card = doc.body.querySelector('.bkd-card')!
  ok(card.classList.contains('bks-keys'), 'a shortcuts sheet')
  const rows = card.querySelectorAll('.bks-keyrow')
  ok(rows.length === 2, 'one row per shortcut')
  ok(rows[1].querySelectorAll('kbd').length === 2, 'several chords become several chips')
  card.querySelector('.bks-foot')!.querySelectorAll('button').pop()!.dispatchEvent({ type: 'click' })
}

console.log('\nthe theme row')
{
  let got = ''
  const sel = themeSelect({ auto: 'Match my system', light: 'Light', dark: 'Dark' }, 'dark', (v) => { got = v }) as unknown as { value: string; dispatchEvent(e: unknown): void; querySelectorAll(s: string): unknown[] }
  ok(sel.value === 'dark', 'starts on the current choice')
  ok(sel.querySelectorAll('option').length === 3, 'auto, light, dark')
  sel.value = 'light'
  sel.dispatchEvent({ type: 'change' })
  ok(got === 'light', 'reports the choice')
}

console.log('\ntheming')
{
  const appStyles = Object.fromEntries(
    ['slides', 'spaces', 'dash', 'type'].map((a) => [a, join(root, `${a}/src/styles.css`)]),
  )
  for (const r of checkThemedChains({
    cssPath: join(root, 'kernel/src/ui/sheet.css'),
    prefix: 'bks',
    colourProps: new Set(['muted', 'link', 'field', 'line', 'focus', 'ink', 'hover', 'primary', 'primary-ink']),
    appStyles,
  })) ok(r.pass, r.msg)
}

console.log('\nthe bar pieces (bar.css) theming')
{
  const appStyles = Object.fromEntries(
    ['slides', 'spaces', 'dash', 'type'].map((a) => [a, join(root, `${a}/src/styles.css`)]),
  )
  for (const r of checkThemedChains({
    cssPath: join(root, 'kernel/src/ui/bar.css'),
    prefix: 'bkb',
    colourProps: new Set(['kbd-ink', 'kbd-bg', 'line']),
    appStyles,
  })) ok(r.pass, r.msg)
}

console.log('\nthe toast (toast.css) theming')
{
  const appStyles = Object.fromEntries(
    ['slides', 'spaces', 'dash', 'type'].map((a) => [a, join(root, `${a}/src/styles.css`)]),
  )
  for (const r of checkThemedChains({
    cssPath: join(root, 'kernel/src/ui/toast.css'),
    prefix: 'bkto',
    colourProps: new Set(['ink', 'bg']),
    appStyles,
  })) ok(r.pass, r.msg)
}

console.log('\nthe Save button (savebutton.css) theming')
{
  const appStyles = Object.fromEntries(
    ['slides', 'spaces', 'dash', 'type'].map((a) => [a, join(root, `${a}/src/styles.css`)]),
  )
  for (const r of checkThemedChains({
    cssPath: join(root, 'kernel/src/ui/savebutton.css'),
    prefix: 'bksv',
    colourProps: new Set(['idle-ink', 'idle-bg', 'idle-line', 'hover-ink', 'ink', 'bg', 'seam', 'focus']),
    appStyles,
  })) ok(r.pass, r.msg)
}

console.log(failures ? `\n${failures} FAILED of ${checks}` : `\ntest-ui-sheet: ${checks} checks OK`)
process.exit(failures ? 1 : 0)
