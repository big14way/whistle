// One scene cut from the raw screen recording: trims video/public/footage.mp4 to
// the scene's span, optionally zooms into part of the frame (the settle modal, the
// explorer inner instruction), overlays the caption, and plays a separate narration
// track in place of the footage's own audio (recorded narration syncs far more
// reliably than talking while clicking, see docs/DEMO_SCRIPT.md).
//
// footage.mp4 is already cropped to the browser (the raw capture was a full desktop
// with dock, menu bar, and other windows around it), so it is a touch taller than
// 16:9. Fit it with objectFit contain onto the app's brand background, which loses
// no app content and reads as an intentional dark frame, not letterbox bars.

import { interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Caption } from "./Caption";
import { color } from "../theme";
import type { Scene } from "../timeline";

export function FootageScene({ scene }: { scene: Extract<Scene, { type: "footage" }> }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let scale = 1;
  let originX = 50;
  let originY = 50;
  if (scene.zoom) {
    const { fromSec, toSec, scale: targetScale, originXPercent, originYPercent } = scene.zoom;
    const fromFrame = fromSec * fps;
    const toFrame = toSec * fps;
    scale = interpolate(
      frame,
      [fromFrame, fromFrame + 15, toFrame, toFrame + 15],
      [1, targetScale, targetScale, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    originX = originXPercent;
    originY = originYPercent;
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: color.bg }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${scale})`,
          transformOrigin: `${originX}% ${originY}%`,
        }}
      >
        <OffthreadVideo
          src={staticFile("footage.mp4")}
          startFrom={Math.round(scene.footageStartSec * fps)}
          endAt={Math.round(scene.footageEndSec * fps)}
          muted={scene.narration}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
      {/* Narration audio is played centrally in Video.tsx; here we only mute the
          footage's own sound when a voiceover is present. */}
      <Caption text={scene.caption} appearFrame={Math.round(fps * 1.5)} />
    </div>
  );
}
