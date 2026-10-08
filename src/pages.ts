// Turns picked files (photos or PDFs) into page images ready to send for reading.

export interface PreparedPage {
  label: string;
  image: { media_type: 'image/jpeg'; data: string };
  thumb: string;
}

const MAX_SIDE = 1568; // larger images are downscaled by the model anyway
export const MAX_PAGES = 60;

function canvasTo(canvas: HTMLCanvasElement, quality: number) {
  return canvas.toDataURL('image/jpeg', quality);
}

function drawScaled(src: CanvasImageSource, w: number, h: number, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function fromCanvas(c: HTMLCanvasElement, label: string): PreparedPage {
  const full = canvasTo(c, 0.85);
  const thumb = canvasTo(drawScaled(c, c.width, c.height, 360), 0.7);
  return { label, image: { media_type: 'image/jpeg', data: full.slice(full.indexOf(',') + 1) }, thumb };
}

async function loadImage(file: File): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void }> {
  try {
    const bmp = await createImageBitmap(file);
    return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
  } catch {
    // Safari can't always make a bitmap from HEIC; an <img> can decode it.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    try { await img.decode(); } catch { URL.revokeObjectURL(url); throw new Error(`Couldn't open ${file.name}. Try a JPEG or PNG.`); }
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  }
}

async function imagePage(file: File): Promise<PreparedPage> {
  const img = await loadImage(file);
  try { return fromCanvas(drawScaled(img.src, img.w, img.h, MAX_SIDE), file.name || 'Photo'); }
  finally { img.done(); }
}

let pdfjs: any = null;
async function loadPdfJs() {
  if (pdfjs) return pdfjs;
  const base = document.baseURI;
  const mod: any = await import(new URL('vendor/pdfjs/pdf.min.mjs', base).href);
  mod.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', base).href;
  pdfjs = mod;
  return mod;
}

async function* pdfPages(file: File, limit: number): AsyncGenerator<PreparedPage> {
  let lib: any;
  try { lib = await loadPdfJs(); } catch { throw new Error('The PDF reader didn\'t load. Check the connection and try again.'); }
  let doc: any;
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try { doc = await task.promise; }
  catch (e) { throw new Error((e as Error)?.name === 'PasswordException' ? `${file.name} is password-protected.` : `Couldn't open ${file.name} as a PDF.`); }
  try {
    const n = Math.min(doc.numPages, limit);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3, MAX_SIDE / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise;
      page.cleanup();
      yield fromCanvas(c, `${file.name}, page ${i}`);
    }
  } finally {
    try { await task.destroy(); } catch { /* already closed */ }
  }
}

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/** Prepares pages one by one, reporting progress. Stops at MAX_PAGES. */
export async function preparePages(files: File[], onPage: (p: PreparedPage, count: number) => void | Promise<void>): Promise<{ count: number; skipped: number; errors: string[] }> {
  let count = 0, skipped = 0;
  const errors: string[] = [];
  for (const f of files) {
    if (count >= MAX_PAGES) { skipped++; continue; }
    try {
      if (isPdf(f)) {
        for await (const p of pdfPages(f, MAX_PAGES - count)) { count++; await onPage(p, count); }
      } else if (f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(f.name)) {
        const p = await imagePage(f);
        count++;
        await onPage(p, count);
      } else {
        errors.push(`${f.name} isn't a photo or PDF.`);
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return { count, skipped, errors };
}
