// Shareable progress report and workout sheet. Pink Fitness clients get the branded layout;
// private clients get a clean, unbranded one with only the trainer's name.
import type { Ctx } from '../router.js';
import { refresh } from '../router.js';
import * as db from '../db.js';
import type { Client, Exercise, Settings } from '../types.js';
import { empty, topbar } from '../components.js';
import { exerciseSeries, exercisesUsed, filled, setLabel } from '../logic.js';
import { chart, hydrateCharts } from '../charts.js';
import { PREVIEW, addDays, fmtDate, fmtNum, fmtSeconds, fullName, html, Raw, toast, today } from '../util.js';
import { sessionSheetRows } from './session.js';

function brandHeader(branded: boolean, settings: Settings, title: string, sub: string): Raw {
  if (branded) {
    return html`
      <header class="doc-head branded">
        <img src="assets/logo-full.jpg" alt="${settings.businessName}" class="doc-logo">
        <div><p class="doc-kicker">${settings.businessName}</p><h1>${title}</h1><p class="doc-sub">${sub}</p></div>
      </header>`;
  }
  const who = [settings.trainerName, settings.unbrandedTitle].filter(Boolean).join(', ');
  return html`
    <header class="doc-head plain">
      <div>${who ? html`<p class="doc-kicker">${who}</p>` : ''}<h1>${title}</h1><p class="doc-sub">${sub}</p></div>
    </header>`;
}

function brandFooter(branded: boolean, s: Settings): Raw {
  const contact = [s.contactEmail, s.contactPhone].filter(Boolean).join(' · ');
  if (branded) return html`<footer class="doc-foot">${[s.trainerName, s.businessName].filter(Boolean).join(', ')}${s.website ? html` · ${s.website}` : ''}${contact ? html` · ${contact}` : ''}</footer>`;
  const line = [s.trainerName, contact].filter(Boolean).join(' · ');
  return line ? html`<footer class="doc-foot">${line}</footer>` : html``;
}

function controls(branded: boolean, extra: Raw = html``): Raw {
  return html`
    <div class="doc-controls card">
      <fieldset class="field"><legend class="label">Branding</legend>
        <div class="seg">
          <label><input type="radio" name="brand" value="pff" ${branded ? new Raw('checked') : ''}><span>Pink Fitness</span></label>
          <label><input type="radio" name="brand" value="plain" ${!branded ? new Raw('checked') : ''}><span>Unbranded</span></label>
        </div>
      </fieldset>
      ${extra}
      <div class="row-end">
        <button class="btn" data-act="text">Send as text</button>
        ${PREVIEW ? '' : html`<button class="btn primary" data-act="print">Print or save PDF</button>`}
      </div>
      <p class="fineprint">${PREVIEW ? 'Print and PDF are turned off in this preview. In the installed app, Print or save PDF opens the print sheet.' : 'On iPhone or iPad, tap Print, then the share button in the print preview to save the PDF or send it.'}</p>
    </div>`;
}

async function shareText(title: string, text: string) {
  try {
    if (navigator.share) { await navigator.share({ title, text }); return; }
  } catch (e) { if ((e as Error).name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into a text or email.'); }
  catch { toast('Sharing is not available here.'); }
}

export async function progressReport({ root, params, query, mounted }: Ctx) {
  const c = await db.getClient(params.id);
  if (!c) { root.innerHTML = empty('Client not found', '').value; return; }
  const [sessionsAll, measuresAll, exMap, settings] = await Promise.all([db.sessionsFor(c.id), db.measurementsFor(c.id), db.exercises(), db.getSettings()]);
  const branded = query.has('brand') ? query.get('brand') === 'pff' : c.isPinkFitness;
  const period = query.get('period') || 'all';
  const includeWeight = query.has('w') ? query.get('w') === '1' : c.intake.eatingDisorderHistory !== 'yes';
  const from = period === '30' ? addDays(today(), -30) : period === '90' ? addDays(today(), -90) : '0000-00-00';
  const sessions = sessionsAll.filter((s) => s.status === 'complete' && s.date >= from);
  const measures = measuresAll.filter((m) => m.date >= from);
  const firstDate = [sessions[sessions.length - 1]?.date, measures[0]?.date].filter(Boolean).sort()[0];
  const sub = firstDate ? `${fmtDate(firstDate)} to ${fmtDate(today())}` : `As of ${fmtDate(today())}`;

  const wts = measures.filter((m) => m.weight);
  const mus = measures.filter((m) => m.musclePct);
  const delta = (a?: number, b?: number, unit = '', digits = 1) => (a !== undefined && b !== undefined ? `${b - a > 0 ? '+' : ''}${fmtNum(b - a, digits)}${unit}` : '—');

  const used = exercisesUsed(sessions);
  const lifts = Array.from(used.keys()).map((id) => exMap.get(id)).filter(Boolean).map((e) => {
    const s = exerciseSeries(sessions, e as Exercise);
    const ex = e as Exercise;
    const first = s[0].top, last = s[s.length - 1].top;
    const f = (v: number) => (ex.measure === 'time' ? fmtSeconds(v) : ex.measure === 'reps' ? `${v} reps` : `${fmtNum(v)} lb`);
    return { ex, first: f(first), last: f(last), pct: first ? Math.round(((last - first) / first) * 100) : 0, n: used.get(ex.id)! };
  }).sort((a, b) => b.n - a.n || b.pct - a.pct).slice(0, 8);
  const topGain = [...lifts].sort((a, b) => b.pct - a.pct)[0];

  const periodSel = html`
    <label class="field"><span class="label">Period</span>
      <select name="period">${[['all', 'Since she started'], ['90', 'Last 90 days'], ['30', 'Last 30 days']].map(([v, l]) => html`<option value="${v}" ${v === period ? new Raw('selected') : ''}>${l}</option>`)}</select>
    </label>
    <label class="toggle"><span><span class="label">Include body weight</span>${c.intake.eatingDisorderHistory === 'yes' ? html`<span class="hint">Off by default for her, based on her intake.</span>` : ''}</span><input type="checkbox" role="switch" name="w" ${includeWeight ? new Raw('checked') : ''}></label>
    <label class="field wide"><span class="label">Note to ${c.firstName}</span><textarea name="note" rows="3" placeholder="What you're proud of, and what's next">${c.reportNote || ''}</textarea></label>`;

  root.innerHTML = html`
    <div class="no-print">${topbar('Progress report', { back: `/clients/${c.id}`, backLabel: fullName(c) })}${controls(branded, periodSel)}</div>
    <article class="doc ${branded ? 'is-branded' : 'is-plain'}">
      ${brandHeader(branded, settings, `${c.firstName}'s progress`, sub)}
      <div class="doc-stats">
        <div><b>${sessions.length}</b><span>sessions</span></div>
        ${includeWeight ? html`<div><b>${delta(wts[0]?.weight, wts[wts.length - 1]?.weight, ' lb')}</b><span>weight change</span></div>` : ''}
        <div><b>${delta(mus[0]?.musclePct, mus[mus.length - 1]?.musclePct, '%')}</b><span>muscle change</span></div>
        ${topGain && topGain.pct > 0 ? html`<div><b>+${topGain.pct}%</b><span>${topGain.ex.name}</span></div>` : ''}
      </div>
      ${c.reportNote ? html`<section class="doc-note"><h2>From your trainer</h2><p>${c.reportNote}</p></section>` : ''}
      <div class="doc-charts">
        ${includeWeight && wts.length > 1 ? html`<section><h2>Weight</h2>${chart({ title: 'Weight', unit: 'lb', height: 170, series: [{ label: 'Weight', style: 'primary', points: wts.map((m) => ({ date: m.date, y: m.weight! })) }], ref: c.intake.goalWeight ? { y: c.intake.goalWeight, label: 'Goal' } : undefined })}</section>` : ''}
        ${mus.length > 1 ? html`<section><h2>Muscle</h2>${chart({ title: 'Muscle', unit: '%', height: 170, series: [{ label: 'Muscle', style: 'primary', points: mus.map((m) => ({ date: m.date, y: m.musclePct! })) }] })}</section>` : ''}
      </div>
      ${lifts.length ? html`
        <section><h2>Strength</h2>
          <table class="table doc-table"><thead><tr><th>Exercise</th><th>Start</th><th>Now</th><th>Change</th></tr></thead>
          <tbody>${lifts.map((l) => html`<tr><td>${l.ex.name}</td><td>${l.first}</td><td>${l.last}</td><td>${l.pct > 0 ? `+${l.pct}%` : '—'}</td></tr>`)}</tbody></table>
        </section>` : html`<p class="muted">No completed sessions in this period yet.</p>`}
      ${brandFooter(branded, settings)}
    </article>`.value;

  const setQuery = (k: string, v: string) => {
    const q = new URLSearchParams(query);
    q.set(k, v);
    history.replaceState(null, '', `#/clients/${c.id}/report?${q}`);
    refresh();
  };
  root.addEventListener('change', async (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'brand') setQuery('brand', t.value);
    if (t.name === 'period') setQuery('period', t.value);
    if (t.name === 'w') setQuery('w', t.checked ? '1' : '0');
    if (t.name === 'note') { await db.saveClient({ ...c, reportNote: t.value.trim(), updatedAt: new Date().toISOString() }); refresh(); }
  });
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!b) return;
    if (b.dataset.act === 'print') window.print();
    if (b.dataset.act === 'text') {
      const lines = [
        `${c.firstName}'s progress (${sub})`,
        `${sessions.length} sessions`,
        includeWeight && wts.length > 1 ? `Weight: ${delta(wts[0].weight, wts[wts.length - 1].weight, ' lb')}` : '',
        mus.length > 1 ? `Muscle: ${delta(mus[0].musclePct, mus[mus.length - 1].musclePct, '%')}` : '',
        ...lifts.filter((l) => l.pct > 0).slice(0, 4).map((l) => `${l.ex.name}: ${l.first} → ${l.last}`),
        c.reportNote ? `\n${c.reportNote}` : '',
        branded ? `\n${settings.businessName}` : settings.trainerName ? `\n${settings.trainerName}` : '',
      ].filter(Boolean);
      shareText(`${c.firstName}'s progress`, lines.join('\n'));
    }
  });
  mounted(() => hydrateCharts(root));
}

export async function sessionSheet({ root, params, query }: Ctx) {
  const s = await db.getSession(params.id);
  if (!s) { root.innerHTML = empty('Session not found', '').value; return; }
  const [c, exMap, settings] = await Promise.all([db.getClient(s.clientId), db.exercises(), db.getSettings()]) as [Client, Map<string, Exercise>, Settings];
  const branded = query.has('brand') ? query.get('brand') === 'pff' : c.isPinkFitness;
  const planned = s.status === 'planned';
  const title = planned ? `${c.firstName}'s workout` : `${c.firstName}'s session`;

  root.innerHTML = html`
    <div class="no-print">${topbar(planned ? 'Share workout plan' : 'Share session', { back: `/sessions/${s.id}`, backLabel: 'Session' })}${controls(branded)}</div>
    <article class="doc ${branded ? 'is-branded' : 'is-plain'}">
      ${brandHeader(branded, settings, title, fmtDate(s.date, { weekday: 'long', month: 'long', day: 'numeric' }))}
      <table class="table doc-table workout"><thead><tr><th>#</th><th>Exercise</th><th>Sets</th><th>${planned ? 'Target' : 'Done'}</th></tr></thead>
        <tbody>${sessionSheetRows(s, exMap)}</tbody></table>
      ${s.trainerNotes && planned ? html`<section class="doc-note"><h2>Notes</h2><p>${s.trainerNotes}</p></section>` : ''}
      ${brandFooter(branded, settings)}
    </article>`.value;

  root.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'brand') { history.replaceState(null, '', `#/sessions/${s.id}/sheet?brand=${t.value}`); refresh(); }
  });
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!b) return;
    if (b.dataset.act === 'print') window.print();
    if (b.dataset.act === 'text') {
      const lines = [`${title}, ${fmtDate(s.date, { weekday: 'long', month: 'short', day: 'numeric' })}`, ''];
      s.items.forEach((it, n) => {
        const e = exMap.get(it.exerciseId);
        if (!e) return;
        const sets = it.sets.filter(filled);
        lines.push(`${n + 1}. ${e.name}: ${sets.length ? sets.map((x) => setLabel(x, e.measure)).join(', ') : `${it.sets.length} sets`}${it.notes ? ` (${it.notes})` : ''}`);
      });
      if (planned && s.trainerNotes) lines.push('', s.trainerNotes);
      lines.push('', branded ? settings.businessName : settings.trainerName);
      shareText(title, lines.filter((l, i) => l !== '' || i > 0).join('\n').trim());
    }
  });
}
