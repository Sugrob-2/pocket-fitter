export type Point = { x: number; y: number; visibility: number };
export type PoseFrame = { time: number; points: Point[]; visibleCount: number };
export const VISIBLE = 0.55;
export const MAX_GAP = 0.2;
type XY = { x: number; y: number };
const distance = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: XY, b: XY): XY => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export function validHeight(value: string): number | null {
  const n = Number(value.trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 80 && n <= 250 ? n : null;
}
function point(frame: PoseFrame, index: number, aspect: number): XY | null {
  const p = frame.points[index];
  return p && p.visibility >= VISIBLE && Number.isFinite(p.x) && Number.isFinite(p.y)
    && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 ? { x: p.x * aspect, y: p.y } : null;
}
function angle(a: XY | null, b: XY | null, c: XY | null): number | null {
  if (!a || !b || !c) return null;
  const denominator = distance(a, b) * distance(c, b);
  if (denominator < 1e-8) return null;
  return Math.acos(Math.max(-1, Math.min(1, ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) / denominator))) * 180 / Math.PI;
}
export const METRICS = [
  ['postureHeightCm', 'Approximate pose height', 'cm'],
  ['torsoLeanDeg', 'Torso lean from vertical (2D)', 'deg'],
  ['leftKneeDeg', 'Left knee angle (straight = 180°)', 'deg'],
  ['rightKneeDeg', 'Right knee angle (straight = 180°)', 'deg'],
  ['leftHipDeg', 'Left hip angle (2D)', 'deg'],
  ['rightHipDeg', 'Right hip angle (2D)', 'deg'],
  ['leftElbowDeg', 'Left elbow angle (2D)', 'deg'],
  ['rightElbowDeg', 'Right elbow angle (2D)', 'deg'],
  ['shoulderTiltDeg', 'Shoulder-line tilt (unsigned)', 'deg'],
  ['hipTiltDeg', 'Hip-line tilt (unsigned)', 'deg'],
  ['stanceCm', 'Approximate ankle separation', 'cm'],
  ['leftWristHeightCm', 'Approximate left wrist height above ankles', 'cm'],
  ['rightWristHeightCm', 'Approximate right wrist height above ankles', 'cm'],
  ['leftWristSpeed', 'Left wrist speed relative to shoulders (2D)', 'shoulder-widths/s'],
  ['rightWristSpeed', 'Right wrist speed relative to shoulders (2D)', 'shoulder-widths/s'],
  ['leftWristSpeedMps', 'Approximate left wrist speed relative to shoulders (2D)', 'm/s'],
  ['rightWristSpeedMps', 'Approximate right wrist speed relative to shoulders (2D)', 'm/s'],
] as const;
export type MetricKey = typeof METRICS[number][0];
export type MetricRow = Record<MetricKey, number | null> & { time: number; visibleCount: number };
export const SCALE_NOTE = 'Illustrative 2D scale: median visible nose–shoulders–hips–knee–ankle chain is assumed to be 90% of entered standing height. The other 10% approximates head/foot endpoints. This is a heuristic, not calibrated anthropometry. Bent segments are summed rather than using the bent vertical bounding box. Perspective, rotation and tracking errors affect all cm and m/s values. Pose height is nose-to-ankle vertical span plus that fixed 10% allowance; it is not measured stature. Wrist speed is relative to shoulder midpoint, not clubhead speed. Left/right refer to model body sides and may be reversed in mirrored video. Times are clip times; slow-motion footage needs real-time conversion before interpreting speeds.';
const median = (a: number[]) => { const sorted = [...a].sort((x, y) => x - y); const m = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2; };

export function analyzeMetrics(frames: PoseFrame[], width: number, height: number, standingHeight: number | null) {
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const chains: number[] = [], shoulderWidths: number[] = [];
  for (const frame of frames) {
    const p = (i: number) => point(frame, i, aspect);
    const nose = p(0), ls = p(11), rs = p(12), lh = p(23), rh = p(24);
    if (ls && rs && distance(ls, rs) >= 0.025) shoulderWidths.push(distance(ls, rs));
    if (!nose || !ls || !rs || !lh || !rh) continue;
    const shoulders = midpoint(ls, rs), hips = midpoint(lh, rh);
    const legs: number[] = [];
    for (const [h, k, a] of [[23, 25, 27], [24, 26, 28]]) {
      const hip = p(h), knee = p(k), ankle = p(a);
      if (hip && knee && ankle) legs.push(distance(hip, knee) + distance(knee, ankle));
    }
    if (legs.length) chains.push(distance(nose, shoulders) + distance(shoulders, hips) + Math.max(...legs));
  }
  // One fixed scale per analysis: bending must not rescale the person to full height every frame.
  const bodyChain = chains.length >= 3 ? median(chains) : null;
  const cmPerUnit = standingHeight !== null && standingHeight >= 80 && standingHeight <= 250 && bodyChain !== null && bodyChain > 0.1 ? standingHeight * 0.9 / bodyChain : null;
  const shoulderScale = shoulderWidths.length >= 3 ? median(shoulderWidths) : null;
  const rows: MetricRow[] = frames.map((frame, frameIndex) => {
    const p = (i: number) => point(frame, i, aspect);
    const ls = p(11), rs = p(12), lh = p(23), rh = p(24), la = p(27), ra = p(28), nose = p(0);
    const shoulders = ls && rs ? midpoint(ls, rs) : null, hips = lh && rh ? midpoint(lh, rh) : null;
    const ankleY = la && ra ? Math.max(la.y, ra.y) : null;
    const cm = (v: number | null) => v === null || cmPerUnit === null ? null : v * cmPerUnit;
    const joint = (a: number, b: number, c: number) => angle(p(a), p(b), p(c));
    const tilt = (a: XY | null, b: XY | null) => a && b && distance(a, b) > 1e-8 ? Math.atan2(Math.abs(a.y - b.y), Math.abs(a.x - b.x)) * 180 / Math.PI : null;
    function velocity(index: number) {
      const previous = frames[frameIndex - 1], wrist = p(index);
      if (!previous || !wrist || !shoulders) return null;
      const dt = frame.time - previous.time;
      const oldWrist = point(previous, index, aspect), oldLeft = point(previous, 11, aspect), oldRight = point(previous, 12, aspect);
      if (dt <= 0 || dt > MAX_GAP + 1e-6 || !oldWrist || !oldLeft || !oldRight) return null;
      const oldShoulders = midpoint(oldLeft, oldRight);
      return Math.hypot((wrist.x - shoulders.x) - (oldWrist.x - oldShoulders.x), (wrist.y - shoulders.y) - (oldWrist.y - oldShoulders.y)) / dt;
    }
    const left = velocity(15), right = velocity(16);
    const wristHeight = (i: number) => { const wrist = p(i); return wrist && ankleY !== null ? cm(ankleY - wrist.y) : null; };
    return {
      time: frame.time, visibleCount: frame.visibleCount,
      postureHeightCm: nose && ankleY !== null && cmPerUnit !== null && standingHeight !== null ? (ankleY - nose.y) * cmPerUnit + standingHeight * 0.1 : null,
      torsoLeanDeg: shoulders && hips && distance(shoulders, hips) > 1e-8 ? Math.atan2(Math.abs(shoulders.x - hips.x), hips.y - shoulders.y) * 180 / Math.PI : null,
      leftKneeDeg: joint(23, 25, 27), rightKneeDeg: joint(24, 26, 28), leftHipDeg: joint(11, 23, 25), rightHipDeg: joint(12, 24, 26),
      leftElbowDeg: joint(11, 13, 15), rightElbowDeg: joint(12, 14, 16), shoulderTiltDeg: tilt(ls, rs), hipTiltDeg: tilt(lh, rh),
      stanceCm: la && ra ? cm(distance(la, ra)) : null,
      leftWristHeightCm: wristHeight(15), rightWristHeightCm: wristHeight(16),
      leftWristSpeed: left !== null && shoulderScale !== null ? left / shoulderScale : null,
      rightWristSpeed: right !== null && shoulderScale !== null ? right / shoulderScale : null,
      leftWristSpeedMps: left !== null && cmPerUnit !== null ? left * cmPerUnit / 100 : null,
      rightWristSpeedMps: right !== null && cmPerUnit !== null ? right * cmPerUnit / 100 : null,
    };
  });
  return { rows, cmPerUnit, scaleSamples: chains.length };
}

export function summarize(rows: MetricRow[], key: MetricKey) {
  const values = rows.map(row => row[key]).filter((n): n is number => n !== null && Number.isFinite(n));
  if (!values.length) return null;
  return { count: values.length, mean: values.reduce((s, n) => s + n, 0) / values.length, min: Math.min(...values), max: Math.max(...values) };
}

export type Cell = string | number | null;
export function exportTable(rows: Cell[][], delimiter: '\t' | ';', decimalComma = false) {
  return rows.map(row => row.map(value => {
    if (value === null) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? (decimalComma ? String(Number(value.toFixed(4))).replace('.', ',') : String(Number(value.toFixed(4)))) : '';
    // Keep filenames/user text as text when opened by spreadsheet software.
    let text = value.replace(/[\t\r\n]+/g, ' ');
    if (/^\s*[=+@-]/.test(text)) text = "'" + text;
    return delimiter === ';' ? '"' + text.replace(/"/g, '""') + '"' : text;
  }).join(delimiter)).join('\r\n');
}
