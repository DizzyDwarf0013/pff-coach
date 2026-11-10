// Exercise catalog: browse, add, edit.
import type { Ctx } from '../router.js';
import { go } from '../router.js';
import * as db from '../db.js';
import type { Exercise, Session } from '../types.js';
import { chips, empty, formValues, segmented, select, text, textarea, topbar } from '../components.js';
import { TAGS } from '../seed.js';
import { $, $$, confirmDialog, html, toast, uid } from '../util.js';
import type { ExerciseCard } from '../types.js';
import { LIBRARY, cardFor } from '../exerciseInfo.js';
import { guessTemplate, templateKeys } from '../poses.js';
import { cardHtml } from './exerciseCard.js';

const pictureName = (k: string) => (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, ' ').replace(/\brdl\b/i, 'RDL').replace(/\btrx\b/i, 'TRX');
const lines = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean);

const CATS: Exercise['category'][] = ['Lower body', 'Upper body', 'Core', 'Cardio', 'Mobility'];
const MEASURE: Record<Exercise['measure'], string> = { weight_reps: 'Weight × reps', reps: 'Reps', time: 'Time' };

export async function exerciseList({ root }: Ctx) {
  const ex = Array.from((await db.exercises()).values());
  root.innerHTML = html`
    ${topbar('Exercises', { actions: html`<a class="btn primary" href="#/exercises/new">New exercise</a>`, sub: `${ex.length} in your catalog` })}
    <div class="toolbar"><input type="search" class="search" placeholder="Search exercises or tags" aria-label="Search exercises"></div>
    ${CATS.map((cat) => {
      const rows = ex.filter((e) => e.category === cat);
      if (!rows.length) return '';
      return html`
        <section class="ex-group">
          <h2 class="list-head">${cat}</h2>
          <ul class="list">${rows.map((e) => html`
            <li data-search="${(e.name + ' ' + e.equipment + ' ' + e.tags.map((t) => TAGS[t] || t).join(' ')).toLowerCase()}">
              <a class="row" href="#/exercises/${e.id}">
                <span class="row-main">
                  <span class="row-title">${e.name}${cardFor(e).steps.length ? '' : html` <span class="badge">Needs card text</span>`}</span>
                  <span class="row-sub">${[e.equipment, MEASURE[e.measure]].filter(Boolean).join(' · ')}</span>
                </span>
                <span class="tag-dots">${e.tags.map((t) => html`<span class="tag ${t === 'prenatal-friendly' || t === 'pelvic-floor' ? 'good' : ''}">${TAGS[t] || t}</span>`)}</span>
                <span class="chev" aria-hidden="true">›</span>
              </a></li>`)}
          </ul>
        </section>`;
    })}
    <p class="none-match" hidden>No exercises match that search.</p>`.value;

  const search = $('.search', root) as HTMLInputElement;
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    $$('.ex-group', root).forEach((g) => {
      let any = false;
      $$('li', g).forEach((li) => { const on = !q || li.dataset.search!.includes(q); li.hidden = !on; if (on) { any = true; shown++; } });
      g.hidden = !any;
    });
    $('.none-match', root)!.hidden = shown > 0;
  });
}

export async function exerciseForm({ root, params }: Ctx) {
  const map = await db.exercises();
  const existing = params.id ? map.get(params.id) : undefined;
  if (params.id && !existing) { root.innerHTML = empty('Exercise not found', '').value; return; }
  const e: Exercise = existing || { id: 'ex-' + uid(), name: '', category: 'Lower body', equipment: '', measure: 'weight_reps', tags: [], custom: true };
  const tagKeys = Object.keys(TAGS);

  const card = cardFor(e);
  const lib = LIBRARY.get(e.name.toLowerCase().trim());
  root.innerHTML = html`
    ${topbar(existing ? e.name : 'New exercise', { back: '/exercises', backLabel: 'Exercises' })}
    <form class="form">
      <section class="card">
        <div class="grid">
          ${text('name', 'Name', e.name, { required: true })}
          ${select('category', 'Category', e.category, CATS.map((c) => [c, c]))}
          ${text('equipment', 'Equipment', e.equipment)}
          ${segmented('measure', 'What to record', e.measure, Object.entries(MEASURE) as [string, string][])}
        </div>
        ${chips('tags', 'Tags', e.tags.map((t) => TAGS[t] || t), tagKeys.map((k) => TAGS[k]), { hint: 'Tags let the app flag this exercise for clients whose intake calls for care, like diastasis recti or knee pain.' })}
      </section>

      <section class="card card-edit">
        <div class="card-head"><h2>Exercise card</h2>${e.card ? html`<button type="button" class="btn small ghost" data-act="reset-card">${lib ? 'Reset to built-in' : 'Clear my edits'}</button>` : ''}</div>
        <p class="fineprint">This is what clients see when you tap the exercise name, and what prints on their workout sheets.${lib && !e.card ? ' It starts from the built-in description; change anything to make it yours.' : ''}</p>
        <div class="card-edit-grid">
          <div class="card-edit-fields grid">
            ${select('pic', 'Picture', card.t, templateKeys.slice().sort().map((k) => [k, pictureName(k)]))}
            ${textarea('steps', 'How to do it (one step per line)', card.steps.join('\n'), { rows: 5 })}
            ${textarea('cueList', 'Coaching cues (one per line)', (card.cues.length ? card.cues : e.cues ? lines(e.cues) : []).join('\n'), { rows: 3 })}
            ${text('breathe', 'Breathing', card.breathe, { wide: true })}
            ${text('easier', 'Easier option', card.easier, { wide: true })}
            ${text('harder', 'Harder option', card.harder, { wide: true })}
            ${textarea('preg', 'Pregnancy note', card.preg, { rows: 2 })}
          </div>
          <div class="card-preview" aria-label="Card preview">${cardHtml(e)}</div>
        </div>
      </section>
      <div class="form-actions">
        ${existing ? html`<button type="button" class="btn danger ghost" data-act="delete">Delete exercise</button>` : ''}
        <span class="spacer"></span>
        <a class="btn ghost" href="#/exercises">Cancel</a>
        <button class="btn primary">${existing ? 'Save changes' : 'Add exercise'}</button>
      </div>
    </form>`.value;

  // the card as edited on screen, keeping only what differs from the built-in text
  const editedCard = (f: ReturnType<typeof formValues>, name: string): ExerciseCard | undefined => {
    const base = LIBRARY.get(name.toLowerCase().trim()) || { t: guessTemplate(name, f.str('category')), steps: [], cues: [] };
    const out: ExerciseCard = {};
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
    const v = { t: f.str('pic'), steps: lines(f.str('steps')), cues: lines(f.str('cueList')), breathe: f.str('breathe') || undefined, easier: f.str('easier') || undefined, harder: f.str('harder') || undefined, preg: f.str('preg') || undefined };
    (Object.keys(v) as (keyof typeof v)[]).forEach((k) => { if (!same(v[k], (base as any)[k])) (out as any)[k] = v[k] ?? ''; });
    return Object.keys(out).length ? out : undefined;
  };

  const form = $('form', root) as HTMLFormElement;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = formValues(form);
    const name = f.str('name');
    if (!name) { toast('Give the exercise a name.'); return; }
    const byLabel = Object.fromEntries(Object.entries(TAGS).map(([k, v]) => [v, k]));
    const next: Exercise = {
      ...e, name, category: f.str('category') as Exercise['category'], equipment: f.str('equipment'),
      measure: (f.str('measure') || 'weight_reps') as Exercise['measure'], tags: f.all('tags').map((l) => byLabel[l] || l),
    };
    const c = editedCard(f, name);
    if (c) next.card = c; else delete next.card;
    if (c?.cues || !e.cues) delete next.cues; // the old free-text cues move into the card's cue list
    await db.saveExercise(next);
    toast(existing ? 'Exercise saved' : `${name} added`);
    go('/exercises');
  });
  // live preview as she edits
  const preview = () => {
    const f = formValues(form);
    const tmp: Exercise = { ...e, name: f.str('name') || e.name, equipment: f.str('equipment'), tags: f.all('tags').map((l) => Object.entries(TAGS).find(([, v]) => v === l)?.[0] || l) };
    const c = editedCard(f, tmp.name);
    if (c) tmp.card = c; else delete tmp.card;
    const el = $('.card-preview', root);
    if (el) el.innerHTML = cardHtml(tmp).value;
  };
  let t: number | undefined;
  form.addEventListener('input', () => { window.clearTimeout(t); t = window.setTimeout(preview, 250); });
  form.addEventListener('change', preview);
  $('[data-act="reset-card"]', root)?.addEventListener('click', async () => {
    if (!(await confirmDialog(lib ? 'Reset the card?' : 'Clear your card edits?', lib ? 'Your changes to this card will be replaced with the built-in description.' : 'The card text you wrote will be removed.', 'Reset'))) return;
    const next = { ...e };
    delete next.card;
    await db.saveExercise(next);
    toast('Card reset');
    go(`/exercises/${e.id}`, true);
  });
  $('[data-act="delete"]', root)?.addEventListener('click', async () => {
    const sessions = await db.all<Session>('sessions');
    const usedIn = sessions.filter((s) => s.items.some((i) => i.exerciseId === e.id)).length;
    const ok = await confirmDialog(`Delete ${e.name}?`, usedIn ? `It appears in ${usedIn} logged sessions. Those sets will no longer show up in history or charts.` : 'It will be removed from the catalog.', 'Delete', true);
    if (!ok) return;
    await db.deleteExercise(e.id);
    toast('Exercise deleted');
    go('/exercises', true);
  });
}
