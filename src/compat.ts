// Fills in browser features that older iPads lack (iOS 12 to 15), so the app runs there too.
// Imported first by main.ts, so it runs before any other module's code.
// Every fill is skipped where the browser already has the feature.

export {};
const w = window as any;

// structuredClone: Safari 15.4. Everything stored is plain JSON-shaped data.
if (typeof w.structuredClone !== 'function') {
  w.structuredClone = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
}

// Object.fromEntries: Safari 12.1.
if (typeof (Object as any).fromEntries !== 'function') {
  (Object as any).fromEntries = (entries: Iterable<[PropertyKey, unknown]>) => {
    const o: Record<PropertyKey, unknown> = {};
    for (const [k, v] of entries) o[k as any] = v;
    return o;
  };
}

// File.text() and File.arrayBuffer(): Safari 14.
const blobProto = Blob.prototype as any;
if (typeof blobProto.text !== 'function') {
  blobProto.text = function (this: Blob) { return new Response(this).text(); };
}
if (typeof blobProto.arrayBuffer !== 'function') {
  blobProto.arrayBuffer = function (this: Blob) { return new Response(this).arrayBuffer(); };
}

// <dialog> with showModal(): Safari 15.4. The app only makes dialogs with
// document.createElement('dialog'), so those elements get the methods it uses.
if (typeof w.HTMLDialogElement !== 'function') {
  const create = document.createElement;
  document.createElement = function (this: Document, tag: string, opts?: ElementCreationOptions) {
    const el = create.call(this, tag, opts);
    if (String(tag).toLowerCase() === 'dialog') upgradeDialog(el);
    return el;
  } as typeof document.createElement;
  document.documentElement.classList.add('dialog-polyfill');
}

function upgradeDialog(d: any) {
  let backdrop: HTMLElement | null = null;
  let submitter: HTMLButtonElement | HTMLInputElement | null = null;
  d.returnValue = '';
  Object.defineProperty(d, 'open', {
    configurable: true,
    get() { return d.hasAttribute('open'); },
    set(v: boolean) { if (v) d.setAttribute('open', ''); else d.removeAttribute('open'); },
  });
  const openUp = (modal: boolean) => {
    if (d.open) return;
    d.setAttribute('open', '');
    if (!modal) return;
    d.classList.add('dlg-modal');
    backdrop = document.createElement('div');
    backdrop.className = 'dlg-backdrop';
    // A tap outside acts like a tap on the dialog itself, as it does natively.
    backdrop.addEventListener('click', () => d.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    d.parentNode?.insertBefore(backdrop, d);
    const first = d.querySelector('[autofocus]') as HTMLElement | null;
    if (first) first.focus();
  };
  d.show = () => openUp(false);
  d.showModal = () => openUp(true);
  d.close = (value?: string) => {
    if (!d.open) return;
    if (value !== undefined) d.returnValue = String(value);
    d.removeAttribute('open');
    d.classList.remove('dlg-modal');
    if (backdrop) { backdrop.remove(); backdrop = null; }
    d.dispatchEvent(new Event('close'));
  };
  // Remember which button submitted, for forms with method="dialog".
  d.addEventListener('click', (e: Event) => {
    const t = e.target as HTMLElement;
    const b = t && t.closest ? (t.closest('button, input[type="submit"]') as HTMLButtonElement | null) : null;
    if (b) submitter = b;
  }, true);
  d.addEventListener('submit', (e: Event) => {
    const form = e.target as HTMLFormElement;
    if ((form.getAttribute('method') || '').toLowerCase() !== 'dialog') return;
    e.preventDefault();
    const value = submitter ? submitter.value : '';
    submitter = null;
    d.close(value);
  });
  d.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); d.close(); }
  });
}
