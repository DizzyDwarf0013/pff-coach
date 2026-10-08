// Data model. Weights are in pounds, heights and girths in inches, dates are local "YYYY-MM-DD".

export type Level3 = 'light' | 'moderate' | 'intense';
export type ActivityLevel = 'minimal' | 'occasional' | 'moderate' | 'intense';
export type YesNoUnsure = '' | 'no' | 'yes' | 'unsure';

export interface Maternal {
  status: 'none' | 'pregnant' | 'postpartum';
  dueDate?: string;
  deliveryDate?: string;
  deliveryType?: '' | 'vaginal' | 'c-section';
  diastasis?: YesNoUnsure;
  pelvicFloor: string[]; // e.g. leaking, heaviness, pain
  clearance?: '' | 'yes' | 'no';
  clearanceDate?: string;
}

export interface Intake {
  date?: string;
  heightIn?: number;
  startWeight?: number;
  goalWeight?: number;
  musclePct?: number;
  bodyFatPct?: number;
  activityLevel?: ActivityLevel | '';
  avgSteps?: number;
  daysPerWeek?: number;
  workoutMinutes?: number;
  workoutIntensity?: Level3 | '';
  workoutLocation?: string;
  diet?: string;
  calories?: number;
  dietDuration?: string;
  eatingDisorderHistory?: '' | 'no' | 'yes' | 'prefer-not';
  medical?: string;
  jointAreas: string[];
  maternal: Maternal;
  goals: string[];
  specificGoals?: string;
  emergencyName?: string;
  emergencyPhone?: string;
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dob?: string;
  isPinkFitness: boolean;
  status: 'active' | 'inactive' | 'lead';
  source?: string;
  consent: { email: boolean; sms: boolean; updatedAt?: string };
  intake: Intake;
  notes?: string;
  reportNote?: string;
  createdAt: string;
  updatedAt: string;
}

export type Measure = 'weight_reps' | 'reps' | 'time';

export interface Exercise {
  id: string;
  name: string;
  category: 'Lower body' | 'Upper body' | 'Core' | 'Cardio' | 'Mobility';
  equipment: string;
  measure: Measure;
  tags: string[];
  cues?: string;
  custom?: boolean;
}

export interface SetEntry {
  weight?: number | null;
  reps?: number | null;
  seconds?: number | null;
}

export interface SessionItem {
  exerciseId: string;
  sets: SetEntry[];
  notes?: string;
}

export interface Session {
  id: string;
  clientId: string;
  date: string;
  status: 'planned' | 'in_progress' | 'complete';
  durationMin?: number;
  items: SessionItem[];
  post: {
    weight?: number;
    musclePct?: number;
    intensity?: Level3 | '';
    favorite?: string;
    leastFavorite?: string;
    feedback?: string;
  };
  trainerNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Measurement {
  id: string;
  clientId: string;
  date: string;
  weight?: number;
  musclePct?: number;
  bodyFatPct?: number;
  waistIn?: number;
  notes?: string;
  sessionId?: string;
}

export interface ClassPlan {
  id: string;
  date: string;
  title?: string;
  format?: string;
  exercises: { exerciseId?: string; name: string; detail?: string }[];
  notes?: string;
  source?: 'import' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export type ImportModel = 'sonnet' | 'haiku';

export interface Settings {
  trainerName: string;
  businessName: string;
  unbrandedTitle: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  importModel: ImportModel;
}

export const DEFAULT_SETTINGS: Settings = {
  trainerName: '',
  businessName: 'Pink Fitness Florida',
  unbrandedTitle: 'Personal Training',
  contactEmail: '',
  contactPhone: '',
  website: 'pinkfitnessflorida.com',
  importModel: 'sonnet',
};
