#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The shared DOM builder (kernel/src/dom.ts):
//
//   node scripts/test-dom-h.ts
//
// WHAT THIS PROVES. h() has to be checked against a REAL DOM, not a hand-
// rolled shim: its whole job is telling a writable PROPERTY (`.selected`,
// `.checked`, `.value`, an ARIA reflection) apart from a METHOD (`.click`,
// `.focus`) by `typeof el[k] === 'function'`, and a shim that does not
// declare every property h() might touch would pass a check that fails in
// every real browser (exactly the bug a dash conversion pass hit against
// its own minimal grid shim — see docs/DECISIONS.md). So this drives an
// actual headless Chrome over raw CDP (no puppeteer dependency, matching
// scripts/test-shell-loader.ts's own approach) rather than mocking
// `document`. Needs Chrome; self-skips without.
//
// Covered: tag inference from the abbreviation (including the no-tag
// `.foo`/`#foo` case), class/id/attribute parsing (quoted and unquoted
// values), a malformed abbreviation THROWING instead of silently dropping
// its unparsed tail, assigning over a DOM method THROWING instead of
// silently replacing it, a legitimate event-handler prop still working
// (onclick is not a function until assigned, so it is never mistaken for
// one), dataset/style/className MERGING with the abbreviation's own
// classes instead of overwriting, and a multi-class multi-attribute
// abbreviation round-tripping correctly.

import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

let failures = 0
let checks = 0
function ok(cond: boolean, msg: string) {
  checks++
  if (!cond) { failures++; console.log(`  FAIL  ${msg}`) }
  else console.log(`  ok    ${msg}`)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// h() has no runtime dependency of its own, so the browser section below
// just needs its TYPES STRIPPED, not a real bundle — esbuild (already a
// devDependency of every app) does that correctly where a hand-rolled regex
// could not (generics, `as` casts, and multiple `type` aliases all need
// real parsing, not string surgery).
const require = createRequire(import.meta.url)
const esbuild = require(join(root, 'slides/node_modules/esbuild')) as { transformSync(code: string, opts: { loader: string }): { code: string } }
const domTs = readFileSync(join(root, 'kernel/src/dom.ts'), 'utf8')
// esbuild's transform (no bundling) only strips TYPES — it preserves
// import/export syntax as-is, which a bare Runtime.evaluate can't parse.
// dom.ts's only ESM syntax is the one `export` keyword on its one function.
const jsSrc = esbuild.transformSync(domTs, { loader: 'ts' }).code.replace(/^export function/m, 'function')
ok(/function h\(abbr, props/.test(jsSrc), 'esbuild produced a plain h(abbr, props) function (source shape check)')

const CHROME = [process.env.BENTO_CHROME, '/snap/bin/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .find((p) => p && existsSync(p))

if (!CHROME) {
  console.log('  ⚠ SKIPPED — needs Chrome (BENTO_CHROME to override); the transcription-shape checks above still gate.')
} else {
  await browserSection(CHROME)
}

async function browserSection(chrome: string) {
  // A snap-confined Chromium (this sandbox's own /snap/bin/chromium) cannot
  // write its SingletonLock under the system temp dir, under ~/.cache, or
  // under any DOTFILE/dotdir in $HOME (snap's home interface blocks those) —
  // all fail silently or with EPERM. A plain, non-hidden directory directly
  // under $HOME works, so that is where this one lives.
  const profile = mkdtempSync(join(homedir(), 'bento-test-dom-h-'))
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-default-apps',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
  ], { stdio: 'ignore' })
  const kill = () => { try { child.kill('SIGKILL') } catch { /* already gone */ } }
  try {
    const portFile = join(profile, 'DevToolsActivePort')
    for (let i = 0; i < 100 && !existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 100))
    if (!existsSync(portFile)) { ok(false, 'Chrome never wrote DevToolsActivePort — cannot run the browser section'); return }
    const cdpPort = readFileSync(portFile, 'utf8').split('\n')[0].trim()
    const json = async (p: string, init?: RequestInit) => {
      const r = await fetch(`http://127.0.0.1:${cdpPort}${p}`, init)
      const txt = await r.text()
      try { return JSON.parse(txt) } catch { return txt }
    }
    const t = (await json('/json/new?about:blank', { method: 'PUT' })) as { id: string; webSocketDebuggerUrl: string }
    const ws = new WebSocket(t.webSocketDebuggerUrl)
    await new Promise<void>((res, rej) => { ws.addEventListener('open', () => res()); ws.addEventListener('error', () => rej(new Error('cdp socket'))) })
    let id = 0
    const pending = new Map<number, (m: { result?: { result?: { value?: unknown }; exceptionDetails?: unknown } }) => void>()
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String(ev.data))
      if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id) }
    })
    const evaluate = (expression: string) => new Promise<unknown>((res) => {
      const i = ++id
      pending.set(i, (m) => {
        if (m.result?.exceptionDetails) res({ __threw: JSON.stringify(m.result.exceptionDetails).slice(0, 300) })
        else res(m.result?.result?.value)
      })
      ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: false } }))
    })

    // One evaluate call, not two: Runtime.evaluate's default execution
    // context does not reliably carry a `function` declaration from one
    // call over to the next, so h() and the assertions that use it must
    // arrive together.
    const results = await evaluate(`${jsSrc}
    (() => {
      const out = []
      const rec = (cond, msg) => out.push([!!cond, msg])

      const a = h('input.ed-row-input[type=url][placeholder="https://…"]', { value: 'x' })
      rec(a.tagName === 'INPUT', 'tag inferred correctly')
      rec(a.classList.contains('ed-row-input'), 'class applied')
      rec(a.type === 'url', 'attr from abbreviation applied')
      rec(a.placeholder === 'https://…', 'quoted attr value applied')
      rec(a.value === 'x', 'prop applied')

      const b = h('.foo#bar')
      rec(b.tagName === 'DIV', 'missing tag defaults to div')
      rec(b.id === 'bar', 'id applied even with no tag')
      rec(b.classList.contains('foo'), 'class applied even with no tag')
      rec(b.value === undefined, 'no-tag element types as plain HTMLElement (no .value)')

      let threw = false
      try { h('input.foo!!!wat') } catch (e) { threw = true }
      rec(threw, 'malformed abbreviation throws instead of silently dropping garbage')

      let threw2 = false
      try { h('button', { click: () => {} }) } catch (e) { threw2 = true }
      rec(threw2, 'assigning over a method (click) throws instead of silently shadowing it')

      let clicked = false
      const btn = h('button', { onclick: () => { clicked = true } })
      btn.click()
      rec(clicked, 'onclick prop still works normally (not mistaken for a method)')

      const s = h('div', { style: { color: 'red', width: '10px' } })
      rec(s.style.color === 'red' && s.style.width === '10px', 'style prop applied as plain CSS properties')

      const d = h('div.a', { className: 'b', dataset: { x: '1' } })
      rec(d.className === 'a b', 'className merges with abbreviation classes')
      rec(d.dataset.x === '1', 'dataset applied')

      const e = h('div.card.card--x[data-role=widget]')
      rec(e.classList.contains('card') && e.classList.contains('card--x'), 'multiple classes parsed')
      rec(e.getAttribute('data-role') === 'widget', 'plain (unquoted) attr value parsed')

      const opt = h('option', { value: 'v', textContent: 'V', selected: true })
      rec(opt.tagName === 'OPTION' && opt.selected === true, 'a boolean property (selected) is set via the property, not setAttribute')

      const img = h('img', { ariaHidden: 'true', alt: '' })
      rec(img.getAttribute('aria-hidden') === 'true', 'a camelCase ARIA prop reflects to the real aria-* attribute')

      return out
    })()`) as Array<[boolean, string]> | { __threw: string }

    if (!Array.isArray(results)) {
      ok(false, `browser evaluation threw: ${(results as { __threw: string }).__threw}`)
    } else {
      for (const [cond, msg] of results) ok(cond, msg)
    }
    ws.close()
    await json(`/json/close/${t.id}`)
  } finally {
    kill()
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* best effort */ }
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures ? 1 : 0)
