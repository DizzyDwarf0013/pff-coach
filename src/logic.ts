// Coaching logic: intake-driven considerations, starting points, last-session lookups, progress math.
import type { Client, Exercise, Intake, Session, SetEntry } from './types.js';
import { daysBetween, e1rm, fmtNum, fmtSeconds, fmtShort, today } from './util.js';

export function emptyIntake(): Intake {
  return { jointAreas: [], goals: [], maternal: { status: 'none', pelvicFloor: [] } };
}

export interface Consideration {
  text: string;
  kind: 'review' | 'info';
}

export interface ClientGuidance {
  notes: Consideration[];
  /** tag → reason; exercises carrying the tag get flagged for this client */
  flags: Map<string, string>;
  level?: { name: string; detail: string };
  stage?: string;
}

export function pregnancyWeeks(dueDate?: string): number | undefined {
  if (!dueDate) return undefined;
  const daysLeft = daysBetween(today(), dueDate);
  return Math.max(0, Math.round((280 - daysLeft) / 7));
}
export function weeksPostpartum(deliveryDate?: string): number | undefined {
  if (!deliveryDate) return undefined;
  return Math.max(0, Math.floor(daysBetween(deliveryDate, today()) / 7));
}

export function stageLabel(c: Client): string | undefined {
  const m = c.intake.maternal;
  if (m.status === 'pregnant') {
    const w = pregnancyWeeks(m.dueDate);
    return w !== undefined ? `${w} weeks pregnant` : 'Pregnant';
  }
  if (m.status === 'postpartum') {
    const w = weeksPostpartum(m.deliveryDate);
    return w !== undefined ? `${w} weeks postpartum` : 'Postpartum';
  }
  return undefined;
}

/**
 * Turns the intake into review prompts and exercise flags. These are prompts for a certified
 * trainer to consider, not medical advice; her professional judgment and the client's provider decide.
 */
export function guidance(c: Client): ClientGuidance {
  const i = c.intake;
  const m = i.maternal;
  const notes: Consideration[] = [];
  const flags = new Map<string, string>();
  const flag = (tag: string, reason: string) => { if (!flags.has(tag)) flags.set(tag, reason); };

  if (m.status === 'pregnant') {
    const w = pregnancyWeeks(m.dueDate);
    if (w === undefined) notes.push({ kind: 'review', text: 'Add her due date so the app can track weeks of pregnancy.' });
    if (w === undefined || w >= 13) {
      flag('supine', 'After the first trimester, limit time lying flat on the back. Try an incline or side-lying option.');
      flag('prone', 'Lying face-down gets uncomfortable as the bump grows.');
      flag('core-flexion', 'Crunch-type flexion adds strain to the abdominal wall later in pregnancy.');
      flag('balance', 'Her balance point is shifting. Offer support for single-leg and unstable work.');
    }
    flag('high-impact', 'Check impact work against how she feels and her provider\'s guidance.');
    notes.push({ kind: 'info', text: 'Use the talk test to set intensity. She should be able to hold a conversation.' });
  }

  if (m.status === 'postpartum') {
    const w = weeksPostpartum(m.deliveryDate);
    if (w === undefined) notes.push({ kind: 'review', text: 'Add her delivery date so the app can track weeks postpartum.' });
    if (m.deliveryType === 'c-section') {
      notes.push({ kind: 'review', text: 'C-section delivery. Build core and lifting load gradually around the incision.' });
      if (w === undefined || w < 12) flag('core-pressure', 'Recent C-section. Progress abdominal pressure slowly.');
    }
    if (w !== undefined && w < 12) flag('high-impact', 'Under 12 weeks postpartum. Hold impact work until the core and pelvic floor are ready.');
  }

  if (m.status !== 'none' && m.clearance === 'no') {
    notes.push({ kind: 'review', text: 'She reported no medical clearance. Get clearance before progressing.' });
  } else if (m.status !== 'none' && m.clearance !== 'yes') {
    notes.push({ kind: 'review', text: 'No medical clearance on file. Confirm her provider has cleared her to exercise.' });
  }

  if (m.diastasis === 'yes' || m.diastasis === 'unsure') {
    notes.push({ kind: 'review', text: m.diastasis === 'yes' ? 'Diastasis recti reported.' : 'Possible diastasis recti. Worth a check.' });
    flag('core-flexion', 'Diastasis recti noted. Swap crunch-type flexion for breath-led core work.');
    flag('core-pressure', 'Watch for doming or coning along the midline and regress if it shows up.');
  }

  if (m.pelvicFloor.length) {
    notes.push({ kind: 'review', text: `Pelvic floor symptoms: ${m.pelvicFloor.join(', ').toLowerCase()}. Consider a pelvic floor PT referral.` });
    flag('high-impact', 'Pelvic floor symptoms noted. Hold impact work until symptoms settle.');
    flag('spinal-load', 'Heavy loads can aggravate pelvic floor symptoms. Cue the exhale on effort.');
  }

  for (const j of i.jointAreas) {
    if (j === 'Knees') flag('deep-knee', 'Knee concern noted. Control depth and range.');
    if (j === 'Lower back') flag('spinal-load', 'Lower back concern noted. Review spinal loading.');
    if (j === 'Shoulders') flag('overhead', 'Shoulder concern noted. Review overhead range.');
    if (j === 'Wrists') flag('wrist-load', 'Wrist concern noted. Try fists, handles or forearms.');
    if (j === 'Hips') flag('balance', 'Hip concern noted. Review single-leg work.');
  }
  if (i.jointAreas.length) notes.push({ kind: 'review', text: `Joint concerns: ${i.jointAreas.join(', ').toLowerCase()}.` });

  if (i.medical?.trim()) notes.push({ kind: 'review', text: `Medical notes: ${i.medical.trim()}` });

  if (i.eatingDisorderHistory === 'yes') {
    notes.push({ kind: 'review', text: 'Keep progress focused on strength, energy and consistency. Body weight is left off her reports unless you turn it on.' });
  }

  return { notes, flags, level: startingLevel(c), stage: stageLabel(c) };
}

export function startingLevel(c: Client): { name: string; detail: string } | undefined {
  const i = c.intake;
  if (i.daysPerWeek === undefined && !i.workoutIntensity && !i.activityLevel) return undefined;
  const intensity = { '': 0, light: 0, moderate: 1, intense: 2 }[i.workoutIntensity || ''] ?? 0;
  const activity = { '': 0, minimal: 0, occasional: 1, moderate: 2, intense: 3 }[i.activityLevel || ''] ?? 0;
  const score = (i.daysPerWeek || 0) + intensity + activity;
  const maternal = i.maternal.status !== 'none';
  if (score <= 2) return { name: 'Beginner', detail: `2 sets of 10–12 with bodyweight or a light load. Focus on form and breathing.${maternal ? ' Keep to the talk test.' : ''}` };
  if (score <= 6) return { name: 'Intermediate', detail: `3 sets of 8–12 at a moderate load, leaving 2–3 reps in reserve.${maternal ? ' Keep to the talk test.' : ''}` };
  return { name: 'Experienced', detail: `3–4 sets of 6–10 and progress the load week to week.${maternal ? ' Cap effort with the talk test.' : ''}` };
}

export function flagsFor(ex: Exercise, g: ClientGuidance): string[] {
  return ex.tags.filter((t) => g.flags.has(t)).map((t) => g.flags.get(t)!);
}

// ---- performance ----
export function setLabel(s: SetEntry, measure: Exercise['measure']): string {
  if (measure === 'time') return s.seconds ? fmtSeconds(s.seconds) : '–';
  if (measure === 'reps') return s.reps ? `${s.reps}` : '–';
  if (!s.reps && !s.weight) return '–';
  return `${s.weight ? fmtNum(s.weight) : 'BW'}×${s.reps ?? '–'}`;
}

/** The most recent previous session (not `excludeId`) in which this client did the exercise. */
export function lastPerformance(sessions: Session[], exerciseId: string, excludeId?: string, beforeDate?: string) {
  for (const s of sessions) {
    if (s.id === excludeId || s.status === 'planned') continue;
    if (beforeDate && s.date > beforeDate) continue;
    const item = s.items.find((it) => it.exerciseId === exerciseId && it.sets.some(filled));
    if (item) return { session: s, item };
  }
  return undefined;
}

export const filled = (s: SetEntry) => !!(s.reps || s.seconds || s.weight);

export function lastSummary(sessions: Session[], ex: Exercise, excludeId?: string, beforeDate?: string): string | undefined {
  const lp = lastPerformance(sessions, ex.id, excludeId, beforeDate);
  if (!lp) return undefined;
  return `${lp.item.sets.filter(filled).map((s) => setLabel(s, ex.measure)).join(', ')} · ${fmtShort(lp.session.date)}`;
}

/** A gentle progression nudge: if every set last time reached 12+ reps, suggest a small load increase. */
export function progressionHint(sessions: Session[], ex: Exercise, excludeId?: string): string | undefined {
  if (ex.measure !== 'weight_reps') return undefined;
  const lp = lastPerformance(sessions, ex.id, excludeId);
  if (!lp) return undefined;
  const sets = lp.item.sets.filter(filled);
  if (sets.length && sets.every((s) => (s.reps || 0) >= 12) && sets[0].weight) {
    const top = Math.max(...sets.map((s) => s.weight || 0));
    return `Hit 12+ on every set. Try ${fmtNum(top + (top >= 40 ? 5 : 2.5))} lb.`;
  }
  return undefined;
}

export interface ExercisePoint { date: string; top: number; e1rm?: number; volume: number }

/** One point per session: best set (weight, reps or seconds depending on the measure). */
export function exerciseSeries(sessions: Session[], ex: Exercise): ExercisePoint[] {
  const pts: ExercisePoint[] = [];
  for (const s of [...sessions].reverse()) {
    if (s.status === 'planned') continue;
    const sets = s.items.filter((i) => i.exerciseId === ex.id).flatMap((i) => i.sets).filter(filled);
    if (!sets.length) continue;
    if (ex.measure === 'weight_reps') {
      const top = Math.max(...sets.map((x) => x.weight || 0));
      const best = Math.max(...sets.map((x) => e1rm(x.weight, x.reps) || 0));
      const volume = sets.reduce((a, x) => a + (x.weight || 0) * (x.reps || 0), 0);
      pts.push({ date: s.date, top, e1rm: best || undefined, volume });
    } else if (ex.measure === 'reps') {
      pts.push({ date: s.date, top: Math.max(...sets.map((x) => x.reps || 0)), volume: sets.reduce((a, x) => a + (x.reps || 0), 0) });
    } else {
      pts.push({ date: s.date, top: Math.max(...sets.map((x) => x.seconds || 0)), volume: sets.reduce((a, x) => a + (x.seconds || 0), 0) });
    }
  }
  return pts;
}

export function exercisesUsed(sessions: Session[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    if (s.status === 'planned') continue;
    for (const it of s.items) if (it.sets.some(filled)) counts.set(it.exerciseId, (counts.get(it.exerciseId) || 0) + 1);
  }
  return counts;
}

export function measureUnit(ex: Exercise): string {
  return ex.measure === 'weight_reps' ? 'lb' : ex.measure === 'reps' ? 'reps' : 'sec';
}
