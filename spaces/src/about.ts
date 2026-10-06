// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The About surface: what this file is, what is in it, updating it, its
// language, its password, and the ways in and out of it.
//
// PLATFORM §10 requires a signed self-update path, an encryption story and an
// AI round-trip. All three live behind one button, because a self-contained
// document has nowhere else to put them.
//
// BUILT FROM SLIDES' DIALOG, deliberately. Two apps in one suite must not
// teach two different dialogs: same opening mark, same section order (what
// this is → what is in it → updates → viewer preferences → the document →
// the ways out), same register, same restraint. What differs is only what the
// app IS — a space is measured in pages, blocks and words where a deck is
// measured in slides.
//
// TWO LAYOUT RULES THIS DIALOG LIVES UNDER (CLAUDE.md, hard-won #9 and #10):
//   · The card SCROLLS (`overflow: auto`), and `overflow-y: auto` clips
//     HORIZONTALLY too — there is no such thing as scrolling one axis while
//     the other overflows visibly. So nothing in here may be a floating
//     popover: everything that opens (the update card, the replace-from-JSON
//     panel, every confirmation) opens IN FLOW as a block of the list, and the
//     card scrolls to it. A 250px popover anchored inside a scrolling menu is
//     the bug that cost this project a day in slides' phone chrome.
//   · `.sp-overlay` carries z-index 60, which is a CEILING on every descendant
//     rather than merely an order. Nothing in this dialog tries to escape it,
//     and nothing added later can be made to by raising its own z-index.

import { h } from '../../kernel/src/dom.ts'
import { appCardLinks, createSheet, openAppCard, themeSelect } from '../../kernel/src/ui/sheet.ts'
import '../../kernel/src/ui/dialog.css'
import '../../kernel/src/ui/sheet.css'
import { promptDialog } from '../../kernel/src/ui/promptdialog.ts'
import '../../kernel/src/ui/field.css'
import { createJsonEditor } from '../../kernel/src/ui/jsoneditor.ts'
import '../../kernel/src/ui/jsoneditor.css'
import {
  checkForUpdates, applyUpdate, canUpdateInPlace,
  autoCheckEnabled, setAutoCheck, compareVersions,
  APP_VERSION, type ReleaseInfo, type UpdateCheck, type InPlaceOutcome,
} from '../../kernel/src/update.ts'
import {
  setEncryptionPassword, isEncryptionActive,
  canWriteInPlace, openedFileName,
} from '../../kernel/src/save.ts'
import { clearVersions, clearRecovery, listVersions, type Snapshot } from '../../kernel/src/autosave.ts'
import { t, localeChoices, locale, setLocale } from './i18n'
import { setTheme, themeChoice } from '../../kernel/src/theme.ts'
import { offlineEnabled, setOffline } from '../../kernel/src/net.ts'
import { textOf } from './sanitize'
import { docForExport } from './model'
import { duplicateAsNew } from './share.ts'
import { htmlToMd } from './marks.ts'
import { humanBytes } from './assets'
import { SPEC, mdLayout, type MdCtx } from './blocks'
import { parseDoc, uid } from './model'
import { restoreInto } from './restoregate'
import {
  issuesOf, passesFilter, sortRows, fieldByKey, optionOf, fieldsOf,
} from './fields'
import type { Store } from './store'
import type { Block, SpacesDoc } from './model'

export interface AboutHooks {
  store: Store
  onRepaint: () => void
  /**
   * "Save a copy…", supplied by the caller.
   *
   * NOT saveFile(doc, true) here. That path assigns the picked handle to the
   * kernel's in-place handle, so every later ⌘S writes to the copy — the bug
   * fixed in the topbar's copy button, which this second button then kept
   * alive because the guard only read main.ts. One implementation, two
   * buttons, and the assertion now reads every file.
   */
  onSaveCopy: () => void
  /** open the importer — the way IN, opposite the ways out below */
  onImport?: () => void
  /** take ONE page out as a space of its own */
  onExportSpace?: () => void
  /**
   * Write a DIFFERENT document out as its own file, leaving this one open.
   * The same writer the page extract uses (keepHandle false), so a duplicate
   * never becomes the ⌘S target.
   */
  onWriteCopy?: (doc: SpacesDoc) => Promise<boolean>
  /** the editor's status line, for the confirmations that outlive the dialog */
  onStatus?: (message: string) => void
  /**
   * "Update this file" — the kernel's applyUpdateInPlace, run through main.ts's
   * save queue. NOT called directly from here: it rewrites the same file ⌘S
   * does, so the two must never be open on one handle at once, and only the
   * queue's acknowledgement may say the disk holds what is on screen.
   * null = nothing was written (cancelled, or the space was swapped).
   */
  onUpdateInPlace: (release: ReleaseInfo) => Promise<InPlaceOutcome | null>
  /**
   * Called immediately before "Download updated copy" writes THIS document
   * into a new shell — stamps the live session's CRDT state (share.ts
   * stampSync), so the updated file rejoins as a fork exactly as a ⌘S-saved
   * one does. "Update this file" is stamped inside the save queue instead.
   */
  onBeforeWrite?: () => void
  /** "Keyboard shortcuts" — Settings carries the way into help */
  onHelp?: () => void
  /** Offline mode flipped: hang up the live session, or re-join it */
  onOffline?: (on: boolean) => void
}

/**
 * Which card. ONE builder, three cards (the suite's bar layout): the mark opens
 * the APP's (which app, which version, where from), ⓘ About opens the SPACE's
 * (what is in it, its properties, password, history, ways in and out), and
 * Settings opens the READER's (updates, appearance, language, help) — what is
 * kept in this browser and never written into the file.
 */
export type AboutKind = 'app' | 'doc' | 'settings'

/**
 * The launch check's result, for the line the dialog opens on.
 *
 * Module-level and not in the doc: whether this READER checked for updates is
 * no business of the document, exactly as the locale is not.
 */
let lastAutoCheck: UpdateCheck | null = null

/**
 * Check at launch, if the reader left that on.
 *
 * The preference (`bento-auto-check`, kernel/src/update.ts) is the one slides
 * uses, so a person who turned it off in one app has turned it off in both.
 * Nothing about the reader or the document goes out with the request — it is a
 * plain GET of a signed manifest — and the dialog says so where the switch is.
 */
export async function launchUpdateCheck(): Promise<void> {
  if (!autoCheckEnabled()) return
  lastAutoCheck = await checkForUpdates()
}

export function openAbout(hooks: AboutHooks, kind: AboutKind = 'doc'): void {
  const { store, onRepaint, onSaveCopy, onImport, onExportSpace, onWriteCopy, onStatus, onUpdateInPlace, onBeforeWrite } = hooks
  const doc = store.doc

  // The mark's card is the suite's shared app card (kernel/src/ui/sheet.ts),
  // identical in every Bento app; About and Settings are shared sheets too.
  if (kind === 'app') {
    openAppCard({
      app: 'spaces', version: APP_VERSION, format: doc.version ?? 1,
      title: t('About bento/spaces — version, licenses'), closeLabel: t('Close'),
      promoHtml: t('New to Bento? Find templates, the gallery and the AI editing guide at {home} — or ⭐ it on {gh}.', appCardLinks),
      notes: [
        t('Checks contact the release server and send nothing about you or this document — no ids, no telemetry.'),
        t('bento/spaces is MIT-licensed and carries no third-party runtime — the full notices travel in this file’s source.'),
      ],
    })
    return
  }

  const sheet = createSheet({ title: kind === 'settings' ? t('Settings') : t('About this space'), closeLabel: t('Close') })
  const card = sheet.body
  const close = () => sheet.close()
  // Every block below is built in one pass and tagged with the card it belongs
  // to as it is appended; `keepOnly` drops the other card's blocks at the end.
  // One pass rather than two builders, because the blocks share the helpers,
  // `close` and the update check's state.
  const marks: Array<[number, AboutKind]> = []
  const enter = (k: AboutKind) => { marks.push([card.childElementCount, k]) }
  const keepOnly = () => {
    const kids = [...card.children]
    kids.forEach((el, i) => {
      let k: AboutKind = 'doc'
      for (const [at, mk] of marks) if (i >= at) k = mk
      if (k !== kind) el.remove()
    })
  }

  // ---- small builders: the sheet's --------------------------------------
  /** A section with a real heading, not one more control in a flat stack. */
  const section = (title: string, ...kids: Array<Node | null>) => {
    const sec = sheet.section(title)
    for (const k of kids) if (k) sec.append(k)
    return sec
  }
  const note = (text: string, cls = '') => {
    const n = sheet.note(text)
    if (cls) n.classList.add(...cls.split(' '))
    return n
  }
  const row = sheet.row
  const button = (label: string, fn: () => void, primary = false) => sheet.button(label, fn, { primary })
  const actions = sheet.actions
  const mono = sheet.value
  const check = sheet.check
  const say = (message: string) => { onStatus?.(message) }

  // ---- what is in it -----------------------------------------------------
  enter('doc')
  // The numbers a person actually wants, and then the one that explains the
  // others: where the weight is. A space is big because of its images, always,
  // and a readout that says "4.2 MB" without saying that has told you nothing
  // you can act on.
  const pages = doc.pages.length
  const blocks = doc.pages.reduce((n, p) => n + p.blocks.length, 0)
  let words = 0
  for (const p of doc.pages) {
    words += countWords(p.title)
    for (const b of p.blocks) words += countWords(textOf(b.html))
  }
  const assetBytes = Object.values(doc.assets ?? {}).reduce((n, v) => n + v.length, 0)
  const assetCount = Object.keys(doc.assets ?? {}).length
  const docBytes = byteLength(doc)

  const stats = h('div.sp-ab-stats')
  for (const [value, label] of [
    [String(pages), t('Pages')],
    [String(blocks), t('Blocks')],
    [String(words), t('Words')],
    [humanBytes(docBytes), t('Document')],
  ] as Array<[string, string]>) {
    const s = h('div.sp-ab-stat')
    const b = h('b', { textContent: value })
    const l = h('span', { textContent: label })
    s.append(b, l)
    stats.append(s)
  }

  const weight = note(
    assetCount
      ? t('{n} embedded image(s) and clip(s) account for {size} of that — {pct}%. Everything else is text.', {
        n: assetCount, size: humanBytes(assetBytes),
        pct: docBytes ? Math.round((assetBytes / docBytes) * 100) : 0,
      })
      : t('All text. Nothing is embedded, so this file is as small as a space gets.'),
  )
  const fileName = openedFileName()
  const sec1 = section(t('This file'), stats, weight)
  if (fileName) sec1.append(row(t('File'), mono(fileName)))
  sec1.append(note(t('The document, the editor and the search are all in this one file. Opening it needs nothing else — no server, no account, no install.')))
  if (!canWriteInPlace()) {
    // stated up front rather than discovered on the first save
    sec1.append(note(t('This browser cannot write back to the file, so every save makes a new copy. Chrome and Edge on a computer can save in place.')))
  }

  // ---- the document itself ------------------------------------------------
  // Its name is the one property of a space anybody edits here; the rest are
  // facts about it, shown because a file you cannot identify is a file you
  // cannot support.
  const titleIn = h('input.bks-input', { type: 'text', value: doc.title, disabled: store.readOnly })
  titleIn.addEventListener('change', () => {
    const next = titleIn.value.trim() || 'Untitled'
    titleIn.value = next
    store.runEdit('__title', () => { store.doc.title = next })
    onRepaint()
  })
  const props = section(t('Document properties'))
  props.append(row(t('Title'), titleIn))
  props.append(row(t('Document id'), mono(doc.docId)))
  if (doc.modified) props.append(row(t('Last saved'), mono(shortStamp(doc.modified))))

  // ---- the reader's settings: the suite's order ---------------------------
  enter('settings')
  // ---- language ----------------------------------------------------------
  const sel = h('select.bks-select')
  for (const c of localeChoices()) {
    const o = h('option', { value: c.code, textContent: c.label })
    if (c.code === locale()) o.selected = true
    sel.append(o)
  }
  sel.addEventListener('change', () => {
    setLocale(sel.value)
    close()
    onRepaint()
  })
  section(
    t('Language'),
    row(t('Interface language'), sel),
    // the same rule as slides: language follows the READER, never the document
    note(t('Language follows whoever opens the file. It is never written into the document.')),
  )

  // ---- appearance --------------------------------------------------------
  // The same row every Bento app's Settings carries; applied live — the theme
  // is CSS variables, so the dialog itself changes under the picker.
  section(t('Appearance'), row(t('Theme'), themeSelect(
    { auto: t('Match my system'), light: t('Light'), dark: t('Dark') }, themeChoice(), (v) => setTheme(v))))

  // ---- updates -----------------------------------------------------------
  const upSec = section(t('Updates'))
  const upStatus = h('div.sp-ab-status')
  const upLine = h('p.sp-note')
  upStatus.append(upLine)
  upLine.textContent =
    lastAutoCheck?.status === 'current'
      ? t("Checked automatically at launch — you're on the latest version (v{v}).", { v: APP_VERSION })
      : lastAutoCheck?.status === 'error'
        ? t("Launch check couldn't reach the release server ({m}). Check manually below.", { m: lastAutoCheck.message })
        : t('This file carries its own app — it works offline, forever, as is.')

  const checkBtn = button(t('Check for updates'), () => { void runCheck() })
  upSec.append(actions(checkBtn), upStatus)
  upSec.append(check(t('Check for updates automatically at launch'), autoCheckEnabled(), (on) => setAutoCheck(on)))
  // the hard no-network switch every Bento app's Settings carries: update
  // checks AND the live session. Same-machine tab sync is not networking.
  upSec.append(check(t('Offline mode — block all network features (updates, online collaboration)'), offlineEnabled(), (on) => {
    const stuck = setOffline(on)
    hooks.onOffline?.(on)
    say(!stuck
      ? t('Offline mode is on for this tab, but could not be saved — this browser is blocking site data, so it will not survive a reload')
      : on ? t('Offline mode on — nothing leaves this computer') : t('Offline mode off — online features re-enabled'))
  }))
  upSec.append(note(t('An update check is the only network this app makes on its own. It asks the release server for a signed manifest and sends nothing about you or this document — no ids, no telemetry.')))

  async function runCheck(): Promise<void> {
    checkBtn.disabled = true
    upStatus.textContent = ''
    upStatus.append(upLine)
    upLine.textContent = t('Checking…')
    const res = await checkForUpdates()
    lastAutoCheck = res
    checkBtn.disabled = false
    if (res.status === 'current') {
      upLine.textContent = t('You have the newest version ({v}).', { v: APP_VERSION })
      return
    }
    if (res.status === 'error') {
      upLine.textContent = t('Could not reach the update channel.')
      return
    }
    upLine.textContent = ''
    upStatus.append(updateCard(res.release))
  }

  /**
   * One card for the one moment in this dialog with a decision in it.
   *
   * Grouped rather than left as five loose children of the status block — the
   * layout lesson slides paid for, where a heading, the notes and three
   * buttons squeezed between the section above and the controls below and a
   * five-bullet changelog read as one line plus two scrollbars.
   */
  function updateCard(rel: ReleaseInfo): HTMLElement {
    const box = h('div.sp-ab-update')
    const line = h('div.sp-ab-new', { textContent: t('Version {v} is available.', { v: rel.version }) })
    box.append(line)

    // Per-version notes filtered to what THIS file actually skipped: a reader
    // two versions behind should see both, and one version behind should not
    // see the older one again. `notes` is the fallback for a manifest that
    // predates the field.
    const skipped = rel.notesFrom
      ? Object.keys(rel.notesFrom)
        .filter((v) => compareVersions(v, APP_VERSION) > 0)
        .sort((a, b) => compareVersions(b, a))
      : []
    if (skipped.length) {
      const lines = skipped.flatMap((v) =>
        (rel.notesFrom![v] ?? []).map((n) => (skipped.length > 1 ? `• ${n}  (${v})` : `• ${n}`)))
      box.append(releaseNotes(lines.join('\n')))
    } else if (rel.notes) {
      box.append(releaseNotes(rel.notes))
    }

    const link = h('a.sp-btn.sp-ab-link', {
      href: `https://github.com/nyblnet/bento/releases/tag/v${encodeURIComponent(rel.version)}`,
      target: '_blank',
      rel: 'noopener',
      textContent: t('What’s new →'),
      title: t('Read the release notes for v{v} (opens in a new tab)', { v: rel.version }),
    })

    const inPlace = button(canUpdateInPlace() ? t('Update this file') : t('Update this file…'), () => {
      void (async () => {
        inPlace.disabled = true
        inPlace.textContent = t('Verifying…')
        try {
          const written = await onUpdateInPlace(rel)
          if (written) {
            box.replaceChildren(updatedCard(rel, written.backup))
          } else {
            inPlace.disabled = false
            inPlace.textContent = t('Update this file…')
          }
        } catch (err) {
          inPlace.disabled = false
          inPlace.textContent = t('Update this file…')
          upLine.textContent = t('Update failed: {m}', { m: String((err as Error)?.message ?? err) })
        }
      })()
    }, true)
    inPlace.title = canUpdateInPlace()
      ? t('Downloads a backup of the current version, then rewrites this file on disk as the new version — document untouched.')
      : t('Verifies and builds the new version with this document inside, then asks where to save it — pick the file you have open to update it.')

    const get = button(t('Download updated copy'), () => {
      void (async () => {
        get.disabled = true
        get.textContent = t('Verifying…')
        try {
          // the update writes a NEW file and leaves this one untouched, so a
          // bad update is undone by deleting the download
          onBeforeWrite?.()
          await applyUpdate(rel, store.doc)
          get.textContent = t('Downloaded ✓')
          box.append(note(t('This window keeps running v{v} until you open the downloaded file.', { v: APP_VERSION })))
        } catch (err) {
          get.disabled = false
          get.textContent = t('Download updated copy')
          upLine.textContent = t('Update failed: {m}', { m: String((err as Error)?.message ?? err) })
        }
      })()
    })

    box.append(actions(link, inPlace, get))
    return box
  }

  function updatedCard(rel: ReleaseInfo, backup: 'beside' | 'downloaded' | 'none'): HTMLElement {
    const done = h('div.sp-ab-update')
    const ok = h('div.sp-ab-new', { textContent: t('Updated to v{v} on disk.', { v: rel.version }) })
    done.append(ok)
    // Say where the rollback went. A backup nobody can find is not a backup.
    done.append(note(
      backup === 'beside'
        ? t('This window is still running v{v} — reload to finish. A v{v} backup was saved beside this file.', { v: APP_VERSION })
        : backup === 'downloaded'
          ? t('This window is still running v{v} — reload to finish. A v{v} backup was downloaded.', { v: APP_VERSION })
          : t("This window is still running v{v}. If you overwrote the file that's open here, reload; otherwise open the file you saved.", { v: APP_VERSION }),
    ))
    // No `store.dirty = false` here any more: whether the disk holds this exact
    // document is the save queue's to say, and it already said so when the
    // update was written (main.ts onUpdateInPlace). An edit typed since then is
    // NOT on disk, and clearing the dot for it would be the race all over again.
    done.append(actions(button(t('Reload into new version'), () => {
      location.reload()
    }, true)))
    return done
  }

  // ---- password ----------------------------------------------------------
  enter('doc')
  const pwSec = section(t('Password'))
  const pwNote = note(isEncryptionActive()
    ? t('This space is encrypted. Saves stay encrypted.')
    : t('A password encrypts the document inside the file. There is no recovery — lose it and the space is gone.'))
  pwSec.append(pwNote)

  const setPw = async (): Promise<void> => {
    const got = await promptDialog({
      title: t('Set a password…'),
      fields: [{ key: 'pw', label: t('Choose a password. There is no way to recover it.'), password: true }],
      cancelLabel: t('Cancel'), submitLabel: t('Set password'),
    })
    const pw = got?.pw
    if (!pw) return
    setEncryptionPassword(pw)
    // Plaintext snapshots written BEFORE encryption was turned on would defeat
    // the encryption the author just enabled. Both stores: the version timeline
    // and the single recovery snapshot. From here on main.ts writes neither.
    await clearVersions(doc.docId)
    await clearRecovery(doc.docId)
    pwNote.textContent = t('Password set. Save to write the space encrypted.')
    say(t('Password set. Save to write the space encrypted.'))
  }

  const pwActions = actions()
  if (isEncryptionActive()) {
    pwActions.append(button(t('Change password…'), () => { void setPw() }))
    pwActions.append(danger(t('Remove password…'), pwSec, {
      what: t('Remove the password?'),
      why: t('The next save writes this space as plain, readable JSON — anybody who opens the file can read every page.'),
      go: t('Remove the password'),
      run: () => {
        setEncryptionPassword(null)
        pwNote.textContent = t('Password removed. Save to write the space unencrypted.')
        say(t('Password removed. Save to write the space unencrypted.'))
      },
    }))
  } else {
    pwActions.append(button(t('Set a password…'), () => { void setPw() }))
  }
  pwSec.append(pwActions)

  // ---- the way in ---------------------------------------------------------
  // Beside the ways out on purpose: a format that can only be left is a
  // format nobody arrives in.
  if (onImport) {
    section(
      t('Bring notes in'),
      actions(button(t('Import Markdown…'), () => { close(); onImport() })),
      note(t('A folder of .md files becomes pages, with the folder tree and the [[wikilinks]] intact.')),
      // Said HERE because this is where somebody looks for it, and because the
      // same dialog claims below that a space is never a dead end. A promise
      // made in one direction only is half a promise.
      note(t('Another bento/spaces file can arrive the same way, nested under any page.')),
    )
  }

  // ---- ways out ----------------------------------------------------------
  // ---- the local timeline --------------------------------------------------
  //
  // Undo dies with the tab and the recovery snapshot only ever holds the last
  // few seconds, so before this section the honest answer to "give me back what
  // I wrote this morning" was that there wasn't one. The timeline lives in this
  // browser's IndexedDB — never in the file, never online — which is why the
  // note says so plainly: a space carried to another machine does not bring its
  // history, and that is a property worth stating rather than discovering.
  //
  // Rendered ASYNC into a placeholder. Reading IndexedDB cannot be allowed to
  // hold up the dialog opening, and a space with no versions yet is the common
  // case on a first run — it says so rather than showing an empty box.
  const histSec = section(t('History'))
  const histBody = h('div.sp-ab-versions')
  histSec.append(histBody)
  histSec.append(note(t('Versions are kept in this browser only — never in the file, never online. Restoring is undoable.')))

  const renderVersions = (versions: Snapshot[]): void => {
    histBody.textContent = ''
    if (!versions.length) {
      histBody.append(note(isEncryptionActive()
        ? t('This space is encrypted, so no versions are kept.')
        : t('No versions yet — they build up as you write and save.')))
      return
    }
    for (const [i, v] of versions.entries()) {
      const when = new Date(v.at).toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      const b = h('button.sp-ab-version', { type: 'button' })
      const left = h('span.sp-ab-when', { textContent: when })
      const tag = h('span.sp-ab-vtag', { textContent: i === 0 ? t('most recent') : '' })
      const doIt = h('span.sp-ab-vdo', { textContent: t('Restore') })
      b.append(left, tag, doIt)
      b.addEventListener('click', () => {
        // FOREIGN INPUT, gated as the recovery banner gates it (restoregate.ts):
        // every file:// document shares this IndexedDB. A refusal applies
        // nothing and leaves the entry where it is.
        if (store.readOnly) { say(t('This file is open read-only')); return }
        // replaceDoc (inside restoreInto) checkpoints undo first, so ⌘Z walks
        // this back — the same contract the recovery banner's Restore honours.
        if (!restoreInto(store, v.json)) { say(t('That version could not be read')); return }
        onRepaint()
        close()
        say(t('Restored the version from {when} — ⌘Z undoes it', { when }))
      })
      histBody.append(b)
    }
  }
  renderVersions([])
  void listVersions(doc.docId).then(renderVersions).catch(() => { /* no store, no history */ })

  const outSec = section(t('Take it elsewhere'))
  const copyJson = button(t('Copy document JSON'), () => {
    // The clipboard copy is a HAND-OUT. Every field under `collab` is a bearer
    // capability — the room, the read key and the private halves that grant
    // writing and revoking — so the copy strips the block outright, the way
    // the page extract does. It used to copy the live document whole.
    //
    // Through model.docForExport, not a local clone-and-delete: this landed on
    // main independently while this dialog was being rebuilt, and two strippers
    // for one rule is how the two of them start to disagree. The shared one
    // also strips by REMOVING, so a private field added to the credentials
    // later is covered without either call site being touched.
    navigator.clipboard?.writeText(JSON.stringify(docForExport(store.doc), null, 2))
      .then(() => { copyJson.textContent = t('Copied ✓'); say(t('Document JSON copied')) })
      .catch(() => { copyJson.textContent = t('Couldn’t access the clipboard') })
      .finally(() => { setTimeout(() => { copyJson.textContent = t('Copy document JSON') }, 1800) })
  })
  outSec.append(actions(
    copyJson,
    button(t('Export as Markdown'), () => downloadMarkdown(store)),
    ...(onExportSpace ? [button(t('Export page as a space…'), () => { close(); onExportSpace() })] : []),
    button(t('Save a copy…'), () => { close(); onSaveCopy() }),
    ...(onWriteCopy ? [button(t('Duplicate as a new space…'), () => {
      // A DUPLICATE, not a copy: a fresh docId and no collaboration
      // credentials, so it can never sync with the space it came from. You
      // keep editing this one — the writer holds no handle (portable.ts).
      // share.ts duplicateAsNew: the stamped `sync` goes with `collab`.
      const clone = duplicateAsNew(store.doc, uid('doc'))
      close()
      void onWriteCopy(clone)
    })] : []),
  ))
  outSec.append(note(t('A space is never a dead end: the whole document is plain JSON in this file, and every page exports as Markdown.')))

  // ---- the two that cannot be taken back -----------------------------------
  // Its own section, its own weight, and every action here says what it will
  // do before it does it. Replace-from-JSON is the one control in this dialog
  // that can lose a document.
  if (!store.readOnly) {
    const risky = section(t('Careful'))
    risky.classList.add('sp-ab-risky')
    risky.append(danger(t('Replace from JSON…'), risky, {
      what: t('Replace every page from pasted JSON?'),
      why: t('Everything in this space is replaced by what you paste. ⌘Z undoes it, but only while this window stays open.'),
      go: t('Replace'),
      form: replaceForm,
    }))
    risky.append(note(t('The counterpart of Copy document JSON: edit a space in another tool, then bring it back.')))
  }

  /**
   * The paste box, IN FLOW.
   *
   * Not a popover, and not a second overlay: the card scrolls, so a floating
   * child of it would be clipped on both axes (CLAUDE.md #10). It is a block
   * of the list that pushes the rest down, and the card scrolls to it.
   */
  function replaceForm(host: HTMLElement, dismiss: () => void): HTMLElement {
    const wrap = h('div')
    const je = createJsonEditor({ rows: 7, placeholder: t('Paste document JSON here…') })
    const ta = je.el
    ta.classList.add('sp-ab-json')
    const apply = button(t('Replace'), () => {
      const res = parseDoc(ta.value)
      if (!res.ok) {
        ta.classList.add('bkj-invalid')
        apply.textContent = t('That is not a bento/spaces document')
        setTimeout(() => { apply.textContent = t('Replace') }, 2000)
        return
      }
      // The live session belongs to THIS document, not to the pasted text.
      // Content is imported; identity and capability are not — adopting the
      // pasted `collab` would either wipe the room credentials or silently
      // move this space into somebody else's room. replaceDoc keeps the live
      // docId, collab and file mode itself (store.ts FROM_LIVE), for this and
      // every other whole-document restore.
      store.replaceDoc(res.doc)
      onRepaint()
      close()
      say(t('Document replaced — ⌘Z undoes'))
    })
    apply.classList.add('bks-danger-fill')
    wrap.append(ta, actions(apply, button(t('Cancel'), dismiss)))
    host.append(wrap)
    ta.focus()
    return wrap
  }

  /**
   * A weightier control: it states the consequence, then asks again.
   *
   * The confirmation is a BLOCK, not a `confirm()` and not a popover — see the
   * header. The button that finally does the thing is the second one you
   * press, and it is labelled with the verb rather than "OK".
   */
  function danger(
    label: string,
    host: HTMLElement,
    opts: {
      what: string
      why: string
      go?: string
      run?: () => void
      form?: (host: HTMLElement, dismiss: () => void) => HTMLElement
    },
  ): HTMLElement {
    let open: HTMLElement | null = null
    const b = button(label, () => {
      if (open) { open.remove(); open = null; b.setAttribute('aria-expanded', 'false'); return }
      const panel = h('div.sp-ab-confirm')
      const what = h('strong', { textContent: opts.what })
      panel.append(what, note(opts.why))
      const dismiss = () => { panel.remove(); open = null; b.setAttribute('aria-expanded', 'false'); b.focus() }
      if (opts.form) opts.form(panel, dismiss)
      else {
        const go = button(opts.go ?? label, () => { opts.run?.(); dismiss() })
        go.classList.add('bks-danger-fill')
        panel.append(actions(go, button(t('Cancel'), dismiss)))
      }
      host.append(panel)
      open = panel
      b.setAttribute('aria-expanded', 'true')
      panel.scrollIntoView({ block: 'nearest' })
    })
    b.classList.add('bks-danger')
    b.setAttribute('aria-expanded', 'false')
    return b
  }

  keepOnly()
  // the way across beside the way out: About → Settings
  if (kind === 'doc') sheet.foot(button(t('Settings'), () => { close(); openAbout(hooks, 'settings') }))
  sheet.open()
  if (kind === 'settings') checkBtn.focus()
  else card.querySelector<HTMLElement>('button, input, a[href]')?.focus()
}

/**
 * Release notes → a real list.
 *
 * The manifest carries them as PLAIN TEXT, one "• " bullet per line, capped at
 * five plus an "…and N more" tail (scripts/release.mjs). A pre-wrap block gave
 * every wrapped bullet a flush-left second line, which at 375px is most of them
 * — so one item read as two and the box looked like a wall. Split per line and
 * hang the indent instead.
 *
 * Always textContent, never innerHTML: the manifest is signed, but a signature
 * says who wrote a string, not that it is safe to run.
 */
function releaseNotes(notes: string): HTMLElement {
  const box = h('div.sp-ab-release')
  for (const raw of notes.split('\n')) {
    const text = raw.trim()
    if (!text) continue
    const bullet = /^[•*-]\s+/.test(text)
    const item = h('div', {
      className: bullet ? 'sp-ab-note' : 'sp-ab-more',
      textContent: bullet ? text.replace(/^[•*-]\s+/, '') : text,
    })
    box.append(item)
  }
  return box
}

/**
 * Words, in a way that is not wrong outside Europe.
 *
 * Splitting on whitespace counts a whole Japanese paragraph as one word. CJK
 * has no inter-word space, so its characters are counted individually — the
 * convention every word processor uses — and the rest splits on whitespace.
 */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g
function countWords(text: string): number {
  if (!text) return 0
  const cjk = text.match(CJK)?.length ?? 0
  const rest = text.replace(CJK, ' ').trim()
  return cjk + (rest ? rest.split(/\s+/).length : 0)
}

/** Real UTF-8 bytes of the document, not characters — MB is a promise. */
function byteLength(doc: SpacesDoc): number {
  const json = JSON.stringify(doc)
  try { return new Blob([json]).size } catch { return json.length }
}

/** A timestamp a person can read, in the reader's own locale. */
function shortStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' })
  } catch { return d.toISOString().slice(0, 16).replace('T', ' ') }
}

/**
 * Every page as one Markdown file.
 *
 * The renderer already emits semantic tags, so the mapping is direct — which
 * is the payoff for having refused divs-with-classes in the first place.
 */
export function toMarkdown(store: Store): string {
  const out: string[] = []
  const ctx: MdCtx = {
    titleOf: (id) => store.index.page.get(id)?.title,
    // THE SAME converter every other block's text goes through, handed to the
    // one type whose text is not a single string. A table with its own inline
    // rules would be the second place `**bold**` is decided.
    inline: htmlToMd,
    // DERIVED THE SAME WAY THE SCREEN DERIVES IT — same filter, same sort, same
    // grouping — so the file you download is the board you were looking at. A
    // second traversal here is how an export starts quietly disagreeing with
    // the app.
    rowsOf: (b: Block) => {
      const doc = store.doc
      const groupKey = String((b as { groupBy?: unknown }).groupBy ?? 'status')
      const grouped = String((b as { layout?: unknown }).layout ?? 'board') !== 'list'
      const field = fieldByKey(doc, groupKey)
      const rows = sortRows(
        doc,
        issuesOf(doc).filter((r) => passesFilter(doc, r.values, (b as { filter?: unknown }).filter)),
        (b as { sort?: unknown }).sort)
      // the board's column order, so an export reads top-to-bottom the way the
      // board reads left-to-right
      const order = new Map((field?.options ?? []).map((o, i) => [o.id, i]))
      const seat = (r: (typeof rows)[number]) =>
        order.get(String(r.values.get(groupKey) ?? '')) ?? Number.MAX_SAFE_INTEGER
      const ordered = grouped
        ? rows.map((r, i) => ({ r, i })).sort((a, c) => (seat(a.r) - seat(c.r)) || (a.i - c.i)).map((x) => x.r)
        : rows
      return ordered.map((r) => ({
        id: r.page.id,
        title: r.page.title,
        group: grouped
          ? (optionOf(field, r.values.get(groupKey))?.label ?? t('Other'))
          : undefined,
        // the same chips the card shows, in the same words
        fields: fieldsOf(doc)
          .filter((f) => f.key !== groupKey)
          .map((f) => {
            const v = r.values.get(f.key)
            if (v === undefined || v === null || v === '') return ''
            return optionOf(f, v)?.label ?? (Array.isArray(v) ? v.join(', ') : String(v))
          })
          .filter(Boolean).join(' · '),
      }))
    },
  }
  // ONE traversal, store.tree() — not a second walk over index.children.
  // That second walk is how a page-tree CYCLE dropped pages out of the export
  // while they sat in the file: neither page is reachable from the root, so
  // neither was ever visited. Store.tree() carries the visited set and surfaces
  // what a cycle orphans, and this now inherits both. Measured before the fix:
  // 13 pages in the file, 11 in the export.
  const walk = () => {
    for (const { page, depth } of store.tree()) {
      out.push(`${'#'.repeat(Math.min(depth + 1, 6))} ${page.title}`, '')
      // Indent, blockquote markers and what separates one block from the next
      // are properties of the TREE, not of a block, so they come from the
      // registry in one pass (blocks.ts mdLayout).
      const layout = mdLayout(page.blocks)
      page.blocks.forEach((b, i) => {
        const { quote, indent, sep } = layout[i]
        const text = htmlToMd(b.html ?? '')
        // From the block registry, so a new type exports correctly the moment
        // it is declared. An UNKNOWN type — a file written by a newer build —
        // falls through to its text, which is the honest default.
        const spec = SPEC.get(b.type)
        const lines = spec?.toMd ? spec.toMd(b, text, indent, ctx) : [text]
        // PER LINE, not per returned element. A spec returns ELEMENTS, and an
        // element can hold newlines: a code block's body is one multi-line
        // string, and htmlToMd turns <br> into a newline in ordinary text. Any
        // such child inside a callout left its 2nd..nth lines unquoted, which
        // ENDS the blockquote — the GitHub alert stops there, a nested fence is
        // left unterminated, and the rest of the callout falls out of the box
        // as broken prose. The callout's own toMd split on \n; nothing else did.
        //
        // An empty line inside a quote must be a bare '>', never '> ' and never
        // blank: a blank line closes the blockquote.
        out.push(...lines.flatMap((l) => l.split('\n')).map((l) => (l ? quote + l : quote.trimEnd())))
        out.push(sep)
      })
    }
  }
  walk()
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

/**
 * Inline html → inline markdown.
 *
 * Lives in marks.ts now, with the mark table it has to agree with. It used to
 * be a DOM walk here, which meant it could not be tested — the rigs are plain
 * node — so "does every mark survive an export" was a question only a human
 * with a browser could answer. Four of them did not: `u`, `mark`, `sub` and
 * `sup` fell through to their text. It is a pure function over the same run
 * list the canonicaliser uses, so a mark the model can hold and the exporter
 * cannot spell is now a rig failure.
 */

export function downloadMarkdown(store: Store): void {
  const blob = new Blob([toMarkdown(store)], { type: 'text/markdown' })
  const a = h('a', {
    href: URL.createObjectURL(blob),
    download: `${(store.doc.title || 'space').replace(/[^\w.-]+/g, '-')}.md`,
  })
  a.click()
  URL.revokeObjectURL(a.href)
}
