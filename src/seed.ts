// Starter exercise catalog and optional sample data.
import type { Client, Exercise, Measure, Measurement, Session } from './types.js';
import { addDays, today, uid } from './util.js';
import * as db from './db.js';
import { emptyIntake } from './logic.js';

/** Plain-language labels for the exercise tags used by the considerations rules. */
export const TAGS: Record<string, string> = {
  'supine': 'Lying on back',
  'prone': 'Lying face-down',
  'high-impact': 'Jumping or impact',
  'core-flexion': 'Crunch-type flexion',
  'core-pressure': 'High abdominal pressure',
  'overhead': 'Overhead loading',
  'spinal-load': 'Heavy spinal load',
  'deep-knee': 'Deep knee bend',
  'wrist-load': 'Weight on wrists',
  'balance': 'Balance or fall risk',
  'pelvic-floor': 'Pelvic floor friendly',
  'prenatal-friendly': 'Prenatal friendly',
};

type Row = [string, Exercise['category'], string, Measure, string[]];

const CATALOG: Row[] = [
  // Lower body
  ['Goblet squat', 'Lower body', 'Dumbbell', 'weight_reps', ['deep-knee', 'prenatal-friendly']],
  ['Bodyweight squat', 'Lower body', 'Bodyweight', 'reps', ['deep-knee', 'prenatal-friendly']],
  ['Box squat', 'Lower body', 'Bench, dumbbell', 'weight_reps', ['prenatal-friendly']],
  ['Sumo squat', 'Lower body', 'Dumbbell', 'weight_reps', ['deep-knee', 'prenatal-friendly']],
  ['Romanian deadlift', 'Lower body', 'Dumbbells', 'weight_reps', ['spinal-load']],
  ['Single-leg Romanian deadlift', 'Lower body', 'Dumbbell', 'weight_reps', ['balance']],
  ['Glute bridge', 'Lower body', 'Bodyweight', 'reps', ['supine', 'pelvic-floor']],
  ['Hip thrust', 'Lower body', 'Barbell or dumbbell', 'weight_reps', ['spinal-load']],
  ['Reverse lunge', 'Lower body', 'Dumbbells', 'weight_reps', ['deep-knee', 'balance']],
  ['Split squat', 'Lower body', 'Dumbbells', 'weight_reps', ['deep-knee', 'balance']],
  ['Step-up', 'Lower body', 'Box, dumbbells', 'weight_reps', ['balance']],
  ['Lateral band walk', 'Lower body', 'Mini band', 'reps', ['prenatal-friendly']],
  ['Side-lying clamshell', 'Lower body', 'Mini band', 'reps', ['prenatal-friendly', 'pelvic-floor']],
  ['Calf raise', 'Lower body', 'Dumbbells', 'weight_reps', ['prenatal-friendly']],
  ['Wall sit', 'Lower body', 'Wall', 'time', ['deep-knee']],
  ['Leg press', 'Lower body', 'Machine', 'weight_reps', ['deep-knee']],
  ['Kettlebell swing', 'Lower body', 'Kettlebell', 'weight_reps', ['spinal-load', 'core-pressure']],
  // Upper body
  ['Dumbbell bench press', 'Upper body', 'Dumbbells, bench', 'weight_reps', ['supine']],
  ['Incline dumbbell press', 'Upper body', 'Dumbbells, bench', 'weight_reps', ['prenatal-friendly']],
  ['Push-up', 'Upper body', 'Bodyweight', 'reps', ['wrist-load', 'core-pressure']],
  ['Incline push-up', 'Upper body', 'Bench or wall', 'reps', ['wrist-load', 'prenatal-friendly']],
  ['Seated cable row', 'Upper body', 'Cable', 'weight_reps', ['prenatal-friendly']],
  ['Bent-over row', 'Upper body', 'Dumbbells', 'weight_reps', ['spinal-load']],
  ['Single-arm row', 'Upper body', 'Dumbbell, bench', 'weight_reps', ['prenatal-friendly']],
  ['Lat pulldown', 'Upper body', 'Cable', 'weight_reps', ['prenatal-friendly']],
  ['Standing overhead press', 'Upper body', 'Dumbbells', 'weight_reps', ['overhead', 'core-pressure']],
  ['Seated shoulder press', 'Upper body', 'Dumbbells, bench', 'weight_reps', ['overhead']],
  ['Lateral raise', 'Upper body', 'Dumbbells', 'weight_reps', ['prenatal-friendly']],
  ['Biceps curl', 'Upper body', 'Dumbbells', 'weight_reps', ['prenatal-friendly']],
  ['Overhead triceps extension', 'Upper body', 'Dumbbell', 'weight_reps', ['overhead']],
  ['Band pull-apart', 'Upper body', 'Band', 'reps', ['prenatal-friendly']],
  ['Face pull', 'Upper body', 'Cable or band', 'weight_reps', ['prenatal-friendly']],
  // Core
  ['Connection breath', 'Core', 'Bodyweight', 'time', ['pelvic-floor', 'prenatal-friendly']],
  ['Heel slide', 'Core', 'Bodyweight', 'reps', ['supine', 'pelvic-floor']],
  ['Dead bug', 'Core', 'Bodyweight', 'reps', ['supine']],
  ['Bird dog', 'Core', 'Bodyweight', 'reps', ['wrist-load', 'prenatal-friendly']],
  ['Pallof press', 'Core', 'Cable or band', 'reps', ['prenatal-friendly']],
  ['Side plank', 'Core', 'Bodyweight', 'time', ['core-pressure']],
  ['Forearm plank', 'Core', 'Bodyweight', 'time', ['core-pressure']],
  ['Crunch', 'Core', 'Bodyweight', 'reps', ['supine', 'core-flexion']],
  ['Bicycle crunch', 'Core', 'Bodyweight', 'reps', ['supine', 'core-flexion']],
  ['Farmer carry', 'Core', 'Dumbbells', 'time', ['prenatal-friendly']],
  ['Suitcase carry', 'Core', 'Dumbbell', 'time', ['prenatal-friendly']],
  // Cardio
  ['Step jacks', 'Cardio', 'Bodyweight', 'time', ['prenatal-friendly', 'pelvic-floor']],
  ['Jumping jacks', 'Cardio', 'Bodyweight', 'time', ['high-impact']],
  ['Mountain climbers', 'Cardio', 'Bodyweight', 'time', ['high-impact', 'wrist-load', 'core-pressure']],
  ['Squat jumps', 'Cardio', 'Bodyweight', 'reps', ['high-impact', 'deep-knee']],
  ['Burpees', 'Cardio', 'Bodyweight', 'reps', ['high-impact', 'wrist-load', 'core-pressure']],
  ['Stationary bike', 'Cardio', 'Bike', 'time', ['prenatal-friendly']],
  ['Rower', 'Cardio', 'Rower', 'time', []],
  ['High-knee march', 'Cardio', 'Bodyweight', 'time', ['prenatal-friendly']],
  // Mobility
  ['Cat-cow', 'Mobility', 'Bodyweight', 'reps', ['wrist-load', 'prenatal-friendly']],
  ['Half-kneeling hip flexor stretch', 'Mobility', 'Bodyweight', 'time', ['prenatal-friendly']],
  ['Child\'s pose', 'Mobility', 'Bodyweight', 'time', ['prenatal-friendly']],
  ['Open book rotation', 'Mobility', 'Bodyweight', 'reps', ['prenatal-friendly']],
];

const slug = (s: string) => 'ex-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export async function ensureCatalog() {
  const seeded = await db.getMeta<boolean>('catalogSeeded');
  if (seeded) return;
  const rows: Exercise[] = CATALOG.map(([name, category, equipment, measure, tags]) => ({
    id: slug(name), name, category, equipment, measure, tags,
  }));
  await db.putMany('exercises', rows);
  await db.setMeta('catalogSeeded', true);
  db.invalidateExercises();
}

// ---- sample data, so the charts and screens have something in them on day one ----
function client(p: Partial<Client> & { firstName: string; lastName: string }): Client {
  const now = new Date().toISOString();
  return {
    id: uid(), email: '', phone: '', isPinkFitness: false, status: 'active', source: 'sample',
    consent: { email: true, sms: false, updatedAt: today() }, intake: emptyIntake(),
    createdAt: now, updatedAt: now, ...p,
  };
}

export async function loadSample() {
  const start = addDays(today(), -84);
  const maya = client({
    firstName: 'Maya', lastName: 'Sample', email: 'maya@example.com', phone: '(727) 555-0142', isPinkFitness: true,
    intake: {
      ...emptyIntake(), date: start, heightIn: 65, startWeight: 168, goalWeight: 150, musclePct: 31,
      activityLevel: 'occasional', daysPerWeek: 1, workoutMinutes: 30, workoutIntensity: 'light', workoutLocation: 'Home',
      goals: ['Gain strength', 'General fitness'], specificGoals: 'Carry my toddler without back pain. Feel strong again.',
      maternal: { status: 'postpartum', deliveryDate: addDays(today(), -150), deliveryType: 'c-section', diastasis: 'yes', pelvicFloor: ['Leaking'], clearance: 'yes', clearanceDate: addDays(today(), -100) },
      eatingDisorderHistory: 'no', jointAreas: [],
    },
  });
  const jen = client({
    firstName: 'Jen', lastName: 'Sample', email: 'jen@example.com', phone: '(727) 555-0187', isPinkFitness: false,
    intake: {
      ...emptyIntake(), date: start, heightIn: 67, startWeight: 142, goalWeight: 142, musclePct: 34,
      activityLevel: 'moderate', daysPerWeek: 3, workoutMinutes: 45, workoutIntensity: 'moderate', workoutLocation: 'Gym',
      goals: ['Gain strength'], specificGoals: 'Deadlift my bodyweight by spring.', jointAreas: ['Knees'],
      maternal: { status: 'none', pelvicFloor: [] }, eatingDisorderHistory: 'no',
    },
  });
  await db.putMany('clients', [maya, jen]);

  const plan: Record<string, [string, number, number, number][]> = {
    // exerciseId, start weight, reps, weekly step
    maya: [['ex-goblet-squat', 15, 10, 2.5], ['ex-single-arm-row', 12, 10, 1.5], ['ex-incline-dumbbell-press', 10, 10, 1], ['ex-pallof-press', 0, 10, 0]],
    jen: [['ex-romanian-deadlift', 50, 8, 5], ['ex-box-squat', 30, 10, 2.5], ['ex-lat-pulldown', 60, 10, 2.5], ['ex-farmer-carry', 0, 0, 0]],
  };
  const sessions: Session[] = [];
  const measures: Measurement[] = [];
  for (const [who, c] of [['maya', maya], ['jen', jen]] as const) {
    for (let w = 0; w < 12; w++) {
      const date = addDays(start, w * 7 + (who === 'jen' ? 2 : 0));
      const items = plan[who].map(([exerciseId, base, reps, step]) => {
        const weight = base ? Math.round((base + step * w) * 2) / 2 : null;
        if (exerciseId === 'ex-farmer-carry') return { exerciseId, sets: [1, 2, 3].map(() => ({ seconds: 30 + w * 3 })) };
        return { exerciseId, sets: [0, 1, 2].map((i) => ({ weight, reps: reps + (i === 2 && w % 3 === 2 ? 2 : 0) })) };
      });
      const id = uid();
      const weight = who === 'maya' ? Math.round((168 - w * 1.1 + (w % 3 === 1 ? 0.6 : 0)) * 10) / 10 : Math.round((142 + (w % 2 ? 0.4 : -0.3)) * 10) / 10;
      const musclePct = who === 'maya' ? Math.round((31 + w * 0.22) * 10) / 10 : Math.round((34 + w * 0.12) * 10) / 10;
      const created = new Date().toISOString();
      sessions.push({
        id, clientId: c.id, date, status: 'complete', durationMin: 50, items,
        post: { weight, musclePct, intensity: w < 4 ? 'light' : 'moderate', favorite: items[0].exerciseId, leastFavorite: items[items.length - 1].exerciseId, feedback: w === 5 ? 'Loving the new row variation.' : '' },
        trainerNotes: '', createdAt: created, updatedAt: created,
      });
      measures.push({ id: uid(), clientId: c.id, date, weight, musclePct, sessionId: id });
    }
  }
  await db.putMany('sessions', sessions);
  await db.putMany('measurements', measures);
}

export async function removeSample() {
  const clients = await db.getClients();
  for (const c of clients.filter((c) => c.source === 'sample')) await db.deleteClientCascade(c.id);
}
