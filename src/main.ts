// App entry: routes, shell, storage and offline setup.
import './compat.js'; // must stay first: fills in features older iPads lack
import { currentPath, refresh, render, route } from './router.js';
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
import { classDetail, classEditor, classList } from './views/classes.js';
import { consumeRedirect } from './auth.js';
import { startAutoSync } from './sync.js';

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
route('/classes/new', 'classes', classEditor);
route('/classes/:id', 'classes', classDetail);
route('/classes/:id/edit', 'classes', classEditor);

async function start() {
  document.documentElement.classList.add('booted');
  await consumeRedirect();
  await ensureCatalog();
  if (PREVIEW && !(await db.getMeta('previewSeeded'))) { await loadSample(); await db.setMeta('previewSeeded', true); }
  if (!db.persistent) document.body.classList.add('no-storage');
  // Ask the browser not to evict data (granted automatically for Home Screen apps on iOS).
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
  await render();
  // Show changes from her other device, but never re-render a screen she might be typing on.
  document.addEventListener('sync-applied', () => {
    const path = currentPath().split('?')[0];
    if (/^\/$|^\/clients$|^\/clients\/[^/]+$|^\/classes(\/[^/]+)?$|^\/exercises$/.test(path) && path !== '/clients/new' && path !== '/classes/new') refresh();
  });
  if (!PREVIEW) startAutoSync();
  if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window.self) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }
}

start().catch((e) => {
  // index.html shows a readable message instead of a blank screen.
  const show = (window as any).__pffBootError;
  if (typeof show === 'function') show(e);
  else console.error(e);
});
