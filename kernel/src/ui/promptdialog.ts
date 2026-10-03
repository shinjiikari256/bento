// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// THE SHARED PROMPT/CONFIRM primitive — built ON TOP of createDialog
// (kernel/src/ui/dialog.ts), not a copy of it: content is a form/message,
// actions are [Cancel, OK]/[Cancel, Confirm], and everything about being a
// modal (focus trap, role=dialog/aria-modal/aria-labelledby, Escape/
// backdrop dismissal, a z-index above the topbar's ceiling) is createDialog's
// already.
//
// WHY THIS EXISTS AT ALL, rather than `window.prompt`/`window.confirm`.
// dash's own pre-primitive replacement (askForm, main.ts) put it plainly:
// native modals are not available everywhere a self-contained HTML file is
// opened — embedded webviews (Slack, Teams, an iOS mail preview), sandboxed
// iframes without `allow-modals`, any tab where the reader has ticked
// "prevent this page from creating additional dialogs". In the return-null
// variant a button is simply dead; in the throwing variant a click handler
// dies half-way through. `window.prompt` also cannot do what a real form
// needs anyway: more than one field, an error that appears as the reader
// types rather than after they commit, a hint line, a monospace field for a
// formula/id read character by character.
//
// Every label here is a REQUIRED string from the caller, never a hardcoded
// English default — this file has no i18n of its own (kernel does not
// import an app's `t()`), so "Cancel"/"OK" would otherwise be the one
// untranslated string in an otherwise-localized dialog.

import { createDialog } from './dialog.ts'
import { fieldize } from './field.ts'
import './promptdialog.css'

export interface PromptField {
  key: string
  label: string
  value?: string
  placeholder?: string
  /** a formula or id is read character by character; prose is not */
  mono?: boolean
  /** masked input — a password. Defaults to a plain text field. */
  password?: boolean
}

export interface PromptOpts {
  title: string
  fields: PromptField[]
  cancelLabel: string
  submitLabel: string
  /** shown under the fields, in the body's own muted tone */
  hint?: string
  /**
   * Runs on every keystroke: return a message to block submission (shown
   * inline, and disables the submit button) or `null` to allow it.
   */
  check?: (values: Record<string, string>) => string | null
}

export interface ConfirmOpts {
  title?: string
  message: string
  cancelLabel: string
  confirmLabel: string
  /** the confirm button reads as destructive (`.bkp-btn-danger`) */
  danger?: boolean
}

/** Resolves with the field values, or `null` if the reader cancelled. */
export function promptDialog(opts: PromptOpts): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (v: Record<string, string> | null): void => {
      if (settled) return
      settled = true
      dlg.close()
      resolve(v)
    }

    const body = document.createElement('div')
    body.className = 'bkp-body'

    const inputs: Record<string, HTMLInputElement> = {}
    for (const f of opts.fields) {
      const row = document.createElement('label')
      row.className = 'bkp-row'
      const lab = document.createElement('span')
      lab.textContent = f.label
      const inp = document.createElement('input')
      if (f.password) { inp.type = 'password'; inp.autocomplete = 'new-password' }
      inp.value = f.value ?? ''
      if (f.placeholder) inp.placeholder = f.placeholder
      inp.spellcheck = false
      fieldize(inp)
      if (f.mono) inp.classList.add('bkp-mono')
      row.append(lab, inp)
      body.append(row)
      inputs[f.key] = inp
    }

    if (opts.hint) {
      const hint = document.createElement('p')
      hint.className = 'bkp-hint'
      hint.textContent = opts.hint
      body.append(hint)
    }

    const err = document.createElement('p')
    err.className = 'bkp-err'
    err.hidden = true
    body.append(err)

    const values = (): Record<string, string> => {
      const out: Record<string, string> = {}
      for (const k of Object.keys(inputs)) out[k] = inputs[k].value
      return out
    }
    const validate = (): boolean => {
      const msg = opts.check ? opts.check(values()) : null
      err.hidden = !msg
      err.textContent = msg ?? ''
      submitBtn.disabled = !!msg
      return !msg
    }

    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'bkp-btn'
    cancelBtn.textContent = opts.cancelLabel
    cancelBtn.addEventListener('click', () => finish(null))

    const submitBtn = document.createElement('button')
    submitBtn.type = 'button'
    submitBtn.className = 'bkp-btn bkp-btn-primary'
    submitBtn.textContent = opts.submitLabel
    submitBtn.addEventListener('click', () => { if (validate()) finish(values()) })

    for (const k of Object.keys(inputs)) {
      inputs[k].addEventListener('input', validate)
      // Enter submits from any field — createDialog's own keydown handler
      // stops this from also reaching whatever is behind the dialog.
      inputs[k].addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && validate()) { e.preventDefault(); finish(values()) }
      })
    }

    const dlg = createDialog({
      title: opts.title,
      content: body,
      actions: [cancelBtn, submitBtn],
      onClose: () => finish(null),
    })
    dlg.open()
    validate()
    const first = inputs[opts.fields[0]?.key]
    first?.focus()
    first?.select()
  })
}

/** Resolves `true` on confirm, `false` on cancel/Escape/backdrop. */
export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (v: boolean): void => {
      if (settled) return
      settled = true
      dlg.close()
      resolve(v)
    }

    const body = document.createElement('p')
    body.className = 'bkp-msg'
    body.textContent = opts.message

    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'bkp-btn'
    cancelBtn.textContent = opts.cancelLabel
    cancelBtn.addEventListener('click', () => finish(false))

    const confirmBtn = document.createElement('button')
    confirmBtn.type = 'button'
    confirmBtn.className = 'bkp-btn bkp-btn-primary' + (opts.danger ? ' bkp-btn-danger' : '')
    confirmBtn.textContent = opts.confirmLabel
    confirmBtn.addEventListener('click', () => finish(true))

    const dlg = createDialog({
      title: opts.title,
      label: opts.title ? undefined : opts.message,
      content: body,
      actions: [cancelBtn, confirmBtn],
      onClose: () => finish(false),
    })
    dlg.open()
  })
}
