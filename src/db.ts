// IndexedDB storage with an in-memory fallback (for sandboxed previews where IndexedDB is blocked).
import type { ClassPlan, Client, Exercise, Measurement, Session, Settings } from './types.js';
import { DEFAULT_SETTINGS } from './types.js';
import { classFilingChanges } from './classlogic.js';

type StoreName = 'clients' | 'sessions' | 'measurements' | 'exercises' | 'classes' | 'meta' | 'outbox';
const STORES: StoreName[] = ['clients', 'sessions', 'measurements', 'exercises', 'classes', 'meta', 'outbox'];
/** Stores whose records sync to her account (plus the settings row in meta). */
export const SYNCED = ['clients', 'sessions', 'measurements', 'exercises', 'classes'] as const;
export type SyncedStore = (typeof SYNCED)[number] | 'settings';
export interface OutboxEntry { key: string; store: SyncedStore; id: string; deleted: boolean; at: string }
export interface WriteOpts { track?: boolean }
const DB_NAME = 'pff-coach';
const DB_VERSION = 3;

let dbp: Promise<IDBDatabase | null> | null = null;
const memory: Record<StoreName, Map<string, any>> = {
  clients: new Map(), sessions: new Map(), measurements: new Map(), exercises: new Map(), classes: new Map(), meta: new Map(), outbox: new Map(),
};
export let persistent = true;

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (!('indexedDB' in window)) throw new Error('no idb');
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('clients')) db.createObjectStore('clients', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('sessions')) {
          const s = db.createObjectStore('sessions', { keyPath: 'id' });
          s.createIndex('clientId', 'clientId');
        }
        if (!db.objectStoreNames.contains('measurements')) {
          const s = db.createObjectStore('measurements', { keyPath: 'id' });
          s.createIndex('clientId', 'clientId');
        }
        if (!db.objectStoreNames.contains('exercises')) db.createObjectStore('exercises', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('classes')) db.createObjectStore('classes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { persistent = false; resolve(null); };
      req.onblocked = () => { persistent = false; resolve(null); };
    } catch {
      persistent = false;
      resolve(null);
    }
  });
  return dbp;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const keyOf = (store: StoreName, v: any) => (store === 'meta' || store === 'outbox' ? v.key : v.id);

/** Which synced record a local write touches, if any. */
function syncTarget(store: StoreName, id: string): { store: SyncedStore; id: string } | null {
  if ((SYNCED as readonly string[]).includes(store)) return { store: store as SyncedStore, id };
  if (store === 'meta' && id === 'settings') return { store: 'settings', id: 'settings' };
  return null;
}

let changeTimer: number | undefined;
async function track(store: StoreName, ids: string[], deleted: boolean) {
  const at = new Date().toISOString();
  const entries = ids.map((id) => syncTarget(store, id)).filter(Boolean).map((t) => ({ key: `${t!.store}/${t!.id}`, store: t!.store, id: t!.id, deleted, at }));
  if (!entries.length) return;
  await rawPutMany('outbox', entries);
  window.clearTimeout(changeTimer);
  changeTimer = window.setTimeout(() => document.dispatchEvent(new CustomEvent('local-change')), 50);
}

export async function all<T>(store: StoreName): Promise<T[]> {
  const db = await open();
  if (!db) return Array.from(memory[store].values()).map((v) => structuredClone(v));
  return wrap(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function get<T>(store: StoreName, id: string): Promise<T | undefined> {
  const db = await open();
  if (!db) { const v = memory[store].get(id); return v ? structuredClone(v) : undefined; }
  return wrap(db.transaction(store).objectStore(store).get(id)) as Promise<T | undefined>;
}

export async function byClient<T>(store: 'sessions' | 'measurements', clientId: string): Promise<T[]> {
  const db = await open();
  if (!db) return Array.from(memory[store].values()).filter((v) => v.clientId === clientId).map((v) => structuredClone(v));
  return wrap(db.transaction(store).objectStore(store).index('clientId').getAll(clientId)) as Promise<T[]>;
}

async function rawPutMany(store: StoreName, values: any[]): Promise<void> {
  if (!values.length) return;
  const db = await open();
  if (!db) { values.forEach((v) => memory[store].set(keyOf(store, v), structuredClone(v))); return; }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    values.forEach((v) => os.put(v));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function rawDel(store: StoreName, id: string): Promise<void> {
  const db = await open();
  if (!db) { memory[store].delete(id); return; }
  await wrap(db.transaction(store, 'readwrite').objectStore(store).delete(id));
}

export async function put<T>(store: StoreName, value: T, opts: WriteOpts = {}): Promise<T> {
  await rawPutMany(store, [value]);
  if (opts.track !== false) await track(store, [keyOf(store, value)], false);
  return value;
}

export async function putMany(store: StoreName, values: any[], opts: WriteOpts = {}): Promise<void> {
  await rawPutMany(store, values);
  if (opts.track !== false) await track(store, values.map((v) => keyOf(store, v)), false);
}

export async function del(store: StoreName, id: string, opts: WriteOpts = {}): Promise<void> {
  await rawDel(store, id);
  if (opts.track !== false) await track(store, [id], true);
}

export async function clearAll(): Promise<void> {
  const db = await open();
  if (!db) { STORES.forEach((s) => memory[s].clear()); return; }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    STORES.forEach((s) => tx.objectStore(s).clear());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- typed conveniences ----
export const getClients = () => all<Client>('clients');
export const getClient = (id: string) => get<Client>('clients', id);
export const saveClient = (c: Client) => put('clients', c);

export async function sessionsFor(clientId: string): Promise<Session[]> {
  const list = await byClient<Session>('sessions', clientId);
  return list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}
export async function allSessions(): Promise<Session[]> {
  const list = await all<Session>('sessions');
  return list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}
export const getSession = (id: string) => get<Session>('sessions', id);
export const saveSession = (s: Session) => put('sessions', s);

export async function measurementsFor(clientId: string): Promise<Measurement[]> {
  const list = await byClient<Measurement>('measurements', clientId);
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

let exerciseCache: Map<string, Exercise> | null = null;
export async function exercises(): Promise<Map<string, Exercise>> {
  if (exerciseCache) return exerciseCache;
  const list = await all<Exercise>('exercises');
  exerciseCache = new Map(list.sort((a, b) => a.name.localeCompare(b.name)).map((e) => [e.id, e]));
  return exerciseCache;
}
export async function saveExercise(e: Exercise) {
  await put('exercises', e);
  exerciseCache = null;
}
export async function deleteExercise(id: string) {
  await del('exercises', id);
  exerciseCache = null;
}
export function invalidateExercises() { exerciseCache = null; }

export async function allClasses(): Promise<ClassPlan[]> {
  const list = await all<ClassPlan>('classes');
  return list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** Saves a class plan and files it in each attendee's log (and removes it from anyone taken off). */
export async function saveClass(p: ClassPlan) {
  await put('classes', p);
  await fileClass(p);
}
export async function fileClass(p: ClassPlan) {
  const [sessions, clients] = await Promise.all([all<Session>('sessions'), all<Client>('clients')]);
  const filed = sessions.filter((s) => s.classId === p.id);
  const { put: puts, del: dels } = classFilingChanges(p, filed, new Set(clients.map((c) => c.id)), new Date().toISOString());
  if (puts.length) await putMany('sessions', puts);
  for (const id of dels) await del('sessions', id);
}
/** Deletes a class plan and its entries in client logs. */
export async function deleteClass(id: string) {
  const sessions = await all<Session>('sessions');
  for (const s of sessions) if (s.classId === id) await del('sessions', s.id);
  await del('classes', id);
}
export async function classSessions(classId: string): Promise<Session[]> {
  return (await all<Session>('sessions')).filter((s) => s.classId === classId);
}

export async function getSettings(): Promise<Settings> {
  const row = await get<{ key: string; value: Settings }>('meta', 'settings');
  return { ...DEFAULT_SETTINGS, ...(row?.value || {}) };
}
export async function saveSettings(value: Settings) {
  await put('meta', { key: 'settings', value });
}
export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await get<{ key: string; value: T }>('meta', key);
  return row?.value;
}
export async function setMeta<T>(key: string, value: T) {
  await put('meta', { key, value });
}

export async function deleteClientCascade(clientId: string, opts: WriteOpts = {}) {
  const [s, m] = await Promise.all([byClient<Session>('sessions', clientId), byClient<Measurement>('measurements', clientId)]);
  for (const x of s) await del('sessions', x.id, opts);
  for (const x of m) await del('measurements', x.id, opts);
  await del('clients', clientId, opts);
}

// ---- backup ----
export interface Backup {
  app: 'pff-coach';
  version: 1;
  exportedAt: string;
  clients: Client[];
  sessions: Session[];
  measurements: Measurement[];
  exercises: Exercise[];
  classes?: ClassPlan[];
  meta: { key: string; value: unknown }[];
}

export async function exportAll(): Promise<Backup> {
  const [clients, sessions, measurements, ex, classes, meta] = await Promise.all([
    all<Client>('clients'), all<Session>('sessions'), all<Measurement>('measurements'),
    all<Exercise>('exercises'), all<ClassPlan>('classes'), all<{ key: string; value: unknown }>('meta'),
  ]);
  // Sign-in and in-progress imports stay on the device they belong to.
  const portable = meta.filter((m) => m.key !== 'auth' && m.key !== 'importDraft');
  return { app: 'pff-coach', version: 1, exportedAt: new Date().toISOString(), clients, sessions, measurements, exercises: ex, classes, meta: portable };
}

// ---- sync helpers ----
export const outbox = () => all<OutboxEntry>('outbox');
export async function clearOutboxEntry(e: OutboxEntry) {
  const cur = await get<OutboxEntry>('outbox', e.key);
  if (cur && cur.at === e.at) await rawDel('outbox', e.key); // a newer edit stays queued
}
export async function clearOutbox() {
  for (const e of await outbox()) await rawDel('outbox', e.key);
}
/** Reads the local copy of a synced record (settings lives in meta). */
export async function readSynced(store: SyncedStore, id: string): Promise<any | undefined> {
  if (store === 'settings') return (await get<{ key: string; value: Settings }>('meta', 'settings'))?.value;
  return get(store, id);
}
/** Applies a change that came from the server, without queueing it to be sent back. */
export async function applyRemote(store: SyncedStore, id: string, data: any | null): Promise<boolean> {
  const before = await readSynced(store, id);
  if (data === null) {
    if (before === undefined) return false;
    if (store === 'settings') return false;
    await rawDel(store, id);
  } else {
    if (before !== undefined && JSON.stringify(before) === JSON.stringify(data)) return false;
    if (store === 'settings') await rawPutMany('meta', [{ key: 'settings', value: data }]);
    else await rawPutMany(store, [data]);
  }
  if (store === 'exercises') exerciseCache = null;
  return true;
}

export async function importAll(b: Backup, mode: 'replace' | 'merge') {
  if (b.app !== 'pff-coach') throw new Error('This file is not a PFF Coach backup.');
  if (mode === 'replace') await clearAll();
  await putMany('clients', b.clients || []);
  await putMany('sessions', b.sessions || []);
  await putMany('measurements', b.measurements || []);
  await putMany('exercises', b.exercises || []);
  await putMany('classes', b.classes || []);
  await putMany('meta', (b.meta || []).filter((m) => m.key !== 'auth' && m.key !== 'importDraft'));
  exerciseCache = null;
}
