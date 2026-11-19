import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BOX_S, CHECKS_S, DROP_S, KANE_S, PLANT_S, SCAN_S, SEEN_S, STRANGER_S } from "../beats.ts";
import type { SceneProps } from "../Film.tsx";
import { FPS, said } from "../plan.ts";
import { fonts, ink } from "../theme.ts";
import { Camera, clamp, easeIn, easeInOut, easeOut, Flash, GradientText, Label, ramp, Slam, Typed } from "../ui/kit.tsx";
import { Box, Browser, Glow, Mark, moveFocus, Panel, Pill, TitleBar } from "../ui/parts.tsx";

// The teaser is cut to its score (scripts/music.ts, on the grid in src/beats.ts): 120 BPM, so a
// beat is 15 frames and a bar 60. Everything drawn is real: Maya's invoices are the live demo's,
// the canary is the closed loop's (f5b2cc), and the screenshot is Kane's own from that run.

const F = (s: number) => Math.round(s * FPS);
const CHECKS = CHECKS_S.map(F);
const STRANGER = F(STRANGER_S);
const PLANT = F(PLANT_S);
const SCAN = SCAN_S.map(F);
const SEEN = F(SEEN_S);
const KANE = F(KANE_S);
const BOX = F(BOX_S);
const DROP = F(DROP_S);
const DARK = DROP - 15;

const MAYA = [
  { client: "Northwind Studio", amount: "$2,400.00", note: "Brand refresh, phase 2." },
  { client: "Lumen Health", amount: "$1,150.00", note: "Landing page redesign." },
  { client: "Okafor & Sons Bakery", amount: "$380.00", note: "Menu board and flyers." },
];
const CANARY = "stranger-canary-f5b2cc";

function Row({ client, amount, children, style }: { client: string; amount: string; children?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "14px 18px", marginBottom: 12, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: fonts.text, fontWeight: 600, fontSize: 22, color: ink.text }}>
        <span>{client}</span>
        <span>{amount}</span>
      </div>
      {children && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}

/** A small, dark Duebook: the account it is signed in as, and its invoice list. */
function AppWindow({ who, x, y, children, edge, style }: { who: string; x: number; y: number; children: ReactNode; edge?: string; style?: CSSProperties }) {
  return (
    <Panel style={{ left: x, top: y, width: 640, height: 470, border: `1px solid ${edge ?? "rgba(255,255,255,0.09)"}`, boxShadow: edge ? `0 0 0 2px ${edge}, 0 0 80px ${edge}55, 0 40px 90px rgba(0,0,0,.45)` : undefined, ...style }}>
      <TitleBar title={`duebook · ${who}`} url />
      <div style={{ padding: "22px 26px" }}>
        <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 30, color: ink.duebook, marginBottom: 6 }}>Duebook</div>
        <div style={{ fontFamily: fonts.text, fontWeight: 600, fontSize: 18, color: ink.soft, marginBottom: 14 }}>Your invoices</div>
        {children}
      </div>
    </Panel>
  );
}

function Who({ initial, email, role, color, style }: { initial: string; email: string; role: string; color: string; style?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", display: "flex", alignItems: "center", gap: 16, ...style }}>
      <div style={{ width: 54, height: 54, borderRadius: "50%", background: color, boxShadow: `0 0 34px ${color}77`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fonts.display, fontWeight: 600, fontSize: 28, color: ink.night }}>{initial}</div>
      <div>
        <div style={{ fontFamily: fonts.text, fontWeight: 600, fontSize: 24, color: ink.text }}>{email}</div>
        <Label size={14} style={{ marginTop: 4 }}>{role}</Label>
      </div>
    </div>
  );
}

function Accounts({ plan }: SceneProps) {
  const f = useCurrentFrame();
  const enter = ramp(f, 4, 26);
  const apart = interpolate(f, [F(5.2), STRANGER], [0, 1], { ...clamp, easing: easeInOut });
  const ax = 640 - apart * 400;
  const bIn = interpolate(f, [STRANGER - 8, STRANGER], [0, 1], { ...clamp, easing: easeIn });
  const bx = 1920 + 100 - bIn * (1920 + 100 - 1040);
  const planted = f >= PLANT;
  const drop = interpolate(f, [PLANT - 6, PLANT], [-260, 0], { ...clamp, easing: easeIn });
  const seen = f >= SEEN;
  const scanning = f >= SCAN[0] && f < SEEN;
  const beam = ((f - SCAN[0]) % 30) / 30;
  const zoom = interpolate(f, [KANE - 10, KANE], [1, 1.7], { ...clamp, easing: easeIn });
  const gone = interpolate(f, [KANE - 6, KANE], [1, 0], clamp);
  const q = said(plan, "t-see", "see");
  return (
    <AbsoluteFill style={{ opacity: gone, transform: `scale(${zoom})`, transformOrigin: "1408px 526px" }}>
      <Camera hits={[STRANGER, PLANT, SEEN]} power={9} push={0.00025}>
       <AbsoluteFill style={{ transform: "translateY(56px) scale(1.12)", transformOrigin: "960px 420px" }}>
        {/* Maya, the owner */}
        <div style={{ position: "absolute", inset: 0, opacity: enter, transform: `translate(${ax - 640}px, ${(1 - enter) * 50}px)` }}>
          <Who initial="M" email="maya@duebook.demo" role="the owner" color={ink.canary} style={{ left: 640, top: 150 }} />
          <AppWindow who="maya@duebook.demo" x={640} y={230}>
            <div style={{ height: planted ? 92 : 0, overflow: "visible", position: "relative", transition: "none" }}>
              {planted && (
                <div style={{ transform: `translateY(${drop}px)` }}>
                  <Row client="Stranger check" amount="$1.00" style={{ border: `1px solid ${ink.canary}88`, boxShadow: `0 0 40px ${ink.canary}33` }}>
                    <Pill text={CANARY} size={17} />
                  </Row>
                </div>
              )}
            </div>
            {MAYA.slice(0, planted ? 2 : 3).map((r, i) => (
              <div key={r.client} style={{ opacity: ramp(f, 14 + i * 6, 12) }}>
                <Row client={r.client} amount={r.amount}>
                  <span style={{ fontFamily: fonts.text, fontSize: 17, color: ink.soft }}>{r.note}</span>
                </Row>
              </div>
            ))}
          </AppWindow>
          {/* The owner's checks, all green */}
          <div style={{ position: "absolute", left: 1320, top: 330, opacity: 1 - apart }}>
            {["Signs in", "Creates an invoice", "Sees it in the list"].map((t, i) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22, opacity: ramp(f, CHECKS[i] - 2, 6) }}>
                <Mark at={CHECKS[i]} ok size={44} />
                <span style={{ fontFamily: fonts.text, fontWeight: 600, fontSize: 30, color: ink.text }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
        {/* The stranger */}
        {f >= STRANGER - 8 && (
          <div style={{ position: "absolute", inset: 0, transform: `translateX(${bx - 1040}px)` }}>
            <Who initial="S" email="stranger@duebook.demo" role="someone else" color={ink.teal} style={{ left: 1040, top: 150 }} />
            <AppWindow who="stranger@duebook.demo" x={1040} y={230} edge={seen ? ink.leak : undefined}>
              {seen ? (
                <div style={{ transform: `scale(${interpolate(f, [SEEN, SEEN + 4, SEEN + 9], [1.25, 0.97, 1], clamp)})` }}>
                  <Row client="Stranger check" amount="$1.00" style={{ border: `2px solid ${ink.leak}`, boxShadow: `0 0 50px ${ink.leak}55` }}>
                    <Pill text={CANARY} size={17} />
                  </Row>
                  <Row client="Northwind Studio" amount="$2,400.00" style={{ opacity: 0.85 }} />
                </div>
              ) : (
                <div style={{ fontFamily: fonts.text, fontSize: 20, color: ink.faint, paddingTop: 12 }}>Nothing of Maya's should be here.</div>
              )}
              {scanning && (
                <div style={{ position: "absolute", left: 0, right: 0, top: 50 + beam * 400, height: 70, background: `linear-gradient(180deg, transparent, ${ink.teal}33, transparent)`, borderTop: `2px solid ${ink.teal}aa` }} />
              )}
            </AppWindow>
          </div>
        )}
        {/* The question between them */}
        {f >= q - 4 && f < SEEN && (
          <div style={{ position: "absolute", left: 640 - 400 + 640 + 4, width: 1040 - (640 - 400 + 640) - 8, top: 430, textAlign: "center", opacity: ramp(f, q - 4, 8) }}>
            <Slam at={q} from={1.6}>
              <span style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 120, color: ink.canary, textShadow: `0 0 40px ${ink.canary}88` }}>?</span>
            </Slam>
          </div>
        )}
        {seen && <Glow x={1360} y={460} size={900} color={ink.leak} opacity={0.25 * Math.exp(-(f - SEEN) / 30) + 0.08} drift={0} />}
       </AbsoluteFill>
      </Camera>
    </AbsoluteFill>
  );
}

/** Kane's own screenshot: signed in as the stranger, Maya's canary in the list. */
function KaneShot() {
  const f = useCurrentFrame();
  const enter = interpolate(f, [KANE, KANE + 10], [0, 1], { ...clamp, easing: easeOut });
  const focus = moveFocus(f, { x: 960, y: 420, zoom: 1.05 }, { x: 955, y: 470, zoom: 1.75 }, KANE + 6, 44);
  const out = interpolate(f, [DARK - 18, DARK], [0, 1], { ...clamp, easing: easeIn });
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - out), transform: `scale(${0.92 + 0.08 * enter - out * 0.06})` }}>
      <Camera hits={[BOX]} power={8} push={0.0003} from={KANE}>
        <Browser src="kane/stranger-probe-f5b2cc/21.jpg" url="stranger-2yf3.vercel.app/duebook/" width={1280} x={320} y={96} focus={focus}>
          <Box at={BOX} x={609} y={392} w={688} h={151} color={ink.leak} tag="Maya's canary, seen by the stranger" />
        </Browser>
        <div style={{ position: "absolute", left: 320, top: 48, display: "flex", gap: 24, alignItems: "center", opacity: ramp(f, KANE + 4, 10) }}>
          <Label color={ink.canary}>Kane CLI · real run f5b2cc</Label>
          <Label>signed in as stranger@duebook.demo</Label>
        </div>
        <div style={{ position: "absolute", left: 320, top: 96 + 770 + 22, width: 1280, display: "flex", alignItems: "center", gap: 16, opacity: ramp(f, BOX + 8, 8) }}>
          <Mark at={BOX + 10} ok={false} size={36} />
          <Typed at={BOX + 10} text={`assert: the text "${CANARY}" does not appear anywhere on the page`} cps={70} caret={false} style={{ fontFamily: fonts.mono, fontSize: 24, color: ink.text }} />
        </div>
      </Camera>
    </AbsoluteFill>
  );
}

function Title({ plan }: SceneProps) {
  const f = useCurrentFrame();
  const glow = ramp(f, DROP, 30);
  const line1 = said(plan, "t-name", "tests") + 6;
  const line2 = said(plan, "t-name", "someone") - 4;
  return (
    <AbsoluteFill>
      <Glow x={960} y={470} size={1400 * (0.7 + 0.3 * glow)} color={ink.amber} opacity={0.3 * glow} drift={20} />
      <Glow x={760} y={420} size={900} color={ink.canary} opacity={0.18 * glow} drift={40} seed={4} />
      <Glow x={1220} y={560} size={900} color={ink.coral} opacity={0.2 * glow} drift={40} seed={7} />
      <Camera hits={[DROP]} power={16} push={0.00045} from={DROP}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 260, display: "flex", justifyContent: "center", alignItems: "center", gap: 40 }}>
          <Slam at={DROP - 1} from={2.2}>
            <span style={{ display: "inline-block", width: 120, height: 120, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, #fff3b0 0%, ${ink.canary} 40%, ${ink.amber} 100%)`, boxShadow: `0 0 90px ${ink.canary}aa` }} />
          </Slam>
          <Slam at={DROP} from={1.7}>
            <span style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 250, letterSpacing: "-0.035em", lineHeight: 1, color: ink.text }}>Stranger</span>
          </Slam>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 560, textAlign: "center", fontFamily: fonts.display, fontWeight: 400, fontSize: 64, letterSpacing: "-0.02em", lineHeight: 1.12 }}>
          <div style={{ opacity: ramp(f, line1, 12), transform: `translateY(${(1 - ramp(f, line1, 14)) * 20}px)`, color: ink.text }}>You test your app as yourself.</div>
          <div style={{ opacity: ramp(f, line2, 12), transform: `translateY(${(1 - ramp(f, line2, 14)) * 20}px)` }}>
            <GradientText>Stranger tests it as someone else.</GradientText>
          </div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 790, display: "flex", justifyContent: "center", opacity: ramp(f, line2 + 18, 12) }}>
          <Label size={20}>Built on Kane CLI · for coding agents</Label>
        </div>
      </Camera>
      <Flash at={DROP} dur={10} peak={0.85} />
    </AbsoluteFill>
  );
}

export function Teaser(props: SceneProps) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      {f < KANE + 2 && <Accounts {...props} />}
      {f >= KANE - 2 && f < DARK + 2 && <KaneShot />}
      {f >= DROP - 1 && <Title {...props} />}
      <Flash at={SEEN} dur={8} peak={0.35} color={ink.leak} blend="screen" />
      <Flash at={KANE} dur={7} peak={0.3} />
    </AbsoluteFill>
  );
}
