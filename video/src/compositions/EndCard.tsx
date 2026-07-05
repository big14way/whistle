// The close scene (3:45 to 4:00 in the script): the closing line, the repo URL and
// program ID, and the tagline.

import { interpolate, useCurrentFrame } from "remotion";
import { color, font } from "../theme";

const REPO_URL = "github.com/big14way/whistle";
const PROGRAM_ID = "9zhvjPzcUw4DZYBB7qSQ92pXyupkfV8ircrHW6dMAJpW";

export function EndCard() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: color.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: font.display,
          fontSize: 44,
          color: color.text,
          textAlign: "center",
          maxWidth: 1100,
          lineHeight: 1.4,
        }}
      >
        No dispute window. No resolver.
        <br />
        Paid the instant it was provable.
      </div>

      <div style={{ height: 20 }} />

      <div
        style={{
          fontFamily: font.mono,
          fontSize: 26,
          color: color.textMuted,
        }}
      >
        {REPO_URL}
      </div>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 20,
          color: color.textMuted,
        }}
      >
        {PROGRAM_ID}
      </div>

      <div style={{ height: 32 }} />

      <div
        style={{
          fontFamily: font.body,
          fontSize: 34,
          color: color.accent,
          fontWeight: 600,
        }}
      >
        Whistle. Settle on the whistle.
      </div>
    </div>
  );
}
