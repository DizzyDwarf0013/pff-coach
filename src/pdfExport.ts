// PDFs made on the device. iPhone and iPad can't print from a Home Screen app, so on iOS the
// workout sheet and progress report are drawn into Letter pages (html2canvas, vendored), wrapped
// in a small PDF, and handed to the share sheet, where Print, Save to Files, Messages and Mail live.
import { downloadFile, esc, toast } from './util.js';

/** iPhone or iPad, including iPads that report themselves as a Mac. */
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Letter at 96 px per inch, half-inch margins.
const PAGE_W = 816, PAGE_H = 1056, MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2, CONTENT_H = PAGE_H - MARGIN * 2;
const SCALE = 2;

let loading: Promise<void> | null = null;
function loadRenderer(): Promise<void> {
  if ((window as any).html2canvas) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('vendor/html2canvas/html2canvas.min.js', document.baseURI).href;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error('The PDF maker could not load. Check the connection and try again.')); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Where to end each page: the latest element top (a table row, a card, a section) that still fits,
 * so pages break between rows and cards instead of through them. `forced` tops always start a page.
 */
export function pageBreaks(total: number, tops: number[], forced: number[], pageH = CONTENT_H): [number, number][] {
  const pages: [number, number][] = [];
  let start = 0;
  while (start < total - 2) {
    let end = Math.min(start + pageH, total);
    const f = forced.filter((y) => y > start + 20 && y < end).sort((a, b) => a - b)[0];
    if (f !== undefined) end = f;
    else if (end < total) {
      const fits = tops.filter((y) => y > start + pageH * 0.25 && y <= end);
      if (fits.length) end = Math.max(...fits);
    }
    pages.push([start, end]);
    start = end;
  }
  return pages;
}

/** A PDF of full-page JPEG images, one per page (Letter, 612 × 792 pt). */
export function jpegPdf(pages: Uint8Array[], imgW: number, imgH: number): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (p: Uint8Array | string) => { const b = typeof p === 'string' ? enc.encode(p) : p; parts.push(b); length += b.length; };
  const obj = (n: number, body: (string | Uint8Array)[]) => { offsets[n] = length; push(`${n} 0 obj\n`); body.forEach(push); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = pages.length;
  // 1 catalog, 2 page tree, then for page i: page 3+3i, contents 4+3i, image 5+3i
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, [`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] >>`]);
  pages.forEach((jpg, i) => {
    const p = 3 + 3 * i;
    obj(p, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im${i} ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`]);
    const content = `q 612 0 0 792 0 0 cm /Im${i} Do Q`;
    obj(p + 1, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    obj(p + 2, [`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, '\nendstream']);
  });
  const xref = length;
  const count = 3 + 3 * n;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

function jpegBytes(canvas: HTMLCanvasElement): Uint8Array {
  const b64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Draws a document element into Letter pages and returns the PDF. */
export async function docToPdf(doc: HTMLElement, onProgress?: (msg: string) => void): Promise<Blob> {
  onProgress?.('Getting ready…');
  await loadRenderer();
  const h2c = (window as any).html2canvas;
  // A full-width copy at page width, laid out like a desktop screen, behind a cover so it isn't seen.
  const cover = document.createElement('div');
  cover.className = 'pdf-cover';
  cover.innerHTML = '<div><b>Making the PDF…</b><span></span></div>';
  const stage = document.createElement('div');
  stage.className = 'pdf-stage';
  const copy = doc.cloneNode(true) as HTMLElement;
  copy.classList.remove('compact');
  copy.classList.add('pdf');
  copy.style.width = `${CONTENT_W}px`;
  stage.appendChild(copy);
  document.body.appendChild(stage);
  document.body.appendChild(cover);
  const say = (m: string) => { (cover.querySelector('span') as HTMLElement).textContent = m; onProgress?.(m); };
  try {
    try { await (document as any).fonts?.ready; } catch { /* fonts API missing */ }
    await Promise.all(Array.from(copy.querySelectorAll('img')).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
    const box = copy.getBoundingClientRect();
    const rel = (el: Element) => Math.round(el.getBoundingClientRect().top - box.top);
    const tops = Array.from(copy.querySelectorAll('tr, .ex-card, section, header, footer, .chart, .doc-stats, h2, .doc-note')).map(rel).filter((y) => y > 0);
    const forced = Array.from(copy.querySelectorAll('[data-page-break]')).map(rel);
    const total = Math.ceil(copy.scrollHeight);
    const pages = pageBreaks(total, tops, forced);
    const jpgs: Uint8Array[] = [];
    for (let i = 0; i < pages.length; i++) {
      say(`Page ${i + 1} of ${pages.length}`);
      const [y0, y1] = pages[i];
      const slice: HTMLCanvasElement = await h2c(copy, {
        scale: SCALE, backgroundColor: '#ffffff', logging: false, useCORS: true,
        x: box.left + window.scrollX, y: box.top + window.scrollY + y0, width: CONTENT_W, height: y1 - y0,
        windowWidth: 1100, windowHeight: Math.max(PAGE_H, total + 200), scrollX: 0, scrollY: 0,
      });
      const page = document.createElement('canvas');
      page.width = PAGE_W * SCALE;
      page.height = PAGE_H * SCALE;
      const ctx = page.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, page.width, page.height);
      ctx.drawImage(slice, MARGIN * SCALE, MARGIN * SCALE);
      if (pages.length > 1) {
        ctx.fillStyle = '#7A727C';
        ctx.font = `${11 * SCALE}px "Atkinson Hyperlegible", sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(`${i + 1} / ${pages.length}`, (PAGE_W - MARGIN) * SCALE, (PAGE_H - MARGIN / 2) * SCALE);
      }
      jpgs.push(jpegBytes(page));
    }
    return jpegPdf(jpgs, PAGE_W * SCALE, PAGE_H * SCALE);
  } finally {
    stage.remove();
    cover.remove();
  }
}

/**
 * Hands a PDF to the share sheet (Print, Save to Files, Messages, Mail). Sharing needs a fresh tap,
 * so this asks for one; without file sharing (older iOS), the PDF is downloaded or opened instead.
 */
export function deliverPdf(blob: Blob, filename: string, title: string): Promise<void> {
  const file = new File([blob], filename, { type: 'application/pdf' });
  const nav = navigator as any;
  const canShare = !!(nav.canShare && nav.share && nav.canShare({ files: [file] }));
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet confirm pdf-ready';
    dlg.innerHTML = `<form method="dialog">
        <h2>PDF ready</h2>
        <p>${esc(filename)} · ${Math.max(1, Math.round(blob.size / 1024))} KB</p>
        <p class="fineprint">${canShare ? 'Share opens the menu with Print, Save to Files, Messages and Mail.' : 'Opens the PDF. Use the share button there to print or save it.'}</p>
        <div class="row-end"><button value="no" class="btn ghost">Close</button><button value="yes" class="btn primary" data-go>${canShare ? 'Share, print or save' : 'Open PDF'}</button></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.querySelector('[data-go]')!.addEventListener('click', async (e) => {
      e.preventDefault();
      if (canShare) {
        try { await nav.share({ files: [file], title }); } catch { /* cancelled */ }
      } else {
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (!w) downloadFile(filename, blob);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(); });
    dlg.showModal();
  });
}

/** Print on computers; on iPhone and iPad, make a PDF and offer the share sheet. */
export async function printOrPdf(doc: HTMLElement, filename: string, title: string, button?: HTMLButtonElement) {
  if (!isIOS()) { window.print(); return; }
  const label = button?.textContent || '';
  if (button) { button.disabled = true; button.textContent = 'Making PDF…'; }
  try {
    const blob = await docToPdf(doc);
    await deliverPdf(blob, filename, title);
  } catch (e) {
    toast((e as Error).message || 'The PDF could not be made.');
  } finally {
    if (button) { button.disabled = false; button.textContent = label; }
  }
}
