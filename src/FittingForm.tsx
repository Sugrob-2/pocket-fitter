import type { FittingProfile } from './fitting';

export default function FittingForm({ profile, onChange, locale, units }: { profile: FittingProfile; onChange: (profile: FittingProfile) => void; locale: 'fi' | 'en'; units: 'metric' | 'imperial' }) {
  const fi = locale === 'fi';
  const text = (f: string, e: string) => fi ? f : e;
  function change<K extends keyof FittingProfile>(key: K, value: FittingProfile[K]) { onChange({ ...profile, [key]: value }); }
  function numberField(key: 'heightM' | 'wristToFloorM' | 'speedMps' | 'carryM' | 'score' | 'age', label: string, factor: number, min: number, max: number, step: number, example: string) {
    const value = profile[key];
    return <label>{label}<input type="number" min={min} max={max} step={step} value={value === null ? '' : Number((value / factor).toFixed(3))} placeholder={example} onChange={event => {
      const raw = event.target.value; const number = Number(raw);
      change(key, raw.trim() && Number.isFinite(number) ? number * factor : null);
    }}/></label>;
  }
  function selectField<K extends 'handedness' | 'sex' | 'flight' | 'tempo' | 'glove'>(key: K, label: string, options: [string,string][]) {
    return <label>{label}<select value={profile[key]} onChange={e => change(key, e.target.value as FittingProfile[K])}><option value="unknown">{text('En tiedä / jätä tyhjäksi', 'Not sure / leave empty')}</option>{options.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>;
  }
  const priorities: [string,string][] = [
    ['forgiveness',text('Anteeksiantavuus','Forgiveness')],['distance',text('Pituus','Distance')],['forged feel',text('Taottu tuntuma','Forged feel')],['distance control',text('Pituuskontrolli','Distance control')],['workability',text('Lyöntien muotoilu','Workability')],['less offset',text('Vähemmän offsetia','Less offset')],['more offset',text('Enemmän offsetia','More offset')],
  ];
  return <div className="profile-form">
    <p className="intro-note">{text('Täytä vain tiedot, jotka tiedät. Puuttuvat tiedot näkyvät suosituksessa avoimina kysymyksinä.', 'Enter only what you know. Missing information remains an open question in your recommendation.')}</p>
    <fieldset><legend>{text('1. Pelaaminen ja toiveet', '1. Your game and preferences')}</legend><div className="form-grid">
      {selectField('handedness',text('Kätisyys','Playing hand'),[['right',text('Oikea','Right')],['left',text('Vasen','Left')]])}
      {numberField('score',text('Tavallinen 18 reiän tulos (ei tasoitus)','Typical 18-hole score (not handicap)'),1,40,160,1,'90')}
    </div><p>{text('Mitä toivot mailalta? Valitse enintään kolme.', 'What matters in an iron? Choose up to three.')}</p><div className="preference-chips">{priorities.map(([value,label]) => <button key={value} type="button" aria-pressed={profile.priorities.includes(value)} disabled={!profile.priorities.includes(value) && profile.priorities.length >= 3} onClick={() => change('priorities', profile.priorities.includes(value) ? profile.priorities.filter(item => item !== value) : [...profile.priorities,value])}>{label}</button>)}</div></fieldset>
    <fieldset><legend>{text('2. Lyönti ja tuntuma', '2. Your swing and feel')}</legend><p className="subtle">{text('Käytä 7-raudan nopeutta tai lentomatkaa ennen vierintää. Ranteen nopeus videolta ei ole mailanpään nopeus.', 'Use 7-iron clubhead speed or carry before roll. Wrist speed from video is not clubhead speed.')}</p><div className="form-grid">
      {numberField('speedMps',text('Mailanpään nopeus','Clubhead speed') + ` (${units === 'metric' ? 'm/s' : 'mph'})`,units === 'metric' ? 1 : .44704, units === 'metric' ? 10 : 23, units === 'metric' ? 65 : 145,.1,units === 'metric' ? '35' : '78')}
      {numberField('carryM',text('7-raudan lentomatka','7-iron carry') + ` (${units === 'metric' ? 'm' : 'yd'})`,units === 'metric' ? 1 : .9144,units === 'metric' ? 20 : 22,units === 'metric' ? 250 : 273,1,units === 'metric' ? '140' : '153')}
      {selectField('flight',text('Toivottu lentokaari','Desired flight'),[['low',text('Matala','Low')],['mid',text('Keskikorkea','Mid')],['high',text('Korkea','High')]])}
      {selectField('tempo',text('Svingin tempo','Swing tempo'),[['smooth',text('Rauhallinen','Smooth')],['moderate',text('Kohtalainen','Moderate')],['quick',text('Nopea','Quick')]])}
    </div></fieldset>
    <fieldset><legend>{text('3. Mitat ja varren lähtötiedot', '3. Measurements and shaft context')}</legend><div className="form-grid">
      {numberField('heightM',text('Pituus seisten','Standing height') + ` (${units === 'metric' ? 'cm' : 'in'})`,units === 'metric' ? .01 : .0254,units === 'metric' ? 80 : 31.5,units === 'metric' ? 250 : 98.4,.1,units === 'metric' ? '180' : '71')}
      {numberField('wristToFloorM',text('Ranteesta lattiaan kengät jalassa','Wrist to floor, wearing golf shoes') + ` (${units === 'metric' ? 'cm' : 'in'})`,units === 'metric' ? .01 : .0254,units === 'metric' ? 40 : 15.7,units === 'metric' ? 130 : 51.2,.1,units === 'metric' ? '86' : '34')}
      {selectField('glove',text('Hanskan koko','Glove size'),['XS','S','M','M/L','L','XL'].map(value => [value,value]))}
      {numberField('age',text('Ikä (valinnainen)','Age (optional)'),1,10,100,1,'35')}
      {selectField('sex',text('Sovitussääntöjen taustatieto (valinnainen)','Fitting-rule context (optional)'),[['male',text('Mies','Male')],['female',text('Nainen','Female')]])}
    </div><p className="subtle">{text('Pituus ja ranne–lattiamitta antavat staattisen lähtökohdan, eivät varmista dynaamista lie-kulmaa. Taustatietoja käytetään vain paketin varsisääntöihin.', 'Height and wrist-to-floor provide a static starting point, not a verified dynamic lie. Context fields are used only for the pack’s shaft rules.')}</p></fieldset>
  </div>;
}
