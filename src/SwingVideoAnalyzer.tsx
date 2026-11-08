import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { analyzeMetrics, METRICS, SCALE_NOTE, summarize, validHeight, VISIBLE, MAX_GAP, type PoseFrame } from './videoMetrics';
import './videoMetrics.css';

const EDGES: Array<[number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 31],
  [24, 26], [26, 28], [28, 32], [15, 17], [16, 18],
];

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.002) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => { window.clearTimeout(timeout); video.removeEventListener('seeked', onSeeked); video.removeEventListener('error', onError); };
    const onSeeked = () => { finish(); resolve(); };
    const onError = () => { finish(); reject(new Error('The browser could not read this part of the video.')); };
    const timeout = window.setTimeout(() => { finish(); reject(new Error('Seeking took too long. Try a shorter video segment.')); }, 8000);
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = time;
  });
}

export interface SwingVideoAnalysis {
  durationSeconds: number;
  sampledFrames: number;
  visibleFrames: number;
  poseCoverage: number;
  meanTorsoLeanDeg: number | null;
  meanWristSpeedMps: number | null;
  quality: 'limited' | 'usable' | 'strong';
}

export default function SwingVideoAnalyzer({ height, onAnalysis, onContinue, compact = false, focusKey = 'videoFeel' }: { height: string; onHeightChange: (value: string) => void; onAnalysis?: (analysis: SwingVideoAnalysis | null) => void; onContinue?: () => void; compact?: boolean; focusKey?: string }) {
  const [videoUrl, setVideoUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [status, setStatus] = useState('Choose a video, then use the video controls to play or pause it.');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [frames, setFrames] = useState<PoseFrame[]>([]);
  const [activeFrame, setActiveFrame] = useState<PoseFrame | null>(null);
  const [videoSize, setVideoSize] = useState({ width: 16, height: 9 });
  const [sampledCount, setSampledCount] = useState(0);
  const [resultState, setResultState] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const cancelRef = useRef(false);
  const timestampRef = useRef(0);
  const mountedRef = useRef(true);

  const standingHeight = validHeight(height);
  const [analyzed, setAnalyzed] = useState(false);
  function invalidate() { setAnalyzed(false); onAnalysis?.(null); }
  const metrics = useMemo(() => analyzeMetrics(frames, videoSize.width, videoSize.height, standingHeight), [frames, videoSize, standingHeight]);
  const display = (value: number | null | undefined, unit: string) => value == null ? 'Unavailable' : (value / (unit === 'cm' ? 2.54 : unit === 'm/s' ? .44704 : 1)).toFixed(1);
  const current = metrics.rows.find(row => row.time === activeFrame?.time);
  const format = (value: number | null | undefined) => value === null || value === undefined ? '—' : value.toFixed(1);

  function syncFrame(video: HTMLVideoElement) {
    if (busy || !frames.length) return;
    const closest = frames.reduce((a, b) => Math.abs(a.time - video.currentTime) <= Math.abs(b.time - video.currentTime) ? a : b);
    const step = frames.length > 1 ? (frames.at(-1)!.time - frames[0].time) / (frames.length - 1) : 0;
    setActiveFrame(Math.abs(closest.time - video.currentTime) <= Math.min(0.2, Math.max(0.06, step / 2 + 0.01)) ? closest : null);
  }

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; cancelRef.current = true; landmarkerRef.current?.close(); landmarkerRef.current = null; }; }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || busy || !frames.length || !video.requestVideoFrameCallback) return;
    let callback = 0;
    const update = () => { syncFrame(video); callback = video.requestVideoFrameCallback(update); };
    callback = video.requestVideoFrameCallback(update);
    return () => video.cancelVideoFrameCallback(callback);
  }, [frames, busy]);
  useEffect(() => {
    const canvas = canvasRef.current, video = videoRef.current, frame = activeFrame;
    if (!canvas || !video || !video.videoWidth || !video.videoHeight) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!frame) return;
    ctx.lineWidth = Math.max(2, canvas.width / 500);
    ctx.strokeStyle = '#d7ff74';
    ctx.fillStyle = '#d7ff74';
    for (const [a, b] of EDGES) {
      const p = frame.points[a], q = frame.points[b];
      if (!p || !q || p.visibility < VISIBLE || q.visibility < VISIBLE) continue;
      ctx.beginPath(); ctx.moveTo(p.x * canvas.width, p.y * canvas.height); ctx.lineTo(q.x * canvas.width, q.y * canvas.height); ctx.stroke();
    }
    for (const point of frame.points) {
      if (point.visibility < VISIBLE) continue;
      ctx.beginPath(); ctx.arc(point.x * canvas.width, point.y * canvas.height, Math.max(3, canvas.width / 180), 0, Math.PI * 2); ctx.fill();
    }
    for (const [index, color] of [[15, '#51d5c6'], [16, '#ffa96b']] as Array<[number, string]>) {
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(3, canvas.width / 300); ctx.beginPath();
      let previousTime: number | null = null;
      for (const item of frames) {
        if (item.time > frame.time) break;
        const point = item.points[index];
        if (!point || point.visibility < VISIBLE) { previousTime = null; continue; }
        if (previousTime !== null && item.time - previousTime <= MAX_GAP + 1e-6) ctx.lineTo(point.x * canvas.width, point.y * canvas.height);
        else ctx.moveTo(point.x * canvas.width, point.y * canvas.height);
        previousTime = item.time;
      }
      ctx.stroke();
    }
    if (standingHeight !== null) {
      const fontSize = Math.max(14, canvas.width / 45);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(8, 8, Math.min(canvas.width - 16, fontSize * 27), fontSize * 3.4);
      ctx.fillStyle = '#fff'; ctx.fillText(`Standing height: ${(standingHeight / 2.54).toFixed(1)} in (entered)`, 16, 12 + fontSize);
      ctx.fillText(`Pose height: ${current?.postureHeightCm == null ? 'unavailable' : '~' + (current.postureHeightCm / 2.54).toFixed(1) + ' in (video estimate)'}`, 16, 16 + fontSize * 2.2);
    }
  }, [activeFrame, frames, videoSize, standingHeight, current]);
  useEffect(() => {
    if (!frames.length) return;
    const scored = frames.map(frame => {
      const row = metrics.rows.find(item => item.time === frame.time);
      const wristMotion = Math.max(row?.leftWristSpeed ?? 0, row?.rightWristSpeed ?? 0);
      const postureSignal = row?.postureHeightCm == null ? 0 : 1;
      const focusScore = focusKey === 'speedMps' || focusKey === 'carryM' || focusKey === 'tempo' ? wristMotion : focusKey === 'heightM' || focusKey === 'wristToFloorM' ? postureSignal : 0;
      return { frame, score: frame.visibleCount + focusScore * 10 };
    });
    const chosen = scored.reduce((best, item) => item.score > best.score ? item : best).frame;
    if (videoRef.current && !busy) { videoRef.current.pause(); videoRef.current.currentTime = chosen.time; }
    setActiveFrame(chosen);
  }, [focusKey, frames, metrics.rows]);

  function chooseVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const knownVideo = file.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|ogv|ogg|mkv)$/i.test(file.name);
    if (!knownVideo) { setStatus('That does not look like a video file. Choose a video such as MP4, MOV, or WebM.'); return; }
    if (file.size > 300 * 1024 * 1024) { setStatus('This video is over 300 MB. Choose a smaller clip.'); return; }
    landmarkerRef.current?.close(); landmarkerRef.current = null; timestampRef.current = 0;
    invalidate();
    setVideoUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setDuration(0); setStart(0); setEnd(0); setFrames([]); setActiveFrame(null); setProgress(0);
    setSampledCount(0); setResultState('');
    setStatus('Video loaded. Press ▶ in the player to watch it; pause near the swing and choose the segment below.');
    event.target.value = '';
  }

  async function analyzeSegment() {
    const video = videoRef.current;
    if (!video || !Number.isFinite(duration) || duration <= 0) { setStatus('Wait for the video to finish loading, then try again.'); return; }
    const from = Math.max(0, Math.min(start, duration));
    const to = Math.max(0, Math.min(end, duration));
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) { setStatus('The segment end must be later than its start.'); return; }
    invalidate();
    cancelRef.current = false; video.pause(); setBusy(true); setFrames([]); setActiveFrame(null); setProgress(0);
    setSampledCount(0); setResultState('');
    setStatus('Starting pose analysis. The first use downloads the model; your video stays in this browser.');
    try {
      if (!landmarkerRef.current) {
        const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
        const model = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'CPU' },
          runningMode: 'VIDEO', numPoses: 1,
        });
        if (!mountedRef.current) { model.close(); return; }
        landmarkerRef.current = model;
      }
      const span = to - from;
      const count = Math.min(120, Math.max(2, Math.ceil(span * 20) + 1));
      const found: PoseFrame[] = [];
      for (let i = 0; i < count; i++) {
        if (cancelRef.current) break;
        const time = Math.min(from + span * i / (count - 1), Math.max(from, duration - 0.001));
        await seekTo(video, time);
        if (cancelRef.current || !mountedRef.current) break;
        const timestamp = timestampRef.current + Math.max(1, Math.round(span * 1000 / (count - 1)));
        timestampRef.current = timestamp;
        const result = landmarkerRef.current!.detectForVideo(video, timestamp);
        const points = (result.landmarks[0] ?? []).map(point => ({ x: point.x, y: point.y, visibility: point.visibility ?? 0 }));
        const visibleCount = points.filter(point => point.visibility >= VISIBLE).length;
        found.push({ time, points, visibleCount });
        setSampledCount(i + 1);
        setProgress(Math.round((i + 1) / count * 100));
        if (i % 3 === 2) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      if (!mountedRef.current) return;
      setFrames(found);
      setResultState(cancelRef.current ? 'Partial — cancelled' : 'Complete');
      if (cancelRef.current) { setStatus('Analysis cancelled. The table contains only the sampled part of the clip.'); return; }
      if (!found.some(frame => frame.visibleCount > 0)) { setStatus('No clear person was found in this segment. Try a brighter clip with the full body and hands visible.'); return; }
      const best = found.reduce((a, b) => b.visibleCount > a.visibleCount ? b : a);
      await seekTo(video, best.time);
      setActiveFrame(best);
      setVideoSize({ width: video.videoWidth, height: video.videoHeight });
      const analyzed = analyzeMetrics(found, video.videoWidth, video.videoHeight, standingHeight);
      const visibleFrames = found.filter(frame => frame.visibleCount > 0).length;
      const poseCoverage = found.length ? visibleFrames / found.length : 0;
      const torso = summarize(analyzed.rows, 'torsoLeanDeg');
      const leftWrist = summarize(analyzed.rows, 'leftWristSpeedMps');
      const rightWrist = summarize(analyzed.rows, 'rightWristSpeedMps');
      const wristMeans = [leftWrist?.mean, rightWrist?.mean].filter((value): value is number => value !== undefined);
      setAnalyzed(true);
      onAnalysis?.({
        durationSeconds: span,
        sampledFrames: found.length,
        visibleFrames,
        poseCoverage,
        meanTorsoLeanDeg: torso?.mean ?? null,
        meanWristSpeedMps: wristMeans.length ? Math.max(...wristMeans) : null,
        quality: poseCoverage >= .8 ? 'strong' : poseCoverage >= .55 ? 'usable' : 'limited',
      });
      setStatus(`Sampled ${found.length} video frames across ${span.toFixed(2)} seconds. The relevant frame is selected automatically for each follow-up question.`);
    } catch (error) {
      setStatus(`Analysis could not finish: ${error instanceof Error ? error.message : 'unknown error'}. Try a shorter segment or another video.`);
    } finally { setBusy(false); }
  }

  function markTime(which: 'start' | 'end') {
    const time = videoRef.current?.currentTime;
    if (time === undefined) return;
    invalidate();
    if (which === 'start') setStart(time); else setEnd(time);
  }

  const ratio = videoSize.width / videoSize.height;
  const maxWidth = Math.min(720, Math.max(180, 320 * ratio));

  return <>
    <style>{`.results>.lower-grid>section:first-child{display:none!important}.swing-analyzer{margin-top:18px}.swing-video-frame{position:relative;max-width:100%;margin:16px auto 10px;overflow:hidden;background:#18211b}.swing-video-frame video,.swing-video-frame canvas{position:absolute;inset:0;width:100%;height:100%;display:block}.swing-video-frame video{object-fit:fill}.swing-video-frame canvas{pointer-events:none}.swing-analyzer .segment-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}.swing-analyzer .segment-fields label{font-size:11px;color:#59634d;display:flex;flex-direction:column;gap:6px}.swing-analyzer .segment-fields input{padding:9px;border:1px solid #d6d8ce;background:#fff;border-radius:3px}.swing-analyzer .segment-actions,.swing-analyzer .motion-summary{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}.swing-analyzer .analysis-status{padding:12px;background:#e8eadf;border-left:3px solid #909d65;font-size:12px;line-height:1.55;color:#495547}.swing-analyzer .motion-summary>div{background:#eef0e7;padding:12px 15px;min-width:150px}.swing-analyzer .motion-summary strong,.swing-analyzer .motion-summary small{display:block}.swing-analyzer .motion-summary strong{font:22px 'Playfair Display';color:#344337}.swing-analyzer .motion-summary small{font:9px 'DM Mono';color:#7c8175;margin-top:5px}.swing-analyzer .analysis-progress{height:5px;background:#e4e6dc;margin:10px 0}.swing-analyzer .analysis-progress i{display:block;height:100%;background:#909d65;transition:width .15s}@media(max-width:600px){.swing-analyzer .segment-fields{grid-template-columns:1fr}}`}</style>
    <section className={`data-card swing-analyzer${compact ? ' compact' : ''}`}>
      <label className="video-pick">{fileName || 'Upload swing video'}<input disabled={busy} type="file" accept="video/*,.mp4,.m4v,.webm,.mov,.ogv,.mkv" onChange={chooseVideo}/></label>
      {videoUrl && <>
        <div className="swing-selection-layout"><div className="swing-selection-player">
        <div className="swing-video-frame" style={{ width: `min(100%, ${maxWidth}px)`, aspectRatio: `${videoSize.width}/${videoSize.height}` }}>
          <video ref={videoRef} src={videoUrl} controls={!busy} playsInline preload="metadata" onTimeUpdate={event => syncFrame(event.currentTarget)} onSeeked={event => syncFrame(event.currentTarget)} onLoadedMetadata={event => { const v = event.currentTarget; setDuration(v.duration); setEnd(v.duration); setVideoSize({ width: v.videoWidth || 16, height: v.videoHeight || 9 }); setStatus('Video is ready. Press ▶ to play, then pause around the swing.'); }} onError={event => { const code = event.currentTarget.error?.code; setStatus(code === 3 || code === 4 ? 'This browser cannot decode this video. Export a copy as MP4 with H.264 video and AAC audio; renaming the file will not convert it.' : 'The browser could not read this video. Try choosing it again or use an MP4 copy.'); }}/>
          <canvas ref={canvasRef}/>
        </div>
        <div className="segment-fields">
          <label>Swing starts at (seconds)<input disabled={busy} type="number" min="0" max={duration} step="0.1" value={start} onChange={event => { invalidate(); setStart(Number(event.target.value)); }}/></label>
          <label>Swing ends at (seconds)<input disabled={busy} type="number" min="0" max={duration} step="0.1" value={end} onChange={event => { invalidate(); setEnd(Number(event.target.value)); }}/></label>
        </div>
        <div className="segment-actions">
          <button disabled={busy} className="button secondary" onClick={() => markTime('start')}>Start here</button>
          <button disabled={busy} className="button secondary" onClick={() => markTime('end')}>End here</button>
          {!busy ? <button className="button primary analyze-next" disabled={!duration} onClick={analyzeSegment}>{analyzed ? 'Analyze again' : 'Next: analyze my swing'}</button> : <button className="button secondary" onClick={() => { cancelRef.current = true; }}>Cancel analysis</button>}
        </div>
        {analyzed && onContinue && <button className="button primary analysis-continue" onClick={onContinue}>Next: fitting questions</button>}
        </div>
        <aside className="segment-guide">
          <h3>Downswing to follow-through</h3>
          <svg viewBox="0 0 400 190" role="img" aria-label="Right-handed swing example. Arrows show the downswing and follow-through. At the finish, both elbows bend below the hands, with the club wrapped behind the shoulders." className="swing-start-picture">
            <rect width="400" height="190" rx="12" fill="#f0f0f0"/>
            <path d="M200 14V172M20 148H178M222 148H380" stroke="#d4d4d4"/>
            {/* Right-handed example: target is left. Each arm has a separate elbow. */}
            <g stroke="#1c1c1c" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="82" cy="47" r="11"/>
              <path d="M82 61L86 103L64 146M86 103L107 146"/>
              <path d="M77 65L99 54L113 31M88 65L124 55L113 31"/>
              <circle cx="300" cy="47" r="11"/>
              <path d="M299 62L291 103L281 146M291 103L319 138L328 141"/>
              <path d="M292 65L269 78L275 37M304 65L288 82L275 37"/>
            </g>
            {/* Club rests behind the shoulders at the finish, rather than above the head. */}
            <g stroke="#707070" strokeWidth="4" fill="none" strokeLinecap="round">
              <path d="M113 31L49 19L42 23"/>
              <path d="M275 37L336 72L341 68"/>
            </g>
            <g stroke="#ff8338" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M140 27C157 42 158 51 158 69L158 87C158 108 145 118 121 121M127 111L121 121L132 127"/>
              <path d="M252 119C222 82 228 24 284 22M274 13L284 22L274 31"/>
            </g>
            <g fill="#1c1c1c" fontSize="12" textAnchor="middle">
              <text x="100" y="167">1. Downswing starts</text>
              <text x="300" y="167">2. Hold your follow-through</text>
              <text x="200" y="183" fontSize="10" fill="#555">Right-handed example · Mirror for a left-handed swing</text>
            </g>
          </svg>
          <p><strong>Start here:</strong> Pause at the top of your backswing, just as the club begins moving down toward the ball. For example, choose 2.0 seconds if your downswing begins there.</p>
          <p><strong>End here:</strong> Pause after hitting the ball, when you have completed your follow-through and are holding your finish.</p>
        </aside>
        </div>
        {busy && <div className="analysis-progress" aria-label={`Analysis ${progress}%`}><i style={{ width: `${progress}%` }}/></div>}
        <p className="analysis-status" role="status">{status}{busy ? ` (${progress}%)` : ''}</p>
        {frames.length > 0 && <>
          <p className="subtle">{resultState} · Pose detected in {frames.filter(frame => frame.visibleCount > 0).length} / {sampledCount} sampled moments. Low-visibility joints and motion across tracking gaps are omitted.</p>
          {frames.length > 1 && (frames.at(-1)!.time - frames[0].time) / (frames.length - 1) > MAX_GAP && <p className="analysis-status">Samples are too far apart for wrist speed. Select a shorter segment, ideally up to 6 seconds, and analyze again.</p>}
          <div className="motion-summary">
            <div><strong>{standingHeight === null ? 'Unavailable' : (standingHeight / 2.54).toFixed(1)} in</strong><small>ENTERED STANDING HEIGHT</small></div>
            <div><strong>~{format(current?.postureHeightCm == null ? null : current.postureHeightCm / 2.54)} in</strong><small>ILLUSTRATIVE POSE HEIGHT · CURRENT VIDEO FRAME</small></div>
            <div><strong>{format(current?.torsoLeanDeg)}°</strong><small>TORSO LEAN · CURRENT VIDEO FRAME · 2D</small></div>
            <div><strong>{current?.visibleCount ?? '—'} / 33</strong><small>VISIBLE LANDMARKS · CURRENT VIDEO FRAME</small></div>
          </div>
          {metrics.cmPerUnit === null && <p className="subtle">To estimate body measurements, enter your standing height and include at least three clear full-body video frames. Missing values stay blank.</p>}
          <div className="metrics-table-wrap"><table className="metrics-table"><caption>Video measurements · 2D estimates, not club or ball measurements</caption><thead><tr><th scope="col">Metric</th><th scope="col">Unit</th><th scope="col">Current video frame</th><th scope="col">Mean</th><th scope="col">Min</th><th scope="col">Max</th><th scope="col">Valid samples</th></tr></thead><tbody>{METRICS.map(([key, label, unit]) => {
            const summary = summarize(metrics.rows, key);
            return <tr key={key}><th scope="row">{label}</th><td>{unit === 'cm' ? 'inches' : unit === 'm/s' ? 'mph' : unit}</td><td>{display(current?.[key], unit)}</td><td>{display(summary?.mean, unit)}</td><td>{display(summary?.min, unit)}</td><td>{display(summary?.max, unit)}</td><td>{summary?.count ?? 0} / {frames.length}</td></tr>;
          })}</tbody></table></div>
          <details className="metrics-notes"><summary>How these estimates work</summary><p>{SCALE_NOTE.replaceAll('cm and m/s', 'inch and mph')}</p><p>Angles and distances use the video aspect ratio. One median body scale and shoulder width are fixed across the clip. Speeds use consecutive visible samples at most 0.2 seconds apart. Means use valid samples only; empty values are not zeros. Use a short, real-time clip and a stationary camera. This does not measure 3D rotation, pressure, clubhead speed, or ball flight.</p></details>
        </>}
      </>}
    </section>
  </>;
}
