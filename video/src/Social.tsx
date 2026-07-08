// The ~60s social teaser, assembled from socialTimeline.ts. Mirrors Video.tsx but
// over the shorter scene list. Rendered to out/whistle-social.mp4.

import { loadFont as loadDisplay } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { AbsoluteFill, Audio, Series, staticFile } from "remotion";
import { EndCard } from "./compositions/EndCard";
import { FootageScene } from "./compositions/FootageScene";
import { TitleCard } from "./compositions/TitleCard";
import { color } from "./theme";
import { FPS } from "./timeline";
import { SOCIAL_SCENES } from "./socialTimeline";

loadDisplay("normal", { weights: ["400", "700"], subsets: ["latin"] });
loadBody("normal", { weights: ["400", "600"], subsets: ["latin"] });
loadMono("normal", { weights: ["400"], subsets: ["latin"] });

export function Social() {
  return (
    <AbsoluteFill style={{ background: color.bg }}>
      <Series>
        {SOCIAL_SCENES.map((scene) => (
          <Series.Sequence key={scene.key} durationInFrames={Math.round(scene.durationSec * FPS)}>
            {scene.type === "footage" && <FootageScene scene={scene} />}
            {scene.type === "title" && (
              <TitleCard heading={scene.heading} sub={scene.sub} contrast={scene.contrast} />
            )}
            {scene.type === "end" && <EndCard />}
            {scene.narration && <Audio src={staticFile(`narration/${scene.key}.mp3`)} />}
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
}
