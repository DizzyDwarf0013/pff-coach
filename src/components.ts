// Shared UI pieces.
import type { Client } from './types.js';
import { html, initials, raw, Raw } from './util.js';

export function topbar(title: string | Raw, opts: { back?: string; backLabel?: string; actions?: Raw; sub?: string | Raw } = {}): Raw {
  return html`
    <header class="topbar">
      ${opts.back ? html`<a class="back" href="#${opts.back}"><span aria-hidden="true">‹</span> ${opts.backLabel || 'Back'}</a>` : ''}
      <div class="topbar-row">
        <div class="topbar-title">
          <h1>${title}</h1>
          ${opts.sub ? html`<p class="sub">${opts.sub}</p>` : ''}
        </div>
        ${opts.actions ? html`<div class="topbar-actions">${opts.actions}</div>` : ''}
      </div>
    </header>`;
}

export function avatar(c: Client, size: 'sm' | 'lg' = 'sm'): Raw {
  return html`<span class="avatar ${size} ${c.isPinkFitness ? 'pff' : ''}" aria-hidden="true">${initials(c)}</span>`;
}

export function pffBadge(c: Client): Raw {
  return c.isPinkFitness ? html`<span class="badge pff">Pink Fitness</span>` : html`<span class="badge">Private client</span>`;
}

export function empty(title: string, body: string, action?: Raw): Raw {
  return html`<div class="empty"><h2>${title}</h2><p>${body}</p>${action || ''}</div>`;
}

// ---- form fields ----
type Val = string | number | undefined | null;
const v = (x: Val) => (x === undefined || x === null ? '' : String(x));

export function text(name: string, label: string, value: Val, opts: { type?: string; placeholder?: string; required?: boolean; autocomplete?: string; inputmode?: string; hint?: string; wide?: boolean } = {}): Raw {
  return html`
    <label class="field ${opts.wide ? 'wide' : ''}">
      <span class="label">${label}</span>
      <input name="${name}" type="${opts.type || 'text'}" value="${v(value)}" ${raw(opts.placeholder ? `placeholder="${opts.placeholder}"` : '')}
        ${opts.required ? raw('required') : ''} ${raw(opts.autocomplete ? `autocomplete="${opts.autocomplete}"` : 'autocomplete="off"')}
        ${raw(opts.inputmode ? `inputmode="${opts.inputmode}"` : '')}>
      ${opts.hint ? html`<span class="hint">${opts.hint}</span>` : ''}
    </label>`;
}

export function number(name: string, label: string, value: Val, opts: { unit?: string; step?: string; hint?: string; placeholder?: string } = {}): Raw {
  return html`
    <label class="field">
      <span class="label">${label}</span>
      <span class="unit-wrap">
        <input name="${name}" type="text" inputmode="decimal" value="${v(value)}" autocomplete="off" ${raw(opts.placeholder ? `placeholder="${opts.placeholder}"` : '')}>
        ${opts.unit ? html`<span class="unit">${opts.unit}</span>` : ''}
      </span>
      ${opts.hint ? html`<span class="hint">${opts.hint}</span>` : ''}
    </label>`;
}

export function textarea(name: string, label: string, value: Val, opts: { rows?: number; placeholder?: string; hint?: string } = {}): Raw {
  return html`
    <label class="field wide">
      <span class="label">${label}</span>
      <textarea name="${name}" rows="${opts.rows || 3}" ${raw(opts.placeholder ? `placeholder="${opts.placeholder}"` : '')}>${v(value)}</textarea>
      ${opts.hint ? html`<span class="hint">${opts.hint}</span>` : ''}
    </label>`;
}

export function select(name: string, label: string, value: Val, options: [string, string][], opts: { hint?: string } = {}): Raw {
  return html`
    <label class="field">
      <span class="label">${label}</span>
      <select name="${name}">
        ${options.map(([val, lab]) => html`<option value="${val}" ${val === v(value) ? raw('selected') : ''}>${lab}</option>`)}
      </select>
      ${opts.hint ? html`<span class="hint">${opts.hint}</span>` : ''}
    </label>`;
}

/** Segmented single choice (radio buttons styled as a segmented control). */
export function segmented(name: string, label: string, value: Val, options: [string, string][], opts: { wide?: boolean } = {}): Raw {
  return html`
    <fieldset class="field ${opts.wide ? 'wide' : ''}">
      <legend class="label">${label}</legend>
      <div class="seg">
        ${options.map(([val, lab]) => html`<label><input type="radio" name="${name}" value="${val}" ${val === v(value) ? raw('checked') : ''}><span>${lab}</span></label>`)}
      </div>
    </fieldset>`;
}

/** Multi-select chips (checkboxes). */
export function chips(name: string, label: string, values: string[], options: string[], opts: { hint?: string } = {}): Raw {
  return html`
    <fieldset class="field wide">
      <legend class="label">${label}</legend>
      <div class="chips">
        ${options.map((o) => html`<label><input type="checkbox" name="${name}" value="${o}" ${values.includes(o) ? raw('checked') : ''}><span>${o}</span></label>`)}
      </div>
      ${opts.hint ? html`<span class="hint">${opts.hint}</span>` : ''}
    </fieldset>`;
}

export function toggle(name: string, label: string, checked: boolean, hint?: string): Raw {
  return html`
    <label class="toggle">
      <span><span class="label">${label}</span>${hint ? html`<span class="hint">${hint}</span>` : ''}</span>
      <input type="checkbox" role="switch" name="${name}" ${checked ? raw('checked') : ''}>
    </label>`;
}

export function formValues(form: HTMLFormElement) {
  const fd = new FormData(form);
  return {
    str: (k: string) => { const x = fd.get(k); return x === null ? '' : String(x).trim(); },
    all: (k: string) => fd.getAll(k).map(String),
    has: (k: string) => fd.has(k),
  };
}
