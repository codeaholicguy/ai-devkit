"use client";

import { useEffect, useRef, type ComponentType } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { FPS } from "./theme";

interface LoopPlayerProps {
  // Compositions take different props; inputProps must match the one loaded.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lazyComponent: () => Promise<{ default: ComponentType<any> }>;
  inputProps?: Record<string, unknown>;
  durationInFrames: number;
  width: number;
  height: number;
  label: string;
}

// Plays only while on screen; reduced motion gets the final frame as a still.
export default function LoopPlayer({
  lazyComponent,
  inputProps,
  durationInFrames,
  width,
  height,
  label,
}: LoopPlayerProps) {
  const player = useRef<PlayerRef>(null);
  const box = useRef<HTMLDivElement>(null);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const lastFrame = durationInFrames - 1;

  useEffect(() => {
    const p = player.current;
    if (!p || !box.current) return;
    if (reduceMotion) {
      p.pause();
      p.seekTo(lastFrame);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? p.play() : p.pause()),
      { threshold: 0.25 },
    );
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [reduceMotion, lastFrame]);

  return (
    <div ref={box} role="img" aria-label={label}>
      <Player
        ref={player}
        lazyComponent={lazyComponent}
        inputProps={inputProps}
        durationInFrames={durationInFrames}
        compositionWidth={width}
        compositionHeight={height}
        fps={FPS}
        initialFrame={reduceMotion ? lastFrame : 0}
        loop
        // Silent compositions: unmuted, playback waits on an AudioContext that
        // Chrome only resumes after a user gesture, freezing on frame 0.
        initiallyMuted
        numberOfSharedAudioTags={0}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        style={{ width: "100%", aspectRatio: `${width} / ${height}` }}
      />
    </div>
  );
}
