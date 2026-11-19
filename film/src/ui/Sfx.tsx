import { Audio, Sequence, staticFile } from "remotion";

export type SfxName = "stamp" | "press" | "thud" | "whoosh" | "tick" | "paper" | "chime" | "typing" | "ratchet";

/** A one-shot sound effect from public/sfx (made by scripts/sfx.ts) at a scene frame. */
export function Sfx({ name, at, volume = 0.5, frames = 90 }: { name: SfxName; at: number; volume?: number; frames?: number }) {
  return (
    <Sequence from={Math.max(0, Math.round(at))} durationInFrames={frames} name={`sfx ${name}`} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
}

/** Keys typing under a typed line, for as long as it types. */
export function Typing({ at, frames, volume = 0.18 }: { at: number; frames: number; volume?: number }) {
  return <Sfx name="typing" at={at} frames={Math.max(1, Math.min(frames, 118))} volume={volume} />;
}
