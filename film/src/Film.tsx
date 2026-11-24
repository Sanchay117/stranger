import type { ComponentType, ReactNode } from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { DROP_S } from "./beats.ts";
import { FPS, OVERLAP, TEASER_FRAMES, type Plan, type Shot } from "./plan.ts";
import { Brief } from "./scenes/Brief.tsx";
import { Bug } from "./scenes/Bug.tsx";
import { Close } from "./scenes/Close.tsx";
import { Ask, Fix, Hook, Loop } from "./scenes/Agent.tsx";
import { Clean, Owner, Probe } from "./scenes/KaneRun.tsx";
import { LiveScene } from "./scenes/Live.tsx";
import { Bench } from "./scenes/Bench.tsx";
import { Replay } from "./scenes/Replay.tsx";
import { Teaser } from "./scenes/Teaser.tsx";
import { Captions } from "./ui/Captions.tsx";
import { clamp, easeInOut, Grain } from "./ui/kit.tsx";
import { Backdrop } from "./ui/parts.tsx";

export interface SceneProps {
  shot: Shot;
  plan: Plan;
}

export interface FilmProps extends Record<string, unknown> {
  captions: boolean;
  music: boolean;
  plan?: Plan;
}

const SCENES: Record<string, ComponentType<SceneProps>> = {
  teaser: Teaser,
  "d-bug": Bug,
  "d-owner": Owner,
  "d-stranger": Probe,
  "d-replay": Replay,
  "d-brief": Brief,
  "d-loop": Loop,
  "d-hook": Hook,
  "d-ask": Ask,
  "d-fix": Fix,
  "d-clean": Clean,
  "d-bench": Bench,
  "d-live": LiveScene,
  "d-close": Close,
};

/** Each scene comes in over the one before: a fade, a little push and a blur resolving. */
function Transition({ children, shot, plan }: { children: ReactNode; shot: Shot; plan: Plan }) {
  const frame = useCurrentFrame();
  const i = plan.shots.indexOf(shot);
  const prev = plan.shots[i - 1];
  const next = plan.shots[i + 1];
  const comesIn = prev && prev.from + prev.frames > shot.from;
  const goesOut = next && shot.from + shot.frames > next.from;
  const pin = comesIn ? interpolate(frame, [0, OVERLAP], [0, 1], { ...clamp, easing: easeInOut }) : 1;
  const pout = goesOut ? interpolate(frame, [shot.frames - OVERLAP, shot.frames], [0, 1], { ...clamp, easing: easeInOut }) : 0;
  const scale = 1 + (1 - pin) * 0.035 - pout * 0.025;
  const blur = (1 - pin) * 10 + pout * 10;
  return <AbsoluteFill style={{ opacity: pin * (1 - pout), transform: `scale(${scale})`, filter: blur > 0.05 ? `blur(${blur}px)` : undefined }}>{children}</AbsoluteFill>;
}

export function Film({ captions, music, plan }: FilmProps) {
  if (!plan) return null;
  return (
    <AbsoluteFill style={{ background: "#0b0f1d" }}>
      <Backdrop />
      {plan.shots.map((shot) => {
        const Scene = SCENES[shot.id];
        return (
          <Sequence key={shot.id} from={shot.from} durationInFrames={shot.frames} name={shot.id}>
            <Transition shot={shot} plan={plan}>
              <Scene shot={shot} plan={plan} />
            </Transition>
            {captions && shot.id !== "teaser" && <Captions shot={shot} />}
          </Sequence>
        );
      })}
      {captions && <TeaserCaptions plan={plan} />}
      <Grain />
      {plan.voices.map((voice) => (
        <Sequence key={voice.id} from={voice.from} durationInFrames={voice.frames} name={`vo ${voice.id}`}>
          <Audio src={staticFile(voice.file)} volume={voice.from < TEASER_FRAMES ? TEASER_VOICE : 1} />
        </Sequence>
      ))}
      {music && <Score plan={plan} />}
    </AbsoluteFill>
  );
}

/** The teaser's lines get captions too, placed where each line sits on the score. */
function TeaserCaptions({ plan }: { plan: Plan }) {
  return (
    <>
      {Object.entries(plan.teaser).map(([id, take]) => {
        const from = Math.round(plan.teaserAt[id] * FPS);
        const shot: Shot = { id, from, frames: Math.ceil(take.seconds * FPS) + 20, voiceAt: 0, take, text: "" };
        return (
          <Sequence key={id} from={from} durationInFrames={shot.frames} name={`cap ${id}`}>
            <Captions shot={shot} />
          </Sequence>
        );
      })}
    </>
  );
}

const fade = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** The narrator sits a little forward in the teaser, where the words compete with a full score. */
const TEASER_VOICE = 1.35;
/** One pass of sfx/bed.wav. A looped Audio restarts its volume frame each pass, so the passes are laid out by hand. */
const BED = 64 * FPS;

/**
 * The teaser's score, then a quiet bed under the demo. Under a teaser line the score falls away so
 * the words stay on top; only the first beat of the drop lands at full strength. The bed swells a
 * little on the close.
 */
function Score({ plan }: { plan: Plan }) {
  const DROP = DROP_S * FPS;
  const lines = plan.voices.filter((v) => v.from < TEASER_FRAMES);
  const beneath = (frame: number) => interpolate(frame, [0, 300, 540, 660], [0.62, 0.42, 0.3, 0.26], fade);
  const hit = (frame: number) => interpolate(frame, [DROP - 2, DROP, DROP + 4, DROP + 12], [0, 1, 1, 0], fade);
  const ducked = (frame: number) => {
    const under = lines.reduce((most, v) => Math.max(most, interpolate(frame, [v.from - 5, v.from + 1, v.from + v.frames - 3, v.from + v.frames + 5], [0, 1, 1, 0], fade)), 0);
    return 1 - (1 - beneath(frame)) * under * (1 - hit(frame));
  };
  const level = (frame: number) => interpolate(frame, [0, 240, 480, 530, 540, 640, 700, 760], [0.4, 0.46, 0.55, 0.62, 0.85, 0.8, 0.5, 0.3], fade);
  const close = plan.shots.at(-1)!;
  const bed = (frame: number) => {
    const left = plan.total - frame;
    const swell = interpolate(frame, [close.from, close.from + 40], [0, 1], fade);
    return interpolate(frame - TEASER_FRAMES, [-30, 90], [0, 0.1], fade) * (1 + 0.8 * swell) * interpolate(left, [0, 75], [0, 1], fade);
  };
  const passes = Math.ceil((plan.total - TEASER_FRAMES + 30) / BED);
  return (
    <>
      <Audio src={staticFile("sfx/teaser.wav")} volume={(f) => level(f) * ducked(f)} />
      {Array.from({ length: passes }, (_, pass) => {
        const from = TEASER_FRAMES - 30 + pass * BED;
        return (
          <Sequence key={pass} from={from} durationInFrames={BED} name={`bed ${pass + 1}`}>
            <Audio src={staticFile("sfx/bed.wav")} volume={(f) => bed(from + f)} />
          </Sequence>
        );
      })}
    </>
  );
}
