// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// The About dialog — what this file is, what version, and the controls that
// have nowhere else to live.
//
// WHY IT EXISTS AT ALL. bento/type had no route to any of this: no version
// anywhere in the UI, no way to check for an update, no way to change theme
// except a bar button with no explanation, and no answer to "what IS this
// file". Both other apps put that behind the wordmark, so a person who learns
// one app already knows where to look — and a wordmark that is only decoration
// wastes the one place everyone looks first (spaces/src/editor.ts says the
// same, and it is right).
//
// Modelled on spaces/src/about.ts, which is the smaller and more recent of the
// two precedents. Sections in the same order, so the three dialogs read as one
// product.

import { checkForUpdates, applyUpdate, autoCheckEnabled, setAutoCheck, APP_VERSION, type ReleaseInfo } from '../../kernel/src/update.ts';
import { offlineEnabled, setOffline } from '../../kernel/src/net.ts';
import { appCardLinks, createSheet, openAppCard, sheetSelect, themeSelect } from '../../kernel/src/ui/sheet.ts';
import '../../kernel/src/ui/dialog.css';
import '../../kernel/src/ui/sheet.css';
import { canWriteInPlace, openedFileName } from '../../kernel/src/save.ts';
import { setTheme, themeChoice } from '../../kernel/src/theme.ts';
import { h } from '../../kernel/src/dom.ts';
import { createJsonEditor } from '../../kernel/src/ui/jsoneditor.ts';
import '../../kernel/src/ui/jsoneditor.css';
import '../../kernel/src/ui/field.css';
import type { Store } from './store.ts';
import { wordCount, docForExport } from './model.ts';
import { t, locale, localeChoices, setLocale } from './i18n.ts';
import { knownAuthor, setAuthorName } from './comments.ts';
import './comments.css';
import { listVersions, type Snapshot } from './autosave.ts';

export interface AboutHooks {
  store: Store;
  /** pages, from the last pagination pass — the dialog does not re-measure */
  pages: number;
  onReplaceDoc(json: string): void;
  /**
   * Restore a version THIS BROWSER kept. Not onReplaceDoc: a pasted document
   * keeps its own identity, a browser-kept snapshot never does — it is gated
   * (restoregate.ts) and takes docId, collab and readonly from the open file.
   */
  onRestoreDoc(json: string): void;
  /** Settings' footer: the way into Keyboard shortcuts */
  onShortcuts?(): void;
  /** Settings' Offline switch: hang up the live session, or re-join it */
  onOffline?(on: boolean): void;
}

/**
 * Which card. ONE builder, three cards (the suite's bar layout): the mark opens
 * the APP's (which app, which version, credits), ⓘ About opens the DOCUMENT's
 * (what is in it, its JSON, its history), and Settings opens the READER's
 * (updates, appearance, the name you sign with) — what is kept in this browser
 * and never written into the file.
 */
export type AboutKind = 'app' | 'doc' | 'settings';

export function openAbout(hooks: AboutHooks, kind: AboutKind = 'doc'): void {
  const { store, pages, onReplaceDoc, onRestoreDoc } = hooks;

  // The mark's card is the suite's shared app card (kernel/src/ui/sheet.ts),
  // the same in every Bento app; About and Settings are shared sheets too.
  if (kind === 'app') {
    openAppCard({
      app: 'type', version: APP_VERSION, format: store.doc.version ?? 1,
      title: t('About bento/type — version, licenses'), closeLabel: t('Close'),
      promoHtml: t('New to Bento? Find templates, the gallery and the AI editing guide at {home} — or ⭐ it on {gh}.', appCardLinks),
      notes: [
        t('Checks contact the release server and send nothing about you or this document — no ids, no telemetry.'),
        t('bento/type is MIT-licensed. Line breaking uses the Knuth–Plass algorithm ' +
          'via tex-linebreak; hyphenation patterns are Liang’s. Everything runs in ' +
          'this file — nothing is fetched, and nothing is sent anywhere.'),
      ],
    });
    return;
  }

  const sh = createSheet({ title: kind === 'settings' ? t('Settings') : t('About this document'), closeLabel: t('Close') });
  const close = () => sh.close();
  const button = (label: string, fn: () => void, primary = false) => sh.button(label, fn, { primary });

  if (kind === 'settings') {
    // ---- the suite's order: language, appearance, updates, then this app's --
    const lang = sh.section(t('Language'));
    lang.append(sh.row(t('Interface language'), sheetSelect(
      localeChoices().map(c => ({ value: c.code, label: c.label })), locale(), v => setLocale(v))));
    // the bar is built once from a template, so a new language reaches the
    // whole interface on the next open — said, not discovered
    lang.append(sh.note(t('The rest of the interface catches up the next time this file is opened.')));

    const look = sh.section(t('Appearance'));
    look.append(sh.row(t('Theme'), themeSelect(
      { auto: t('Match my system'), light: t('Light'), dark: t('Dark') }, themeChoice(), v => setTheme(v))));
    look.append(sh.note(t(
      'The theme is yours, not the document’s — it is remembered in this browser and ' +
      'never saved into the file. The PAGE stays white in both, because paper is white ' +
      'and somebody proofing a contract at midnight still has to see what will print.')));

    const up = sh.section(t('Updates'));
    const upStatus = sh.note('');
    let found: ReleaseInfo | null = null;
    const checkBtn = button(t('Check for updates'), async () => {
      upStatus.textContent = t('Checking…');
      const r = await checkForUpdates();
      if (r.status === 'update') {
        found = r.release;
        upStatus.textContent = t('Version {v} is available.', { v: r.release.version });
        applyBtn.hidden = false;
      } else if (r.status === 'current') {
        upStatus.textContent = t('Up to date — v{v}.', { v: APP_VERSION });
      } else {
        // A failed check is not an error worth alarming anyone with: the file
        // works offline by design, and that is the common reason it fails.
        upStatus.textContent = t('Could not check right now.');
      }
    });
    const applyBtn = button(t('Update this file'), async () => {
      if (found) await applyUpdate(found, store.doc as never);
    }, true);
    applyBtn.hidden = true;
    up.append(sh.actions(checkBtn, applyBtn), upStatus);
    up.append(sh.note(t(
      'An update is a NEW file, downloaded beside this one — the original is untouched, ' +
      'so a bad update is undone by deleting it. Every release is signature-checked ' +
      'before it is applied.')));
    up.append(sh.check(t('Check for updates automatically at launch'), autoCheckEnabled(), on => setAutoCheck(on)));
    // the hard no-network switch every Bento app's Settings carries
    up.append(sh.check(t('Offline mode — block all network features (updates, online collaboration)'), offlineEnabled(), on => {
      setOffline(on);
      hooks.onOffline?.(on);
    }));

    // ---- you --------------------------------------------------------------
    //
    // comments.ts's authorName() has always had a name to attribute comments
    // and tracked changes to; this is the one place that shows it and lets it
    // change. Both read/write the same 'bento-author' key.
    const you = sh.section(t('You'));
    const nameInput = h('input.bks-input', {
      type: 'text',
      placeholder: t('Your name'),
      value: knownAuthor(),
      autocomplete: 'off',
    });
    // applied on blur/Enter, not on every keystroke: a comment made mid-edit
    // must attribute to the name as it stood at that moment
    const commitName = () => setAuthorName(nameInput.value);
    nameInput.addEventListener('change', commitName);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { commitName(); nameInput.blur(); } });
    you.append(sh.row(t('Name'), nameInput));
    you.append(sh.note(t(
      'A self-asserted claim, not an identity — this is the name shown beside ' +
      'your comments and tracked changes, and anyone can type any name here. ' +
      'It is remembered in this browser, applies immediately, and is never ' +
      'itself saved into the file (only the comments and changes it signs are).')));

    if (hooks.onShortcuts) {
      const go = hooks.onShortcuts;
      sh.foot(button(t('Keyboard shortcuts'), () => { close(); go(); }));
    }
    sh.open();
    return;
  }

  // ---- this file -----------------------------------------------------------
  const file = sh.section(t('This file'));
  const notes = Object.keys(store.doc.footnotes ?? {}).length;
  file.append(h('p.bks-lede', { textContent: t(
    '{pages} page(s) · {words} words · {blocks} blocks · {notes} footnote(s). ' +
    'The document, the editor and the typesetter are all in this one file.',
    { pages: pages || 1, words: wordCount(store.doc).toLocaleString(),
      blocks: store.doc.body.length, notes }) }));
  const fileName = openedFileName();
  if (fileName) file.append(sh.row(t('File'), sh.value(fileName)));
  file.append(sh.row(t('Document id'), sh.value(String(store.doc.docId ?? ''))));
  if (!canWriteInPlace()) {
    file.append(sh.note(t(
      'This browser cannot write back to the file, so every save makes a new copy. ' +
      'Chrome and Edge on a computer can save in place.')));
  }

  // ---- the document, for tools --------------------------------------------
  const docSec = sh.section(t('Document'));
  const jsonRow = sh.actions(
    button(t('Copy document JSON'), async () => {
      // docForExport, never store.doc — see model.ts. This text can be pasted
      // anywhere, and the raw document carries the room's private keys.
      try { await navigator.clipboard.writeText(JSON.stringify(docForExport(store.doc), null, 2)); }
      catch { /* clipboard blocked — the agent surface below still works */ }
    }),
    button(t('Replace from JSON…'), () => {
      if (docSec.querySelector('.t-replace-json')) return;
      const je = createJsonEditor({
        placeholder: t('Paste a bento/type document JSON. This replaces the document and can be undone with ⌘Z.'),
      });
      const ta = je.el;
      ta.classList.add('t-replace-json');
      const panel = h('div.t-replace-json-panel');
      const actRow = sh.actions(
        button(t('Replace'), () => {
          if (!ta.value.trim()) { ta.focus(); return; }
          onReplaceDoc(ta.value);
          panel.remove();
        }),
        button(t('Cancel'), () => panel.remove()),
      );
      panel.append(ta, actRow);
      jsonRow.after(panel);
      ta.focus();
    }),
  );
  docSec.append(jsonRow, sh.note(t(
    'The document is the interchange unit: hand this JSON to an AI, get one back, ' +
    'and paste it in. `window.bento` exposes the same thing to scripts.')));

  // ---- version history -----------------------------------------------------
  //
  // Restoring does NOT reuse `onReplaceDoc`: a snapshot is foreign input from
  // a store any local page can write, and must not bring its own docId, room
  // or mode — so it has its own hook, which goes through restoregate.ts.
  const hist = sh.section(t('Version history'));
  hist.append(sh.actions(button(t('Version history…'), () => openVersionHistory({ store, onRestoreDoc, close }))));
  hist.append(sh.note(t(
    'Versions are saved automatically as you edit, kept only in this browser, ' +
    'and never uploaded. Restoring is undoable with ⌘Z.')));

  sh.foot(button(t('Settings'), () => openAbout(hooks, 'settings')));
  sh.open();
}

/**
 * Version history — a second small dialog over the About card, listing the
 * auto-save timeline newest-first. Kept separate from `openAbout` rather than
 * inlined: the row list is fetched async (IndexedDB), and About itself must
 * render synchronously the moment the wordmark is clicked.
 */
async function openVersionHistory(
  { store, onRestoreDoc, close: closeAbout }: { store: Store; onRestoreDoc(json: string): void; close(): void },
): Promise<void> {
  const versions = await listVersions(store.doc.docId);
  const sh = createSheet({ title: t('Version history'), closeLabel: t('Close') });
  if (!versions.length) {
    sh.body.append(sh.note(t('No saved versions yet — they accumulate as you edit.')));
  } else {
    const list = h('div.t-vers');
    versions.forEach((v: Snapshot, i: number) => {
      const when = new Date(v.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const rowEl = sh.button(i === 0 ? t('{when} (most recent)', { when }) : when, () => {
        onRestoreDoc(v.json);
        sh.close();
        closeAbout();
      });
      rowEl.classList.add('t-ver');
      rowEl.append(h('span.t-ver-go', { textContent: t('Restore') }));
      list.append(rowEl);
    });
    sh.body.append(list);
  }
  sh.body.append(sh.note(t('Stored only in this browser, never in the file or online.')));
  sh.open();
}
