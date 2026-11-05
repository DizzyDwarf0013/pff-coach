// Small pieces of UI that show sync status.
import { syncNow, syncStatus } from './sync.js';
import { relDay, today } from './util.js';

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const d = new Date(iso);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return day === today() ? `at ${time}` : `${relDay(day).toLowerCase()} at ${time}`;
}

export function syncText(): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  const s = syncStatus();
  switch (s.state) {
    case 'signed-out': return { text: 'Not syncing: sign in to back up and sync', tone: 'muted' };
    case 'syncing': return { text: 'Syncing…', tone: 'muted' };
    case 'ok': return s.pending ? { text: `Synced ${ago(s.at)}, ${s.pending} change${s.pending === 1 ? '' : 's'} waiting`, tone: 'ok' } : { text: `Synced ${ago(s.at)}`, tone: 'ok' };
    case 'offline': return { text: `Offline${s.pending ? `: ${s.pending} change${s.pending === 1 ? '' : 's'} will sync when connected` : ''}${s.at ? `. Last synced ${ago(s.at)}` : ''}`, tone: 'warn' };
    case 'error': return { text: `Sync problem: ${s.message}`, tone: 'warn' };
  }
}

/** Fills every .sync-line in root and keeps it current while it's on screen. */
export function bindSyncLine(root: ParentNode) {
  // Views are built before they're attached, so only stop listening once the line has been shown and removed.
  let shown = false;
  const paint = () => {
    const els = Array.from(root.querySelectorAll<HTMLElement>('.sync-line'));
    if (!els.length || (shown && !els[0].isConnected)) { document.removeEventListener('sync-status', paint); return; }
    if (els[0].isConnected) shown = true;
    const t = syncText();
    els.forEach((el) => { el.textContent = t.text; el.dataset.tone = t.tone; });
  };
  document.addEventListener('sync-status', paint);
  paint();
  root.querySelectorAll<HTMLElement>('[data-act="sync-now"]').forEach((b) => b.addEventListener('click', () => { syncNow(); }));
}
