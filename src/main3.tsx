import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { emptyFittingProfile, fit, type FittingProfile, type FittingRecommendation } from './fitting';
import SwingVideoAnalyzer, { type SwingVideoAnalysis } from './SwingVideoAnalyzer';
import './style.css';
import './app.css';
import './takomo-theme.css';

type Screen = 'club' | 'height' | 'video' | 'questions' | 'results';
type Question = { id: string; title: string; description: string; kind: 'choice' | 'number'; field?: keyof FittingProfile; options?: Array<{ value: string; label: string }>; unit?: string; min?: number; max?: number; step?: number; why: string };

const clubs = [
  { id: '7iron', name: '7-iron', note: 'Best reference for the Takomo fitting rules' },
  { id: '6iron', name: '6-iron', note: 'Useful if this is the club you know best' },
  { id: 'wedge', name: 'Wedge', note: 'Movement can be reviewed; product rules still use a 7-iron reference' },
];

const choice = (value: string, label: string) => ({ value, label });

function formatLength(value: number | null) { if (value === null) return 'Not enough information yet'; const inches = value / 0.0254; return `${inches > 0 ? '+' : ''}${inches.toFixed(1)} in`; }
function formatLie(value: number | null) { return value === null ? 'Not enough information yet' : value === 0 ? 'Standard' : `${value > 0 ? '+' : ''}${value}° ${value > 0 ? 'upright' : 'flat'}`; }
function formatGrip(value: string | null) { return value ? value[0].toUpperCase() + value.slice(1) : 'Not enough information yet'; }
function whyRecommendation(item: FittingRecommendation) { const parts: string[] = []; if (item.reasons.includes('shaft_rules')) parts.push('shaft profile matches the available flex, flight and tempo rules'); if (item.reasons.includes('length_height')) parts.push('height sets the starting length'); if (item.reasons.includes('lie_static')) parts.push('height and wrist-to-floor set the static lie starting point'); if (item.reasons.includes('grip_glove')) parts.push('glove size selects the grip family'); if (item.reasons.includes('partial_ranking')) parts.push('some answers are still missing, so the ranking is provisional'); return parts.length ? `${parts.join('; ')}.` : 'This is a provisional comparison until more evidence is added.'; }

function personalizedWhy(question: Question, profile: FittingProfile, analysis: SwingVideoAnalysis | null) {
  const measured = analysis?.meanWristSpeedMps == null ? 'No wrist-motion proxy was available.' : `The clip shows a ${(analysis.meanWristSpeedMps / .44704).toFixed(1)} mph wrist-motion proxy; this is not clubhead speed.`;
  const posture = analysis?.meanTorsoLeanDeg == null ? 'Posture could not be estimated reliably.' : `Average torso lean is ${analysis.meanTorsoLeanDeg.toFixed(1)}°.`;
  const coverage = question.id === 'videoFeel' && analysis ? `This clip has ${Math.round(analysis.poseCoverage * 100)}% pose coverage across ${analysis.sampledFrames} sampled video frames.` : '';
  const evidence = ['speedMps', 'carryM', 'tempo'].includes(question.id) ? measured : ['heightM', 'wristToFloorM'].includes(question.id) ? posture : '';
  const context = question.id === 'score' && profile.score !== null ? `Your current score input is ${profile.score}.` : question.id === 'flight' && profile.flight !== 'unknown' ? `Your current flight target is ${profile.flight}.` : '';
  return [question.why, coverage, evidence, context].filter(Boolean).join(' ');
}

function questionMeasurements(questionId: string, analysis: SwingVideoAnalysis | null) {
  if (!analysis) return [];
  if (questionId === 'videoFeel') return [['Pose coverage', `${Math.round(analysis.poseCoverage * 100)}%`], ['Video frames reviewed', String(analysis.sampledFrames)]];
  if (['speedMps', 'carryM'].includes(questionId)) return [['Wrist-motion proxy', analysis.meanWristSpeedMps == null ? 'Unavailable' : `${(analysis.meanWristSpeedMps / .44704).toFixed(1)} mph`], ['What it means', 'Movement, not clubhead speed']];
  if (['heightM', 'wristToFloorM'].includes(questionId)) return [['Average torso lean', analysis.meanTorsoLeanDeg == null ? 'Unavailable' : `${analysis.meanTorsoLeanDeg.toFixed(1)}°`], ['Pose quality', analysis.quality]];
  if (questionId === 'tempo') return [['Motion sample', `${analysis.sampledFrames} video frames`], ['Average hand movement', analysis.meanWristSpeedMps == null ? 'Unavailable' : `${(analysis.meanWristSpeedMps / .44704).toFixed(1)} mph (video estimate)`]];
  return [];
}

function narrowPool(recommendations: FittingRecommendation[], profile: FittingProfile, questionIndex: number, final = false) {
  const initial = recommendations.slice(0, 5);
  let pool = initial;
  const priority = profile.priorities[0];
  if (priority === 'forgiveness') pool = pool.filter(item => !['301-cb', '301-mb'].includes(item.head.id));
  if (priority === 'forged feel' || priority === 'workability') pool = pool.filter(item => item.head.id !== '101-mkii');
  if (profile.speedMps !== null && profile.speedMps > 48) pool = pool.filter(item => item.head.id !== '101');
  const target = final ? 2 : Math.max(2, 5 - Math.floor((questionIndex + 1) / 2));
  return (pool.length >= target ? pool : initial).slice(0, target);
}

const productImages: Record<string, string> = {
  "101-mkii": "https://takomogolf.com/cdn/shop/files/101_MKII_Bite_Square_b83c2537-874d-4a55-816e-1a75007505ac.jpg?v=1779867545&width=800",
  "201-mkii": "https://takomogolf.com/cdn/shop/files/201_MKII_product_card_02.jpg?v=1767805694&width=800",
  "201t-mkii": "https://takomogolf.com/cdn/shop/files/201T_MKII_product_card_01.jpg?v=1767805402&width=800",
  "301-cb": "https://takomogolf.com/cdn/shop/files/New301CB-1_86d4589b-50b3-4eec-94ff-a23531e32c30.png?v=1741943180&width=800",
  "301-mb": "https://takomogolf.com/cdn/shop/files/New301MB-2_fb5f44b5-72f1-4ec1-abd8-b2a5f42800b7.png?v=1741943179&width=1445"
};

function ProductPhoto({ id, name }: { id: string; name: string }) {
 const [failed, setFailed] = useState(false);
 return failed || !productImages[id] ? <div className="product-photo-fallback">{name}<small>View photos on Takomo</small></div> : <img className="product-photo" src={productImages[id]} alt={name} loading="lazy" onError={() => setFailed(true)} />;
}

function PurchaseVideo({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    video.current?.play().catch(() => setNeedsPlay(true));
    return () => { element?.close(); };
  }, []);
  return <dialog ref={dialog} className={`purchase-video-dialog${failed ? ' failed' : ''}`} onCancel={onClose} aria-label={'Opening ' + name}>
    <button className="purchase-close" onClick={onClose} aria-label="Cancel and close video">×</button>
    <h2 className="purchase-video-copy">{name}</h2>
    <p className="purchase-video-copy">The product page will open automatically when the video ends.</p>
    {!failed && <video className="purchase-video" ref={video} src="/golf-swing5000.mp4" autoPlay playsInline controls preload="auto" onEnded={() => window.location.assign(url)} onError={() => setFailed(true)} />}
    {needsPlay && !failed && <button className="button primary purchase-video-play" onClick={() => { video.current?.play().then(() => setNeedsPlay(false)).catch(() => setNeedsPlay(true)); }}>Play video</button>}
    {failed && <p role="alert">The video could not play. You can still open the product page below.</p>}
    <a className="button secondary purchase-video-link" href={url}>Continue to product</a>
  </dialog>;
}

function ProductPool({ items, final = false }: { items: FittingRecommendation[]; final?: boolean }) {
  const [purchase, setPurchase] = useState<{ url: string; name: string } | null>(null);
  return <><section className={final ? "club-pool final-pool" : "club-pool"} aria-label="Remaining product candidates"><div className="club-pool-heading"><span>{final ? 'FINAL TWO TO TEST' : 'LIVE PRODUCT POOL'}</span><small>{final ? 'The questions narrowed this to two starting points.' : 'Each answer removes less relevant candidates.'}</small></div><div className="club-pool-row">{items.map(item => <a className="club-pool-item product-link" key={item.head.id} href={'https://takomogolf.com/products/iron-' + item.head.id} onClick={event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return; event.preventDefault(); setPurchase({ url: event.currentTarget.href, name: item.head.name }); }} aria-label={'Watch video then view ' + item.head.name + ' on Takomo'}><ProductPhoto id={item.head.id} name={item.head.name} /><strong>{item.head.name}</strong><small>{item.head.loftDeg}° 7-iron</small>{final && <p>{whyRecommendation(item)}</p>}<span className="shop-product">{final ? 'View & buy on Takomo ↗' : 'View model ↗'}</span></a>)}</div></section>{purchase && <PurchaseVideo url={purchase.url} name={purchase.name} onClose={() => setPurchase(null)} />}</>;
}


function WristMeasurement({ initialValue, onContinue, onSkip }: { initialValue: string; onContinue: (value: string) => void; onSkip: () => void }) {
  const total = initialValue ? Number(initialValue) : null;
  const [feet, setFeet] = useState(total === null ? '' : String(Math.floor(total / 12)));
  const [inches, setInches] = useState(total === null ? '' : String(Number((total % 12).toFixed(1))));
  const [error, setError] = useState('');
  return <div className="single-input"><div className="height-fields">
    <label>Feet<input autoFocus type="number" min="1" max="4" step="1" value={feet} placeholder="3" onChange={e => setFeet(e.target.value)} /></label>
    <label>Inches<input type="number" min="0" max="11.9" step="0.1" value={inches} placeholder="0" onChange={e => setInches(e.target.value)} /></label>
  </div>{error && <p role="alert">{error}</p>}
  <button className="button primary" onClick={() => {
    const ft = Number(feet), inch = Number(inches), value = ft * 12 + inch;
    if (!feet.trim() || !inches.trim() || !Number.isInteger(ft) || !Number.isFinite(inch) || inch < 0 || inch >= 12 || value < 16 || value > 51) {
      setError('Enter feet and inches between 1 ft 4 in and 4 ft 3 in. Inches must be less than 12.'); return;
    }
    setError(''); onContinue(String(value));
  }}>Continue →</button>
  <button className="button skip-question" onClick={onSkip}>Skip this question</button></div>;
}

function App() {
  const [screen, setScreen] = useState<Screen>('club');
  const [selectedClub, setSelectedClub] = useState('7iron');
  const [profile, setProfile] = useState<FittingProfile>(emptyFittingProfile());
  const [videoAnalysis, setVideoAnalysis] = useState<SwingVideoAnalysis | null>(null);
  const [videoFeel, setVideoFeel] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [videoHidden, setVideoHidden] = useState(false);
  const [inputError, setInputError] = useState('');
  const [heightInput, setHeightInput] = useState('');
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('0');
  const result = useMemo(() => fit(profile), [profile]);
  const selectedClubName = clubs.find(club => club.id === selectedClub)?.name ?? '7-iron';

  const questions = useMemo<Question[]>(() => [
    { id: 'speedMps', title: 'What do you know about your 7-iron speed?', description: 'Enter your 7-iron clubhead speed in mph from a launch monitor or a fitting report. Use club speed, not ball speed. If you do not know it, skip this question.', kind: 'number', field: 'speedMps', unit: 'mph', min: 23, max: 145, step: .1, why: 'Speed bucket is one of the strongest inputs for flex and head scoring.' },
    { id: 'carryM', title: 'What is your typical 7-iron carry?', description: 'Enter carry before roll. This is an alternative to clubhead speed, not an additional requirement.', kind: 'number', field: 'carryM', unit: 'yards', min: 22, max: 273, step: 1, why: 'Carry can provide a swing bucket when clubhead speed is unavailable, but loft differences make it less certain.' },
    { id: 'tempo', title: 'How did the tempo in the clip feel?', description: 'Think about the swing you just filmed. Did it feel relaxed, steady, or quick?', kind: 'choice', field: 'tempo', options: [choice('smooth', 'Smooth and flowing'), choice('moderate', 'Moderate'), choice('quick', 'Quick or aggressive')], why: 'Tempo helps choose among compatible shaft flight profiles; it does not prescribe flex by itself.' },
    { id: 'flight', title: 'What ball flight would you like to see?', description: 'Choose the outcome you are trying to test, not a promise of what the app can guarantee.', kind: 'choice', field: 'flight', options: [choice('low', 'Lower'), choice('mid', 'Mid'), choice('high', 'Higher')], why: 'Desired flight narrows shaft profile and helps explain launch trade-offs.' },
    { id: 'score', title: 'What is your typical 18-hole score?', description: 'Use your usual score, not your handicap index.', kind: 'number', field: 'score', unit: 'strokes', min: 40, max: 160, step: 1, why: 'Score bucket contributes to head scoring, especially the balance between forgiveness and workability.' },
    { id: 'priorities', title: 'What matters most in the iron?', description: 'Choose one priority now. You can add more later if needed.', kind: 'choice', options: [choice('forgiveness', 'Forgiveness'), choice('distance', 'Distance'), choice('distance control', 'Distance control'), choice('forged feel', 'Forged feel'), choice('workability', 'Workability')], why: 'The priority changes which head trade-off is shown first.' },
    { id: 'wristToFloorM', title: 'What is your wrist-to-floor measurement?', description: 'Stand in golf shoes with your arms relaxed. Measure from your wrist crease to the floor and enter feet and inches, for example 3 ft 0 in. Skip if you are unsure.', kind: 'number', field: 'wristToFloorM', unit: 'inches', min: 16, max: 51, step: .1, why: 'Together with height, this sets the static lie starting point.' },
    { id: 'glove', title: 'What glove size do you normally use?', description: 'This is a practical grip starting point, not a hand measurement.', kind: 'choice', field: 'glove', options: ['XS', 'S', 'M', 'M/L', 'L', 'XL'].map(value => choice(value, value)), why: 'Glove size selects standard, midsize or oversize grip and can affect stock versus custom.' },
    { id: 'handedness', title: 'Which hand do you play with?', description: 'This is kept as a build eligibility detail.', kind: 'choice', field: 'handedness', options: [choice('right', 'Right-handed'), choice('left', 'Left-handed')], why: 'Handedness is a product eligibility constraint and should never be guessed.' },
    { id: 'age', title: 'How old are you?', description: 'Your age helps us consider a comfortable shaft weight alongside your swing.', kind: 'number', field: 'age', unit: 'years', min: 10, max: 100, step: 1, why: 'Age adds context to shaft material choices. Your measured speed and preferences still matter.' },
    { id: 'sex', title: 'What is your sex?', description: 'This optional answer is used by the current shaft fitting rules.', kind: 'choice', field: 'sex', options: [choice('female', 'Female'), choice('male', 'Male')], why: 'The current rules use sex alongside age and speed when comparing shaft materials. You may skip this question.' },
  ], []);

  function updateHeight(value: string) { setHeightInput(value); const cm = Number(value); setProfile(current => ({ ...current, heightM: value.trim() && Number.isFinite(cm) ? cm / 100 : null })); }
  function updateField(key: keyof FittingProfile, value: string | number | string[] | null) { setProfile(current => ({ ...current, [key]: value } as FittingProfile)); }
  function startVideo() { setAnswers({}); setInputError(''); setVideoHidden(false); setProfile(emptyFittingProfile()); setVideoAnalysis(null); setVideoFeel(''); setQuestionIndex(0); setDraft(''); setHeightInput(''); setFeet(''); setInches('0'); setScreen('height'); }
  function beginQuestions() { setQuestionIndex(0); setDraft(''); setScreen('questions'); }
  function goBack() {
    setInputError('');
    if (screen === 'results') { setScreen('questions'); setDraft(answers[questions[questionIndex].id] ?? ''); return; }
    if (screen === 'questions' && questionIndex > 0) {
      const previous = questionIndex - 1;
      setQuestionIndex(previous); setDraft(answers[questions[previous].id] ?? ''); return;
    }
    setScreen(screen === 'questions' ? 'video' : screen === 'video' ? 'height' : 'club');
  }
  function advanceQuestion(answer = draft) {
    const question = questions[questionIndex];
    if (question.kind === 'number' && answer.trim()) {
      const value = Number(answer);
      if (!Number.isFinite(value) || value < question.min! || value > question.max!) {
        setInputError(`Enter a value from ${question.min} to ${question.max} ${question.unit}.`); return;
      }
    }
    setInputError('');
    setAnswers(current => ({ ...current, [question.id]: answer }));
    if (question.id === 'priorities') updateField('priorities', answer ? [answer] : []);
    if (question.field) {
      if (question.kind === 'choice') updateField(question.field, answer || 'unknown');
      else updateField(question.field, answer.trim() ? Number(answer) * (question.field === 'speedMps' ? .44704 : question.field === 'carryM' ? .9144 : question.field === 'wristToFloorM' ? .0254 : 1) : null);
    }
    const next = questionIndex + 1;
    if (next >= questions.length) setScreen('results');
    else { setQuestionIndex(next); setDraft(answers[questions[next].id] ?? ''); }
  }

  const question = questions[questionIndex];
  const questionValue = question?.field ? profile[question.field] : null;
  const existingValue = typeof questionValue === 'number' ? (questionValue / (question.field === 'speedMps' ? .44704 : question.field === 'carryM' ? .9144 : question.field === 'wristToFloorM' ? .0254 : 1)).toFixed(1) : questionValue;
  const pool = narrowPool(result.recommendations, profile, questionIndex, screen === 'results');
  const measurements = questionMeasurements(question?.id ?? 'videoFeel', videoAnalysis);

  return <div className="app-shell video-first-app">
    <header className="topbar"><button className="wordmark" onClick={() => setScreen('club')}><span className="mark">P</span><span>POCKET FITTER<small>VIDEO-FIRST FITTING STUDIO</small></span></button><span className="status"><i/> VIDEO STAYS LOCAL</span></header>
    <main>
      {screen !== 'club' && <button className="button secondary back-step" onClick={goBack}>Back to previous step</button>}
      <section className="workspace-intro"><div className="eyebrow">WEBABI · EVIDENCE-AWARE FITTING</div><h1>Show us the movement.<br/>Then choose the iron.</h1><p>We start with one swing video. After that, each question appears only when the previous answer is complete.</p></section>
      <div className="progress" aria-label="Fitting progress">{['Club', 'Height', 'Video', 'Questions', 'Result'].map((label, index) => <div className={`progress-dot ${index < ['club', 'height', 'video', 'questions', 'results'].indexOf(screen) ? 'done' : index === ['club', 'height', 'video', 'questions', 'results'].indexOf(screen) ? 'active' : ''}`} key={label} title={label}/>)}</div>
      {screen !== 'club' && <div hidden={screen === 'height'} className={`persistent-video ${screen === 'video' ? 'persistent-video-full' : 'persistent-video-side'}`}>{screen === 'video' && <><h2>Film your swing</h2><p>Choose a video of one swing. Keep your whole body and club in view.</p></>}{screen !== 'video' && <button className="button secondary video-toggle" onClick={() => setVideoHidden(value => !value)} aria-expanded={!videoHidden}>{videoHidden ? 'Show swing video' : 'Hide swing video'}</button>}<div hidden={screen !== 'video' && videoHidden}><SwingVideoAnalyzer height={heightInput} onHeightChange={updateHeight} onAnalysis={setVideoAnalysis} onContinue={beginQuestions} compact={screen !== 'video'} focusKey={question?.id ?? 'videoFeel'} /></div></div>}

      {screen === 'height' && <section className="flow-card"><h2>How tall are you?</h2><p>Enter your standing height once. We use it to help understand your movement in the video.</p><div className="height-fields"><label>Feet<input type="number" min="2" max="8" step="1" value={feet} onChange={e => setFeet(e.target.value)} placeholder="5" /></label><label>Inches<input type="number" min="0" max="11" step="1" value={inches} onChange={e => setInches(e.target.value)} /></label></div><p>For example: 5 feet, 10 inches.</p>{inputError && <p role="alert">{inputError}</p>}<button className="button primary" onClick={() => { const total = Number(feet) * 12 + Number(inches); if (!feet || !inches.trim() || !Number.isInteger(Number(feet)) || !Number.isInteger(Number(inches)) || Number(inches) < 0 || Number(inches) > 11 || total < 32 || total > 98) { setInputError('Enter a height between 2 ft 8 in and 8 ft 2 in.'); return; } updateHeight(String(total * 2.54)); setVideoAnalysis(null); setInputError(''); setScreen('video'); }}>Next: upload your swing</button></section>}
      {screen === 'club' && <section className="flow-card"><h2>Which club are you filming?</h2><p>Choose the club you know best. The Takomo fitting rules use a 7-iron reference, so the final product comparison will explain that limitation when needed.</p><div className="clubs">{clubs.map(club => <button className={`club-option ${selectedClub === club.id ? 'selected' : ''}`} key={club.id} onClick={() => setSelectedClub(club.id)}><strong>{club.name}</strong><small>{club.note}</small></button>)}</div><button className="button primary" onClick={startVideo}>Start fitting →</button></section>}



      {screen === 'results' && <><section className="final-models"><div className="eyebrow">YOUR PERSONAL SHORTLIST</div><h2>Your two models to try</h2><p>Compare these starting points using your answers so far.</p><ProductPool items={pool} final /></section><section className="results-top"><div><div className="eyebrow">FINAL STEP · EXPLAINED RESULT</div><h2>Your evidence-based starting point.</h2><p>We used the {selectedClubName} video first, then applied your answers one at a time. This is a shortlist to test, not a claim that the result is perfect.</p></div><button className="button secondary" onClick={() => setScreen('questions')}>Review questions</button></section>{videoAnalysis && <section className="data-card"><div className="eyebrow">VIDEO EVIDENCE</div><h3>{videoAnalysis.quality === 'strong' ? 'Strong visual evidence' : videoAnalysis.quality === 'usable' ? 'Usable visual evidence' : 'Limited visual evidence'}</h3><div className="metric-cards"><div><strong>{Math.round(videoAnalysis.poseCoverage * 100)}%</strong><span>POSE COVERAGE</span></div><div><strong>{videoAnalysis.sampledFrames}</strong><span>VIDEO FRAMES REVIEWED</span></div><div><strong>{videoAnalysis.meanTorsoLeanDeg == null ? '—' : `${videoAnalysis.meanTorsoLeanDeg.toFixed(1)}°`}</strong><span>AVERAGE TORSO LEAN</span></div></div><p className="subtle">Video evidence supports posture and movement follow-up. It does not invent clubhead speed, shaft flex, grip or dynamic lie.</p>{videoFeel && <p className="subtle">Your check: <strong>{videoFeel === 'matches' ? 'the clip represents your normal swing' : videoFeel === 'faster' ? 'the clip was faster than usual' : 'the clip was slower than usual'}</strong>.</p>}</section>}
        <section className="data-card"><div className="eyebrow">TOP PRODUCT TO TEST</div><h3>{result.recommendations[0].head.name}</h3><p>{whyRecommendation(result.recommendations[0])}</p><dl className="spec-grid"><div><dt>Shaft</dt><dd>{result.recommendations[0].shaft ? `${result.recommendations[0].shaft.model} · ${result.recommendations[0].shaft.flex}` : 'Not enough information yet'}<small>Speed, tempo and desired flight narrow this choice.</small></dd></div><div><dt>Material</dt><dd>{result.recommendations[0].shaft?.material ?? 'Not enough information yet'}<small>Steel or graphite follows the fitting-rule context.</small></dd></div><div><dt>Length</dt><dd>{formatLength(result.recommendations[0].lengthAdjustmentM)}<small>Static starting point from height.</small></dd></div><div><dt>Lie</dt><dd>{formatLie(result.recommendations[0].lieDeg)}<small>Must be verified dynamically.</small></dd></div><div><dt>Grip</dt><dd>{formatGrip(result.recommendations[0].grip)}<small>Based on glove size.</small></dd></div><div><dt>Order path</dt><dd>{result.recommendations[0].purchase ?? 'Not enough information yet'}<small>Stock or custom depends on the full compatible build.</small></dd></div></dl></section>
        <section className="data-card"><div className="eyebrow">WHY THIS CHOICE CHANGES</div><h3>How your answers affect the product</h3><div className="quality-panel"><ul><li><strong>Video quality:</strong> controls how much confidence we place in the movement evidence.</li><li><strong>Speed or carry:</strong> selects the swing bucket and strongly affects flex and head scoring.</li><li><strong>Tempo and flight:</strong> narrow compatible shaft profiles and launch trade-offs.</li><li><strong>Score and priority:</strong> move the head between forgiveness, distance, control and workability.</li><li><strong>Height and wrist-to-floor:</strong> set length and static lie starting points.</li><li><strong>Glove size:</strong> selects grip size and can change stock versus custom.</li></ul></div></section>
        <section className="data-card"><div className="eyebrow">MISSING INFORMATION</div><h3>What still needs verification</h3>{result.missing.length ? <ul>{result.missing.map(key => <li key={key}>{key.replaceAll('_', ' ')} is still unknown, so this part of the build is provisional.</li>)}</ul> : <p>The questionnaire is complete. Verify the build on the range, especially dynamic lie and strike consistency.</p>}<p className="source-note">Takomo catalog and rules are a dated reference snapshot. This is not professional fitting advice.</p></section><div className="workspace-actions"><button className="button secondary" onClick={startVideo}>Start another fitting</button></div></>}
      {screen === 'questions' && question && <div className="followup-layout"><section className="flow-card question-sequence enhanced-question"><div className="flow-head"><span>QUESTION {questionIndex + 1} / {questions.length}</span><div className="progress"><i style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} /></div></div><h2>{question.title}</h2><p>{question.description}</p>{measurements.length > 0 && <div className="question-evidence"><div className="eyebrow">RELEVANT VIDEO MEASUREMENTS</div><div className="question-evidence-grid">{measurements.map(([label, value]) => <div key={label}><strong>{value}</strong><small>{label}</small></div>)}</div></div>}{question.kind === 'choice' && <div className="options">{question.options?.map(option => <button className={draft === option.value ? 'selected' : ''} key={option.value} onClick={() => { setDraft(option.value); advanceQuestion(option.value); }}>{option.label}</button>)}</div>}{question.kind === 'number' && (question.id === 'wristToFloorM' ? <WristMeasurement initialValue={draft} onContinue={advanceQuestion} onSkip={() => advanceQuestion('')} /> : <div className="single-input"><label>{question.unit}<input autoFocus type="number" min={question.min} max={question.max} step={question.step} value={draft} placeholder={existingValue ? `Already captured: ${existingValue}` : 'Leave empty if unknown'} onChange={event => setDraft(event.target.value)} /></label><button className="button primary" onClick={() => advanceQuestion()}>Continue →</button><button className="button skip-question" onClick={() => advanceQuestion('')}>Skip this question</button></div>)}{inputError && <p role="alert">{inputError}</p>}<section className="fitting-explanation"><h3>Why this matters for fitting</h3><p>{personalizedWhy(question, profile, videoAnalysis)}</p></section>{question.kind === 'choice' && <button className="button skip-question" onClick={() => advanceQuestion('')}>Skip this question</button>}<ProductPool items={pool} /></section></div>}

      {(screen === 'questions' || screen === 'results') && <nav className="answer-balls" aria-label="Question answers"><span>Green: answered · Orange: skipped · White: upcoming</span><div>{questions.map((item, index) => <button key={item.id} className={answers[item.id] ? 'golf-ball answered' : item.id in answers ? 'golf-ball skipped' : 'golf-ball'} title={item.title + (answers[item.id] ? ': answered' : item.id in answers ? ': skipped' : ': upcoming')} aria-label={item.title} aria-current={screen === 'questions' && index === questionIndex ? 'step' : undefined} onClick={() => { setQuestionIndex(index); setDraft(answers[item.id] ?? ''); setInputError(''); setScreen('questions'); }}>{index + 1}</button>)}</div><small>{Object.values(answers).filter(Boolean).length} of {questions.length} answered</small></nav>}
    </main>
    <footer className="footer"><span>© SINCE AI · POCKET FITTER</span><span>VIDEO-FIRST RESEARCH PREVIEW</span><span>NO EXCEL WORKFLOW</span></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
