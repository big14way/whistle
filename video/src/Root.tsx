import { getVideoMetadata } from "@remotion/media-utils";
import { Composition, staticFile } from "remotion";
import { FootageScrub } from "./compositions/FootageScrub";
import { FPS, HEIGHT, TOTAL_DURATION_FRAMES, WIDTH } from "./timeline";
import { Video } from "./Video";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="Video"
        component={Video}
        durationInFrames={TOTAL_DURATION_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      {/* Scrub helper: drop the raw take at public/footage.mp4, then preview this
          composition to read off timecodes for timeline.ts. Not part of the final
          render. Reads the file's real duration, so it only resolves once the
          footage file exists. */}
      <Composition
        id="footage-scrub"
        component={FootageScrub}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={FPS * 60}
        calculateMetadata={async () => {
          const data = await getVideoMetadata(staticFile("footage.mp4"));
          return { durationInFrames: Math.ceil(data.durationInSeconds * FPS), fps: FPS, width: WIDTH, height: HEIGHT };
        }}
      />
    </>
  );
};
