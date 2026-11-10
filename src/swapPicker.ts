// Swap sheet: comparable exercises for the one being swapped (same muscle group, her history first),
// a search across the whole catalog for something completely different, and quick-add.
import * as db from './db.js';
import type { Exercise, Session } from './types.js';
import type { ClientGuidance } from './logic.js';
import { GROUP_LABEL, muscleGroup, setsSummary, swapOptions } from './planlogic.js';
import { fmtShort, html, toast, uid } from './util.js';

export function swapPicker(opts: {
  current: Exercise;
  exMap: Map<string, Exercise>;
  sessions: Session[];
  guidance: ClientGuidance;
  who: string;
  inWorkout: string[];
}): Promise<Exercise | null> {
  return new Promise((resolve) => {
    const { current, exMap, who } = opts;
    const list = swapOptions(current, exMap, opts.sessions, opts.guidance, opts.inWorkout);
    const group = GROUP_LABEL[muscleGroup(current)];
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet picker swap';
    dlg.setAttribute('aria-label', `Swap ${current.name}`);
    const row = (o: (typeof list)[number]) => html`
      <li data-name="${o.ex.name.toLowerCase()}" data-similar="${o.similar ? '1' : ''}">
        <button type="button" data-pick="${o.ex.id}" class="${o.flags.length ? 'flagged' : ''}">
          <span class="pick-name">${o.ex.name}</span>
          <span class="pick-sub">${o.last ? `Last: ${setsSummary(o.last.sets, o.ex)} · ${fmtShort(o.last.date)}` : o.timesDone ? '' : `New for ${who || 'them'}`}${!o.similar ? ` · ${GROUP_LABEL[muscleGroup(o.ex)]}` : ''}</span>
          ${o.flags.length ? html`<span class="flag-text">Review${who ? ` for ${who}` : ''}: ${o.flags[0]}</span>` : ''}
        </button><button type="button" class="info-btn" data-card="${o.ex.id}" aria-label="How to do ${o.ex.name}">i</button></li>`;
    dlg.innerHTML = html`
      <div class="picker-head">
        <div><h2>Swap ${current.name}</h2><p class="muted small-sub">Showing ${group.toLowerCase()} options. Search for anything else.</p></div>
        <button class="icon-btn" data-close aria-label="Close">×</button>
      </div>
      <input type="search" class="search" placeholder="Search all exercises" aria-label="Search all exercises">
      <ul class="pick-list">
        <li class="pick-head" data-head="similar">${group}</li>
        ${list.filter((o) => o.similar).map(row)}
        <li class="pick-head" data-head="other" hidden>Other exercises</li>
        ${list.filter((o) => !o.similar).map(row)}
      </ul>
      <p class="none-match" hidden>No exercises match. Add it below.</p>
      <form class="quick-add">
        <p class="label">Not in the list?</p>
        <div class="quick-row">
          <input name="name" placeholder="New exercise name" aria-label="New exercise name" autocomplete="off">
          <select name="measure" aria-label="What to record"><option value="weight_reps">Weight × reps</option><option value="reps">Reps only</option><option value="time">Time</option></select>
          <button class="btn primary">Add</button>
        </div>
      </form>`.value;
    document.body.appendChild(dlg);
    let result: Exercise | null = null;
    const search = dlg.querySelector('.search') as HTMLInputElement;
    const filter = () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      dlg.querySelectorAll<HTMLElement>('.pick-list li[data-name]').forEach((li) => {
        // no search: only similar ones; with a search: everything that matches
        li.hidden = q ? !li.dataset.name!.includes(q) : !li.dataset.similar;
        if (!li.hidden) shown++;
      });
      const anyOther = Array.from(dlg.querySelectorAll<HTMLElement>('.pick-list li[data-name]:not([data-similar="1"])')).some((li) => !li.hidden);
      const anySimilar = Array.from(dlg.querySelectorAll<HTMLElement>('.pick-list li[data-similar="1"]')).some((li) => !li.hidden);
      (dlg.querySelector('[data-head="other"]') as HTMLElement).hidden = !anyOther;
      (dlg.querySelector('[data-head="similar"]') as HTMLElement).hidden = !anySimilar;
      (dlg.querySelector('.none-match') as HTMLElement).hidden = shown > 0;
      const qa = dlg.querySelector('.quick-add input[name="name"]') as HTMLInputElement;
      if (q && !shown) qa.value = search.value.trim();
    };
    filter();
    search.addEventListener('input', filter);
    dlg.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-close]') || t === dlg) { dlg.close(); return; }
      const pb = t.closest('[data-pick]') as HTMLElement | null;
      if (pb) { result = exMap.get(pb.dataset.pick!) || null; dlg.close(); }
    });
    dlg.querySelector('.quick-add')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      const name = String(fd.get('name') || '').trim();
      if (!name) return;
      const ex: Exercise = { id: 'ex-' + uid(), name, category: current.category, equipment: '', measure: fd.get('measure') as Exercise['measure'], tags: [], custom: true };
      await db.saveExercise(ex);
      exMap.set(ex.id, ex);
      result = ex;
      toast(`${name} added to the catalog under ${current.category}. Adjust its tags under Exercises.`);
      dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
    if (window.matchMedia('(min-width: 700px)').matches) search.focus();
  });
}
