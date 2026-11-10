// Group classes: planning, class history (including plans imported from notebooks), and suggestions
// drawn from past classes of the same type or name. Attendees get the class filed in their logs.
import type { Ctx } from '../router.js';
import { go } from '../router.js';
import * as db from '../db.js';
import type { ClassMove, ClassPlan, Client } from '../types.js';
import { empty, topbar } from '../components.js';
import { flagsFor, type ClientGuidance } from '../logic.js';
import {
  className, groupGuidance, isTaught, moveIdeas, norm, recentLabels, repeatsFromLast, similarClasses, startingPoints,
  type GroupGuidance, type Similar,
} from '../classlogic.js';
import { pickExercise } from './session.js';
import { $, $$, confirmDialog, daysBetween, debounce, fmtDate, fmtShort, fullName, html, num, parseDate, Raw, raw, relDay, toast, today, uid } from '../util.js';

const SECTION_DEFAULTS = ['Warm-up', 'Workout', 'Cool-down'];
const TYPE_DEFAULTS = ['Strength', 'HIIT', 'Circuit', 'Core & pelvic floor', 'Prenatal', 'Postnatal', 'Mommy & Me', 'Stretch & mobility'];

function fmtTime(t?: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m || 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function classSub(p: ClassPlan, opts: { moves?: boolean } = {}): string {
  const n = (p.attendeeIds || []).length;
  return [
    fmtTime(p.time),
    p.title && p.format ? p.format : '',
    p.durationMin ? `${p.durationMin} min` : '',
    n ? `${n} ${n === 1 ? 'client' : 'clients'}` : '',
    opts.moves !== false ? p.exercises.map((e) => e.name).slice(0, 3).join(', ') : '',
  ].filter(Boolean).join(' · ');
}

function classRow(p: ClassPlan, extra = ''): Raw {
  const d = parseDate(p.date);
  return html`
    <li><a class="row" href="#/classes/${p.id}">
      <span class="date-chip"><b>${d.getDate()}</b>${d.toLocaleDateString(undefined, { month: 'short' })}</span>
      <span class="row-main">
        <span class="row-title">${className(p)}</span>
        <span class="row-sub">${[extra, classSub(p)].filter(Boolean).join(' · ')}</span>
      </span>
      <span class="chev" aria-hidden="true">›</span>
    </a></li>`;
}

// ---------------- list ----------------

export async function classList({ root }: Ctx) {
  const plans = await db.allClasses();
  const t = today();
  const upcoming = plans.filter((p) => !isTaught(p) && p.date >= t).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  const unmarked = plans.filter((p) => !isTaught(p) && p.date < t);
  const past = plans.filter(isTaught);
  const byMonth = new Map<string, ClassPlan[]>();
  for (const p of past) {
    const k = p.date.slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(p);
  }
  root.innerHTML = html`
    ${topbar('Classes', {
      sub: past.length ? `${past.length} past ${past.length === 1 ? 'class' : 'classes'}` : undefined,
      actions: html`<a class="btn ghost" href="#/import">Import</a><a class="btn primary" href="#/classes/new">Plan a class</a>`,
    })}
    ${!plans.length ? empty('No classes yet', 'Plan a class to build its workout, choose who is coming, and file it in each client\'s log. Classes from her notebooks show up here too once they\'re imported.', html`<a class="btn primary" href="#/classes/new">Plan a class</a>`) : ''}
    ${upcoming.length ? html`<h2 class="list-head">Coming up</h2><ul class="list">${upcoming.map((p) => classRow(p, relDay(p.date)))}</ul>` : ''}
    ${unmarked.length ? html`<h2 class="list-head">Not marked as taught</h2><ul class="list">${unmarked.map((p) => classRow(p, 'Planned'))}</ul>` : ''}
    ${Array.from(byMonth.entries()).map(([month, list]) => html`
      <h2 class="list-head">${parseDate(month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
      <ul class="list">${list.map((p) => classRow(p))}</ul>`)}
  `.value;
}

// ---------------- detail ----------------

function sections(moves: ClassMove[]): [string, ClassMove[]][] {
  const out: [string, ClassMove[]][] = [];
  for (const e of moves) {
    const name = e.section || '';
    const last = out[out.length - 1];
    if (last && last[0] === name) last[1].push(e); else out.push([name, [e]]);
  }
  return out;
}

async function attendeesOf(p: ClassPlan): Promise<Client[]> {
  const ids = p.attendeeIds || [];
  if (!ids.length) return [];
  const byId = new Map((await db.getClients()).map((c) => [c.id, c]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as Client[];
}

function watchBlock(gg: GroupGuidance, open = false): Raw {
  if (!gg.people.length) return html``;
  return html`
    <details class="watch-inline" ${open ? raw('open') : ''}>
      <summary>Things to watch for ${gg.people.length === 1 ? gg.people[0].client.firstName : `${gg.people.length} clients`}</summary>
      <ul class="notes">${gg.people.map((x) => html`<li><b>${x.client.firstName}${x.stage ? ` · ${x.stage}` : ''}.</b> ${x.review.join(' ') || 'Some exercises are flagged from her intake.'}</li>`)}</ul>
    </details>`;
}

export async function classDetail({ root, params }: Ctx) {
  const p = await db.get<ClassPlan>('classes', params.id);
  if (!p) { root.innerHTML = html`${topbar('Class not found', { back: '/classes', backLabel: 'Classes' })}${empty('Class not found', 'It may have been deleted.')}`.value; return; }
  const [attendees, exMap, all] = await Promise.all([attendeesOf(p), db.exercises(), db.allClasses()]);
  const gg = groupGuidance(attendees);
  const base = p.basedOn ? all.find((x) => x.id === p.basedOn) : undefined;
  const when = [fmtDate(p.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), fmtTime(p.time)].filter(Boolean).join(' at ');

  root.innerHTML = html`
    ${topbar(className(p), {
      back: '/classes', backLabel: 'Classes', sub: when,
      actions: html`<a class="btn ghost" href="#/classes/new?from=${p.id}">Plan one like this</a><a class="btn" href="#/classes/${p.id}/edit">Edit</a>`,
    })}
    ${!isTaught(p) ? html`
      <div class="resume planned class-status">
        <b>${p.date >= today() ? `Planned for ${relDay(p.date).toLowerCase()}` : 'Planned, not marked as taught yet'}</b>
        <span>${attendees.length ? 'After class, check who came and mark it as taught. It moves into each client\'s history.' : 'Add who\'s coming in Edit, then mark it as taught after class.'}</span>
        <span class="row-end"><button class="btn primary" data-act="taught">Mark as taught</button></span>
      </div>` : ''}
    <section class="card">
      <dl class="facts">
        ${p.format ? html`<div><dt>Type</dt><dd>${p.format}</dd></div>` : ''}
        ${p.durationMin ? html`<div><dt>Length</dt><dd>${p.durationMin} min</dd></div>` : ''}
        <div><dt>${isTaught(p) ? 'Came' : 'Coming'}</dt><dd>${attendees.length ? attendees.length : 'No one added'}</dd></div>
        ${base ? html`<div><dt>Built from</dt><dd><a href="#/classes/${base.id}">${className(base)}, ${fmtShort(base.date)}</a></dd></div>` : ''}
      </dl>
      ${attendees.length ? html`<p class="attendee-line">${attendees.map((c, i) => html`${i ? ', ' : ''}<a href="#/clients/${c.id}?tab=sessions">${fullName(c)}</a>`)}</p>` : ''}
      ${watchBlock(gg)}
    </section>
    <section class="card">
      <h2>Workout</h2>
      ${!p.exercises.length ? html`<p class="muted">No moves yet. Tap Edit to build the workout.</p>` : ''}
      ${sections(p.exercises).map(([name, list]) => html`
        ${name ? html`<h3 class="class-section">${name}</h3>` : ''}
        <ul class="class-moves">${list.map((e) => {
          const ex = e.exerciseId ? exMap.get(e.exerciseId) : undefined;
          const flags = ex ? flagsFor(ex, gg) : [];
          return html`
          <li><b>${e.name}</b>${e.detail ? html` <span class="muted">${e.detail}</span>` : ''}
            ${e.regression ? html`<span class="mod easier">Easier: ${e.regression}</span>` : ''}
            ${e.progression ? html`<span class="mod harder">Harder: ${e.progression}</span>` : ''}
            ${flags.length ? html`<span class="move-flag">${flags.join(' ')}</span>` : ''}
          </li>`;
        })}
        </ul>`)}
      ${p.notes ? html`<p class="class-notes">${p.notes}</p>` : ''}
      ${p.source === 'import' ? html`<p class="fineprint">Imported from her notebook.</p>` : ''}
    </section>
    ${attendees.length ? html`<p class="fineprint">This class is filed in ${attendees.length === 1 ? `${attendees[0].firstName}'s log` : attendees.length === 2 ? 'both clients\' logs' : `the logs of all ${attendees.length} clients`}${isTaught(p) ? '' : ' as a planned class'}.</p>` : ''}
    <div class="form-actions"><button class="btn danger ghost" data-act="delete">Delete class</button></div>`.value;

  root.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!b) return;
    if (b.dataset.act === 'taught') {
      p.status = 'taught';
      p.updatedAt = new Date().toISOString();
      await db.saveClass(p);
      toast(attendees.length ? `Marked as taught and filed for ${attendees.length} ${attendees.length === 1 ? 'client' : 'clients'}` : 'Marked as taught');
      go(`/classes/${p.id}`, true);
    } else if (b.dataset.act === 'delete') {
      const n = (p.attendeeIds || []).length;
      if (!(await confirmDialog('Delete this class?', n ? `It will be removed from class history and from ${n === 1 ? 'one client\'s log' : `${n} clients' logs`}.` : 'It will be removed from class history.', 'Delete', true))) return;
      await db.deleteClass(p.id);
      toast('Class deleted');
      go('/classes', true);
    }
  });
}

// ---------------- planner ----------------

interface Sec { name: string; items: ClassMove[] }

function toSecs(moves: ClassMove[]): Sec[] {
  const out = sections(moves).map(([name, items]) => ({ name, items: items.map((m) => ({ ...m })) }));
  return out.length ? out : SECTION_DEFAULTS.map((name) => ({ name, items: [] }));
}
function flatten(secs: Sec[]): ClassMove[] {
  return secs.flatMap((s) => s.items.map((m) => {
    const out: ClassMove = { name: m.name };
    if (m.exerciseId) out.exerciseId = m.exerciseId;
    if (s.name.trim()) out.section = s.name.trim();
    if (m.detail?.trim()) out.detail = m.detail.trim();
    if (m.regression?.trim()) out.regression = m.regression.trim();
    if (m.progression?.trim()) out.progression = m.progression.trim();
    return out;
  }));
}
const copyMoves = (moves: ClassMove[]) => moves.map((m) => ({ ...m }));

export async function classEditor({ root, params, query }: Ctx) {
  const isNew = !params.id;
  const [all, clients, exMap] = await Promise.all([db.allClasses(), db.getClients(), db.exercises()]);
  const existing = params.id ? all.find((x) => x.id === params.id) : undefined;
  if (params.id && !existing) { root.innerHTML = html`${topbar('Class not found', { back: '/classes', backLabel: 'Classes' })}`.value; return; }
  const now = new Date().toISOString();
  const date0 = query.get('date') || today();
  const p: ClassPlan = existing ? JSON.parse(JSON.stringify(existing)) : {
    id: uid(), date: date0, exercises: [], attendeeIds: [], status: date0 < today() ? 'taught' : 'planned', source: 'manual', createdAt: now, updatedAt: now,
  };
  if (!p.attendeeIds) p.attendeeIds = [];
  let secs = toSecs(p.exercises);
  let persisted = !isNew;
  // A new class follows its date (past = taught, otherwise planned) until she picks a status herself.
  let statusChosen = !isNew;
  const others = all.filter((x) => x.id !== p.id);
  const clientById = new Map(clients.map((c) => [c.id, c]));

  // Built from another class: copy its workout, type, name and length.
  const from = query.get('from');
  if (isNew && from) {
    const src = all.find((x) => x.id === from);
    if (src) applyBase(src, false);
  }

  function applyBase(src: ClassPlan, announce = true) {
    secs = toSecs(copyMoves(src.exercises));
    if (!p.format && src.format) p.format = src.format;
    if (!p.title && src.title) p.title = src.title;
    if (!p.durationMin && src.durationMin) p.durationMin = src.durationMin;
    if (!p.time && src.time) p.time = src.time;
    p.basedOn = src.id;
    if (announce) toast(`Copied ${src.exercises.length} moves from ${fmtShort(src.date)}`);
  }

  const meaningful = () => !!(p.title || p.format || p.attendeeIds!.length || secs.some((s) => s.items.length) || p.notes);
  const write = async () => {
    p.exercises = flatten(secs);
    p.updatedAt = new Date().toISOString();
    if (!persisted && !meaningful()) return;
    await db.saveClass(p);
    if (!persisted) {
      persisted = true;
      history.replaceState(null, '', `#/classes/${p.id}/edit`);
    }
    const st = $('.save-state', root);
    if (st) st.textContent = 'Saved';
  };
  const save = debounce(() => { write(); }, 600);
  const touch = () => { const st = $('.save-state', root); if (st && (persisted || meaningful())) st.textContent = 'Saving…'; save(); };
  const saveNow = async () => { save.flush(); await write(); };

  const attendees = () => p.attendeeIds!.map((id) => clientById.get(id)).filter(Boolean) as Client[];
  const gg = () => groupGuidance(attendees());

  // ---- slots that update as she types the type or name ----
  const typeChips = () => {
    const used = recentLabels(others, 'format').map((x) => x.label);
    const list = used.concat(TYPE_DEFAULTS.filter((d) => !used.some((u) => norm(u) === norm(d)))).slice(0, 10);
    return html`${list.map((l) => html`<button type="button" class="pill ${norm(l) === norm(p.format) ? 'on' : ''}" data-set="format" data-v="${l}">${l}</button>`)}`;
  };
  const nameChips = () => {
    const list = recentLabels(others, 'title', p.format ? { format: p.format } : undefined).slice(0, 8);
    if (!list.length) return html``;
    return html`<span class="pill-label">Past names</span>${list.map((x) => html`<button type="button" class="pill ${norm(x.label) === norm(p.title) ? 'on' : ''}" data-set="title" data-v="${x.label}">${x.label}</button>`)}`;
  };
  const similar = (): Similar[] => similarClasses(others, { title: p.title, format: p.format });

  const startSlot = () => {
    const sim = similar();
    const points = startingPoints(sim, p.date);
    const hasMoves = secs.some((s) => s.items.length);
    const withMoves = others.filter((x) => x.exercises.length).length;
    const choices = points.map(({ plan, why }) => html`
      <button class="choice" data-base="${plan.id}">
        <b>${why === 'latest' ? 'Repeat the last one' : 'Bring one back'}: ${className(plan)}, ${fmtShort(plan.date)}</b>
        <span>${why === 'rotate' ? `Not taught in ${Math.round(daysBetween(plan.date, today()) / 7)} weeks · ` : ''}${plan.exercises.length} moves${plan.exercises.length ? ': ' + plan.exercises.slice(0, 4).map((e) => e.name).join(', ') : ''}</span>
      </button>`);
    return html`
      <h2>${hasMoves ? 'Rebuild from a previous class' : 'Start from a previous class'}</h2>
      ${!withMoves ? html`<p class="muted">Once she has a few classes saved, she can build new ones from them here.</p>` : html`
        ${choices.length ? html`<div class="choices">${choices}</div>` : (p.title || p.format) ? html`<p class="muted">No past classes match this type or name yet.</p>` : html`<p class="muted">Pick a type or name above to see matching past classes.</p>`}
        <button class="btn ${choices.length ? 'ghost' : ''} browse" data-act="browse">Browse ${withMoves === 1 ? 'the 1 past class' : `all ${withMoves} past classes`}</button>`}`;
  };

  const ideasSlot = () => {
    const sim = similar();
    const current = flatten(secs);
    const ideas = moveIdeas(sim, current, 12);
    const rep = repeatsFromLast(sim, current, p.date);
    const g = gg();
    const label = p.title || p.format;
    if (!label) return html`<h2>Ideas from past classes</h2><p class="muted">Pick a type or name to see moves she has used in classes like this one.</p>`;
    if (!sim.length) return html`<h2>Ideas from past classes</h2><p class="muted">No past classes like “${label}” yet. Ideas appear here as she builds a history.</p>`;
    return html`
      <h2>Ideas from past ${label} classes</h2>
      ${rep && rep.names.length >= 3 && p.basedOn !== rep.plan.id ? html`<p class="repeat-note">${rep.names.length} of these moves were in the last one (${fmtShort(rep.plan.date)}): ${rep.names.join(', ')}. Swap a few to keep it fresh.</p>` : ''}
      ${ideas.length ? html`<ul class="ideas">${ideas.map((x, n) => {
        const ex = x.move.exerciseId ? exMap.get(x.move.exerciseId) : undefined;
        const flags = ex ? flagsFor(ex, g) : [];
        return html`<li>
          <span class="idea-main">
            <b>${x.move.name}</b>${x.move.detail ? html` <span class="muted">${x.move.detail}</span>` : ''}
            <span class="idea-sub">${x.fresh ? html`<span class="badge fresh">Due for a comeback</span> ` : ''}In ${x.count} of the last ${x.of} · last ${fmtShort(x.lastDate)}</span>
            ${flags.length ? html`<span class="move-flag">${flags[0]}</span>` : ''}
          </span>
          <button class="btn small" data-idea="${n}" aria-label="Add ${x.move.name}">Add</button>
        </li>`;
      })}</ul>` : html`<p class="muted">Every move from those classes is already in this one.</p>`}`;
  };
  let ideaList: ReturnType<typeof moveIdeas> = [];

  const refreshSlots = () => {
    ideaList = moveIdeas(similar(), flatten(secs), 12);
    const set = (k: string, r: Raw) => { const el = $(`[data-slot="${k}"]`, root); if (el) el.innerHTML = r.value; };
    set('types', typeChips());
    set('names', nameChips());
    set('start', startSlot());
    set('ideas', ideasSlot());
  };
  const refreshSlotsSoon = debounce(refreshSlots, 250);

  const attendeeChips = () => {
    const list = attendees();
    return html`${list.length ? html`<div class="people">${list.map((c) => html`<span class="person ${c.isPinkFitness ? 'pff' : ''}">${fullName(c)}<button type="button" class="x" data-unattend="${c.id}" aria-label="Remove ${fullName(c)}">×</button></span>`)}</div>` : html`<p class="muted">No one added yet.</p>`}`;
  };

  const moveCard = (m: ClassMove, si: number, i: number, n: number, g: ClientGuidance) => {
    const ex = m.exerciseId ? exMap.get(m.exerciseId) : undefined;
    const flags = ex ? flagsFor(ex, g) : [];
    return html`
      <li class="move">
        <div class="item-head">
          <h3>${m.name}</h3>
          <div class="item-tools">
            <button class="icon-btn" data-act="up" data-s="${si}" data-i="${i}" aria-label="Move ${m.name} up" ${si === 0 && i === 0 ? raw('disabled') : ''}>↑</button>
            <button class="icon-btn" data-act="down" data-s="${si}" data-i="${i}" aria-label="Move ${m.name} down" ${si === secs.length - 1 && i === n - 1 ? raw('disabled') : ''}>↓</button>
            <button class="icon-btn" data-act="del-move" data-s="${si}" data-i="${i}" aria-label="Remove ${m.name}">×</button>
          </div>
        </div>
        ${flags.length ? html`<p class="flag">${flags.join(' ')}</p>` : ''}
        <div class="move-fields">
          <input data-m="detail" data-s="${si}" data-i="${i}" value="${m.detail || ''}" placeholder="Sets, reps or time: 3 × 12, 40s on / 20s off" aria-label="${m.name}: sets, reps or time">
          <input data-m="regression" data-s="${si}" data-i="${i}" value="${m.regression || ''}" placeholder="Easier option" aria-label="${m.name}: easier option">
          <input data-m="progression" data-s="${si}" data-i="${i}" value="${m.progression || ''}" placeholder="Harder option" aria-label="${m.name}: harder option">
        </div>
      </li>`;
  };

  const paint = () => {
    const g = gg();
    const att = attendees();
    root.innerHTML = html`
      ${topbar(isNew && !persisted ? 'Plan a class' : 'Edit class', {
        back: persisted ? `/classes/${p.id}` : '/classes', backLabel: persisted ? className(p) : 'Classes',
        sub: html`<span class="save-state" aria-live="polite">${persisted ? 'Saved' : 'Saves as you go'}</span>`,
      })}
      <section class="card">
        <div class="grid">
          <label class="field"><span class="label">Date</span><input type="date" data-p="date" value="${p.date}"></label>
          <label class="field"><span class="label">Start time</span><input type="time" data-p="time" value="${p.time || ''}"></label>
          <label class="field"><span class="label">Length</span><span class="unit-wrap"><input inputmode="numeric" data-p="durationMin" value="${p.durationMin ?? ''}" placeholder="45"><span class="unit">min</span></span></label>
          <fieldset class="field"><legend class="label">Status</legend>
            <div class="seg">${[['planned', 'Planned'], ['taught', 'Taught']].map(([v, l]) => html`<label><input type="radio" name="status" value="${v}" ${(isTaught(p) ? 'taught' : 'planned') === v ? raw('checked') : ''}><span>${l}</span></label>`)}</div>
          </fieldset>
          <label class="field wide"><span class="label">Type of class</span><input data-p="format" value="${p.format || ''}" placeholder="Strength, HIIT, Prenatal…" autocomplete="off"></label>
          <div class="pills wide" data-slot="types">${typeChips()}</div>
          <label class="field wide"><span class="label">Class name <span class="muted">(optional)</span></span><input data-p="title" value="${p.title || ''}" placeholder="e.g. Saturday Sweat" autocomplete="off"></label>
          <div class="pills wide" data-slot="names">${nameChips()}</div>
        </div>
      </section>

      <section class="card" data-slot="start">${startSlot()}</section>

      <section class="card">
        <div class="card-head"><h2>${isTaught(p) ? 'Who came' : 'Who\'s coming'}${att.length ? ` (${att.length})` : ''}</h2><button class="btn small" data-act="attendees">${att.length ? 'Change' : 'Add clients'}</button></div>
        ${attendeeChips()}
        ${watchBlock(g)}
        <p class="fineprint">The class is filed in each client's log${isTaught(p) ? '' : ' as planned, and moves to her history when you mark it as taught'}.</p>
      </section>

      <h2 class="list-head">Workout</h2>
      ${secs.map((s, si) => html`
        <section class="card sec">
          <div class="sec-head">
            <input class="sec-name" data-sec="${si}" value="${s.name}" placeholder="Section name" aria-label="Section name">
            ${!s.items.length ? html`<button class="icon-btn" data-act="del-sec" data-s="${si}" aria-label="Remove section ${s.name}">×</button>` : ''}
          </div>
          ${s.items.length ? html`<ol class="moves">${s.items.map((m, i) => moveCard(m, si, i, s.items.length, g))}</ol>` : ''}
          <button class="btn small add-move" data-act="add-move" data-s="${si}">Add exercise${s.name ? ` to ${s.name}` : ''}</button>
        </section>`)}
      <button class="btn add-ex" data-act="add-sec">Add section</button>

      <section class="card ideas-card" data-slot="ideas">${ideasSlot()}</section>

      <section class="card">
        <h2>Notes</h2>
        <textarea data-p="notes" rows="3" placeholder="Music, equipment to set up, format (e.g. 3 rounds, 40/20)">${p.notes || ''}</textarea>
      </section>

      <div class="form-actions sticky">
        ${persisted ? html`<button class="btn danger ghost" data-act="delete">Delete</button>` : ''}
        <span class="spacer"></span>
        <button class="btn primary" data-act="done">Done</button>
      </div>`.value;
    ideaList = moveIdeas(similar(), flatten(secs), 12);
  };
  paint();

  const repaint = async () => { await saveNow(); const y = window.scrollY; paint(); window.scrollTo(0, y); };

  root.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.p) {
      const k = t.dataset.p;
      if (k === 'date') {
        p.date = t.value || today();
        if (!statusChosen) {
          const next = p.date < today() ? 'taught' : 'planned';
          if (p.status !== next) { p.status = next; repaint(); return; }
        }
      }
      else if (k === 'time') { if (t.value) p.time = t.value; else delete p.time; }
      else if (k === 'durationMin') p.durationMin = num(t.value);
      else if (k === 'format' || k === 'title' || k === 'notes') { (p as any)[k] = t.value.trim() ? t.value : undefined; }
      if (k === 'format' || k === 'title') refreshSlotsSoon();
      touch();
    } else if (t.dataset.m) {
      (secs[+t.dataset.s!].items[+t.dataset.i!] as any)[t.dataset.m] = t.value;
      touch();
    } else if (t.dataset.sec !== undefined) {
      secs[+t.dataset.sec].name = t.value;
      touch();
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'status') { statusChosen = true; p.status = t.value as ClassPlan['status']; repaint(); }
  });

  root.addEventListener('click', async (e) => {
    const el = e.target as HTMLElement;
    const setBtn = el.closest('[data-set]') as HTMLElement | null;
    if (setBtn) {
      const k = setBtn.dataset.set as 'format' | 'title';
      p[k] = norm(p[k]) === norm(setBtn.dataset.v) ? undefined : setBtn.dataset.v;
      const input = $(`input[data-p="${k}"]`, root) as HTMLInputElement;
      if (input) input.value = p[k] || '';
      refreshSlots();
      touch();
      return;
    }
    const baseBtn = el.closest('[data-base]') as HTMLElement | null;
    if (baseBtn) { await useBase(others.find((x) => x.id === baseBtn.dataset.base)); return; }
    const ideaBtn = el.closest('[data-idea]') as HTMLElement | null;
    if (ideaBtn) {
      const idea = ideaList[+ideaBtn.dataset.idea!];
      if (!idea) return;
      const target = pickSection(idea.move.section);
      target.items.push({ ...idea.move });
      toast(`${idea.move.name} added to ${target.name || 'the workout'}`);
      await repaint();
      return;
    }
    const un = el.closest('[data-unattend]') as HTMLElement | null;
    if (un) { p.attendeeIds = p.attendeeIds!.filter((id) => id !== un.dataset.unattend); await repaint(); return; }

    const b = el.closest('[data-act]') as HTMLElement | null;
    if (!b) return;
    const si = b.dataset.s !== undefined ? +b.dataset.s : -1;
    const i = b.dataset.i !== undefined ? +b.dataset.i : -1;
    const act = b.dataset.act;
    if (act === 'add-move') {
      const already = secs.flatMap((s) => s.items.map((m) => m.exerciseId || '')).filter(Boolean);
      const ex = await pickExercise(exMap, gg(), '', already);
      if (!ex) return;
      if (!exMap.has(ex.id)) exMap.set(ex.id, ex);
      secs[si].items.push({ exerciseId: ex.id, name: ex.name });
      await repaint();
      const cards = $$('.sec', root)[si]?.querySelectorAll('.move');
      const card = cards && cards[cards.length - 1] as HTMLElement | undefined;
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (card?.querySelector('input[data-m="detail"]') as HTMLInputElement | null)?.focus({ preventScroll: true });
      return;
    }
    if (act === 'up' || act === 'down') {
      moveItem(si, i, act === 'up' ? -1 : 1);
    } else if (act === 'del-move') {
      secs[si].items.splice(i, 1);
    } else if (act === 'del-sec') {
      secs.splice(si, 1);
    } else if (act === 'add-sec') {
      secs.push({ name: '', items: [] });
      await repaint();
      const inputs = $$('.sec-name', root) as HTMLInputElement[];
      inputs[inputs.length - 1]?.focus();
      return;
    } else if (act === 'browse') {
      const picked = await pickClass(others, { title: p.title, format: p.format });
      if (picked) await useBase(picked);
      return;
    } else if (act === 'attendees') {
      const ids = await pickAttendees(clients, p.attendeeIds!, others, isTaught(p));
      if (!ids) return;
      p.attendeeIds = ids;
    } else if (act === 'done') {
      await saveNow();
      if (persisted) { toast('Class saved'); go(`/classes/${p.id}`, true); } else go('/classes', true);
      return;
    } else if (act === 'delete') {
      const n = p.attendeeIds!.length;
      if (!(await confirmDialog('Delete this class?', n ? `It will also be removed from ${n === 1 ? 'one client\'s log' : `${n} clients' logs`}.` : 'It will be removed from class history.', 'Delete', true))) return;
      save.flush();
      await db.deleteClass(p.id);
      toast('Class deleted');
      go('/classes', true);
      return;
    } else return;
    await repaint();
  });

  function moveItem(si: number, i: number, dir: -1 | 1) {
    const list = secs[si].items;
    const j = i + dir;
    if (j >= 0 && j < list.length) { [list[i], list[j]] = [list[j], list[i]]; return; }
    // past the end of its section: move into the neighboring one
    const ns = si + dir;
    if (ns < 0 || ns >= secs.length) return;
    const [m] = list.splice(i, 1);
    if (dir < 0) secs[ns].items.push(m); else secs[ns].items.unshift(m);
  }

  /** The section an added idea goes into: one with the same name, else the main one. */
  function pickSection(name?: string): Sec {
    if (name) {
      const hit = secs.find((s) => norm(s.name) === norm(name));
      if (hit) return hit;
    }
    const main = secs.find((s) => /work|main|circuit|strength/i.test(s.name)) || secs[Math.min(1, secs.length - 1)];
    if (main) return main;
    const s: Sec = { name: name || 'Workout', items: [] };
    secs.push(s);
    return s;
  }

  async function useBase(src?: ClassPlan) {
    if (!src) return;
    const count = secs.reduce((a, s) => a + s.items.length, 0);
    if (count && !(await confirmDialog('Replace this workout?', `The ${count} ${count === 1 ? 'move' : 'moves'} in this plan will be replaced with the ${src.exercises.length} from ${className(src)} on ${fmtShort(src.date)}.`, 'Replace'))) return;
    applyBase(src);
    await repaint();
    $('.sec', root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ---------------- pickers ----------------

function pickClass(plans: ClassPlan[], q: { title?: string; format?: string }): Promise<ClassPlan | null> {
  return new Promise((resolve) => {
    const scored = new Map(similarClasses(plans, q).map((s) => [s.plan.id, s.score]));
    const list = plans.filter((x) => x.exercises.length).sort((a, b) => (scored.get(b.id) || 0) - (scored.get(a.id) || 0) || b.date.localeCompare(a.date));
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet picker';
    dlg.setAttribute('aria-label', 'Choose a past class');
    dlg.innerHTML = html`
      <div class="picker-head"><h2>Build from a past class</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <input type="search" class="search" placeholder="Search by name, type or exercise" aria-label="Search past classes">
      <ul class="pick-list">
        ${list.map((x) => html`<li data-q="${norm([x.title, x.format, ...x.exercises.map((e) => e.name)].join(' '))}">
          <button type="button" data-pick="${x.id}">
            <span class="pick-name">${className(x)} <span class="muted">· ${fmtShort(x.date)}</span>${scored.get(x.id) ? html` <span class="badge fresh">Match</span>` : ''}</span>
            <span class="pick-sub">${[x.title && x.format ? x.format : '', `${x.exercises.length} moves`, x.exercises.slice(0, 4).map((e) => e.name).join(', ')].filter(Boolean).join(' · ')}</span>
          </button></li>`)}
      </ul>
      ${!list.length ? html`<p class="none-match">No past classes with a workout yet.</p>` : ''}`.value;
    document.body.appendChild(dlg);
    let result: ClassPlan | null = null;
    const search = dlg.querySelector('.search') as HTMLInputElement;
    search.addEventListener('input', () => {
      const words = norm(search.value).split(' ').filter(Boolean);
      dlg.querySelectorAll<HTMLElement>('.pick-list li').forEach((li) => { li.hidden = !words.every((w) => li.dataset.q!.includes(w)); });
    });
    dlg.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-close]') || t === dlg) { dlg.close(); return; }
      const pb = t.closest('[data-pick]') as HTMLElement | null;
      if (pb) { result = list.find((x) => x.id === pb.dataset.pick) || null; dlg.close(); }
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
  });
}

function pickAttendees(clients: Client[], selected: string[], pastClasses: ClassPlan[], taught: boolean): Promise<string[] | null> {
  return new Promise((resolve) => {
    const chosen = new Set(selected);
    const list = clients
      .filter((c) => c.status !== 'inactive' || chosen.has(c.id))
      .sort((a, b) => Number(b.isPinkFitness) - Number(a.isPinkFitness) || a.firstName.localeCompare(b.firstName));
    const lastGroup = [...pastClasses].filter((x) => (x.attendeeIds || []).length).sort((a, b) => b.date.localeCompare(a.date))[0];
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet picker';
    dlg.setAttribute('aria-label', taught ? 'Who came' : 'Who is coming');
    dlg.innerHTML = html`
      <div class="picker-head"><h2>${taught ? 'Who came?' : 'Who\'s coming?'}</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <input type="search" class="search" placeholder="Search clients" aria-label="Search clients">
      ${lastGroup ? html`<div class="picker-tools"><button type="button" class="btn small" data-same>Same group as ${className(lastGroup)}, ${fmtShort(lastGroup.date)} (${lastGroup.attendeeIds!.length})</button></div>` : ''}
      <ul class="pick-list checks">
        ${list.map((c) => html`<li data-name="${norm(fullName(c))}"><label>
          <input type="checkbox" value="${c.id}" ${chosen.has(c.id) ? raw('checked') : ''}>
          <span><span class="pick-name">${fullName(c)}</span><span class="pick-sub">${c.isPinkFitness ? 'Pink Fitness' : 'Private'}${c.status === 'lead' ? ' · lead' : ''}</span></span>
        </label></li>`)}
      </ul>
      ${!list.length ? html`<p class="none-match">No clients yet. Add clients first.</p>` : ''}
      <div class="picker-foot"><span class="pick-count"></span><button class="btn primary" data-ok>Done</button></div>`.value;
    document.body.appendChild(dlg);
    let result: string[] | null = null;
    const boxes = () => Array.from(dlg.querySelectorAll<HTMLInputElement>('input[type=checkbox]'));
    const count = () => { const n = boxes().filter((b) => b.checked).length; (dlg.querySelector('.pick-count') as HTMLElement).textContent = `${n} selected`; };
    count();
    dlg.addEventListener('change', count);
    const search = dlg.querySelector('.search') as HTMLInputElement;
    search.addEventListener('input', () => {
      const q = norm(search.value);
      dlg.querySelectorAll<HTMLElement>('.pick-list li').forEach((li) => { li.hidden = !!q && !li.dataset.name!.includes(q); });
    });
    dlg.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-close]') || t === dlg) { dlg.close(); return; }
      if (t.closest('[data-same]') && lastGroup) {
        const ids = new Set(lastGroup.attendeeIds);
        boxes().forEach((b) => { if (ids.has(b.value)) b.checked = true; });
        count();
        return;
      }
      if (t.closest('[data-ok]')) {
        // keep the order she already had, then new picks in list order
        const on = new Set(boxes().filter((b) => b.checked).map((b) => b.value));
        result = selected.filter((id) => on.has(id)).concat(list.map((c) => c.id).filter((id) => on.has(id) && !selected.includes(id)));
        dlg.close();
      }
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
  });
}
