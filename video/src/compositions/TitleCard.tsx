// The "problem" scene (0:25 to 0:50 in the script): title card, then a two row
// contrast between optimistic oracle settlement and Whistle's one block settle.

import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, font } from "../theme";

export function TitleCard({
  heading,
  sub,
  contrast,
}: {
  heading: string;
  sub?: string;
  contrast?: { left: string; right: string }[];
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headingIn = spring({ frame, fps, config: { damping: 200 } });
  const subOpacity = interpolate(frame, [10, 25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const contrastStart = 35;

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
        gap: 24,
      }}
    >
      <div
        style={{
          fontFamily: font.display,
          fontSize: 108,
          fontWeight: 700,
          color: color.text,
          opacity: headingIn,
          transform: `translateY(${(1 - headingIn) * 24}px)`,
        }}
      >
        {heading}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: font.body,
            fontSize: 40,
            color: color.accent,
            opacity: subOpacity,
          }}
        >
          {sub}
        </div>
      )}

      {contrast && (
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 18 }}>
          {contrast.map((row, i) => {
            const rowFrame = frame - contrastStart - i * 18;
            const rowIn = spring({ frame: rowFrame, fps, config: { damping: 200 } });
            if (rowFrame < -10) return null;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 28,
                  opacity: rowIn,
                  transform: `translateX(${(1 - rowIn) * -40}px)`,
                }}
              >
                <div
                  style={{
                    width: 460,
                    padding: "14px 22px",
                    borderRadius: 12,
                    border: `1px solid ${color.border}`,
                    background: color.surface,
                    color: color.textMuted,
                    fontFamily: font.mono,
                    fontSize: 24,
                    textAlign: "right",
                  }}
                >
                  {row.left}
                </div>
                <div
                  style={{
                    width: 28,
                    height: 2,
                    background: color.accent,
                  }}
                />
                <div
                  style={{
                    width: 460,
                    padding: "14px 22px",
                    borderRadius: 12,
                    border: `1px solid rgba(0, 229, 160, 0.4)`,
                    background: "rgba(0, 229, 160, 0.1)",
                    color: color.yes,
                    fontFamily: font.mono,
                    fontSize: 24,
                  }}
                >
                  {row.right}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
