#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The shared kernel FORM-FIELD primitive — CSS-invariant rig.
//
//   node scripts/test-ui-field.ts
//
// WHAT THIS PROVES. `.bk-field` (kernel/src/ui/field.css) replaces the four
// apps' independent (and, for dash, entirely absent) base input/select
// styling with one rule, and `.bk-check` does the same for checkbox/radio —
// which used to be simply EXEMPTED here, on the theory that a switch is not
// a text field, right up until dash alone had three different checkbox
// accent colours across three files, slides had a bare unthemed hex, and
// type had never styled one at all. Unlike menu.ts/panel.ts/dialog.ts,
// there is no behaviour to check here — no JS, no DOM — so this rig is
// CSS-shape checks only: (1) the selectors actually match any element
// type, not just `input[type='text']` (the exact bug slides shipped and
// this sheet exists to make structurally impossible — a URL field sat
// unstyled beside every other field in its row because the old rule's
// selector named one type); (2) the same theming-guard every other
// kernel/ui primitive is held to (scripts/lib/ui-theme-guard.ts) — every
// `--bkf-*` chain reaches a token each app both defines and (for colours)
// themes; (3) `.bk-check` reuses `--bkf-focus`, not a colour of its own.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkThemedChains } from './lib/ui-theme-guard.ts'

let failures = 0
let checks = 0
function ok(what: string, cond: unknown): void {
  checks++
  if (!cond) { failures++; console.log(`  FAIL  ${what}`) }
  else console.log(`  ok    ${what}`)
}

const cssPath = fileURLToPath(new URL('../kernel/src/ui/field.css', import.meta.url))
const css = readFileSync(cssPath, 'utf8')

// ————— 1. THE SELECTOR NAMES NO TYPE — it is a class, not an attribute
// selector on `input[type='text']` the way the bug this sheet fixes did. —————
ok('.bk-field is a bare class selector, not scoped to one input type', /(^|\n)\.bk-field \{/.test(css))
ok('.bk-field also styles :focus (border + outline)', /\.bk-field:focus \{[^}]*outline: none/.test(css))
ok('.bk-field also styles :disabled', /\.bk-field:disabled \{/.test(css))
ok('.bk-check is ALSO a bare class selector, not one input type', /(^|\n)\.bk-check \{/.test(css))
ok('.bk-check styles :disabled too', /\.bk-check:disabled \{/.test(css))
ok('.bk-check is NATIVE — no appearance override drawing a hand-built box',
  !/appearance:\s*none/.test((/\.bk-check \{([^}]*)\}/.exec(css) ?? ['', ''])[1]))
ok('.bk-check paints its accent through --bkf-focus, not a colour of its own',
  /\.bk-check \{[^}]*accent-color:\s*var\(--bkf-focus,/.test(css))
ok('no light-dark() in an actual declaration — a shared sheet cannot pick a theming mechanism for four apps that disagree on one',
  !/light-dark\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')))

// ————— 2. THE THEMING GUARD — every chain resolves, for each of the four
// apps, to a token that app both DEFINES and THEMES (colour chains only). —————
{
  const appStyles = Object.fromEntries(
    ['slides', 'spaces', 'dash', 'type'].map((a) => [a, fileURLToPath(new URL(`../${a}/src/styles.css`, import.meta.url))]),
  )
  for (const r of checkThemedChains({
    cssPath,
    prefix: 'bkf',
    colourProps: new Set(['bg', 'border', 'ink', 'focus']),
    exempt: new Set(['font-size', 'pad-y', 'pad-x', 'disabled-opacity', 'check-margin-y']),
    appStyles,
  })) ok(r.msg, r.pass)
}

console.log(failures ? `\ntest-ui-field: ${failures} FAILED of ${checks}` : `test-ui-field: ${checks} checks OK`)
process.exit(failures ? 1 : 0)
