// Turning page readings into app records: merging pages, matching names, and saving.
import * as db from './db.js';
import type { ClassPlan, Client, Exercise, Intake, Measurement, Session, SetEntry } from './types.js';
import { emptyIntake } from './logic.js';
import { fullName, today, uid } from './util.js';

// ---- shape returned by the server for one page ----
export interface XSet { weight_lb: number | null; reps: number | null; seconds: number | null }
export interface XExercise { name: string; catalog_match: string | null; category: Exercise['category']; measure: Exercise['measure']; sets: XSet[]; notes: string | null }
export interface XSession { date: string | null; date_text: string | null; exercises: XExercise[]; body_weight_lb: number | null; muscle_pct: number | null; notes: string | null }
export interface XMeasurement { date: string | null; weight_lb: number | null; muscle_pct: number | null; body_fat_pct: number | null; waist_in: number | null; notes: string | null }
export interface XProfile {
  height_in: number | null; start_weight_lb: number | null; goal_weight_lb: number | null; muscle_pct: number | null; body_fat_pct: number | null;
  age: number | null; dob: string | null; pregnancy_status: 'pregnant' | 'postpartum' | 'none' | null; due_date: string | null; delivery_date: string | null;
  goals: string[]; medical: string | null; notes: string | null;
}
export interface XClient { name: string; email: string | null; phone: string | null; pink_fitness: boolean | null; profile: XProfile | null; sessions: XSession[]; measurements: XMeasurement[] }
export interface XClass { date: string | null; date_text: string | null; title: string | null; format: string | null; exercises: { name: string; catalog_match: string | null; detail: string | null }[]; notes: string | null }
export interface PageResult { page_kind: string; clients: XClient[]; classes: XClass[]; unclear: string[] }

// ---- the saved import draft ----
export interface DraftPage {
  id: string;
  label: string;
  status: 'pending' | 'done' | 'error';
  error?: string;
  image?: { media_type: string; data: string }; // kept until the page is read
  thumb?: string;
  result?: PageResult;
  usage?: { input_tokens: number; output_tokens: number };
  model?: string;
}
export interface ReviewChoices {
  clients: Record<string, { include?: boolean; name?: string; matchId?: string; pff?: boolean }>;
  sessions: Record<string, { include?: boolean; date?: string }>;
  classes: Record<string, { include?: boolean; date?: string }>;
  exercises?: Record<string, Exercise['category']>;
}
export interface ImportDraft {
  id: string;
  createdAt: string;
  model: 'sonnet' | 'haiku';
  yearHint: number | null;
  pages: DraftPage[];
  choices: ReviewChoices;
}

export const getDraft = () => db.getMeta<ImportDraft>('importDraft');
export const saveDraft = (d: ImportDraft) => db.setMeta('importDraft', d);
export const clearDraft = () => db.setMeta('importDraft', null);

export function newDraft(model: ImportDraft['model'], yearHint: number | null): ImportDraft {
  return { id: uid(), createdAt: new Date().toISOString(), model, yearHint, pages: [], choices: { clients: {}, sessions: {}, classes: {} } };
}

// ---- pricing (per million tokens) for the cost line ----
const PRICE: Record<string, [number, number]> = { sonnet: [2, 10], haiku: [0.1, 0.5] };
export const PER_PAGE_ESTIMATE: Record<string, string> = { sonnet: 'about 2–3¢ a page', haiku: 'well under 1¢ a page' };
export function costOf(pages: DraftPage[], model: string): number {
  const [i, o] = PRICE[model] || PRICE.sonnet;
  return pages.reduce((a, p) => a + (p.usage ? (p.usage.input_tokens * i + p.usage.output_tokens * o) / 1e6 : 0), 0);
}

// ---- matching ----
export const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  const firstName = parts.shift() || '';
  return { firstName: cap(firstName), lastName: parts.map(cap).join(' ') };
}
const titleCase = (s: string) => (s === s.toLowerCase() || s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : s);
const cap = (s: string) => (s && s === s.toLowerCase() ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Finds the existing client a written name most likely refers to, or undefined. */
export function matchClient(name: string, clients: Client[]): Client | undefined {
  const n = norm(name);
  if (!n) return undefined;
  const exact = clients.filter((c) => norm(fullName(c)) === n);
  if (exact.length === 1) return exact[0];
  const [first, ...rest] = n.split(' ');
  const last = rest.join(' ');
  const sameFirst = clients.filter((c) => norm(c.firstName) === first);
  if (!last) return sameFirst.length === 1 ? sameFirst[0] : undefined;
  // "Ann L" or "Ann L." matches Ann Lee; "Ann Lee" matches "Ann Lee-Smith"
  const byLast = sameFirst.filter((c) => { const cl = norm(c.lastName); return cl === last || cl.startsWith(last) || last.startsWith(cl) && cl.length > 0; });
  return byLast.length === 1 ? byLast[0] : undefined;
}

export function matchExercise(name: string, catalogMatch: string | null, exMap: Map<string, Exercise>): Exercise | undefined {
  const list = Array.from(exMap.values());
  const byName = (s: string) => { const n = norm(s); return list.find((e) => norm(e.name) === n) || list.find((e) => norm(e.name) === n.replace(/s$/, '')) || list.find((e) => norm(e.name) + 's' === n); };
  return (catalogMatch && byName(catalogMatch)) || byName(name);
}

// ---- review model: pages merged into one list of clients and classes ----
export interface ReviewSession { key: string; page: number; s: XSession; include: boolean; date: string; duplicate: boolean }
export interface ReviewMeasurement { page: number; m: XMeasurement }
export interface ReviewClient {
  key: string;
  writtenNames: string[];
  name: string;
  include: boolean;
  matchId: string; // '' = new client
  pff: boolean;
  email?: string; phone?: string;
  profile: XProfile | null;
  sessions: ReviewSession[];
  measurements: ReviewMeasurement[];
}
export interface ReviewClass { key: string; page: number; c: XClass; include: boolean; date: string }
export interface Review { clients: ReviewClient[]; classes: ReviewClass[]; newExercises: { key: string; name: string; category: Exercise['category']; measure: Exercise['measure'] }[]; unclear: { page: DraftPage; notes: string[] }[] }

function mergeProfile(a: XProfile | null, b: XProfile | null): XProfile | null {
  if (!a) return b;
  if (!b) return a;
  const out: any = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (k === 'goals') out.goals = Array.from(new Set([...(a.goals || []), ...((v as string[]) || [])]));
    else if ((k === 'medical' || k === 'notes') && v && a[k as 'medical'] && a[k as 'medical'] !== v) out[k] = `${a[k as 'medical']}; ${v}`;
    else if (out[k] === null || out[k] === undefined) out[k] = v;
  }
  return out;
}

export function buildReview(draft: ImportDraft, clients: Client[], sessionsByClient: Map<string, Session[]>, exMap: Map<string, Exercise>): Review {
  const ch = draft.choices;
  const byKey = new Map<string, ReviewClient>();
  const classes: ReviewClass[] = [];
  const unclear: Review['unclear'] = [];
  const newEx = new Map<string, Review['newExercises'][number]>();
  const noteExercise = (name: string, match: string | null, category: Exercise['category'] = 'Lower body', measure: Exercise['measure'] = 'weight_reps') => {
    if (!name.trim() || matchExercise(name, match, exMap)) return;
    const key = norm(name);
    if (!newEx.has(key)) newEx.set(key, { key, name: name.trim().charAt(0).toUpperCase() + name.trim().slice(1), category: ch.exercises?.[key] || category, measure });
  };

  draft.pages.forEach((p, pi) => {
    const r = p.result;
    if (!r) return;
    if (r.unclear?.length) unclear.push({ page: p, notes: r.unclear });
    (r.clients || []).forEach((xc, ci) => {
      if (!xc.name?.trim()) return;
      const match = matchClient(xc.name, clients);
      const key = match ? `id:${match.id}` : `name:${norm(xc.name)}`;
      let rc = byKey.get(key);
      if (!rc) {
        const c = ch.clients[key] || {};
        rc = {
          key, writtenNames: [], name: c.name ?? (match ? fullName(match) : titleCase(xc.name.trim())),
          include: c.include ?? true, matchId: c.matchId ?? (match?.id || ''),
          pff: c.pff ?? (xc.pink_fitness ?? true),
          profile: null, sessions: [], measurements: [],
        };
        byKey.set(key, rc);
      }
      if (!rc.writtenNames.includes(xc.name.trim())) rc.writtenNames.push(xc.name.trim());
      rc.email = rc.email || xc.email || undefined;
      rc.phone = rc.phone || xc.phone || undefined;
      rc.profile = mergeProfile(rc.profile, xc.profile);
      const existing = rc.matchId ? (sessionsByClient.get(rc.matchId) || []) : [];
      (xc.sessions || []).forEach((s, si) => {
        if (!s.exercises?.length && !s.body_weight_lb && !s.notes) return;
        const skey = `${pi}-${ci}-${si}`;
        const c = ch.sessions[skey] || {};
        const date = c.date ?? (s.date || '');
        const duplicate = !!date && existing.some((e) => e.date === date && e.status !== 'planned');
        rc!.sessions.push({ key: skey, page: pi, s, date, duplicate, include: c.include ?? (!!date && !duplicate) });
        s.exercises.forEach((e) => noteExercise(e.name, e.catalog_match, e.category, e.measure));
      });
      (xc.measurements || []).forEach((m) => { if (m.date && (m.weight_lb || m.muscle_pct || m.body_fat_pct || m.waist_in)) rc!.measurements.push({ page: pi, m }); });
    });
    (r.classes || []).forEach((xc, ci) => {
      const key = `${pi}-${ci}`;
      const c = ch.classes[key] || {};
      const date = c.date ?? (xc.date || '');
      classes.push({ key, page: pi, c: xc, date, include: c.include ?? !!date });
      xc.exercises.forEach((e) => noteExercise(e.name, e.catalog_match));
    });
  });

  const list = Array.from(byKey.values());
  list.forEach((c) => c.sessions.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')));
  list.sort((a, b) => a.name.localeCompare(b.name));
  classes.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  return { clients: list, classes, newExercises: Array.from(newEx.values()), unclear };
}

export function reviewCounts(r: Review) {
  const clients = r.clients.filter((c) => c.include);
  return {
    clients: clients.length,
    newClients: clients.filter((c) => !c.matchId).length,
    sessions: clients.reduce((a, c) => a + c.sessions.filter((s) => s.include && s.date).length, 0),
    measurements: clients.reduce((a, c) => a + c.measurements.length, 0),
    classes: r.classes.filter((c) => c.include && c.date).length,
  };
}

// ---- saving ----
const GOAL_WORDS: [RegExp, string][] = [
  [/lose|weight loss|fat loss|slim/i, 'Lose weight'], [/strength|stronger|strong/i, 'Gain strength'],
  [/general|overall|health|fitness/i, 'General fitness'], [/maintain/i, 'Maintain current'],
  [/prenatal|pregnan/i, 'Prenatal fitness'], [/postpartum|post-partum|after baby|core recovery|diastasis/i, 'Postpartum recovery'],
];

function applyProfile(intake: Intake, p: XProfile | null, onlyEmpty: boolean): { intake: Intake; extraNotes: string[] } {
  const extra: string[] = [];
  if (!p) return { intake, extraNotes: extra };
  const i: Intake = { ...intake, maternal: { ...intake.maternal, pelvicFloor: [...intake.maternal.pelvicFloor] }, goals: [...intake.goals], jointAreas: [...intake.jointAreas] };
  const set = <K extends keyof Intake>(k: K, v: Intake[K] | null | undefined) => {
    if (v === null || v === undefined || (v as any) === '') return;
    if (onlyEmpty && i[k] !== undefined && i[k] !== null && (i[k] as any) !== '') return;
    i[k] = v;
  };
  set('heightIn', p.height_in ?? undefined);
  set('startWeight', p.start_weight_lb ?? undefined);
  set('goalWeight', p.goal_weight_lb ?? undefined);
  set('musclePct', p.muscle_pct ?? undefined);
  set('bodyFatPct', p.body_fat_pct ?? undefined);
  if (p.medical) i.medical = i.medical && i.medical !== p.medical ? (i.medical.includes(p.medical) ? i.medical : `${i.medical}\n${p.medical}`) : p.medical;
  if (p.pregnancy_status && p.pregnancy_status !== 'none' && (!onlyEmpty || i.maternal.status === 'none')) {
    i.maternal.status = p.pregnancy_status;
    if (p.due_date) i.maternal.dueDate = p.due_date;
    if (p.delivery_date) i.maternal.deliveryDate = p.delivery_date;
  }
  const loose: string[] = [];
  for (const g of p.goals || []) {
    const hit = GOAL_WORDS.find(([re]) => re.test(g));
    if (hit && !i.goals.includes(hit[1])) i.goals.push(hit[1]);
    loose.push(g);
  }
  if (loose.length) {
    const text = loose.join('; ');
    i.specificGoals = i.specificGoals ? (i.specificGoals.includes(text) ? i.specificGoals : `${i.specificGoals}\n${text}`) : text;
  }
  if (p.age && !p.dob) extra.push(`Age ${p.age} when noted in her notebook.`);
  if (p.notes) extra.push(p.notes);
  return { intake: i, extraNotes: extra };
}

const toSet = (x: XSet, measure: Exercise['measure']): SetEntry =>
  measure === 'time' ? { seconds: x.seconds ?? null } : measure === 'reps' ? { reps: x.reps ?? null } : { weight: x.weight_lb ?? null, reps: x.reps ?? null };

export async function saveReview(r: Review) {
  const now = new Date().toISOString();
  const exMap = await db.exercises();
  // 1. new exercises
  const created = new Map<string, Exercise>();
  const used = new Set<string>();
  for (const c of r.clients.filter((c) => c.include)) for (const s of c.sessions.filter((s) => s.include && s.date)) for (const e of s.s.exercises) used.add(norm(e.name));
  for (const k of r.classes.filter((k) => k.include && k.date)) for (const e of k.c.exercises) used.add(norm(e.name));
  for (const ne of r.newExercises) {
    if (!used.has(ne.key)) continue;
    const ex: Exercise = { id: 'ex-' + uid(), name: ne.name, category: ne.category, equipment: '', measure: ne.measure, tags: [], custom: true };
    await db.saveExercise(ex);
    created.set(ne.key, ex);
  }
  const resolve = (name: string, match: string | null) => matchExercise(name, match, exMap) || created.get(norm(name));

  let clientsSaved = 0, sessionsSaved = 0, measuresSaved = 0, classesSaved = 0;
  // 2. clients, sessions, measurements
  for (const rc of r.clients) {
    if (!rc.include) continue;
    let client: Client | undefined = rc.matchId ? await db.getClient(rc.matchId) : undefined;
    if (client) {
      const { intake, extraNotes } = applyProfile(client.intake, rc.profile, true);
      client = { ...client, intake, email: client.email || rc.email || '', phone: client.phone || rc.phone || '', notes: [client.notes, ...extraNotes].filter(Boolean).join('\n'), updatedAt: now };
    } else {
      const { firstName, lastName } = splitName(rc.name);
      const base = { ...emptyIntake(), date: undefined as string | undefined };
      const { intake, extraNotes } = applyProfile(base, rc.profile, false);
      client = {
        id: uid(), firstName, lastName, email: rc.email || '', phone: rc.phone || '', dob: rc.profile?.dob || undefined,
        isPinkFitness: rc.pff, status: 'active', source: 'notebook', consent: { email: false, sms: false },
        intake, notes: extraNotes.join('\n'), createdAt: now, updatedAt: now,
      };
    }
    // Intake date and starting weight: earliest dated record, if the notebook didn't give one.
    const dates = rc.sessions.filter((s) => s.include && s.date).map((s) => s.date).concat(rc.measurements.map((m) => m.m.date!)).sort();
    if (!client.intake.date && dates[0]) client.intake.date = dates[0];
    await db.saveClient(client);
    clientsSaved++;
    if (client.intake.startWeight && !rc.matchId) {
      await db.put('measurements', { id: `intake-${client.id}`, clientId: client.id, date: client.intake.date || today(), weight: client.intake.startWeight, musclePct: client.intake.musclePct, bodyFatPct: client.intake.bodyFatPct, notes: 'Intake' });
    }
    for (const rs of rc.sessions) {
      if (!rs.include || !rs.date) continue;
      const items = rs.s.exercises.map((e) => {
        const ex = resolve(e.name, e.catalog_match);
        if (!ex) return null;
        const sets = (e.sets || []).map((x) => toSet(x, ex.measure));
        return { exerciseId: ex.id, sets: sets.length ? sets : [{}], notes: e.notes || '' };
      }).filter(Boolean) as Session['items'];
      const s: Session = {
        id: uid(), clientId: client.id, date: rs.date, status: 'complete', items,
        post: { weight: rs.s.body_weight_lb ?? undefined, musclePct: rs.s.muscle_pct ?? undefined },
        trainerNotes: [rs.s.notes, 'Imported from notebook'].filter(Boolean).join('\n'), createdAt: now, updatedAt: now,
      };
      await db.saveSession(s);
      sessionsSaved++;
      if (s.post.weight || s.post.musclePct) {
        await db.put('measurements', { id: `s-${s.id}`, clientId: client.id, date: s.date, weight: s.post.weight, musclePct: s.post.musclePct, sessionId: s.id });
      }
    }
    for (const rm of rc.measurements) {
      const m: Measurement = { id: uid(), clientId: client.id, date: rm.m.date!, weight: rm.m.weight_lb ?? undefined, musclePct: rm.m.muscle_pct ?? undefined, bodyFatPct: rm.m.body_fat_pct ?? undefined, waistIn: rm.m.waist_in ?? undefined, notes: rm.m.notes || 'From notebook' };
      await db.put('measurements', m);
      measuresSaved++;
    }
  }
  // 3. class plans
  for (const rk of r.classes) {
    if (!rk.include || !rk.date) continue;
    const plan: ClassPlan = {
      id: uid(), date: rk.date, title: rk.c.title || undefined, format: rk.c.format || undefined,
      exercises: rk.c.exercises.map((e) => ({ exerciseId: resolve(e.name, e.catalog_match)?.id, name: e.name, detail: e.detail || undefined })),
      notes: rk.c.notes || undefined, source: 'import', createdAt: now, updatedAt: now,
    };
    await db.put('classes', plan);
    classesSaved++;
  }
  return { clientsSaved, sessionsSaved, measuresSaved, classesSaved, exercisesAdded: created.size };
}
