# Pocket Fitter

A local-first research prototype for exploring a Takomo iron shortlist. This is not professional fitting advice, a live product catalog, or a promise of improved performance.

## Run it on Windows

1. Install the current Node.js LTS release from [nodejs.org](https://nodejs.org/) (the installer also installs npm). Restart VS Code after installation.
2. Open this project folder in VS Code.
3. Open **Terminal → New Terminal**, then enter:

   ```powershell
   node --version
   npm --version
   npm install
   npm run dev
   ```

4. Open the local address printed by Vite (usually `http://localhost:5173`). Keep the terminal open while using the app. Press `Ctrl+C` in that terminal to stop it.

If `node --version` says the command is not recognized, restart VS Code (or Windows) after installing Node.js. No API key or account is required.

## What works in this prototype

- English/Finnish responsive questionnaire, including unknown/optional answers.
- Provisional, explainable comparison of three dated Takomo reference entries. Prices, shafts, exact build combinations and current availability are intentionally not guessed.
- CSV shot import with header preview-by-convention, dot decimals with comma separators, and comma decimals with semicolon separators; JSON session import/export.
- Carry summary (mean, median, range, population standard deviation), shot-by-shot view, and sample session. All shots stay included by default; no lateral plot is invented.
- Downloadable session, report, and range-test plan.
- Optional local-video analysis of a user-selected time segment, sampled at up to 20 frames per second (maximum 120 frames). It draws visible body joints and wrist trails with an overlay aligned to the video. The relative wrist-motion estimate is in shoulder-widths per second in the image plane—not clubhead speed. It requires internet on first use to fetch Google's model/WASM assets. Processing runs in the browser; the app does not upload or persist the video. This is experimental.

## Data and limitations

### Height-aware video results and Excel

Enter standing height in centimetres in the questionnaire or beside the video. Analyze a short clip with the full body visible, then scrub the player or use **Inspect sampled frame**. The overlay shows entered standing height separately from approximate pose height: bending lowers the latter instead of changing the entered height.

The results table includes 17 metrics: illustrative pose height, torso lean, left/right knee, hip and elbow angles, shoulder/hip line tilt, ankle separation, wrist heights, and shoulder-relative wrist speeds. Each metric shows the current frame, mean, minimum, maximum, and valid sample count. Angles are 2D projections, not 3D joint rotations. Missing/low-confidence joints remain unavailable. Left/right refer to model body sides; mirrored recordings can reverse them.

Centimetres and m/s use an **illustrative, uncalibrated scale**: the median visible nose–shoulders–hips–knee–ankle chain is assumed to equal 90% of entered standing height. The remaining 10% is an explicit heuristic allowance for missing head/foot endpoints, not a validated body-proportion measurement. At least three usable body-chain samples are required. The scale is fixed for the whole segment, so bending does not automatically stretch each frame back to standing height. Pose height is vertical nose-to-ankle span plus the fixed 10% allowance. Camera perspective and body rotation can distort every estimate; use a fixed camera and consistent distance. No clubhead speed, ball flight, pressure, or calibrated 3D measurement is inferred. Slow-motion video speeds refer to clip time, not original real-world capture time.

**Copy summary for Excel** or **Copy all frames** → open Excel → select A1 → Ctrl+V. If clipboard access is blocked, a selectable text box appears. **Download summary CSV** and **Download all frames CSV** save UTF-8 semicolon-separated files (not .xlsx). Choose decimal commas if your Excel uses them. If necessary, import through Excel **Data → From Text/CSV**, selecting UTF-8 and semicolon delimiter. Reports include entered height, clip name, sample counts, partial/cancelled status, units, and method notes. Empty cells mean unavailable, not zero. Video reports are separate from questionnaire/session JSON exports; export before resetting or leaving the results screen.

Geometry accounts for the video's width/height ratio. Wrist speeds compare consecutive visible frames no more than 0.2 seconds apart relative to the shoulder midpoint, using one median shoulder width for the segment. Long clips sampled at the 120-frame cap may have no usable speed intervals; choose a shorter segment. Wrist trails do not bridge missing detections. Maximum speeds can include tracking noise. Summary means are arithmetic means of valid sampled values, not time-weighted measurements.

Calculation/export regression checks (Node.js 22.18+): `node --test tests/videoMetrics.test.mjs`. Production build on Windows: `npm.cmd run build`.

The dated research document `Golf_Club_Fitting_Research_2026-11-07.md` was not present in the supplied project or Downloads folder when implementation began. The sample values and three model positioning/7-iron reference values come from Appendix A in the supplied prompt; they are labeled reference/demo data. The supplied YouTube clip was not independently inspected and is not connected to the sample TrackMan session.

The shortlist rules are deterministic, provisional catalog-positioning heuristics (`CATALOG_POSITIONING_V1`, `USER_PRIORITY_V1`), not validated fitting science. The static measurements do not determine exact length or lie. No shaft, grip, purchase eligibility, inventory, or score/probability is generated. Unknown product availability is not treated as in stock.

Sessions live in application memory until you download them; there is no account or remote database. Video object URLs are released when the session is reset or a different clip is selected. JSON files retain schema version, original-unit field names, source/provenance and unknowns.

## CSV format

Download `pocket-fitter-sample.csv` from inside the app. Recognized columns are `shot_id`, `club`, `club_speed_mph`, `ball_speed_mph`, `smash_factor`, `carry_m`, `total_m`, `height_m`, `spin_rpm`, `launch_deg`, `landing_deg`, `attack_deg`, and `lateral_m`. `carry_m` is required. Missing optional values remain unknown. Semicolon files may use decimal commas (for example `158,5`); ambiguous formats are not silently inferred.

## Modules

- `src/domain.ts` — contracts, Zod import schema, reference catalog, CSV parsing, statistics, provisional rules.
- `src/i18n.ts` — separate English/Finnish strings.
- `src/main.tsx` — guided flow, data import/export, results and MediaPipe adapter.
- `src/SwingVideoAnalyzer.tsx` — segment sampling, synchronized overlay, height-aware metrics UI and Excel copy/CSV export.
- `src/videoMetrics.ts` — aspect-corrected geometry, illustrative body scale, motion metrics, missing-data handling and spreadsheet-safe export.
- `src/videoMetrics.css` — responsive results table and frame controls.
- `src/style.css` — responsive interface.

Video model: MediaPipe Pose Landmarker Lite, loaded from Google's official model storage; browser runtime from jsDelivr package `@mediapipe/tasks-vision` (Apache-2.0). First-use network access is needed. The analyzer reports 2D pose geometry and relative wrist movement, with optional illustrative physical-unit estimates described above. It cannot measure clubhead speed, ball flight, or calibrated 3D motion. Automatic swing-phase detection, sensor support and LLM explanation are deferred.

## Demo script

Open the app → choose **Explore sample session** → review the nine 6-iron carries (including shot 8) → compare the three reference models → download the session or range plan → optionally choose a local video, set the start/end of a short swing segment, and analyze it. The overlay shows detected joints and wrist trails; its relative motion value is not club speed. On the home screen, **Start without measurements** demonstrates that no video or launch monitor is required.
