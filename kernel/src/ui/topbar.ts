// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// FIT A TOP BAR TO ITS WIDTH BY MEASURING IT — the algorithm slides, spaces
// and type each carried a copy of.
//
// Breakpoints in px are the wrong tool for a toolbar: browser zoom, OS text
// scaling, a longer translation and live content (avatars joining, an update
// chip, a "Saved" tag) all change how much room the SAME buttons need at the
// SAME viewport width, and every one of those used to clip the end of a bar.
// So this starts from the widest layout and steps down a tier only while the
// bar is still cramped. The tiers are the host's own classes — what each one
// hides is the host's CSS; folding buttons into a menu is the host's
// `onFold`. This file owns only the measuring and the signals that re-run it.
//
// CRAMPED is overflow OR a squeezed title: the title input is the bar's one
// shrinkable item, so flexbox crushes it to its floor before anything
// technically overflows, and waiting for hard overflow would leave full
// labels beside an unusable title. `scrollWidth - clientWidth > 1` IS the
// clipped-controls condition (scrollWidth counts content sticking out of the
// padding box even with overflow visible); the 1px absorbs subpixel rounding
// at fractional zoom.
//
// THREE SIGNALS, deliberately (each app learned one of them the hard way):
// a ResizeObserver on the bar (every viewport change, including a phone
// rotating, where matchMedia events do not fire under a driven viewport); a
// window `resize` (RO callbacks are throttled while a page is not painting —
// a background tab, a hidden preview — and the bar then stayed untiered); and
// a MutationObserver (the bar's CONTENT changes width at a constant viewport
// without resizing the bar's own box). The fit's own class flips and
// reparenting queue mutation records too; they are dropped after every run,
// or the observer would re-run this forever.

export interface TopbarFitOpts {
  /** The host's tier classes, mildest first (e.g. labels hidden → wordmark
   *  hidden → folded into menus). The LAST one is the fold. */
  tiers: string[]
  /** Called when the fold tier is entered or left — move buttons into a menu
   *  and back. Only called on a change. */
  onFold?: (folded: boolean) => void
  /** The bar's shrinkable title, and the width below which it counts as
   *  squeezed. Omit to measure overflow alone. */
  title?: HTMLElement | null
  titleMin?: number
  /** Fold only on real overflow, not on a squeezed title (slides' rule:
   *  the earlier tiers already rescue the title). Default: fold when cramped. */
  foldOnOverflowOnly?: boolean
  /** Applied after every tier if the bar is STILL cramped — the title has
   *  nowhere left to shrink to (type's `t-bar-micro`). */
  lastResort?: string
  /** At or below this viewport width every tier applies, folded, without
   *  measuring (a phone). */
  foldBelow?: number
  /** Return true to skip a re-fit — e.g. a dropdown is open, and re-fitting
   *  starts by unfolding, which would reparent the menu under its reader. The
   *  next signal runs it again. */
  hold?: () => boolean
}

export interface TopbarFit {
  /** Re-measure now (the host calls this once its bar is fully assembled —
   *  a fit run against a half-built bar is wrong and nothing re-triggers it). */
  refit(): void
  readonly folded: boolean
  /** Disconnect every observer and listener. */
  destroy(): void
}

export function fitTopbar(bar: HTMLElement, opts: TopbarFitOpts): TopbarFit {
  const { tiers } = opts
  const all = opts.lastResort ? [...tiers, opts.lastResort] : tiers
  let folded = false
  const setFolded = (next: boolean): void => {
    if (next === folded) return
    folded = next
    opts.onFold?.(next)
  }

  const overflow = (): boolean => bar.scrollWidth - bar.clientWidth > 1
  const squeezed = (): boolean =>
    !!opts.title && opts.title.getBoundingClientRect().width < (opts.titleMin ?? 0)
  const cramped = (): boolean => overflow() || squeezed()

  let mo: MutationObserver | null = null
  function refit(): void {
    if (!bar.isConnected) return
    if (opts.foldBelow !== undefined && window.innerWidth <= opts.foldBelow) {
      bar.classList.add(...tiers)
      setFolded(true)
    } else if (!opts.hold?.()) {
      bar.classList.remove(...all)
      setFolded(false)
      for (let i = 0; i < tiers.length; i++) {
        const last = i === tiers.length - 1
        if (!(last && opts.foldOnOverflowOnly ? overflow() : cramped())) break
        bar.classList.add(tiers[i])
        if (last) setFolded(true)
      }
      if (opts.lastResort && folded && cramped()) bar.classList.add(opts.lastResort)
    }
    mo?.takeRecords()
  }

  const ro = new ResizeObserver(() => refit())
  ro.observe(bar)
  window.addEventListener('resize', refit)
  mo = new MutationObserver(() => refit())
  mo.observe(bar, {
    childList: true, subtree: true, characterData: true,
    // NOT 'class': the tier flips are class changes on this very element.
    attributes: true, attributeFilter: ['style', 'hidden'],
  })
  refit()

  return {
    refit,
    get folded() { return folded },
    destroy(): void {
      ro.disconnect()
      mo?.disconnect()
      window.removeEventListener('resize', refit)
    },
  }
}
