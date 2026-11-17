import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from "remotion";
import { fonts, gradient, ink } from "../theme.ts";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const easeIn = Easing.bezier(0.5, 0, 0.75, 0);
/** The site's spring, for controls and chips only. */
export const spring = Easing.bezier(0.34, 1.4, 0.64, 1);

/** 0→1 over `dur` frames starting at `at`, eased. */
export function ramp(frame: number, at: number, dur = 18, easing = easeOut) {
  return interpolate(frame, [at, at + dur], [0, 1], { ...clamp, easing });
}

/** A small rise with blur resolving to sharp: the site's entrance. */
export function rise(frame: number, at: number, dur = 16, dist = 24): CSSProperties {
  const p = ramp(frame, at, dur);
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)`, filter: p < 1 ? `blur(${(1 - p) * 6}px)` : undefined };
}

const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .9  0 0 0 0 .9  0 0 0 0 .9  0 0 0 .6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

/** Film grain that moves every other frame, and a soft vignette. */
export function Grain({ amount = 0.07, edge = 0.5 }: { amount?: number; edge?: number }) {
  const frame = useCurrentFrame();
  const j = Math.floor(frame / 2) % 7;
  return (
    <>
      <AbsoluteFill style={{ pointerEvents: "none", backgroundImage: NOISE, backgroundPosition: `${j * 37}px ${j * 53}px`, opacity: amount, mixBlendMode: "overlay", zIndex: 50 }} />
      <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(4,6,14,${edge}) 100%)`, zIndex: 50 }} />
    </>
  );
}

/** How hard the last of `hits` is still ringing at `frame`: 1 on the hit, falling fast. */
export function ringing(frame: number, hits: number[], decay = 3.4) {
  const last = hits.filter((h) => h <= frame).at(-1);
  if (last === undefined) return { last: -1, k: 0 };
  return { last, k: Math.exp(-(frame - last) / decay) };
}

/** The camera: a slow push from `from`, and a jolt on every hit, so type feels heavy. */
export function Camera({ children, hits = [], power = 10, push = 0.0006, from = 0, origin = "50% 50%", style }: { children: ReactNode; hits?: number[]; power?: number; push?: number; from?: number; origin?: string; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const { last, k } = ringing(frame, hits);
  const a = random(`hit ${last}`) * Math.PI * 2;
  const scale = 1 + Math.max(0, frame - from) * push + 0.014 * k;
  return (
    <AbsoluteFill style={{ transform: `translate(${power * k * Math.cos(a)}px, ${power * k * Math.sin(a)}px) rotate(${(random(`rot ${last}`) - 0.5) * 0.5 * k}deg) scale(${scale})`, transformOrigin: origin, ...style }}>
      {children}
    </AbsoluteFill>
  );
}

/** A full-frame flash at `at`, gone in `dur` frames. */
export function Flash({ at, dur = 10, color = "#ffffff", peak = 0.9, blend = "screen" }: { at: number; dur?: number; color?: string; peak?: number; blend?: CSSProperties["mixBlendMode"] }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at - 1, at, at + dur], [0, peak, 0], clamp);
  if (o <= 0) return null;
  return <AbsoluteFill style={{ background: color, opacity: o, mixBlendMode: blend, pointerEvents: "none", zIndex: 45 }} />;
}

/** Comes down hard: large and fast, a small bounce, and an echo thrown off the hit. */
export function Slam({ at, from = 1.6, children, style, blur = true }: { at: number; from?: number; children: ReactNode; style?: CSSProperties; blur?: boolean }) {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0) return <span style={{ display: "inline-block", opacity: 0, ...style }}>{children}</span>;
  const drop = interpolate(t, [0, 3], [from, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const bounce = interpolate(t, [3, 5, 10], [1, 0.975, 1], clamp);
  const thrown = interpolate(t, [3, 12], [1, 1.14], { ...clamp, easing: Easing.out(Easing.quad) });
  const echo = interpolate(t, [3, 12], [0.4, 0], clamp);
  return (
    <span style={{ position: "relative", display: "inline-block", transform: `scale(${t < 3 ? drop : bounce})`, filter: blur && t < 3 ? `blur(${(3 - t) * 2.5}px)` : undefined, ...style }}>
      {t >= 3 && t < 12 && <span style={{ position: "absolute", inset: 0, opacity: echo, transform: `scale(${thrown})` }}>{children}</span>}
      {children}
    </span>
  );
}

/** Text typed on at `cps` characters a second, with a block caret while it types. */
export function Typed({ at, text, cps = 40, style, caret = true }: { at: number; text: string; cps?: number; style?: CSSProperties; caret?: boolean }) {
  const frame = useCurrentFrame();
  const n = Math.max(0, Math.floor(((frame - at) / 30) * cps));
  if (frame < at) return null;
  const done = n >= text.length;
  return (
    <span style={{ whiteSpace: "pre-wrap", ...style }}>
      {text.slice(0, n)}
      {caret && (!done || Math.floor(frame / 8) % 2 === 0) && <span style={{ display: "inline-block", width: "0.55em", height: "1em", marginLeft: 3, verticalAlign: "-0.12em", background: "currentColor", opacity: 0.8 }} />}
    </span>
  );
}

/** Frames it takes to type `text` at `cps`. */
export const typeFrames = (text: string, cps = 40) => Math.ceil((text.length / cps) * 30);

/** A figure whose digits roll into place, last digit first. */
export function Rolling({ at, value, dur = 24, style }: { at: number; value: string; dur?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const chars = [...value];
  const digits = chars.filter((c) => /\d/.test(c)).length;
  let d = 0;
  return (
    <span style={{ display: "inline-flex", fontVariantNumeric: "tabular-nums", ...style }}>
      {chars.map((c, i) => {
        if (!/\d/.test(c)) return <span key={i}>{c}</span>;
        const k = d++;
        const settle = at + dur * ((k + 1) / digits);
        const target = Number(c);
        const spins = Math.max(0, settle - frame);
        const shown = frame < at ? 0 : spins > 0 ? (target + Math.floor(spins * 1.7)) % 10 : target;
        return (
          <span key={i} style={{ display: "inline-block", filter: spins > 0 ? "blur(1.2px)" : undefined }}>
            {shown}
          </span>
        );
      })}
    </span>
  );
}

/** A small uppercase mono label, the site's eyebrow voice. */
export function Label({ children, color = ink.soft, size = 18, style }: { children: ReactNode; color?: string; size?: number; style?: CSSProperties }) {
  return <div style={{ fontFamily: fonts.mono, fontWeight: 500, fontSize: size, letterSpacing: size * 0.12, textTransform: "uppercase", color, whiteSpace: "nowrap", ...style }}>{children}</div>;
}

/** Text filled with the one gradient family, slowly panning. */
export function GradientText({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  return (
    <span
      style={{
        backgroundImage: gradient,
        backgroundSize: "220% 100%",
        backgroundPosition: `${(Math.sin(frame / 90) * 0.5 + 0.5) * 100}% 50%`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
