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
      /// Seconds into video/public/footage.mp4 where this scene's action starts.
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
    }
  | {
      key: string;
      type: "end";
      durationSec: number;
    };

export const SCENES: Scene[] = [
  {
    key: "cold-open",
    type: "footage",
    durationSec: 25,
    footageStartSec: 0, // TODO: point at the halftime settle click in the full take
    footageEndSec: 25,
    caption: "Halftime. This market just settled and paid, on chain. The match is still running.",
    zoom: { fromSec: 8, toSec: 20, scale: 1.15, originXPercent: 50, originYPercent: 50 },
    narration: true,
  },
  {
    key: "problem",
    type: "title",
    durationSec: 25,
    heading: "Whistle",
    sub: "Settle on the whistle.",
    contrast: [
      { left: "Optimistic oracle: hours to days", right: "Whistle: one block" },
      { left: "Final result only", right: "Any stat, mid match" },
    ],
  },
  {
    key: "match-room",
    type: "footage",
    durationSec: 40,
    footageStartSec: 25, // TODO: fill in from the raw take
    footageEndSec: 65,
    caption: "Live TxLINE feed. Every event you see is a data frame from the anchored stream.",
    narration: true,
  },
  {
    key: "betting",
    type: "footage",
    durationSec: 35,
    footageStartSec: 65, // TODO: fill in from the raw take
    footageEndSec: 100,
    caption: "Parimutuel pools. The odds are the pools. Real devnet transactions.",
    narration: true,
  },
  {
    key: "settlement",
    type: "footage",
    durationSec: 45,
    footageStartSec: 100, // TODO: fill in from the raw take (same span as cold-open)
    footageEndSec: 145,
    caption: "One CPI into TxLINE validate_stat. It returned true.",
    zoom: { fromSec: 20, toSec: 40, scale: 1.15, originXPercent: 50, originYPercent: 50 },
    narration: true,
  },
  {
    key: "proof",
    type: "footage",
    durationSec: 25,
    footageStartSec: 145, // TODO: fill in from the raw take
    footageEndSec: 170,
    caption: "The proof is the authorization. Every link is independently checkable.",
    zoom: { fromSec: 3, toSec: 15, scale: 1.3, originXPercent: 50, originYPercent: 35 },
    narration: true,
  },
  {
    key: "full-time-no",
    type: "footage",
    durationSec: 30,
    footageStartSec: 170, // TODO: fill in from the raw take
    footageEndSec: 200,
    caption: "Three goals were scored. Over 4.5 is false, so it settles NO. The oracle proves negations too.",
    narration: true,
  },
  {
    key: "close",
    type: "end",
    durationSec: 15,
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
