// Single source of truth for the video's scene timing, built directly from
// docs/DEMO_SCRIPT.md (v3, judge cut). Edit the numbers here, nothing else, once
// the raw screen recording exists: every composition reads from this file.
//
// HOW TO FILL IN footageStartSec / footageEndSec:
// 1. Drop the one continuous take at video/public/footage.mp4.
// 2. Run `pnpm studio` and scrub the "footage-scrub" composition (renders the raw
//    file full length with a running timecode burned in).
// 3. For each scene below, note the timecode where that scene's action starts and
//    ends in the raw file, and fill in the two TODO numbers.
// The cold open (0:00-0:25) is NOT a separate recording: it reuses the halftime
// settle moment from inside the "settlement" scene below, so its footage offsets
// should point at the same span as "settlement", trimmed to just the settle click
// through the green check.

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export type Scene =
  | {
      key: string;
      type: "footage";
      durationSec: number;
      /// Video file under video/public/ this scene is cut from. Defaults to
      /// footage.mp4 (the main take); the full time NO settle is a separate pickup.
      source?: string;
      /// Seconds into the source file where this scene's action starts.
      footageStartSec: number;
      /// Seconds into video/public/footage.mp4 where this scene's action ends.
      /// (footageEndSec - footageStartSec) does not need to equal durationSec: if
      /// the raw clip runs long, playback speed is left at 1x and the clip is cut
      /// short at durationSec; if it runs short, the last frame holds.
      footageEndSec: number;
      caption: string;
      /// Optional: a foreground zoom on part of the frame (e.g. the settle modal,
      /// the explorer inner instruction). Percent values are the transform origin.
      zoom?: { fromSec: number; toSec: number; scale: number; originXPercent: number; originYPercent: number };
      /// Optional narration file at video/public/narration/<key>.mp3. If the file
      /// is missing, the scene just plays with its original recorded audio.
      narration?: boolean;
    }
  | {
      key: string;
      type: "title";
      durationSec: number;
      heading: string;
      sub?: string;
      contrast?: { left: string; right: string }[];
      /// Narration file at video/public/narration/<key>.mp3, played over the card.
      narration?: boolean;
    }
  | {
      key: string;
      type: "end";
      durationSec: number;
      narration?: boolean;
    };

// durationSec of each footage/title scene is its narration clip length plus a short
// tail (see public/narration/*.mp3). footageStartSec/EndSec are mapped to the real
// take: betting 0-30s, markets lock and score moves to 1:1 by ~50s, the halftime
// settle modal to explorer to the "Verified 1.7s" green check runs 55-84s, the
// receipt and claim (score 2:1) run 84-100s, and the full game settles run 100-160s.
export const SCENES: Scene[] = [
  {
    key: "cold-open",
    type: "footage",
    durationSec: 14.5,
    // Settle button to click to modal, ending on the green "Verified, 1.7s" check
    // (solidly on screen at footage 68 to 70, before the explorer navigation).
    footageStartSec: 54.5,
    footageEndSec: 69,
    caption: "Halftime. This market just settled and paid, on chain. The match is still running.",
    zoom: { fromSec: 9, toSec: 14.5, scale: 1.15, originXPercent: 50, originYPercent: 42 },
    narration: true,
  },
  {
    key: "problem",
    type: "title",
    durationSec: 29.7,
    heading: "Whistle",
    sub: "Settle on the whistle.",
    contrast: [
      { left: "Optimistic oracle: hours to days", right: "Whistle: one block" },
      { left: "Final result only", right: "Any stat, mid match" },
    ],
    narration: true,
  },
  {
    key: "match-room",
    type: "footage",
    // Establishing tour of the room: score, feed panel, timeline, the markets grid.
    durationSec: 29.4,
    footageStartSec: 0.5,
    footageEndSec: 31,
    caption: "Live TxLINE feed. Every event you see is a data frame from the anchored stream.",
    narration: true,
  },
  {
    key: "betting",
    type: "footage",
    // The pools and the lock: betting closes on chain while the match runs to 1:1.
    durationSec: 23.2,
    footageStartSec: 30,
    footageEndSec: 54,
    caption: "Parimutuel pools. The odds are the pools. Betting closes while the match is in play.",
    narration: true,
  },
  {
    key: "settlement",
    type: "footage",
    // The full settle: click, modal, green check, then the explorer with the CPI
    // program logs (the "returned true" proof), then back to the verified receipt.
    durationSec: 28.1,
    footageStartSec: 60,
    footageEndSec: 88.5,
    caption: "One CPI into TxLINE validate_stat. It returned true.",
    zoom: { fromSec: 3, toSec: 24, scale: 1.08, originXPercent: 50, originYPercent: 44 },
    narration: true,
  },
  {
    key: "proof",
    type: "footage",
    // Back in the app: the receipt, the claim, the balance counting up, winnings.
    durationSec: 28.9,
    footageStartSec: 86,
    footageEndSec: 116,
    caption: "The proof is the authorization. Every link is independently checkable.",
    zoom: { fromSec: 5, toSec: 22, scale: 1.16, originXPercent: 50, originYPercent: 56 },
    narration: true,
  },
  {
    key: "full-time-no",
    type: "footage",
    // Full time: "Match total goals over 4.5" settling NO, from the pickup take. The
    // settle modal to the red "Settled NO" check to the explorer to the settled card.
    durationSec: 23.7,
    source: "footage-no.mp4",
    footageStartSec: 2,
    footageEndSec: 25.7,
    caption: "Three goals were scored. Over 4.5 is false, so it settles NO. The oracle proves negations too.",
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

export const TOTAL_DURATION_SEC = SCENES.reduce((sum, s) => sum + s.durationSec, 0);
export const TOTAL_DURATION_FRAMES = Math.round(TOTAL_DURATION_SEC * FPS);

/// The frame each scene starts on, in order, for building a <Series>.
export function sceneStartFrames(): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const s of SCENES) {
    starts.push(acc);
    acc += Math.round(s.durationSec * FPS);
  }
  return starts;
}
