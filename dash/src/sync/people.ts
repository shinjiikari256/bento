// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The People panel: who is in this workbook, and (for the owner) who may stay.
//
// Presence names are CLAIMS, not proofs — anyone can type any name — but the
// KEY beside them is a proof, because the relay verified the owner→invite→
// member signature chain before letting that socket write. So the panel is
// keyed by pubkey and shows the name as a label, which is the honest way round
// and the one that makes Remove meaningful: removing a name would remove
// nothing, removing a key ends that device's write access in seconds.
//
// Deliberately a mount function rather than a topbar button: main.ts is not
// this task's to edit. `mountPeople(host, session, store)` is one line at the
// call site — see docs/dash-collab.md, "What this needs from main.ts".

import '../sync.css'
import '../../../kernel/src/ui/sharebutton.css'
import { t } from '../i18n.ts'
import type { Store } from '../store.ts'
import type { SyncSession, Peer } from './session.ts'
import { collabOf, onlineTransport, startSharing, stopSharing, sharingOn } from './online.ts'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** short, stable, human-checkable form of a public key */
const fingerprint = (pub: string): string => `${pub.slice(0, 4)}…${pub.slice(-4)}`

const ROLE_LABEL: Record<string, string> = {
  owner: 'owner', editor: 'editor', viewer: 'view only',
}

/**
 * Mount the live/people panel into `host`. Returns a teardown.
 *
 * Renders on every presence change, which is at most one repaint per peer
 * heartbeat (5s) — the list is a handful of rows and nothing else on the page
 * depends on it.
 */
const SVG_ICON = (d: string): string =>
  `<svg class="dx-i" viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" fill="none" ` +
  `stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
const SYNC_ICON = SVG_ICON('<path d="M16.5 4.5v3.6h-3.6"/><path d="M3.5 10a6.5 6.5 0 0 1 11.7-3.9l1.3 2"/><path d="M3.5 15.5v-3.6h3.6"/><path d="M16.5 10a6.5 6.5 0 0 1-11.7 3.9l-1.3-2"/>')
const STOP_ICON = SVG_ICON('<rect x="5.5" y="5.5" width="9" height="9" rx="1.5"/>')

export function mountPeople(host: HTMLElement, session: SyncSession, store: Store, trigger?: HTMLElement): () => void {
  host.classList.add('dx-people')
  // The HOST carries it too, because the 700px rule hides the whole chip and a
  // class on a child cannot save a parent that is display:none.
  host.classList.toggle('dx-live', sharingOn(store) && session.transportKinds.includes('online'))

  const render = () => {
    const c = collabOf(store.doc)
    const live = sharingOn(store) && session.transportKinds.includes('online')
    const iAmOwner = !!c?.ownerPriv
    const peers = session.peers()
    // the Share button's status dot (kernel/src/ui/sharebutton.css)
    trigger?.classList.toggle('bksh-live', live)
    // The suite's share panel shape (as spaces'): one status line, the
    // people, then the action as a one-line menu row — its explanation is the
    // tooltip. The off switch for a running session is always here.
    host.innerHTML =
      `<div class="dx-people-status${live ? ' dx-live' : ''}">` +
      `<span class="dx-people-dot${live ? ' on' : ''}"></span>` +
      `<span class="dx-people-title">${esc(live ? t('Live') : t('Not live — turns on when you share'))}</span>` +
      `</div>` +
      `<ul class="dx-people-list">` +
      `<li class="dx-people-me"><span class="dx-people-chip" style="background:${esc(selfColor(session))}"></span>` +
      `<span class="dx-people-name">${esc(t('You'))}</span></li>` +
      peers.map((p) => row(p, iAmOwner)).join('') +
      `</ul>` +
      (peers.length ? '' : `<p class="dx-people-empty">${esc(t('Nobody else is in this workbook.'))}</p>`) +
      `<div class="dx-people-acts">` +
      `<button class="dx-btn dx-people-toggle${live ? ' dx-live' : ''}" title="${esc(live
        ? t('Disconnect from the relay — collaborators stop seeing your edits')
        : t('Put this workbook on the relay so people you send a copy to edit it live with you'))}">` +
      (live ? STOP_ICON : SYNC_ICON) +
      `<span>${esc(live ? t('Stop sharing') : t('Start live session'))}</span></button>` +
      `</div>`

    host.querySelector('.dx-people-toggle')?.addEventListener('click', () => {
      if (live) stopSharing(session, store)
      else void startSharing(session, store)
      render()
    })
    host.querySelectorAll<HTMLElement>('[data-remove]').forEach((b) => {
      b.addEventListener('click', () => {
        const pub = b.dataset.remove!
        // Revocation is an OWNER-SIGNED statement the relay stores and
        // enforces; it is not a UI state. If the socket is not open there is
        // nobody to tell, so say so rather than pretending it worked.
        const tr = onlineTransport()
        if (!tr || !c?.owner || !c.ownerPriv) return
        void tr.revokeKey(pub, c.owner, c.ownerPriv).then((ok) => {
          if (!ok) console.warn('[bento-sync] not connected — nothing was revoked')
        })
      })
    })
  }

  const row = (p: Peer, iAmOwner: boolean): string => {
    const role = p.role ? ROLE_LABEL[p.role] ?? p.role : ''
    // Only a KEY can be removed, so a peer without one (an older build, or a
    // member whose device key has not reached us yet) gets no button rather
    // than a button that would quietly do nothing.
    const canRemove = iAmOwner && !!p.pub && p.role !== 'owner'
    return `<li>` +
      `<span class="dx-people-chip" style="background:${esc(p.color)}"></span>` +
      `<span class="dx-people-name">${esc(p.name)}</span>` +
      (role ? `<span class="dx-people-role">${esc(t(role))}</span>` : '') +
      (p.pub ? `<span class="dx-people-key" title="${esc(p.pub)}">${esc(fingerprint(p.pub))}</span>` : '') +
      (canRemove ? `<button class="dx-people-x" data-remove="${esc(p.pub!)}" title="${esc(t('Remove this device from the session'))}">✕</button>` : '') +
      `</li>`
  }

  const off = session.onPeers(render)
  render()
  return () => {
    off()
    host.innerHTML = ''
    host.classList.remove('dx-people')
  }
}

/** the colour this session shows to others, so "You" matches their chip */
function selfColor(session: SyncSession): string {
  const COLORS = ['#FF9E8A', '#8FA3BF', '#7FC8A9', '#E8C468', '#C792EA', '#6AB7D6', '#E88AB0', '#A9C77F']
  let h = 0
  for (let i = 0; i < session.actor.length; i++) h = (h * 31 + session.actor.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}
