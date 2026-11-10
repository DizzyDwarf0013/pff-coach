// Exercise cards: the full card (picture, steps, cues, breathing, easier/harder, pregnancy note),
// a small picture for workout sheets, and a sheet that opens when an exercise name is tapped.
import * as db from '../db.js';
import type { Exercise } from '../types.js';
import { exerciseArt } from '../figure.js';
import { template } from '../poses.js';
import { cardFor } from '../exerciseInfo.js';
import { GROUP_LABEL, muscleGroup } from '../planlogic.js';
import { TAGS } from '../seed.js';
import { esc, html, raw, Raw } from '../util.js';

const artCache = new Map<string, string>();
/** The start → finish picture for an exercise (cached per picture and size). */
export function art(ex: Exercise, labels = true): Raw {
  const t = cardFor(ex).t;
  const key = `${t}|${labels ? 1 : 0}`;
  if (!artCache.has(key)) artCache.set(key, exerciseArt(template(t), { labels }));
  return raw(artCache.get(key)!);
}

const GOOD = new Set(['prenatal-friendly', 'pelvic-floor']);

/** The full card. `flags` are intake reasons to review for the client it's being shown to. */
export function cardHtml(ex: Exercise, opts: { flags?: string[]; who?: string } = {}): Raw {
  const c = cardFor(ex);
  const tags: [string, string][] = [[GROUP_LABEL[muscleGroup(ex)], '']];
  if (ex.equipment) tags.push([ex.equipment, '']);
  ex.tags.forEach((t) => tags.push([TAGS[t] || t, GOOD.has(t) ? 'good' : 'care']));
  const steps = c.steps.length ? c.steps : [];
  return html`
    <article class="ex-card">
      <div class="ex-art">${art(ex)}</div>
      <div class="ex-body">
        <h2 class="ex-name">${ex.name}</h2>
        <div class="ex-tags">${tags.map(([t, k]) => html`<span class="ex-tag ${k}">${t}</span>`)}</div>
        ${opts.flags?.length ? html`<p class="flag">Review${opts.who ? ` for ${opts.who}` : ''}: ${opts.flags.join(' ')}</p>` : ''}
        ${steps.length ? html`<ol class="ex-steps">${steps.map((s) => html`<li><span>${s}</span></li>`)}</ol>`
          : html`<p class="muted ex-missing">No steps written for this exercise yet. Tap <b>Edit card</b> to add how you teach it.</p>`}
        ${c.cues.length ? html`<h3 class="ex-h">Coaching cues</h3><ul class="ex-cues">${c.cues.map((q) => html`<li>${q}</li>`)}</ul>` : ''}
        ${ex.cues && !ex.card?.cues ? html`<p class="ex-note-own"><b>Your notes:</b> ${ex.cues}</p>` : ''}
        ${c.breathe ? html`<p class="ex-breathe"><b>Breathe:</b> ${c.breathe}</p>` : ''}
        ${c.easier || c.harder ? html`<div class="ex-mods">
          ${c.easier ? html`<div class="ex-mod easier"><b>Easier</b>${c.easier}</div>` : ''}
          ${c.harder ? html`<div class="ex-mod harder"><b>Harder</b>${c.harder}</div>` : ''}
        </div>` : ''}
        ${c.preg ? html`<p class="ex-preg"><b>Pregnancy:</b> ${c.preg}</p>` : ''}
      </div>
    </article>`;
}

/** Two short cues for a workout sheet row. */
export function shortCues(ex: Exercise): string {
  return cardFor(ex).cues.slice(0, 2).join(' · ');
}

/** Opens the card in a sheet. */
export function showCard(ex: Exercise, opts: { flags?: string[]; who?: string } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet ex-sheet';
  dlg.setAttribute('aria-label', ex.name);
  dlg.innerHTML = html`
    <div class="ex-sheet-bar"><a class="btn small ghost" href="#/exercises/${ex.id}" data-edit>Edit card</a><button class="icon-btn" data-close aria-label="Close">×</button></div>
    <div class="ex-sheet-body">${cardHtml(ex, opts)}</div>`.value;
  document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]') || t === dlg || t.closest('[data-edit]')) dlg.close();
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

/**
 * Any element with data-card="<exercise id>" opens that exercise's card. Optional data-flags
 * (joined with |) and data-who add intake reasons for the client it's shown to.
 */
export function bindCardTaps() {
  document.addEventListener('click', async (e) => {
    const el = (e.target as HTMLElement).closest('[data-card]') as HTMLElement | null;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const ex = (await db.exercises()).get(el.dataset.card!);
    if (!ex) return;
    showCard(ex, { flags: el.dataset.flags ? el.dataset.flags.split('|') : undefined, who: el.dataset.who });
  }, true);
}

/** A name that opens its card when tapped. */
export function cardLink(ex: Exercise, label: Raw | string = ex.name, opts: { flags?: string[]; who?: string; cls?: string } = {}): Raw {
  return html`<button type="button" class="card-link ${opts.cls || ''}" data-card="${ex.id}" ${opts.flags?.length ? raw(`data-flags="${esc(opts.flags.join('|'))}"`) : ''} ${opts.who ? raw(`data-who="${esc(opts.who)}"`) : ''}>${label}</button>`;
}
