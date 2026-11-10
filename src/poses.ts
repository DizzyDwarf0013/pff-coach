// Movement templates: a start and finish pose for each kind of exercise, with props and an arrow.
// Exercises map to a template by name (exerciseInfo.ts), and unknown names fall back by keyword.
import type { Pose, Prop, SidePose, Template } from './figure.js';

// ---- building blocks ----
const STAND: SidePose = { torso: -90, neck: -90, arm: [93, 90], armFar: [88, 92], leg: [90, 90], legFar: [92, 90] };
const stand = (o: Partial<SidePose> = {}): SidePose => ({ ...STAND, ...o });
const SQUAT_LEGS = { leg: [18, 106] as [number, number], legFar: [22, 104] as [number, number] };
const dbs: Prop[] = [{ k: 'dumbbell', at: 'hand' }, { k: 'dumbbell', at: 'handFar' }];
const db1: Prop[] = [{ k: 'dumbbell', at: 'hand' }];
const SEAT_BACK = (back = -96): Prop => ({ k: 'seat', at: 'hip', back });
const seated = (o: Partial<SidePose> = {}): SidePose => ({ torso: -90, neck: -90, arm: [93, 90], leg: [0, 90], legFar: [2, 92], ...o });
// lying on the back, head to the left, knees bent
const SUPINE: SidePose = { torso: 180, neck: 180, arm: [4, 0], leg: [-52, 66], legFar: [-50, 68] };
const supine = (o: Partial<SidePose> = {}): SidePose => ({ ...SUPINE, ...o, props: [{ k: 'mat' }, ...(o.props || [])] });
// on hands and knees, head to the right
const QUAD: SidePose = { torso: 0, neck: 8, arm: [90, 90], leg: [90, 180, 180], legFar: [92, 180, 180] };
const quad = (o: Partial<SidePose> = {}): SidePose => ({ ...QUAD, ...o, props: [{ k: 'mat' }, ...(o.props || [])] });
const hipDown = { joint: 'hip', from: [-30, -44], to: [-30, -6], bow: -12 } as Template['arrow'];

const T: Record<string, Template> = {
  // ---------- squats ----------
  squat: {
    poses: [stand({ arm: [-4, -4], armFar: [-6, -6] }), { ...stand(), torso: -64, neck: -76, ...SQUAT_LEGS, arm: [-12, -12], armFar: [-14, -14] }],
    arrow: hipDown,
  },
  goblet_squat: {
    poses: [stand({ arm: [100, -60], armFar: [100, -60], props: [{ k: 'dumbbell', at: 'hand', angle: 90, off: [0, -4] }] }),
      { ...stand(), torso: -64, neck: -78, ...SQUAT_LEGS, arm: [70, -82], armFar: [70, -82], props: [{ k: 'dumbbell', at: 'hand', angle: 90, off: [0, -4] }] }],
    arrow: hipDown,
  },
  squat_sides: {
    poses: [stand({ props: dbs }), { ...stand(), torso: -66, neck: -78, ...SQUAT_LEGS, arm: [96, 92], armFar: [94, 92], props: dbs }],
    arrow: hipDown,
  },
  squat_bar: {
    poses: [stand({ arm: [140, -50], armFar: [140, -50], props: [{ k: 'barbell', at: 'shoulder', off: [-18, -4] }] }),
      { ...stand(), torso: -62, neck: -76, ...SQUAT_LEGS, arm: [160, -30], armFar: [160, -30], props: [{ k: 'barbell', at: 'shoulder', off: [-16, -10] }] }],
    arrow: hipDown,
  },
  squat_trx: {
    poses: [stand({ torso: -96, neck: -94, arm: [-20, -20], armFar: [-22, -22], props: [{ k: 'strap', a: 'hand', b: [110, -235] }] }),
      { ...stand(), torso: -80, neck: -84, ...SQUAT_LEGS, arm: [-30, -30], armFar: [-32, -32], props: [{ k: 'strap', a: 'hand', b: [110, -235] }] }],
    arrow: hipDown,
  },
  box_squat: {
    poses: [stand({ arm: [-4, -4], armFar: [-6, -6], props: [{ k: 'bench', x: -62, w: 46, h: 46 }] }),
      { ...stand(), torso: -66, neck: -78, leg: [4, 100], legFar: [8, 98], arm: [-10, -10], armFar: [-12, -12], props: [{ k: 'seat', at: 'hip' }] }],
    arrow: hipDown,
  },
  sumo_squat: {
    poses: [{ view: 'front', armL: [100, 92], armR: [80, 88], legL: [78, 90], legR: [102, 90], props: [{ k: 'dumbbell', at: 'handL', angle: 90, off: [-8, 4] }] },
      { view: 'front', armL: [100, 92], armR: [80, 88], legL: [30, 100], legR: [150, 80], props: [{ k: 'dumbbell', at: 'handL', angle: 90, off: [-8, 4] }] }],
    arrow: { joint: 'hip', from: [-56, -40], to: [-56, -4], bow: -10 },
  },
  split_squat: {
    poses: [stand({ leg: [70, 100], legFar: [112, 96, 20], props: dbs }), stand({ torso: -88, neck: -88, leg: [6, 96], legFar: [100, 172, 120], props: dbs })],
    arrow: hipDown,
  },
  reverse_lunge: {
    poses: [stand({ props: dbs }), stand({ torso: -88, neck: -88, leg: [6, 96], legFar: [100, 172, 120], props: dbs })],
    arrow: { joint: 'ankleFar', from: [50, -20], to: [4, -14], bow: 12 },
  },
  bulgarian: {
    poses: [stand({ leg: [76, 98], legFar: [122, 150, 190], props: [...dbs, { k: 'block', a: 'toeFar', w: 18 }] }),
      stand({ torso: -84, neck: -86, leg: [10, 98], legFar: [96, 168, 190], props: [...dbs, { k: 'block', a: 'toeFar', w: 18 }] })],
    arrow: hipDown,
  },
  landmine_press: {
    poses: [stand({ leg: [70, 100], legFar: [112, 96, 20], arm: [110, -80], armFar: [93, 90], props: [{ k: 'bar', a: 'hand', b: [-100, 0] }] }),
      stand({ torso: -84, neck: -84, leg: [6, 96], legFar: [100, 172, 120], arm: [-45, -45], armFar: [93, 90], props: [{ k: 'bar', a: 'hand', b: [-100, 0] }] })],
    arrow: { joint: 'hand', from: [-40, 30], to: [-6, 4], bow: 10 },
  },
  step_up: {
    poses: [stand({ leg: [30, 110], props: [{ k: 'block', a: 'ankle', w: 26 }] }),
      stand({ leg: [90, 90], legFar: [6, 100], lift: 29, props: [{ k: 'block', a: 'ankle', w: 30 }] })],
    arrow: { joint: 'hip', from: [-36, 30], to: [-36, -10], bow: 10 },
  },
  box_jump: {
    poses: [{ ...stand(), torso: -62, neck: -74, leg: [28, 110], legFar: [32, 108], arm: [130, 110], armFar: [132, 112], props: [{ k: 'box', x: 70, w: 70, h: 46 }] },
      { ...stand(), torso: -66, neck: -78, leg: [24, 106], legFar: [28, 104], arm: [-10, -10], armFar: [-12, -12], lift: 46, props: [{ k: 'block', a: 'ankle', w: 34 }] }],
    arrow: { joint: 'hip', from: [-60, 40], to: [-24, -26], bow: 14 },
  },
  // ---------- hinges and glutes ----------
  rdl: {
    poses: [stand({ props: dbs }), stand({ torso: -16, neck: -6, leg: [84, 96], legFar: [86, 96], arm: [90, 90], armFar: [92, 90], props: dbs })],
    arrow: { joint: 'shoulder', from: [10, -56], to: [24, -18], bow: -10 },
  },
  single_leg_rdl: {
    poses: [stand({ props: db1 }), stand({ torso: -10, neck: -2, leg: [86, 94], legFar: [176, 178, 90], arm: [90, 90], armFar: [70, 70], props: db1 })],
    arrow: { joint: 'shoulder', from: [10, -56], to: [24, -18], bow: -10 },
  },
  hip_thrust: {
    poses: [{ torso: 222, neck: 210, arm: [150, 30], leg: [-28, 72], legFar: [-26, 74], props: [{ k: 'block', a: 'shoulder', w: 16 }, { k: 'barbell', at: 'hip', off: [6, -20] }] },
      { torso: 182, neck: 186, arm: [150, 30], leg: [-4, 92], legFar: [-2, 94], props: [{ k: 'block', a: 'shoulder', w: 16 }, { k: 'barbell', at: 'hip', off: [6, -20] }] }],
    arrow: { joint: 'hip', from: [10, 44], to: [10, 10], bow: 10 },
  },
  glute_bridge: {
    poses: [supine(), supine({ torso: 151, neck: 178, arm: [10, 0], leg: [-12, 98], legFar: [-10, 100] })],
    arrow: { joint: 'hip', from: [6, 46], to: [6, 14], bow: 12 },
  },
  single_leg_bridge: {
    poses: [supine({ legFar: [-34, -34] }), supine({ torso: 151, neck: 178, arm: [10, 0], leg: [-12, 98], legFar: [-14, -14] })],
    arrow: { joint: 'hip', from: [6, 46], to: [6, 14], bow: 12 },
  },
  back_extension: {
    poses: [{ torso: 46, neck: 60, arm: [100, 90], leg: [135, 135, 45], legFar: [137, 135, 45], props: [{ k: 'under', a: 'hip', b: 'knee', legs: true }] },
      { torso: -45, neck: -45, arm: [100, 90], leg: [135, 135, 45], legFar: [137, 135, 45], props: [{ k: 'under', a: 'hip', b: 'knee', legs: true }] }],
    arrow: { joint: 'shoulder', from: [40, 60], to: [26, -6], bow: 14 },
  },
  kickback: {
    poses: [stand({ torso: -80, neck: -84, arm: [-10, 0], armFar: [-12, 0], leg: [96, 92], props: [{ k: 'column', x: 92 }, { k: 'cable', a: 'ankle', b: [92, -8] }] }),
      stand({ torso: -76, neck: -82, arm: [-10, 0], armFar: [-12, 0], leg: [128, 118], props: [{ k: 'column', x: 92 }, { k: 'cable', a: 'ankle', b: [92, -8] }] })],
    arrow: { joint: 'ankle', from: [30, 10], to: [-6, -10], bow: 10 },
  },
  donkey_kick: {
    poses: [quad(), quad({ leg: [188, -80, -90] })],
    arrow: { joint: 'ankle', from: [24, 56], to: [8, 6], bow: -10 },
  },
  bird_dog: {
    poses: [quad(), quad({ arm: [-4, -4], legFar: [180, 180, 90] })],
    arrow: { joint: 'hand', from: [-30, 40], to: [-6, 6], bow: 10 },
  },
  clamshell: {
    poses: [{ view: 'front', rotate: -90, armL: [80, 120], armR: [-150, -100], legL: [92, 90], legR: [90, 90], props: [{ k: 'mat' }] },
      { view: 'front', rotate: -90, armL: [80, 120], armR: [-150, -100], legL: [48, 128], legR: [90, 90], props: [{ k: 'mat' }] }],
    arrow: { joint: 'kneeL', from: [-6, 34], to: [-6, 2], bow: 10 },
  },
  band_walk: {
    poses: [{ view: 'front', armL: [60, 122], armR: [120, 58], legL: [74, 100], legR: [106, 80], props: [{ k: 'band', a: 'kneeL', b: 'kneeR' }] },
      { view: 'front', armL: [60, 122], armR: [120, 58], legL: [58, 104], legR: [106, 80], props: [{ k: 'band', a: 'kneeL', b: 'kneeR' }] }],
    arrow: { joint: 'ankleL', from: [-10, 26], to: [34, 26], bow: 8 },
  },
  hip_abduction_seated: {
    poses: [{ view: 'front', thigh: 0.5, armL: [80, 80], armR: [100, 100], legL: [70, 92], legR: [110, 88], props: [{ k: 'seat', at: 'hip', w: 64 }, { k: 'kneepad', at: 'kneeL', off: [9, 0] }, { k: 'kneepad', at: 'kneeR', off: [-9, 0] }] },
      { view: 'front', thigh: 0.5, armL: [80, 80], armR: [100, 100], legL: [0, 108], legR: [180, 72], props: [{ k: 'seat', at: 'hip', w: 64 }, { k: 'kneepad', at: 'kneeL', off: [9, 0] }, { k: 'kneepad', at: 'kneeR', off: [-9, 0] }] }],
    arrow: { joint: 'kneeL', from: [10, -28], to: [36, -28], bow: -8 },
  },
  hip_adduction_seated: {
    poses: [{ view: 'front', thigh: 0.5, armL: [80, 80], armR: [100, 100], legL: [0, 108], legR: [180, 72], props: [{ k: 'seat', at: 'hip', w: 64 }, { k: 'kneepad', at: 'kneeL', off: [-9, 0] }, { k: 'kneepad', at: 'kneeR', off: [9, 0] }] },
      { view: 'front', thigh: 0.5, armL: [80, 80], armR: [100, 100], legL: [70, 92], legR: [110, 88], props: [{ k: 'seat', at: 'hip', w: 64 }, { k: 'kneepad', at: 'kneeL', off: [-9, 0] }, { k: 'kneepad', at: 'kneeR', off: [9, 0] }] }],
    arrow: { joint: 'kneeL', from: [40, -28], to: [14, -28], bow: 8 },
  },
  hip_abduction_standing: {
    poses: [{ view: 'front', armL: [70, 70], armR: [160, 150], legL: [90, 90], legR: [92, 90], props: [{ k: 'column', x: -96 }, { k: 'cable', a: 'ankleL', b: [-96, -8] }] },
      { view: 'front', tilt: -6, armL: [70, 70], armR: [160, 150], legL: [48, 48], legR: [94, 90], props: [{ k: 'column', x: -96 }, { k: 'cable', a: 'ankleL', b: [-96, -8] }] }],
    arrow: { joint: 'ankleL', from: [-14, 34], to: [14, 4], bow: 10 },
  },
  calf_raise: {
    poses: [stand({ props: dbs }), stand({ leg: [90, 90, 26], legFar: [92, 90, 26], props: dbs })],
    arrow: { joint: 'ankle', from: [-22, 16], to: [-22, -12], bow: 8 },
  },
  wall_sit: {
    poses: [stand({ arm: [93, 90], props: [{ k: 'wall', x: -34 }] }), { torso: -90, neck: -90, arm: [60, 10], armFar: [62, 10], leg: [0, 90], legFar: [2, 90], props: [{ k: 'wall', x: -34 }] }],
    arrow: hipDown,
  },
  leg_press: {
    poses: [{ torso: -128, neck: -110, arm: [80, 20], leg: [-70, 30, -40], legFar: [-68, 32, -40], props: [SEAT_BACK(-128), { k: 'plate', at: 'toe', angle: 120, off: [4, -2] }] },
      { torso: -128, neck: -110, arm: [80, 20], leg: [-36, -32, -86], legFar: [-34, -30, -86], props: [SEAT_BACK(-128), { k: 'plate', at: 'toe', angle: 58, off: [4, -2] }] }],
    arrow: { joint: 'knee', from: [-6, 26], to: [26, -6], bow: -10 },
  },
  leg_extension: {
    poses: [seated({ arm: [80, 80], props: [SEAT_BACK(), { k: 'roller', at: 'ankle', off: [10, 0] }] }), seated({ arm: [80, 80], leg: [0, 2, -60], legFar: [2, 4, -60], props: [SEAT_BACK(), { k: 'roller', at: 'ankle', off: [0, 10] }] })],
    arrow: { joint: 'knee', from: [30, 50], to: [52, 12], bow: 12 },
  },
  leg_curl: {
    poses: [seated({ arm: [80, 80], leg: [0, 2, -60], legFar: [2, 4, -60], props: [SEAT_BACK(), { k: 'roller', at: 'ankle', off: [0, -10] }] }), seated({ arm: [80, 80], leg: [0, 112], legFar: [2, 114], props: [SEAT_BACK(), { k: 'roller', at: 'ankle', off: [8, -2] }] })],
    arrow: { joint: 'knee', from: [52, -8], to: [20, 46], bow: -12 },
  },
  prone_leg_curl: {
    poses: [{ torso: 0, neck: 10, arm: [30, -20], leg: [180, 180, 90], legFar: [180, 180, 90], props: [{ k: 'under', a: 'knee', b: 'shoulder' }] },
      { torso: 0, neck: 10, arm: [30, -20], leg: [180, -70, -160], legFar: [180, -70, -160], props: [{ k: 'under', a: 'knee', b: 'shoulder' }] }],
    arrow: { joint: 'knee', from: [-50, -6], to: [-18, -46], bow: 12 },
  },
  kb_swing: {
    poses: [stand({ torso: -24, neck: -12, leg: [80, 100], legFar: [82, 100], arm: [104, 104], armFar: [106, 104], props: [{ k: 'kettlebell', at: 'hand' }] }),
      stand({ arm: [-6, -6], armFar: [-8, -8], props: [{ k: 'kettlebell', at: 'hand', off: [10, -14] }] })],
    arrow: { joint: 'hand', from: [-10, 80], to: [0, 10], bow: 18 },
  },
  march: {
    poses: [stand(), stand({ leg: [0, 90, 10], arm: [60, -60], armFar: [120, 90] })],
    arrow: { joint: 'knee', from: [10, 50], to: [10, 10], bow: 8 },
  },
  sled_push: {
    poses: [{ ...stand(), torso: -30, neck: -20, arm: [-14, -14], armFar: [-16, -16], leg: [60, 112], legFar: [126, 104, 30], props: [{ k: 'sled', at: 'hand' }] },
      { ...stand(), torso: -30, neck: -20, arm: [-14, -14], armFar: [-16, -16], leg: [124, 104, 30], legFar: [60, 112], props: [{ k: 'sled', at: 'hand' }] }],
    arrow: { joint: 'hip', from: [-40, -40], to: [10, -40], bow: 8 },
  },
  // ---------- pushing ----------
  bench_press: {
    poses: [{ torso: 180, neck: 180, arm: [96, -84], leg: [30, 100], legFar: [32, 98], props: [{ k: 'under', a: 'hip', b: 'shoulder' }, { k: 'dumbbell', at: 'hand' }] },
      { torso: 180, neck: 180, arm: [-88, -90], leg: [30, 100], legFar: [32, 98], props: [{ k: 'under', a: 'hip', b: 'shoulder' }, { k: 'dumbbell', at: 'hand' }] }],
    arrow: { joint: 'hand', from: [-26, 56], to: [-26, 10], bow: 8 },
  },
  barbell_bench: {
    poses: [{ torso: 180, neck: 180, arm: [96, -84], leg: [30, 100], legFar: [32, 98], props: [{ k: 'under', a: 'hip', b: 'shoulder' }, { k: 'barbell', at: 'hand' }] },
      { torso: 180, neck: 180, arm: [-88, -90], leg: [30, 100], legFar: [32, 98], props: [{ k: 'under', a: 'hip', b: 'shoulder' }, { k: 'barbell', at: 'hand' }] }],
    arrow: { joint: 'hand', from: [-30, 56], to: [-30, 14], bow: 8 },
  },
  incline_press: {
    poses: [{ torso: 214, neck: 214, arm: [110, -66], leg: [20, 100], legFar: [22, 98], props: [{ k: 'under', a: 'hip', b: 'shoulder' }, { k: 'dumbbell', at: 'hand' }] },
      { torso: 214, neck: 214, arm: [-66, -70], leg: [20, 100], legFar: [22, 98], props: [{ k: 'under', a: 'hip', b: 'shoulder' }, { k: 'dumbbell', at: 'hand' }] }],
    arrow: { joint: 'hand', from: [-20, 50], to: [-10, 8], bow: 8 },
  },
  decline_press: {
    poses: [{ torso: 165, neck: 170, arm: [92, -96], leg: [-20, 80], legFar: [-18, 82], props: [{ k: 'under', a: 'hip', b: 'shoulder' }, { k: 'dumbbell', at: 'hand' }] },
      { torso: 165, neck: 170, arm: [-98, -100], leg: [-20, 80], legFar: [-18, 82], props: [{ k: 'under', a: 'hip', b: 'shoulder' }, { k: 'dumbbell', at: 'hand' }] }],
    arrow: { joint: 'hand', from: [-26, 50], to: [-26, 8], bow: 8 },
  },
  chest_press_machine: {
    poses: [seated({ arm: [160, -6], armFar: [158, -6], props: [SEAT_BACK(), { k: 'handle', at: 'hand' }] }), seated({ arm: [-4, -2], armFar: [-6, -4], props: [SEAT_BACK(), { k: 'handle', at: 'hand' }] })],
    arrow: { joint: 'hand', from: [-50, -20], to: [-6, -20], bow: 8 },
  },
  push_up: {
    poses: [{ torso: -10, neck: -4, arm: [90, 90], armFar: [92, 90], leg: [170, 170, 100], legFar: [170, 170, 100], props: [{ k: 'mat' }] },
      { torso: -4, neck: 0, arm: [200, 70], armFar: [198, 70], leg: [176, 176, 100], legFar: [176, 176, 100], props: [{ k: 'mat' }] }],
    arrow: { joint: 'shoulder', from: [-10, -60], to: [-10, -26], bow: 8 },
  },
  incline_push_up: {
    poses: [{ torso: -38, neck: -34, arm: [80, 88], armFar: [82, 88], leg: [142, 142, 100], legFar: [142, 142, 100], props: [{ k: 'block', a: 'hand', w: 30 }] },
      { torso: -28, neck: -24, arm: [135, 42], armFar: [137, 42], leg: [152, 152, 100], legFar: [152, 152, 100], props: [{ k: 'block', a: 'hand', w: 30 }] }],
    arrow: { joint: 'shoulder', from: [-14, -62], to: [-14, -26], bow: 10 },
  },
  chest_fly_lying: {
    poses: [{ torso: 180, neck: 180, arm: [110, 120], leg: [30, 100], legFar: [32, 98], props: [{ k: 'under', a: 'hip', b: 'shoulder' }, { k: 'dumbbell', at: 'hand' }] },
      { torso: 180, neck: 180, arm: [-84, -96], leg: [30, 100], legFar: [32, 98], props: [{ k: 'under', a: 'hip', b: 'shoulder' }, { k: 'dumbbell', at: 'hand' }] }],
    arrow: { joint: 'hand', from: [-50, 50], to: [-10, 10], bow: -14 },
  },
  chest_fly_front: {
    poses: [{ view: 'front', thigh: 0.5, armL: [0, -90], armR: [180, -90], legL: [86, 90], legR: [94, 90], props: [{ k: 'seat', at: 'hip', w: 56 }, { k: 'kneepad', at: 'elbowL', off: [0, -16] }, { k: 'kneepad', at: 'elbowR', off: [0, -16] }] },
      { view: 'front', thigh: 0.5, armL: [160, -90], armR: [20, -90], legL: [86, 90], legR: [94, 90], props: [{ k: 'seat', at: 'hip', w: 56 }, { k: 'kneepad', at: 'elbowL', off: [0, -16] }, { k: 'kneepad', at: 'elbowR', off: [0, -16] }] }],
    arrow: { joint: 'shoulderL', from: [70, -60], to: [30, -60], bow: -8 },
  },
  cable_fly: {
    poses: [{ view: 'front', armL: [-24, -20], armR: [204, 200], legL: [84, 90], legR: [96, 90], props: [{ k: 'column', x: 120 }, { k: 'column', x: -120 }, { k: 'cable', a: 'handL', b: [120, -170] }, { k: 'cable', a: 'handR', b: [-120, -170] }] },
      { view: 'front', armL: [40, 150], armR: [140, 30], legL: [84, 90], legR: [96, 90], props: [{ k: 'column', x: 120 }, { k: 'column', x: -120 }, { k: 'cable', a: 'handL', b: [120, -170] }, { k: 'cable', a: 'handR', b: [-120, -170] }] }],
    arrow: { joint: 'handL', from: [44, -40], to: [8, -4], bow: -10 },
  },
  overhead_press: {
    poses: [stand({ arm: [110, -80], armFar: [112, -80], props: dbs }), stand({ arm: [-88, -92], armFar: [-90, -92], props: dbs })],
    arrow: { joint: 'hand', from: [-24, 60], to: [-24, 14], bow: 8 },
  },
  seated_press: {
    poses: [seated({ arm: [110, -80], armFar: [112, -80], props: [SEAT_BACK(), ...dbs] }), seated({ arm: [-88, -92], armFar: [-90, -92], props: [SEAT_BACK(), ...dbs] })],
    arrow: { joint: 'hand', from: [-24, 60], to: [-24, 14], bow: 8 },
  },
  machine_press: {
    poses: [seated({ arm: [110, -80], armFar: [112, -80], props: [SEAT_BACK(), { k: 'handle', at: 'hand' }] }), seated({ arm: [-88, -92], armFar: [-90, -92], props: [SEAT_BACK(), { k: 'handle', at: 'hand' }] })],
    arrow: { joint: 'hand', from: [-24, 60], to: [-24, 14], bow: 8 },
  },
  lateral_raise: {
    poses: [{ view: 'front', armL: [80, 86], armR: [100, 94], legL: [86, 90], legR: [94, 90], props: [{ k: 'dumbbell', at: 'handL', angle: 90 }, { k: 'dumbbell', at: 'handR', angle: 90 }] },
      { view: 'front', armL: [6, 4], armR: [174, 176], legL: [86, 90], legR: [94, 90], props: [{ k: 'dumbbell', at: 'handL', angle: 90 }, { k: 'dumbbell', at: 'handR', angle: 90 }] }],
    arrow: { joint: 'handL', from: [-30, 66], to: [4, 16], bow: 12 },
  },
  lateral_raise_machine: {
    poses: [{ view: 'front', thigh: 0.4, armL: [80, 86], armR: [100, 94], legL: [86, 90], legR: [94, 90], props: [{ k: 'seat', at: 'hip' }] },
      { view: 'front', thigh: 0.4, armL: [6, 4], armR: [174, 176], legL: [86, 90], legR: [94, 90], props: [{ k: 'seat', at: 'hip' }] }],
    arrow: { joint: 'handL', from: [-30, 66], to: [4, 16], bow: 12 },
  },
  cable_lateral: {
    poses: [{ view: 'front', armL: [100, 110], armR: [100, 94], legL: [86, 90], legR: [94, 90], props: [{ k: 'column', x: -110 }, { k: 'cable', a: 'handL', b: [-110, -8] }] },
      { view: 'front', armL: [10, 8], armR: [100, 94], legL: [86, 90], legR: [94, 90], props: [{ k: 'column', x: -110 }, { k: 'cable', a: 'handL', b: [-110, -8] }] }],
    arrow: { joint: 'handL', from: [-30, 66], to: [4, 16], bow: 12 },
  },
  triceps_overhead: {
    poses: [stand({ arm: [-98, 112], armFar: [-96, 112], props: [{ k: 'dumbbell', at: 'hand', angle: 90 }] }), stand({ arm: [-94, -92], armFar: [-92, -92], props: [{ k: 'dumbbell', at: 'hand', angle: 90 }] })],
    arrow: { joint: 'hand', from: [-30, 40], to: [-4, 10], bow: 12 },
  },
  triceps_pushdown: {
    poses: [stand({ torso: -84, neck: -86, arm: [96, -36], armFar: [98, -36], props: [{ k: 'column', x: 70 }, { k: 'cable', a: 'hand', b: [70, -186] }, { k: 'handle', at: 'hand' }] }),
      stand({ torso: -84, neck: -86, arm: [96, 92], armFar: [98, 92], props: [{ k: 'column', x: 70 }, { k: 'cable', a: 'hand', b: [70, -186] }, { k: 'handle', at: 'hand' }] })],
    arrow: { joint: 'hand', from: [24, -40], to: [20, -4], bow: -10 },
  },
  triceps_machine: {
    poses: [seated({ arm: [100, -40], armFar: [100, -40], props: [SEAT_BACK(), { k: 'handle', at: 'hand' }] }), seated({ arm: [96, 92], armFar: [96, 92], props: [SEAT_BACK(), { k: 'handle', at: 'hand' }] })],
    arrow: { joint: 'hand', from: [24, -40], to: [20, -4], bow: -10 },
  },
  skull_crusher: {
    poses: [{ torso: 180, neck: 180, arm: [-100, 160], leg: [30, 100], legFar: [32, 98], props: [{ k: 'under', a: 'hip', b: 'shoulder' }, { k: 'dumbbell', at: 'hand', angle: 90 }] },
      { torso: 180, neck: 180, arm: [-92, -90], leg: [30, 100], legFar: [32, 98], props: [{ k: 'under', a: 'hip', b: 'shoulder' }, { k: 'dumbbell', at: 'hand', angle: 90 }] }],
    arrow: { joint: 'hand', from: [-36, 30], to: [-6, 4], bow: 10 },
  },
  bench_dip: {
    poses: [{ torso: -88, neck: -88, arm: [114, 98], armFar: [116, 98], leg: [-4, 70], legFar: [-2, 72], props: [{ k: 'block', a: 'hand', w: 16, off: [-12, 0] }] },
      { torso: -86, neck: -86, arm: [160, 80], armFar: [162, 80], leg: [10, 80], legFar: [12, 82], props: [{ k: 'block', a: 'hand', w: 16, off: [-12, 0] }] }],
    arrow: hipDown,
  },
  triceps_kickback: {
    poses: [stand({ torso: -20, neck: -10, leg: [84, 96], legFar: [86, 96], arm: [166, 90], armFar: [92, 90], props: db1 }),
      stand({ torso: -20, neck: -10, leg: [84, 96], legFar: [86, 96], arm: [166, 166], armFar: [92, 90], props: db1 })],
    arrow: { joint: 'hand', from: [36, 30], to: [4, 4], bow: -10 },
  },
  // ---------- pulling ----------
  seated_row: {
    poses: [seated({ leg: [-6, 40, -60], legFar: [-4, 42, -60], arm: [-2, -2], armFar: [-4, -4], props: [{ k: 'seat', at: 'hip' }, { k: 'column', x: 140, h: 120 }, { k: 'cable', a: 'hand', b: [140, -60] }, { k: 'handle', at: 'hand' }] }),
      seated({ torso: -96, neck: -92, leg: [-6, 40, -60], legFar: [-4, 42, -60], arm: [150, 0], armFar: [152, 0], props: [{ k: 'seat', at: 'hip' }, { k: 'column', x: 140, h: 120 }, { k: 'cable', a: 'hand', b: [140, -60] }, { k: 'handle', at: 'hand' }] })],
    arrow: { joint: 'hand', from: [50, -18], to: [8, -18], bow: -8 },
  },
  high_row: {
    poses: [seated({ arm: [-40, -40], armFar: [-42, -42], props: [SEAT_BACK(), { k: 'handle', at: 'hand' }] }), seated({ arm: [160, -40], armFar: [162, -40], props: [SEAT_BACK(), { k: 'handle', at: 'hand' }] })],
    arrow: { joint: 'hand', from: [50, -30], to: [10, -4], bow: -8 },
  },
  bent_row: {
    poses: [stand({ torso: -26, neck: -14, leg: [82, 98], legFar: [84, 98], arm: [92, 90], armFar: [94, 90], props: dbs }),
      stand({ torso: -26, neck: -14, leg: [82, 98], legFar: [84, 98], arm: [192, 92], armFar: [194, 92], props: dbs })],
    arrow: { joint: 'hand', from: [10, 40], to: [10, 6], bow: 8 },
  },
  single_arm_row: {
    poses: [{ torso: -4, neck: 4, arm: [90, 90], armFar: [92, 90], leg: [100, 82], legFar: [92, 178, 180], props: [{ k: 'block', a: 'kneeFar', b: 'handFar', w: 16 }, ...db1] },
      { torso: -4, neck: 4, arm: [194, 92], armFar: [92, 90], leg: [100, 82], legFar: [92, 178, 180], props: [{ k: 'block', a: 'kneeFar', b: 'handFar', w: 16 }, ...db1] }],
    arrow: { joint: 'hand', from: [10, 40], to: [10, 6], bow: 8 },
  },
  cable_row_standing: {
    poses: [stand({ torso: -84, neck: -86, leg: [70, 100], legFar: [112, 96, 20], arm: [-2, -2], armFar: [93, 90], props: [{ k: 'column', x: 118 }, { k: 'cable', a: 'hand', b: [118, -110] }, { k: 'handle', at: 'hand' }] }),
      stand({ torso: -88, neck: -88, leg: [70, 100], legFar: [112, 96, 20], arm: [150, 0], armFar: [93, 90], props: [{ k: 'column', x: 118 }, { k: 'cable', a: 'hand', b: [118, -110] }, { k: 'handle', at: 'hand' }] })],
    arrow: { joint: 'hand', from: [50, -18], to: [8, -18], bow: -8 },
  },
  trx_row: {
    poses: [{ torso: -116, neck: -112, arm: [-36, -36], armFar: [-38, -38], leg: [64, 64, -20], legFar: [66, 64, -20], props: [{ k: 'strap', a: 'hand', b: [110, -235] }] },
      { torso: -104, neck: -100, arm: [150, -50], armFar: [152, -50], leg: [76, 76, -10], legFar: [78, 76, -10], props: [{ k: 'strap', a: 'hand', b: [110, -235] }] }],
    arrow: { joint: 'shoulder', from: [-30, 10], to: [0, -14], bow: 10 },
  },
  lat_pulldown: {
    poses: [seated({ torso: -96, neck: -92, arm: [-80, -84], armFar: [-82, -86], props: [{ k: 'seat', at: 'hip' }, { k: 'handle', at: 'hand' }, { k: 'cable', a: 'hand', b: [10, -290] }] }),
      seated({ torso: -100, neck: -94, arm: [118, -74], armFar: [120, -76], props: [{ k: 'seat', at: 'hip' }, { k: 'cable', a: 'hand', b: [10, -290] }] })],
    arrow: { joint: 'hand', from: [30, -60], to: [30, -10], bow: -8 },
  },
  face_pull: {
    poses: [stand({ arm: [-14, -14], armFar: [-16, -16], props: [{ k: 'column', x: 118 }, { k: 'cable', a: 'hand', b: [118, -150] }, { k: 'handle', at: 'hand' }] }),
      stand({ arm: [190, -50], armFar: [192, -50], props: [{ k: 'column', x: 118 }, { k: 'cable', a: 'hand', b: [118, -150] }, { k: 'handle', at: 'hand' }] })],
    arrow: { joint: 'hand', from: [56, 0], to: [12, 0], bow: -8 },
  },
  pull_apart: {
    poses: [{ view: 'front', armL: [30, 170], armR: [150, 10], legL: [86, 90], legR: [94, 90], props: [{ k: 'band', a: 'handL', b: 'handR' }] },
      { view: 'front', armL: [2, 0], armR: [178, 180], legL: [86, 90], legR: [94, 90], props: [{ k: 'band', a: 'handL', b: 'handR' }] }],
    arrow: { joint: 'handL', from: [-40, -16], to: [-4, -16], bow: -8 },
  },
  rear_delt: {
    poses: [{ view: 'front', thigh: 0.4, armL: [30, 170], armR: [150, 10], legL: [86, 90], legR: [94, 90], props: [{ k: 'seat', at: 'hip' }, { k: 'handle', at: 'handL' }, { k: 'handle', at: 'handR' }] },
      { view: 'front', thigh: 0.4, armL: [2, 0], armR: [178, 180], legL: [86, 90], legR: [94, 90], props: [{ k: 'seat', at: 'hip' }, { k: 'handle', at: 'handL' }, { k: 'handle', at: 'handR' }] }],
    arrow: { joint: 'handL', from: [-40, -16], to: [-4, -16], bow: -8 },
  },
  biceps_curl: {
    poses: [stand({ props: dbs }), stand({ arm: [96, -70], armFar: [94, -70], props: dbs })],
    arrow: { joint: 'hand', from: [-6, 56], to: [-14, 12], bow: 12 },
  },
  cable_curl: {
    poses: [stand({ props: [{ k: 'column', x: 70, h: 120 }, { k: 'cable', a: 'hand', b: [70, -6] }, { k: 'handle', at: 'hand' }] }), stand({ arm: [96, -70], armFar: [94, -70], props: [{ k: 'column', x: 70, h: 120 }, { k: 'cable', a: 'hand', b: [70, -6] }, { k: 'handle', at: 'hand' }] })],
    arrow: { joint: 'hand', from: [-6, 56], to: [-14, 12], bow: 12 },
  },
  preacher_curl: {
    poses: [seated({ torso: -80, neck: -84, arm: [40, 40], armFar: [42, 42], props: [{ k: 'seat', at: 'hip' }, { k: 'under', a: 'elbow', b: 'shoulder', legs: false }, { k: 'handle', at: 'hand' }] }),
      seated({ torso: -80, neck: -84, arm: [40, -80], armFar: [42, -82], props: [{ k: 'seat', at: 'hip' }, { k: 'handle', at: 'hand' }] })],
    arrow: { joint: 'hand', from: [10, 56], to: [4, 12], bow: 12 },
  },
  high_pull: {
    poses: [stand({ arm: [92, 90], armFar: [94, 90], props: dbs }), stand({ arm: [176, -40], armFar: [178, -40], props: dbs })],
    arrow: { joint: 'hand', from: [10, 56], to: [10, 10], bow: 8 },
  },
  // ---------- core ----------
  breath: {
    poses: [{ view: 'front', armL: [70, 150], armR: [110, 30], legL: [10, 160], legR: [170, 20], thigh: 0.9, props: [{ k: 'mat' }] },
      { view: 'front', armL: [70, 150], armR: [110, 30], legL: [10, 160], legR: [170, 20], thigh: 0.9, props: [{ k: 'mat' }] }],
    labels: ['INHALE', 'EXHALE'],
    arrow: { joint: 'waist', from: [40, 10], to: [40, -24], bow: 10 },
  },
  heel_slide: {
    poses: [supine(), supine({ leg: [-6, -2] })],
    arrow: { joint: 'ankle', from: [-40, 20], to: [0, 20], bow: 6 },
  },
  dead_bug: {
    poses: [supine({ arm: [-90, -90], leg: [-90, 0], legFar: [-88, 2] }), supine({ arm: [-160, -170], leg: [-90, 0], legFar: [-14, -10] })],
    arrow: { joint: 'ankleFar', from: [-40, -40], to: [-6, -10], bow: 10 },
  },
  pallof: {
    poses: [stand({ arm: [130, -10], armFar: [128, -10], props: [{ k: 'column', x: 96 }, { k: 'cable', a: 'hand', b: [96, -110] }, { k: 'handle', at: 'hand' }] }), stand({ arm: [-2, -2], armFar: [-4, -4], props: [{ k: 'column', x: 96 }, { k: 'cable', a: 'hand', b: [96, -110] }, { k: 'handle', at: 'hand' }] })],
    arrow: { joint: 'hand', from: [-44, -16], to: [-6, -16], bow: 8 },
  },
  plank: {
    poses: [{ torso: -4, neck: 0, arm: [90, 0], armFar: [92, 0], leg: [156, 180, 180], legFar: [156, 182, 180], props: [{ k: 'mat' }] },
      { torso: -8, neck: -2, arm: [90, 0], armFar: [92, 0], leg: [172, 172, 100], legFar: [172, 172, 100], props: [{ k: 'mat' }] }],
    labels: ['KNEES DOWN', 'FULL PLANK'],
  },
  side_plank: {
    poses: [{ view: 'front', rotate: -72, armL: [80, 120], armR: [180, 90], legL: [92, 90], legR: [90, 90], props: [{ k: 'mat' }] },
      { view: 'front', rotate: -72, armL: [-80, -90], armR: [180, 90], legL: [92, 90], legR: [90, 90], props: [{ k: 'mat' }] }],
    arrow: { joint: 'hip', from: [0, 40], to: [0, 10], bow: 10 },
  },
  copenhagen: {
    poses: [{ view: 'front', rotate: -78, armL: [80, 120], armR: [180, 90], legL: [92, 90], legR: [70, 100], props: [{ k: 'mat' }, { k: 'block', a: 'ankleL', w: 20 }] },
      { view: 'front', rotate: -78, armL: [-80, -90], armR: [180, 90], legL: [92, 90], legR: [92, 90], props: [{ k: 'mat' }, { k: 'block', a: 'ankleL', w: 20 }] }],
    arrow: { joint: 'hip', from: [0, 40], to: [0, 10], bow: 10 },
  },
  crunch: {
    poses: [supine({ arm: [-150, 30] }), supine({ torso: 206, neck: 214, arm: [-130, 50] })],
    arrow: { joint: 'shoulder', from: [-10, 30], to: [14, -6], bow: 10 },
  },
  bicycle: {
    poses: [supine({ torso: 200, neck: 210, arm: [-130, 50], leg: [-60, 10], legFar: [-10, -10] }), supine({ torso: 206, neck: 214, arm: [-130, 50], leg: [-10, -10], legFar: [-60, 10] })],
    arrow: { joint: 'knee', from: [30, 0], to: [-10, -20], bow: 10 },
  },
  crunch_machine: {
    poses: [seated({ arm: [150, -60], armFar: [150, -60], props: [{ k: 'seat', at: 'hip' }, { k: 'handle', at: 'hand' }] }), seated({ torso: -40, neck: -20, arm: [80, -40], armFar: [80, -40], props: [{ k: 'seat', at: 'hip' }, { k: 'handle', at: 'hand' }] })],
    arrow: { joint: 'shoulder', from: [-10, -40], to: [20, -10], bow: -12 },
  },
  carry: {
    poses: [stand({ leg: [70, 96], legFar: [110, 100, 10], props: dbs }), stand({ leg: [110, 100, 10], legFar: [70, 96], props: dbs })],
    arrow: { joint: 'hip', from: [-30, -140], to: [30, -140], bow: 6 },
  },
  suitcase_carry: {
    poses: [stand({ leg: [70, 96], legFar: [110, 100, 10], props: db1 }), stand({ leg: [110, 100, 10], legFar: [70, 96], props: db1 })],
    arrow: { joint: 'hip', from: [-30, -140], to: [30, -140], bow: 6 },
  },
  wood_chop: {
    poses: [{ view: 'front', tilt: -6, armL: [-50, -50], armR: [-30, -20], legL: [84, 90], legR: [100, 90], props: [{ k: 'column', x: 110 }, { k: 'cable', a: 'handL', b: [110, -186] }, { k: 'handle', at: 'handL' }] },
      { view: 'front', tilt: 8, armL: [130, 120], armR: [140, 140], legL: [70, 100], legR: [100, 86], props: [{ k: 'column', x: 110 }, { k: 'cable', a: 'handL', b: [110, -186] }, { k: 'handle', at: 'handL' }] }],
    arrow: { joint: 'handL', from: [60, -80], to: [12, -14], bow: 14 },
  },
  slam_ball: {
    poses: [stand({ arm: [-96, -94], armFar: [-94, -92], props: [{ k: 'ball', at: 'hand', off: [0, -10] }] }), { ...stand(), torso: -40, neck: -30, ...SQUAT_LEGS, arm: [70, 70], armFar: [72, 72], props: [{ k: 'ball', at: 'hand', off: [6, 6] }] }],
    arrow: { joint: 'hand', from: [-20, -110], to: [10, -20], bow: -14 },
  },
  ball_pass: {
    poses: [supine({ arm: [-170, -175], leg: [-4, 0], legFar: [-2, 2], props: [{ k: 'ball', at: 'hand', off: [-10, 0] }] }), { torso: 220, neck: 228, arm: [-40, -36], leg: [-50, -50], legFar: [-48, -48], props: [{ k: 'mat' }, { k: 'ball', at: 'hand', off: [8, -4] }] }],
    arrow: { joint: 'hand', from: [-80, 30], to: [-10, 10], bow: 20 },
  },
  crab_walk: {
    poses: [{ torso: 196, neck: 190, arm: [100, 96], armFar: [102, 96], leg: [-14, 90], legFar: [-10, 92], props: [{ k: 'mat' }] },
      { torso: 196, neck: 190, arm: [100, 96], armFar: [104, 96], leg: [-6, 96], legFar: [-30, 80], props: [{ k: 'mat' }] }],
    arrow: { joint: 'hip', from: [-30, -40], to: [20, -40], bow: 6 },
  },
  twist: {
    poses: [{ view: 'front', armL: [20, 150], armR: [160, 30], legL: [84, 90], legR: [96, 90] }, { view: 'front', tilt: 4, armL: [-10, -10], armR: [40, 160], legL: [84, 90], legR: [96, 90] }],
    arrow: { joint: 'shoulderL', from: [-30, 20], to: [30, 0], bow: -12 },
  },
  back_ext_machine: {
    poses: [seated({ torso: -50, neck: -40, arm: [80, -60], armFar: [80, -60], props: [{ k: 'seat', at: 'hip' }, { k: 'roller', at: 'shoulder', off: [-18, -2] }] }), seated({ torso: -100, neck: -96, arm: [60, -100], armFar: [60, -100], props: [{ k: 'seat', at: 'hip' }, { k: 'roller', at: 'shoulder', off: [-18, -2] }] })],
    arrow: { joint: 'shoulder', from: [40, 30], to: [-4, -6], bow: 10 },
  },
  // ---------- cardio ----------
  jacks: {
    poses: [{ view: 'front', armL: [80, 86], armR: [100, 94], legL: [86, 90], legR: [94, 90] }, { view: 'front', armL: [-40, -60], armR: [-140, -120], legL: [66, 70], legR: [114, 110] }],
    arrow: { joint: 'handL', from: [10, 90], to: [10, 10], bow: 14 },
  },
  step_jacks: {
    poses: [{ view: 'front', armL: [80, 86], armR: [100, 94], legL: [86, 90], legR: [94, 90] }, { view: 'front', armL: [-40, -60], armR: [-140, -120], legL: [62, 66], legR: [94, 90] }],
    arrow: { joint: 'ankleL', from: [-30, 20], to: [10, 20], bow: 6 },
  },
  mountain_climber: {
    poses: [{ torso: -12, neck: -4, arm: [90, 90], armFar: [92, 90], leg: [168, 168, 100], legFar: [168, 168, 100], props: [{ k: 'mat' }] },
      { torso: -12, neck: -4, arm: [90, 90], armFar: [92, 90], leg: [40, 150, 100], legFar: [168, 168, 100], props: [{ k: 'mat' }] }],
    arrow: { joint: 'knee', from: [-70, 20], to: [-10, 10], bow: 10 },
  },
  squat_jump: {
    poses: [{ ...stand(), torso: -64, neck: -76, ...SQUAT_LEGS, arm: [130, 110], armFar: [132, 112] }, stand({ arm: [-100, -96], armFar: [-98, -94], leg: [90, 90, 60], legFar: [92, 90, 60], lift: 30 })],
    arrow: { joint: 'hip', from: [-40, 40], to: [-40, -10], bow: 10 },
  },
  burpee: {
    poses: [{ torso: -10, neck: -4, arm: [90, 90], armFar: [92, 90], leg: [170, 170, 100], legFar: [170, 170, 100], props: [{ k: 'mat' }] }, stand({ arm: [-100, -96], armFar: [-98, -94], leg: [90, 90, 60], legFar: [92, 90, 60], lift: 24 })],
    arrow: { joint: 'hip', from: [-50, 50], to: [-40, -10], bow: 12 },
  },
  bike: {
    poses: [{ torso: -64, neck: -72, arm: [-6, 30], armFar: [-8, 30], leg: [16, 108, 10], legFar: [56, 112, 20], props: [{ k: 'bike' }] },
      { torso: -64, neck: -72, arm: [-6, 30], armFar: [-8, 30], leg: [56, 112, 20], legFar: [16, 108, 10], props: [{ k: 'bike' }] }],
  },
  rower: {
    poses: [{ torso: -64, neck: -72, arm: [-4, -4], armFar: [-6, -6], leg: [-44, 54, -60], legFar: [-42, 56, -60], props: [{ k: 'rower' }, { k: 'handle', at: 'hand' }] },
      { torso: -104, neck: -98, arm: [150, -10], armFar: [152, -10], leg: [-4, 4, -70], legFar: [-2, 6, -70], props: [{ k: 'rower' }, { k: 'handle', at: 'hand' }] }],
    arrow: { joint: 'hip', from: [40, -10], to: [-30, -10], bow: 6 },
  },
  // ---------- mobility ----------
  cat_cow: {
    poses: [quad({ torso: 4, neck: -36 }), quad({ torso: -8, neck: 60 })],
    labels: ['COW', 'CAT'],
    arrow: { joint: 'chest', from: [-30, -24], to: [-30, -50], bow: 8 },
  },
  childs_pose: {
    poses: [quad(), { torso: 12, neck: 20, arm: [6, 0], armFar: [8, 0], leg: [24, 182, 180], legFar: [26, 182, 180], props: [{ k: 'mat' }] }],
    arrow: { joint: 'hip', from: [50, -30], to: [6, -20], bow: -10 },
  },
  hip_flexor: {
    poses: [stand({ torso: -90, arm: [100, -20], leg: [0, 90], legFar: [104, 180, 180], props: [{ k: 'mat' }] }), stand({ torso: -94, neck: -92, arm: [-96, -92], leg: [12, 96], legFar: [116, 178, 180], props: [{ k: 'mat' }] })],
    arrow: { joint: 'hip', from: [-30, 0], to: [6, 0], bow: 6 },
  },
  open_book: {
    poses: [{ view: 'front', rotate: -90, armL: [-180, -180], armR: [-180, -180], legL: [40, 120], legR: [40, 120], props: [{ k: 'mat' }] },
      { view: 'front', rotate: -90, armL: [10, 10], armR: [-180, -180], legL: [40, 120], legR: [40, 120], props: [{ k: 'mat' }] }],
    arrow: { joint: 'handL', from: [-60, 40], to: [-6, 6], bow: 18 },
  },
  balance: {
    poses: [stand({ arm: [60, 60], armFar: [120, 120] }), stand({ leg: [0, 90, 10], arm: [30, 10], armFar: [150, 170] })],
  },
  balance_pad: {
    poses: [stand({ arm: [60, 60], armFar: [120, 120], lift: 10, props: [{ k: 'pad', x: -30, w: 70 }] }), stand({ leg: [0, 90, 10], arm: [30, 10], armFar: [150, 170], lift: 10, props: [{ k: 'pad', x: -30, w: 70 }] })],
  },
  hip_shift: {
    poses: [{ view: 'front', armL: [70, 120], armR: [110, 60], legL: [80, 92], legR: [100, 88] }, { view: 'front', tilt: -8, armL: [70, 120], armR: [110, 60], legL: [74, 96], legR: [104, 86], props: [] }],
    arrow: { joint: 'hip', from: [-30, -10], to: [20, -10], bow: 6 },
  },
};

export const TEMPLATES = T;
export type TemplateKey = keyof typeof T;
export const templateKeys = Object.keys(T);

/** A best guess at a template from an exercise's name and category, for exercises not in the library. */
export function guessTemplate(name: string, category: string): string {
  const s = name.toLowerCase();
  const has = (...w: string[]) => w.some((x) => s.includes(x));
  if (has('bulgarian')) return 'bulgarian';
  if (has('lunge')) return has('landmine') ? 'landmine_press' : 'reverse_lunge';
  if (has('goblet')) return 'goblet_squat';
  if (has('sumo')) return 'sumo_squat';
  if (has('box squat')) return 'box_squat';
  if (has('trx') && has('squat')) return 'squat_trx';
  if (has('barbell squat', 'smith squat', 'back squat')) return 'squat_bar';
  if (has('jump') && has('squat')) return 'squat_jump';
  if (has('box jump')) return 'box_jump';
  if (has('squat')) return 'squat';
  if (has('bulgarian')) return 'bulgarian';
  if (has('lunge')) return 'reverse_lunge';
  if (has('split')) return 'split_squat';
  if (has('step-up', 'step up')) return 'step_up';
  if (has('single-leg romanian', 'single leg rdl')) return 'single_leg_rdl';
  if (has('deadlift', 'rdl', 'good morning')) return 'rdl';
  if (has('hip thrust')) return 'hip_thrust';
  if (has('single-leg glute bridge', 'single leg bridge')) return 'single_leg_bridge';
  if (has('bridge')) return 'glute_bridge';
  if (has('back extension')) return category === 'Core' ? 'back_ext_machine' : 'back_extension';
  if (has('kickback') && category === 'Upper body') return 'triceps_kickback';
  if (has('kickback', 'glute machine')) return 'kickback';
  if (has('donkey', 'fire hydrant')) return 'donkey_kick';
  if (has('clam')) return 'clamshell';
  if (has('adduction')) return 'hip_adduction_seated';
  if (has('abduction') && has('machine')) return 'hip_abduction_seated';
  if (has('abduction')) return 'hip_abduction_standing';
  if (has('lateral', 'band walk', 'monster')) return category === 'Upper body' ? 'lateral_raise' : 'band_walk';
  if (has('calf')) return 'calf_raise';
  if (has('wall sit')) return 'wall_sit';
  if (has('leg press')) return 'leg_press';
  if (has('leg extension')) return 'leg_extension';
  if (has('prone leg curl', 'lying leg curl')) return 'prone_leg_curl';
  if (has('leg curl', 'hamstring curl')) return 'leg_curl';
  if (has('swing')) return 'kb_swing';
  if (has('march')) return 'march';
  if (has('sled', 'box push')) return 'sled_push';
  if (has('incline push')) return 'incline_push_up';
  if (has('push-up', 'push up', 'pushup')) return 'push_up';
  if (has('bench press', 'barbell')) return 'barbell_bench';
  if (has('incline') && has('press')) return 'incline_press';
  if (has('decline')) return 'decline_press';
  if (has('chest press') && has('machine')) return 'chest_press_machine';
  if (has('chest press')) return 'bench_press';
  if (has('cable') && has('fly') && has('chest')) return 'cable_fly';
  if (has('dumbbell') && has('fly')) return 'chest_fly_lying';
  if (has('delt fly') && has('cable')) return 'cable_lateral';
  if (has('rear delt', 'reverse fly')) return 'rear_delt';
  if (has('fly')) return 'chest_fly_front';
  if (has('shoulder press', 'overhead press', 'military', 'arnold')) return has('machine') ? 'machine_press' : has('seated') ? 'seated_press' : 'overhead_press';
  if (has('lateral raise')) return has('machine') ? 'lateral_raise_machine' : 'lateral_raise';
  if (has('skull')) return 'skull_crusher';
  if (has('dip')) return 'bench_dip';
  if (has('pushdown', 'push-down')) return 'triceps_pushdown';
  if (has('triceps press', 'tricep press')) return 'triceps_machine';
  if (has('overhead tricep', 'overhead triceps', 'triceps extension', 'tricep extension')) return 'triceps_overhead';
  if (has('high pull', 'upright row')) return 'high_pull';
  if (has('trx row', 'inverted row')) return 'trx_row';
  if (has('single-arm cable row', 'single arm cable row')) return 'cable_row_standing';
  if (has('single-arm row', 'single arm row', 'dumbbell row')) return 'single_arm_row';
  if (has('bent-over row', 'bent over row')) return 'bent_row';
  if (has('high row')) return 'high_row';
  if (has('row')) return 'seated_row';
  if (has('pulldown', 'pull-down', 'pull-up', 'pull up', 'rope pull')) return 'lat_pulldown';
  if (has('face pull')) return 'face_pull';
  if (has('pull-apart', 'pull apart')) return 'pull_apart';
  if (has('cable') && has('curl')) return 'cable_curl';
  if (has('preacher', 'dependent', 'machine curl')) return 'preacher_curl';
  if (has('curl')) return 'biceps_curl';
  if (has('breath')) return 'breath';
  if (has('heel slide')) return 'heel_slide';
  if (has('dead bug')) return 'dead_bug';
  if (has('bird dog')) return 'bird_dog';
  if (has('pallof')) return 'pallof';
  if (has('copenhagen')) return 'copenhagen';
  if (has('side plank')) return 'side_plank';
  if (has('plank')) return 'plank';
  if (has('bicycle', 'cross-body', 'cross body')) return 'bicycle';
  if (has('crunch')) return has('machine') ? 'crunch_machine' : 'crunch';
  if (has('suitcase')) return 'suitcase_carry';
  if (has('carry', 'farmer')) return 'carry';
  if (has('chop')) return 'wood_chop';
  if (has('slam')) return 'slam_ball';
  if (has('ball pass')) return 'ball_pass';
  if (has('crab')) return 'crab_walk';
  if (has('jumping jack')) return 'jacks';
  if (has('jack')) return 'step_jacks';
  if (has('mountain')) return 'mountain_climber';
  if (has('burpee')) return 'burpee';
  if (has('bike', 'cycle')) return 'bike';
  if (has('row')) return 'rower';
  if (has('cat-cow', 'cat cow')) return 'cat_cow';
  if (has("child")) return 'childs_pose';
  if (has('hip flexor')) return 'hip_flexor';
  if (has('open book', 'rotation')) return 'open_book';
  if (has('foam', 'pad')) return 'balance_pad';
  if (has('balance')) return 'balance';
  if (has('hip shift')) return 'hip_shift';
  if (has('twist', 'rotational', 'z core')) return 'twist';
  if (category === 'Lower body') return 'squat';
  if (category === 'Upper body') return 'overhead_press';
  if (category === 'Core') return 'dead_bug';
  if (category === 'Cardio') return 'march';
  return 'balance';
}

export function template(key: string): Template {
  return T[key] || T.balance;
}
export type { Pose };
