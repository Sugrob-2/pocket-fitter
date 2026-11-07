import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

type Point = { x: number; y: number; visibility: number };
type PoseFrame = { time: number; points: Point[]; visibleCount: number };

const EDGES: Array<[number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 31],
  [24, 26], [26, 28], [28, 32], [15, 17], [16, 18],
];
const VISIBLE = 0.55;

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

function wristMotion(frames: PoseFrame[], wristIndex: number) {
  const track: Array<{ time: number; x: number; y: number }> = [];
  for (const frame of frames) {
    const leftShoulder = frame.points[11], rightShoulder = frame.points[12], wrist = frame.points[wristIndex];
    if (!leftShoulder || !rightShoulder || !wrist || leftShoulder.visibility < VISIBLE || rightShoulder.visibility < VISIBLE || wrist.visibility < VISIBLE) continue;
    const shoulderWidth = Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y);
    if (shoulderWidth < 0.025) continue;
    track.push({ time: frame.time, x: (wrist.x - (leftShoulder.x + rightShoulder.x) / 2) / shoulderWidth, y: (wrist.y - (leftShoulder.y + rightShoulder.y) / 2) / shoulderWidth });
  }
  let path = 0, elapsed = 0, pairs = 0;
  for (let i = 1; i < track.length; i++) {
    const dt = track[i].time - track[i - 1].time;
    if (dt <= 0 || dt > 0.2) continue;
    path += Math.hypot(track[i].x - track[i - 1].x, track[i].y - track[i - 1].y);
    elapsed += dt;
    pairs++;
  }
  return pairs ? { path, speed: path / elapsed, samples: track.length } : null;
}

export default function SwingVideoAnalyzer() {
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const cancelRef = useRef(false);

  const leftMotion = useMemo(() => wristMotion(frames, 15), [frames]);
  const rightMotion = useMemo(() => wristMotion(frames, 16), [frames]);

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  useEffect(() => () => { landmarkerRef.current?.close(); landmarkerRef.current = null; }, []);
  useEffect(() => {
    const canvas = canvasRef.current, video = videoRef.current, frame = activeFrame;
    if (!canvas || !video || !frame || !video.videoWidth || !video.videoHeight) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
      const trail = frames.map(item => item.points[index]).filter(point => point && point.visibility >= VISIBLE);
      if (trail.length < 2) continue;
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(3, canvas.width / 300); ctx.beginPath();
      trail.forEach((point, i) => i ? ctx.lineTo(point.x * canvas.width, point.y * canvas.height) : ctx.moveTo(point.x * canvas.width, point.y * canvas.height));
      ctx.stroke();
    }
  }, [activeFrame, frames, videoSize]);

  function chooseVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const knownVideo = file.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|ogv|ogg|mkv)$/i.test(file.name);
    if (!knownVideo) { setStatus('That does not look like a video file. Choose a video such as MP4, MOV, or WebM.'); return; }
    if (file.size > 300 * 1024 * 1024) { setStatus('This video is over 300 MB. Choose a smaller clip.'); return; }
    setVideoUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setDuration(0); setStart(0); setEnd(0); setFrames([]); setActiveFrame(null); setProgress(0);
    setStatus('Video loaded. Press ▶ in the player to watch it; pause near the swing and choose the segment below.');
    event.target.value = '';
  }

  async function analyzeSegment() {
    const video = videoRef.current;
    if (!video || !duration) { setStatus('Wait for the video to finish loading, then try again.'); return; }
    const from = Math.max(0, Math.min(start, duration));
    const to = Math.max(0, Math.min(end, duration));
    if (to <= from) { setStatus('The segment end must be later than its start.'); return; }
    cancelRef.current = false; video.pause(); setBusy(true); setFrames([]); setActiveFrame(null); setProgress(0);
    setStatus('Starting pose analysis. The first use downloads the model; your video stays in this browser.');
    try {
      if (!landmarkerRef.current) {
        const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
        landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'CPU' },
          runningMode: 'VIDEO', numPoses: 1,
        });
      }
      const span = to - from;
      const count = Math.min(120, Math.max(2, Math.ceil(span * 20) + 1));
      const found: PoseFrame[] = [];
      let lastTimestamp = -1;
      for (let i = 0; i < count; i++) {
        if (cancelRef.current) break;
        const time = from + span * i / (count - 1);
        await seekTo(video, time);
        let timestamp = Math.round(time * 1000);
        timestamp = Math.max(timestamp, lastTimestamp + 1);
        lastTimestamp = timestamp;
        const result = landmarkerRef.current!.detectForVideo(video, timestamp);
        const points = (result.landmarks[0] ?? []).map(point => ({ x: point.x, y: point.y, visibility: point.visibility ?? 0 }));
        const visibleCount = points.filter(point => point.visibility >= VISIBLE).length;
        if (visibleCount) found.push({ time, points, visibleCount });
        setProgress(Math.round((i + 1) / count * 100));
        if (i % 3 === 2) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      setFrames(found);
      if (cancelRef.current) { setStatus('Analysis cancelled. You can choose a shorter segment and try again.'); return; }
      if (!found.length) { setStatus('No clear person was found in this segment. Try a brighter clip with the full body and hands visible.'); return; }
      const best = found.reduce((a, b) => b.visibleCount > a.visibleCount ? b : a);
      await seekTo(video, best.time);
      setActiveFrame(best);
      setVideoSize({ width: video.videoWidth, height: video.videoHeight });
      setStatus(`Analyzed ${found.length} frames across ${span.toFixed(2)} seconds. The overlay shows detected body joints; colored lines trace wrist movement through the selected segment.`);
    } catch (error) {
      setStatus(`Analysis could not finish: ${error instanceof Error ? error.message : 'unknown error'}. Try a shorter segment or another video.`);
    } finally { setBusy(false); }
  }

  function markTime(which: 'start' | 'end') {
    const time = videoRef.current?.currentTime;
    if (time === undefined) return;
    if (which === 'start') setStart(time); else setEnd(time);
  }

  const ratio = videoSize.width / videoSize.height;
  const maxWidth = Math.min(720, Math.max(180, 320 * ratio));

  return <>
    <style>{`.results>.lower-grid>section:first-child{display:none!important}.swing-analyzer{margin-top:18px}.swing-video-frame{position:relative;max-width:100%;margin:16px auto 10px;overflow:hidden;background:#18211b}.swing-video-frame video,.swing-video-frame canvas{position:absolute;inset:0;width:100%;height:100%;display:block}.swing-video-frame video{object-fit:fill}.swing-video-frame canvas{pointer-events:none}.swing-analyzer .segment-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}.swing-analyzer .segment-fields label{font-size:11px;color:#59634d;display:flex;flex-direction:column;gap:6px}.swing-analyzer .segment-fields input{padding:9px;border:1px solid #d6d8ce;background:#fff;border-radius:3px}.swing-analyzer .segment-actions,.swing-analyzer .motion-summary{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}.swing-analyzer .analysis-status{padding:12px;background:#e8eadf;border-left:3px solid #909d65;font-size:12px;line-height:1.55;color:#495547}.swing-analyzer .motion-summary>div{background:#eef0e7;padding:12px 15px;min-width:150px}.swing-analyzer .motion-summary strong,.swing-analyzer .motion-summary small{display:block}.swing-analyzer .motion-summary strong{font:22px 'Playfair Display';color:#344337}.swing-analyzer .motion-summary small{font:9px 'DM Mono';color:#7c8175;margin-top:5px}.swing-analyzer .analysis-progress{height:5px;background:#e4e6dc;margin:10px 0}.swing-analyzer .analysis-progress i{display:block;height:100%;background:#909d65;transition:width .15s}@media(max-width:600px){.swing-analyzer .segment-fields{grid-template-columns:1fr}}`}</style>
    <section className="data-card swing-analyzer">
      <div className="eyebrow">OPTIONAL · EXPERIMENTAL VIDEO ANALYSIS</div>
      <h3>Follow the movement through the clip</h3>
      <p>Choose a short segment around your swing. The analyzer checks many moments, draws visible body joints, and traces wrist movement. It cannot measure clubhead speed or ball flight.</p>
      <label className="video-pick">{fileName || 'Choose a video file'}<input type="file" accept="video/*,.mp4,.m4v,.webm,.mov,.ogv,.mkv" onChange={chooseVideo}/></label>
      {videoUrl && <>
        <div className="swing-video-frame" style={{ width: `min(100%, ${maxWidth}px)`, aspectRatio: `${videoSize.width}/${videoSize.height}` }}>
          <video ref={videoRef} src={videoUrl} controls playsInline preload="metadata" onLoadedMetadata={event => { const v = event.currentTarget; setDuration(v.duration); setEnd(v.duration); setVideoSize({ width: v.videoWidth || 16, height: v.videoHeight || 9 }); setStatus('Video is ready. Press ▶ to play, then pause around the swing.'); }} onError={event => { const code = event.currentTarget.error?.code; setStatus(code === 3 || code === 4 ? 'This browser cannot decode this video. Export a copy as MP4 with H.264 video and AAC audio; renaming the file will not convert it.' : 'The browser could not read this video. Try choosing it again or use an MP4 copy.'); }}/>
          <canvas ref={canvasRef}/>
        </div>
        <div className="segment-fields">
          <label>Start time (seconds)<input type="number" min="0" max={duration} step="0.1" value={start} onChange={event => setStart(Number(event.target.value))}/></label>
          <label>End time (seconds)<input type="number" min="0" max={duration} step="0.1" value={end} onChange={event => setEnd(Number(event.target.value))}/></label>
        </div>
        <div className="segment-actions">
          <button className="button secondary" onClick={() => markTime('start')}>Use current time as start</button>
          <button className="button secondary" onClick={() => markTime('end')}>Use current time as end</button>
          {!busy ? <button className="button primary" onClick={analyzeSegment}>Analyze this segment</button> : <button className="button secondary" onClick={() => { cancelRef.current = true; }}>Cancel analysis</button>}
        </div>
        {busy && <div className="analysis-progress" aria-label={`Analysis ${progress}%`}><i style={{ width: `${progress}%` }}/></div>}
        <p className="analysis-status" role="status">{status}{busy ? ` (${progress}%)` : ''}</p>
        {frames.length > 0 && <>
          <p className="subtle">Detected body poses in {frames.length} sampled moments. Missing/hidden joints are omitted, not guessed.</p>
          <div className="motion-summary">
            {leftMotion && <div><strong>{leftMotion.speed.toFixed(2)} shoulder-widths/s</strong><small>IMAGE-PLANE WRIST MOTION · SIDE A</small></div>}
            {rightMotion && <div><strong>{rightMotion.speed.toFixed(2)} shoulder-widths/s</strong><small>IMAGE-PLANE WRIST MOTION · SIDE B</small></div>}
            {!leftMotion && !rightMotion && <p>Not enough clearly visible wrist samples to estimate movement for this segment.</p>}
          </div>
          <p className="subtle">These relative hand-motion estimates are based on 2D video points. They are not clubhead speed in mph or m/s and do not replace a launch monitor.</p>
        </>}
      </>}
      <p className="subtle">For clearer points: keep the camera still, use good light, and keep your full body and hands visible against the background. Pose estimates are experimental.</p>
    </section>
  </>;
}
