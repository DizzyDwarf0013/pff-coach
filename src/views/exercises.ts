// Exercise catalog: browse, add, edit.
import type { Ctx } from '../router.js';
import { go } from '../router.js';
import * as db from '../db.js';
import type { Exercise, Session } from '../types.js';
import { chips, empty, formValues, segmented, select, text, textarea, topbar } from '../components.js';
import { TAGS } from '../seed.js';
import { $, $$, confirmDialog, html, toast, uid } from '../util.js';

const CATS: Exercise['category'][] = ['Lower body', 'Upper body', 'Core', 'Cardio', 'Mobility'];
const MEASURE: Record<Exercise['measure'], string> = { weight_reps: 'Weight × reps', reps: 'Reps', time: 'Time' };

export async function exerciseList({ root }: Ctx) {
  const ex = Array.from((await db.exercises()).values());
  root.innerHTML = html`
    ${topbar('Exercises', { actions: html`<a class="btn primary" href="#/exercises/new">New exercise</a>`, sub: `${ex.length} in her catalog` })}
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
                  <span class="row-title">${e.name}</span>
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
        <div class="grid">${textarea('cues', 'Coaching cues and modifications', e.cues, { rows: 3 })}</div>
      </section>
      <div class="form-actions">
        ${existing ? html`<button type="button" class="btn danger ghost" data-act="delete">Delete exercise</button>` : ''}
        <span class="spacer"></span>
        <a class="btn ghost" href="#/exercises">Cancel</a>
        <button class="btn primary">${existing ? 'Save changes' : 'Add exercise'}</button>
      </div>
    </form>`.value;

  const form = $('form', root) as HTMLFormElement;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = formValues(form);
    const name = f.str('name');
    if (!name) { toast('Give the exercise a name.'); return; }
    const byLabel = Object.fromEntries(Object.entries(TAGS).map(([k, v]) => [v, k]));
    await db.saveExercise({
      ...e, name, category: f.str('category') as Exercise['category'], equipment: f.str('equipment'),
      measure: (f.str('measure') || 'weight_reps') as Exercise['measure'], tags: f.all('tags').map((l) => byLabel[l] || l), cues: f.str('cues'),
    });
    toast(existing ? 'Exercise saved' : `${name} added`);
    go('/exercises');
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
