// App entry: routes, shell, storage and offline setup.
import { render, route } from './router.js';
import * as db from './db.js';
import { ensureCatalog, loadSample } from './seed.js';
import { PREVIEW } from './util.js';
import { home } from './views/home.js';
import { clientDetail } from './views/clientDetail.js';
import { clientForm, clientsList } from './views/clients.js';
import { newSession, sessionEditor } from './views/session.js';
import { progressReport, sessionSheet } from './views/report.js';
import { exerciseForm, exerciseList } from './views/exercises.js';
import { settingsView } from './views/settings.js';
import { importView } from './views/import.js';
import { classDetail, classList } from './views/classes.js';
import { consumeRedirect } from './auth.js';

route('/', 'today', home);
route('/clients', 'clients', clientsList);
route('/clients/new', 'clients', clientForm);
route('/clients/:id', 'clients', clientDetail);
route('/clients/:id/edit', 'clients', clientForm);
route('/clients/:id/report', 'clients', progressReport);
route('/sessions/new', 'today', newSession);
route('/sessions/:id', 'today', sessionEditor);
route('/sessions/:id/sheet', 'today', sessionSheet);
route('/exercises', 'exercises', exerciseList);
route('/exercises/new', 'exercises', exerciseForm);
route('/exercises/:id', 'exercises', exerciseForm);
route('/settings', 'settings', settingsView);
route('/import', 'clients', importView);
route('/classes', 'classes', classList);
route('/classes/:id', 'classes', classDetail);

async function start() {
  await consumeRedirect();
  await ensureCatalog();
  if (PREVIEW && !(await db.getMeta('previewSeeded'))) { await loadSample(); await db.setMeta('previewSeeded', true); }
  if (!db.persistent) document.body.classList.add('no-storage');
  // Ask the browser not to evict data (granted automatically for Home Screen apps on iOS).
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
  await render();
  if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window.self) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }
}

start();
