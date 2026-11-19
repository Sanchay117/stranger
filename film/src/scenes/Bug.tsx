import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { cue } from "../plan.ts";
import { fonts, ink } from "../theme.ts";
import { Camera, clamp, easeInOut, Label, ramp, Rolling, Slam } from "../ui/kit.tsx";
import { Code } from "../ui/code.tsx";
import { Glow, Panel, TitleBar } from "../ui/parts.tsx";
import { Kicker } from "../ui/scene.tsx";
import { Sfx } from "../ui/Sfx.tsx";

// The policy is Duebook's real one (supabase/migrations/0001_invoices.sql), the way AI app builders
// often ship it. The figure is from Matt Palmer's scan behind CVE-2025-48757 (May 2025): 170 of
// 1,645 Lovable apps let anyone read rows that belonged to other users.

const COLS = 47;
const ROWS = 35; // 47 × 35 = 1,645 apps
const PITCH = 15;
const LEAKY = new Set(
  Array.from({ length: COLS * ROWS }, (_, i) => i)
    .sort((a, b) => random(`app ${a}`) - random(`app ${b}`))
    .slice(0, 170),
);
const ORDER = new Map([...LEAKY].map((i, k) => [i, k]));

function AppsGrid({ at, scan, lit }: { at: number; scan: number; lit: number }) {
  const f = useCurrentFrame();
  const sweep = interpolate(f, [scan, scan + 50], [0, 1], { ...clamp, easing: easeInOut });
  return (
    <svg width={COLS * PITCH} height={ROWS * PITCH} style={{ position: "absolute", left: 150, top: 200, overflow: "visible" }}>
      {Array.from({ length: COLS * ROWS }, (_, i) => {
        const c = i % COLS;
        const r = Math.floor(i / COLS);
        const show = ramp(f, at + (c + r) * 0.35, 10);
        const k = ORDER.get(i);
        const red = k !== undefined ? ramp(f, lit + (k / 170) * 26, 6) : 0;
        const scanned = sweep * COLS > c;
        return (
          <rect
            key={i}
            x={c * PITCH + 2}
            y={r * PITCH + 2}
            width={PITCH - 4}
            height={PITCH - 4}
            rx={3}
            fill={red > 0 ? ink.leak : scanned ? "#5a6384" : "#3a4260"}
            opacity={show * (red > 0 ? 0.55 + 0.45 * red : 0.9)}
            style={red > 0.5 ? { filter: `drop-shadow(0 0 5px ${ink.leak})` } : undefined}
          />
        );
      })}
      {sweep > 0 && sweep < 1 && <rect x={sweep * COLS * PITCH - 2} y={-10} width={4} height={ROWS * PITCH + 20} fill={ink.teal} opacity={0.9} style={{ filter: `drop-shadow(0 0 12px ${ink.teal})` }} />}
    </svg>
  );
}

const PEOPLE = [
  { i: "M", c: ink.canary },
  { i: "S", c: ink.teal },
  { i: "A", c: ink.rose },
  { i: "?", c: ink.faint },
];

/** Every account wired to every row: the policy drawn as a picture. */
function Fan({ at, x, y }: { at: number; x: number; y: number }) {
  const f = useCurrentFrame();
  const W = 520;
  const gap = 66;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: W, height: 4 * gap + 60, opacity: ramp(f, at - 8, 10) }}>
      <svg width={W} height={4 * gap} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {PEOPLE.flatMap((_, a) =>
          [0, 1, 2, 3].map((r) => {
            const p = ramp(f, at + (a * 4 + r) * 2.2, 10);
            return <line key={`${a}${r}`} x1={52} y1={a * gap + 26} x2={52 + (W - 290) * p} y2={a * gap + 26 + (r - a) * gap * p} stroke={ink.leak} strokeWidth={2.5} opacity={0.75} />;
          }),
        )}
      </svg>
      {PEOPLE.map((p, a) => (
        <div key={a} style={{ position: "absolute", left: 26, top: a * gap, width: 52, height: 52, borderRadius: "50%", background: p.c, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fonts.display, fontWeight: 600, fontSize: 26, color: ink.night }}>
          {p.i}
        </div>
      ))}
      {[0, 1, 2, 3].map((r) => (
        <div key={r} style={{ position: "absolute", left: W - 236, top: r * gap + 8, width: 236, height: 36, borderRadius: 9, background: "rgba(236,238,245,0.1)", border: "1px solid rgba(236,238,245,0.16)" }}>
          <div style={{ margin: "13px 16px", height: 10, width: 120 + ((r * 37) % 70), borderRadius: 5, background: "rgba(236,238,245,0.35)" }} />
        </div>
      ))}
      <Label size={16} style={{ position: "absolute", left: 0, top: 4 * gap + 6 }}>every account</Label>
      <Label size={16} style={{ position: "absolute", left: W - 236, top: 4 * gap + 6 }}>reads every row</Label>
    </div>
  );
}

export function Bug({ shot }: SceneProps) {
  const f = useCurrentFrame();
  const row = cue(shot, "row");
  const on = cue(shot, "on");
  const prot = cue(shot, "protected");
  const but = cue(shot, "but");
  const using = cue(shot, "using");
  const every = cue(shot, "every");
  const inn = cue(shot, "in");
  const scan = cue(shot, "scan");
  const n170 = cue(shot, "170");
  const of = cue(shot, "1645");
  const lovable = cue(shot, "lovable");
  const out = interpolate(f, [inn - 6, inn + 10], [0, 1], { ...clamp, easing: easeInOut });
  const flipped = f >= using + 6;
  return (
    <AbsoluteFill>
      <Kicker color={ink.coral}>The bug</Kicker>
      {/* The policy */}
      {out < 1 && (
        <AbsoluteFill style={{ opacity: 1 - out, transform: `translateY(${70 - out * 40}px)`, filter: out > 0 ? `blur(${out * 8}px)` : undefined }}>
          <Camera hits={[using + 2]} power={6} push={0.00015}>
            <Panel style={{ left: 120, top: 170, width: 1000, height: 400, opacity: ramp(f, row - 12, 14) }}>
              <TitleBar title="supabase/migrations/0001_invoices.sql" />
              <div style={{ padding: "34px 40px" }}>
                <Code
                  size={28}
                  lines={[
                    { text: "alter table public.invoices enable row level security;", at: row - 6, mark: on, markColor: ink.clean },
                    { text: "", at: row },
                    { text: 'create policy "Enable read access for all users"', at: but },
                    { text: "  on public.invoices for select", at: but + 6 },
                    { text: "  using (true);", at: but + 12, mark: using, markColor: ink.coral },
                  ]}
                />
              </div>
            </Panel>
            {/* What the dashboard tells you, and the truth */}
            <div style={{ position: "absolute", left: 1220, top: 170, width: 580, opacity: ramp(f, prot - 6, 12), transform: `translateY(${(1 - ramp(f, prot - 6, 14)) * 20}px)` }}>
              <div style={{ padding: "26px 30px", borderRadius: 22, background: "rgba(18,24,41,0.88)", border: `2px solid ${flipped ? ink.leak : ink.clean}88`, boxShadow: `0 0 60px ${flipped ? ink.leak : ink.clean}33` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: fonts.text, fontWeight: 600, fontSize: 30, color: ink.text }}>Row level security</span>
                  <span style={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 22, color: ink.night, background: ink.clean, borderRadius: 999, padding: "5px 16px" }}>ON</span>
                </div>
                <div style={{ marginTop: 14, fontFamily: fonts.text, fontSize: 26, color: flipped ? ink.leak : ink.soft, fontWeight: flipped ? 600 : 500 }}>
                  {flipped ? (
                    <Slam at={using + 6} from={1.3}>
                      <span>but the read policy lets everyone in</span>
                    </Slam>
                  ) : (
                    "so the table looks protected"
                  )}
                </div>
              </div>
            </div>
            {f >= every - 10 && <Fan at={every} x={1250} y={420} />}
          </Camera>
        </AbsoluteFill>
      )}
      {/* The scan */}
      {f >= inn - 4 && (
        <AbsoluteFill style={{ opacity: out, transform: "translateY(50px)" }}>
          <AppsGrid at={inn} scan={scan} lit={n170} />
          <Label size={17} style={{ position: "absolute", left: 150, top: 150, opacity: ramp(f, inn + 4, 12) }}>
            1,645 Lovable apps, one square each
          </Label>
          {f >= n170 - 6 && <Glow x={1300} y={420} size={900} color={ink.leak} opacity={0.18 * ramp(f, n170, 20)} drift={10} />}
          <div style={{ position: "absolute", left: 960, top: 180 }}>
            <Label size={19} color={ink.soft} style={{ opacity: ramp(f, inn + 8, 12) }}>
              One scan · 2025
            </Label>
            <div style={{ marginTop: 10, fontFamily: fonts.display, fontWeight: 700, fontSize: 250, lineHeight: 1, letterSpacing: "-0.04em", color: ink.leak, textShadow: `0 0 60px ${ink.leak}66`, opacity: ramp(f, n170 - 4, 6) }}>
              <Rolling at={n170 - 4} value="170" dur={20} />
            </div>
            <div style={{ fontFamily: fonts.display, fontWeight: 400, fontSize: 78, letterSpacing: "-0.02em", color: ink.text, opacity: ramp(f, of - 4, 10), transform: `translateY(${(1 - ramp(f, of - 4, 12)) * 16}px)` }}>
              of 1,645 apps
            </div>
            <div style={{ marginTop: 18, fontFamily: fonts.text, fontWeight: 500, fontSize: 34, color: ink.soft, opacity: ramp(f, lovable - 8, 10), maxWidth: 820 }}>
              built with Lovable let strangers
              <br />
              read other users' rows.
            </div>
            <Label size={16} color={ink.faint} style={{ marginTop: 22, opacity: ramp(f, lovable + 4, 12) }}>
              CVE-2025-48757 · Matt Palmer · May 2025
            </Label>
          </div>
        </AbsoluteFill>
      )}
      <Sfx name="press" at={on} volume={0.25} />
      <Sfx name="thud" at={using + 2} volume={0.45} />
      <Sfx name="whoosh" at={inn - 6} volume={0.25} />
      <Sfx name="ratchet" at={n170 - 4} volume={0.35} />
      <Sfx name="stamp" at={of} volume={0.3} />
    </AbsoluteFill>
  );
}
