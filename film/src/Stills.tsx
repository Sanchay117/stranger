import { AbsoluteFill } from "remotion";
import { fonts, ink } from "./theme.ts";
import { GradientText, Grain, Label } from "./ui/kit.tsx";
import { Backdrop, Box, Browser, Glow, Verdict } from "./ui/parts.tsx";

/**
 * The film's thumbnail: the name and the promise on the left, and Kane's own screenshot on the
 * right, signed in as the stranger with Maya's canary boxed. Rendered at 1920 × 1080 and scaled for
 * 1280 × 720 (npm run thumbnails), so every word has to read small.
 */
export function Thumbnail() {
  return (
    <AbsoluteFill style={{ background: ink.night }}>
      <Backdrop />
      <Glow x={1330} y={520} size={1100} color={ink.leak} opacity={0.22} drift={0} />
      <Glow x={420} y={380} size={900} color={ink.amber} opacity={0.22} drift={0} />
      <div style={{ position: "absolute", left: 1040, top: 150, transform: "rotate(2deg)" }}>
        <Browser src="kane/stranger-probe-f5b2cc/21.jpg" url="signed in as stranger@duebook.demo" width={790} x={0} y={0} focus={{ x: 953, y: 450, zoom: 1.7 }}>
          <Box at={-100} x={609} y={392} w={688} h={151} color={ink.leak} width={8} />
        </Browser>
      </div>
      <div style={{ position: "absolute", left: 1290, top: 640, transform: "rotate(-6deg)" }}>
        <Verdict at={-100} word="LEAK" color={ink.leak} size={150} angle={0} />
      </div>
      <div style={{ position: "absolute", left: 110, top: 190, width: 900 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <span style={{ display: "inline-block", width: 92, height: 92, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, #fff3b0 0%, ${ink.canary} 40%, ${ink.amber} 100%)`, boxShadow: `0 0 70px ${ink.canary}aa` }} />
          <span style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 190, letterSpacing: "-0.04em", lineHeight: 1, color: ink.text }}>Stranger</span>
        </div>
        <div style={{ marginTop: 50, fontFamily: fonts.display, fontWeight: 600, fontSize: 84, lineHeight: 1.04, letterSpacing: "-0.03em", color: ink.text }}>
          Can one user see
          <br />
          <GradientText>another's data?</GradientText>
        </div>
        <Label size={26} color={ink.soft} style={{ marginTop: 50 }}>
          Kane CLI · coding agent · closed loop
        </Label>
      </div>
      <Grain amount={0.05} />
    </AbsoluteFill>
  );
}
