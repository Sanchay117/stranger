import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { cue } from "../plan.ts";
import { fonts, ink } from "../theme.ts";
import { Camera, clamp, GradientText, Label, ramp, Slam } from "../ui/kit.tsx";
import { Glow } from "../ui/parts.tsx";
import { Sfx } from "../ui/Sfx.tsx";

export function Close({ shot }: SceneProps) {
  const f = useCurrentFrame();
  const name = cue(shot, "stranger");
  const test = cue(shot, "test");
  const someone = cue(shot, "someone");
  const links = someone + 24;
  const out = interpolate(f, [shot.frames - 26, shot.frames - 2], [0, 1], clamp);
  const glow = ramp(f, name, 30);
  return (
    <AbsoluteFill>
      <Glow x={960} y={430} size={1300} color={ink.amber} opacity={0.24 * glow} drift={20} />
      <Glow x={700} y={380} size={800} color={ink.canary} opacity={0.14 * glow} drift={40} seed={4} />
      <Glow x={1250} y={520} size={800} color={ink.coral} opacity={0.16 * glow} drift={40} seed={7} />
      <Camera hits={[name]} power={10} push={0.0003} from={name}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 200, display: "flex", justifyContent: "center", alignItems: "center", gap: 34 }}>
          <Slam at={name - 1} from={2}>
            <span style={{ display: "inline-block", width: 100, height: 100, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, #fff3b0 0%, ${ink.canary} 40%, ${ink.amber} 100%)`, boxShadow: `0 0 80px ${ink.canary}aa` }} />
          </Slam>
          <Slam at={name} from={1.6}>
            <span style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 210, letterSpacing: "-0.035em", lineHeight: 1, color: ink.text }}>Stranger</span>
          </Slam>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 470, textAlign: "center", fontFamily: fonts.display, fontWeight: 400, fontSize: 70, letterSpacing: "-0.02em" }}>
          <span style={{ opacity: ramp(f, test - 2, 12), color: ink.text }}>Test your app as </span>
          <span style={{ opacity: ramp(f, someone - 2, 12) }}>
            <GradientText>someone else.</GradientText>
          </span>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 640, display: "flex", justifyContent: "center", gap: 28, opacity: ramp(f, links, 14), transform: `translateY(${(1 - ramp(f, links, 16)) * 14}px)` }}>
          {["stranger-2yf3.vercel.app", "github.com/Sanchay117/stranger"].map((t) => (
            <span key={t} style={{ fontFamily: fonts.mono, fontSize: 30, color: ink.text, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 999, padding: "12px 30px" }}>
              {t}
            </span>
          ))}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 760, display: "flex", justifyContent: "center", opacity: ramp(f, links + 12, 14) }}>
          <Label size={20}>Built on Kane CLI by TestMu AI · for coding agents</Label>
        </div>
      </Camera>
      <AbsoluteFill style={{ background: "#05070e", opacity: out }} />
      <Sfx name="stamp" at={name} volume={0.45} />
      <Sfx name="chime" at={someone} volume={0.3} />
    </AbsoluteFill>
  );
}
