// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// A single colour picker used everywhere a colour field appears: an HSV
// square + hue strip + hex/rgb/hsl field, an eyedropper where the browser
// has one, up to 10 recently-picked colours, and — when the caller supplies
// a palette — the deck/workbook's own theme swatches, all inside one
// popover. Native `<input type=color>` renders a DIFFERENT picker per
// browser and cannot show a theme palette inline, which is why every colour
// field in both apps used to carry a separate row of swatches beside it.
//
// PORTED FROM `slides/src/editor/colorpicker.ts` (working/TZ-local-changes.md
// §A2's `createColorPicker`), not written fresh — that version is the design;
// this is it with the two things a kernel file cannot have. No `t()`:
// kernel has no app's i18n to call, so every label `opts` requires is a
// plain string, same rule `promptdialog.ts` follows. No `ICONS` import: the
// eyedropper glyph is inlined below rather than depending on either app's
// own icon set.
//
// `nullable`, `disabled` and `alpha` are NEW, not in the ported original.
// `nullable`/`disabled`: slides never needed an unset colour (every
// property it touches has SOME colour) or a read-only one, dash's cell
// formatting needs both: a cell with no explicit colour is not the same as
// one painted black, and this picker's "always holds a hex" model otherwise
// has no way to say "unset". The OFF control is a "Default" button INSIDE
// the popover, not a second control beside the swatch — an external "×"
// reads as "clear the swatch" and is easy to mistake for "pick black".
// (An earlier, narrower primitive — kernel/src/ui/colorinput.ts, a plain
// wrapper around the native `<input type=color>` — solved dash's `nullable`
// need the same way before this one replaced it; see docs/DECISIONS.md's
// 2026-10-05 entry for why the replacement, not an edit, of that decision.)
// `alpha`: the ported original's `colorAlpha` (slides/editor/panels.ts) kept
// opacity in a sibling number input beside the swatch, because the picker
// itself had no way to carry it. An alpha strip now lives in the popover
// itself, same shape as the hue strip, so that external input is gone.

import { lsJson, lsSetJson } from '../storage.ts'

export interface ColorPickerPaletteEntry {
  slot: string
  hex: string
  active?: boolean
}

export interface ColorPickerLabels {
  /** The swatch button's own tooltip. */
  choose: string
  eyedropper: string
  /** The palette row's heading, shown only when `palette` is non-empty. */
  theme: string
  /** The recent-colours row's heading, shown only once something is recent. */
  recent: string
}

export interface ColorPickerOpts {
  labels: ColorPickerLabels
  /** Shown when `hex` doesn't parse as a 6-digit hex — the colour a caller
   *  falls back to display (dash: the cell's inherited default). */
  fallback?: string
  /** A read-only cell/field: the swatch opens no popover, the clear/"Default"
   *  button (if `nullable`) is disabled too. Not in the ported original —
   *  slides never needed it, dash's read-only reader copy does. */
  disabled?: boolean
  /** Adds an alpha slider under the hue strip. With this set, every value in
   *  and out — the constructor's `hex`, `onChange`, `getValue`/`setValue` —
   *  may carry alpha: `#rrggbbaa`, `rgba()`/`hsla()`, or plain hex (opaque).
   *  Output is always the shortest form: plain hex at full opacity,
   *  `rgba()` otherwise. Not in the ported original (slides' colorAlpha used
   *  to track opacity in a sibling number input; see docs/DECISIONS.md). */
  alpha?: boolean
  /** Theme swatches shown in a "Theme" row inside the popover. */
  palette?: ColorPickerPaletteEntry[]
  /** Fired when a theme swatch is clicked — the caller decides whether that
   *  means "link this property to the slot" (setRef) or just "use this
   *  colour". Not fired for a manual pick — see `onChange` for that. */
  onPickPalette?: (hex: string, slot: string) => void
  /** An OFF state: a "Default" button inside the popover, for a value that
   *  can legitimately be unset rather than any particular colour. `hex: ''`
   *  is what "unset" looks like to this primitive. */
  nullable?: {
    clearTitle: string
    onClear: () => void
  }
}

export interface ColorPicker {
  /** The swatch button itself — nothing wraps it; the `nullable` "Default"
   *  control lives inside the popover, not beside the swatch. */
  el: HTMLElement
  getValue(): string
  setValue(hex: string): void
}

const RECENTS_KEY = 'bento-recent-colors'
const MAX_RECENTS = 10

function readRecents(): string[] {
  return lsJson<string[]>(RECENTS_KEY, [])
}

function pushRecent(hex: string) {
  const cur = readRecents().filter((h) => h.toLowerCase() !== hex.toLowerCase())
  cur.unshift(hex)
  lsSetJson(RECENTS_KEY, cur.slice(0, MAX_RECENTS))
}

// --- hsv <-> hex --------------------------------------------------------------

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  const n = m ? parseInt(m[1], 16) : 0
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const v = max
  const s = max === 0 ? 0 : d / max
  return { h, s, v }
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  const byte = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${byte(r)}${byte(g)}${byte(b)}`
}

function isValidHex(v: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(v.trim())
}

// --- display formats: hex / rgb() / hsl() -------------------------------------
// The model only ever stores hex (alpha, where it exists, is carried
// separately by the caller), so these are purely how the text field reads
// and parses — every format still round-trips to the same stored value.

type ColorFormat = 'hex' | 'rgb' | 'hsl'
const FORMATS: ColorFormat[] = ['hex', 'rgb', 'hsl']

function hexToRgbParts(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  const n = m ? parseInt(m[1], 16) : 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const byte = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${byte(r)}${byte(g)}${byte(b)}`
}

function hexToHslParts(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgbParts(hex).map((n) => n / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, Math.round(l * 100)]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
}

function hslToHex(h: number, s: number, l: number): string {
  const sf = s / 100, lf = l / 100
  const c = (1 - Math.abs(2 * lf - 1)) * sf
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lf - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

function formatValue(hex: string, format: ColorFormat): string {
  if (format === 'hex') return hex
  if (format === 'rgb') { const [r, g, b] = hexToRgbParts(hex); return `rgb(${r}, ${g}, ${b})` }
  const [h, s, l] = hexToHslParts(hex)
  return `hsl(${h}, ${s}%, ${l}%)`
}

function parseAlphaToken(tok: string): number {
  const pct = tok.endsWith('%')
  const n = parseFloat(tok)
  if (!Number.isFinite(n)) return 1
  return Math.min(1, Math.max(0, pct ? n / 100 : n))
}

/** Accepts hex6/hex8, rgb()/rgba(), hsl()/hsla(), and bare "r, g, b" —
 *  regardless of which format tab is active, so pasting a colour from
 *  elsewhere just works. Alpha defaults to fully opaque when the input
 *  carries none. */
function parseColorA(raw: string): { hex: string; a: number } | null {
  const v = raw.trim()
  if (/^#[0-9a-f]{8}$/i.test(v)) return { hex: v.slice(0, 7).toLowerCase(), a: parseInt(v.slice(7, 9), 16) / 255 }
  if (/^#[0-9a-f]{6}$/i.test(v)) return { hex: v.toLowerCase(), a: 1 }
  if (/^#[0-9a-f]{3}$/i.test(v)) return { hex: '#' + [...v.slice(1)].map((c) => c + c).join('').toLowerCase(), a: 1 }
  let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/i.exec(v)
  if (m) return { hex: rgbToHex(+m[1], +m[2], +m[3]), a: m[4] !== undefined ? parseAlphaToken(m[4]) : 1 }
  m = /^hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?(?:[,\s/]+([\d.]+%?))?/i.exec(v)
  if (m) return { hex: hslToHex(+m[1], +m[2], +m[3]), a: m[4] !== undefined ? parseAlphaToken(m[4]) : 1 }
  m = /^([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)$/.exec(v)
  if (m) return { hex: rgbToHex(+m[1], +m[2], +m[3]), a: 1 }
  return null
}

function parseAnyColor(raw: string): string | null {
  return parseColorA(raw)?.hex ?? null
}

/** `a >= 1` collapses to plain hex (the shortest form); otherwise `rgba()` —
 *  the same convention slides' own combineColor (panels.ts) already used. */
function composeAlpha(hex: string, a: number): string {
  if (a >= 1) return hex
  const [r, g, b] = hexToRgbParts(hex)
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`
}

// Inline rather than importing either app's ICONS — see this file's header.
const EYEDROPPER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>'

export function createColorPicker(
  hex: string,
  onChange: (hex: string, final: boolean) => void,
  opts: ColorPickerOpts,
): ColorPicker {
  const isSet = !!hex
  let value: string
  let alpha = 1
  if (opts.alpha) {
    const parsed = parseColorA(hex) ?? (opts.fallback ? parseColorA(opts.fallback) : null)
    value = parsed ? parsed.hex : '#000000'
    alpha = parsed ? parsed.a : 1
  } else {
    value = isValidHex(hex) ? hex.toLowerCase() : (opts.fallback && isValidHex(opts.fallback) ? opts.fallback.toLowerCase() : '#000000')
  }
  let hsv = hexToHsv(value)
  let format: ColorFormat = 'hex'

  const composeOutput = () => opts.alpha ? composeAlpha(value, alpha) : value

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'bkcp-swatch'
  btn.title = opts.labels.choose
  btn.disabled = !!opts.disabled

  let pop: HTMLElement | null = null
  let detach: (() => void) | null = null

  const close = () => {
    detach?.()
    detach = null
    pop?.remove()
    pop = null
  }

  // `--bkcp-a` defaults to 0 in the stylesheet, so an untouched swatch (never
  // painted below) shows the plain checkerboard — doing double duty as both
  // the "unset" indicator and the alpha<1 preview.
  const setSwatch = () => {
    const [r, g, b] = hexToRgbParts(value)
    btn.style.setProperty('--bkcp-rgb', `${r} ${g} ${b}`)
    btn.style.setProperty('--bkcp-a', String(opts.alpha ? alpha : 1))
  }
  if (isSet) setSwatch()

  btn.addEventListener('click', () => {
    if (pop) { close(); return }
    open()
  })

  function open() {
    pop = document.createElement('div')
    pop.className = 'bkcp-pop'
    // Set once `opts.nullable` is in play and the user picks a colour by any
    // path — not just `isSet` at open time, which would otherwise leave
    // Default permanently disabled for a field that started unset and was
    // set within this same popover session.
    let resetBtn: HTMLButtonElement | null = null
    const markSet = () => { if (resetBtn) resetBtn.disabled = !!opts.disabled }

    // saturation/value square, hue read from `hsv.h`
    const sv = document.createElement('div')
    sv.className = 'bkcp-sv'
    const svDot = document.createElement('div')
    svDot.className = 'bkcp-svdot'
    sv.appendChild(svDot)
    const paintSv = () => { sv.style.setProperty('--hue', String(hsv.h)) }
    const placeDot = () => {
      svDot.style.left = `${hsv.s * 100}%`
      svDot.style.top = `${(1 - hsv.v) * 100}%`
    }

    const hue = document.createElement('div')
    hue.className = 'bkcp-hue'
    const hueThumb = document.createElement('div')
    hueThumb.className = 'bkcp-huethumb'
    hue.appendChild(hueThumb)
    const placeHue = () => { hueThumb.style.left = `${(hsv.h / 360) * 100}%` }

    // alpha strip — a checkerboard with a transparent→opaque-colour gradient
    // on top (the colour layer comes from `--bkcp-rgb`, same custom property
    // the swatch itself uses, kept in sync by paintAlpha below).
    let alphaRow: HTMLDivElement | null = null
    let alphaThumb: HTMLDivElement | null = null
    const paintAlpha = () => {
      const [r, g, b] = hexToRgbParts(value)
      alphaRow?.style.setProperty('--bkcp-rgb', `${r} ${g} ${b}`)
    }
    const placeAlphaThumb = () => { if (alphaThumb) alphaThumb.style.left = `${alpha * 100}%` }
    if (opts.alpha) {
      alphaRow = document.createElement('div')
      alphaRow.className = 'bkcp-alpha'
      alphaThumb = document.createElement('div')
      alphaThumb.className = 'bkcp-alphathumb'
      alphaRow.appendChild(alphaThumb)
    }

    const hexRow = document.createElement('div')
    hexRow.className = 'bkcp-hexrow'
    const hexInput = document.createElement('input')
    hexInput.type = 'text'
    hexInput.className = 'bkcp-hex'
    hexInput.spellcheck = false
    hexInput.value = formatValue(value, format)
    hexRow.appendChild(hexInput)
    // Feature-checked: EyeDropper is Chromium-only (as of this writing, no
    // Firefox/Safari support) — omit the button entirely rather than show one
    // that always fails.
    if ('EyeDropper' in window) {
      const eye = document.createElement('button')
      eye.type = 'button'
      eye.className = 'bkcp-eye'
      eye.title = opts.labels.eyedropper
      eye.innerHTML = EYEDROPPER_SVG
      eye.addEventListener('click', async () => {
        try {
          // @ts-expect-error EyeDropper is not in the DOM lib yet
          const res = await new window.EyeDropper().open()
          if (res?.sRGBHex) commit(res.sRGBHex, true)
        } catch { /* cancelled */ }
      })
      hexRow.appendChild(eye)
    }

    const fmtRow = document.createElement('div')
    fmtRow.className = 'bkcp-fmtrow'
    const fmtBtns = new Map<ColorFormat, HTMLButtonElement>()
    for (const f of FORMATS) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'bkcp-fmtbtn' + (f === format ? ' bkcp-fmtbtn-on' : '')
      b.textContent = f.toUpperCase()
      b.addEventListener('click', () => {
        format = f
        for (const [k, el] of fmtBtns) el.classList.toggle('bkcp-fmtbtn-on', k === format)
        hexInput.value = formatValue(value, format)
      })
      fmtBtns.set(f, b)
      fmtRow.appendChild(b)
    }

    pop.append(sv, hue)
    if (alphaRow) pop.append(alphaRow)
    pop.append(hexRow, fmtRow)

    if (opts.palette?.length) {
      const label = document.createElement('div')
      label.className = 'bkcp-label'
      label.textContent = opts.labels.theme
      const row = document.createElement('div')
      row.className = 'bkcp-swatches'
      for (const sw of opts.palette) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'bkcp-swatch2' + (sw.active ? ' bkcp-swatch2-on' : '')
        b.style.background = sw.hex
        b.title = sw.slot
        b.addEventListener('click', () => {
          value = sw.hex
          hsv = hexToHsv(value)
          hexInput.value = formatValue(value, format)
          setSwatch(); paintSv(); placeDot(); placeHue(); paintAlpha()
          markSet()
          opts.onPickPalette?.(composeOutput(), sw.slot)
          close()
        })
        row.appendChild(b)
      }
      pop.append(label, row)
    }

    const recents = readRecents()
    if (recents.length) {
      const label = document.createElement('div')
      label.className = 'bkcp-label'
      label.textContent = opts.labels.recent
      const row = document.createElement('div')
      row.className = 'bkcp-swatches'
      for (const h of recents) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'bkcp-swatch2'
        b.style.background = h
        b.title = h
        b.addEventListener('click', () => { commit(h, true); close() })
        row.appendChild(b)
      }
      pop.append(label, row)
    }

    // The OFF state lives here, not as a control beside the swatch — a
    // caret-less button inside the popover reads as "reset this field",
    // where an external "×" read as "clear the swatch" (easy to mistake for
    // "pick black"). Disabled once already off: nothing to reset to.
    if (opts.nullable) {
      resetBtn = document.createElement('button')
      resetBtn.type = 'button'
      resetBtn.className = 'bkcp-default'
      resetBtn.textContent = opts.nullable.clearTitle
      resetBtn.disabled = !isSet || !!opts.disabled
      resetBtn.addEventListener('click', () => { opts.nullable!.onClear(); close() })
      pop.append(resetBtn)
    }

    const commit = (h: string, final: boolean) => {
      if (!isValidHex(h)) return
      value = h.toLowerCase()
      hsv = hexToHsv(value)
      hexInput.value = formatValue(value, format)
      setSwatch(); paintSv(); placeDot(); placeHue(); paintAlpha()
      markSet()
      onChange(composeOutput(), final)
      if (final) pushRecent(value)
    }

    // SV square drag
    const dragSv = (ev: PointerEvent) => {
      const r = sv.getBoundingClientRect()
      const s = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width))
      const v = 1 - Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))
      hsv = { ...hsv, s, v }
      value = hsvToHex(hsv.h, hsv.s, hsv.v)
      hexInput.value = formatValue(value, format)
      setSwatch(); placeDot()
    }
    sv.addEventListener('pointerdown', (ev) => {
      sv.setPointerCapture(ev.pointerId)
      dragSv(ev)
      markSet()
      onChange(composeOutput(), false)
      const move = (mv: PointerEvent) => { dragSv(mv); onChange(composeOutput(), false) }
      const up = () => {
        sv.removeEventListener('pointermove', move)
        sv.removeEventListener('pointerup', up)
        onChange(composeOutput(), true)
        pushRecent(value)
      }
      sv.addEventListener('pointermove', move)
      sv.addEventListener('pointerup', up)
    })

    // hue strip drag
    const dragHue = (ev: PointerEvent) => {
      const r = hue.getBoundingClientRect()
      const h = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * 360
      hsv = { ...hsv, h }
      value = hsvToHex(hsv.h, hsv.s, hsv.v)
      hexInput.value = formatValue(value, format)
      setSwatch(); paintSv(); placeHue(); paintAlpha()
    }
    hue.addEventListener('pointerdown', (ev) => {
      hue.setPointerCapture(ev.pointerId)
      dragHue(ev)
      markSet()
      onChange(composeOutput(), false)
      const move = (mv: PointerEvent) => { dragHue(mv); onChange(composeOutput(), false) }
      const up = () => {
        hue.removeEventListener('pointermove', move)
        hue.removeEventListener('pointerup', up)
        onChange(composeOutput(), true)
        pushRecent(value)
      }
      hue.addEventListener('pointermove', move)
      hue.addEventListener('pointerup', up)
    })

    // alpha strip drag — same shape as the hue strip, but writes `alpha`
    // instead of `hsv.h` and never touches recents (opacity isn't "a colour").
    if (alphaRow) {
      const dragAlpha = (ev: PointerEvent) => {
        const r = alphaRow!.getBoundingClientRect()
        alpha = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width))
        setSwatch(); placeAlphaThumb()
      }
      alphaRow.addEventListener('pointerdown', (ev) => {
        alphaRow!.setPointerCapture(ev.pointerId)
        dragAlpha(ev)
        markSet()
        onChange(composeOutput(), false)
        const move = (mv: PointerEvent) => { dragAlpha(mv); onChange(composeOutput(), false) }
        const up = () => {
          alphaRow!.removeEventListener('pointermove', move)
          alphaRow!.removeEventListener('pointerup', up)
          onChange(composeOutput(), true)
        }
        alphaRow!.addEventListener('pointermove', move)
        alphaRow!.addEventListener('pointerup', up)
      })
    }

    hexInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') hexInput.blur() })
    hexInput.addEventListener('blur', () => {
      if (opts.alpha) {
        const parsed = parseColorA(hexInput.value)
        if (!parsed) { hexInput.value = formatValue(value, format); return }
        value = parsed.hex
        alpha = parsed.a
        hsv = hexToHsv(value)
        hexInput.value = formatValue(value, format)
        setSwatch(); paintSv(); placeDot(); placeHue(); paintAlpha(); placeAlphaThumb()
        markSet()
        onChange(composeOutput(), true)
        pushRecent(value)
      } else {
        const parsed = parseAnyColor(hexInput.value)
        if (parsed) commit(parsed, true)
        else hexInput.value = formatValue(value, format) // reject and restore
      }
    })

    paintSv(); placeDot(); placeHue(); paintAlpha(); placeAlphaThumb()

    document.body.appendChild(pop)
    // measure real size, clamp inside the viewport (never off top/left either)
    const r = btn.getBoundingClientRect()
    const pw = pop.offsetWidth, ph = pop.offsetHeight
    const pad = 8
    let left = r.left
    let top = r.bottom + 4
    if (left + pw > window.innerWidth - pad) left = window.innerWidth - pad - pw
    if (top + ph > window.innerHeight - pad) top = r.top - ph - 4
    left = Math.max(pad, left)
    top = Math.max(pad, top)
    pop.style.left = `${left}px`
    pop.style.top = `${top}px`

    const onDown = (ev: Event) => {
      if (pop && !pop.contains(ev.target as Node) && ev.target !== btn) close()
    }
    document.addEventListener('pointerdown', onDown, true)
    detach = () => document.removeEventListener('pointerdown', onDown, true)
  }

  return {
    el: btn,
    getValue: () => composeOutput(),
    setValue: (h: string) => {
      if (opts.alpha) {
        const parsed = parseColorA(h)
        if (!parsed) return
        value = parsed.hex
        alpha = parsed.a
      } else {
        if (!isValidHex(h)) return
        value = h.toLowerCase()
      }
      hsv = hexToHsv(value)
      setSwatch()
    },
  }
}
