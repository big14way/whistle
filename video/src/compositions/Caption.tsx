// Bottom third caption, so the video reads with the sound off. Fades in, holds,
// fades out; timed relative to the start of the Sequence it is placed inside.

import { interpolate, useCurrentFrame } from "remotion";
import { color, font } from "../theme";

const FADE_FRAMES = 12;

export function Caption({
  text,
  appearFrame = 0,
  holdFrames = 999999,
}: {
  text: string;
  /// Frame (relative to the enclosing Sequence) the caption starts fading in.
  appearFrame?: number;
  /// How many frames after appearing the caption stays before fading out. Default
  /// effectively means "stays until the scene ends".
  holdFrames?: number;
}) {
  const frame = useCurrentFrame();
  const local = frame - appearFrame;
  if (local < -FADE_FRAMES) return null;

  const opacity = interpolate(
    local,
    [0, FADE_FRAMES, holdFrames, holdFrames + FADE_FRAMES],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  if (opacity <= 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 72,
        display: "flex",
        justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          maxWidth: "72%",
          padding: "16px 28px",
          borderRadius: 12,
          background: "rgba(10, 14, 20, 0.82)",
          border: `1px solid ${color.border}`,
          color: color.text,
          fontFamily: font.body,
          fontSize: 30,
          lineHeight: 1.4,
          textAlign: "center",
        }}
      >
        {text}
      </div>
    </div>
  );
}
