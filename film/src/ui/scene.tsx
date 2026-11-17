import type { CSSProperties, ReactNode } from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { fonts, ink } from "../theme.ts";
import { clamp, easeInOut, easeOut, Label, ramp } from "./kit.tsx";
import { Browser, type Focus, Mark, moveFocus } from "./parts.tsx";

/** The chapter label in the top left: a dot of the scene's colour and a few words. */
export function Kicker({ children, color = ink.canary, at = 6, style }: { children: ReactNode; color?: string; at?: number; style?: CSSProperties }) {
  const f = useCurrentFrame();
  const p = ramp(f, at, 14);
  return (
    <div style={{ position: "absolute", left: 120, top: 58, display: "flex", alignItems: "center", gap: 14, opacity: p, transform: `translateX(${(1 - p) * -16}px)`, ...style }}>
      <span style={{ width: 12, height: 12, borderRadius: "50%", background: color, boxShadow: `0 0 18px ${color}` }} />
      <Label size={19} color={ink.text}>
        {children}
      </Label>
    </div>
  );
}

export interface Step {
  at: number;
  /** Kane's step number in the run. */
  n: number;
  /** Kane's own remark for the step. */
  text: string;
  ok?: boolean;
}

/** Kane's step remarks, one at a time, each rolling up over the one before. */
export function Ticker({ steps, x, y, width, size = 24 }: { steps: Step[]; x: number; y: number; width: number; size?: number }) {
  const f = useCurrentFrame();
  const i = steps.filter((s) => f >= s.at).length - 1;
  if (i < 0) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y, width, height: size * 2.2, overflow: "hidden" }}>
      {steps.map((s, k) => {
        if (k < i - 1 || k > i) return null;
        const p = interpolate(f, [steps[k + 1]?.at ?? 1e9, (steps[k + 1]?.at ?? 1e9) + 8], [0, 1], { ...clamp, easing: easeInOut });
        const enter = ramp(f, s.at, 8);
        return (
          <div key={k} style={{ position: "absolute", left: 0, right: 0, top: (1 - enter) * size * 1.4 - p * size * 1.6, opacity: enter * (1 - p), display: "flex", alignItems: "center", gap: 16 }}>
            <Mark at={s.at + 4} ok={s.ok !== false} size={size * 1.35} />
            <span style={{ fontFamily: fonts.mono, fontSize: size * 0.8, color: ink.faint, width: size * 2.2, flexShrink: 0 }}>#{s.n}</span>
            <span style={{ fontFamily: fonts.mono, fontSize: size, color: s.ok === false ? "#ffb4b0" : ink.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.text}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A plain-English job Stranger hands Kane: who signs in, and what they do. */
export function Job({ n, who, color, lines, at, lit = 1, current = -1, style }: { n: number; who: string; color: string; lines: ReactNode[]; at: number; lit?: number; current?: number; style?: CSSProperties }) {
  const f = useCurrentFrame();
  const p = ramp(f, at, 16);
  return (
    <div
      style={{
        position: "absolute",
        width: 560,
        padding: "28px 32px 30px",
        borderRadius: 24,
        background: "linear-gradient(180deg, rgba(30,37,64,0.82) 0%, rgba(18,24,41,0.86) 100%)",
        border: `1px solid ${color}55`,
        boxShadow: `0 30px 70px rgba(0,0,0,0.45), 0 0 80px ${color}${lit > 0.5 ? "22" : "00"}`,
        opacity: p * (0.35 + 0.65 * lit),
        transform: `translateY(${(1 - p) * 30}px)`,
        filter: p < 1 ? `blur(${(1 - p) * 6}px)` : undefined,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <span style={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 18, color: ink.night, background: color, borderRadius: 8, padding: "4px 10px" }}>JOB {n}</span>
        <span style={{ fontFamily: fonts.text, fontWeight: 600, fontSize: 24, color: ink.text }}>{who}</span>
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ fontFamily: fonts.text, fontWeight: 500, fontSize: 27, lineHeight: 1.4, color: i === current ? ink.text : ink.soft, opacity: current >= 0 && i !== current ? 0.6 : 1, marginTop: i ? 10 : 0, display: "flex", gap: 14 }}>
          <span style={{ color, fontFamily: fonts.mono, fontWeight: 700 }}>{i + 1}</span>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

/** Inline mono token inside running text. */
export function Tok({ children, color = ink.canary }: { children: ReactNode; color?: string }) {
  return <span style={{ fontFamily: fonts.mono, fontSize: "0.86em", color, background: `${color}1f`, borderRadius: 6, padding: "1px 8px" }}>{children}</span>;
}

export type Node = "agent" | "hook" | "kane" | "brief";
const NODES: { id: Node; label: string; sub: string; angle: number; color: string }[] = [
  { id: "agent", label: "Coding agent", sub: "Claude Code", angle: -90, color: ink.text },
  { id: "hook", label: "Stop hook", sub: "can't finish yet", angle: 0, color: ink.coral },
  { id: "kane", label: "Stranger", sub: "+ Kane CLI × 2", angle: 90, color: ink.canary },
  { id: "brief", label: "Fix brief", sub: ".stranger/FIX.md", angle: 180, color: ink.amber },
];

/**
 * The closed loop as a ring: agent, Stop hook, Stranger with Kane, the fix brief, and back. A
 * canary dot runs round it; the node in play is lit.
 */
export function LoopRing({ cx, cy, r, active, at = 0, done = false, scale = 1, style }: { cx: number; cy: number; r: number; active?: Node; at?: number; done?: boolean; scale?: number; style?: CSSProperties }) {
  const f = useCurrentFrame();
  const draw = ramp(f, at, 40, easeInOut);
  const spin = ((f - at) * 2.2) % 360;
  const ringColor = done ? ink.clean : ink.amber;
  return (
    <div style={{ position: "absolute", left: cx - r - 200, top: cy - r - 140, width: 2 * r + 400, height: 2 * r + 280, transform: `scale(${scale})`, ...style }}>
      <svg width={2 * r + 400} height={2 * r + 280} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <marker id="ring-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0L10 5L0 10z" fill={ringColor} />
          </marker>
        </defs>
        <circle cx={r + 200} cy={r + 140} r={r} fill="none" stroke={`${ringColor}55`} strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
        {[-45, 45, 135, 225].map((a) => {
          const rad = (a * Math.PI) / 180;
          return <circle key={a} cx={r + 200 + r * Math.cos(rad)} cy={r + 140 + r * Math.sin(rad)} r={6} fill={ringColor} opacity={draw} />;
        })}
        {draw > 0.95 && (
          <circle cx={r + 200 + r * Math.cos(((spin - 90) * Math.PI) / 180)} cy={r + 140 + r * Math.sin(((spin - 90) * Math.PI) / 180)} r={13} fill={done ? ink.clean : ink.canary} style={{ filter: `drop-shadow(0 0 14px ${done ? ink.clean : ink.canary})` }} />
        )}
      </svg>
      {NODES.map((n, i) => {
        const rad = (n.angle * Math.PI) / 180;
        const x = r + 200 + r * Math.cos(rad);
        const y = r + 140 + r * Math.sin(rad);
        const on = active === n.id;
        const p = ramp(f, at + 8 + i * 6, 14);
        const color = done && n.id !== "brief" ? ink.clean : n.color;
        return (
          <div
            key={n.id}
            style={{
              position: "absolute",
              left: x,
              top: y,
              transform: `translate(-50%, -50%) scale(${(0.8 + 0.2 * p) * (on ? 1.12 : 1)})`,
              opacity: p * (active && !on ? 0.55 : 1),
              padding: "14px 22px",
              borderRadius: 18,
              background: on ? `${color}26` : "rgba(18,24,41,0.92)",
              border: `2px solid ${on ? color : "rgba(255,255,255,0.12)"}`,
              boxShadow: on ? `0 0 50px ${color}66` : "0 16px 40px rgba(0,0,0,0.4)",
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 30, color: on ? color : ink.text, letterSpacing: "-0.01em" }}>{n.label}</div>
            <div style={{ fontFamily: fonts.mono, fontSize: 16, color: ink.soft, marginTop: 4 }}>{n.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

export interface Screen {
  at: number;
  src: string;
  focus: Focus;
}

/**
 * Kane's screenshots in one browser window, each cross-fading over the last as the run moves on,
 * the framing easing between them. `children` are drawn in screenshot pixels over the newest one.
 */
export function Screens({ screens, x, y, width, url, children, refocus = [], style }: { screens: Screen[]; x: number; y: number; width: number; url: string; children?: ReactNode; refocus?: { at: number; focus: Focus }[]; style?: CSSProperties }) {
  const f = useCurrentFrame();
  const i = Math.max(0, screens.filter((s) => f >= s.at).length - 1);
  const cur = screens[i];
  const prev = screens[Math.max(0, i - 1)];
  // Framing: every screen and every extra refocus is a key, eased from the key before.
  const keys = [...screens.map((s) => ({ at: s.at, focus: s.focus })), ...refocus].sort((a, b) => a.at - b.at);
  const k = Math.max(0, keys.filter((key) => f >= key.at).length - 1);
  const focus = k === 0 ? keys[0].focus : moveFocus(f, keys[k - 1].focus, keys[k].focus, keys[k].at, 22);
  const fade = ramp(f, cur.at, 7);
  return (
    <Browser src={i > 0 ? prev.src : cur.src} url={url} width={width} x={x} y={y} focus={focus} style={style}>
      {i > 0 && <Img src={staticFile(cur.src)} style={{ position: "absolute", inset: 0, width: 1920, height: 1080, objectFit: "cover", objectPosition: "top", opacity: fade }} />}
      {children}
    </Browser>
  );
}

/** Eases a value along keyframes [frame, value], holding the ends. */
export function track(f: number, keys: [number, number][], easing = easeOut) {
  return interpolate(
    f,
    keys.map((k) => k[0]),
    keys.map((k) => k[1]),
    { ...clamp, easing },
  );
}
