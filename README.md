# Pocket Fitter

A video first golf club fitting prototype for exploring a Takomo iron shortlist. The app uses a swing video, simple follow-up questions, and clear explanations to help the player compare two starting models. This is a research prototype, not professional fitting advice or a live inventory system.

## Run it on Windows

1. Install the current Node.js LTS release from [nodejs.org](https://nodejs.org/).
2. Open this project folder in VS Code.
3. Open a terminal and run:

   ```powershell
   npm install
   npm run dev
   ```

4. Open the local address printed by Vite, usually `http://localhost:5173`.

No API key or account is required. The first video analysis loads the MediaPipe model and runtime from the internet.

## Current fitting flow

- Choose the club you want to film.
- Enter standing height in feet and inches.
- Upload one swing video.
- Select the downswing segment, from the moment the club starts moving down through the follow-through.
- Analyze the video in the browser.
- Answer questions one at a time. The video stays available beside the questions and can be hidden.
- See which measurements relate to each answer and why that answer matters for the fitting.
- Compare the final two Takomo models. Selecting a model plays the short product video and then opens its official product page automatically.

## Video analysis

The analyzer samples the selected video segment and draws visible body landmarks over the video. It can estimate posture, torso lean, body scale, wrist height, and relative wrist movement in the image plane.

The movement estimate is not clubhead speed. The video cannot independently prove clubhead speed, ball flight, pressure, dynamic lie, or calibrated three dimensional measurements. Entered height supplies the reference scale for body estimates; the video does not independently measure a person's true height.

Use a stationary camera, good light, and a view where the full body, hands, and club remain visible. Low confidence or missing measurements are shown as unavailable. Video processing runs in the browser and the selected video is not uploaded by this prototype.

## Product data and recommendations

The product comparison uses a dated Takomo reference catalog stored in `src/data/takomo-products.json`. Recommendations are provisional and explainable. They do not claim current stock, price, exact build compatibility, or guaranteed performance.

Product cards link to official Takomo product pages. The purchase handoff video is stored at `public/golf-swing5000.mp4`.

A future backend connected language model can explain missing information, compare the final models, and choose useful follow-up questions. See [FUTURE_LLM_FOLLOW_UP.md](FUTURE_LLM_FOLLOW_UP.md).

## Stable GitHub version

The current stable release is tagged `v1.0.0-pocket-fitter`. Future work can continue on `master` without changing that tag.

Clone the stable branch:

```bash
git clone --branch stable/pocket-fitter-v1.0.0 https://github.com/Sugrob-2/pocket-fitter.git
```

Or download the tagged archive:

[Download the stable release](https://github.com/Sugrob-2/pocket-fitter/archive/refs/tags/v1.0.0-pocket-fitter.zip)

## Main modules

- `src/main3.tsx` — the active video first fitting flow, questions, product shortlist, and purchase handoff.
- `src/SwingVideoAnalyzer.tsx` — video upload, segment selection, pose sampling, and automatic frame focus.
- `src/videoMetrics.ts` — aspect corrected pose geometry and illustrative body measurements.
- `src/takomo-theme.css` — Takomo inspired colors and product presentation.
- `src/data/takomo-products.json` — reference product catalog used by the recommendation rules.
- `src/fitting.ts` — deterministic provisional recommendation rules.

## Build

For a production build on Windows:

```powershell
npm.cmd run build
```
