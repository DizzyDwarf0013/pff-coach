// Hash router: "#/clients/abc?tab=progress".
// Each navigation renders into a brand-new container that replaces the old one, so event
// listeners bound by a view never pile up across renders.
export interface Ctx {
  params: Record<string, string>;
  query: URLSearchParams;
  root: HTMLElement;
  /** run after the view is attached to the document (for layout-dependent work like charts) */
  mounted: (fn: () => void) => void;
}
export type View = (ctx: Ctx) => Promise<void> | void;

const routes: { re: RegExp; keys: string[]; view: View; nav: string }[] = [];
let current = 0;

export function route(pattern: string, nav: string, view: View) {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ re, keys, view, nav });
}

export function go(path: string, replace = false) {
  const target = '#' + path;
  if (replace) { history.replaceState(null, '', target); render(); }
  else if (location.hash === target) render();
  else location.hash = target;
}

export function currentPath() {
  return location.hash.replace(/^#/, '') || '/';
}

/** Re-render the current route without moving scroll position. */
export function refresh() { return render(true); }

export async function render(keepScroll = false) {
  const token = ++current;
  const [path, qs] = currentPath().split('?');
  const match = routes.map((r) => ({ r, m: path.match(r.re) })).find((x) => x.m) || { r: routes[0], m: ['/'] as RegExpMatchArray };
  const params: Record<string, string> = {};
  match.r.keys.forEach((k, i) => (params[k] = decodeURIComponent(match.m![i + 1])));
  const fresh = document.createElement('main');
  fresh.id = 'view';
  fresh.tabIndex = -1;
  const after: (() => void)[] = [];
  await match.r.view({ params, query: new URLSearchParams(qs || ''), root: fresh, mounted: (fn) => after.push(fn) });
  if (token !== current) return; // a newer navigation won
  const y = window.scrollY;
  document.getElementById('view')!.replaceWith(fresh);
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === match.r.nav;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  after.forEach((fn) => fn());
  if (keepScroll) window.scrollTo(0, y);
  else { window.scrollTo(0, 0); fresh.focus({ preventScroll: true }); }
}

window.addEventListener('hashchange', () => render());
