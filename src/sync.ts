// Keeps her devices in step through her Supabase account.
// The device works offline from its own copy; changes are queued in the outbox and sent when
// online, then changes from her other devices are pulled in. The newest edit of a record wins.
import * as db from './db.js';
import type { OutboxEntry, SyncedStore } from './db.js';
import { AuthError, rest, session, userId } from './auth.js';
import type { Client } from './types.js';

interface SyncState { userId: string; lastPulled: string | null; lastSyncedAt: string | null }
interface RemoteRow { store: SyncedStore; id: string; data: any; deleted: boolean; updated_at: string; client_updated_at: string }

export type SyncStatus =
  | { state: 'signed-out' }
  | { state: 'syncing' }
  | { state: 'ok'; at: string; pending: number }
  | { state: 'offline'; at: string | null; pending: number }
  | { state: 'error'; message: string; at: string | null; pending: number };

let status: SyncStatus = { state: 'signed-out' };
export const syncStatus = () => status;
function setStatus(s: SyncStatus) {
  status = s;
  document.dispatchEvent(new CustomEvent('sync-status'));
}

const STATE_KEY = 'syncState';
const PAGE = 1000;
const BATCH = 200;
const OVERLAP_MS = 2 * 60 * 1000; // re-read a little history so no change is missed between devices

let running: Promise<void> | null = null;
let again = false;

/** Sync now (or as soon as the current sync finishes). */
export function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    do { again = false; await syncOnce(); } while (again);
  })().finally(() => { running = null; });
  return running;
}

async function syncOnce() {
  const s = await session();
  if (!s) { setStatus({ state: 'signed-out' }); return; }
  const uid = await userId();
  let state = await db.getMeta<SyncState>(STATE_KEY);
  if (!uid) { setStatus({ state: 'offline', at: state?.lastSyncedAt ?? null, pending: (await db.outbox()).length }); return; }
  setStatus({ state: 'syncing' });
  try {
    if (!state || state.userId !== uid) {
      // First sync for this account on this device: send everything she already has here.
      await queueEverything();
      state = { userId: uid, lastPulled: null, lastSyncedAt: null };
      await db.setMeta(STATE_KEY, state);
    }
    await push();
    const changed = await pull(state);
    state.lastSyncedAt = new Date().toISOString();
    await db.setMeta(STATE_KEY, state);
    const pending = (await db.outbox()).length;
    setStatus({ state: 'ok', at: state.lastSyncedAt, pending });
    if (changed) document.dispatchEvent(new CustomEvent('sync-applied', { detail: { changed } }));
  } catch (e) {
    const pending = (await db.outbox()).length;
    const err = e as Error;
    if (e instanceof AuthError) setStatus({ state: 'signed-out' });
    else if (err.message === 'offline' || !navigator.onLine) setStatus({ state: 'offline', at: state?.lastSyncedAt ?? null, pending });
    else setStatus({ state: 'error', message: err.message, at: state?.lastSyncedAt ?? null, pending });
  }
}

/** Queues every local record (except sample data) so the first sync uploads it. */
async function queueEverything() {
  const clients = await db.getClients();
  const sample = new Set(clients.filter((c: Client) => c.source === 'sample').map((c) => c.id));
  const at = new Date(Date.now() - 1000).toISOString(); // slightly old, so anything newer on the server wins
  const entries: OutboxEntry[] = [];
  for (const store of db.SYNCED) {
    const rows = await db.all<any>(store);
    for (const r of rows) {
      if (store === 'clients' && sample.has(r.id)) continue;
      if ((store === 'sessions' || store === 'measurements') && sample.has(r.clientId)) continue;
      entries.push({ key: `${store}/${r.id}`, store, id: r.id, deleted: false, at: r.updatedAt || at });
    }
  }
  if (await db.getMeta('settings')) entries.push({ key: 'settings/settings', store: 'settings', id: 'settings', deleted: false, at });
  const queued = new Set((await db.outbox()).map((e) => e.key));
  await db.putMany('outbox', entries.filter((e) => !queued.has(e.key)), { track: false });
}

async function push() {
  const queue = await db.outbox();
  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH);
    const items = await Promise.all(batch.map(async (e) => {
      const data = e.deleted ? null : await db.readSynced(e.store, e.id);
      return { store: e.store, id: e.id, data, deleted: e.deleted || data === undefined, client_updated_at: e.at };
    }));
    await rest<number>('rpc/sync_push', { method: 'POST', body: { items } });
    for (const e of batch) await db.clearOutboxEntry(e);
  }
}

async function pull(state: SyncState): Promise<number> {
  const since = state.lastPulled ? new Date(new Date(state.lastPulled).getTime() - OVERLAP_MS).toISOString() : null;
  const pending = new Map((await db.outbox()).map((e) => [e.key, e]));
  let changed = 0;
  let offset = 0;
  let newest = state.lastPulled;
  for (;;) {
    const filter = since ? `&updated_at=gt.${encodeURIComponent(since)}` : '';
    const rows = await rest<RemoteRow[]>(`records?select=store,id,data,deleted,updated_at,client_updated_at${filter}&order=updated_at.asc,store.asc,id.asc&limit=${PAGE}&offset=${offset}`);
    for (const r of rows) {
      const local = pending.get(`${r.store}/${r.id}`);
      // An edit on this device that's newer than the server's copy wins; it goes up on the next push.
      if (local && new Date(local.at) > new Date(r.client_updated_at)) continue;
      if (await db.applyRemote(r.store, r.id, r.deleted ? null : r.data)) changed++;
      if (local) await db.clearOutboxEntry(local);
      if (!newest || r.updated_at > newest) newest = r.updated_at;
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  state.lastPulled = newest;
  return changed;
}

/** After restoring a backup, re-read everything from the server so both copies merge. */
export async function resetPull() {
  const state = await db.getMeta<SyncState>(STATE_KEY);
  if (state) await db.setMeta(STATE_KEY, { ...state, lastPulled: null });
}

/** Forget sync progress on this device (used when erasing it). */
export async function forgetDevice() {
  await db.setMeta(STATE_KEY, null);
  await db.clearOutbox();
  setStatus({ state: 'signed-out' });
}

// ---- when to sync ----
let started = false;
export function startAutoSync() {
  if (started) return;
  started = true;
  let timer: number | undefined;
  const soon = (ms: number) => { window.clearTimeout(timer); timer = window.setTimeout(() => { syncNow(); }, ms); };
  document.addEventListener('local-change', () => soon(3000));
  document.addEventListener('auth-change', () => soon(100));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(300); });
  window.addEventListener('online', () => soon(500));
  window.setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 2 * 60 * 1000);
  soon(500);
}
