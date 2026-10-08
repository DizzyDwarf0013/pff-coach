// Import from notebook photos or PDFs: pick pages, read them, review, save.
import type { Ctx } from '../router.js';
import { go, refresh } from '../router.js';
import * as db from '../db.js';
import type { Exercise, Session } from '../types.js';
import { empty, topbar } from '../components.js';
import { authForm, bindAuthForm, session } from '../auth.js';
import { preparePages, MAX_PAGES } from '../pages.js';
import {
  buildReview, clearDraft, costOf, getDraft, newDraft, norm, PER_PAGE_ESTIMATE, reviewCounts, saveDraft, saveReview,
  type ImportDraft, type Review, type ReviewClient, type XExercise,
} from '../importer.js';
import { isRunning, lastStopReason, runPending, stop } from '../importRunner.js';
import { $, PREVIEW, confirmDialog, fmtHeight, fmtNum, fmtSeconds, fmtShort, fullName, html, Raw, toast, uid } from '../util.js';

const MODEL_NAME = { sonnet: 'Sonnet 5.5', haiku: 'Haiku 5.5' };
const CATS: Exercise['category'][] = ['Lower body', 'Upper body', 'Core', 'Cardio', 'Mobility'];

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  document.addEventListener('import-progress', () => {
    if (location.hash.startsWith('#/import')) refresh();
  });
}

export async function importView({ root }: Ctx) {
  listen();
  const head = topbar('Import from notebook', { back: '/clients', backLabel: 'Clients', sub: 'Photos or PDFs of notebook pages' });
  if (PREVIEW) {
    root.innerHTML = html`${head}${empty('Not available in this preview', 'Importing reads pages on the server, which only works in the installed app.')}`.value;
    return;
  }
  const s = await session();
  if (!s) {
    root.innerHTML = html`${head}
      <section class="card">
        <h2>Sign in to import</h2>
        ${authForm('Reading notebook pages happens on a secure server, so it needs her account. She only signs in once on each device.')}
      </section>`.value;
    bindAuthForm(root, () => refresh());
    return;
  }

  const draft = await getDraft();
  if (!draft || !draft.pages.length) return pickScreen(root, head);
  const pending = draft.pages.filter((p) => p.status !== 'done');
  if (isRunning() || pending.some((p) => p.status === 'pending' && p.image && !p.error)) return progressScreen(root, head, draft);
  return reviewScreen(root, head, draft);
}

// ---------- 1. pick pages ----------
async function pickScreen(root: HTMLElement, head: Raw, existing?: ImportDraft) {
  const settings = await db.getSettings();
  const year = new Date().getFullYear();
  root.innerHTML = html`${head}
    <section class="card import-pick">
      <h2>${existing ? 'Add more pages' : 'Choose pages'}</h2>
      <p>Take photos of notebook pages or choose PDFs, like scans from the Notes app. Each page is read for clients, sessions, measurements and class plans. You check everything before it's saved.</p>
      <label class="field narrow">
        <span class="label">Year of these pages, if not written on them</span>
        <select name="yearHint">
          <option value="">Work it out from the dates</option>
          ${Array.from({ length: 7 }, (_, i) => year - i).map((y) => html`<option value="${y}" ${existing?.yearHint === y ? new Raw('selected') : ''}>${y}</option>`)}
        </select>
      </label>
      <label class="btn primary big-pick">Take photos or choose files<input type="file" name="files" accept="image/*,application/pdf,.pdf" multiple hidden></label>
      <p class="fineprint">Up to ${MAX_PAGES} pages at a time. Reading uses ${MODEL_NAME[settings.importModel]}, ${PER_PAGE_ESTIMATE[settings.importModel]}. You can change this in Settings.</p>
      <p class="prep-status" aria-live="polite"></p>
      ${existing ? html`<div class="row-end"><button class="btn ghost" data-act="back-review">Back to review</button></div>` : ''}
    </section>
    <section class="card tips">
      <h2>For the best results</h2>
      <ul>
        <li>One page per photo, flat, with the whole page in the frame.</li>
        <li>Good light, without shadows across the writing.</li>
        <li>Pages for the same client can be in any order. They're grouped by name.</li>
      </ul>
    </section>`.value;

  const status = $('.prep-status', root)!;
  $('[data-act="back-review"]', root)?.addEventListener('click', () => refresh());
  (root.querySelector('input[name="files"]') as HTMLInputElement).addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;
    const yearHint = Number((root.querySelector('select[name="yearHint"]') as HTMLSelectElement).value) || null;
    const draft = existing || newDraft(settings.importModel, yearHint);
    draft.yearHint = yearHint ?? draft.yearHint;
    const room = MAX_PAGES - draft.pages.length;
    status.textContent = 'Preparing pages…';
    const res = await preparePages(files, async (p, n) => {
      if (n > room) return;
      draft.pages.push({ id: uid(), label: p.label, status: 'pending', image: p.image, thumb: p.thumb });
      status.textContent = `Prepared ${n} page${n === 1 ? '' : 's'}…`;
    });
    if (!draft.pages.length) { status.textContent = res.errors[0] || 'No pages found in those files.'; return; }
    await saveDraft(draft);
    if (res.errors.length) toast(res.errors[0]);
    if (res.skipped || res.count > room) toast(`Only the first ${MAX_PAGES} pages were added. Import the rest afterwards.`);
    refresh();
  });
}

// ---------- 2. read pages ----------
function progressScreen(root: HTMLElement, head: Raw, draft: ImportDraft) {
  const total = draft.pages.length;
  const done = draft.pages.filter((p) => p.status === 'done').length;
  const failed = draft.pages.filter((p) => p.status === 'error').length;
  const toRead = draft.pages.filter((p) => p.status !== 'done' && p.image).length;
  const running = isRunning();
  const pct = Math.round((done / total) * 100);
  const est = draft.model === 'haiku' ? 0.002 : 0.025;
  root.innerHTML = html`${head}
    <section class="card">
      <h2>${running ? `Reading pages: ${done} of ${total} done` : `${toRead} page${toRead === 1 ? '' : 's'} ready to read`}</h2>
      ${running ? html`
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><span style="width:${pct}%"></span></div>
        <p class="fineprint">Each page takes about 15–40 seconds. You can use other parts of the app while this runs, but keep the app open.</p>
        <div class="row-end"><button class="btn ghost" data-act="stop">Stop</button></div>`
      : html`
        <p>Reading uses ${MODEL_NAME[draft.model]}. Estimated cost for these pages: about $${(toRead * est).toFixed(2)}.</p>
        ${lastStopReason() ? html`<p class="flag">${lastStopReason()}</p>` : ''}
        <div class="row-end">
          <button class="btn ghost danger" data-act="discard">Discard</button>
          <button class="btn" data-act="add">Add more pages</button>
          <button class="btn primary" data-act="read">${failed ? `Try ${toRead} again` : `Read ${toRead} page${toRead === 1 ? '' : 's'}`}</button>
        </div>`}
    </section>
    <ul class="thumbs">
      ${draft.pages.map((p, i) => html`
        <li class="${p.status}">
          ${p.thumb ? html`<img src="${p.thumb}" alt="Page ${i + 1}">` : ''}
          <span class="thumb-label">${i + 1}. ${p.status === 'done' ? 'Read' : p.status === 'error' ? 'Couldn’t read' : running ? 'Waiting' : 'Ready'}</span>
          ${p.error ? html`<span class="thumb-err">${p.error}</span>` : ''}
        </li>`)}
    </ul>`.value;

  root.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'read') { runPending(); setTimeout(() => refresh(), 50); }
    if (act === 'stop') stop();
    if (act === 'add') pickScreen(root, head, draft);
    if (act === 'discard' && await confirmDialog('Discard this import?', 'Pages that were read will be lost. Nothing has been saved to the app yet.', 'Discard', true)) { await clearDraft(); refresh(); }
  });
}

// ---------- 3. review ----------
function setsText(e: XExercise): string {
  const sets = e.sets || [];
  if (!sets.length) return e.notes || '';
  const one = (x: XExercise['sets'][number]) =>
    x.seconds ? fmtSeconds(x.seconds) : x.weight_lb ? `${x.reps ?? '–'} @ ${fmtNum(x.weight_lb)} lb` : x.reps ? `${x.reps}` : '–';
  const labels = sets.map(one);
  return labels.every((l) => l === labels[0]) ? `${sets.length}×${labels[0]}` : labels.join(', ');
}

function profileFacts(c: ReviewClient): string[] {
  const p = c.profile;
  if (!p) return [];
  return [
    p.height_in ? `Height ${fmtHeight(p.height_in)}` : '',
    p.start_weight_lb ? `Weight ${fmtNum(p.start_weight_lb)} lb` : '',
    p.goal_weight_lb ? `Goal ${fmtNum(p.goal_weight_lb)} lb` : '',
    p.muscle_pct ? `Muscle ${fmtNum(p.muscle_pct)}%` : '',
    p.body_fat_pct ? `Body fat ${fmtNum(p.body_fat_pct)}%` : '',
    p.age ? `Age ${p.age}` : '',
    p.pregnancy_status === 'pregnant' ? `Pregnant${p.due_date ? `, due ${fmtShort(p.due_date)}` : ''}` : '',
    p.pregnancy_status === 'postpartum' ? `Postpartum${p.delivery_date ? `, delivered ${fmtShort(p.delivery_date)}` : ''}` : '',
    p.goals?.length ? `Goals: ${p.goals.join(', ')}` : '',
    p.medical ? `Health: ${p.medical}` : '',
    p.notes ? `Notes: ${p.notes}` : '',
  ].filter(Boolean);
}

async function reviewScreen(root: HTMLElement, head: Raw, draft: ImportDraft) {
  const [clients, allSessions, exMap] = await Promise.all([db.getClients(), db.allSessions(), db.exercises()]);
  const byClient = new Map<string, Session[]>();
  allSessions.forEach((s) => { if (!byClient.has(s.clientId)) byClient.set(s.clientId, []); byClient.get(s.clientId)!.push(s); });
  const review: Review = buildReview(draft, clients, byClient, exMap);
  const counts = reviewCounts(review);
  const failed = draft.pages.filter((p) => p.status === 'error');
  const read = draft.pages.filter((p) => p.status === 'done').length;
  const cost = costOf(draft.pages, draft.model);
  const newNames = new Set(review.newExercises.map((x) => x.key));
  const isNewEx = (name: string) => newNames.has(norm(name));
  const sortedClients = [...clients].sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const nothing = !review.clients.length && !review.classes.length;

  root.innerHTML = html`${head}
    <section class="card review-summary">
      <h2>Check what was read</h2>
      <p>Read ${read} page${read === 1 ? '' : 's'}${cost ? `, about $${cost.toFixed(2)}` : ''}. Untick anything you don't want, fix names and dates, then save. Details can be edited later on each client's page.</p>
      ${failed.length ? html`<p class="flag">${failed.length} page${failed.length === 1 ? '' : 's'} couldn't be read: ${failed[0].error}</p>` : ''}
      <div class="row-end">
        ${failed.some((p) => p.image) ? html`<button class="btn" data-act="retry">Try failed pages again</button>` : ''}
        <button class="btn" data-act="add">Add more pages</button>
      </div>
    </section>

    ${nothing ? empty('Nothing to import', 'No clients or class plans were found on these pages. Check the photos are clear and the whole page is in frame.') : ''}

    ${review.clients.length ? html`<h2 class="list-head">Clients (${review.clients.length})</h2>` : ''}
    ${review.clients.map((c) => {
      const facts = profileFacts(c);
      const match = c.matchId ? clients.find((x) => x.id === c.matchId) : undefined;
      return html`
      <section class="card rc ${c.include ? '' : 'off'}" data-client="${c.key}">
        <div class="rc-head">
          <label class="check"><input type="checkbox" data-c="include" ${c.include ? new Raw('checked') : ''}><span class="sr">Import ${c.name}</span></label>
          <input class="rc-name" data-c="name" value="${c.name}" aria-label="Client name" ${c.matchId ? new Raw('disabled') : ''}>
        </div>
        <div class="rc-opts">
          <label class="field"><span class="label">Save as</span>
            <select data-c="matchId">
              <option value="">New client</option>
              ${sortedClients.map((x) => html`<option value="${x.id}" ${x.id === c.matchId ? new Raw('selected') : ''}>Add to ${fullName(x)}</option>`)}
            </select>
          </label>
          ${!c.matchId ? html`<label class="check-inline"><input type="checkbox" data-c="pff" ${c.pff ? new Raw('checked') : ''}> Pink Fitness client</label>`
            : html`<span class="muted">${match?.isPinkFitness ? 'Pink Fitness client' : 'Private client'}</span>`}
        </div>
        ${c.writtenNames.length > 1 || (c.matchId && c.writtenNames[0] !== c.name) ? html`<p class="fineprint">Written as ${c.writtenNames.map((n) => `“${n}”`).join(', ')}</p>` : ''}
        ${facts.length ? html`<p class="facts-line">${facts.join(' · ')}${c.matchId ? html`<br><span class="fineprint">Only fills details that are blank on her profile.</span>` : ''}</p>` : ''}
        ${c.sessions.length ? html`
          <ul class="rs-list">
            ${c.sessions.map((s) => html`
              <li class="${s.include ? '' : 'off'}" data-session="${s.key}">
                <label class="check"><input type="checkbox" data-s="include" ${s.include ? new Raw('checked') : ''} aria-label="Import session"></label>
                <input type="date" data-s="date" value="${s.date}" aria-label="Session date">
                <div class="rs-body">
                  ${s.s.exercises.map((e) => html`<span class="rs-ex">${e.name}${isNewEx(e.name) ? html`<em>new</em>` : ''} <b>${setsText(e)}</b></span>`)}
                  ${s.s.body_weight_lb ? html`<span class="rs-ex">Weight <b>${fmtNum(s.s.body_weight_lb)} lb</b></span>` : ''}
                  ${s.s.notes ? html`<span class="rs-note">${s.s.notes}</span>` : ''}
                  ${!s.date ? html`<span class="rs-flag">No date written${s.s.date_text ? ` (“${s.s.date_text}”)` : ''}. Add one to import it.</span>` : ''}
                  ${s.duplicate ? html`<span class="rs-flag">Already has a session on this date. Tick to import anyway.</span>` : ''}
                </div>
              </li>`)}
          </ul>` : ''}
        ${c.measurements.length ? html`<p class="fineprint">${c.measurements.length} measurement${c.measurements.length === 1 ? '' : 's'}: ${c.measurements.map((m) => `${fmtShort(m.m.date!)}${m.m.weight_lb ? ` ${fmtNum(m.m.weight_lb)} lb` : ''}${m.m.muscle_pct ? ` ${fmtNum(m.m.muscle_pct)}%` : ''}`).join(', ')}</p>` : ''}
      </section>`;
    })}

    ${review.classes.length ? html`
      <h2 class="list-head">Class plans (${review.classes.length})</h2>
      <section class="card">
        <ul class="rs-list">
          ${review.classes.map((k) => html`
            <li class="${k.include ? '' : 'off'}" data-class="${k.key}">
              <label class="check"><input type="checkbox" data-k="include" ${k.include ? new Raw('checked') : ''} aria-label="Import class plan"></label>
              <input type="date" data-k="date" value="${k.date}" aria-label="Class date">
              <div class="rs-body">
                <span class="rs-title">${k.c.title || 'Group class'}${k.c.format ? html` <span class="muted">· ${k.c.format}</span>` : ''}</span>
                <span class="rs-note">${k.c.exercises.map((e) => e.name + (e.detail ? ` (${e.detail})` : '') + (e.regression ? ` ↓ ${e.regression}` : '') + (e.progression ? ` ↑ ${e.progression}` : '')).join(' · ')}</span>
                ${!k.date ? html`<span class="rs-flag">No date written${k.c.date_text ? ` (“${k.c.date_text}”)` : ''}. Add one to import it.</span>` : ''}
              </div>
            </li>`)}
        </ul>
      </section>` : ''}

    ${review.newExercises.length ? html`
      <h2 class="list-head">New exercises for the catalog (${review.newExercises.length})</h2>
      <section class="card">
        <p class="fineprint">These weren't in her catalog, so they'll be added. Check the category for each.</p>
        <ul class="nx-list">${review.newExercises.map((x) => html`
          <li><span>${x.name}</span>
            <select data-x="${x.key}" aria-label="Category for ${x.name}">${CATS.map((cat) => html`<option ${cat === x.category ? new Raw('selected') : ''}>${cat}</option>`)}</select>
          </li>`)}
        </ul>
      </section>` : ''}

    ${review.unclear.length ? html`
      <h2 class="list-head">Hard to read</h2>
      <section class="card">
        <ul class="unclear">${review.unclear.map((u) => html`
          <li>${u.page.thumb ? html`<img src="${u.page.thumb}" alt="">` : ''}<div><b>${u.page.label}</b><ul>${u.notes.map((n) => html`<li>${n}</li>`)}</ul></div></li>`)}
        </ul>
      </section>` : ''}

    <div class="form-actions sticky">
      <button class="btn danger ghost" data-act="discard">Discard</button>
      <span class="spacer"></span>
      <button class="btn primary" data-act="save" ${counts.clients + counts.classes === 0 ? new Raw('disabled') : ''}>
        Save ${[counts.clients ? `${counts.clients} client${counts.clients === 1 ? '' : 's'}` : '', counts.sessions ? `${counts.sessions} session${counts.sessions === 1 ? '' : 's'}` : '', counts.classes ? `${counts.classes} class${counts.classes === 1 ? '' : 'es'}` : ''].filter(Boolean).join(', ') || 'nothing'}
      </button>
    </div>`.value;

  const ch = draft.choices;
  const commit = async () => { await saveDraft(draft); refresh(); };
  root.addEventListener('change', async (e) => {
    const t = e.target as HTMLInputElement;
    const cEl = t.closest('[data-client]') as HTMLElement | null;
    const sEl = t.closest('[data-session]') as HTMLElement | null;
    const kEl = t.closest('[data-class]') as HTMLElement | null;
    if (t.dataset.s && sEl) {
      const cur = ch.sessions[sEl.dataset.session!] || {};
      if (t.dataset.s === 'include') cur.include = t.checked;
      if (t.dataset.s === 'date') { cur.date = t.value; if (t.value && cur.include === undefined) cur.include = true; if (t.value) cur.include = true; }
      ch.sessions[sEl.dataset.session!] = cur;
      return commit();
    }
    if (t.dataset.c && cEl) {
      const key = cEl.dataset.client!;
      const cur = ch.clients[key] || {};
      if (t.dataset.c === 'include') cur.include = t.checked;
      if (t.dataset.c === 'name') cur.name = t.value.trim() || undefined;
      if (t.dataset.c === 'pff') cur.pff = t.checked;
      if (t.dataset.c === 'matchId') {
        cur.matchId = t.value;
        const m = clients.find((x) => x.id === t.value);
        cur.name = m ? fullName(m) : review.clients.find((x) => x.key === key)?.writtenNames[0];
        // session duplicates depend on the client, so let them be recomputed
        review.clients.find((x) => x.key === key)?.sessions.forEach((s) => { if (ch.sessions[s.key]) delete ch.sessions[s.key].include; });
      }
      ch.clients[key] = cur;
      return commit();
    }
    if (t.dataset.k && kEl) {
      const cur = ch.classes[kEl.dataset.class!] || {};
      if (t.dataset.k === 'include') cur.include = t.checked;
      if (t.dataset.k === 'date') { cur.date = t.value; if (t.value) cur.include = true; }
      ch.classes[kEl.dataset.class!] = cur;
      return commit();
    }
    if (t.dataset.x) {
      ch.exercises = { ...(ch.exercises || {}), [t.dataset.x]: t.value as Exercise['category'] };
      return commit();
    }
  });
  root.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLButtonElement | null;
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'retry') { runPending(); setTimeout(() => refresh(), 50); }
    if (act === 'add') pickScreen(root, head, draft);
    if (act === 'discard' && await confirmDialog('Discard this import?', 'Nothing from these pages has been saved to the app yet.', 'Discard', true)) { await clearDraft(); go('/clients'); }
    if (act === 'save') {
      b.disabled = true;
      b.textContent = 'Saving…';
      try {
        const res = await saveReview(review);
        await clearDraft();
        toast(`Saved ${res.clientsSaved} client${res.clientsSaved === 1 ? '' : 's'}, ${res.sessionsSaved} session${res.sessionsSaved === 1 ? '' : 's'}${res.classesSaved ? `, ${res.classesSaved} class plan${res.classesSaved === 1 ? '' : 's'}` : ''}`);
        go('/clients');
      } catch (err) {
        console.error(err);
        toast('Saving failed. Nothing was lost; try again.');
        b.disabled = false;
        b.textContent = 'Save';
      }
    }
  });
}
