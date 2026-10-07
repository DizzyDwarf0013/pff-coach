// Small helpers: safe HTML templating, dates, numbers, ids, toasts.

/** True in the claude.ai preview build, where printing and file downloads are unavailable. */
export const PREVIEW = !!(window as any).__PFF_PREVIEW__;

export class Raw {
  constructor(public readonly value: string) {}
  toString() { return this.value; }
}

export const raw = (s: string) => new Raw(s);

export function esc(v: unknown): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function part(v: unknown): string {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof Raw) return v.value;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}

/** Tagged template that escapes every interpolation unless it is Raw (or an array of Raw). */
export function html(strings: TemplateStringsArray, ...vals: unknown[]): Raw {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return new Raw(out);
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// ---- dates (local calendar dates as YYYY-MM-DD) ----
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export const today = () => isoDate();
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}
export function fmtDate(s?: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  if (!s) return '';
  return parseDate(s).toLocaleDateString(undefined, opts);
}
export function fmtShort(s?: string): string {
  if (!s) return '';
  const d = parseDate(s);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: '2-digit' });
}
export function relDay(s: string): string {
  const n = daysBetween(today(), s);
  if (n === 0) return 'Today';
  if (n === -1) return 'Yesterday';
  if (n === 1) return 'Tomorrow';
  if (n < 0 && n > -7) return `${-n} days ago`;
  if (n > 0 && n < 7) return parseDate(s).toLocaleDateString(undefined, { weekday: 'long' });
  return fmtShort(s);
}
export function ageFrom(dob?: string): number | undefined {
  if (!dob) return undefined;
  const d = parseDate(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a;
}

// ---- numbers ----
export function num(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  if (s === '') return undefined;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}
export function fmtNum(n?: number | null, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return r.toLocaleString(undefined, { maximumFractionDigits: digits });
}
export function fmtHeight(inches?: number): string {
  if (!inches) return '';
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches - ft * 12);
  return `${ft}′${inch}″`;
}
export function bmi(weightLb?: number, heightIn?: number): number | undefined {
  if (!weightLb || !heightIn) return undefined;
  return (703 * weightLb) / (heightIn * heightIn);
}
/** Epley estimate of a one-rep max. */
export function e1rm(weight?: number | null, reps?: number | null): number | undefined {
  if (!weight || !reps) return undefined;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}
export function fmtSeconds(s?: number | null): string {
  if (!s && s !== 0) return '';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
}

// ---- DOM ----
export function $(sel: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector(sel);
}
export function $$(sel: string, root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll(sel));
}

let toastTimer: number | undefined;
export function toast(message: string) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 2400);
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number) {
  let t: number | undefined;
  const wrapped = (...args: Parameters<T>) => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = () => { window.clearTimeout(t); };
  return wrapped as T & { flush: () => void };
}

export function fullName(c: { firstName: string; lastName: string }) {
  return `${c.firstName} ${c.lastName}`.trim();
}
export function initials(c: { firstName: string; lastName: string }) {
  return ((c.firstName[0] || '') + (c.lastName[0] || '')).toUpperCase();
}

/** Ask a yes/no question in a native-feeling dialog. */
export function confirmDialog(title: string, body: string, confirmLabel: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet confirm';
    dlg.innerHTML = html`
      <form method="dialog">
        <h2>${title}</h2>
        <p>${body}</p>
        <div class="row-end">
          <button value="no" class="btn ghost">Cancel</button>
          <button value="yes" class="btn ${danger ? 'danger' : 'primary'}">${confirmLabel}</button>
        </div>
      </form>`.value;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'yes');
      dlg.remove();
    });
    dlg.showModal();
  });
}

export function downloadFile(name: string, content: Blob) {
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
