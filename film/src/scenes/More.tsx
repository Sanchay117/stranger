import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { cue } from "../plan.ts";
import { fonts, ink } from "../theme.ts";
import { Label, ramp } from "../ui/kit.tsx";
import { Kicker } from "../ui/scene.tsx";
import { Sfx } from "../ui/Sfx.tsx";

// Stranger's five verdicts and their exit codes, as the CLI defines them (stranger/bin).

const icon = (d: ReactNode) => (
  <svg width={60} height={60} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const VERDICTS: { word: string; color: string; line: string; exit: number; glyph: ReactNode; cueWord?: string }[] = [
  {
    word: "LEAK",
    color: ink.leak,
    line: "A stranger can read the owner's rows.",
    exit: 1,
    glyph: icon(
      <>
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>,
    ),
  },
  {
    word: "TAMPER",
    color: ink.amber,
    line: "A stranger can change or delete them.",
    exit: 1,
    cueWord: "change",
    glyph: icon(
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
      </>,
    ),
  },
  {
    word: "OVERLOCKED",
    color: ink.rose,
    line: "A fix locked out a teammate who should see them.",
    exit: 1,
    cueWord: "lock",
    glyph: icon(
      <>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 018 0v4" />
      </>,
    ),
  },
  {
    word: "INCONCLUSIVE",
    color: ink.soft,
    line: "The run didn't finish. Never counted as clean.",
    exit: 2,
    cueWord: "unfinished",
    glyph: icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>,
    ),
  },
  {
    word: "CLEAN",
    color: ink.clean,
    line: "Each account sees only what it should.",
    exit: 0,
    glyph: icon(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  },
];

export function More({ shot }: SceneProps) {
  const f = useCurrentFrame();
  const focus = VERDICTS.map((v) => (v.cueWord ? cue(shot, v.cueWord) : -1));
  const ends = cue(shot, "clean");
  // Which card is in play: the last cue passed, until the line ends and they all come back.
  let on = -1;
  focus.forEach((at, i) => {
    if (at >= 0 && f >= at - 4) on = i;
  });
  if (f >= ends) on = -1;
  return (
    <AbsoluteFill>
      <Kicker>More than one check</Kicker>
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center", fontFamily: fonts.display, fontWeight: 400, fontSize: 60, letterSpacing: "-0.02em", color: ink.text, opacity: ramp(f, 4, 14) }}>
        Every run ends in one of five verdicts
      </div>
      <div style={{ position: "absolute", left: 120, top: 300, width: 1680, display: "flex", gap: 24 }}>
        {VERDICTS.map((v, i) => {
          const p = ramp(f, 14 + i * 6, 16);
          const lit = on === i;
          const dim = on >= 0 && !lit;
          return (
            <div
              key={v.word}
              style={{
                flex: 1,
                height: 470,
                padding: "34px 30px",
                borderRadius: 26,
                background: lit ? `linear-gradient(180deg, ${v.color}2a 0%, rgba(18,24,41,0.9) 70%)` : "linear-gradient(180deg, rgba(30,37,64,0.8) 0%, rgba(18,24,41,0.86) 100%)",
                border: `2px solid ${lit ? v.color : "rgba(255,255,255,0.09)"}`,
                boxShadow: lit ? `0 0 80px ${v.color}55, 0 40px 90px rgba(0,0,0,0.45)` : "0 30px 70px rgba(0,0,0,0.4)",
                opacity: p * (dim ? 0.42 : 1),
                transform: `translateY(${(1 - p) * 40 - (lit ? 18 : 0)}px) scale(${lit ? 1.05 : 1})`,
                transition: "none",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ color: v.color }}>{v.glyph}</div>
              <div style={{ marginTop: 26, fontFamily: fonts.display, fontWeight: 800, fontSize: v.word.length > 8 ? 38 : 50, letterSpacing: "0.01em", color: v.color }}>{v.word}</div>
              <div style={{ marginTop: 16, fontFamily: fonts.text, fontWeight: 500, fontSize: 28, lineHeight: 1.35, color: ink.text }}>{v.line}</div>
              <div style={{ flex: 1 }} />
              <Label size={16} color={ink.faint}>
                exit code {v.exit}
              </Label>
            </div>
          );
        })}
      </div>
      {focus.map((at, i) => (at >= 0 ? <Sfx key={i} name="tick" at={at - 4} volume={0.35} /> : null))}
    </AbsoluteFill>
  );
}
