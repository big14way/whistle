// A ~60s social teaser cut (landscape 16:9, for X / LinkedIn). Different rhythm from
// the full video: hook first, four fast beats, punchy captions that carry it muted.
// Reuses the same footage and narration clips as the full cut (matching keys), so
// nothing new needs recording. The contrast card has no narration file, so it plays
// under the captions only.

import { FPS } from "./timeline";
import type { Scene } from "./timeline";

export const SOCIAL_SCENES: Scene[] = [
  {
    key: "cold-open",
    type: "footage",
    durationSec: 14.5,
    footageStartSec: 54.5,
    footageEndSec: 69,
    caption: "This bet settled and paid at halftime. On chain. While the match was still playing.",
    zoom: { fromSec: 9, toSec: 14.5, scale: 1.15, originXPercent: 50, originYPercent: 42 },
    narration: true,
  },
  {
    key: "social-contrast",
    type: "title",
    durationSec: 5,
    heading: "Any stat. One block.",
    contrast: [
      { left: "Optimistic oracle: hours", right: "Whistle: one block" },
      { left: "Final result only", right: "Any in game stat" },
    ],
  },
  {
    key: "full-time-no",
    type: "footage",
    durationSec: 23.7,
    source: "footage-no.mp4",
    footageStartSec: 2,
    footageEndSec: 25.7,
    caption: "It even proves a negation. Over 4.5 goals? Only three scored. Settles NO, in one block.",
    zoom: { fromSec: 5, toSec: 14, scale: 1.12, originXPercent: 50, originYPercent: 45 },
    narration: true,
  },
  {
    key: "close",
    type: "end",
    durationSec: 16.6,
    narration: true,
  },
];

export const SOCIAL_DURATION_FRAMES = Math.round(
  SOCIAL_SCENES.reduce((sum, s) => sum + s.durationSec, 0) * FPS,
);
