// Lightweight SVG line charts, drawn at the container's real pixel width so text stays legible on a phone.
import { esc, fmtNum, fmtShort, html, parseDate, Raw } from './util.js';

export interface Pt { date: string; y: number }
export interface Series { label: string; points: Pt[]; style: 'primary' | 'secondary' }
export interface ChartSpec {
  title: string;
  unit: string;
  series: Series[];
  ref?: { y: number; label: string };
  digits?: number;
  height?: number;
}

/** Placeholder markup; call hydrateCharts(root) after inserting it. */
export function chart(spec: ChartSpec): Raw {
  const pts = spec.series.flatMap((s) => s.points);
  if (!pts.length) return html`<div class="chart-empty">No data yet</div>`;
  const dates = Array.from(new Set(pts.map((p) => p.date))).sort();
  const val = (s: Series, d: string) => s.points.find((p) => p.date === d)?.y;
  return html`
    <figure class="chart">
      <div class="chart-plot" data-chart="${JSON.stringify(spec)}" role="img" aria-label="${spec.title} chart"></div>
      <details class="chart-table">
        <summary>Show as table</summary>
        <table>
          <thead><tr><th>Date</th>${spec.series.map((s) => html`<th>${s.label} (${spec.unit})</th>`)}</tr></thead>
          <tbody>${dates.map((d) => html`<tr><td>${fmtShort(d)}</td>${spec.series.map((s) => html`<td>${fmtNum(val(s, d), spec.digits ?? 1)}</td>`)}</tr>`)}</tbody>
        </table>
      </details>
    </figure>`;
}

function niceStep(range: number, target: number) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return step * mag;
}

function draw(el: HTMLElement) {
  const spec: ChartSpec = JSON.parse(el.dataset.chart!);
  const W = Math.max(260, el.clientWidth);
  const H = spec.height ?? 200;
  const pad = { l: 44, r: 16, t: 14, b: 26 };
  const all = spec.series.flatMap((s) => s.points);
  const ys = all.map((p) => p.y).concat(spec.ref ? [spec.ref.y] : []);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (lo === hi) hi = lo + step;
  const ts = all.map((p) => parseDate(p.date).getTime());
  let t0 = Math.min(...ts), t1 = Math.max(...ts);
  if (t0 === t1) { t0 -= 86400000 * 3; t1 += 86400000 * 3; }
  const x = (d: string) => pad.l + ((parseDate(d).getTime() - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const digits = spec.digits ?? 1;

  let grid = '';
  for (let v = lo; v <= hi + step / 2; v += step) {
    grid += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    grid += `<text class="axis" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(fmtNum(v, step < 1 ? 1 : 0))}</text>`;
  }
  // three date labels: first, middle, last
  const dates = Array.from(new Set(all.map((p) => p.date))).sort();
  const labelDates = dates.length <= 2 ? dates : [dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]];
  let xaxis = '';
  labelDates.forEach((d, i) => {
    const anchor = labelDates.length > 1 && i === labelDates.length - 1 ? 'end' : i === 0 ? 'start' : 'middle';
    xaxis += `<text class="axis" x="${x(d)}" y="${H - 6}" text-anchor="${anchor}">${esc(fmtShort(d))}</text>`;
  });

  let ref = '';
  if (spec.ref) {
    ref = `<line class="ref" x1="${pad.l}" x2="${W - pad.r}" y1="${y(spec.ref.y)}" y2="${y(spec.ref.y)}"/>
      <text class="ref-label" x="${W - pad.r}" y="${y(spec.ref.y) - 6}" text-anchor="end">${esc(spec.ref.label)} ${esc(fmtNum(spec.ref.y, digits))}</text>`;
  }

  let lines = '';
  for (const s of spec.series) {
    const p = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
    if (!p.length) continue;
    const d = p.map((q, i) => `${i ? 'L' : 'M'}${x(q.date).toFixed(1)},${y(q.y).toFixed(1)}`).join(' ');
    lines += `<path class="line ${s.style}" d="${d}"/>`;
    if (s.style === 'primary' && p.length <= 30) lines += p.map((q) => `<circle class="dot" cx="${x(q.date)}" cy="${y(q.y)}" r="4"/>`).join('');
    const last = p[p.length - 1];
    if (s.style === 'primary') {
      lines += `<text class="end-label" x="${Math.min(x(last.date), W - pad.r)}" y="${y(last.y) - 10}" text-anchor="end">${esc(fmtNum(last.y, digits))}</text>`;
    }
  }

  el.innerHTML = `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      ${grid}${xaxis}${ref}${lines}
      <line class="cross" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>
      <circle class="cross-dot" r="5" visibility="hidden"/>
    </svg>
    <div class="tip" hidden></div>`;
  if (spec.series.length > 1) {
    el.insertAdjacentHTML('afterbegin', `<div class="legend">${spec.series.map((s) => `<span class="key ${s.style}"><i></i>${esc(s.label)}</span>`).join('')}</div>`);
  }

  const svg = el.querySelector('svg')!;
  const cross = svg.querySelector('.cross') as SVGLineElement;
  const crossDot = svg.querySelector('.cross-dot') as SVGCircleElement;
  const tip = el.querySelector('.tip') as HTMLElement;
  const primary = spec.series[0];
  const move = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const px = ev.clientX - r.left;
    let best = dates[0], bd = Infinity;
    for (const d of dates) { const dd = Math.abs(x(d) - px); if (dd < bd) { bd = dd; best = d; } }
    const cx = x(best);
    cross.setAttribute('x1', String(cx)); cross.setAttribute('x2', String(cx));
    cross.setAttribute('visibility', 'visible');
    const pv = primary.points.find((p) => p.date === best);
    if (pv) { crossDot.setAttribute('cx', String(cx)); crossDot.setAttribute('cy', String(y(pv.y))); crossDot.setAttribute('visibility', 'visible'); }
    else crossDot.setAttribute('visibility', 'hidden');
    const rows = spec.series.map((s) => {
      const v = s.points.find((p) => p.date === best);
      return v ? `<div><span>${esc(s.label)}</span><b>${esc(fmtNum(v.y, digits))} ${esc(spec.unit)}</b></div>` : '';
    }).join('');
    tip.innerHTML = `<div class="tip-date">${esc(fmtShort(best))}</div>${rows}`;
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(cx - tw / 2, 0), W - tw)}px`;
  };
  const leave = () => { cross.setAttribute('visibility', 'hidden'); crossDot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', leave);
}

let ro: ResizeObserver | null = null;
export function hydrateCharts(root: ParentNode) {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-chart]'));
  els.forEach(draw);
  if (!ro && 'ResizeObserver' in window) {
    const widths = new WeakMap<Element, number>();
    ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.round(e.contentRect.width);
        if (widths.get(e.target) !== w) { widths.set(e.target, w); draw(e.target as HTMLElement); }
      }
    });
  }
  els.forEach((el) => ro?.observe(el));
}
