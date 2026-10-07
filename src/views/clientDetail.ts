// Client profile: overview (things to watch, starting point, intake), sessions, and progress.
import type { Ctx } from '../router.js';
import { refresh } from '../router.js';
import * as db from '../db.js';
import type { Client, Exercise, Measurement, Session } from '../types.js';
import { avatar, empty, number, pffBadge, text, topbar } from '../components.js';
import { exerciseSeries, exercisesUsed, filled, guidance, measureUnit, stageLabel } from '../logic.js';
import { chart, hydrateCharts } from '../charts.js';
import { TAGS } from '../seed.js';
import {
  $, ageFrom, bmi, confirmDialog, fmtDate, fmtHeight, fmtNum, fmtSeconds, fmtShort, fullName, html, num, Raw, relDay, toast, today, uid,
} from '../util.js';

export async function clientDetail({ root, params, query, mounted }: Ctx) {
  const c = await db.getClient(params.id);
  if (!c) { root.innerHTML = (html`${topbar('Client not found', { back: '/clients', backLabel: 'Clients' })}${empty('Client not found', 'She may have been deleted.')}`).value; return; }
  const [sessions, measures, exMap] = await Promise.all([db.sessionsFor(c.id), db.measurementsFor(c.id), db.exercises()]);
  const tab = query.get('tab') || 'overview';
  const stage = stageLabel(c);

  const tabs: [string, string][] = [['overview', 'Overview'], ['sessions', `Sessions${sessions.length ? ` (${sessions.filter((s) => s.status !== 'planned').length})` : ''}`], ['progress', 'Progress']];
  const body = tab === 'sessions' ? sessionsTab(c, sessions, exMap) : tab === 'progress' ? progressTab(c, sessions, measures, exMap, query.get('ex')) : overviewTab(c, sessions, measures, exMap);

  root.innerHTML = html`
    ${topbar(fullName(c), {
      back: '/clients', backLabel: 'Clients',
      sub: html`${pffBadge(c)}${stage ? html` <span class="badge stage">${stage}</span>` : ''}${c.status !== 'active' ? html` <span class="badge">${c.status === 'lead' ? 'Lead' : 'Inactive'}</span>` : ''}`,
      actions: html`<a class="btn ghost" href="#/clients/${c.id}/edit">Edit</a>`,
    })}
    <div class="profile-head">
      ${avatar(c, 'lg')}
      <div class="contact">
        ${c.phone ? html`<a href="tel:${c.phone}">${c.phone}</a>` : ''}
        ${c.email ? html`<a href="mailto:${c.email}">${c.email}</a>` : ''}
        <span class="consent">${c.consent.email ? 'Email OK' : 'No email'} · ${c.consent.sms ? 'Texts OK' : 'No texts'}</span>
      </div>
      <div class="profile-actions">
        <a class="btn primary" href="#/sessions/new?client=${c.id}">Start session</a>
        <a class="btn" href="#/sessions/new?client=${c.id}&plan=1">Plan a workout</a>
        <a class="btn" href="#/clients/${c.id}/report">Progress report</a>
      </div>
    </div>
    <nav class="tabs" aria-label="Client sections">
      ${tabs.map(([k, l]) => html`<a href="#/clients/${c.id}?tab=${k}" class="${tab === k ? 'on' : ''}" ${tab === k ? new Raw('aria-current="page"') : ''}>${l}</a>`)}
    </nav>
    <div class="tab-body">${body}</div>
  `.value;

  if (tab === 'progress') bindProgress(root, c);
  mounted(() => hydrateCharts(root));
}

// ---------- overview ----------
function overviewTab(c: Client, sessions: Session[], measures: Measurement[], exMap: Map<string, Exercise>): Raw {
  const g = guidance(c);
  const i = c.intake;
  const done = sessions.filter((s) => s.status === 'complete');
  const latest = [...measures].reverse().find((m) => m.weight);
  const latestMuscle = [...measures].reverse().find((m) => m.musclePct);
  const flagged = Array.from(exMap.values()).filter((e) => e.tags.some((t) => g.flags.has(t)));
  const upcoming = sessions.filter((s) => s.status === 'planned' && s.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
  const inProgress = sessions.find((s) => s.status === 'in_progress');
  const showWeight = i.eatingDisorderHistory !== 'yes';

  const dl = (rows: [string, unknown][]) => html`<dl class="facts">${rows.filter(([, v]) => v !== undefined && v !== '' && v !== null && !(Array.isArray(v) && !v.length)).map(([k, v]) => html`<div><dt>${k}</dt><dd>${Array.isArray(v) ? v.join(', ') : v}</dd></div>`)}</dl>`;
  const lab = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ') : '');

  return html`
    ${inProgress ? html`<a class="resume" href="#/sessions/${inProgress.id}"><b>Session in progress</b><span>Started ${relDay(inProgress.date).toLowerCase()}. Tap to pick up where you left off.</span></a>` : ''}
    ${upcoming ? html`<a class="resume planned" href="#/sessions/${upcoming.id}"><b>Planned workout ${relDay(upcoming.date).toLowerCase()}</b><span>${upcoming.items.length} exercises ready to go.</span></a>` : ''}

    <div class="stats">
      <div><span class="stat">${done.length}</span><span class="stat-label">sessions logged</span></div>
      <div><span class="stat">${done[0] ? relDay(done[0].date) : '—'}</span><span class="stat-label">last session</span></div>
      ${showWeight ? html`<div><span class="stat">${latest?.weight ? fmtNum(latest.weight) : '—'}</span><span class="stat-label">lb latest${i.startWeight && latest?.weight ? `, ${fmtNum(latest.weight - i.startWeight, 1)} since intake` : ''}</span></div>` : ''}
      <div><span class="stat">${latestMuscle?.musclePct ? fmtNum(latestMuscle.musclePct) + '%' : '—'}</span><span class="stat-label">muscle latest</span></div>
    </div>

    <section class="card watch-card">
      <h2>Things to watch</h2>
      ${g.notes.length || flagged.length ? html`
        <ul class="notes">${g.notes.map((n) => html`<li class="${n.kind}">${n.text}</li>`)}</ul>
        ${flagged.length ? html`
          <details class="flagged">
            <summary>${flagged.length} exercises in the catalog are flagged for her</summary>
            <ul class="tag-reasons">
              ${Array.from(g.flags.entries()).map(([tag, reason]) => html`<li><b>${TAGS[tag] || tag}</b> ${reason}<br><span class="muted">${flagged.filter((e) => e.tags.includes(tag)).map((e) => e.name).join(', ')}</span></li>`)}
            </ul>
          </details>` : ''}
        <p class="fineprint">Prompts from her intake to support your judgment, not medical advice.</p>
      ` : html`<p class="muted">Nothing flagged from her intake.</p>`}
    </section>

    ${g.level ? html`
      <section class="card">
        <h2>Suggested starting point</h2>
        <p class="level"><b>${g.level.name}.</b> ${g.level.detail}</p>
        <p class="fineprint">Based on her weekly workouts, how hard she trains, and daily activity.</p>
      </section>` : ''}

    <section class="card">
      <h2>Intake</h2>
      ${dl([
        ['Intake date', fmtDate(i.date)],
        ['Age', ageFrom(c.dob)],
        ['Height', fmtHeight(i.heightIn)],
        ...(showWeight ? [['Weight at intake', i.startWeight ? `${fmtNum(i.startWeight)} lb` : ''], ['Goal weight', i.goalWeight ? `${fmtNum(i.goalWeight)} lb` : ''], ['BMI at intake', fmtNum(bmi(i.startWeight, i.heightIn))]] as [string, unknown][] : []),
        ['Muscle', i.musclePct ? `${fmtNum(i.musclePct)}%` : ''],
        ['Body fat', i.bodyFatPct ? `${fmtNum(i.bodyFatPct)}%` : ''],
        ['Daily activity', lab(i.activityLevel)],
        ['Steps a day', i.avgSteps ? fmtNum(i.avgSteps, 0) : ''],
        ['Workouts', i.daysPerWeek !== undefined ? `${i.daysPerWeek} a week${i.workoutMinutes ? `, ${i.workoutMinutes} min each` : ''}` : ''],
        ['Workout intensity', lab(i.workoutIntensity)],
        ['Works out at', i.workoutLocation],
        ['Diet', i.diet],
        ['Daily calories', i.calories ? fmtNum(i.calories, 0) : ''],
        ['On this diet for', i.dietDuration],
        ['Goals', i.goals],
        ['In her words', i.specificGoals],
        ['Emergency contact', [i.emergencyName, i.emergencyPhone].filter(Boolean).join(', ')],
        ['Notes', c.notes],
      ])}
      <a class="btn ghost small" href="#/clients/${c.id}/edit">Update intake</a>
    </section>`;
}

// ---------- sessions ----------
function sessionsTab(c: Client, sessions: Session[], exMap: Map<string, Exercise>): Raw {
  if (!sessions.length) return empty('No sessions yet', 'Start a session to log her first workout, or plan one ahead of time.', html`<a class="btn primary" href="#/sessions/new?client=${c.id}">Start session</a>`);
  const planned = sessions.filter((s) => s.status === 'planned').sort((a, b) => a.date.localeCompare(b.date));
  const rest = sessions.filter((s) => s.status !== 'planned');
  const row = (s: Session) => {
    const names = s.items.map((it) => exMap.get(it.exerciseId)?.name).filter(Boolean) as string[];
    const sets = s.items.reduce((a, it) => a + it.sets.filter(filled).length, 0);
    return html`
      <li><a class="row" href="#/sessions/${s.id}">
        <span class="date-chip"><b>${new Date(s.date + 'T00:00').getDate()}</b>${new Date(s.date + 'T00:00').toLocaleDateString(undefined, { month: 'short' })}</span>
        <span class="row-main">
          <span class="row-title">${s.status === 'in_progress' ? 'In progress · ' : ''}${names.slice(0, 3).join(', ') || 'No exercises yet'}${names.length > 3 ? ` +${names.length - 3}` : ''}</span>
          <span class="row-sub">${[relDay(s.date), s.status === 'planned' ? `${s.items.length} exercises planned` : `${sets} sets`, s.post.intensity ? `${s.post.intensity} intensity` : '', s.durationMin ? `${s.durationMin} min` : ''].filter(Boolean).join(' · ')}</span>
        </span>
        <span class="chev" aria-hidden="true">›</span>
      </a></li>`;
  };
  return html`
    ${planned.length ? html`<h2 class="list-head">Planned</h2><ul class="list">${planned.map(row)}</ul>` : ''}
    ${rest.length ? html`<h2 class="list-head">History</h2><ul class="list">${rest.map(row)}</ul>` : ''}`;
}

// ---------- progress ----------
function progressTab(c: Client, sessions: Session[], measures: Measurement[], exMap: Map<string, Exercise>, exId: string | null): Raw {
  const showWeight = c.intake.eatingDisorderHistory !== 'yes';
  const w = measures.filter((m) => m.weight).map((m) => ({ date: m.date, y: m.weight! }));
  const mu = measures.filter((m) => m.musclePct).map((m) => ({ date: m.date, y: m.musclePct! }));
  const bf = measures.filter((m) => m.bodyFatPct).map((m) => ({ date: m.date, y: m.bodyFatPct! }));
  const waist = measures.filter((m) => m.waistIn).map((m) => ({ date: m.date, y: m.waistIn! }));
  const used = exercisesUsed(sessions);
  const usedEx = Array.from(used.keys()).map((id) => exMap.get(id)).filter(Boolean) as Exercise[];
  usedEx.sort((a, b) => (used.get(b.id)! - used.get(a.id)!) || a.name.localeCompare(b.name));
  const sel = (exId && exMap.get(exId)) || usedEx[0];

  let strength: Raw = empty('No lifts logged yet', 'Strength charts appear once she has logged sets.');
  if (sel) {
    const series = exerciseSeries(sessions, sel);
    const unit = measureUnit(sel);
    strength = html`
      <label class="field">
        <span class="label">Exercise</span>
        <select class="ex-select">${usedEx.map((e) => html`<option value="${e.id}" ${e.id === sel.id ? new Raw('selected') : ''}>${e.name} (${used.get(e.id)} sessions)</option>`)}</select>
      </label>
      ${chart({
        title: sel.name, unit, digits: sel.measure === 'weight_reps' ? 1 : 0,
        series: sel.measure === 'weight_reps'
          ? [{ label: 'Heaviest set', style: 'primary', points: series.map((p) => ({ date: p.date, y: p.top })) },
             { label: 'Estimated 1-rep max', style: 'secondary', points: series.filter((p) => p.e1rm).map((p) => ({ date: p.date, y: Math.round(p.e1rm! * 10) / 10 })) }]
          : [{ label: sel.measure === 'reps' ? 'Most reps in a set' : 'Longest set', style: 'primary', points: series.map((p) => ({ date: p.date, y: p.top })) }],
      })}`;
  }

  const bests = usedEx.map((e) => {
    const s = exerciseSeries(sessions, e);
    const first = s[0], best = s.reduce((a, b) => (b.top > a.top ? b : a), s[0]);
    const f = (v: number) => (e.measure === 'time' ? fmtSeconds(v) : e.measure === 'reps' ? `${v} reps` : `${fmtNum(v)} lb`);
    return { e, first: f(first.top), best: f(best.top), bestDate: best.date, gain: first.top ? Math.round(((best.top - first.top) / first.top) * 100) : undefined };
  });

  return html`
    <section class="card">
      <div class="card-head"><h2>Body</h2><button class="btn small" data-act="add-measure" aria-expanded="false">Add measurement</button></div>
      <form class="measure-form" hidden>
        <div class="grid">
          ${text('date', 'Date', today(), { type: 'date' })}
          ${number('weight', 'Weight', '', { unit: 'lb' })}
          ${number('musclePct', 'Muscle', '', { unit: '%' })}
          ${number('bodyFatPct', 'Body fat', '', { unit: '%' })}
          ${number('waistIn', 'Waist', '', { unit: 'in' })}
          ${text('notes', 'Note', '')}
        </div>
        <div class="row-end"><button type="button" class="btn ghost" data-act="cancel-measure">Cancel</button><button class="btn primary">Save measurement</button></div>
      </form>
      ${!showWeight ? html`<p class="fineprint">Body weight is hidden for her. Her intake asks to keep the focus on strength.</p>` : ''}
      <div class="chart-grid">
        ${showWeight ? html`<div><h3>Weight</h3>${chart({ title: 'Weight', unit: 'lb', series: [{ label: 'Weight', style: 'primary', points: w }], ref: c.intake.goalWeight ? { y: c.intake.goalWeight, label: 'Goal' } : undefined })}</div>` : ''}
        <div><h3>Muscle</h3>${chart({ title: 'Muscle', unit: '%', series: [{ label: 'Muscle', style: 'primary', points: mu }] })}</div>
        ${bf.length ? html`<div><h3>Body fat</h3>${chart({ title: 'Body fat', unit: '%', series: [{ label: 'Body fat', style: 'primary', points: bf }] })}</div>` : ''}
        ${waist.length ? html`<div><h3>Waist</h3>${chart({ title: 'Waist', unit: 'in', series: [{ label: 'Waist', style: 'primary', points: waist }] })}</div>` : ''}
      </div>
      ${measures.length ? html`
        <details class="measure-log">
          <summary>All measurements (${measures.length})</summary>
          <table class="table">
            <thead><tr><th>Date</th>${showWeight ? html`<th>Weight</th><th>BMI</th>` : ''}<th>Muscle</th><th>Body fat</th><th>Waist</th><th></th></tr></thead>
            <tbody>${[...measures].reverse().map((m) => html`
              <tr><td>${fmtShort(m.date)}${m.notes ? html`<br><span class="muted">${m.notes}</span>` : ''}</td>
              ${showWeight ? html`<td>${fmtNum(m.weight)}</td><td>${fmtNum(bmi(m.weight, c.intake.heightIn))}</td>` : ''}
              <td>${m.musclePct ? fmtNum(m.musclePct) + '%' : ''}</td><td>${m.bodyFatPct ? fmtNum(m.bodyFatPct) + '%' : ''}</td><td>${fmtNum(m.waistIn)}</td>
              <td>${m.sessionId || m.id.startsWith('intake-') ? '' : html`<button class="icon-btn" data-del-measure="${m.id}" aria-label="Delete measurement from ${fmtShort(m.date)}">×</button>`}</td></tr>`)}
            </tbody>
          </table>
          <p class="fineprint">Measurements from sessions and the intake are edited there.</p>
        </details>` : ''}
    </section>

    <section class="card">
      <h2>Strength</h2>
      ${strength}
    </section>

    ${bests.length ? html`
      <section class="card">
        <h2>Personal bests</h2>
        <table class="table">
          <thead><tr><th>Exercise</th><th>First</th><th>Best</th><th>Change</th></tr></thead>
          <tbody>${bests.map((b) => html`<tr><td>${b.e.name}</td><td>${b.first}</td><td>${b.best}<br><span class="muted">${fmtShort(b.bestDate)}</span></td><td>${b.gain !== undefined && b.gain > 0 ? `+${b.gain}%` : '—'}</td></tr>`)}</tbody>
        </table>
      </section>` : ''}`;
}

function bindProgress(root: HTMLElement, c: Client) {
  const form = $('.measure-form', root) as HTMLFormElement | null;
  const toggleBtn = $('[data-act="add-measure"]', root);
  toggleBtn?.addEventListener('click', () => {
    if (!form) return;
    form.hidden = !form.hidden;
    toggleBtn.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) ($('input[name="weight"]', form) as HTMLInputElement | null)?.focus();
  });
  $('[data-act="cancel-measure"]', root)?.addEventListener('click', () => { form!.hidden = true; });
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const g = (k: string) => num(fd.get(k));
    const m: Measurement = {
      id: uid(), clientId: c.id, date: String(fd.get('date') || today()),
      weight: g('weight'), musclePct: g('musclePct'), bodyFatPct: g('bodyFatPct'), waistIn: g('waistIn'),
      notes: String(fd.get('notes') || '').trim() || undefined,
    };
    if (!m.weight && !m.musclePct && !m.bodyFatPct && !m.waistIn) { toast('Enter at least one measurement.'); return; }
    await db.put('measurements', m);
    toast('Measurement saved');
    refresh();
  });
  root.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('[data-del-measure]') as HTMLElement | null;
    if (!b) return;
    if (!(await confirmDialog('Delete this measurement?', 'It will be removed from her charts.', 'Delete', true))) return;
    await db.del('measurements', b.dataset.delMeasure!);
    refresh();
  });
  $('.ex-select', root)?.addEventListener('change', (e) => {
    location.hash = `#/clients/${c.id}?tab=progress&ex=${(e.target as HTMLSelectElement).value}`;
  });
}
