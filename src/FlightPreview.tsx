import { useMemo, useState } from 'react';
import { simulateFlight } from './flight';

export default function FlightPreview({ speedMps, loftDeg, locale, units }: { speedMps: number | null; loftDeg: number; locale: 'fi' | 'en'; units: 'metric' | 'imperial' }) {
  const fi = locale === 'fi';
  const [launchOffset, setLaunchOffset] = useState(0);
  const [directionDeg, setDirectionDeg] = useState(0);
  const [axisDeg, setAxisDeg] = useState(0);
  const [rpm, setRpm] = useState(5500);
  const clubSpeed = speedMps ?? 35;
  const launchDeg = Math.max(5, Math.min(40, loftDeg * .55 + launchOffset));
  const result = useMemo(() => simulateFlight({ ballSpeedMps: clubSpeed * 1.33, launchRad: launchDeg * Math.PI / 180, directionRad: directionDeg * Math.PI / 180, spinRadPerS: rpm * Math.PI / 30, spinAxisRad: axisDeg * Math.PI / 180 }), [clubSpeed, launchDeg, directionDeg, rpm, axisDeg]);
  const label = (f: string, e: string) => fi ? f : e;
  const distance = (m: number) => `${(units === 'imperial' ? m / .9144 : m).toFixed(1)} ${units === 'imperial' ? 'yd' : 'm'}`;
  if (!result) return <p role="status">{label('Lentorataa ei voida arvioida näillä arvoilla.', 'No trajectory estimate is available for these inputs.')}</p>;
  const maxX = Math.max(50, ...result.points.map(p => p.xM)), maxY = Math.max(10, result.apexM * 1.2);
  const path = result.points.map((p, i) => `${i ? 'L' : 'M'}${(40 + p.xM / maxX * 560).toFixed(1)},${(210 - p.yM / maxY * 170).toFixed(1)}`).join(' ');
  return <section className="data-card flight-panel">
    <div className="eyebrow">{label('SUUNTAA ANTAVA SIMULAATIO', 'ILLUSTRATIVE SIMULATION')}</div>
    <h3>{label('Miltä lyönti voisi näyttää?', 'What could the shot look like?')}</h3>
    <p>{speedMps === null ? label('Esimerkkilyönti: omaa mailanpään nopeutta ei ole annettu.', 'Example shot: no personal clubhead speed has been provided.') : label('Lähtökohtana antamasi 7-raudan mailanpään nopeus.', 'Based on the 7-iron clubhead speed you entered.')} {label('Tämä ei ole videosta mitattu lentorata.', 'This is not a trajectory measured from your video.')}</p>
    <svg viewBox="0 0 640 250" role="img" aria-label={label('Pallon arvioitu lentorata sivulta', 'Estimated ball flight, side view')} className="flight-chart">
      <line x1="40" y1="210" x2="610" y2="210" stroke="#909d65"/><line x1="40" y1="30" x2="40" y2="210" stroke="#c8cdbd"/>
      <path d={path} fill="none" stroke="#46683c" strokeWidth="4"/>
      <text x="40" y="235">0</text><text x="490" y="235">{distance(result.carryM)}</text><text x="45" y="25">{label('Korkeus', 'Height')} {distance(result.apexM)}</text>
    </svg>
    <div className="metric-cards"><div><strong>{distance(result.carryM)}</strong><span>{label('Lentomatka', 'Carry')}</span></div><div><strong>{distance(result.apexM)}</strong><span>{label('Lakikorkeus', 'Peak height')}</span></div><div><strong>{distance(Math.abs(result.sideM))}</strong><span>{Math.abs(result.sideM) < .1 ? label('Sivupoikkeama: suoraan', 'Side: straight') : result.sideM > 0 ? label('Oikealle kohteesta', 'Right of target') : label('Vasemmalle kohteesta', 'Left of target')}</span></div></div>
    <details><summary>{label('Kokeile lentoradan asetuksia', 'Explore flight settings')}</summary><div className="form-grid">
      <label>{label('Lähtökulman muutos', 'Launch adjustment')} ({launchDeg.toFixed(1)}°)<input type="range" min="-8" max="8" step=".5" value={launchOffset} onChange={e => setLaunchOffset(Number(e.target.value))}/></label>
      <label>{label('Lähtösuunta', 'Start direction')} ({directionDeg}°)<input type="range" min="-10" max="10" value={directionDeg} onChange={e => setDirectionDeg(Number(e.target.value))}/></label>
      <label>{label('Kierreakselin kallistus', 'Spin-axis tilt')} ({axisDeg}°)<input type="range" min="-30" max="30" value={axisDeg} onChange={e => setAxisDeg(Number(e.target.value))}/></label>
      <label>{label('Takakierre', 'Backspin')} ({rpm} rpm)<input type="range" min="1500" max="10000" step="100" value={rpm} onChange={e => setRpm(Number(e.target.value))}/></label>
    </div><p className="subtle">{label('Oletukset: pallon nopeus = mailan nopeus × 1,33; lähtökulma aluksi 55 % lavan loftista; ei tuulta, ei vierintää. Malli huomioi painovoiman, ilmanvastuksen ja kierteen yksinkertaistettuna. Asetukset ovat skenaarioita, eivät mittauksia.', 'Assumptions: ball speed = club speed × 1.33; initial launch = 55% of head loft; no wind or roll. Simplified gravity, drag and spin lift. Settings are scenarios, not measurements.')}</p></details>
  </section>;
}
