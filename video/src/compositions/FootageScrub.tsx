// Helper composition, not part of the final video: plays the raw screen recording
// full length with a running timecode burned into the corner, so you can scrub in
// Remotion Studio and read off the footageStartSec / footageEndSec numbers for
// each scene in ../timeline.ts.

import { OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { color, font } from "../theme";

function timecode(frame: number, fps: number): string {
  const totalSec = frame / fps;
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

export function FootageScrub() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      <OffthreadVideo
        src={staticFile("footage.mp4")}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
      <div
        style={{
          position: "absolute",
          top: 24,
          left: 24,
          padding: "10px 18px",
          borderRadius: 10,
          background: "rgba(10, 14, 20, 0.85)",
          border: `1px solid ${color.border}`,
          color: color.yes,
          fontFamily: font.mono,
          fontSize: 32,
        }}
      >
        {timecode(frame, fps)}
      </div>
    </div>
  );
}
