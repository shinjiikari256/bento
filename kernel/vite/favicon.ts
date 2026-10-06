// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// Build-time: put the suite's favicon into an app's index.html — the same mark
// the bar draws (kernel/src/ui/mark.ts). An existing <link rel="icon"> is
// replaced, so no app keeps a private copy. postbuild-compress carries the
// link into the shipped shell's <head>, where a browser tab sees it before any
// script runs.
//
// A plain object rather than a typed vite Plugin: the kernel has no vite
// dependency of its own; each app's vite.config passes it to `plugins`.

import { BENTO_FAVICON_HREF } from '../src/ui/mark.ts'

export function bentoFavicon() {
  const link = `<link rel="icon" href="${BENTO_FAVICON_HREF}" />`
  return {
    name: 'bento-favicon',
    transformIndexHtml(html: string): string {
      const without = html.replace(/\s*<link rel="icon"[^>]*\/?>/g, '')
      return without.replace(/<title>/, `${link}\n    <title>`)
    },
  }
}
