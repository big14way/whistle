# Whistle demo video (Remotion)

Assembles the submission video from one raw screen recording plus per scene
narration, following `docs/DEMO_SCRIPT.md` (v3, judge cut) exactly. The scene list,
captions, and timing all live in one file: `src/timeline.ts`.

## What is already built

- `src/timeline.ts`, every scene from the script (cold open, problem, match room,
  betting, settlement, proof, full time NO, close) with its duration and caption.
- `src/compositions/TitleCard.tsx`, the problem scene: heading, tagline, and the
  animated two row optimistic-oracle-vs-Whistle contrast.
- `src/compositions/EndCard.tsx`, the closing card with the repo URL and program ID.
- `src/compositions/FootageScene.tsx`, trims the raw recording to a scene's span,
  overlays the caption, plays the separate narration track, and supports an
  optional zoom into part of the frame (used on the settle modal and the explorer
  inner instruction).
- `src/compositions/FootageScrub.tsx`, a helper composition that burns a running
  timecode onto the raw recording so you can read off exact cut points.
- Colors and fonts (`src/theme.ts`) are ported 1:1 from `app/src/theme/tokens.css`,
  loaded via `@remotion/google-fonts`, so the video and the app read as one product.

## What you still need to do

### 1. Install dependencies

```bash
cd video
pnpm install
```

### 2. Record the raw footage

Follow the pre record checklist in `docs/DEMO_SCRIPT.md`, then record ONE
continuous take covering scenes 2 through 7 (match room through the full time NO
settle). Do not restart on small stumbles; everything gets cut here. Save it as:

```
video/public/footage.mp4
```

Record the browser MAXIMIZED (or full screen) with the camera off, so the capture
is just the app. If the take is a full desktop capture instead (dock, menu bar,
other windows visible), crop it to the browser first, for example:

```
ffmpeg -i raw.mov -vf "crop=W:H:X:Y,scale=2400:-2:flags=lanczos" \
  -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac public/footage.mp4
```

FootageScene fits the result with objectFit contain onto the brand background, so a
slightly-taller-than-16:9 crop frames cleanly with no lost app content.

### 3. Record narration, one file per scene

Read the "Narration:" block for each scene from `docs/DEMO_SCRIPT.md` separately
from the screen recording (much easier to sync than talking while clicking). Save
each as `video/public/narration/<scene-key>.mp3`, matching the `key` field in
`src/timeline.ts`:

```
video/public/narration/cold-open.mp3
video/public/narration/match-room.mp3
video/public/narration/betting.mp3
video/public/narration/settlement.mp3
video/public/narration/proof.mp3
video/public/narration/full-time-no.mp3
```

("problem" and "close" have no footage or narration file: they are on screen text
cards. Read their lines live over the card instead, or add narration support for
them later if you want voice under the title/end cards too.)

### 4. Find your cut points

```bash
pnpm studio
```

Open the `footage-scrub` composition. It plays your raw recording full length
with a running timecode in the corner. Scrub to where each scene's action starts
and ends, and fill in the two `footageStartSec` / `footageEndSec` numbers for that
scene in `src/timeline.ts` (every spot is marked `TODO`). The `cold-open` scene
reuses the same span as `settlement`, trimmed to just the settle click through the
green check, since the script's cold open is not a separate recording.

### 5. Preview the assembled video

```bash
pnpm studio
```

Open the `Video` composition. Watch the full cut, adjust `footageStartSec` /
`footageEndSec` / the `zoom` windows in `src/timeline.ts` until it matches, save,
and Remotion Studio hot reloads automatically.

### 6. Render

```bash
pnpm render
```

Output: `video/out/whistle-demo.mp4`. That is the file you submit.

## Notes

- Raw recordings, narration audio, and rendered output are gitignored (see the
  root `.gitignore`): they are large binaries, not source. Only `src/` is
  committed.
- If `pnpm studio` errors on `footage-scrub` or any `Video` scene before you have
  dropped in `footage.mp4`, that is expected: drop the file in and reload.
- To change a caption's wording or timing, edit `caption` (and the `Caption`
  component's `appearFrame`/`holdFrames` if you want finer control) in
  `src/timeline.ts`; nothing else needs to change.
