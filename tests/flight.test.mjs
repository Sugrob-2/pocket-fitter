import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateFlight } from '../src/flight.ts';
const scenario = { ballSpeedMps: 46, launchRad: .3, directionRad: 0, spinRadPerS: 550, spinAxisRad: 0 };
test('SI trajectory starts and lands at ground with finite positive outputs', () => {
  const r = simulateFlight(scenario);
  assert.ok(r.carryM > 50 && r.carryM < 250);
  assert.ok(r.apexM > 0 && r.flightTimeS > 0);
  assert.equal(r.points[0].xM, 0); assert.equal(r.points.at(-1).yM, 0);
  assert.ok(Math.abs(r.sideM) < 1e-9);
  assert.ok(r.points.every(p => Object.values(p).every(Number.isFinite)));
});
test('speed and direction change output, opposite spin axes mirror sideways flight', () => {
  assert.ok(simulateFlight({...scenario,ballSpeedMps:60}).carryM > simulateFlight(scenario).carryM);
  assert.ok(simulateFlight({...scenario,directionRad:.1}).sideM > 0);
  const a = simulateFlight({...scenario,spinAxisRad:.2}), b = simulateFlight({...scenario,spinAxisRad:-.2});
  assert.ok(a.sideM > 0); assert.ok(Math.abs(a.sideM + b.sideM) < 1e-9);
});
test('invalid flight inputs are unavailable rather than fabricated', () => {
  for (const change of [{ballSpeedMps:NaN},{ballSpeedMps:-1},{launchRad:0},{spinRadPerS:-1},{spinAxisRad:Infinity}]) assert.equal(simulateFlight({...scenario,...change}),null);
});
