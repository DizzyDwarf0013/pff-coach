// Personal-training planning: what each workout focused on, which focus is due next,
// progressing the numbers, and generating a fresh routine. Pure functions so they can be tested.
import type { Exercise, Session, SetEntry, SessionItem } from './types.js';
import { filled, flagsFor, type ClientGuidance } from './logic.js';
import { daysBetween, fmtNum, parseDate } from './util.js';
import { liftInGoals, namedInGoals, type GoalProfile } from './goals.js';

// ---- muscle groups (worked out from the exercise name and category) ----

export type Group = 'push' | 'shoulders' | 'pull' | 'quads' | 'posterior' | 'core' | 'cardio' | 'mobility';

export const GROUP_LABEL: Record<Group, string> = {
  push: 'Chest & triceps', shoulders: 'Shoulders', pull: 'Back & biceps', quads: 'Quads',
  posterior: 'Glutes & hamstrings', core: 'Core', cardio: 'Cardio', mobility: 'Mobility',
};

/** Whole-word match, so "chin" doesn't match "machine" (a trailing s is allowed: rows, curls). */
const has = (n: string, ...words: string[]) => words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[-]/g, '[- ]?')}s?($|[^a-z])`).test(n));

export function muscleGroup(ex: Pick<Exercise, 'name' | 'category'>): Group {
  const n = ex.name.toLowerCase();
  if (ex.category === 'Core') return 'core';
  if (ex.category === 'Cardio') return 'cardio';
  if (ex.category === 'Mobility') return 'mobility';
  if (ex.category === 'Lower body') {
    if (has(n, 'deadlift', 'hip thrust', 'bridge', 'glute', 'leg curl', 'abduction', 'adduction', 'kickback', 'clamshell', 'band walk', 'laterals', 'donkey', 'fire hydrant', 'swing', 'back extension', 'calf', 'march', 'hamstring')) return 'posterior';
    return 'quads';
  }
  // Upper body
  if (has(n, 'rear delt', 'row', 'pulldown', 'pull-apart', 'pull apart', 'face pull', 'pull-up', 'pullup', 'chin-up', 'curl', 'rope pull')) return 'pull';
  if (has(n, 'shoulder', 'overhead press', 'military', 'lateral raise', 'delt', 'high pull', 'landmine', 'front raise', 'arnold')) return 'shoulders';
  return 'push';
}

// ---- what a workout focused on ----

export type FocusKey = 'upper' | 'push' | 'pull' | 'lower' | 'glutes' | 'core' | 'full';
export const FOCUS_LABEL: Record<FocusKey, string> = {
  upper: 'Upper body', push: 'Chest & shoulders', pull: 'Back & arms', lower: 'Lower body', glutes: 'Glutes & hamstrings', core: 'Core', full: 'Full body',
};

export function focusOf(groups: Group[]): FocusKey {
  const main = groups.filter((g) => g !== 'cardio' && g !== 'mobility');
  const total = main.length || 1;
  const c = (...gs: Group[]) => main.filter((g) => gs.includes(g)).length;
  const upper = c('push', 'shoulders', 'pull');
  const lower = c('quads', 'posterior');
  if (upper / total >= 0.7) {
    if (c('push', 'shoulders') / upper >= 0.8) return 'push';
    if (c('pull') / upper >= 0.8) return 'pull';
    return 'upper';
  }
  if (lower / total >= 0.7) return c('posterior') / lower >= 0.8 ? 'glutes' : 'lower';
  if (c('core') / total >= 0.6) return 'core';
  return 'full';
}

/** Broad family used for rotation: chest days and back days are both upper-body days. */
export type Family = 'upper' | 'lower' | 'core' | 'full';
export const FAMILY_LABEL: Record<Family, string> = { upper: 'upper body', lower: 'lower body', core: 'core', full: 'full body' };
export const familyOf = (f: FocusKey): Family => (f === 'push' || f === 'pull' || f === 'upper' ? 'upper' : f === 'lower' || f === 'glutes' ? 'lower' : f);

export function sessionGroups(s: Session, exMap: Map<string, Exercise>): Group[] {
  return s.items.map((it) => exMap.get(it.exerciseId)).filter(Boolean).map((e) => muscleGroup(e!));
}
export const sessionFocus = (s: Session, exMap: Map<string, Exercise>) => focusOf(sessionGroups(s, exMap));

/** Her own completed workouts (not group classes), newest first. */
export function pastWorkouts(sessions: Session[]): Session[] {
  return sessions.filter((s) => !s.classId && s.status === 'complete' && s.items.length)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

// ---- which workout is due ----

export interface Suggestion {
  /** the template's own focus (e.g. Back & arms), used as the generator's default */
  focus: FocusKey;
  family: Family;
  template: Session;
  reasons: string[];
}

const weekday = (iso: string) => parseDate(iso).toLocaleDateString(undefined, { weekday: 'long' });

/**
 * Picks what's due, from how she rotates (the kind of day done least recently among the ones she
 * repeats: upper, lower, full body, core) and her weekly schedule (a kind she nearly always does on
 * this weekday wins). The template is her most recent workout of that kind. If she always trains the
 * same kind, it's the one before last, since routines often alternate.
 */
export function suggestNext(sessions: Session[], exMap: Map<string, Exercise>, onDate: string): Suggestion | undefined {
  const done = pastWorkouts(sessions).filter((s) => s.date <= onDate).slice(0, 12);
  if (!done.length) return undefined;
  const fam = done.map((s) => familyOf(sessionFocus(s, exMap)));
  const recent = fam.slice(0, 8);
  const counts = new Map<Family, number>();
  recent.forEach((f) => counts.set(f, (counts.get(f) || 0) + 1));
  let rotation = Array.from(counts.keys()).filter((f) => counts.get(f)! >= 2);
  if (!rotation.length) rotation = [recent[0]];
  const lastIdx = (f: Family) => fam.indexOf(f);
  const reasons: string[] = [];
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

  // weekly schedule
  const wd = parseDate(onDate).getDay();
  let pick: Family | undefined;
  if (rotation.length > 1) {
    for (const f of rotation) {
      const on = done.filter((s, i) => fam[i] === f);
      const sameDay = on.filter((s) => parseDate(s.date).getDay() === wd).length;
      if (on.length >= 3 && sameDay / on.length >= 0.7) { pick = f; reasons.push(`${cap(FAMILY_LABEL[f])} is usually her ${weekday(onDate)} workout.`); break; }
    }
  }
  // rotation: the one done least recently
  if (!pick) {
    pick = [...rotation].sort((a, b) => lastIdx(b) - lastIdx(a))[0];
    if (rotation.length > 1) {
      const since = fam.slice(0, lastIdx(pick)).filter((f, i, arr) => arr.indexOf(f) === i).map((f) => FAMILY_LABEL[f]);
      reasons.push(`She rotates ${rotation.map((f) => FAMILY_LABEL[f]).join(' and ')} days. ${cap(FAMILY_LABEL[pick])} was last on ${fmtDay(done[lastIdx(pick)].date)}${since.length ? `, with ${since.join(' and ')} since` : ''}.`);
    }
  }
  const same = done.filter((s, i) => fam[i] === pick);
  let template = same[0];
  if (rotation.length === 1 && same.length >= 2 && same[0] === done[0]) {
    template = same[1];
    reasons.push(`She mostly trains ${FAMILY_LABEL[pick]}, so this is her routine from ${fmtDay(template.date)}, which alternates with her last one.`);
  } else if (template) {
    reasons.push(`Built from her workout on ${fmtDay(template.date)}, including any changes made that day.`);
  }
  return template ? { focus: sessionFocus(template, exMap), family: pick, template, reasons } : undefined;
}

const fmtDay = (iso: string) => parseDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// ---- progression ----

export interface Progressed { sets: SetEntry[]; bumped?: { from: number; to: number } }

/**
 * Copies last time's sets; if every set reached the goal's rep number (12 by default) with a weight,
 * adds a small load and resets reps. Goals that hold the load (maintain, pregnancy) never add weight.
 */
export function progressSets(last: SetEntry[], ex: Exercise, goal?: GoalProfile): Progressed {
  const sets = last.filter(filled).map((s) => ({ ...s }));
  const bumpAt = goal ? goal.bumpAt : 12;
  const resetTo = goal ? goal.resetTo : 10;
  if (ex.measure !== 'weight_reps' || !sets.length || bumpAt === null) return { sets };
  if (!sets.every((s) => (s.reps || 0) >= bumpAt && s.weight)) return { sets };
  const top = Math.max(...sets.map((s) => s.weight || 0));
  const inc = top >= 40 ? 5 : 2.5;
  return { sets: sets.map((s) => ({ ...s, weight: (s.weight || 0) + inc, reps: resetTo })), bumped: { from: top, to: top + inc } };
}

/** Starting sets for an exercise she hasn't done: three sets at her goal's rep target. */
export function freshSets(ex: Exercise, goal?: GoalProfile): SetEntry[] {
  if (!goal || ex.measure === 'time') return [{}, {}, {}];
  return [0, 1, 2].map(() => ({ reps: goal.repTarget }));
}

/** The most recent sets she did for an exercise, if any. */
export function lastSets(sessions: Session[], exerciseId: string): { sets: SetEntry[]; date: string; notes?: string } | undefined {
  for (const s of pastWorkouts(sessions)) {
    const it = s.items.find((i) => i.exerciseId === exerciseId && i.sets.some(filled));
    if (it) return { sets: it.sets, date: s.date, notes: it.notes };
  }
  return undefined;
}

// ---- building a plan ----

export interface PlanItem {
  exerciseId: string;
  sets: SetEntry[];
  group: Group;
  why: string;
  bumped?: { from: number; to: number };
  flags: string[];
}

/** A suggested workout: the template's exercises with her latest numbers, progressed where earned. */
export function planFromTemplate(template: Session, sessions: Session[], exMap: Map<string, Exercise>, g: ClientGuidance, goal?: GoalProfile): PlanItem[] {
  return template.items.filter((it) => exMap.has(it.exerciseId)).map((it) => {
    const ex = exMap.get(it.exerciseId)!;
    const last = lastSets(sessions, ex.id);
    const p = last ? progressSets(last.sets, ex, goal) : { sets: it.sets.filter(filled).map((s) => ({ ...s })) };
    const sets = p.sets.length ? p.sets : [{}, {}, {}];
    return { exerciseId: ex.id, sets, group: muscleGroup(ex), why: p.bumped ? 'Ready for more weight' : '', bumped: p.bumped, flags: flagsFor(ex, g) };
  });
}

export interface GenerateInput {
  sessions: Session[];
  exMap: Map<string, Exercise>;
  guidance: ClientGuidance;
  focus: FocusKey;
  /** how many exercises; defaults to her usual */
  count?: number;
  seed: number;
  /** exercises to leave out (e.g. ones she just swapped away) */
  exclude?: string[];
  /** exercises from the mix on screen, nudged down so Shuffle shows something different */
  avoid?: string[];
  maternal?: boolean;
  goal?: GoalProfile;
  todayIso: string;
}

export interface Generated { items: PlanItem[]; skippedFlagged: number; avoided: string[]; template?: Session }

const DEFAULT_SLOTS: Record<FocusKey, Group[]> = {
  full: ['quads', 'pull', 'posterior', 'push', 'shoulders', 'core'],
  upper: ['push', 'pull', 'shoulders', 'pull', 'push', 'core'],
  push: ['push', 'shoulders', 'push', 'shoulders', 'push'],
  pull: ['pull', 'pull', 'pull', 'pull', 'core'],
  lower: ['quads', 'posterior', 'quads', 'posterior', 'posterior', 'core'],
  glutes: ['posterior', 'posterior', 'quads', 'posterior', 'posterior'],
  core: ['core', 'core', 'core', 'core', 'core'],
};

/** Small seeded random number generator, so Shuffle gives a new mix and the same seed gives the same mix. */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/**
 * A fresh routine for a focus: keeps her one or two staple lifts for that focus so progression carries
 * on, and fills the rest of the slots (shaped like her recent workouts of that focus) with exercises
 * she hasn't done lately or hasn't tried, skipping anything flagged by her intake and recent least favorites.
 */
export function generateWorkout(inp: GenerateInput): Generated {
  const { sessions, exMap, guidance, focus } = inp;
  const rand = rng(inp.seed);
  const done = pastWorkouts(sessions);
  const sameFocus = done.filter((s) => sessionFocus(s, exMap) === focus);
  const template = sameFocus[0];
  let slots = template ? sessionGroups(template, exMap) : DEFAULT_SLOTS[focus];
  const usual = median(done.slice(0, 8).map((s) => s.items.length)) || slots.length;
  const want = Math.max(3, Math.min(10, inp.count || (template ? slots.length : usual)));
  while (slots.length < want) slots = slots.concat(DEFAULT_SLOTS[focus][slots.length % DEFAULT_SLOTS[focus].length]);
  slots = slots.slice(0, want);
  const goal = inp.goal;
  // Goal blocks: a core and pelvic floor block, and a cardio finisher. Added on top of her usual
  // count unless the count was set by hand, in which case they take the last spots.
  const block = (g: Group) => {
    if (slots.includes(g) || focus === 'core') return;
    if (inp.count) slots[slots.length - 1] = g; else slots.push(g);
  };
  if (goal?.coreBlock) block('core');
  if (goal?.finisher) block('cardio');

  const avoided = new Set<string>();
  done.slice(0, 6).forEach((s) => { if (s.post.leastFavorite) avoided.add(s.post.leastFavorite); });
  const favorites = new Set(done.slice(0, 10).map((s) => s.post.favorite).filter(Boolean) as string[]);
  const exclude = new Set(inp.exclude || []);
  const shown = new Set(inp.avoid || []);
  const recentSame = new Set(sameFocus.slice(0, 2).flatMap((s) => s.items.map((i) => i.exerciseId)));
  const lastDone = new Map<string, string>();
  const timesDone = new Map<string, number>();
  for (const s of done) for (const it of s.items) {
    if (!it.sets.some(filled)) continue;
    if (!lastDone.has(it.exerciseId)) lastDone.set(it.exerciseId, s.date);
    timesDone.set(it.exerciseId, (timesDone.get(it.exerciseId) || 0) + 1);
  }
  let skippedFlagged = 0;
  const allowed = (e: Exercise) => {
    if (exclude.has(e.id) || avoided.has(e.id)) return false;
    if (flagsFor(e, guidance).length) { skippedFlagged++; return false; }
    return true;
  };
  const chosen: PlanItem[] = [];
  const used = new Set<string>();
  const itemFor = (e: Exercise, why: string): PlanItem => {
    const last = lastSets(sessions, e.id);
    const p = last ? progressSets(last.sets, e, goal) : { sets: [] as SetEntry[] };
    return { exerciseId: e.id, sets: p.sets.length ? p.sets : freshSets(e, goal), group: muscleGroup(e), why, bumped: p.bumped, flags: [] };
  };

  // 1. staples: done in at least 3 of her last 6 workouts of this focus
  const staples = new Map<string, number>();
  sameFocus.slice(0, 6).forEach((s) => new Set(s.items.map((i) => i.exerciseId)).forEach((id) => staples.set(id, (staples.get(id) || 0) + 1)));
  const keep = Array.from(staples.entries()).filter(([id, n]) => n >= 3 && exMap.has(id)).sort((a, b) => b[1] - a[1]).map(([id]) => exMap.get(id)!)
    .filter((e) => !exclude.has(e.id) && !avoided.has(e.id) && !flagsFor(e, guidance).length).slice(0, 2);
  for (const e of keep) {
    const i = slots.indexOf(muscleGroup(e));
    if (i < 0) continue;
    slots.splice(i, 1);
    used.add(e.id);
    chosen.push(itemFor(e, 'Her staple, kept so progress carries on'));
  }

  // 1b. a lift she named in her goals, if today's layout has room for it
  if (goal?.lifts.length) {
    const named = Array.from(exMap.values())
      .filter((e) => liftInGoals(e.name, goal) && !used.has(e.id) && slots.includes(muscleGroup(e)) && !exclude.has(e.id) && !avoided.has(e.id) && !flagsFor(e, guidance).length)
      .sort((a, b) => (timesDone.get(b.id) || 0) - (timesDone.get(a.id) || 0) || Number(!!b.custom) - Number(!!a.custom))[0];
    if (named && !chosen.some((c) => liftInGoals(exMap.get(c.exerciseId)!.name, goal))) {
      slots.splice(slots.indexOf(muscleGroup(named)), 1);
      used.add(named.id);
      chosen.push(itemFor(named, 'For her goal'));
    }
  }

  // 2. fill the rest of the slots
  const all = Array.from(exMap.values());
  for (const g of slots) {
    let pool = all.filter((e) => muscleGroup(e) === g && !used.has(e.id) && allowed(e));
    if (!pool.length) pool = all.filter((e) => !used.has(e.id) && allowed(e) && muscleGroup(e) !== 'mobility' && muscleGroup(e) !== 'cardio');
    if (!pool.length) continue;
    const scored = pool.map((e) => {
      const last = lastDone.get(e.id);
      const days = last ? daysBetween(last, inp.todayIso) : undefined;
      let s = 0;
      if (recentSame.has(e.id)) s -= 5;                      // in her last two workouts like this
      if (shown.has(e.id)) s -= 4;                           // already on screen before Shuffle
      if (last) s += 2 + Math.min(days! / 14, 3);           // familiar, more so the longer it's been
      else s += 1;                                           // new for her
      if (favorites.has(e.id)) s += 1;
      if (inp.maternal && e.tags.includes('prenatal-friendly')) s += 1;
      if (e.custom) s += 0.5;                                // her own exercises fit her gym
      if (goal) {
        if (goal.tags.some((t) => e.tags.includes(t))) s += 1.5;
        if (goal.preferLoaded) s += e.measure === 'weight_reps' ? 1.5 : -1.5;
        if (goal.groups.includes(g)) s += 0.5;
        if (namedInGoals(e.name, goal)) s += 3;
      }
      if (g === 'cardio' && e.tags.includes('high-impact')) s -= 2; // low-impact finishers unless she already does these
      return { e, s: s + rand() * 2.5, days };
    }).sort((a, b) => b.s - a.s);
    const { e, days } = scored[0];
    used.add(e.id);
    const goalWhy = goal && g === 'cardio' && goal.finisher ? 'Finisher for her goal' : goal && g === 'core' && goal.coreBlock ? 'Core & pelvic floor' : '';
    chosen.push(itemFor(e, goalWhy || (days === undefined ? 'New for her' : days >= 21 ? `Back after ${Math.round(days / 7)} weeks` : 'A change from last time')));
  }
  // keep her usual order: big lower-body and pushing/pulling first, core last
  const order: Group[] = ['quads', 'posterior', 'push', 'pull', 'shoulders', 'core', 'cardio', 'mobility'];
  chosen.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  return { items: chosen, skippedFlagged, avoided: Array.from(avoided), template };
}

/** A plan entry for one exercise: her latest numbers (progressed where earned), or goal-based starting sets. */
export function planItem(e: Exercise, sessions: Session[], why: string, goal?: GoalProfile): PlanItem {
  const last = lastSets(sessions, e.id);
  const p = last ? progressSets(last.sets, e, goal) : { sets: [] as SetEntry[] };
  return { exerciseId: e.id, sets: p.sets.length ? p.sets : freshSets(e, goal), group: muscleGroup(e), why, bumped: p.bumped, flags: [] };
}

export interface SwapOption {
  ex: Exercise;
  /** works the same muscle group as the exercise being swapped */
  similar: boolean;
  /** intake reasons to review (shown, not hidden: she's the trainer and decides) */
  flags: string[];
  last?: { sets: SetEntry[]; date: string };
  timesDone: number;
  /** shared movement words and equipment with the exercise being swapped */
  close: number;
}

/**
 * Everything she could swap to, best first: same muscle group before the rest, then exercises her
 * intake doesn't flag, then the closest movement (a deadlift for a deadlift), then ones she has done
 * (most often first, so her numbers are known), then alphabetical. Exercises already in the workout are left out.
 */
const GENERIC = new Set(['machine', 'dumbbell', 'dumbbells', 'cable', 'barbell', 'banded', 'band', 'seated', 'single', 'standing', 'plate', 'loaded', 'plate-loaded', 'with', 'arm', 'leg', 'side', 'lying']);
const keyWords = (name: string) => name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !GENERIC.has(w));
/** How alike two exercises are by name (shared movement words like "deadlift", "row", "press") and equipment. */
export function closeness(a: Exercise, b: Exercise): number {
  const mine = new Set(keyWords(a.name));
  const shared = keyWords(b.name).filter((w) => mine.has(w)).length;
  return shared + (a.equipment && a.equipment === b.equipment ? 0.5 : 0);
}

export function swapOptions(current: Exercise, exMap: Map<string, Exercise>, sessions: Session[], g: ClientGuidance, inWorkout: string[]): SwapOption[] {
  const group = muscleGroup(current);
  const skip = new Set([current.id, ...inWorkout]);
  const times = new Map<string, number>();
  for (const s of pastWorkouts(sessions)) for (const it of s.items) if (it.sets.some(filled)) times.set(it.exerciseId, (times.get(it.exerciseId) || 0) + 1);
  return Array.from(exMap.values()).filter((e) => !skip.has(e.id)).map((ex) => {
    const last = lastSets(sessions, ex.id);
    return { ex, similar: muscleGroup(ex) === group, flags: flagsFor(ex, g), last: last ? { sets: last.sets, date: last.date } : undefined, timesDone: times.get(ex.id) || 0, close: closeness(current, ex) };
  }).sort((a, b) => Number(b.similar) - Number(a.similar) || (a.flags.length ? 1 : 0) - (b.flags.length ? 1 : 0) || b.close - a.close || b.timesDone - a.timesDone || a.ex.name.localeCompare(b.ex.name));
}

export const toItems = (plan: PlanItem[]): SessionItem[] => plan.map((p) => ({ exerciseId: p.exerciseId, sets: p.sets.map((s) => ({ ...s })), notes: '' }));

export function setsSummary(sets: SetEntry[], ex: Exercise): string {
  const f = sets.filter(filled);
  const n = f.length || sets.length;
  const count = (unit?: string | number | null) => (unit ? `${n} × ${unit}` : `${n} ${n === 1 ? 'set' : 'sets'}`);
  if (!f.length) return count();
  if (ex.measure === 'weight_reps') {
    const w = Array.from(new Set(f.map((s) => s.weight || 0).filter((x) => x > 0)));
    if (!w.length) return count(f[0].reps); // no weight yet (a target, or bodyweight)
    const load = w.length === 1 ? `${fmtNum(w[0])} lb` : `${fmtNum(Math.min(...w))}–${fmtNum(Math.max(...w))} lb`;
    return `${count(f[0].reps)} @ ${load}`;
  }
  if (ex.measure === 'reps') return count(f[0].reps);
  return count(f[0].seconds ? `${f[0].seconds}s` : null);
}

/** Notes worth seeing before repeating a workout: her feedback, least favorite and your notes. */
export function notesFrom(s: Session, exMap: Map<string, Exercise>): string[] {
  const out: string[] = [];
  const trainer = (s.trainerNotes || '').split('\n').map((l) => l.trim()).filter((l) => l && !/^imported from notebook$/i.test(l));
  if (trainer.length) out.push(`Your notes: ${trainer.join(' ')}`);
  if (s.post.feedback) out.push(`She said: ${s.post.feedback}`);
  if (s.post.leastFavorite && exMap.get(s.post.leastFavorite)) out.push(`Least favorite: ${exMap.get(s.post.leastFavorite)!.name}`);
  const itemNotes = s.items.filter((i) => i.notes && exMap.has(i.exerciseId)).map((i) => `${exMap.get(i.exerciseId)!.name}: ${i.notes}`);
  out.push(...itemNotes);
  return out;
}
