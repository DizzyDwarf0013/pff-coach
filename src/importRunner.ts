// Reads pending pages in the background, two at a time, saving progress after each page.
import * as db from './db.js';
import { AuthError, callFunction } from './auth.js';
import { fullName, today } from './util.js';
import type { ImportDraft, PageResult } from './importer.js';
import { getDraft, saveDraft } from './importer.js';

let running: Promise<void> | null = null;
let stopReason: string | null = null;
let controller: AbortController | null = null;

export const isRunning = () => !!running;
export const lastStopReason = () => stopReason;

const emit = () => document.dispatchEvent(new CustomEvent('import-progress'));

export function stop() {
  controller?.abort();
}

export function runPending(): Promise<void> {
  if (running) return running;
  stopReason = null;
  controller = new AbortController();
  running = (async () => {
    const draft = await getDraft();
    if (!draft) return;
    const [exMap, clients] = await Promise.all([db.exercises(), db.getClients()]);
    const catalog = Array.from(exMap.values()).map((e) => e.name);
    const names = clients.map(fullName);
    let saving = Promise.resolve();
    const persist = (d: ImportDraft) => { saving = saving.then(() => saveDraft(d)); return saving; };
    const queue = draft.pages.filter((p) => p.status !== 'done' && p.image);
    let halted = false;

    const worker = async () => {
      while (!halted) {
        const page = queue.shift();
        if (!page) return;
        page.status = 'pending';
        page.error = undefined;
        emit();
        try {
          const out = await callFunction<{ result: PageResult; usage: { input_tokens: number; output_tokens: number }; model: string }>('extract', {
            image: page.image, model: draft.model, catalog, clients: names, today: today(), yearHint: draft.yearHint,
          }, controller!.signal);
          page.result = out.result;
          page.usage = out.usage;
          page.model = out.model;
          page.status = 'done';
          page.image = undefined; // no need to keep the full image once read
        } catch (e) {
          const err = e as Error;
          if (err.name === 'AbortError') { halted = true; stopReason = 'Stopped.'; return; }
          page.status = 'error';
          page.error = err.message;
          if (e instanceof AuthError || /isn.t set up|isn.t allowed|API key|out of credit|secret is missing/i.test(err.message)) {
            halted = true;
            stopReason = err.message;
          }
        }
        await persist(draft);
        emit();
      }
    };
    await Promise.all([worker(), worker()]);
    await saving;
  })().finally(() => { running = null; controller = null; emit(); });
  return running;
}
