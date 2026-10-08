// Settings: trainer profile, importing clients, backups, sample data.
import type { Ctx } from '../router.js';
import { refresh } from '../router.js';
import * as db from '../db.js';
import type { Client, Settings } from '../types.js';
import { formValues, text, toggle, topbar } from '../components.js';
import { mapClients, parseCSV } from '../csv.js';
import { loadSample, removeSample } from '../seed.js';
import { authForm, bindAuthForm, currentEmail, signOut } from '../auth.js';
import { $, PREVIEW, confirmDialog, downloadFile, html, raw, toast, today } from '../util.js';

export async function settingsView({ root }: Ctx) {
  const [s, clients, email] = await Promise.all([db.getSettings(), db.getClients(), currentEmail()]);
  const hasSample = clients.some((c) => c.source === 'sample');
  const persisted = db.persistent && navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

  root.innerHTML = html`
    ${topbar('Settings')}
    <form class="form profile-form">
      <section class="card">
        <h2>Your details</h2>
        <p class="fineprint">These appear on reports and workout plans. Private clients see your name and the unbranded title instead of Pink Fitness.</p>
        <div class="grid">
          ${text('trainerName', 'Your name', s.trainerName)}
          ${text('businessName', 'Business name', s.businessName)}
          ${text('unbrandedTitle', 'Title for private clients', s.unbrandedTitle, { hint: 'e.g. Personal Training, or NASM Certified Personal Trainer' })}
          ${text('website', 'Website', s.website)}
          ${text('contactEmail', 'Contact email', s.contactEmail, { type: 'email', inputmode: 'email' })}
          ${text('contactPhone', 'Contact phone', s.contactPhone, { type: 'tel', inputmode: 'tel' })}
        </div>
        <div class="row-end"><button class="btn primary">Save details</button></div>
      </section>
    </form>

    <section class="card account">
      <h2>Account</h2>
      ${PREVIEW ? html`<p class="fineprint">Signing in isn't available in this preview.</p>` : email ? html`
        <p>Signed in as <b>${email}</b>. Importing notebook pages uses this account.</p>
        <div class="row-end"><button class="btn ghost" data-act="signout">Sign out</button></div>`
      : authForm('Sign in to read notebook pages. Create the account once, then sign in with the same email and password on each device.')}
    </section>

    <section class="card">
      <h2>Import from notebook</h2>
      <p>Photograph notebook pages or choose PDFs. Clients, sessions, measurements and class plans are read from each page, and you check them before anything is saved.</p>
      <div class="grid">
        <label class="field">
          <span class="label">Reading model</span>
          <select name="importModel">
            <option value="sonnet" ${s.importModel === 'sonnet' ? raw('selected') : ''}>Sonnet 5.5 (most accurate)</option>
            <option value="haiku" ${s.importModel === 'haiku' ? raw('selected') : ''}>Haiku 5.5 (cheapest)</option>
          </select>
          <span class="hint">Sonnet costs about 2–3¢ a page and reads messy handwriting best. Haiku costs well under 1¢ a page.</span>
        </label>
      </div>
      <div class="row-end"><a class="btn primary" href="#/import">Import notebook pages</a></div>
    </section>

    <section class="card">
      <h2>Import a client list</h2>
      <p>Bring in a client list exported from the website or a spreadsheet, saved as CSV. Columns for name, email and phone are matched automatically. Clients whose email is already here are skipped.</p>
      <form class="import-form">
        ${toggle('pff', 'Mark imported clients as Pink Fitness', true)}
        <label class="file-btn btn">Choose CSV file<input type="file" accept=".csv,text/csv" name="csv" hidden></label>
      </form>
      <div class="import-preview"></div>
    </section>

    <section class="card">
      <h2>Backup</h2>
      ${PREVIEW ? html`<p class="flag">Backups are turned off in this preview. They work in the installed app.</p>` : ''}<p>Everything is stored on this device only. Download a backup regularly and keep it somewhere safe, like Files or iCloud Drive. Restoring on another device copies everything over.</p>
      <p class="fineprint">${db.persistent ? (persisted ? 'Storage is marked as persistent, so the system will not clear it to save space.' : 'Tip: add the app to the Home Screen so the system keeps its data.') : 'Storage is not available here, so changes in this window are not being saved.'}</p>
      <div class="row-end">
        <label class="file-btn btn ghost">Restore from backup<input type="file" accept=".json,application/json" name="restore" hidden></label>
        ${PREVIEW ? '' : html`<button class="btn primary" data-act="backup">Download backup</button>`}
      </div>
    </section>

    ${!standalone ? html`
      <section class="card">
        <h2>Put it on the Home Screen</h2>
        <p>In Safari on iPhone or iPad, tap the Share button, then Add to Home Screen. The app opens full screen and works without a connection.</p>
      </section>` : ''}

    <section class="card">
      <h2>Sample data</h2>
      <p>${hasSample ? 'Two sample clients (Maya and Jen) are loaded.' : 'Load two sample clients with twelve weeks of sessions to explore the app.'}</p>
      <div class="row-end">${hasSample ? html`<button class="btn" data-act="remove-sample">Remove sample clients</button>` : html`<button class="btn" data-act="load-sample">Load sample clients</button>`}</div>
    </section>

    <section class="card danger-zone">
      <h2>Erase everything</h2>
      <p>Deletes every client, session, measurement and custom exercise from this device.</p>
      <div class="row-end"><button class="btn danger" data-act="erase">Erase all data</button></div>
    </section>
    <p class="fineprint center">PFF Coach · version 1.1</p>`.value;

  // profile
  const pf = $('.profile-form', root) as HTMLFormElement;
  pf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formValues(pf);
    const next: Settings = { ...s, trainerName: f.str('trainerName'), businessName: f.str('businessName'), unbrandedTitle: f.str('unbrandedTitle'), website: f.str('website'), contactEmail: f.str('contactEmail'), contactPhone: f.str('contactPhone') };
    await db.saveSettings(next);
    toast('Details saved');
  });

  // account and import model
  bindAuthForm(root, () => refresh());
  root.querySelector<HTMLSelectElement>('select[name="importModel"]')?.addEventListener('change', async (e) => {
    const cur = await db.getSettings();
    await db.saveSettings({ ...cur, importModel: (e.target as HTMLSelectElement).value as Settings['importModel'] });
    toast('Reading model saved');
  });

  // import
  const preview = $('.import-preview', root)!;
  root.querySelector<HTMLInputElement>('input[name="csv"]')!.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const rows = parseCSV(await file.text());
    input.value = '';
    if (rows.length < 2) { preview.innerHTML = html`<p class="flag">That file has no rows to import.</p>`.value; return; }
    const pff = (root.querySelector('input[name="pff"]') as HTMLInputElement).checked;
    const existing = new Set((await db.getClients()).map((c) => (c.email || '').toLowerCase()).filter(Boolean));
    const res = mapClients(rows, pff, existing);
    if (!res.columns.first && !res.columns.full && !res.columns.email) {
      preview.innerHTML = html`<p class="flag">Couldn't find a name or email column. The first row should be headings like First name, Last name, Email, Phone.</p>`.value;
      return;
    }
    preview.innerHTML = html`
      <p><b>${res.clients.length} clients ready to import</b>${res.skipped ? `, ${res.skipped} skipped (already here or blank)` : ''}.</p>
      <p class="fineprint">Matched columns: ${Object.entries(res.columns).map(([k, v]) => `${k} ← “${v}”`).join(', ')}.${res.columns.emailOk ? '' : ' No marketing opt-in column was found, so email and text consent start off.'}</p>
      ${res.clients.length ? html`
        <table class="table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th></tr></thead>
        <tbody>${res.clients.slice(0, 8).map((c) => html`<tr><td>${c.firstName} ${c.lastName}</td><td>${c.email}</td><td>${c.phone}</td></tr>`)}</tbody></table>
        ${res.clients.length > 8 ? html`<p class="fineprint">…and ${res.clients.length - 8} more.</p>` : ''}
        <div class="row-end"><button class="btn primary" data-act="do-import">Import ${res.clients.length} clients</button></div>` : ''}`.value;
    $('[data-act="do-import"]', preview)?.addEventListener('click', async () => {
      await db.putMany('clients', res.clients as Client[]);
      toast(`${res.clients.length} clients imported`);
      preview.innerHTML = '';
    });
  });

  // restore
  root.querySelector<HTMLInputElement>('input[name="restore"]')!.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const ok = await confirmDialog('Restore this backup?', `It has ${data.clients?.length ?? 0} clients and ${data.sessions?.length ?? 0} sessions, saved ${String(data.exportedAt || '').slice(0, 10)}. Everything on this device will be replaced with it.`, 'Replace and restore', true);
      if (!ok) return;
      await db.importAll(data, 'replace');
      toast('Backup restored');
      refresh();
    } catch (err) {
      toast((err as Error).message.includes('backup') ? (err as Error).message : 'That file could not be read as a backup.');
    }
  });

  root.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'signout') {
      await signOut(); toast('Signed out'); refresh();
    } else if (act === 'backup') {
      const data = await db.exportAll();
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const name = `pff-coach-backup-${today()}.json`;
      const file = new File([blob], name, { type: 'application/json' });
      if ((navigator as any).canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'PFF Coach backup' }); return; } catch (err) { if ((err as Error).name === 'AbortError') return; }
      }
      downloadFile(name, blob);
      await db.setMeta('lastBackup', today());
    } else if (act === 'load-sample') {
      await loadSample(); toast('Sample clients loaded'); refresh();
    } else if (act === 'remove-sample') {
      await removeSample(); toast('Sample clients removed'); refresh();
    } else if (act === 'erase') {
      if (!(await confirmDialog('Erase all data?', 'Every client, session and measurement on this device will be deleted. Download a backup first if you might need it.', 'Erase everything', true))) return;
      await db.clearAll();
      location.hash = '#/';
      location.reload();
    }
  });
}
