// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The slides top bar: on the grid, named, Save primary, and rebuilt without leaking.
//
//   npm run build:single --prefix slides && node scripts/test-slides-topbar-browser.mjs
//
// WHAT THIS PROVES, measured in the packaged document (found by spaces' top-bar
// parity pass, #567):
//   1. every bar control sits on the 30px row at desktop width — the ? button
//      was 28×29, sized by its glyph — and clears 44×44 on a phone;
//   2. the wordmark is a BUTTON with a name: focusable, and Enter opens the
//      app's card (version, licenses).
//      It was a click-only 20×20 div on a phone;
//   3. Save is the suite's shared button (kernel/src/ui/savebutton.css): grey
//      while there is nothing to save, and once there is, filled with the
//      theme's --ink (ruling D1) with text reaching 4.5:1, in both themes —
//      its colour IS the unsaved signal;
//   4. build() runs again on every language switch, and each run used to add a
//      window resize listener, a ResizeObserver and eight document pointerdown
//      listeners. After N rebuilds the counts equal the counts after one.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')

let checks = 0
let failures = 0
function ok(cond, msg) {
  checks++
  if (!cond) { failures++; console.log(`  FAIL  ${msg}`) } else console.log(`  ok    ${msg}`)
}

// WCAG relative luminance over computed rgb()/rgba() strings
const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number)
const lum = ([r, g, b]) => { const c = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b) }
const contrast = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true })
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  // Track every ResizeObserver and which elements it watches, so the rig can
  // count the ones still attached to a top bar after N rebuilds.
  await ctx.addInitScript(() => {
    const live = new Set()
    const RO = window.ResizeObserver
    window.ResizeObserver = class extends RO {
      constructor(cb) { super(cb); this.__targets = [] }
      observe(t, o) { super.observe(t, o); this.__targets.push(t); live.add(this) }
      disconnect() { super.disconnect(); live.delete(this) }
    }
    window.__barObservers = () => [...live].filter((o) => o.__targets.some((t) => t.classList?.contains('ed-topbar'))).length
  })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('dialog', (d) => d.accept())
  await p.route(/^https?:/, (r) => r.abort())
  await p.goto(new URL('../slides/dist-single/Bento_Slides.bento.html', import.meta.url).href)
  await p.waitForFunction(() => window.bento?.doc && document.querySelector('.ed-topbar .ed-btn-settings'))
  await p.evaluate(() => { try { localStorage.setItem('bento-slideshow-started', '1') } catch {} })

  // --- 1. the grid -----------------------------------------------------------
  console.log('grid: every bar control on the 30px row (1440)\n')
  const boxes = () => p.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('.ed-topbar .ed-btn, .ed-topbar .ed-logo')) {
      if (el.closest('.ed-menu')) continue
      const r = el.getBoundingClientRect()
      if (!r.width || getComputedStyle(el).display === 'none') continue
      out.push({ name: el.title || el.textContent.trim() || el.className, w: +r.width.toFixed(1), h: +r.height.toFixed(1), settings: el.classList.contains('ed-btn-settings'), logo: el.classList.contains('ed-logo') })
    }
    return out
  })
  const wide = await boxes()
  const btns = wide.filter((b) => !b.logo)
  const off = btns.filter((b) => Math.abs(b.h - 30) > 0.5)
  ok(btns.length >= 12 && off.length === 0, `${btns.length} buttons, all 30px tall${off.length ? ' — off: ' + off.map((b) => `${b.name} ${b.w}×${b.h}`).join(', ') : ''}`)
  const gear = wide.find((b) => b.settings)
  ok(gear && Math.abs(gear.w - 36) <= 0.5 && Math.abs(gear.h - 30) <= 0.5, `Settings is 36×30 like its icon neighbours (${gear?.w}×${gear?.h})`)

  console.log('\ngrid: 44px touch targets (390)\n')
  await p.setViewportSize({ width: 390, height: 844 })
  await p.waitForFunction(() => document.querySelector('.ed-topbar')?.classList.contains('ed-bar-fold'))
  const phone = await boxes()
  const small = phone.filter((b) => b.w < 43.5 || b.h < 43.5)
  ok(phone.length >= 6 && small.length === 0, `${phone.length} visible controls incl. the mark, all ≥44×44${small.length ? ' — small: ' + small.map((b) => `${b.name} ${b.w}×${b.h}`).join(', ') : ''}`)
  const logoBox = phone.find((b) => b.logo)
  ok(!!logoBox, `the mark is on the phone bar (${logoBox?.w}×${logoBox?.h})`)

  // --- 2. the wordmark is a named button -------------------------------------
  console.log('\nwordmark: a named, keyboard-reachable button\n')
  const logo = p.getByRole('button', { name: /About bento\/slides/ })
  const named = await logo.count() === 1
  ok(named, 'exactly one button named "About bento/slides…"')
  ok(await p.evaluate(() => document.querySelector('.ed-logo')?.tagName) === 'BUTTON', 'it is a <button>, not a div with a click handler')
  if (named) await logo.focus()
  ok(await p.evaluate(() => document.activeElement?.classList.contains('ed-logo')), 'it takes focus')
  if (named) await p.keyboard.press('Enter')
  ok(await p.locator('.bkd-overlay').count() > 0, 'Enter opens the app card')
  await p.keyboard.press('Escape')
  await p.keyboard.press('Escape')
  await p.setViewportSize({ width: 1440, height: 900 })
  await p.waitForFunction(() => !document.querySelector('.ed-topbar')?.classList.contains('ed-bar-fold'))

  // --- 3. Save is primary, both themes ---------------------------------------
  console.log('\nSave: grey when clean, ink-filled when dirty, both themes\n')
  const fill = () => p.evaluate(() => getComputedStyle(document.querySelector('.bksv > .bksv-main')).backgroundColor)
  const inkNow = () => p.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--ink)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c })
  ok(!(await p.evaluate(() => document.querySelector('.bksv').classList.contains('bksv-dirty'))) && (await fill()) !== (await inkNow()),
    `nothing to save: Save is not filled (${await fill()})`)
  // one edit makes the deck dirty, so Save fills
  await p.locator('.ed-title').fill('Topbar rig')
  await p.locator('.ed-title').press('Tab')
  for (const theme of ['light', 'dark']) {
    await p.evaluate((th) => { document.documentElement.dataset.theme = th }, theme)
    await p.waitForTimeout(300) // Save's colour eases over 0.15s
    const m = await p.evaluate(() => {
      const probe = (v) => { const d = document.createElement('div'); d.style.color = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c }
      const save = document.querySelector('.bksv > .bksv-main')
      const caret = document.querySelector('.bksv .bksv-caret')
      const cs = getComputedStyle(save)
      return {
        ink: probe('--ink'),
        bg: cs.backgroundColor, fg: cs.color, caretBg: getComputedStyle(caret).backgroundColor,
        dirty: document.querySelector('.bksv').classList.contains('bksv-dirty'),
      }
    })
    ok(m.dirty, `${theme}: an edit marks Save dirty`)
    ok(m.bg === m.ink && m.caretBg === m.ink, `${theme}: Save and its caret are filled with --ink (${m.bg})`)
    const c = contrast(m.fg, m.bg)
    ok(c >= 4.5, `${theme}: Save label ${c.toFixed(2)}:1 ≥ 4.5`)
  }
  await p.evaluate(() => { delete document.documentElement.dataset.theme })

  // --- 4. rebuilds do not accumulate listeners or observers -------------------
  console.log('\nrebuild: N language switches leave one set of listeners\n')
  const cdp = await ctx.newCDPSession(p)
  const listeners = async (expr, type) => {
    const { result } = await cdp.send('Runtime.evaluate', { expression: expr })
    const { listeners: ls } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })
    return ls.filter((l) => l.type === type).length
  }
  const snapshot = async () => ({
    resize: await listeners('window', 'resize'),
    pointerdown: await listeners('document', 'pointerdown'),
    observers: await p.evaluate(() => window.__barObservers()),
  })
  // the language picker lives in Settings: pick by option LABEL, then Esc
  const switchTo = (label) => p.evaluate((l) => {
    document.querySelector('.ed-btn-settings').click()
    const sel = document.querySelector('.bkd-card select')
    const o = [...sel.options].find((x) => x.textContent.trim() === l)
    if (!o) throw new Error('no language ' + l)
    sel.value = o.value
    sel.dispatchEvent(new Event('change'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  }, label)
  const other = 'Deutsch'
  await switchTo('English') // one rebuild, so both samples are post-rebuild
  const one = await snapshot()
  const N = 6
  for (let i = 0; i < N; i++) await switchTo(i % 2 ? 'English' : other)
  await switchTo('English')
  const many = await snapshot()
  ok(one.resize === many.resize, `window resize listeners: ${one.resize} after one build, ${many.resize} after ${N + 1} more`)
  ok(one.pointerdown === many.pointerdown, `document pointerdown listeners: ${one.pointerdown} → ${many.pointerdown}`)
  ok(one.observers === 2 && many.observers === 2, `ResizeObservers on a top bar: ${one.observers} → ${many.observers} (fit + bar-bottom)`)
  ok(await p.evaluate(() => document.querySelectorAll('.ed-topbar').length) === 1, 'one top bar in the document')

  assert.deepEqual(errors, [])
} finally { await browser.close() }

console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures ? 1 : 0)
