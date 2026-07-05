// The full assembled video: every scene from timeline.ts, in order, as a Series.
// This is the composition rendered to out/whistle-demo.mp4.

import { loadFont as loadDisplay } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { AbsoluteFill, Series } from "remotion";
import { EndCard } from "./compositions/EndCard";
import { FootageScene } from "./compositions/FootageScene";
import { TitleCard } from "./compositions/TitleCard";
import { color } from "./theme";
import { FPS, SCENES } from "./timeline";

// Only the weights actually used anywhere in the video, and only the latin
// subset, so a render does not fetch dozens of unused font files.
loadDisplay("normal", { weights: ["400", "700"], subsets: ["latin"] });
loadBody("normal", { weights: ["400", "600"], subsets: ["latin"] });
loadMono("normal", { weights: ["400"], subsets: ["latin"] });

export function Video() {
  return (
    <AbsoluteFill style={{ background: color.bg }}>
      <Series>
        {SCENES.map((scene) => (
          <Series.Sequence key={scene.key} durationInFrames={Math.round(scene.durationSec * FPS)}>
            {scene.type === "footage" && <FootageScene scene={scene} />}
            {scene.type === "title" && (
              <TitleCard heading={scene.heading} sub={scene.sub} contrast={scene.contrast} />
            )}
            {scene.type === "end" && <EndCard />}
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
}
