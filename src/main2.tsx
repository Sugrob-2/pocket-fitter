import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import FittingForm from './FittingForm';
import { emptyFittingProfile, fit, type FittingProfile, type FittingRecommendation } from './fitting';
import SwingVideoAnalyzer, { type SwingVideoAnalysis } from './SwingVideoAnalyzer';
import './style.css';
import './app.css';

type Screen = 'video' | 'profile' | 'results';

const labels: Record<string, string> = {
  score: 'Typical score', speed_or_carry: '7-iron speed or carry', height: 'Standing height', wrist: 'Wrist-to-floor',
  glove: 'Glove size', handedness: 'Playing hand', priorities: 'Priorities', flight: 'Desired flight', tempo: 'Swing tempo', sex: 'Rule context', age: 'Age',
};

function formatLength(value: number | null) {
  if (value === null) return 'Not enough evidence';
  const inches = value / 0.0254;
  return `${inches > 0 ? '+' : ''}${inches.toFixed(1)} in`;
}

function formatLie(value: number | null) { return value === null ? 'Not enough evidence' : value === 0 ? 'Standard' : `${value > 0 ? '+' : ''}${value}° ${value > 0 ? 'upright' : 'flat'}`; }
function formatGrip(value: string | null) { return value ? value[0].toUpperCase() + value.slice(1) : 'Not enough evidence'; }

function recommendationWhy(item: FittingRecommendation) {
  const reasons = item.reasons;
  const parts: string[] = [];
  if (reasons.includes('length_height')) parts.push('height sets the starting length');
  if (reasons.includes('lie_static')) parts.push('height plus wrist-to-floor set a static lie starting point');
  if (reasons.includes('shaft_rules')) parts.push('the shaft matches the available flex, flight and tempo rules');
  if (reasons.includes('grip_glove')) parts.push('glove size selects the grip family');
  if (reasons.includes('partial_ranking')) parts.push('some fitting inputs are still missing, so the head ranking is provisional');
  return parts.length ? parts.join('; ') + '.' : 'The result is a provisional comparison until more evidence is added.';
}

function App() {
  const [screen, setScreen] = useState<Screen>('video');
  const [profile, setProfile] = useState<FittingProfile>(emptyFittingProfile());
  const [videoAnalysis, setVideoAnalysis] = useState<SwingVideoAnalysis | null>(null);
  const [heightInput, setHeightInput] = useState('');
  const result = useMemo(() => fit(profile), [profile]);

  function updateHeight(value: string) {
    setHeightInput(value);
    const cm = Number(value);
    setProfile(current => ({ ...current, heightM: value.trim() && Number.isFinite(cm) ? cm / 100 : null }));
  }

  function videoCompleted(analysis: SwingVideoAnalysis | null) { setVideoAnalysis(analysis); }

  return <div className="app-shell video-first-app">
    <header className="topbar"><div className="wordmark"><span className="mark">P</span><span>POCKET FITTER<small>VIDEO-FIRST FITTING STUDIO</small></span></div><span className="status"><i/> VIDEO STAYS LOCAL</span></header>
    <main>
      <section className="workspace-intro"><div className="eyebrow">THE FIT STARTS WITH A SWING</div><h1>Show us the movement.<br/>Then choose the iron.</h1><p>Video is the first step. A normal 30 FPS clip gives us movement evidence before we ask for any extra test or fitting detail.</p></section>
      <nav className="workspace-nav" aria-label="Fitting steps"><button aria-current={screen === 'video' ? 'step' : undefined} onClick={() => setScreen('video')}>1. Video</button><button aria-current={screen === 'profile' ? 'step' : undefined} disabled={!videoAnalysis} onClick={() => setScreen('profile')}>2. Profile</button><button aria-current={screen === 'results' ? 'step' : undefined} disabled={!videoAnalysis} onClick={() => setScreen('results')}>3. Product result</button></nav>

      {screen === 'video' && <>
        <SwingVideoAnalyzer height={heightInput} onHeightChange={updateHeight} onAnalysis={videoCompleted}/>
        <div className="workspace-actions"><button className="button primary" disabled={!videoAnalysis} onClick={() => setScreen('profile')}>Continue to fitting details →</button>{videoAnalysis && <span className="subtle">Video evidence is ready. The next step asks only for information the video cannot establish safely.</span>}</div>
      </>}

      {screen === 'profile' && <>
        <div className="notice"><span>✳</span><div><strong>VIDEO EVIDENCE FIRST</strong><p>Your clip informs the evidence summary. The form below fills the gaps that a regular phone video cannot prove, such as clubhead speed, grip and build measurements.</p></div></div>
        <FittingForm profile={profile} onChange={setProfile} locale="en" units="metric"/>
        <div className="workspace-actions"><button className="button secondary" onClick={() => setScreen('video')}>← Review video</button><button className="button primary" onClick={() => setScreen('results')}>Show product result →</button></div>
      </>}

      {screen === 'results' && <>
        <div className="results-top"><div><div className="eyebrow">STEP 3 · EXPLAINED PRODUCT RESULT</div><h2>Here is what the evidence supports.</h2><p>The video is used as movement evidence. The product configuration is calculated from the video, your profile and the remaining open questions.</p></div><button className="button secondary" onClick={() => setScreen('profile')}>Edit fitting details</button></div>
        {videoAnalysis && <section className="data-card"><div className="eyebrow">VIDEO FINDINGS</div><h3>{videoAnalysis.quality === 'strong' ? 'Strong visual evidence' : videoAnalysis.quality === 'usable' ? 'Usable visual evidence' : 'Limited visual evidence'}</h3><div className="metric-cards"><div><strong>{Math.round(videoAnalysis.poseCoverage * 100)}%</strong><span>POSE COVERAGE</span></div><div><strong>{videoAnalysis.sampledFrames}</strong><span>FRAMES REVIEWED</span></div><div><strong>{videoAnalysis.meanTorsoLeanDeg === null ? '—' : `${videoAnalysis.meanTorsoLeanDeg.toFixed(1)}°`}</strong><span>AVERAGE TORSO LEAN</span></div></div><p className="subtle">This evidence increases confidence in posture and movement follow-up. It does not invent clubhead speed, shaft flex, grip or dynamic lie from a phone camera.</p></section>}

        <section className="data-card"><div className="eyebrow">TOP TEST CANDIDATE</div><h3>{result.recommendations[0].head.name}</h3><p>{recommendationWhy(result.recommendations[0])}</p><dl className="spec-grid"><div><dt>Shaft</dt><dd>{result.recommendations[0].shaft ? `${result.recommendations[0].shaft.model} · ${result.recommendations[0].shaft.flex}` : 'Open question'}<small>Speed bucket, tempo and flight determine this choice.</small></dd></div><div><dt>Material</dt><dd>{result.recommendations[0].shaft?.material ?? 'Open question'}<small>Graphite or steel stays unknown until the required context is available.</small></dd></div><div><dt>Length</dt><dd>{formatLength(result.recommendations[0].lengthAdjustmentM)}<small>Height is only a static starting point.</small></dd></div><div><dt>Lie</dt><dd>{formatLie(result.recommendations[0].lieDeg)}<small>Static chart result, not dynamic delivery proof.</small></dd></div><div><dt>Grip</dt><dd>{formatGrip(result.recommendations[0].grip)}<small>Glove size maps to the available grip family.</small></dd></div><div><dt>Order path</dt><dd>{result.recommendations[0].purchase ?? 'Open question'}<small>Stock requires compatible stock shaft, standard build and standard/midsize grip.</small></dd></div></dl></section>

        <section className="data-card"><div className="eyebrow">WHY EACH RESULT MATTERS</div><h3>How the answers change the product</h3><div className="quality-panel"><ul><li><strong>Video quality and pose coverage:</strong> tells us how much confidence to place in movement-based follow-up; a weak clip should not force a model.</li><li><strong>Speed or carry:</strong> chooses the swing bucket, which has the largest effect on flex and head scoring.</li><li><strong>Tempo and desired flight:</strong> narrow the compatible shaft profile and expected launch character.</li><li><strong>Score and priorities:</strong> move the head choice between forgiveness, distance, control and workability.</li><li><strong>Height and wrist-to-floor:</strong> set length and a static lie starting point; they are not a substitute for an impact test.</li><li><strong>Glove size:</strong> selects standard, midsize or oversize grip and can change stock versus custom.</li></ul></div></section>

        <section className="data-card"><div className="eyebrow">NEXT · ADDITIONAL TESTS AFTER VIDEO</div><h3>Only test what the video cannot answer</h3><p>These tests are offered after the initial result so the customer understands why they are useful.</p><div className="recommend-grid"><article className="recommend-card"><h3>Clubhead speed or 7-iron carry</h3><p>Resolves the speed bucket and improves the flex/material decision. A launch monitor is best; a home radar can be imported later.</p></article><article className="recommend-card"><h3>Body and hand photo</h3><p>Improves height, wrist-to-floor and grip evidence. It can change length, lie starting point and grip size.</p></article><article className="recommend-card"><h3>Ball-line or impact test</h3><p>Checks dynamic lie and strike pattern. This is the strongest follow-up when the video cannot explain a left/right delivery issue.</p></article></div></section>

        <section className="data-card"><div className="eyebrow">OPEN QUESTIONS</div><h3>What is still unknown</h3>{result.missing.length ? <ul>{result.missing.map(key => <li key={key}>{labels[key] ?? key.replaceAll('_', ' ')} needs a reliable input before this can be treated as a final build.</li>)}</ul> : <p>The required profile inputs are present. Dynamic lie and real strike evidence should still be verified on the range.</p>}<p className="source-note">This is an evidence-aware shortlist, not professional fitting advice. Product data and rules are a dated Takomo reference snapshot.</p></section>
        <div className="workspace-actions"><button className="button secondary" onClick={() => setScreen('video')}>← Review video</button><button className="button primary" onClick={() => setScreen('profile')}>Add or edit evidence</button></div>
      </>}
    </main>
    <footer className="footer"><span>© SINCE AI · POCKET FITTER</span><span>VIDEO-FIRST RESEARCH PREVIEW</span><span>NO EXCEL WORKFLOW</span></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
