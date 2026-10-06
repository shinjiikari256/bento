// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Minimal inline icon set (lucide-style, stroke = currentColor). No deps.
//
// Per-app, as slides/src/icons.ts and spaces/src/icons.ts are: each app needs a
// different dozen and a shared superset would ship every app the others' icons.
// The RECIPE is shared and must not drift — 24x24 box, 16px render, stroke
// currentColor at width 2, round caps and joins — because these sit beside each
// other in one suite and a heavier stroke reads as a different product.

import { CHROME_ICONS } from '../../kernel/src/ui/icons.ts';

const svg = (body: string, viewBox = '0 0 24 24') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  // the suite's chrome icons (kernel/src/ui/icons.ts); this app's own follow
  ...CHROME_ICONS,
  // chrome — the same glyphs slides uses for the same jobs, so a person who
  // learns one app has already learned these














  // formatting — a word processor's own vocabulary
  bold: svg('<path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/>'),
  italic: svg('<line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>'),
  underline: svg('<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="21" x2="20" y2="21"/>'),
  strike: svg('<path d="M16 4H9a3 3 0 0 0-2 5"/><path d="M14 12a3 3 0 0 1-2 5H8"/><line x1="3" y1="12" x2="21" y2="12"/>'),
  code: svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  bullets: svg('<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.4" fill="currentColor" stroke="none"/>'),
  numbers: svg('<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><path d="M3 8V4l-1 .8"/><path d="M2 12h3l-3 4h3" stroke-width="1.6"/>'),
  indent: svg('<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><polyline points="3 8 6 12 3 16"/>'),
  outdent: svg('<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><polyline points="6 8 3 12 6 16"/>'),
  image: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5L6 21"/>'),
  table: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="10" x2="9" y2="20"/><line x1="15" y1="10" x2="15" y2="20"/>'),

  // document furniture
  note: svg('<path d="M4 4h16v12H8l-4 4z"/>'),
  sign: svg('<path d="M3 17c3 0 3-10 6-10s3 10 6 10 3-6 6-6"/><line x1="3" y1="21" x2="21" y2="21"/>'),
  review: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
} as const;

export type IconName = keyof typeof ICONS;
