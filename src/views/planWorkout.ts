// "Start session" / "Plan a workout": pick a client, then how to start: the suggested workout
// (what's due in her rotation, with progressed numbers), a freshly generated routine, any past
// workout, or a blank session.
import type { Ctx } from '../router.js';
import { go } from '../router.js';
import * as db from '../db.js';
import type { Exercise, Session } from '../types.js';
import { avatar, empty, topbar } from '../components.js';
import { guidance } from '../logic.js';
import { swapPicker } from '../swapPicker.js';
import { cardLink } from './exerciseCard.js';
import { goalProfile } from '../goals.js';
import {
  FAMILY_LABEL, FOCUS_LABEL, GROUP_LABEL, familyOf, generateWorkout, notesFrom, pastWorkouts, planFromTemplate, sessionFocus,
  planItem, setsSummary, suggestNext, toItems, type Family, type FocusKey, type GenerateInput, type PlanItem, type Suggestion,
} from '../planlogic.js';
import { $, fmtNum, fmtShort, fullName, html, Raw, relDay, today, uid } from '../util.js';

function blankSession(clientId: string, status: Session['status'], date = today()): Session {
  const now = new Date().toISOString();
  return { id: uid(), clientId, date, status, items: [], post: {}, createdAt: now, updatedAt: now };
}

const FOCUS_ORDER: FocusKey[] = ['full', 'upper', 'lower', 'push', 'pull', 'glutes', 'core'];

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
  const [sessions, exMap] = await Promise.all([db.sessionsFor(c.id), db.exercises()]);
  const g = guidance(c);
  const goal = goalProfile(c.intake);
  const own = sessions.filter((s) => !s.classId);
  const plannedSoon = own.filter((s) => s.status === 'planned').sort((a, b) => Math.abs(+new Date(a.date) - Date.now()) - Math.abs(+new Date(b.date) - Date.now()))[0];
  const inProgress = own.find((s) => s.status === 'in_progress');
  const past = pastWorkouts(sessions);

  // Her own foci first (most used), then the rest.
  const used = new Map<FocusKey, number>();
  past.slice(0, 12).forEach((s) => { const f = sessionFocus(s, exMap); used.set(f, (used.get(f) || 0) + 1); });
  const foci = Array.from(used.keys()).sort((a, b) => used.get(b)! - used.get(a)!).concat(FOCUS_ORDER.filter((f) => !used.has(f)));

  let date = today();
  let sug: Suggestion | undefined;
  let sugPlan: PlanItem[] = [];
  let genFocus: FocusKey = foci[0] || 'full';
  let genCount: number | undefined;
  let seed = Math.floor(Math.random() * 1e6) + 1;
  let gen: ReturnType<typeof generateWorkout> | undefined;
  let genItems: PlanItem[] = [];
  let pastFilter: Family | 'all' = 'all';
  const swappedOut: string[] = [];

  const computeSuggestion = () => {
    sug = suggestNext(sessions, exMap, date);
    sugPlan = sug ? planFromTemplate(sug.template, sessions, exMap, g, goal) : [];
  };
  computeSuggestion();
  if (sug) genFocus = sug.focus;

  const genInput = (): GenerateInput => ({ sessions, exMap, guidance: g, focus: genFocus, count: genCount, seed, exclude: swappedOut, maternal: c.intake.maternal.status !== 'none', goal, todayIso: today() });

  const options: Raw[] = [];
  if (!plan && inProgress) options.push(html`<button class="choice" data-choice="resume"><b>Pick up the session in progress</b><span>Started ${relDay(inProgress.date).toLowerCase()}, ${inProgress.items.length} exercises</span></button>`);
  if (!plan && plannedSoon) options.push(html`<button class="choice" data-choice="planned"><b>Use the workout planned for ${relDay(plannedSoon.date).toLowerCase()}</b><span>${plannedSoon.items.length} exercises</span></button>`);

  const row = (p: PlanItem, i: number, tools: boolean) => {
    const ex = exMap.get(p.exerciseId) as Exercise;
    return html`
      <li>
        <span class="plan-main">
          <b>${cardLink(ex, ex.name, { flags: p.flags, who: c.firstName })}</b>
          <span class="plan-sub">${[setsSummary(p.sets, ex), GROUP_LABEL[p.group]].join(' · ')}${p.bumped ? html` <span class="badge up">↑ ${fmtNum(p.bumped.from)} → ${fmtNum(p.bumped.to)} lb</span>` : ''}${p.why && !p.why.startsWith('Ready') ? html` <span class="badge why">${p.why}</span>` : ''}</span>
          ${p.flags.length ? html`<span class="move-flag">Review for ${c.firstName}: ${p.flags[0]}</span>` : ''}
        </span>
        ${tools ? html`<span class="plan-tools"><button class="btn small ghost" data-swap="${i}" aria-label="Swap ${ex.name}">Swap</button><button class="icon-btn subtle" data-drop="${i}" aria-label="Remove ${ex.name}">×</button></span>` : ''}
      </li>`;
  };

  const suggestSlot = (): Raw => {
    if (!sug) return html`
      <h2>Suggested workout</h2>
      <p class="muted">Once ${c.firstName} has a few sessions logged, the app suggests what's due next from how they rotate their workouts, with their latest numbers. Until then, generate one below or start from scratch.</p>`;
    const notes = notesFrom(sug.template, exMap);
    const flagged = sugPlan.filter((p) => p.flags.length).length;
    return html`
      <div class="card-head"><h2>Suggested: ${FOCUS_LABEL[sug.focus]}</h2><span class="badge">${relDay(date) === 'Today' ? 'for today' : `for ${relDay(date).toLowerCase()}`}</span></div>
      <p class="why">${sug.reasons.join(' ')}</p>
      <ul class="plan-list">${sugPlan.map((p, i) => row(p, i, false))}</ul>
      ${sugPlan.some((p) => p.bumped) ? html`<p class="fineprint">↑ They hit ${goal.bumpAt}+ reps on every set last time, so the weight goes up and reps reset to ${goal.resetTo}.</p>` : ''}
      ${goal.bumpAt === null ? html`<p class="fineprint">Their goals hold the load steady, so the weights stay where they were.</p>` : ''}
      ${flagged ? html`<p class="repeat-note">${flagged === 1 ? 'One exercise is' : `${flagged} exercises are`} now flagged by their intake. Freshen it up to swap ${flagged === 1 ? 'it' : 'them'} out, or adjust after starting.</p>` : ''}
      ${notes.length ? html`<details class="last-notes"><summary>Notes from ${fmtShort(sug.template.date)}</summary><ul>${notes.map((n) => html`<li>${n}</li>`)}</ul></details>` : ''}
      <div class="row-end">
        <button class="btn" data-act="freshen">Freshen it up</button>
        <button class="btn primary" data-act="use-suggest">${plan ? 'Plan this workout' : 'Start this workout'}</button>
      </div>`;
  };

  const goalBox = (): Raw => goal.labels.length || goal.words ? html`
      <div class="goal-box">
        <p><b>Their goals:</b> ${goal.labels.join(', ') || 'none picked'}${goal.words ? html` · <span class="muted">“${goal.words}”</span>` : ''}</p>
        ${goal.effects.length ? html`<p class="goal-effects">What that changes: ${goal.effects.join('; ')}.</p>` : ''}
      </div>` : html`<p class="goal-box muted">No goals on their intake yet. <a href="#/clients/${c.id}/edit">Add them</a> and suggestions will follow them: rep targets, when to add weight, a finisher or a core block, and anything they name in their own words.</p>`;

  const genSlot = (): Raw => html`
    <h2>Generate a new workout</h2>
    <p class="muted">Keeps their staple lifts so progress carries on, brings in exercises they haven't done lately or haven't tried, and leaves out anything flagged by their intake or that they marked least favorite recently.</p>
    ${goalBox()}
    <div class="pills gen-focus">${foci.map((f) => html`<button type="button" class="pill ${f === genFocus ? 'on' : ''}" data-focus="${f}">${FOCUS_LABEL[f]}</button>`)}</div>
    <div class="gen-row">
      <span class="label">Exercises</span>
      <span class="stepper"><button class="icon-btn" data-count="-1" aria-label="Fewer exercises">−</button><b>${genCount || (gen ? genItems.length : 'Their usual')}</b><button class="icon-btn" data-count="1" aria-label="More exercises">+</button></span>
      <span class="spacer"></span>
      <button class="btn ${gen ? '' : 'primary'}" data-act="generate">${gen ? 'Shuffle' : 'Generate'}</button>
    </div>
    ${gen ? html`
      <ul class="plan-list">${genItems.map((p, i) => row(p, i, true))}</ul>
      ${!genItems.length ? html`<p class="muted">Nothing fits that focus yet. Add exercises to the catalog or pick another focus.</p>` : ''}
      <p class="fineprint">${[
        gen.template ? `Shaped like their ${FOCUS_LABEL[genFocus].toLowerCase()} workout on ${fmtShort(gen.template.date)}.` : `They haven't done a ${FOCUS_LABEL[genFocus].toLowerCase()} workout yet, so this uses a standard layout.`,
        gen.skippedFlagged ? 'Exercises flagged by their intake were left out.' : '',
        gen.avoided.length ? `Left out recent least favorites: ${gen.avoided.map((id) => exMap.get(id)?.name).filter(Boolean).join(', ')}.` : '',
      ].filter(Boolean).join(' ')}</p>
      ${genItems.length ? html`<div class="row-end"><button class="btn primary" data-act="use-gen">${plan ? 'Plan this workout' : 'Start this workout'}</button></div>` : ''}` : ''}`;

  const pastSlot = (): Raw => {
    if (!past.length) return html``;
    const fams = Array.from(new Set(past.slice(0, 20).map((s) => familyOf(sessionFocus(s, exMap)))));
    const list = past.filter((s) => pastFilter === 'all' || familyOf(sessionFocus(s, exMap)) === pastFilter).slice(0, 15);
    return html`
      <h2 class="list-head">Repeat a past workout</h2>
      <p class="fineprint past-hint">Uses their latest numbers for each exercise, with weight added where they earned it.</p>
      ${fams.length > 1 ? html`<div class="pills past-filter"><button type="button" class="pill ${pastFilter === 'all' ? 'on' : ''}" data-fam="all">All</button>${fams.map((f) => html`<button type="button" class="pill ${pastFilter === f ? 'on' : ''}" data-fam="${f}">${FAMILY_LABEL[f].charAt(0).toUpperCase() + FAMILY_LABEL[f].slice(1)}</button>`)}</div>` : ''}
      <ul class="list">${list.map((s) => {
        const names = s.items.map((it) => exMap.get(it.exerciseId)?.name).filter(Boolean) as string[];
        const d = new Date(s.date + 'T00:00');
        return html`<li><button class="row" data-repeat="${s.id}">
          <span class="date-chip"><b>${d.getDate()}</b>${d.toLocaleDateString(undefined, { month: 'short' })}</span>
          <span class="row-main"><span class="row-title">${FOCUS_LABEL[sessionFocus(s, exMap)]}${s === past[0] ? html` <span class="badge">Last workout</span>` : ''}</span>
          <span class="row-sub">${names.slice(0, 4).join(', ')}${names.length > 4 ? ` +${names.length - 4}` : ''}</span></span>
          <span class="chev" aria-hidden="true">›</span></button></li>`;
      })}</ul>`;
  };

  const paint = () => {
    root.innerHTML = html`
      ${topbar(verb, { back: `/clients/${c.id}`, backLabel: fullName(c), sub: `For ${fullName(c)}` })}
      ${plan ? html`<label class="field narrow"><span class="label">Workout date</span><input type="date" name="planDate" value="${date}"></label>` : ''}
      ${options.length ? html`<div class="choices">${options}</div>` : ''}
      <section class="card suggest" data-slot="suggest">${suggestSlot()}</section>
      <section class="card gen" data-slot="gen">${genSlot()}</section>
      <div data-slot="past">${pastSlot()}</div>
      <div class="choices"><button class="choice" data-choice="blank"><b>Start from scratch</b><span>Add exercises as you go</span></button></div>`.value;
  };
  paint();
  const set = (k: string, r: Raw) => { const el = $(`[data-slot="${k}"]`, root); if (el) el.innerHTML = r.value; };

  const create = async (items: Session['items'], blank = false) => {
    const s = blankSession(c.id, plan ? 'planned' : 'in_progress', plan ? date : today());
    s.items = items;
    await db.saveSession(s);
    go(`/sessions/${s.id}${blank ? '?add=1' : ''}`, true);
  };
  const regenerate = (shuffle = false) => {
    const avoid = shuffle ? genItems.filter((p) => !p.why.startsWith('Their staple')).map((p) => p.exerciseId) : [];
    gen = generateWorkout({ ...genInput(), avoid });
    genItems = gen.items.map((p) => ({ ...p, flags: [] }));
    set('gen', genSlot());
  };

  root.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'planDate') { date = t.value || today(); computeSuggestion(); set('suggest', suggestSlot()); }
  });

  root.addEventListener('click', async (e) => {
    const el = e.target as HTMLElement;
    const ch = el.closest('[data-choice]') as HTMLElement | null;
    if (ch) {
      const choice = ch.dataset.choice;
      if (choice === 'resume' && inProgress) { go(`/sessions/${inProgress.id}`, true); return; }
      if (choice === 'planned' && plannedSoon) {
        plannedSoon.status = 'in_progress';
        plannedSoon.date = today();
        await db.saveSession(plannedSoon);
        go(`/sessions/${plannedSoon.id}`, true);
        return;
      }
      if (choice === 'blank') await create([], true);
      return;
    }
    const f = el.closest('[data-focus]') as HTMLElement | null;
    if (f) { genFocus = f.dataset.focus as FocusKey; genCount = undefined; swappedOut.length = 0; seed++; regenerate(); return; }
    const cnt = el.closest('[data-count]') as HTMLElement | null;
    if (cnt) {
      const base = genCount || (gen ? genItems.length : 5);
      genCount = Math.max(3, Math.min(10, base + Number(cnt.dataset.count)));
      regenerate();
      return;
    }
    const sw = el.closest('[data-swap]') as HTMLElement | null;
    if (sw) {
      const i = Number(sw.dataset.swap);
      const cur = exMap.get(genItems[i].exerciseId)!;
      const pick = await swapPicker({ current: cur, exMap, sessions, guidance: g, who: c.firstName, inWorkout: genItems.map((p) => p.exerciseId) });
      if (!pick) return;
      swappedOut.push(cur.id);
      genItems[i] = { ...planItem(pick, sessions, 'Swapped in', goal), flags: [] };
      set('gen', genSlot());
      return;
    }
    const dr = el.closest('[data-drop]') as HTMLElement | null;
    if (dr) { genItems.splice(Number(dr.dataset.drop), 1); genCount = genItems.length || undefined; set('gen', genSlot()); return; }
    const fam = el.closest('[data-fam]') as HTMLElement | null;
    if (fam) { pastFilter = fam.dataset.fam as Family | 'all'; set('past', pastSlot()); return; }
    const rep = el.closest('[data-repeat]') as HTMLElement | null;
    if (rep) {
      const src = past.find((s) => s.id === rep.dataset.repeat);
      if (src) await create(toItems(planFromTemplate(src, sessions, exMap, g, goal)));
      return;
    }
    const b = el.closest('[data-act]') as HTMLElement | null;
    if (!b) return;
    if (b.dataset.act === 'use-suggest' && sug) await create(toItems(sugPlan));
    else if (b.dataset.act === 'freshen' && sug) {
      genFocus = sug.focus; genCount = undefined; swappedOut.length = 0; seed++;
      regenerate();
      $('[data-slot="gen"]', root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (b.dataset.act === 'generate') { seed++; regenerate(!!gen); }
    else if (b.dataset.act === 'use-gen' && genItems.length) await create(toItems(genItems));
  });
}

