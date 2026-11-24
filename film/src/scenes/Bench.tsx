import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { cue } from "../plan.ts";
import { fonts, ink } from "../theme.ts";
import { clamp, GradientText, Label, ramp, Slam } from "../ui/kit.tsx";
import { Pill, Verdict } from "../ui/parts.tsx";
import { Kicker } from "../ui/scene.tsx";
import { Sfx } from "../ui/Sfx.tsx";

// The bench: ten small notes apps, one bug class each plus a clean control, each run through
// Stranger with real Kane CLI on 19 Nov (demo/bench/results.json, 589 credits). Verdicts and the
// check that found each one are copied from that file; titles are shortened from demo/bench/cases.js.

const HOW: Record<string, string> = {
  page: "the page check",
  network: "API replay",
  anonymous: "no-login replay",
  "direct-link": "direct link",
  forged: "forged owner",
  aggregate: "numeric canary",
  storage: "files",
  realtime: "live updates",
};

const CASES: { id: string; title: string; verdict: "LEAK" | "TAMPER" | "CLEAN"; seen: string | null; word?: string }[] = [
  { id: "rls_off", title: "Row level security off", verdict: "LEAK", seen: "page" },
  { id: "client_filter", title: "Filtered in the page only", verdict: "LEAK", seen: "network" },
  { id: "leaky_view", title: "View without security_invoker", verdict: "LEAK", seen: "network", word: "views" },
  { id: "leaky_rpc", title: "Function returns everyone's rows", verdict: "LEAK", seen: "anonymous", word: "database" },
  { id: "detail_page", title: "Record page skips the owner check", verdict: "LEAK", seen: "direct-link", word: "database" },
  { id: "forged_insert", title: "Insert with no \"with check\"", verdict: "TAMPER", seen: "forged" },
  { id: "leaky_total", title: "Total adds up every account", verdict: "LEAK", seen: "aggregate" },
  { id: "storage_leak", title: "Files readable by any account", verdict: "LEAK", seen: "storage", word: "files" },
  { id: "broadcast_leak", title: "Live updates on a public channel", verdict: "LEAK", seen: "realtime", word: "live" },
  { id: "all_good", title: "Nothing wrong: the control", verdict: "CLEAN", seen: null },
];

const COLOR = { LEAK: ink.leak, TAMPER: ink.amber, CLEAN: ink.clean };

const GRID = { left: 120, top: 262, width: 1680, gap: 24, h: 280 };
const CARD_W = (GRID.width - 4 * GRID.gap) / 5;

export function Bench({ shot }: SceneProps) {
  const f = useCurrentFrame();
  const ten = cue(shot, "ten");
  const nine = cue(shot, "nine");
  const one = cue(shot, "one");
  const named = ["views", "database", "files", "live"].map((w) => cue(shot, w));
  const listEnd = cue(shot, "in");
  const real = cue(shot, "real");
  const caught = cue(shot, "caught");
  const allNine = cue(shot, "nine", 1);
  const called = cue(shot, "called");
  const clean = cue(shot, "clean", 1);
  // Which narrated bug class is in play: from its word until the next one, and none after the list.
  let lit = "";
  named.forEach((at, i) => {
    if (f >= at - 3 && f < listEnd - 6) lit = ["views", "database", "files", "live"][i];
  });
  const stampAt = (i: number) => caught - 2 + i * 3;
  const swap = interpolate(f, [allNine - 8, allNine], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Kicker>The bench</Kicker>
      {/* Headline: what the bench is, then the score */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 124, textAlign: "center", fontFamily: fonts.display, fontWeight: 400, fontSize: 64, letterSpacing: "-0.02em", color: ink.text, opacity: 1 - swap }}>
        <span style={{ opacity: ramp(f, ten - 2, 10) }}>Ten apps. </span>
        <span style={{ opacity: ramp(f, nine - 2, 10), color: ink.leak }}>Nine leaks. </span>
        <span style={{ opacity: ramp(f, one - 2, 10), color: ink.clean }}>One clean.</span>
      </div>
      {swap > 0 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 110, display: "flex", justifyContent: "center", opacity: swap }}>
          <Slam at={allNine - 2} from={1.5}>
            <span style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 76, letterSpacing: "-0.03em", color: ink.text }}>
              Stranger caught <GradientText>9 of 9</GradientText>
            </span>
          </Slam>
        </div>
      )}
      {/* The ten cases */}
      {CASES.map((c, i) => {
        const col = i % 5;
        const row = Math.floor(i / 5);
        const appear = ramp(f, ten + i * 3, 14);
        const isLit = !!c.word && c.word === lit;
        const leakIndex = CASES.filter((x) => x.verdict !== "CLEAN").indexOf(c);
        const stamped = c.verdict === "CLEAN" ? clean - 2 : stampAt(leakIndex);
        const done = f >= stamped + 4;
        const color = COLOR[c.verdict];
        const how = c.seen ? HOW[c.seen] : "every check ran";
        return (
          <div
            key={c.id}
            style={{
              position: "absolute",
              left: GRID.left + col * (CARD_W + GRID.gap),
              top: GRID.top + row * (GRID.h + GRID.gap),
              width: CARD_W,
              height: GRID.h,
              padding: "24px 24px 20px",
              boxSizing: "border-box",
              borderRadius: 22,
              background: done ? `linear-gradient(180deg, ${color}26 0%, rgba(18,24,41,0.92) 75%)` : "linear-gradient(180deg, rgba(30,37,64,0.8) 0%, rgba(18,24,41,0.86) 100%)",
              border: `2px solid ${done ? color : isLit ? ink.canary : "rgba(255,255,255,0.09)"}`,
              boxShadow: done ? `0 0 50px ${color}40, 0 30px 70px rgba(0,0,0,0.4)` : isLit ? `0 0 50px ${ink.canary}55, 0 30px 70px rgba(0,0,0,0.4)` : "0 30px 70px rgba(0,0,0,0.4)",
              opacity: appear,
              transform: `translateY(${(1 - appear) * 30 - (isLit ? 12 : 0)}px) scale(${isLit ? 1.04 : 1})`,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Label size={16} color={c.verdict === "CLEAN" ? ink.clean : ink.faint} style={{ fontFamily: fonts.mono, textTransform: "none", letterSpacing: 0 }}>
              {c.id}
            </Label>
            <div style={{ marginTop: 14, fontFamily: fonts.text, fontWeight: 600, fontSize: 30, lineHeight: 1.25, color: ink.text }}>{c.title}</div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, minHeight: 56 }}>
              <span style={{ fontFamily: fonts.mono, fontSize: 17, lineHeight: 1.3, color: ink.soft, opacity: ramp(f, stamped + 4, 10) }}>
                via {how}
              </span>
              <Verdict at={stamped} word={c.verdict} color={color} size={30} angle={-6} />
            </div>
          </div>
        );
      })}
      {/* Where it ran, and where to see it */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 878, display: "flex", justifyContent: "center", alignItems: "center", gap: 26 }}>
        <span style={{ opacity: ramp(f, real - 2, 12) }}>
          <Label size={20} color={ink.text}>
            Real Kane CLI runs · 19 Nov · 589 credits
          </Label>
        </span>
        <span style={{ opacity: ramp(f, called, 12), transform: `translateY(${(1 - ramp(f, called, 14)) * 10}px)` }}>
          <Pill text="stranger-2yf3.vercel.app/bench/" color={ink.canary} size={22} />
        </span>
      </div>
      {named.map((at, i) => (
        <Sfx key={i} name="tick" at={at - 3} volume={0.3} />
      ))}
      {CASES.filter((c) => c.verdict !== "CLEAN").map((_, i) => (
        <Sfx key={`s${i}`} name="tick" at={stampAt(i)} volume={0.22} />
      ))}
      <Sfx name="stamp" at={stampAt(0)} volume={0.4} />
      <Sfx name="thud" at={allNine - 2} volume={0.4} />
      <Sfx name="chime" at={clean - 2} volume={0.32} />
    </AbsoluteFill>
  );
}
