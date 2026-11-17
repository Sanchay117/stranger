import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { cue } from "../plan.ts";
import { fonts, ink } from "../theme.ts";
import { Camera, clamp, Flash, Label, ramp, Slam, Typed } from "../ui/kit.tsx";
import { Glow, Mark, Panel } from "../ui/parts.tsx";
import { Kicker } from "../ui/scene.tsx";
import { Sfx } from "../ui/Sfx.tsx";

// Run 6541c9 (17 Nov): after Kane's runs, Stranger replayed the stranger's page's data reads from
// Kane's network log, once with the stranger's login and once with no login (only the public key).
// Both answers carried Maya's canary. Duebook reads with select=* ordered by created_at.

const CANARY = "stranger-canary-6541c9";

const JSON_LINES: { text: string; canary?: boolean }[] = [
  { text: "[" },
  { text: "  {" },
  { text: '    "client_name": "Stranger check",' },
  { text: '    "amount_cents": 100,' },
  { text: `    "note": "${CANARY}"`, canary: true },
  { text: "  }," },
  { text: "  {" },
  { text: '    "client_name": "Northwind Studio",' },
  { text: '    "amount_cents": 240000,' },
];

function jsonTokens(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /("[^"]*"(?=:))|("[^"]*")|(\d+)|(\s+|.)/g;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    const color = m[1] ? "#9fb4ff" : m[2] ? ink.text : m[3] ? ink.amber : ink.faint;
    out.push(
      <span key={k++} style={{ color }}>
        {m[0]}
      </span>,
    );
  }
  return out;
}

function Lane({ x, at, hit, who, header, color, initial }: { x: number; at: number; hit: number; who: string; header: string; color: string; initial: string }) {
  const f = useCurrentFrame();
  const p = ramp(f, at, 16);
  const answer = at + 16;
  return (
    <Panel style={{ left: x, top: 268, width: 820, height: 590, opacity: p, transform: `translateY(${(1 - p) * 40}px)`, border: f >= hit ? `2px solid ${ink.leak}` : undefined, boxShadow: f >= hit ? `0 0 70px ${ink.leak}44, 0 40px 90px rgba(0,0,0,.45)` : undefined }}>
      <div style={{ padding: "26px 32px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 46, height: 46, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fonts.display, fontWeight: 600, fontSize: 24, color: ink.night }}>{initial}</div>
          <span style={{ fontFamily: fonts.text, fontWeight: 600, fontSize: 30, color: ink.text }}>{who}</span>
        </div>
        <div style={{ marginTop: 14, fontFamily: fonts.mono, fontSize: 20, color: ink.faint }}>{header}</div>
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 14, opacity: ramp(f, answer, 8) }}>
          <span style={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 22, color: ink.night, background: ink.soft, borderRadius: 8, padding: "3px 12px" }}>200 OK</span>
          <Label size={15}>the answer</Label>
        </div>
      </div>
      <div style={{ position: "relative", margin: "16px 32px 0", fontFamily: fonts.mono, fontSize: 23, lineHeight: 1.6, whiteSpace: "pre", maskImage: "linear-gradient(180deg, black 75%, transparent 100%)", WebkitMaskImage: "linear-gradient(180deg, black 75%, transparent 100%)" }}>
        {JSON_LINES.map((l, i) => {
          const show = ramp(f, answer + i * 2, 6);
          const lit = l.canary && f >= hit;
          return (
            <div key={i} style={{ position: "relative", opacity: show }}>
              {lit && <div style={{ position: "absolute", left: -12, right: -12, top: 0, bottom: 0, borderRadius: 8, background: `${ink.canary}2e`, borderLeft: `4px solid ${ink.canary}`, opacity: ramp(f, hit, 6) }} />}
              <span style={{ position: "relative" }}>{lit ? <span style={{ color: ink.canary }}>{l.text}</span> : jsonTokens(l.text)}</span>
            </div>
          );
        })}
      </div>
      {f >= hit && (
        <div style={{ position: "absolute", right: 32, top: 320, display: "flex", alignItems: "center", gap: 12, opacity: ramp(f, hit + 2, 8) }}>
          <Mark at={hit + 2} ok={false} size={38} />
          <span style={{ fontFamily: fonts.text, fontWeight: 700, fontSize: 24, color: ink.leak }}>Maya's canary</span>
        </div>
      )}
    </Panel>
  );
}

export function Replay({ shot }: SceneProps) {
  const f = useCurrentFrame();
  const replays = cue(shot, "replays");
  const withA = cue(shot, "with");
  const canary = cue(shot, "canary");
  const withB = cue(shot, "with", 1);
  const still = cue(shot, "still");
  const anyone = cue(shot, "anyone");
  const banner = interpolate(f, [anyone - 2, anyone + 6], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Camera hits={[anyone]} power={12} push={0.0002}>
        <Kicker color={ink.amber}>Request replay · run 6541c9 · 17 Nov</Kicker>
        <Panel style={{ left: 120, top: 130, width: 1680, height: 96, opacity: ramp(f, replays - 6, 12) }}>
          <div style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 30px", gap: 22, fontFamily: fonts.mono, fontSize: 28 }}>
            <span style={{ fontWeight: 700, color: ink.night, background: ink.amber, borderRadius: 8, padding: "4px 14px" }}>GET</span>
            <span style={{ color: ink.faint, whiteSpace: "nowrap" }}>…supabase.co</span>
            <Typed at={replays} text="/rest/v1/invoices?select=*&order=created_at.desc" cps={60} caret={false} style={{ color: ink.text, whiteSpace: "pre", marginLeft: -22 }} />
            <span style={{ flex: 1 }} />
            <Label size={15} style={{ opacity: ramp(f, replays + 30, 12) }}>
              the page's own read, from Kane's network log
            </Label>
          </div>
        </Panel>
        <Lane x={120} at={withA} hit={canary} who="With the stranger's login" header="Authorization: Bearer ‹the stranger's token›" color={ink.teal} initial="S" />
        <Lane x={980} at={withB} hit={still} who="With no login at all" header="apikey: ‹the app's public key›  ·  no Authorization" color={ink.faint} initial="∅" />
      </Camera>
      {banner > 0 && (
        <AbsoluteFill style={{ background: `rgba(11,15,29,${0.8 * banner})` }}>
          <Glow x={960} y={560} size={1300} color={ink.leak} opacity={0.3 * banner} drift={0} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 380, textAlign: "center" }}>
            <Slam at={anyone} from={1.8}>
              <span style={{ display: "inline-block", fontFamily: fonts.display, fontWeight: 800, fontSize: 130, letterSpacing: "-0.03em", color: ink.text, background: ink.leak, borderRadius: 28, padding: "10px 52px 22px", boxShadow: `0 0 120px ${ink.leak}aa` }}>No login needed</span>
            </Slam>
            <div style={{ marginTop: 36, fontFamily: fonts.text, fontWeight: 600, fontSize: 40, color: ink.text, opacity: ramp(f, anyone + 12, 12) }}>Anyone on the internet can read these invoices.</div>
          </div>
        </AbsoluteFill>
      )}
      <Flash at={anyone} dur={8} peak={0.35} color={ink.leak} />
      <Sfx name="typing" at={replays} frames={30} volume={0.15} />
      <Sfx name="tick" at={withA} volume={0.3} />
      <Sfx name="thud" at={canary} volume={0.45} />
      <Sfx name="tick" at={withB} volume={0.3} />
      <Sfx name="thud" at={still} volume={0.45} />
      <Sfx name="stamp" at={anyone} volume={0.6} />
    </AbsoluteFill>
  );
}
