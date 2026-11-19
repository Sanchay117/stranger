import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { cue } from "../plan.ts";
import { fonts, ink } from "../theme.ts";
import { Camera, clamp, easeInOut, Label, ramp } from "../ui/kit.tsx";
import { sqlTokens } from "../ui/code.tsx";
import { Glow, Panel, TitleBar, Verdict } from "../ui/parts.tsx";
import { Kicker } from "../ui/scene.tsx";
import { Sfx } from "../ui/Sfx.tsx";

// The brief is the real .stranger/FIX.md from run 6541c9, trimmed to what fits on screen. It names
// the open policy and the migration it came from because Stranger reads the app's migrations.

/** A highlighter pass over a span of text, swept on at `at`. */
function Hi({ at, color, children }: { at: number; color: string; children: ReactNode }) {
  const f = useCurrentFrame();
  const p = ramp(f, at, 10);
  return (
    <span style={{ position: "relative", whiteSpace: "pre-wrap" }}>
      <span style={{ position: "absolute", left: -4, right: -4, top: 2, bottom: 0, borderRadius: 6, background: color, opacity: 0.28, transformOrigin: "left center", transform: `scaleX(${p})` }} />
      <span style={{ position: "relative", boxShadow: p > 0.9 ? `inset 0 -3px 0 ${color}` : undefined }}>{children}</span>
    </span>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <span style={{ fontFamily: fonts.mono, fontSize: "0.88em", color: ink.canary, background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "0 6px" }}>{children}</span>;
}

const SQL = [
  'drop policy if exists "Enable read access for all users" on public.invoices;',
  'create policy "Owners can read their own rows" on public.invoices',
  "  for select to authenticated",
  "  using ((select auth.uid()) = user_id);",
];

const POINTS = [
  { word: "open", text: "the open policy", color: ink.coral },
  { word: "migration", text: "the migration it came from", color: ink.amber },
  { word: "fix", nth: 1, text: "the fix, as SQL", color: ink.clean },
];

export function Brief({ shot }: SceneProps) {
  const f = useCurrentFrame();
  const leak = cue(shot, "leak");
  const stranger = cue(shot, "stranger");
  const fix = cue(shot, "fix");
  const open = cue(shot, "open");
  const migration = cue(shot, "migration");
  const theFix = cue(shot, "fix", 1);
  const move = interpolate(f, [stranger - 6, stranger + 16], [0, 1], { ...clamp, easing: easeInOut });
  const doc = ramp(f, fix - 8, 18);
  const lineAt = (i: number) => fix + 4 + i * 4;
  return (
    <AbsoluteFill>
      <Camera hits={[leak]} power={12} push={0.00015}>
        <Kicker color={ink.leak}>The verdict</Kicker>
        <Glow x={960 - move * 600} y={480 - move * 160} size={1100 - move * 500} color={ink.leak} opacity={0.26 * ramp(f, leak, 20)} drift={0} />
        {/* The stamp: centre stage, then off to the side to make room for the brief */}
        <div style={{ position: "absolute", left: 960 - move * 660, top: 440 - move * 200, transform: `translate(-50%, -50%) scale(${1 - move * 0.55})` }}>
          <Verdict at={leak - 2} word="LEAK" color={ink.leak} size={230} />
        </div>
        <div style={{ position: "absolute", left: 120, top: 380, width: 420, opacity: move }}>
          <Label size={17}>for your coding agent</Label>
          <div style={{ fontFamily: fonts.mono, fontSize: 30, color: ink.text, marginTop: 10 }}>.stranger/FIX.md</div>
          <div style={{ marginTop: 34 }}>
            {POINTS.map((p) => {
              const at = cue(shot, p.word, p.nth ?? 0);
              const on = ramp(f, at - 4, 10);
              return (
                <div key={p.text} style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18, opacity: 0.25 + 0.75 * on, transform: `translateX(${(1 - on) * -10}px)` }}>
                  <span style={{ width: 16, height: 16, borderRadius: 5, background: p.color, boxShadow: on > 0.5 ? `0 0 16px ${p.color}` : undefined }} />
                  <span style={{ fontFamily: fonts.text, fontWeight: 600, fontSize: 30, color: ink.text }}>{p.text}</span>
                </div>
              );
            })}
          </div>
        </div>
        {/* The brief itself */}
        {doc > 0 && (
          <Panel style={{ left: 600, top: 100, width: 1200, height: 790, opacity: doc, transform: `translateX(${(1 - doc) * 120}px)` }}>
            <TitleBar title=".stranger/FIX.md" />
            <div style={{ padding: "30px 40px", fontFamily: fonts.text, fontSize: 27, lineHeight: 1.5, color: ink.soft }}>
              <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 42, color: ink.text, letterSpacing: "-0.02em", opacity: ramp(f, lineAt(0), 8) }}># Stranger found a data leak</div>
              <div style={{ marginTop: 8, opacity: ramp(f, lineAt(1), 8) }}>
                Owner: <b style={{ color: ink.text }}>maya@duebook.demo</b>. Stranger: <b style={{ color: ink.text }}>stranger@duebook.demo</b>.
              </div>
              <div style={{ marginTop: 14, opacity: ramp(f, lineAt(2), 8) }}>
                · Canary the owner planted: <Code>stranger-canary-6541c9</Code>
              </div>
              <div style={{ marginTop: 6, opacity: ramp(f, lineAt(3), 8) }}>
                · <b style={{ color: ink.leak }}>No login needed:</b> the API returned it with no login, so anyone on the internet can read these rows.
              </div>
              <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 32, color: ink.text, marginTop: 22, opacity: ramp(f, lineAt(4), 8) }}>## What to fix</div>
              <div style={{ marginTop: 8, opacity: ramp(f, lineAt(5), 8) }}>
                · <Hi at={open} color={ink.coral}>
                  <Code>"Enable read access for all users"</Code>
                </Hi>{" "}
                <Hi at={migration} color={ink.amber}>(0001_invoices.sql, for select to public)</Hi>:{" "}
                <Hi at={open + 8} color={ink.coral}>
                  <Code>using (true)</Code>
                </Hi>{" "}
                <b style={{ color: ink.text }}>This lets every account read every row.</b>
              </div>
              <div style={{ marginTop: 14, opacity: ramp(f, lineAt(6), 8) }}>Replace the open policy with one that only returns the signed-in user's rows:</div>
              <div style={{ position: "relative", marginTop: 12, padding: "16px 22px", borderRadius: 14, background: "rgba(0,0,0,0.28)", border: `1px solid ${f >= theFix ? ink.clean : "rgba(255,255,255,0.08)"}`, boxShadow: f >= theFix ? `0 0 50px ${ink.clean}33` : undefined, opacity: ramp(f, lineAt(7), 8), fontFamily: fonts.mono, fontSize: 22, lineHeight: 1.6, whiteSpace: "pre" }}>
                {SQL.map((l) => (
                  <div key={l}>{sqlTokens(l)}</div>
                ))}
              </div>
            </div>
          </Panel>
        )}
      </Camera>
      <Sfx name="stamp" at={leak - 2} volume={0.6} />
      <Sfx name="paper" at={fix - 8} volume={0.4} />
      <Sfx name="tick" at={open} volume={0.3} />
      <Sfx name="tick" at={migration} volume={0.3} />
      <Sfx name="chime" at={theFix} volume={0.3} />
    </AbsoluteFill>
  );
}
