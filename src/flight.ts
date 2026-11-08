/** Illustrative golf-ball flight, not a launch-monitor replacement. All kinematics are SI. */
export interface FlightInput {
  ballSpeedMps: number;
  launchRad: number;
  directionRad: number;
  spinRadPerS: number;
  spinAxisRad: number;
}
export interface FlightPoint { timeS: number; xM: number; yM: number; zM: number }
export interface FlightResult { points: FlightPoint[]; carryM: number; sideM: number; apexM: number; flightTimeS: number }
export function simulateFlight(input: FlightInput): FlightResult | null {
  const { ballSpeedMps: speed, launchRad: launch, directionRad: direction, spinRadPerS: spin, spinAxisRad: axis } = input;
  if (![speed, launch, direction, spin, axis].every(Number.isFinite) || speed < 1 || speed > 100 || launch <= 0 || launch >= Math.PI / 2 || Math.abs(direction) > Math.PI / 3 || spin < 0 || spin > 2000 || Math.abs(axis) > Math.PI / 2) return null;
  const dt = .01, radius = .02135, mass = .046, density = 1.2;
  const forceScale = .5 * density * Math.PI * radius * radius / mass;
  let vx = speed * Math.cos(launch) * Math.cos(direction), vy = speed * Math.sin(launch), vz = speed * Math.cos(launch) * Math.sin(direction);
  let x = 0, y = 0, z = 0, time = 0, apex = 0;
  const points: FlightPoint[] = [{ timeS: 0, xM: 0, yM: 0, zM: 0 }];
  for (let i = 0; i < 2000; i++) {
    const velocity = Math.hypot(vx, vy, vz);
    const spinRatio = spin * Math.exp(-time / 25) * radius / Math.max(velocity, 1);
    const cd = .25 + .15 * Math.min(spinRatio, 1);
    const cl = Math.min(.35, .6 * spinRatio);
    // Backspin axis is across the target line; positive axis tilt curves right.
    const wy = -Math.sin(axis), wz = Math.cos(axis);
    let lx = wy * vz - wz * vy, ly = wz * vx, lz = -wy * vx;
    const magnitude = Math.hypot(lx, ly, lz);
    if (magnitude > 0) { lx /= magnitude; ly /= magnitude; lz /= magnitude; }
    const drag = forceScale * cd * velocity, lift = forceScale * cl * velocity * velocity;
    vx += (-drag * vx + lift * lx) * dt;
    vy += (-9.81 - drag * vy + lift * ly) * dt;
    vz += (-drag * vz + lift * lz) * dt;
    const nextX = x + vx * dt, nextY = y + vy * dt, nextZ = z + vz * dt;
    if (nextY <= 0 && time > 0) {
      const fraction = y / (y - nextY);
      x += (nextX - x) * fraction; z += (nextZ - z) * fraction; time += dt * fraction;
      points.push({ timeS: time, xM: x, yM: 0, zM: z });
      return { points, carryM: Math.hypot(x, z), sideM: z, apexM: apex, flightTimeS: time };
    }
    x = nextX; y = nextY; z = nextZ; time += dt; apex = Math.max(apex, y);
    if (i % 5 === 0) points.push({ timeS: time, xM: x, yM: y, zM: z });
  }
  return null;
}
