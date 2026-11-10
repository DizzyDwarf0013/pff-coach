// Group class logic: finding similar past classes, move suggestions, attendee flags,
// and filing a class into each attendee's log. Pure functions (no storage) so they can be tested.
import type { ClassMove, ClassPlan, Client, Session, SessionItem } from './types.js';
import { guidance, stageLabel, type ClientGuidance } from './logic.js';
import { daysBetween } from './util.js';

export const norm = (s?: string) => (s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s?: string) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
const STOP = new Set(['and', 'the', 'class', 'with', 'for']);

/** Imported classes have no status; they were taught. */
export const isTaught = (p: ClassPlan) => p.status !== 'planned';

/** What to call a class in lists. */
export const className = (p: ClassPlan) => p.title || p.format || 'Group class';

/** Key that treats the same move as the same, whether or not it is linked to the catalog. */
export const moveKey = (m: ClassMove) => (m.exerciseId ? 'id:' + m.exerciseId : 'n:' + norm(m.name));

/** How alike a past class is to the one being planned, by name and type. 0 means unrelated. */
export function similarity(p: ClassPlan, q: { title?: string; format?: string }): number {
  let score = 0;
  const t = norm(q.title);
  const f = norm(q.format);
  if (t && norm(p.title) === t) score += 4;
  else if (t && p.title) {
    const mine = new Set(words(p.title));
    score += Math.min(2, words(q.title).filter((w) => mine.has(w)).length);
  }
  if (f && norm(p.format) === f) score += 3;
  else if (f && p.format) {
    const mine = new Set(words(p.format));
    if (words(q.format).some((w) => mine.has(w))) score += 1;
  }
  return score;
}

export interface Similar { plan: ClassPlan; score: number }

/** Past classes like this one, best match first, then newest. */
export function similarClasses(plans: ClassPlan[], q: { title?: string; format?: string }, excludeId?: string): Similar[] {
  return plans
    .filter((p) => p.id !== excludeId && p.exercises.length)
    .map((plan) => ({ plan, score: similarity(plan, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.plan.date.localeCompare(a.plan.date));
}

export interface MoveIdea {
  key: string;
  move: ClassMove;
  /** classes (of the ones looked at) that used it */
  count: number;
  of: number;
  lastDate: string;
  /** not used in the two most recent similar classes, so it's due for a comeback */
  fresh: boolean;
}

/**
 * Moves from similar past classes that aren't in the plan yet. Favorites that haven't been used
 * in the last couple of classes come first, so classes rotate instead of repeating.
 */
export function moveIdeas(similar: Similar[], current: ClassMove[], limit = 12): MoveIdea[] {
  const pool = similar.map((s) => s.plan).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  if (!pool.length) return [];
  const have = new Set(current.map(moveKey));
  const latest = new Set(pool[0].exercises.map(moveKey));
  const recent = new Set(pool.slice(0, 2).flatMap((p) => p.exercises.map(moveKey)));
  const agg = new Map<string, MoveIdea>();
  for (const p of pool) {
    const seen = new Set<string>();
    for (const m of p.exercises) {
      const k = moveKey(m);
      if (have.has(k) || seen.has(k)) continue;
      seen.add(k);
      const cur = agg.get(k);
      if (cur) cur.count++;
      else agg.set(k, { key: k, move: m, count: 1, of: pool.length, lastDate: p.date, fresh: !recent.has(k) });
    }
  }
  // Often used counts most; due for a comeback adds, in the very last class takes away.
  const rank = (x: MoveIdea) => x.count + (x.fresh ? 1.5 : 0) - (latest.has(x.key) ? 1 : 0);
  return Array.from(agg.values())
    .sort((a, b) => rank(b) - rank(a) || a.lastDate.localeCompare(b.lastDate))
    .slice(0, limit);
}

/** Moves in the plan that were also in the most recent similar class. */
export function repeatsFromLast(similar: Similar[], current: ClassMove[], beforeDate?: string): { plan: ClassPlan; names: string[] } | undefined {
  const last = similar.map((s) => s.plan).filter((p) => !beforeDate || p.date <= beforeDate).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last || !current.length) return undefined;
  const theirs = new Set(last.exercises.map(moveKey));
  const names = current.filter((m) => theirs.has(moveKey(m))).map((m) => m.name);
  return names.length ? { plan: last, names } : undefined;
}

/** Starting points to build from: the latest similar class, and one that's due for a repeat. */
export function startingPoints(similar: Similar[], todayIso: string): { plan: ClassPlan; why: string }[] {
  if (!similar.length) return [];
  const top = similar[0].score;
  const best = similar.filter((s) => s.score === top).map((s) => s.plan).sort((a, b) => b.date.localeCompare(a.date));
  const out: { plan: ClassPlan; why: string }[] = [{ plan: best[0], why: 'latest' }];
  const older = best.slice(2).filter((p) => daysBetween(p.date, todayIso) >= 21);
  if (older.length) out.push({ plan: older[0], why: 'rotate' });
  return out;
}

/** Types and names she has used, most recent first, for quick picking. */
export function recentLabels(plans: ClassPlan[], field: 'title' | 'format', filter?: { format?: string }): { label: string; lastDate: string; count: number }[] {
  const m = new Map<string, { label: string; lastDate: string; count: number }>();
  const sorted = [...plans].sort((a, b) => b.date.localeCompare(a.date));
  for (const p of sorted) {
    const v = (p[field] || '').trim();
    if (!v) continue;
    if (filter?.format && norm(p.format) !== norm(filter.format)) continue;
    const k = norm(v);
    const cur = m.get(k);
    if (cur) cur.count++;
    else m.set(k, { label: v, lastDate: p.date, count: 1 });
  }
  return Array.from(m.values());
}

// ---- attendees ----

export interface GroupGuidance extends ClientGuidance {
  people: { client: Client; stage?: string; review: string[] }[];
}

/** Combines every attendee's intake flags; each reason names who it applies to. */
export function groupGuidance(attendees: Client[]): GroupGuidance {
  const byTag = new Map<string, { reason: string; names: string[] }>();
  const people: GroupGuidance['people'] = [];
  for (const c of attendees) {
    const g = guidance(c);
    g.flags.forEach((reason, tag) => {
      const cur = byTag.get(tag);
      if (cur) cur.names.push(c.firstName);
      else byTag.set(tag, { reason, names: [c.firstName] });
    });
    const review = g.notes.filter((n) => n.kind === 'review').map((n) => n.text);
    const stage = stageLabel(c);
    if (review.length || stage || g.flags.size) people.push({ client: c, stage, review });
  }
  const flags = new Map<string, string>();
  byTag.forEach((v, tag) => flags.set(tag, `${v.names.join(', ')}: ${v.reason}`));
  return { notes: [], flags, people };
}

// ---- filing into client logs ----

export const classSessionId = (classId: string, clientId: string) => `cls-${classId}-${clientId}`;

/** The session each attendee gets in her log for this class. */
export function classSessionFor(p: ClassPlan, clientId: string, existing: Session | undefined, nowIso: string): Session {
  const items: SessionItem[] = p.exercises.filter((m) => m.exerciseId).map((m) => ({ exerciseId: m.exerciseId!, sets: [], notes: m.detail || '' }));
  const unlinked = p.exercises.filter((m) => !m.exerciseId).map((m) => m.name);
  const note = [`Group class: ${className(p)}${p.format && p.title ? ` (${p.format})` : ''}`, unlinked.length ? `Also: ${unlinked.join(', ')}` : ''].filter(Boolean).join('\n');
  const s: Session = {
    id: classSessionId(p.id, clientId),
    clientId,
    date: p.date,
    status: isTaught(p) ? 'complete' : 'planned',
    items,
    post: existing?.post || {},
    trainerNotes: note,
    classId: p.id,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };
  if (p.durationMin) s.durationMin = p.durationMin;
  return s;
}

/** What needs writing and deleting so attendees' logs match the class. */
export function classFilingChanges(p: ClassPlan, filed: Session[], clientIds: Set<string>, nowIso: string): { put: Session[]; del: string[] } {
  const want = new Set((p.attendeeIds || []).filter((id) => clientIds.has(id)));
  const del = filed.filter((s) => !want.has(s.clientId)).map((s) => s.id);
  const put: Session[] = [];
  want.forEach((cid) => {
    const existing = filed.find((s) => s.clientId === cid);
    const next = classSessionFor(p, cid, existing, nowIso);
    if (existing && JSON.stringify({ ...existing, updatedAt: '' }) === JSON.stringify({ ...next, updatedAt: '' })) return;
    put.push(next);
  });
  return { put, del };
}
