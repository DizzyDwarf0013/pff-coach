// Group class history: class plans imported from notebooks (planning new classes comes next).
import type { Ctx } from '../router.js';
import { go } from '../router.js';
import * as db from '../db.js';
import type { ClassPlan } from '../types.js';
import { empty, topbar } from '../components.js';
import { confirmDialog, fmtDate, html, parseDate, toast } from '../util.js';

export async function classList({ root }: Ctx) {
  const plans = await db.allClasses();
  const byMonth = new Map<string, ClassPlan[]>();
  for (const p of plans) {
    const k = p.date.slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(p);
  }
  root.innerHTML = html`
    ${topbar('Classes', { sub: plans.length ? `${plans.length} past class plans` : undefined, actions: html`<a class="btn ghost" href="#/import">Import</a>` })}
    ${!plans.length ? empty('No class plans yet', 'Class plans from her notebooks appear here once she imports them. Planning new classes in the app is coming next.', html`<a class="btn primary" href="#/import">Import notebook pages</a>`) : ''}
    ${Array.from(byMonth.entries()).map(([month, list]) => html`
      <h2 class="list-head">${parseDate(month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
      <ul class="list">${list.map((p) => html`
        <li><a class="row" href="#/classes/${p.id}">
          <span class="date-chip"><b>${parseDate(p.date).getDate()}</b>${parseDate(p.date).toLocaleDateString(undefined, { weekday: 'short' })}</span>
          <span class="row-main">
            <span class="row-title">${p.title || 'Group class'}</span>
            <span class="row-sub">${[p.format, p.exercises.map((e) => e.name).slice(0, 4).join(', ')].filter(Boolean).join(' · ')}</span>
          </span>
          <span class="chev" aria-hidden="true">›</span>
        </a></li>`)}
      </ul>`)}
  `.value;
}

function sections(p: ClassPlan): [string, ClassPlan['exercises']][] {
  const out: [string, ClassPlan['exercises']][] = [];
  for (const e of p.exercises) {
    const name = e.section || '';
    const last = out[out.length - 1];
    if (last && last[0] === name) last[1].push(e); else out.push([name, [e]]);
  }
  return out;
}

export async function classDetail({ root, params }: Ctx) {
  const p = await db.get<ClassPlan>('classes', params.id);
  if (!p) { root.innerHTML = html`${topbar('Class not found', { back: '/classes', backLabel: 'Classes' })}`.value; return; }
  root.innerHTML = html`
    ${topbar(p.title || 'Group class', { back: '/classes', backLabel: 'Classes', sub: fmtDate(p.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) })}
    <section class="card">
      ${p.format ? html`<p><b>Format:</b> ${p.format}</p>` : ''}
      ${sections(p).map(([name, list]) => html`
        ${name ? html`<h3 class="class-section">${name}</h3>` : ''}
        <ul class="class-moves">${list.map((e) => html`
          <li><b>${e.name}</b>${e.detail ? html` <span class="muted">${e.detail}</span>` : ''}
            ${e.regression ? html`<span class="mod easier">Easier: ${e.regression}</span>` : ''}
            ${e.progression ? html`<span class="mod harder">Harder: ${e.progression}</span>` : ''}
          </li>`)}
        </ul>`)}
      ${p.notes ? html`<p class="fineprint">${p.notes}</p>` : ''}
      ${p.source === 'import' ? html`<p class="fineprint">Imported from her notebook.</p>` : ''}
    </section>
    <div class="form-actions"><button class="btn danger ghost" data-act="delete">Delete class plan</button></div>`.value;
  root.querySelector('[data-act="delete"]')!.addEventListener('click', async () => {
    if (!(await confirmDialog('Delete this class plan?', 'It will be removed from her class history.', 'Delete', true))) return;
    await db.del('classes', p.id);
    toast('Class plan deleted');
    go('/classes', true);
  });
}
