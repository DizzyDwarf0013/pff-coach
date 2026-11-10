// Today: what's in progress, what's planned, who hasn't been in for a while.
import type { Ctx } from '../router.js';
import { refresh } from '../router.js';
import * as db from '../db.js';
import type { ClassPlan, Client, Session } from '../types.js';
import { className, isTaught } from '../classlogic.js';
import { avatar, syncLine, topbar } from '../components.js';
import { currentEmail } from '../auth.js';
import { bindSyncLine } from '../syncui.js';
import { loadSample } from '../seed.js';
import { addDays, daysBetween, fullName, html, parseDate, relDay, toast, today } from '../util.js';

export async function home({ root }: Ctx) {
  const [clients, sessions, settings, exMap, email, classes] = await Promise.all([db.getClients(), db.allSessions(), db.getSettings(), db.exercises(), currentEmail(), db.allClasses()]);
  const signedIn = !!email;
  const byId = new Map(clients.map((c) => [c.id, c]));
  const t = today();
  const inProgress = sessions.filter((s) => s.status === 'in_progress');
  // Group classes show once as a class, not once per client who's in them.
  const planned = sessions.filter((s) => !s.classId && s.status === 'planned' && s.date >= t && s.date <= addDays(t, 14)).sort((a, b) => a.date.localeCompare(b.date));
  const recent = sessions.filter((s) => !s.classId && s.status === 'complete').slice(0, 6);
  const classesSoon = classes.filter((p) => !isTaught(p) && p.date >= t && p.date <= addDays(t, 14)).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  const toMark = classes.filter((p) => !isTaught(p) && p.date < t);
  const lastSeen = new Map<string, string>();
  for (const s of sessions) if (s.status === 'complete' && !lastSeen.has(s.clientId)) lastSeen.set(s.clientId, s.date);
  const quiet = clients.filter((c) => c.status === 'active' && lastSeen.has(c.id) && daysBetween(lastSeen.get(c.id)!, t) >= 21)
    .sort((a, b) => lastSeen.get(a.id)!.localeCompare(lastSeen.get(b.id)!)).slice(0, 5);
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const name = settings.trainerName.split(' ')[0];

  const sessionRow = (s: Session, label: string) => {
    const c = byId.get(s.clientId);
    if (!c) return '';
    const names = s.items.map((i) => exMap.get(i.exerciseId)?.name).filter(Boolean) as string[];
    return html`<li><a class="row" href="#/sessions/${s.id}">${avatar(c)}<span class="row-main"><span class="row-title">${fullName(c)}</span><span class="row-sub">${label}${names.length ? ` · ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}` : ''}</span></span><span class="chev" aria-hidden="true">›</span></a></li>`;
  };
  const classRow = (p: ClassPlan, label: string) => {
    const n = (p.attendeeIds || []).length;
    return html`<li><a class="row" href="#/classes/${p.id}"><span class="date-chip"><b>${parseDate(p.date).getDate()}</b>${parseDate(p.date).toLocaleDateString(undefined, { month: 'short' })}</span><span class="row-main"><span class="row-title">${className(p)}</span><span class="row-sub">${[label, n ? `${n} ${n === 1 ? 'client' : 'clients'}` : 'No one added yet', `${p.exercises.length} moves`].join(' · ')}</span></span><span class="chev" aria-hidden="true">›</span></a></li>`;
  };
  const clientRow = (c: Client) => html`<li><a class="row" href="#/clients/${c.id}">${avatar(c)}<span class="row-main"><span class="row-title">${fullName(c)}</span><span class="row-sub">Last session ${relDay(lastSeen.get(c.id)!).toLowerCase()}${c.consent.sms || c.consent.email ? '' : ' · not opted in to messages'}</span></span><span class="chev" aria-hidden="true">›</span></a></li>`;

  root.innerHTML = html`
    ${topbar(`${greeting}${name ? `, ${name}` : ''}`, { sub: html`${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${signedIn ? html` · ${syncLine()}` : ''}` })}
    <div class="quick">
      <a class="quick-btn primary" href="#/sessions/new"><b>Start session</b><span>Log sets as she trains</span></a>
      <a class="quick-btn" href="#/sessions/new?plan=1"><b>Plan a workout</b><span>Build it ahead, share it with her</span></a>
      <a class="quick-btn" href="#/classes/new"><b>Plan a class</b><span>Build a group class, pick who's coming</span></a>
      <a class="quick-btn" href="#/clients/new"><b>New client</b><span>Setup and intake</span></a>
    </div>

    ${!clients.length ? html`
      <section class="card welcome">
        <h2>Welcome to PFF Coach</h2>
        <p>Start by adding a client and filling in her intake. You can also import a client list from the website under Settings.</p>
        <p>Want to look around first? Load two sample clients with twelve weeks of sessions. You can remove them in Settings.</p>
        <div class="row-end"><button class="btn" data-act="sample">Load sample clients</button><a class="btn primary" href="#/clients/new">Add a client</a></div>
      </section>` : ''}

    ${inProgress.length ? html`<h2 class="list-head">In progress</h2><ul class="list">${inProgress.map((s) => sessionRow(s, `Started ${relDay(s.date).toLowerCase()}`))}</ul>` : ''}
    ${planned.length ? html`<h2 class="list-head">Coming up</h2><ul class="list">${planned.map((s) => sessionRow(s, relDay(s.date)))}</ul>` : ''}
    ${classesSoon.length ? html`<h2 class="list-head">Classes coming up</h2><ul class="list">${classesSoon.map((p) => classRow(p, relDay(p.date)))}</ul>` : ''}
    ${toMark.length ? html`<h2 class="list-head">Classes to mark as taught</h2><ul class="list">${toMark.map((p) => classRow(p, relDay(p.date)))}</ul>` : ''}
    ${recent.length ? html`<h2 class="list-head">Recent sessions</h2><ul class="list">${recent.map((s) => sessionRow(s, relDay(s.date)))}</ul>` : ''}
    ${quiet.length ? html`<h2 class="list-head">Haven't trained in 3+ weeks</h2><ul class="list">${quiet.map(clientRow)}</ul>` : ''}
  `.value;

  bindSyncLine(root);
  root.querySelector('[data-act="sample"]')?.addEventListener('click', async () => {
    await loadSample();
    toast('Sample clients loaded');
    refresh();
  });
}
