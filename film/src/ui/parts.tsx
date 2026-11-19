import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { fonts, ink } from "../theme.ts";
import { clamp, easeInOut, easeOut, ramp } from "./kit.tsx";

/** A soft light of one colour, blurred, drifting a little. */
export function Glow({ x, y, size, color, opacity = 0.5, drift = 30, seed = 0 }: { x: number; y: number; size: number; color: string; opacity?: number; drift?: number; seed?: number }) {
  const f = useCurrentFrame();
  const dx = Math.sin(f / 70 + seed) * drift;
  const dy = Math.cos(f / 83 + seed * 1.7) * drift * 0.7;
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2 + dx,
        top: y - size / 2 + dy,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle at 50% 50%, ${color} 0%, ${color}00 68%)`,
        opacity,
        pointerEvents: "none",
      }}
    />
  );
}

/** The night the whole film sits on: navy, a faint dot grid, and the canary family glowing low. */
export function Backdrop({ warmth = 1, tint }: { warmth?: number; tint?: string }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 90% 80% at 50% 40%, ${ink.deep} 0%, ${ink.night} 72%)` }}>
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(236,238,245,0.07) 1.2px, transparent 1.2px)",
          backgroundSize: "34px 34px",
          backgroundPosition: `${(f * 0.15) % 34}px ${(f * 0.08) % 34}px`,
          maskImage: "radial-gradient(ellipse 70% 65% at 50% 45%, black 20%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 65% at 50% 45%, black 20%, transparent 85%)",
        }}
      />
      <Glow x={380} y={980} size={1100} color={ink.amber} opacity={0.16 * warmth} seed={1} drift={60} />
      <Glow x={1600} y={120} size={1000} color={ink.coral} opacity={0.13 * warmth} seed={2} drift={50} />
      <Glow x={1500} y={1000} size={800} color={ink.rose} opacity={0.08 * warmth} seed={3} drift={40} />
      {tint && <Glow x={960} y={540} size={1700} color={tint} opacity={0.14} drift={0} />}
    </AbsoluteFill>
  );
}

/** Glass: a dark frosted panel with a hairline edge. */
export function Panel({ children, style, glow }: { children?: ReactNode; style?: CSSProperties; glow?: string }) {
  return (
    <div
      style={{
        position: "absolute",
        background: "linear-gradient(180deg, rgba(30,37,64,0.78) 0%, rgba(18,24,41,0.82) 100%)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 26,
        boxShadow: `0 40px 90px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)${glow ? `, 0 0 120px ${glow}33` : ""}`,
        backdropFilter: "blur(18px)",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A window's title bar: three dots and a title or address in the middle. */
export function TitleBar({ title, url = false, height = 50 }: { title: string; url?: boolean; height?: number }) {
  return (
    <div style={{ height, display: "flex", alignItems: "center", padding: "0 20px", gap: 9, borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.025)", flexShrink: 0 }}>
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
        <span key={c} style={{ width: 13, height: 13, borderRadius: "50%", background: c, opacity: 0.85 }} />
      ))}
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            fontFamily: url ? fonts.text : fonts.mono,
            fontSize: url ? 17 : 15,
            color: ink.soft,
            padding: url ? "6px 22px" : 0,
            borderRadius: 999,
            background: url ? "rgba(255,255,255,0.06)" : "transparent",
            letterSpacing: url ? 0 : 0.5,
            maxWidth: "80%",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
      </div>
      <span style={{ width: 57 }} />
    </div>
  );
}

export interface Focus {
  /** Point of the 1920 × 1080 screenshot to centre on. */
  x: number;
  y: number;
  /** 1 shows the whole screenshot. */
  zoom: number;
}

/**
 * A browser window showing one of Kane's 1920 × 1080 screenshots. Children are drawn in the
 * screenshot's own pixels, so boxes land on what Kane saw, and move with the camera.
 */
export function Browser({ src, url, width, x, y, focus = { x: 960, y: 540, zoom: 1 }, children, style, dim = 0 }: { src: string; url: string; width: number; x: number; y: number; focus?: Focus; children?: ReactNode; style?: CSSProperties; dim?: number }) {
  const viewH = (width * 9) / 16;
  const s = (width / 1920) * focus.zoom;
  // Keep the screenshot covering the window whatever the focus.
  const tx = Math.min(0, Math.max(width - 1920 * s, width / 2 - focus.x * s));
  const ty = Math.min(0, Math.max(viewH - 1080 * s, viewH / 2 - focus.y * s));
  return (
    <Panel style={{ left: x, top: y, width, height: viewH + 50, ...style }}>
      <TitleBar title={url} url />
      <div style={{ position: "relative", width, height: viewH, overflow: "hidden", background: ink.paper }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transform: `translate(${tx}px, ${ty}px) scale(${s})`, transformOrigin: "0 0" }}>
          {/* Kane's annotated shots are 1108 tall (a status bar under the page): crop it, never squash. */}
          <Img src={staticFile(src)} style={{ position: "absolute", inset: 0, width: 1920, height: 1080, objectFit: "cover", objectPosition: "top" }} />
          {children}
        </div>
        {dim > 0 && <AbsoluteFill style={{ background: ink.night, opacity: dim }} />}
      </div>
    </Panel>
  );
}

/** Eases a focus from one framing to another between two frames. */
export function moveFocus(frame: number, from: Focus, to: Focus, at: number, dur = 30): Focus {
  const p = interpolate(frame, [at, at + dur], [0, 1], { ...clamp, easing: easeInOut });
  return { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p, zoom: from.zoom + (to.zoom - from.zoom) * p };
}

/** A rectangle drawn on round something in a screenshot, with an optional tag. */
export function Box({ at, x, y, w, h, color, tag, tagSide = "top", dur = 14, width = 5, radius = 14 }: { at: number; x: number; y: number; w: number; h: number; color: string; tag?: ReactNode; tagSide?: "top" | "bottom" | "right"; dur?: number; width?: number; radius?: number }) {
  const f = useCurrentFrame();
  if (f < at) return null;
  const p = ramp(f, at, dur, easeInOut);
  const pulse = 1 + 0.5 * Math.exp(-(f - at - dur) / 6) * (f > at + dur ? 1 : 0);
  return (
    <>
      <svg style={{ position: "absolute", left: x - 10, top: y - 10, width: w + 20, height: h + 20, overflow: "visible" }}>
        <rect x={10} y={10} width={w} height={h} rx={radius} fill={color} fillOpacity={0.1 * p} stroke={color} strokeWidth={width * pulse} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} style={{ filter: `drop-shadow(0 0 14px ${color})` }} />
      </svg>
      {tag && (
        <div
          style={{
            position: "absolute",
            left: tagSide === "right" ? x + w + 20 : x,
            top: tagSide === "top" ? y - 62 : tagSide === "bottom" ? y + h + 14 : y + h / 2 - 24,
            opacity: ramp(f, at + dur * 0.6, 8),
            transform: `translateY(${(1 - ramp(f, at + dur * 0.6, 10)) * 8}px)`,
            background: color,
            color: ink.night,
            fontFamily: fonts.mono,
            fontWeight: 700,
            fontSize: 26,
            padding: "8px 18px",
            borderRadius: 10,
            whiteSpace: "nowrap",
            boxShadow: `0 8px 30px ${color}66`,
          }}
        >
          {tag}
        </div>
      )}
    </>
  );
}

/** A token pill: the canary (yellow), the control (teal), or anything else, in mono. */
export function Pill({ text, color = ink.canary, size = 26, glow = true, style }: { text: string; color?: string; size?: number; glow?: boolean; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.45,
        fontFamily: fonts.mono,
        fontWeight: 500,
        fontSize: size,
        color: ink.night,
        background: color,
        borderRadius: 999,
        padding: `${size * 0.3}px ${size * 0.75}px`,
        boxShadow: glow ? `0 0 ${size * 1.6}px ${color}88, 0 ${size * 0.25}px ${size * 0.8}px rgba(0,0,0,0.35)` : undefined,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span style={{ width: size * 0.42, height: size * 0.42, borderRadius: "50%", background: ink.night, opacity: 0.75 }} />
      {text}
    </span>
  );
}

/** A verdict stamped on: big, a squash, a small shake. */
export function Verdict({ at, word, color, size = 150, angle = -4, style }: { at: number; word: string; color: string; size?: number; angle?: number; style?: CSSProperties }) {
  const f = useCurrentFrame();
  const t = f - at;
  if (t < 0) return null;
  const drop = interpolate(t, [0, 4], [2.1, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const settle = interpolate(t, [4, 7, 11], [1, 0.95, 1], clamp);
  const shake = t >= 4 && t < 12 ? Math.sin(t * 2.6) * (12 - t) * 0.5 : 0;
  return (
    <div
      style={{
        display: "inline-block",
        transform: `translate(${shake}px, 0) rotate(${angle}deg) scale(${t < 4 ? drop : settle})`,
        opacity: interpolate(t, [0, 2], [0, 1], clamp),
        fontFamily: fonts.display,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "0.02em",
        color,
        padding: `${size * 0.12}px ${size * 0.3}px ${size * 0.16}px`,
        border: `${Math.max(5, size * 0.055)}px solid ${color}`,
        borderRadius: size * 0.2,
        textShadow: `0 0 ${size * 0.4}px ${color}88`,
        boxShadow: `0 0 ${size * 0.6}px ${color}55, inset 0 0 ${size * 0.4}px ${color}33`,
        background: "rgba(11,15,29,0.55)",
        ...style,
      }}
    >
      {word}
    </div>
  );
}

/** A person: a round badge with an initial, the email under it. */
export function Person({ who, email, color, size = 120, role }: { who: string; email: string; color: string; size?: number; role?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, ${color} 0%, ${color}cc 55%, ${color}88 100%)`,
          boxShadow: `0 0 50px ${color}55`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fonts.display,
          fontWeight: 600,
          fontSize: size * 0.48,
          color: ink.night,
        }}
      >
        {who}
      </div>
      <div>
        <div style={{ fontFamily: fonts.text, fontWeight: 600, fontSize: size * 0.27, color: ink.text }}>{email}</div>
        {role && <div style={{ fontFamily: fonts.mono, fontSize: size * 0.16, letterSpacing: 2, textTransform: "uppercase", color: ink.soft, marginTop: 6 }}>{role}</div>}
      </div>
    </div>
  );
}

/** Reveals children at `at`: a small rise and blur resolving to sharp. */
export function Reveal({ at, children, dur = 14, dist = 18, style }: { at: number; children: ReactNode; dur?: number; dist?: number; style?: CSSProperties }) {
  const f = useCurrentFrame();
  if (f < at - 1) return null;
  const p = ramp(f, at, dur, easeOut);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * dist}px)`, filter: p < 1 ? `blur(${(1 - p) * 5}px)` : undefined, ...style }}>{children}</div>;
}

/** A check or a cross in a ring, drawn on. */
export function Mark({ at, ok, size = 34 }: { at: number; ok: boolean; size?: number }) {
  const f = useCurrentFrame();
  const p = ramp(f, at, 10, easeOut);
  const color = ok ? ink.clean : ink.leak;
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" style={{ flexShrink: 0, transform: `scale(${0.6 + 0.4 * p})`, opacity: p }}>
      <circle cx="17" cy="17" r="15" fill={`${color}26`} stroke={color} strokeWidth="2" />
      {ok ? (
        <path d="M10 17.5l4.5 4.5L24 12.5" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
      ) : (
        <path d="M11.5 11.5l11 11M22.5 11.5l-11 11" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
      )}
    </svg>
  );
}
