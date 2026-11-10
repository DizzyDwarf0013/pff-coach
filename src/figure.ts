// Exercise figures, drawn from joint angles in a flat vector style: tapered limbs, a crop top and
// leggings, and a friendly face with a top bun. Each exercise is two poses (start and finish) with
// an arrow for the movement. No image files: every picture is built here, so new exercises get one too.
//
// Angles are in degrees: 0 = right, 90 = down, -90 = up, 180 = left (SVG y grows downward).
// Side view faces right. Front view faces the viewer; "L" is the figure's left (the viewer's right).

export type Pt = [number, number];
type Leg = [number, number] | [number, number, number];

export interface SidePose {
  view?: 'side';
  torso: number;
  neck?: number;
  arm: [number, number];
  armFar?: [number, number];
  leg: Leg;
  legFar?: Leg;
  /** raise the figure off the floor (standing on a box) */
  lift?: number;
  props?: Prop[];
}
export interface FrontPose {
  view: 'front';
  /** torso lean from upright, degrees (positive leans to the viewer's right) */
  tilt?: number;
  armL: [number, number];
  armR: [number, number];
  legL: [number, number];
  legR: [number, number];
  /** rotate the whole figure about the hips (side-lying, side plank) */
  rotate?: number;
  /** thigh length as a share of normal, for thighs pointing at the viewer (seated) */
  thigh?: number;
  lift?: number;
  props?: Prop[];
}
export type Pose = SidePose | FrontPose;

/** Where a prop attaches: a joint name, or a point relative to the hips' floor spot. */
type At = string | Pt;
export type Prop = (
  | { k: 'block'; a: At; b?: At; w?: number }
  | { k: 'plate'; at: At; angle: number }
  | { k: 'dumbbell'; at: At; angle?: number }
  | { k: 'kettlebell'; at: At }
  | { k: 'barbell'; at: At }
  | { k: 'ball'; at: At; r?: number }
  | { k: 'band'; a: At; b: At }
  | { k: 'cable'; a: At; b: At }
  | { k: 'column'; x: number; h?: number }
  | { k: 'bench'; x: number; w: number; h: number; tilt?: number }
  | { k: 'under'; a: At; b: At; legs?: boolean }
  | { k: 'seat'; at: At; back?: number; backLen?: number; w?: number }
  | { k: 'box'; x: number; w: number; h: number }
  | { k: 'wall'; x: number }
  | { k: 'mat'; w?: number; x?: number }
  | { k: 'roller'; at: At }
  | { k: 'kneepad'; at: At }
  | { k: 'handle'; at: At }
  | { k: 'bar'; a: At; b: At }
  | { k: 'strap'; a: At; b: At }
  | { k: 'bike' }
  | { k: 'rower' }
  | { k: 'sled'; at: At }
  | { k: 'pad'; x: number; w: number }
) & { off?: Pt };

export interface Template {
  poses: [Pose, Pose];
  /** movement arrow in the finish frame, relative to a joint */
  arrow?: { joint: string; from: Pt; to: Pt; bow?: number };
  scale?: number;
  /** frame labels, if not START and FINISH (e.g. INHALE / EXHALE) */
  labels?: [string, string];
}

const L = { torso: 72, neck: 9, head: 17, ua: 38, fa: 34, th: 52, sh: 50, foot: 20 };
const C = {
  skin: '#EDB894', skinFar: '#D79E79', cheek: '#F29AA5',
  top: '#EE6FBB', legs: '#3B3337', legsFar: '#2A2427',
  shoe: '#FFFFFF', shoeFar: '#ECE7EA', sole: '#D9D1D6', lace: '#EE6FBB', hair: '#3A2724', hairShine: '#5A3E39',
  prop: '#57505A', propLight: '#8A8290', propPale: '#C9C1C7', mat: '#F9D3EA', arrow: '#E0457B', mouth: '#9B3B4A',
  band: '#4FB3A9', cable: '#8A8290', ball: '#F59E5B', pad: '#B9A9F0',
};

const rad = (a: number) => (a * Math.PI) / 180;
const step = (p: Pt, a: number, len: number): Pt => [p[0] + len * Math.cos(rad(a)), p[1] + len * Math.sin(rad(a))];
const ang = (a: Pt, b: Pt) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const n = (v: number) => (Math.round(v * 10) / 10).toString();

function capsule(a: Pt, b: Pt, r1: number, r2: number, color: string): string {
  const t = ang(a, b) - 90;
  const a1 = step(a, t, r1), a2 = step(a, t + 180, r1), b1 = step(b, t, r2), b2 = step(b, t + 180, r2);
  return `<path d="M${n(a1[0])} ${n(a1[1])}L${n(b1[0])} ${n(b1[1])}L${n(b2[0])} ${n(b2[1])}L${n(a2[0])} ${n(a2[1])}Z" fill="${color}"/>`
    + `<circle cx="${n(a[0])}" cy="${n(a[1])}" r="${r1}" fill="${color}"/><circle cx="${n(b[0])}" cy="${n(b[1])}" r="${r2}" fill="${color}"/>`;
}
const circle = (p: Pt, r: number, color: string, extra = '') => `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="${r}" fill="${color}" ${extra}/>`;
const rect = (x: number, y: number, w: number, h: number, color: string, rx = 3) => `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0, w))}" height="${n(Math.max(0, h))}" rx="${rx}" fill="${color}"/>`;
const seg = (a: Pt, b: Pt, color: string, w: number, dash = '') => `<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;

// ---- body parts ----

/** A friendly face turned toward the viewer, rotated to sit on the neck. `na` is the neck direction. */
function head(h: Pt, na: number): string {
  const R = L.head;
  const g = [
    `<circle cx="${-R + 1}" cy="2" r="4" fill="${C.skinFar}"/><circle cx="${R - 1}" cy="2" r="4" fill="${C.skinFar}"/>`,
    `<circle cx="0" cy="0" r="${R}" fill="${C.skin}"/>`,
    `<path d="M${-R - 0.5} 1C${-R - 1} ${-R - 2} ${R + 1} ${-R - 2} ${R + 0.5} 1C${R - 2} -6 ${R - 6} -9 4 -9C-2 -9 -4 -4 -8 -3C${-R + 3} -2 ${-R + 1} -1 ${-R - 0.5} 1Z" fill="${C.hair}"/>`,
    `<circle cx="0" cy="${-R - 5}" r="8.5" fill="${C.hair}"/><circle cx="-2.5" cy="${-R - 7.5}" r="2.3" fill="${C.hairShine}"/>`,
    `<rect x="-6" y="${-R - 1.5}" width="12" height="4" rx="2" fill="${C.top}"/>`,
    `<path d="M-9 1.5Q-6 -2.5 -3 1.5M3 1.5Q6 -2.5 9 1.5" stroke="${C.hair}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    `<circle cx="-10" cy="6" r="3.2" fill="${C.cheek}" opacity=".6"/><circle cx="10" cy="6" r="3.2" fill="${C.cheek}" opacity=".6"/>`,
    `<path d="M-5 6.5Q0 13.5 5 6.5Z" fill="${C.mouth}"/><path d="M-3.8 6.9Q0 9.2 3.8 6.9Z" fill="#FFF"/>`,
  ];
  return `<g transform="translate(${n(h[0])} ${n(h[1])}) rotate(${n(na + 90)})">${g.join('')}</g>`;
}
function shoe(ankle: Pt, toe: Pt, far: boolean): string {
  const dir = ang(ankle, toe);
  const heel = step(ankle, dir + 180, 3);
  return capsule(heel, toe, 6, 5, far ? C.shoeFar : C.shoe) + capsule(step(heel, dir + 90, 4.5), step(toe, dir + 90, 4.5), 1.8, 1.8, C.sole)
    + circle(step(lerp(heel, toe, 0.5), dir - 90, 2.5), 1.6, C.lace);
}
const arm = (sh: Pt, el: Pt, hand: Pt, far: boolean) => {
  const col = far ? C.skinFar : C.skin;
  return capsule(sh, el, 5.6, 4.4, col) + capsule(el, hand, 4.4, 3.4, col) + circle(hand, 5.2, col);
};
const leg = (hip: Pt, knee: Pt, ankle: Pt, far: boolean) => {
  const col = far ? C.legsFar : C.legs;
  return capsule(hip, knee, 11, 7, col) + capsule(knee, ankle, 7, 4.6, col);
};

// ---- skeletons ----

type Joints = Record<string, Pt>;

function sideJoints(p: SidePose): Joints {
  const hip: Pt = [0, 0];
  const shoulder = step(hip, p.torso, L.torso);
  const na = p.neck ?? p.torso;
  const j: Joints = { hip, shoulder, head: step(shoulder, na, L.neck + L.head), waist: lerp(hip, shoulder, 0.35), chest: lerp(hip, shoulder, 0.72) };
  const a = (k: string, v: [number, number]) => { j[`elbow${k}`] = step(shoulder, v[0], L.ua); j[`hand${k}`] = step(j[`elbow${k}`], v[1], L.fa); };
  const l = (k: string, v: Leg) => { j[`knee${k}`] = step(hip, v[0], L.th); j[`ankle${k}`] = step(j[`knee${k}`], v[1], L.sh); j[`toe${k}`] = step(j[`ankle${k}`], v[2] ?? 0, L.foot); };
  a('', p.arm); a('Far', p.armFar || p.arm); l('', p.leg); l('Far', p.legFar || p.leg);
  return j;
}

function frontJoints(p: FrontPose): Joints {
  const up = -90 + (p.tilt || 0);
  const hip: Pt = [0, 0];
  const shoulder = step(hip, up, L.torso);
  const j: Joints = { hip, shoulder, head: step(shoulder, up, L.neck + L.head), waist: lerp(hip, shoulder, 0.35), chest: lerp(hip, shoulder, 0.72) };
  j.shoulderL = step(shoulder, up + 90, 17); j.shoulderR = step(shoulder, up - 90, 17);
  j.hipL = step(hip, up + 90, 9); j.hipR = step(hip, up - 90, 9);
  for (const k of ['L', 'R'] as const) {
    const av = k === 'L' ? p.armL : p.armR, lv = k === 'L' ? p.legL : p.legR;
    j[`elbow${k}`] = step(j[`shoulder${k}`], av[0], L.ua); j[`hand${k}`] = step(j[`elbow${k}`], av[1], L.fa);
    j[`knee${k}`] = step(j[`hip${k}`], lv[0], L.th * (p.thigh ?? 1)); j[`ankle${k}`] = step(j[`knee${k}`], lv[1], L.sh);
    j[`toe${k}`] = step(j[`ankle${k}`], k === 'L' ? 15 : 165, 9);
  }
  if (p.rotate) {
    for (const k in j) { const d = Math.hypot(j[k][0], j[k][1]), a = Math.atan2(j[k][1], j[k][0]) * 180 / Math.PI; j[k] = step([0, 0], a + p.rotate, d); }
  }
  return j;
}

/** How far each joint reaches below its center (limb and shoe thickness). */
function reach(k: string): number {
  if (k.startsWith('toe') || k.startsWith('ankle')) return 8;
  if (k === 'hip' || k.startsWith('hip')) return 15;
  if (k === 'head') return L.head + 1;
  if (k.startsWith('shoulder') || k === 'chest' || k === 'waist') return 14;
  if (k.startsWith('knee')) return 7;
  return 5;
}
const bodyKeys = (j: Joints) => Object.keys(j);

// ---- drawing ----

export interface Drawn { svg: string; joints: Joints; top: number; left: number; right: number }

/**
 * Draws one pose with its feet (or whatever is lowest) on y = floor and its body centered on x = cx.
 * Returns the joints in drawing coordinates, for arrows.
 */
export function drawPose(pose: Pose, cx: number, floor: number, scale = 1): Drawn {
  const front = pose.view === 'front';
  const raw = front ? frontJoints(pose as FrontPose) : sideJoints(pose as SidePose);
  const keys = bodyKeys(raw);
  const low = Math.max(...keys.map((k) => raw[k][1] + reach(k)));
  const xs = keys.map((k) => raw[k][0]);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const dx = cx - midX, dy = floor - low - (pose.lift || 0);
  const J: Joints = {};
  for (const k of keys) J[k] = [raw[k][0] + dx, raw[k][1] + dy];
  const hx = J.hip[0];
  const back: string[] = [], fore: string[] = [];
  for (const pr of pose.props || []) {
    const off = pr.off || [0, 0];
    const at = (a: At): Pt => { const p = typeof a === 'string' ? J[a] || J.hip : [hx + a[0], floor + a[1]] as Pt; return [p[0] + off[0], p[1] + off[1]]; };
    drawProp(pr, at, hx, floor, back, fore);
  }

  const s: string[] = [...back];
  if (front) {
    const p = pose as FrontPose;
    const up = -90 + (p.tilt || 0) + (p.rotate || 0);
    s.push(leg(J.hipL, J.kneeL, J.ankleL, false), leg(J.hipR, J.kneeR, J.ankleR, false));
    s.push(shoe(J.ankleL, J.toeL, false), shoe(J.ankleR, J.toeR, false));
    s.push(capsule(J.hip, J.waist, 19, 15, C.legs));
    s.push(capsule(J.waist, lerp(J.hip, J.shoulder, 0.5), 15, 14.5, C.skin));
    s.push(capsule(lerp(J.hip, J.shoulder, 0.5), J.shoulder, 17, 17, C.top));
    s.push(capsule(step(J.shoulder, up, 2), step(J.shoulder, up, L.neck + 6), 5, 4.5, C.skin));
    s.push(head(J.head, up));
    s.push(arm(J.shoulderL, J.elbowL, J.handL, false), arm(J.shoulderR, J.elbowR, J.handR, false));
  } else {
    const p = pose as SidePose;
    const na = p.neck ?? p.torso;
    s.push(arm(J.shoulder, J.elbowFar, J.handFar, true));
    s.push(leg(J.hip, J.kneeFar, J.ankleFar, true), shoe(J.ankleFar, J.toeFar, true));
    const t = (f: number) => lerp(J.hip, J.shoulder, f);
    s.push(capsule(J.hip, t(0.42), 16.5, 13.5, C.skin), capsule(t(0.42), J.shoulder, 13.5, 13, C.skin));
    s.push(capsule(J.hip, t(0.32), 17, 14, C.legs));
    s.push(capsule(t(0.5), t(0.78), 14.5, 16, C.top), capsule(t(0.78), J.shoulder, 16, 12.5, C.top));
    s.push(capsule(step(J.shoulder, na, 2), step(J.shoulder, na, L.neck + 6), 5, 4.5, C.skin));
    s.push(head(J.head, na));
    s.push(leg(J.hip, J.knee, J.ankle, false), shoe(J.ankle, J.toe, false));
    s.push(arm(J.shoulder, J.elbow, J.hand, false));
  }
  s.push(...fore);

  // scale about the floor point, so the figure stays grounded
  const S: Joints = {};
  for (const k of keys) S[k] = [cx + (J[k][0] - cx) * scale, floor + (J[k][1] - floor) * scale];
  const ys = keys.map((k) => S[k][1]);
  const sx = keys.map((k) => S[k][0]);
  return {
    svg: `<g transform="translate(${n(cx)} ${n(floor)}) scale(${scale}) translate(${n(-cx)} ${n(-floor)})">${s.join('')}</g>`,
    joints: S,
    top: Math.min(...ys) - (L.head + 16) * scale,
    left: Math.min(...sx) - (L.head + 16) * scale,
    right: Math.max(...sx) + (L.head + 16) * scale,
  };
}

function dumbbell(at: Pt, angle: number): string {
  const a = step(at, angle, 10), b = step(at, angle + 180, 10);
  const plate = (p: Pt) => capsule(step(p, angle + 90, 6), step(p, angle - 90, 6), 4, 4, C.prop);
  return capsule(a, b, 2, 2, C.propLight) + plate(a) + plate(b);
}

function drawProp(pr: Prop, at: (a: At) => Pt, cx: number, floor: number, back: string[], fore: string[]) {
  switch (pr.k) {
    case 'block': {
      // a box or bench whose top sits just under one or two joints (a foot on a step, a knee on a bench)
      const a = at(pr.a), b = pr.b ? at(pr.b) : a;
      const top = Math.max(a[1], b[1]) + (pr.b ? 6 : 8);
      const x1 = Math.min(a[0], b[0]) - (pr.w || 24), x2 = Math.max(a[0], b[0]) + (pr.w || 24);
      back.push(rect(x1, top, x2 - x1, floor - top, C.propPale, 5) + rect(x1, top, x2 - x1, 8, C.propLight, 4));
      break;
    }
    case 'plate': { const p = at(pr.at); back.push(capsule(step(p, pr.angle, 22), step(p, pr.angle + 180, 22), 5, 5, C.prop)); break; }
    case 'dumbbell': fore.push(dumbbell(at(pr.at), pr.angle ?? 0)); break;
    case 'kettlebell': {
      const h = at(pr.at);
      fore.push(`<path d="M${n(h[0] - 7)} ${n(h[1] + 2)}Q${n(h[0])} ${n(h[1] - 8)} ${n(h[0] + 7)} ${n(h[1] + 2)}" stroke="${C.prop}" stroke-width="3.5" fill="none"/>` + circle([h[0], h[1] + 13], 11, C.prop));
      break;
    }
    case 'barbell': { const p = at(pr.at); (pr.at === 'shoulder' ? back : fore).push(circle(p, 14, C.prop) + circle(p, 4.5, C.propLight)); break; }
    case 'ball': fore.push(circle(at(pr.at), pr.r || 12, C.ball) + `<path d="M${n(at(pr.at)[0] - (pr.r || 12))} ${n(at(pr.at)[1])}h${(pr.r || 12) * 2}" stroke="#E07B3A" stroke-width="2"/>`); break;
    case 'band': fore.push(seg(at(pr.a), at(pr.b), C.band, 4)); break;
    case 'cable': back.push(seg(at(pr.a), at(pr.b), C.cable, 2)); break;
    case 'strap': back.push(seg(at(pr.a), at(pr.b), '#3B3337', 3)); break;
    case 'handle': fore.push(capsule(step(at(pr.at), -90, 6), step(at(pr.at), 90, 6), 3, 3, C.prop)); break;
    case 'bar': fore.push(capsule(at(pr.a), at(pr.b), 2.5, 2.5, C.prop)); break;
    case 'column': back.push(rect(cx + pr.x - 6, floor - (pr.h || 190), 12, pr.h || 190, C.propPale, 4) + circle([cx + pr.x, floor - (pr.h || 190) + 6], 6, C.propLight)); break;
    case 'wall': back.push(rect(cx + pr.x, floor - 200, 14, 200, C.propPale, 2)); break;
    case 'mat': back.push(rect(cx + (pr.x ?? -120), floor - 6, pr.w || 240, 8, C.mat, 4)); break;
    case 'pad': back.push(rect(cx + pr.x, floor - 10, pr.w, 12, C.pad, 5)); break;
    case 'box': back.push(rect(cx + pr.x, floor - pr.h, pr.w, pr.h, C.propPale, 5) + rect(cx + pr.x, floor - pr.h, pr.w, 8, C.propLight, 4)); break;
    case 'bench': {
      const t = pr.tilt || 0;
      const a: Pt = [cx + pr.x, floor - pr.h], b = step(a, -t, pr.w);
      back.push(capsule(a, b, 5, 5, C.prop));
      const mid = lerp(a, b, 0.5);
      back.push(rect(mid[0] - 4, Math.max(a[1], b[1]), 8, floor - Math.max(a[1], b[1]), C.propLight, 2), rect(mid[0] - 22, floor - 6, 44, 6, C.propLight, 3));
      break;
    }
    case 'under': {
      // a pad along the body between two joints (lying on a bench), with a stand to the floor
      // on whichever side of the body faces the floor
      const a = at(pr.a), b = at(pr.b), d = ang(a, b);
      const side = step(a, d + 90, 18)[1] >= step(a, d - 90, 18)[1] ? d + 90 : d - 90;
      const pa = step(a, side, 18), pb = step(b, side, 18);
      back.push(capsule(pa, pb, 5, 5, C.prop));
      if (pr.legs !== false) {
        const m = lerp(pa, pb, 0.5);
        back.push(rect(m[0] - 4, m[1], 8, floor - m[1], C.propLight, 2), rect(m[0] - 24, floor - 6, 48, 6, C.propLight, 3));
      }
      break;
    }
    case 'seat': {
      const h = at(pr.at);
      const top = h[1] + 15;
      const sw = pr.w || 40;
      back.push(rect(h[0] - sw / 2 - 2, top, sw, 8, C.prop, 4), rect(h[0] - 4, top + 6, 8, floor - top - 6, C.propLight, 2), rect(h[0] - 22, floor - 6, 44, 6, C.propLight, 3));
      if (pr.back !== undefined) {
        const base: Pt = [h[0] - 22, top + 2];
        back.push(capsule(base, step(base, pr.back, pr.backLen || 70), 5, 5, C.prop));
      }
      break;
    }
    case 'roller': fore.push(circle(at(pr.at), 7, C.pad)); break;
    case 'kneepad': { const p = at(pr.at); fore.push(rect(p[0] - 5, p[1] - 12, 10, 24, C.pad, 4)); break; }
    case 'sled': {
      const h = at(pr.at);
      back.push(rect(h[0] + 2, h[1] - 6, 10, floor - h[1] + 6, C.propLight, 3), rect(h[0] - 6, floor - 22, 46, 22, C.prop, 4));
      break;
    }
    case 'bike': {
      // built around the rider: seat under the hips, cranks below and ahead, flywheel in front
      const h = at('hip'), top = h[1] + 15;
      const crank: Pt = [h[0] + 30, h[1] + 66], fly: Pt = [h[0] + 76, floor - 28], bar: Pt = [h[0] + 66, h[1] - 34];
      back.push(rect(h[0] - 18, top, 34, 8, C.prop, 4), seg([h[0] - 2, top + 6], [crank[0], crank[1]], C.prop, 7), seg([h[0] - 2, top + 6], [h[0] - 14, floor - 4], C.propLight, 6),
        seg(crank, [fly[0], fly[1]], C.prop, 6), seg([fly[0] - 6, fly[1] - 20], bar, C.prop, 6), rect(bar[0] - 4, bar[1] - 4, 22, 7, C.prop, 3),
        circle(fly, 26, C.propPale), circle(crank, 9, C.propLight), rect(h[0] - 30, floor - 6, 140, 6, C.propLight, 3));
      break;
    }
    case 'rower': {
      back.push(rect(cx - 120, floor - 16, 230, 8, C.prop, 4), rect(cx + 90, floor - 44, 26, 44, C.propPale, 6), rect(cx - 120, floor - 6, 12, 6, C.propLight, 2));
      break;
    }
  }
}

/** A curved arrow from a to b, bowed to one side. */
export function arrow(a: Pt, b: Pt, bow = 12): string {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const an = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const qx = mx + bow * Math.cos(an - Math.PI / 2), qy = my + bow * Math.sin(an - Math.PI / 2);
  const end = Math.atan2(b[1] - qy, b[0] - qx);
  const hx = (d: number) => n(b[0] - 10 * Math.cos(end + d)), hy = (d: number) => n(b[1] - 10 * Math.sin(end + d));
  return `<path d="M${n(a[0])} ${n(a[1])}Q${n(qx)} ${n(qy)} ${n(b[0])} ${n(b[1])}" fill="none" stroke="${C.arrow}" stroke-width="4" stroke-linecap="round"/>`
    + `<path d="M${hx(0.5)} ${hy(0.5)}L${n(b[0])} ${n(b[1])}L${hx(-0.5)} ${hy(-0.5)}" fill="none" stroke="${C.arrow}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/**
 * The full start → finish picture for an exercise. Sized to fit: the height follows the tallest pose,
 * and figures shrink if a pose would run out of its half.
 */
export function exerciseArt(t: Template, opts: { w?: number; labels?: boolean } = {}): string {
  const w = opts.w || 420;
  const labels = opts.labels !== false;
  let scale = t.scale || 0.8;
  const floorAt = 1000; // measure first at an arbitrary floor, then place
  const measure = (sc: number) => t.poses.map((p, i) => drawPose(p, w * (i ? 0.75 : 0.25), floorAt, sc));
  let m = measure(scale);
  const widest = Math.max(...m.map((d) => d.right - d.left));
  if (widest > w / 2 - 8) { scale *= (w / 2 - 8) / widest; m = measure(scale); }
  const tallest = Math.max(...m.map((d) => floorAt - d.top));
  const h = Math.max(150, Math.ceil(tallest + (labels ? 46 : 26)));
  const floor = h - 22;
  const [a, b] = t.poses.map((p, i) => drawPose(p, w * (i ? 0.75 : 0.25), floor, scale));
  let mv = '';
  if (t.arrow) {
    const j = b.joints[t.arrow.joint] || b.joints.hip;
    mv = arrow([j[0] + t.arrow.from[0] * scale, j[1] + t.arrow.from[1] * scale], [j[0] + t.arrow.to[0] * scale, j[1] + t.arrow.to[1] * scale], t.arrow.bow ?? 12);
  }
  let dots = '';
  for (let x = 14; x <= w - 14; x += 12) dots += `<circle cx="${x}" cy="${floor + 8}" r="2.2" fill="#D9D1D6"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">`
    + `<rect width="${w}" height="${h}" fill="#FDE8F4"/>${dots}`
    + `<line x1="${w / 2}" y1="${labels ? 30 : 12}" x2="${w / 2}" y2="${floor - 6}" stroke="#F3C4DF" stroke-width="2" stroke-dasharray="4 6"/>`
    + a.svg + b.svg + mv
    + (labels ? [t.labels?.[0] || 'START', t.labels?.[1] || 'FINISH'].map((txt, i) => `<text x="${i ? w / 2 + 14 : 16}" y="24" font-family="Atkinson Hyperlegible, sans-serif" font-weight="700" font-size="13" fill="#B8287F">${txt}</text>`).join('') : '')
    + `</svg>`;
}
