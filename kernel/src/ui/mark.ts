// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// THE SUITE'S MARK — one drawing of it, for every place it appears: each app's
// top bar, the app card, and the favicon (kernel/vite/favicon.ts puts it in
// every app's <head> at build time). Each app used to carry its own copy of
// these four rects, and slides' favicon was a fifth, slightly different one;
// hand-kept copies of a logo drift.

const RECTS =
  '<rect width="32" height="32" rx="7" fill="#16273E"/>' +
  '<rect x="5" y="5" width="7" height="22" rx="2.5" fill="#5E7699"/>' +
  '<rect x="14" y="5" width="13" height="10" rx="2.5" fill="#FF9E8A"/>' +
  '<rect x="14" y="17" width="13" height="10" rx="2.5" fill="#F0EBE0"/>'

/** The mark as inline SVG, `size` px square; `cls` is the host app's class. */
export const BENTO_MARK_SVG = (size = 20, cls = 'bk-mark-svg'): string =>
  `<svg class="${cls}" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">${RECTS}</svg>`

/** "bento/slides" with the peach slash — the wordmark, as markup. */
export const wordmarkHtml = (app: string, cls = 'bk-wordmark'): string =>
  `<b class="${cls}">bento<span class="bk-slash">/</span>${app}</b>`

/** The favicon: the same mark as a data: URI (a Bento file fetches nothing). */
// Encoded the short way — single quotes, and only < > # escaped — because it
// ships uncompressed in every file's <head>: encodeURIComponent made it twice
// the size for nothing a browser needs.
export const BENTO_FAVICON_HREF =
  'data:image/svg+xml,' +
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>${RECTS}</svg>`
    .replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23')
