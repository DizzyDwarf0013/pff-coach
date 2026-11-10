// How a client's goals shape her workouts: rep targets, when to add weight, a conditioning
// finisher, a core and pelvic floor block, and exercises or areas she names in her own words.
import type { Intake } from './types.js';
import type { Group } from './planlogic.js';

export interface GoalProfile {
  /** goals from the intake, plus pregnancy or postpartum status */
  labels: string[];
  /** reps to aim for on exercises she hasn't done yet */
  repTarget: number;
  /** add weight once every set reaches this many reps; null means hold the load */
  bumpAt: number | null;
  /** reps to reset to after adding weight */
  resetTo: number;
  /** add a short cardio finisher */
  finisher: boolean;
  /** make sure there's a core and pelvic floor block */
  coreBlock: boolean;
  /** prefer exercises that can be loaded and progressed */
  preferLoaded: boolean;
  /** exercise tags to prefer */
  tags: string[];
  /** muscle groups she cares about, from her own words */
  groups: Group[];
  /** words to look for in exercise names, from her own words (e.g. "carry", "row") */
  names: string[];
  /** lifts she names outright ("deadlift my bodyweight"); one is kept in when the day allows */
  lifts: string[];
  /** what this changes, in plain language, for the screen */
  effects: string[];
  /** her words, quoted on screen */
  words?: string;
}

const WORDS: { re: RegExp; groups?: Group[]; names?: string[]; finisher?: boolean; core?: boolean; tags?: string[]; say: string }[] = [
  { re: /\b(carry|carrying|toddler|car ?seat|stroller|(lift|pick up|picking up) (my|the|her))\b/i, groups: ['posterior', 'core'], names: ['carry', 'deadlift', 'row'], say: 'carrying and lifting' },
  { re: /\bback (pain|ache|hurts?)|lower back\b/i, groups: ['posterior', 'core', 'pull'], names: ['bird dog', 'pallof', 'glute', 'row', 'bridge'], say: 'a stronger back' },
  { re: /\bposture\b/i, groups: ['pull'], names: ['row', 'face pull', 'pull-apart', 'rear delt'], say: 'posture' },
  { re: /\b(glutes?|booty|butt|hips?)\b/i, groups: ['posterior'], say: 'glutes' },
  { re: /\b(legs?|thighs?|quads?)\b/i, groups: ['quads', 'posterior'], say: 'legs' },
  { re: /\b(arms?|biceps?|triceps?|shoulders?)\b/i, groups: ['shoulders', 'pull', 'push'], say: 'arms and shoulders' },
  { re: /\b(core|abs|belly|tummy|diastasis|stomach)\b/i, groups: ['core'], core: true, say: 'core' },
  { re: /\b(leak(ing)?|pelvic floor|bladder)\b/i, core: true, tags: ['pelvic-floor'], say: 'pelvic floor' },
  { re: /\b(run|running|5k|10k|race|stamina|endurance|cardio|winded|out of breath|energy)\b/i, finisher: true, say: 'stamina' },
];
const LIFTS = ['deadlift', 'squat', 'bench', 'push-up', 'pull-up', 'hip thrust', 'lunge', 'plank', 'row', 'overhead press'];

export function goalProfile(intake: Intake): GoalProfile {
  const goals = intake.goals || [];
  const m = intake.maternal || { status: 'none', pelvicFloor: [] };
  const labels = [...goals];
  const p: GoalProfile = { labels, repTarget: 10, bumpAt: 12, resetTo: 10, finisher: false, coreBlock: false, preferLoaded: false, tags: [], groups: [], names: [], lifts: [], effects: [] };
  const say = (s: string) => { if (!p.effects.includes(s)) p.effects.push(s); };

  if (goals.includes('Gain strength')) {
    p.repTarget = 8; p.bumpAt = 10; p.resetTo = 8; p.preferLoaded = true;
    say('8-rep targets, and weight goes up once she reaches 10 on every set');
    say('favors exercises she can load and progress');
  }
  if (goals.includes('Lose weight')) {
    if (!goals.includes('Gain strength')) { p.repTarget = 12; p.bumpAt = 15; p.resetTo = 12; say('12-rep targets, and weight goes up once she reaches 15 on every set'); }
    p.finisher = true;
    say('ends with a short cardio finisher');
  }
  if (goals.includes('General fitness') && !p.finisher && !goals.includes('Gain strength')) say('a balanced mix');
  const pregnant = m.status === 'pregnant' || goals.includes('Prenatal fitness');
  const postpartum = m.status === 'postpartum' || goals.includes('Postpartum recovery');
  if (m.status === 'pregnant' && !labels.includes('Prenatal fitness')) labels.push('Pregnant');
  if (m.status === 'postpartum' && !labels.includes('Postpartum recovery')) labels.push('Postpartum');
  if (pregnant) {
    p.tags.push('prenatal-friendly', 'pelvic-floor'); p.coreBlock = true;
    if (p.repTarget < 10) { p.repTarget = 10; p.resetTo = 10; }
    say('prenatal-friendly exercises and a core and pelvic floor block');
  }
  if (postpartum) {
    p.tags.push('pelvic-floor'); p.coreBlock = true;
    say('a core and pelvic floor block');
  }
  if (goals.includes('Maintain current') || pregnant) {
    p.bumpAt = null;
    say(pregnant ? 'holds her load steady; progress with reps and the talk test' : 'holds her numbers steady instead of adding weight');
  }

  const words = (intake.specificGoals || '').trim();
  if (words) {
    p.words = words;
    const hits: string[] = [];
    for (const w of WORDS) {
      if (!w.re.test(words)) continue;
      hits.push(w.say);
      (w.groups || []).forEach((g) => { if (!p.groups.includes(g)) p.groups.push(g); });
      (w.names || []).forEach((n) => { if (!p.names.includes(n)) p.names.push(n); });
      (w.tags || []).forEach((t) => { if (!p.tags.includes(t)) p.tags.push(t); });
      if (w.finisher) p.finisher = true;
      if (w.core) p.coreBlock = true;
    }
    const lifts = LIFTS.filter((l) => new RegExp(`\\b${l.replace('-', '[- ]?')}s?\\b`, 'i').test(words));
    p.lifts = lifts;
    lifts.forEach((l) => { if (!p.names.includes(l)) p.names.unshift(l); });
    if (lifts.length) say(`keeps ${lifts.join(' and ')} in her workouts when it fits the day`);
    if (hits.length) say(`leans toward ${hits.join(', ')}`);
  }
  p.tags = Array.from(new Set(p.tags));
  if (p.bumpAt === null) p.effects = p.effects.filter((e) => !e.includes('weight goes up'));
  return p;
}

const wordIn = (name: string) => (n: string) => new RegExp(`(^|[^a-z])${n.replace(/[-]/g, '[- ]?')}s?($|[^a-z])`, 'i').test(name);
/** True when an exercise name matches one of the words from her goals. */
export const namedInGoals = (name: string, p: GoalProfile) => p.names.some(wordIn(name));
/** True when an exercise is one of the lifts she named outright. */
export const liftInGoals = (name: string, p: GoalProfile) => p.lifts.some(wordIn(name));
