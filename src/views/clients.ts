// Client list and client setup / intake form.
import type { Ctx } from '../router.js';
import { go } from '../router.js';
import * as db from '../db.js';
import type { Client, Intake } from '../types.js';
import { avatar, chips, empty, formValues, number, segmented, text, textarea, toggle, topbar } from '../components.js';
import { emptyIntake, guidance, stageLabel } from '../logic.js';
import { $, $$, confirmDialog, fullName, html, num, relDay, toast, today, uid } from '../util.js';

export async function clientsList({ root, query }: Ctx) {
  const [clients, sessions] = await Promise.all([db.getClients(), db.allSessions()]);
  const lastSeen = new Map<string, string>();
  for (const s of sessions) if (s.status !== 'planned' && !lastSeen.has(s.clientId)) lastSeen.set(s.clientId, s.date);
  clients.sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName));
  const filter = query.get('f') || 'active';

  root.innerHTML = html`
    ${topbar('Clients', { actions: html`<a class="btn primary" href="#/clients/new">New client</a>` })}
    <div class="toolbar">
      <input type="search" class="search" placeholder="Search clients" aria-label="Search clients">
      <div class="seg compact" role="group" aria-label="Filter clients">
        ${[['active', 'Active'], ['pff', 'Pink Fitness'], ['private', 'Private'], ['inactive', 'Inactive']].map(([k, l]) =>
          html`<a href="#/clients?f=${k}" class="${filter === k ? 'on' : ''}">${l}</a>`)}
      </div>
    </div>
    ${clients.length === 0
      ? empty('No clients yet', 'Add her first client, or import a list from the website in Settings.', html`<a class="btn primary" href="#/clients/new">New client</a>`)
      : html`<ul class="list client-list">
        ${clients.filter((c) => {
          if (filter === 'inactive') return c.status === 'inactive';
          if (c.status === 'inactive') return false;
          if (filter === 'pff') return c.isPinkFitness;
          if (filter === 'private') return !c.isPinkFitness;
          return true;
        }).map((c) => {
          const g = guidance(c);
          const review = g.notes.filter((n) => n.kind === 'review').length;
          const last = lastSeen.get(c.id);
          return html`
            <li data-search="${(fullName(c) + ' ' + (c.email || '') + ' ' + (c.phone || '')).toLowerCase()}">
              <a href="#/clients/${c.id}" class="row">
                ${avatar(c)}
                <span class="row-main">
                  <span class="row-title">${fullName(c)}${c.status === 'lead' ? html` <span class="badge">Lead</span>` : ''}</span>
                  <span class="row-sub">${[c.isPinkFitness ? 'Pink Fitness' : 'Private', stageLabel(c), last ? `Last session ${relDay(last).toLowerCase()}` : 'No sessions yet'].filter(Boolean).join(' · ')}</span>
                </span>
                ${review ? html`<span class="watch" title="${review} things to review">${review}</span>` : ''}
                <span class="chev" aria-hidden="true">›</span>
              </a>
            </li>`;
        })}
      </ul>
      <p class="none-match" hidden>No clients match that search.</p>`}
  `.value;

  const search = $('.search', root) as HTMLInputElement | null;
  search?.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    $$('.client-list li', root).forEach((li) => { const on = !q || li.dataset.search!.includes(q); li.hidden = !on; if (on) shown++; });
    const none = $('.none-match', root);
    if (none) none.hidden = shown > 0;
  });
}

const JOINTS = ['Knees', 'Lower back', 'Hips', 'Shoulders', 'Wrists', 'Neck'];
const GOALS = ['Lose weight', 'Gain strength', 'General fitness', 'Maintain current', 'Prenatal fitness', 'Postpartum recovery'];
const PELVIC = ['Leaking', 'Heaviness or pressure', 'Pelvic or pubic pain'];

export async function clientForm({ root, params }: Ctx) {
  const existing = params.id ? await db.getClient(params.id) : undefined;
  if (params.id && !existing) { root.innerHTML = empty('Client not found', 'She may have been deleted.').value; return; }
  const now = new Date().toISOString();
  const c: Client = existing || {
    id: uid(), firstName: '', lastName: '', email: '', phone: '', isPinkFitness: true, status: 'active',
    consent: { email: false, sms: false }, intake: { ...emptyIntake(), date: today() }, createdAt: now, updatedAt: now,
  };
  const i = c.intake;
  const m = i.maternal;
  const ft = i.heightIn ? Math.floor(i.heightIn / 12) : undefined;
  const inch = i.heightIn ? Math.round(i.heightIn - (ft || 0) * 12) : undefined;

  root.innerHTML = html`
    ${topbar(existing ? `Edit ${fullName(c)}` : 'New client', { back: existing ? `/clients/${c.id}` : '/clients', backLabel: existing ? fullName(c) : 'Clients' })}
    <form class="form" novalidate>
      <section class="card">
        <h2>Client</h2>
        <div class="grid">
          ${text('firstName', 'First name', c.firstName, { required: true, autocomplete: 'off' })}
          ${text('lastName', 'Last name', c.lastName)}
          ${text('email', 'Email', c.email, { type: 'email', inputmode: 'email' })}
          ${text('phone', 'Phone', c.phone, { type: 'tel', inputmode: 'tel' })}
          ${text('dob', 'Date of birth', c.dob, { type: 'date' })}
          ${segmented('status', 'Status', c.status, [['active', 'Active'], ['lead', 'Lead'], ['inactive', 'Inactive']])}
        </div>
        ${toggle('isPinkFitness', 'Pink Fitness client', c.isPinkFitness, 'Reports and workout plans carry Pink Fitness branding. Turn this off for private clients and they go out unbranded.')}
      </section>

      <section class="card">
        <h2>Reminders and promotions</h2>
        ${toggle('consentEmail', 'OK to email', c.consent.email, 'Class reminders, progress reports and occasional offers.')}
        ${toggle('consentSms', 'OK to text', c.consent.sms, 'Only check this if she agreed to texts. The date is recorded when either choice changes.')}
        ${c.consent.updatedAt ? html`<p class="hint">Last updated ${c.consent.updatedAt}</p>` : ''}
      </section>

      <section class="card">
        <h2>Starting measurements</h2>
        <div class="grid">
          ${text('intakeDate', 'Intake date', i.date, { type: 'date' })}
          <div class="field pair">
            <span class="label">Height</span>
            <span class="pair-inputs">
              <span class="unit-wrap"><input name="heightFt" inputmode="numeric" value="${ft ?? ''}" aria-label="Height feet"><span class="unit">ft</span></span>
              <span class="unit-wrap"><input name="heightIn" inputmode="decimal" value="${inch ?? ''}" aria-label="Height inches"><span class="unit">in</span></span>
            </span>
          </div>
          ${number('startWeight', 'Current weight', i.startWeight, { unit: 'lb' })}
          ${number('goalWeight', 'Goal weight', i.goalWeight, { unit: 'lb' })}
          ${number('musclePct', 'Muscle', i.musclePct, { unit: '%' })}
          ${number('bodyFatPct', 'Body fat', i.bodyFatPct, { unit: '%' })}
        </div>
      </section>

      <section class="card">
        <h2>Activity and training</h2>
        <div class="grid">
          ${segmented('activityLevel', 'Daily activity, not counting exercise', i.activityLevel, [['minimal', 'Minimal'], ['occasional', 'Occasional'], ['moderate', 'Moderate'], ['intense', 'Intense']], { wide: true })}
          ${number('avgSteps', 'Average steps a day', i.avgSteps)}
          ${number('daysPerWeek', 'Workouts a week', i.daysPerWeek, { unit: 'days' })}
          ${number('workoutMinutes', 'Workout length', i.workoutMinutes, { unit: 'min' })}
          ${text('workoutLocation', 'Where she works out now', i.workoutLocation)}
          ${segmented('workoutIntensity', 'How she describes her workouts', i.workoutIntensity, [['light', 'Light'], ['moderate', 'Moderate'], ['intense', 'Intense']], { wide: true })}
        </div>
      </section>

      <section class="card">
        <h2>Nutrition</h2>
        <div class="grid">
          ${text('diet', 'Current diet', i.diet, { wide: true })}
          ${number('calories', 'Daily calories', i.calories, { unit: 'kcal' })}
          ${text('dietDuration', 'How long on this diet', i.dietDuration)}
          ${segmented('eatingDisorderHistory', 'Any history of eating disorders?', i.eatingDisorderHistory, [['no', 'No'], ['yes', 'Yes'], ['prefer-not', 'Prefer not to say']], { wide: true })}
        </div>
      </section>

      <section class="card">
        <h2>Pregnancy and postpartum</h2>
        ${segmented('maternalStatus', 'Right now she is', m.status, [['none', 'Neither'], ['pregnant', 'Pregnant'], ['postpartum', 'Postpartum']], { wide: true })}
        <div class="grid" data-when="pregnant">
          ${text('dueDate', 'Due date', m.dueDate, { type: 'date' })}
        </div>
        <div class="grid" data-when="postpartum">
          ${text('deliveryDate', 'Delivery date', m.deliveryDate, { type: 'date' })}
          ${segmented('deliveryType', 'Delivery', m.deliveryType, [['vaginal', 'Vaginal'], ['c-section', 'C-section']])}
        </div>
        <div class="grid" data-when="pregnant postpartum">
          ${segmented('diastasis', 'Diastasis recti', m.diastasis, [['no', 'No'], ['yes', 'Yes'], ['unsure', 'Not sure']])}
          ${segmented('clearance', 'Medical clearance to exercise', m.clearance, [['yes', 'Yes'], ['no', 'No']])}
          ${text('clearanceDate', 'Cleared on', m.clearanceDate, { type: 'date' })}
          ${chips('pelvicFloor', 'Pelvic floor symptoms', m.pelvicFloor, PELVIC)}
        </div>
      </section>

      <section class="card">
        <h2>Health</h2>
        ${chips('jointAreas', 'Joint or pain concerns', i.jointAreas, JOINTS)}
        <div class="grid">
          ${textarea('medical', 'Medical issues or ailments', i.medical)}
          ${text('emergencyName', 'Emergency contact', i.emergencyName)}
          ${text('emergencyPhone', 'Emergency phone', i.emergencyPhone, { type: 'tel', inputmode: 'tel' })}
        </div>
      </section>

      <section class="card">
        <h2>Goals</h2>
        ${chips('goals', 'Main goals', i.goals, GOALS)}
        <div class="grid">
          ${textarea('specificGoals', 'In her words', i.specificGoals, { placeholder: 'e.g. Carry my toddler up the stairs without back pain' })}
          ${textarea('notes', 'Trainer notes', c.notes, { rows: 3 })}
        </div>
      </section>

      <div class="form-actions">
        ${existing ? html`<button type="button" class="btn danger ghost" data-act="delete">Delete client</button>` : ''}
        <span class="spacer"></span>
        <a class="btn ghost" href="#${existing ? `/clients/${c.id}` : '/clients'}">Cancel</a>
        <button class="btn primary" type="submit">${existing ? 'Save changes' : 'Add client'}</button>
      </div>
    </form>
  `.value;

  const form = $('form', root) as HTMLFormElement;
  const syncWhen = () => {
    const status = (form.querySelector('input[name="maternalStatus"]:checked') as HTMLInputElement | null)?.value || 'none';
    $$('[data-when]', form).forEach((el) => { el.hidden = !el.dataset.when!.split(' ').includes(status); });
  };
  form.addEventListener('change', syncWhen);
  syncWhen();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formValues(form);
    const first = f.str('firstName');
    if (!first) { toast('Add a first name to save.'); ($('input[name="firstName"]', form) as HTMLInputElement).focus(); return; }
    const ftV = num(f.str('heightFt')), inV = num(f.str('heightIn'));
    const intake: Intake = {
      date: f.str('intakeDate') || undefined,
      heightIn: ftV !== undefined || inV !== undefined ? (ftV || 0) * 12 + (inV || 0) : undefined,
      startWeight: num(f.str('startWeight')), goalWeight: num(f.str('goalWeight')),
      musclePct: num(f.str('musclePct')), bodyFatPct: num(f.str('bodyFatPct')),
      activityLevel: f.str('activityLevel') as Intake['activityLevel'], avgSteps: num(f.str('avgSteps')),
      daysPerWeek: num(f.str('daysPerWeek')), workoutMinutes: num(f.str('workoutMinutes')),
      workoutIntensity: f.str('workoutIntensity') as Intake['workoutIntensity'], workoutLocation: f.str('workoutLocation'),
      diet: f.str('diet'), calories: num(f.str('calories')), dietDuration: f.str('dietDuration'),
      eatingDisorderHistory: f.str('eatingDisorderHistory') as Intake['eatingDisorderHistory'],
      medical: f.str('medical'), jointAreas: f.all('jointAreas'),
      maternal: {
        status: (f.str('maternalStatus') || 'none') as Intake['maternal']['status'],
        dueDate: f.str('dueDate') || undefined, deliveryDate: f.str('deliveryDate') || undefined,
        deliveryType: f.str('deliveryType') as Intake['maternal']['deliveryType'],
        diastasis: f.str('diastasis') as Intake['maternal']['diastasis'],
        pelvicFloor: f.all('pelvicFloor'),
        clearance: f.str('clearance') as Intake['maternal']['clearance'], clearanceDate: f.str('clearanceDate') || undefined,
      },
      goals: f.all('goals'), specificGoals: f.str('specificGoals'),
      emergencyName: f.str('emergencyName'), emergencyPhone: f.str('emergencyPhone'),
    };
    const email = f.has('consentEmail'), sms = f.has('consentSms');
    const consentChanged = email !== c.consent.email || sms !== c.consent.sms;
    const saved: Client = {
      ...c,
      firstName: first, lastName: f.str('lastName'), email: f.str('email'), phone: f.str('phone'), dob: f.str('dob') || undefined,
      status: (f.str('status') || 'active') as Client['status'], isPinkFitness: f.has('isPinkFitness'),
      consent: { email, sms, updatedAt: consentChanged ? today() : c.consent.updatedAt },
      intake, notes: f.str('notes'), updatedAt: new Date().toISOString(),
    };
    await db.saveClient(saved);
    // keep the starting measurement in step with the intake
    const mid = `intake-${saved.id}`;
    if (intake.startWeight || intake.musclePct || intake.bodyFatPct) {
      await db.put('measurements', { id: mid, clientId: saved.id, date: intake.date || today(), weight: intake.startWeight, musclePct: intake.musclePct, bodyFatPct: intake.bodyFatPct, notes: 'Intake' });
    } else {
      await db.del('measurements', mid);
    }
    toast(existing ? 'Changes saved' : `${first} added`);
    go(`/clients/${saved.id}`, !existing);
  });

  $('[data-act="delete"]', root)?.addEventListener('click', async () => {
    const ok = await confirmDialog(`Delete ${fullName(c)}?`, 'This removes her intake, every session and all progress measurements. It cannot be undone.', 'Delete client', true);
    if (!ok) return;
    await db.deleteClientCascade(c.id);
    toast('Client deleted');
    go('/clients', true);
  });
}
