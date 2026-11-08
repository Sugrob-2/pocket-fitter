import data from './data/takomo-products.json' with { type: 'json' };
import { INCH_M, MPH_MPS, YARD_M } from './units.ts';

export interface FittingProfile {
  age: number | null; sex: 'male' | 'female' | 'unknown'; score: number | null;
  speedMps: number | null; carryM: number | null; heightM: number | null; wristToFloorM: number | null;
  handedness: 'right' | 'left' | 'unknown'; glove: 'XS' | 'S' | 'M' | 'M/L' | 'L' | 'XL' | 'unknown';
  priorities: string[]; flight: 'low' | 'mid' | 'high' | 'unknown'; tempo: 'smooth' | 'moderate' | 'quick' | 'unknown';
}
export const emptyFittingProfile = (): FittingProfile => ({ age: null, sex:'unknown', score:null, speedMps:null,carryM:null,heightM:null,wristToFloorM:null,handedness:'unknown',glove:'unknown',priorities:[],flight:'unknown',tempo:'unknown' });
export const HEADS = data.heads.map(h => ({ id:h.slug,name:h.name,loftDeg:h.seven_iron_loft_deg,targetBucket:h.target_score_bucket,ratings:h.ratings,stockShafts:h.stock_shafts }));
export const SHAFTS = data.shafts.map(s => ({ id:s.slug,model:s.model,flex:s.flex,material:s.material,weightKg:s.weight_g / 1000,heads:s.heads,flight:s.flight_profile,tempo:s.tempo_profile as string[] | null }));
export type Head = typeof HEADS[number];
export type Shaft = typeof SHAFTS[number];
export const LENGTH_OPTIONS_M = data.length_options_in.map(inches => inches * INCH_M);
export const LIE_OPTIONS_DEG = data.lie_options_deg;
export const GRIPS = ['standard','midsize','oversize'] as const;
export type Grip = typeof GRIPS[number];
export const FLEXES = ['lady','senior','regular','stiff','x-stiff'];
export interface FittingRecommendation {
  head: Head; score: number; shaft: Shaft | null; targetFlex: string | null;
  lengthAdjustmentM: number | null; lieDeg: number | null; grip: Grip | null; purchase: 'stock' | 'custom' | null;
  reasons: string[];
}
export interface FitResult { recommendations: FittingRecommendation[]; missing: string[]; warnings: string[]; known: number; total: number; }
const SPEED_POINTS = [[7,5,3,1,1],[4,5,3,1,1],[3,4,5,3,3],[2,3,4,5,5],[1,2,3,5,5]];
const PRIORITIES = ['forgiveness','distance','forged feel','distance control','workability','less offset','more offset'];
function valid(value: number | null, min: number, max: number) { return value !== null && Number.isFinite(value) && value >= min && value <= max ? value : null; }
export function speedBucket(speedMps: number): number {
  return speedMps < 60 * MPH_MPS ? 1 : speedMps <= 70 * MPH_MPS ? 2 : speedMps <= 80 * MPH_MPS ? 3 : speedMps <= 90 * MPH_MPS ? 4 : 5;
}
export function carryBucket(carryM: number): number {
  return carryM < 120 * YARD_M ? 1 : carryM <= 135 * YARD_M ? 2 : carryM <= 155 * YARD_M ? 3 : carryM <= 175 * YARD_M ? 4 : 5;
}
function roundEven(n: number) { const lo = Math.floor(n); return Math.abs(n - lo - .5) < 1e-10 ? (lo % 2 === 0 ? lo : lo + 1) : Math.round(n); }
export function purchaseFor(head: Head, shaft: Shaft | null, lengthM: number | null, lie: number | null, grip: string | null): 'stock' | 'custom' | null {
  if (!shaft || lengthM === null || lie === null || !grip) return null;
  return shaft.material === 'steel' && head.stockShafts.includes(shaft.model) && Math.abs(lengthM) < 1e-8 && lie === 0 && ['standard','midsize'].includes(grip) ? 'stock' : 'custom';
}
export function checkBuild(head: Head, shaft: Shaft | null, lengthM: number | null, lie: number | null, grip: string | null): string[] {
  const issues: string[] = [];
  if (shaft && !shaft.heads.includes(head.id)) issues.push('incompatible_shaft');
  if (lengthM !== null && !LENGTH_OPTIONS_M.some(v => Math.abs(v - lengthM) < 1e-8)) issues.push('invalid_length');
  if (lie !== null && !LIE_OPTIONS_DEG.includes(lie)) issues.push('invalid_lie');
  if (grip !== null && !GRIPS.includes(grip as Grip)) issues.push('invalid_grip');
  return issues;
}
export function fit(profile: FittingProfile): FitResult {
  const age = valid(profile.age,10,100), score = valid(profile.score,40,160), height = valid(profile.heightM,.8,2.5), wrist = valid(profile.wristToFloorM,.4,1.3);
  const speed = valid(profile.speedMps,10,65), carry = valid(profile.carryM,20,250);
  const warnings: string[] = ['static_lie','catalog_snapshot'];
  for (const [name,input,checked] of [['age',profile.age,age],['score',profile.score,score],['height',profile.heightM,height],['wrist',profile.wristToFloorM,wrist],['speed',profile.speedMps,speed],['carry',profile.carryM,carry]] as const) if (input !== null && checked === null) warnings.push(`invalid_${name}`);
  const sb = speed !== null ? speedBucket(speed) : carry !== null ? carryBucket(carry) : null;
  if (speed === null && carry !== null) warnings.push('carry_proxy');
  if (speed !== null && carry !== null && speedBucket(speed) !== carryBucket(carry)) warnings.push('speed_carry_disagree');
  if (wrist !== null && height !== null && wrist >= height) warnings.push('inconsistent_body');
  const scoreBucket = score === null ? null : score < 71 ? 1 : score <= 77 ? 2 : score <= 84 ? 3 : score <= 92 ? 4 : 5;
  const flex = sb === null ? null : sb === 1 ? profile.sex === 'female' ? 'lady' : profile.sex === 'male' ? 'senior' : null : FLEXES[sb - 1];
  // Unknown demographics cannot silently become a male, under-70 default.
  const material = flex === null ? null : ['lady','senior'].includes(flex) || profile.sex === 'female' || (age !== null && age >= 70) ? 'graphite' : profile.sex === 'male' && age !== null ? 'steel' : null;
  const missing: string[] = [];
  if (scoreBucket === null) missing.push('score');
  if (sb === null) missing.push('speed_or_carry');
  if (height === null) missing.push('height');
  if (wrist === null) missing.push('wrist');
  if (profile.glove === 'unknown') missing.push('glove');
  if (profile.handedness === 'unknown') missing.push('handedness');
  if (!profile.priorities.length) missing.push('priorities');
  if (profile.flight === 'unknown') missing.push('flight');
  if (profile.tempo === 'unknown') missing.push('tempo');
  if (profile.sex === 'unknown') missing.push('sex');
  if (age === null) missing.push('age');
  const lengthRows = data.current_tool_rules.length_by_height_cm.map(row => ({ belowM: row.below_cm === null ? Infinity : row.below_cm / 100, adjustmentM:row.length_in * INCH_M }));
  const grip = profile.glove === 'unknown' ? null : (data.current_tool_rules.grip_by_glove_size[profile.glove] as Grip);
  const priorities = profile.priorities.filter(p => PRIORITIES.includes(p)).slice(0,3);
  const recommendations = HEADS.map((head,index): FittingRecommendation => {
    const reasons: string[] = [];
    const skillPoints = scoreBucket === null ? 0 : 5 - Math.abs(scoreBucket - head.targetBucket);
    let speedPoints = sb === null ? 0 : SPEED_POINTS[sb - 1][index];
    if (scoreBucket === 5 && sb !== null && sb >= 4) speedPoints = Math.min(3,speedPoints);
    let preferencePoints = 0;
    for (const p of priorities) {
      const r = head.ratings;
      preferencePoints += p === 'forged feel' ? 2*r.feel : p === 'less offset' ? 5-r.offset : p === 'more offset' ? r.offset : p === 'distance control' ? r.distance_control : r[p as 'forgiveness'|'distance'|'workability'];
    }
    const penalty = priorities.includes('forgiveness') && ['301-cb','301-mb'].includes(head.id) ? -1 : 0;
    reasons.push(`score_parts:${skillPoints},${speedPoints},${preferencePoints},${penalty}`);
    if (scoreBucket === null || sb === null) reasons.push('partial_ranking');
    let shaft: Shaft | null = null;
    if (flex && material && profile.flight !== 'unknown' && profile.tempo !== 'unknown') {
      const tempo = {smooth:'slow',moderate:'mid',quick:'fast'}[profile.tempo];
      const candidates = SHAFTS.filter(s => s.heads.includes(head.id) && s.material === material);
      const flexOrder = [...new Set(candidates.map(s => s.flex))].sort((a,b) => Math.abs(FLEXES.indexOf(a)-FLEXES.indexOf(flex)) - Math.abs(FLEXES.indexOf(b)-FLEXES.indexOf(flex)) || FLEXES.indexOf(b)-FLEXES.indexOf(a));
      for (const availableFlex of flexOrder) {
        const pool = candidates.filter(s => s.flex === availableFlex);
        const tempoMatch = (s: Shaft) => !s.tempo || s.tempo.includes('any') || s.tempo.includes(tempo);
        const flightMatch = (s: Shaft) => s.flight.includes(profile.flight);
        for (const predicate of [(s:Shaft) => tempoMatch(s) && flightMatch(s),flightMatch,tempoMatch,() => true]) {
          const matched = pool.filter(predicate).sort((a,b) => Number(!head.stockShafts.includes(a.model)) - Number(!head.stockShafts.includes(b.model)));
          if (matched.length) { shaft = matched[0]; break; }
        }
        if (shaft) break;
      }
      if (shaft?.flex !== flex) reasons.push('nearest_available_flex');
    }
    if (shaft) reasons.push('shaft_rules'); else reasons.push('shaft_missing');
    const effectiveFlex = shaft?.flex ?? flex;
    const baseLength = height === null ? null : (lengthRows.find(row => height < row.belowM)?.adjustmentM ?? null);
    // The ladies-flex add-back means length cannot be final before flex is known.
    const lengthAdjustmentM = baseLength === null || !effectiveFlex ? null : Math.max(-1.5 * INCH_M,Math.min(1.5 * INCH_M,baseLength + (effectiveFlex === 'lady' ? INCH_M : 0)));
    const lieDeg = height === null || wrist === null || wrist >= height ? null : Math.max(-3,Math.min(3,roundEven(-14.8636 - 1.8586 * height + 21.5119 * wrist)));
    if (lengthAdjustmentM !== null) reasons.push('length_height');
    if (lieDeg !== null) reasons.push('lie_static');
    if (grip !== null) reasons.push('grip_glove');
    return {head,score:skillPoints+speedPoints+preferencePoints+penalty,shaft,targetFlex:flex,lengthAdjustmentM,lieDeg,grip,purchase:purchaseFor(head,shaft,lengthAdjustmentM,lieDeg,grip),reasons};
  }).sort((a,b) => b.score-a.score || (scoreBucket === null ? 0 : Math.abs(scoreBucket-a.head.targetBucket)-Math.abs(scoreBucket-b.head.targetBucket)) || HEADS.findIndex(h=>h.id===a.head.id)-HEADS.findIndex(h=>h.id===b.head.id));
  return { recommendations,missing,warnings,known:11-missing.length,total:11 };
}
