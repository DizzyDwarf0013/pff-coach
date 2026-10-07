// Session logging and workout planning.
import type { Ctx } from '../router.js';
import { go } from '../router.js';
import * as db from '../db.js';
import type { Client, Exercise, Session, SessionItem, SetEntry } from '../types.js';
import { avatar, empty, topbar } from '../components.js';
import { filled, flagsFor, guidance, lastPerformance, lastSummary, progressionHint, setLabel, type ClientGuidance } from '../logic.js';
import { $, $$, confirmDialog, debounce, fmtShort, fullName, html, num, Raw, relDay, toast, today, uid } from '../util.js';

function blankSession(clientId: string, status: Session['status'], date = today()): Session {
  const now = new Date().toISOString();
  return { id: uid(), clientId, date, status, items: [], post: {}, createdAt: now, updatedAt: now };
}

const copyItems = (items: SessionItem[]): SessionItem[] => items.map((it) => ({ exerciseId: it.exerciseId, sets: it.sets.map((s) => ({ ...s })), notes: '' }));

/** "Start session" / "Plan a workout": pick a client, then how to start. */
export async function newSession({ root, query }: Ctx) {
  const clientId = query.get('client');
  const plan = query.get('plan') === '1';
  const verb = plan ? 'Plan a workout' : 'Start session';

  if (!clientId) {
    const clients = (await db.getClients()).filter((c) => c.status !== 'inactive').sort((a, b) => a.firstName.localeCompare(b.firstName));
    root.innerHTML = html`
      ${topbar(verb, { back: '/', backLabel: 'Today', sub: 'Who is this for?' })}
      ${clients.length ? html`<ul class="list">${clients.map((c) => html`
        <li><a class="row" href="#/sessions/new?client=${c.id}${plan ? '&plan=1' : ''}">${avatar(c)}<span class="row-main"><span class="row-title">${fullName(c)}</span><span class="row-sub">${c.isPinkFitness ? 'Pink Fitness' : 'Private'}</span></span><span class="chev" aria-hidden="true">›</span></a></li>`)}
      </ul>` : empty('No clients yet', 'Add a client first.', html`<a class="btn primary" href="#/clients/new">New client</a>`)}`.value;
    return;
  }

  const c = await db.getClient(clientId);
  if (!c) { go('/sessions/new', true); return; }
  const sessions = await db.sessionsFor(c.id);
  const last = sessions.find((s) => s.status !== 'planned' && s.items.length);
  const plannedToday = sessions.filter((s) => s.status === 'planned').sort((a, b) => Math.abs(+new Date(a.date) - Date.now()) - Math.abs(+new Date(b.date) - Date.now()))[0];
  const inProgress = sessions.find((s) => s.status === 'in_progress');

  const options: Raw[] = [];
  if (!plan && inProgress) options.push(html`<button class="choice" data-choice="resume"><b>Pick up the session in progress</b><span>Started ${relDay(inProgress.date).toLowerCase()}, ${inProgress.items.length} exercises</span></button>`);
  if (!plan && plannedToday) options.push(html`<button class="choice" data-choice="planned"><b>Use the workout planned for ${relDay(plannedToday.date).toLowerCase()}</b><span>${plannedToday.items.length} exercises</span></button>`);
  if (last) options.push(html`<button class="choice" data-choice="repeat"><b>Repeat her last workout</b><span>${fmtShort(last.date)}, ${last.items.length} exercises with the same weights</span></button>`);
  options.push(html`<button class="choice" data-choice="blank"><b>Start from scratch</b><span>Add exercises as you go</span></button>`);

  root.innerHTML = html`
    ${topbar(verb, { back: `/clients/${c.id}`, backLabel: fullName(c), sub: `For ${fullName(c)}` })}
    ${plan ? html`<label class="field narrow"><span class="label">Workout date</span><input type="date" name="planDate" value="${today()}"></label>` : ''}
    <div class="choices">${options}</div>`.value;

  root.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('[data-choice]') as HTMLElement | null;
    if (!b) return;
    const choice = b.dataset.choice;
    if (choice === 'resume' && inProgress) { go(`/sessions/${inProgress.id}`, true); return; }
    if (choice === 'planned' && plannedToday) {
      plannedToday.status = 'in_progress';
      plannedToday.date = today();
      await db.saveSession(plannedToday);
      go(`/sessions/${plannedToday.id}`, true);
      return;
    }
    const date = plan ? (($('input[name="planDate"]', root) as HTMLInputElement).value || today()) : today();
    const s = blankSession(c.id, plan ? 'planned' : 'in_progress', date);
    if (choice === 'repeat' && last) s.items = copyItems(last.items);
    await db.saveSession(s);
    go(`/sessions/${s.id}${choice === 'blank' ? '?add=1' : ''}`, true);
  });
}

export async function sessionEditor({ root, params, query, mounted }: Ctx) {
  const s = await db.getSession(params.id);
  if (!s) { root.innerHTML = html`${topbar('Session not found', { back: '/' })}${empty('Session not found', 'It may have been deleted.')}`.value; return; }
  const c = (await db.getClient(s.clientId))!;
  const [history, exMap] = await Promise.all([db.sessionsFor(c.id), db.exercises()]);
  const g = guidance(c);
  const others = history.filter((h) => h.id !== s.id);

  const save = debounce(async () => {
    s.updatedAt = new Date().toISOString();
    await db.saveSession(s);
    await syncMeasurement(s);
    const status = $('.save-state', root);
    if (status) status.textContent = 'Saved';
  }, 500);
  const touch = () => { const st = $('.save-state', root); if (st) st.textContent = 'Saving…'; save(); };
  const saveNow = async () => { save.flush(); s.updatedAt = new Date().toISOString(); await db.saveSession(s); await syncMeasurement(s); };

  const paint = () => {
    root.innerHTML = html`
      ${topbar(s.status === 'planned' ? 'Planned workout' : 'Session', {
        back: `/clients/${c.id}?tab=sessions`, backLabel: fullName(c),
        sub: html`${fullName(c)} · ${c.isPinkFitness ? 'Pink Fitness' : 'Private'}${g.stage ? ` · ${g.stage}` : ''}`,
        actions: html`<a class="btn ghost" href="#/sessions/${s.id}/sheet">Share</a>`,
      })}
      <div class="session-meta">
        <label class="field"><span class="label">Date</span><input type="date" data-meta="date" value="${s.date}"></label>
        ${s.status !== 'planned' ? html`<label class="field"><span class="label">Length</span><span class="unit-wrap"><input inputmode="numeric" data-meta="durationMin" value="${s.durationMin ?? ''}" placeholder="50"><span class="unit">min</span></span></label>` : ''}
        <span class="save-state" aria-live="polite">Saved</span>
      </div>
      ${g.notes.some((n) => n.kind === 'review') ? html`
        <details class="watch-inline"><summary>${g.notes.filter((n) => n.kind === 'review').length} things to watch for ${c.firstName}</summary>
          <ul class="notes">${g.notes.map((n) => html`<li class="${n.kind}">${n.text}</li>`)}</ul></details>` : ''}

      <ol class="items">
        ${s.items.map((it, i) => itemCard(it, i, s, exMap.get(it.exerciseId), others, g))}
      </ol>
      <button class="btn add-ex" data-act="add-ex">Add exercise</button>

      ${s.status !== 'planned' ? postSection(s, exMap) : html`
        <section class="card">
          <h2>Notes for the session</h2>
          <textarea data-meta="trainerNotes" rows="3" placeholder="Focus, equipment to set up, anything to remember">${s.trainerNotes || ''}</textarea>
        </section>`}

      <div class="form-actions sticky">
        <button class="btn danger ghost" data-act="delete">Delete</button>
        <span class="spacer"></span>
        ${s.status === 'planned' ? html`<button class="btn primary" data-act="start">Start this workout now</button>`
          : s.status === 'in_progress' ? html`<button class="btn primary" data-act="finish">Finish session</button>`
          : html`<a class="btn primary" href="#/clients/${c.id}?tab=sessions">Done</a>`}
      </div>`.value;
  };

  paint();

  // ---- typing: update the model without re-rendering, so focus stays put ----
  root.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.f) {
      const it = s.items[+t.dataset.i!];
      const set = it.sets[+t.dataset.j!];
      const v = num(t.value);
      (set as any)[t.dataset.f] = v === undefined ? null : v;
      touch();
    } else if (t.dataset.note !== undefined) {
      s.items[+t.dataset.note].notes = t.value;
      touch();
    } else if (t.dataset.meta) {
      const k = t.dataset.meta;
      if (k === 'date') s.date = t.value || today();
      else if (k === 'durationMin') s.durationMin = num(t.value);
      else if (k === 'trainerNotes') s.trainerNotes = t.value;
      touch();
    } else if (t.dataset.post) {
      const k = t.dataset.post as keyof Session['post'];
      (s.post as any)[k] = k === 'weight' || k === 'musclePct' ? num(t.value) : t.value;
      touch();
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'intensity') { s.post.intensity = t.value as any; touch(); }
    if (t.dataset.post === 'favorite' || t.dataset.post === 'leastFavorite') { (s.post as any)[t.dataset.post] = t.value; touch(); }
  });
  // Enter in a set input jumps to the next input, which is what you want between sets.
  root.addEventListener('keydown', (e) => {
    const t = e.target as HTMLInputElement;
    if (e.key !== 'Enter' || !t.dataset.f) return;
    e.preventDefault();
    const inputs = $$('input[data-f]', root) as HTMLInputElement[];
    const next = inputs[inputs.indexOf(t) + 1];
    if (next) next.focus(); else t.blur();
  });

  // ---- structural actions ----
  root.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!b) return;
    const i = b.dataset.i !== undefined ? +b.dataset.i : -1;
    const act = b.dataset.act;
    if (act === 'add-set') {
      const sets = s.items[i].sets;
      sets.push(sets.length ? { ...sets[sets.length - 1] } : {});
    } else if (act === 'del-set') {
      s.items[i].sets.splice(+b.dataset.j!, 1);
    } else if (act === 'use-last') {
      const lp = lastPerformance(others, s.items[i].exerciseId, s.id, s.date);
      if (lp) s.items[i].sets = lp.item.sets.filter(filled).map((x) => ({ ...x }));
    } else if (act === 'up' && i > 0) {
      [s.items[i - 1], s.items[i]] = [s.items[i], s.items[i - 1]];
    } else if (act === 'down' && i < s.items.length - 1) {
      [s.items[i + 1], s.items[i]] = [s.items[i], s.items[i + 1]];
    } else if (act === 'del-ex') {
      if (s.items[i].sets.some(filled) && !(await confirmDialog('Remove this exercise?', 'Its logged sets will be removed from the session.', 'Remove', true))) return;
      s.items.splice(i, 1);
    } else if (act === 'add-ex') {
      const picked = await pickExercise(exMap, g, c, s.items.map((x) => x.exerciseId));
      if (!picked) return;
      const ex = picked;
      const lp = lastPerformance(others, ex.id, s.id, s.date);
      const sets: SetEntry[] = lp ? lp.item.sets.filter(filled).map((x) => ({ ...x })) : [{}, {}, {}];
      s.items.push({ exerciseId: ex.id, sets });
      if (!exMap.has(ex.id)) exMap.set(ex.id, ex);
      await saveNow();
      paint();
      const cards = $$('.item', root);
      cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    } else if (act === 'start') {
      s.status = 'in_progress';
      s.date = today();
    } else if (act === 'finish') {
      s.status = 'complete';
      await saveNow();
      toast('Session saved');
      go(`/clients/${c.id}?tab=sessions`);
      return;
    } else if (act === 'delete') {
      if (!(await confirmDialog('Delete this session?', 'The logged sets and any measurement taken in it will be removed.', 'Delete session', true))) return;
      save.flush();
      await db.del('sessions', s.id);
      await db.del('measurements', `s-${s.id}`);
      toast('Session deleted');
      go(`/clients/${c.id}?tab=sessions`, true);
      return;
    } else return;
    await saveNow();
    const y = window.scrollY;
    paint();
    window.scrollTo(0, y);
  });

  mounted(() => { if (query.get('add') === '1' && !s.items.length) ($('[data-act="add-ex"]', root) as HTMLButtonElement)?.click(); });
}

function itemCard(it: SessionItem, i: number, s: Session, ex: Exercise | undefined, others: Session[], g: ClientGuidance): Raw {
  if (!ex) return html`<li class="item card"><p>This exercise was removed from the catalog.</p><button class="btn small danger ghost" data-act="del-ex" data-i="${i}">Remove</button></li>`;
  const flags = flagsFor(ex, g);
  const last = lastSummary(others, ex, s.id, s.date);
  const hint = s.status !== 'complete' ? progressionHint(others, ex, s.id) : undefined;
  const cols = ex.measure === 'weight_reps' ? [['weight', 'lb'], ['reps', 'reps']] : ex.measure === 'reps' ? [['reps', 'reps']] : [['seconds', 'sec']];
  return html`
    <li class="item card">
      <div class="item-head">
        <h3>${ex.name}</h3>
        <div class="item-tools">
          <button class="icon-btn" data-act="up" data-i="${i}" aria-label="Move ${ex.name} up" ${i === 0 ? new Raw('disabled') : ''}>↑</button>
          <button class="icon-btn" data-act="down" data-i="${i}" aria-label="Move ${ex.name} down" ${i === s.items.length - 1 ? new Raw('disabled') : ''}>↓</button>
          <button class="icon-btn" data-act="del-ex" data-i="${i}" aria-label="Remove ${ex.name}">×</button>
        </div>
      </div>
      ${flags.length ? html`<p class="flag">${flags.join(' ')}</p>` : ''}
      ${last ? html`<p class="last"><span>Last time</span> ${last}</p>` : html`<p class="last"><span>New</span> no history for this one yet</p>`}
      ${hint ? html`<p class="hint-line">${hint}</p>` : ''}
      <table class="sets">
        <thead><tr><th scope="col">Set</th>${cols.map(([, u]) => html`<th scope="col">${u}</th>`)}<th><span class="sr">Remove</span></th></tr></thead>
        <tbody>
          ${it.sets.map((set, j) => html`
            <tr>
              <td class="set-n">${j + 1}</td>
              ${cols.map(([f, u]) => html`<td><input class="set-in" inputmode="decimal" enterkeyhint="next" data-i="${i}" data-j="${j}" data-f="${f}" value="${(set as any)[f] ?? ''}" aria-label="Set ${j + 1} ${u}"></td>`)}
              <td><button class="icon-btn subtle" data-act="del-set" data-i="${i}" data-j="${j}" aria-label="Remove set ${j + 1}">×</button></td>
            </tr>`)}
        </tbody>
      </table>
      <div class="item-actions">
        <button class="btn small" data-act="add-set" data-i="${i}">Add set</button>
        ${last ? html`<button class="btn small ghost" data-act="use-last" data-i="${i}">Copy last time</button>` : ''}
      </div>
      <input class="item-note" data-note="${i}" value="${it.notes || ''}" placeholder="Notes: cues, modifications, how it felt" aria-label="Notes for ${ex.name}">
    </li>`;
}

function postSection(s: Session, exMap: Map<string, Exercise>): Raw {
  const opts = (sel?: string) => html`<option value="">—</option>${s.items.map((it) => { const e = exMap.get(it.exerciseId); return e ? html`<option value="${e.id}" ${sel === e.id ? new Raw('selected') : ''}>${e.name}</option>` : ''; })}`;
  return html`
    <section class="card post">
      <h2>After the session</h2>
      <div class="grid">
        <label class="field"><span class="label">Weight</span><span class="unit-wrap"><input inputmode="decimal" data-post="weight" value="${s.post.weight ?? ''}"><span class="unit">lb</span></span></label>
        <label class="field"><span class="label">Muscle</span><span class="unit-wrap"><input inputmode="decimal" data-post="musclePct" value="${s.post.musclePct ?? ''}"><span class="unit">%</span></span></label>
        <fieldset class="field wide"><legend class="label">How hard did it feel to her?</legend>
          <div class="seg">${[['light', 'Light'], ['moderate', 'Moderate'], ['intense', 'Intense']].map(([v, l]) => html`<label><input type="radio" name="intensity" value="${v}" ${s.post.intensity === v ? new Raw('checked') : ''}><span>${l}</span></label>`)}</div>
        </fieldset>
        <label class="field"><span class="label">Favorite exercise</span><select data-post="favorite">${opts(s.post.favorite)}</select></label>
        <label class="field"><span class="label">Least favorite</span><select data-post="leastFavorite">${opts(s.post.leastFavorite)}</select></label>
        <label class="field wide"><span class="label">Anything she liked, or wishes you did differently?</span><textarea data-post="feedback" rows="2">${s.post.feedback || ''}</textarea></label>
        <label class="field wide"><span class="label">Your notes</span><textarea data-meta="trainerNotes" rows="2">${s.trainerNotes || ''}</textarea></label>
      </div>
    </section>`;
}

/** Weight and muscle % recorded after a session also land on her progress charts. */
async function syncMeasurement(s: Session) {
  const id = `s-${s.id}`;
  if (s.status !== 'planned' && (s.post.weight || s.post.musclePct)) {
    await db.put('measurements', { id, clientId: s.clientId, date: s.date, weight: s.post.weight, musclePct: s.post.musclePct, sessionId: s.id });
  } else {
    await db.del('measurements', id);
  }
}

// ---- exercise picker ----
function pickExercise(exMap: Map<string, Exercise>, g: ClientGuidance, c: Client, already: string[]): Promise<Exercise | null> {
  return new Promise((resolve) => {
    const list = Array.from(exMap.values());
    const cats = ['All', 'Lower body', 'Upper body', 'Core', 'Cardio', 'Mobility'];
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet picker';
    dlg.setAttribute('aria-label', 'Add exercise');
    dlg.innerHTML = html`
      <div class="picker-head">
        <h2>Add exercise</h2>
        <button class="icon-btn" data-close aria-label="Close">×</button>
      </div>
      <input type="search" class="search" placeholder="Search exercises" aria-label="Search exercises">
      <div class="seg compact cats">${cats.map((k, n) => html`<button type="button" data-cat="${k}" class="${n === 0 ? 'on' : ''}">${k === 'All' ? 'All' : k.replace(' body', '')}</button>`)}</div>
      <ul class="pick-list">
        ${list.map((e) => {
          const f = flagsFor(e, g);
          return html`<li data-cat="${e.category}" data-name="${e.name.toLowerCase()}">
            <button type="button" data-pick="${e.id}" class="${f.length ? 'flagged' : ''}">
              <span class="pick-name">${e.name}${already.includes(e.id) ? html` <span class="muted">· added</span>` : ''}</span>
              <span class="pick-sub">${f.length ? html`<span class="flag-text">Review for ${c.firstName}: ${f[0]}</span>` : e.equipment}</span>
            </button></li>`;
        })}
      </ul>
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
    let cat = 'All';
    const search = dlg.querySelector('.search') as HTMLInputElement;
    const filter = () => {
      const q = search.value.trim().toLowerCase();
      dlg.querySelectorAll<HTMLElement>('.pick-list li').forEach((li) => {
        li.hidden = !((cat === 'All' || li.dataset.cat === cat) && (!q || li.dataset.name!.includes(q)));
      });
    };
    search.addEventListener('input', filter);
    dlg.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-close]') || t === dlg) { dlg.close(); return; }
      const cb = t.closest('[data-cat]') as HTMLElement | null;
      if (cb && cb.tagName === 'BUTTON') {
        cat = cb.dataset.cat!;
        dlg.querySelectorAll('.cats button').forEach((b) => b.classList.toggle('on', b === cb));
        filter();
        return;
      }
      const pb = t.closest('[data-pick]') as HTMLElement | null;
      if (pb) { result = exMap.get(pb.dataset.pick!) || null; dlg.close(); }
    });
    dlg.querySelector('.quick-add')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      const name = String(fd.get('name') || '').trim();
      if (!name) return;
      const ex: Exercise = { id: 'ex-' + uid(), name, category: cat === 'All' ? 'Lower body' : (cat as Exercise['category']), equipment: '', measure: fd.get('measure') as Exercise['measure'], tags: [], custom: true };
      await db.saveExercise(ex);
      result = ex;
      toast(`${name} added to the catalog. Set its category and tags under Exercises.`);
      dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
    if (window.matchMedia('(min-width: 700px)').matches) search.focus();
  });
}

// ---- shareable sheet ----
export function sessionSheetRows(s: Session, exMap: Map<string, Exercise>): Raw {
  return html`${s.items.map((it, n) => {
    const e = exMap.get(it.exerciseId);
    if (!e) return '';
    const sets = it.sets.filter(filled);
    return html`<tr><td class="n">${n + 1}</td><td><b>${e.name}</b>${it.notes ? html`<br><span class="muted">${it.notes}</span>` : ''}</td><td>${sets.length || it.sets.length} sets</td><td>${sets.map((x) => setLabel(x, e.measure)).join(', ') || '—'}</td></tr>`;
  })}`;
}
