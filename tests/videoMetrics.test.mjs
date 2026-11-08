import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMetrics, validHeight, summarize, exportTable } from '../src/videoMetrics.ts';

function frame(time, wristShift = 0) {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }));
  for (const [i, x, y] of [[0,.5,.15],[11,.4,.3],[12,.6,.3],[13,.35,.4],[14,.65,.4],[15,.3+wristShift,.5],[16,.7,.5],[23,.45,.5],[24,.55,.5],[25,.45,.7],[26,.55,.7],[27,.45,.9],[28,.55,.9]]) points[i] = { x, y, visibility: 1 };
  return { time, points, visibleCount: points.filter(p => p.visibility > .55).length };
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test('no height keeps 2D angles and motion but does not invent cm', () => {
  const { rows, cmPerUnit } = analyzeMetrics([frame(0), frame(.05,.01), frame(.1,.02)], 1920, 1080, null);
  assert.equal(cmPerUnit, null);
  assert.equal(rows[1].postureHeightCm, null);
  assert.equal(rows[1].leftWristSpeedMps, null);
  near(rows[1].leftKneeDeg, 180);
  near(rows[1].leftWristSpeed, 1);
});
test('joint geometry accounts for rectangular pixels coordinates', () => {
  const f = frame(0);
  f.points[23] = { x:.4, y:.3, visibility:1 };
  f.points[25] = { x:.5, y:.5, visibility:1 };
  f.points[27] = { x:.6, y:.3, visibility:1 };
  near(analyzeMetrics([f], 200, 100, null).rows[0].leftKneeDeg, 90);
});
test('bending lowers pose height instead of rescaling each frame', () => {
  const upright = frame(0), bent = frame(.05), third = frame(.1);
  // Rotate the torso and head sideways without changing their segment lengths.
  for (const f of [bent, third]) {
    f.points[11] = { x:.6,y:.5,visibility:1 }; f.points[12] = { x:.8,y:.5,visibility:1 }; f.points[0] = { x:.85,y:.5,visibility:1 };
  }
  const { rows, cmPerUnit } = analyzeMetrics([upright, bent, third], 1000, 1000, 180);
  assert.ok(cmPerUnit > 0);
  assert.ok(rows[1].postureHeightCm < rows[0].postureHeightCm);
  near(rows[0].postureHeightCm, 180);
  near(rows[1].torsoLeanDeg, 90);
  const twice = analyzeMetrics([upright, bent, third], 1000, 1000, 90);
  near(rows[1].postureHeightCm, twice.rows[1].postureHeightCm * 2);
});
test('missing joints, long gaps, and duplicate timestamps do not create velocity', () => {
  const hidden = frame(.05); hidden.points[15].visibility = .1;
  const rows = analyzeMetrics([frame(0), hidden, frame(.1,.1), frame(.5,.2), frame(.5,.3)], 1000, 1000, 180).rows;
  for (const row of rows) assert.equal(row.leftWristSpeed, null);
  assert.equal(rows[1].leftElbowDeg, null);
});
test('whole-body translation does not become shoulder-relative wrist motion', () => {
  const moved = frame(.05);
  moved.points = moved.points.map(p => ({ ...p, x: p.x + .1 }));
  const rows = analyzeMetrics([frame(0), moved, frame(.1)], 1000, 1000, 180).rows;
  near(rows[1].leftWristSpeed, 0);
});
test('missing pose is retained and summary excludes missing values, not true zeros', () => {
  const frames = [frame(0), { time:.05, points:[], visibleCount:0 }, frame(.1)];
  const { rows, cmPerUnit } = analyzeMetrics(frames, 1000, 1000, 180);
  assert.equal(rows.length, 3);
  assert.equal(cmPerUnit, null); // fewer than three calibration frames
  assert.deepEqual(summarize(rows, 'torsoLeanDeg'), { count:2, mean:0, min:0, max:0 });
  assert.equal(rows[2].leftWristSpeed, null);
});
test('height validation and off-screen points', () => {
  for (const value of ['', '0', 'Infinity', 'abc', '-180', '251']) assert.equal(validHeight(value), null);
  near(validHeight('180,5'), 180.5);
  const f = frame(0); f.points[25].x = 1.2;
  assert.equal(analyzeMetrics([f], 1000, 1000, null).rows[0].leftKneeDeg, null);
});
test('Excel export preserves numbers, missing values, quoting and literal user text', () => {
  const rows = [['Metric','Value'], ['=HYPERLINK("bad")',12.5], ['missing',null], ['a;"b',0]];
  assert.ok(exportTable(rows, ';', true).includes('"\'=HYPERLINK(""bad"")";12,5'));
  assert.ok(exportTable(rows, ';').includes('"a;""b";0'));
  assert.ok(exportTable(rows, '\t').includes('missing\t\r\n'));
  assert.ok(exportTable(rows, '\t').includes('\t12.5'));
});
