// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
/**
 * A CSS-selector-shaped DOM builder — shared by all four apps' editor UI
 * code, not Emmet (no >/+/^/* operators, no nesting: this only ever builds
 * ONE node at a time). Each app's editor builds thousands of elements by
 * hand — `createElement`, then one property assignment per line; this
 * collapses the common case into a single call:
 *
 *   h('input.ed-row-input', { type: 'url', placeholder: 'https://…', value, onchange })
 *
 * GRAMMAR (deliberately this small — not a CSS selector parser): an
 * optional leading tag name (`[\w-]*`, missing = 'div'), then any number of
 * `.class`, `#id` (last one wins), and `[attr]` / `[attr=value]` /
 * `[attr="quoted value"]` pieces, in any order. No single-quoted values, no
 * unescaped spaces in an unquoted value, no combinators. A malformed
 * abbreviation (anything left over that doesn't match one of those pieces)
 * THROWS rather than silently dropping the unparsed tail.
 *
 * `props` sets element PROPERTIES directly (native handlers like
 * `onchange`/`onclick` are already properties on the element, so no
 * special-casing is needed for events), falling back to `setAttribute` for
 * anything not already a property; `dataset`/`style`/`className` MERGE
 * instead of overwriting, so `className` in props adds to the
 * abbreviation's own classes rather than replacing them. Assigning over a
 * METHOD (`{ click: fn }`, `{ focus: fn }`, …) THROWS instead of silently
 * shadowing it — DOM operations are writable, ordinary-looking properties,
 * so `'click' in el` is true and a typo'd prop would otherwise replace the
 * method with a non-function value with no error anywhere near the mistake.
 *
 * The return type is inferred from the leading tag name when it names a
 * known HTML element — `TagOf` walks the string char-by-char in the type
 * system so it agrees with the runtime tag extraction exactly (an element
 * with no tag but an id/class first, `.foo`/`#foo`, correctly falls back to
 * the generic `HTMLElement` type rather than misreading part of the
 * abbreviation as a tag name).
 */

type TagOf<S extends string, Acc extends string = ''> =
  S extends `${infer C}${infer Rest}`
    ? C extends '.' | '#' | '['
      ? Acc
      : TagOf<Rest, `${Acc}${C}`>
    : Acc

type ElOf<S extends string> = TagOf<S> extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[TagOf<S>] : HTMLElement

type HProps<E extends HTMLElement> = Partial<Omit<E, 'dataset' | 'style'>> & {
  dataset?: Record<string, string>
  /** Plain CSS properties only — not `Partial<CSSStyleDeclaration>`, which
   *  also carries methods (`setProperty`, …) that `Object.assign` would
   *  silently shadow on the live style object exactly like the method-
   *  clobber case props guards against below. */
  style?: Record<string, string | number>
}

// .class | #id | [attr] | [attr=val] | [attr="quoted value"] — anchored so a
// leftover unparsed tail (a typo, an unsupported quote style) is detectable
// by comparing consumed length against the input instead of by silently
// stopping.
const ABBR_PIECE = /\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:=("[^"]*"|[^\]]*))?\]/y

export function h<S extends string>(abbr: S, props: HProps<ElOf<S>> = {} as HProps<ElOf<S>>): ElOf<S> {
  const tagMatch = abbr.match(/^[\w-]*/)!
  const tag = (tagMatch[0] || 'div').toLowerCase()
  const rest = abbr.slice(tagMatch[0].length)
  const el = document.createElement(tag)

  const classes: string[] = []
  ABBR_PIECE.lastIndex = 0
  let m: RegExpExecArray | null
  while (ABBR_PIECE.lastIndex < rest.length) {
    m = ABBR_PIECE.exec(rest)
    if (!m) throw new Error(`h(): unparsable abbreviation "${abbr}" (stuck at "${rest.slice(ABBR_PIECE.lastIndex)}")`)
    if (m[1]) classes.push(m[1])
    else if (m[2]) el.id = m[2]
    else if (m[3]) el.setAttribute(m[3], (m[4] ?? '').replace(/^"|"$/g, ''))
  }

  for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
    if (v === undefined) continue
    if (k === 'className') classes.push(...String(v).split(/\s+/).filter(Boolean))
    else if (k === 'dataset') Object.assign(el.dataset, v as Record<string, string>)
    else if (k === 'style') Object.assign(el.style, v as Record<string, string>)
    else if (k in el) {
      const existing = (el as unknown as Record<string, unknown>)[k]
      if (typeof existing === 'function') {
        throw new Error(`h(): "${k}" is a method on <${tag}> — call it directly or use addEventListener, it can't be passed as a prop`)
      }
      (el as unknown as Record<string, unknown>)[k] = v
    }
    else el.setAttribute(k, String(v))
  }
  if (classes.length) el.className = classes.join(' ')

  return el as ElOf<S>
}
