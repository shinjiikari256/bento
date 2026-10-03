// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// A plain JSON value <-> textarea <-> value round trip, no schema.
//
// Five apps had independently written the same shape — a <textarea>, a
// try/catch JSON.parse, and SOME visible sign that the text does not
// parse — for two different jobs: an "Advanced (JSON)" escape hatch next
// to a structured editor (slides' chart option) and a whole-document
// "Replace from JSON…" paste box (dash/spaces/slides/type's own About
// dialogs). The two jobs commit on different rhythms — the escape hatch
// on blur, the paste box on an explicit button click — so this primitive
// does not pick one: it wires live invalid-state feedback as the reader
// types and leaves WHEN to read the value to the caller.
//
// NO SCHEMA: this validates "is it syntactically JSON", nothing about
// shape. A caller wanting more (is it a bento/dash workbook?) runs its own
// check in `read()`'s result and reports its own error — the encyclopedia
// of document shapes belongs to each app's own parser, not here.

import { fieldize } from './field.ts'

export interface JsonEditorOpts {
  /** Pretty-printed into the textarea at creation. Omit for an empty
   *  paste box (the common "Replace from JSON…" shape). */
  value?: unknown
  rows?: number
  placeholder?: string
  spellcheck?: boolean
}

export interface JsonEditorResult {
  ok: boolean
  /** The parsed value — present only when `ok`. */
  value?: unknown
}

export interface JsonEditor {
  el: HTMLTextAreaElement
  /** Parse the textarea's current text. */
  read(): JsonEditorResult
  /** Replace the text with a pretty-printed value, and re-check it. */
  write(value: unknown): void
}

export function createJsonEditor(opts: JsonEditorOpts = {}): JsonEditor {
  const el = document.createElement('textarea')
  el.className = 'bkj-editor'
  el.spellcheck = opts.spellcheck ?? false
  if (opts.rows) el.rows = opts.rows
  if (opts.placeholder) el.placeholder = opts.placeholder
  fieldize(el)

  // An EMPTY box is "not started", not "invalid" — a fresh "Replace from
  // JSON…" paste panel must not open already showing a red border.
  const mark = () => {
    if (!el.value.trim()) { el.classList.remove('bkj-invalid'); return }
    try { JSON.parse(el.value); el.classList.remove('bkj-invalid') }
    catch { el.classList.add('bkj-invalid') }
  }
  el.addEventListener('input', mark)

  const read = (): JsonEditorResult => {
    try { return { ok: true, value: JSON.parse(el.value) } }
    catch { return { ok: false } }
  }

  const write = (value: unknown): void => {
    el.value = JSON.stringify(value, null, 2)
    mark()
  }

  if (opts.value !== undefined) write(opts.value)
  return { el, read, write }
}
