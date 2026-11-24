import { AbsoluteFill, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { cue, FPS } from "../plan.ts";
import { fonts, ink } from "../theme.ts";
import { clamp, easeInOut, Flash, Label, ramp } from "../ui/kit.tsx";
import { Term } from "../ui/code.tsx";
import { Box, Panel, Pill, TitleBar } from "../ui/parts.tsx";
import { Kicker } from "../ui/scene.tsx";
import { Sfx } from "../ui/Sfx.tsx";

// The install lines are what `stranger install-claude` prints (stranger/src/install.js and
// stranger/bin). The footage is the live site, filmed by scripts/capture.ts (the date is in
// live.json); the login wait is cut out, and the cut is marked on screen with its real length.

const VIDEO = { left: 360, top: 96, width: 1200 };
const VIEW_H = (VIDEO.width * 9) / 16;

export function LiveScene({ shot, plan }: SceneProps) {
  const f = useCurrentFrame();
  const command = cue(shot, "command");
  const and = cue(shot, "and");
  const live = cue(shot, "live");
  const open = cue(shot, "open");
  const strangerAt = cue(shot, "stranger");
  const mayas = cue(shot, "mayas");
  const marks = plan.live.marks;
  const move = interpolate(f, [and - 10, and + 8], [0, 1], { ...clamp, easing: easeInOut });
  // Clip A runs into the click on "Open as a stranger" on the word "stranger"; clip B starts on Maya's invoices.
  const aFrom = and - 6;
  const aTrim = Math.round(marks.stranger * FPS) - (strangerAt - aFrom);
  const cut = strangerAt + 14;
  const bTrim = Math.round(marks.invoices * FPS);
  // The duebook mark is when the navigation starts; the page paints about 0.6 s later.
  const onDuebook = f >= aFrom + Math.round((marks.duebook + 0.6) * FPS) - aTrim;
  const wait = Math.max(1, Math.round(marks.invoices - marks.stranger));
  // Maya's first invoice, where the capture found it (the 17 Nov footage predates the record).
  const card = plan.live.boxes?.invoice;
  const invoice = card ? { x: card.x - 8, y: card.y - 8, w: card.w + 16, h: card.h + 16 } : { x: 502, y: 312, w: 916, h: 206 };
  return (
    <AbsoluteFill>
      <Kicker style={{ opacity: 1 - move }}>Try it</Kicker>
      {/* One command */}
      {move < 1 && (
        <Panel style={{ left: 260, top: 250, width: 1400, height: 400, opacity: ramp(f, command - 20, 12) * (1 - move), transform: `translateY(${-move * 60}px) scale(${1 - move * 0.05})` }}>
          <TitleBar title="your project" />
          <div style={{ padding: "26px 36px" }}>
            <Term
              size={28}
              height={300}
              lines={[
                { at: command - 8, kind: "cmd", text: "npx github:Sanchay117/stranger install-claude", cps: 80 },
                { at: command + 16, kind: "out", text: "Skill:     .claude/skills/stranger/SKILL.md" },
                { at: command + 21, kind: "out", text: "Stop hook: .claude/hooks/stranger-stop.js" },
                { at: command + 26, kind: "out", text: "Settings:  .claude/settings.json (Stop hook registered)" },
                { at: command + 30, kind: "blank", text: "" },
                { at: command + 36, kind: "dim", text: "Arm the hook with: touch .stranger/armed" },
              ]}
            />
          </div>
        </Panel>
      )}
      {/* The live site */}
      {move > 0 && (
        <div style={{ position: "absolute", inset: 0, opacity: move, transform: `translateY(${(1 - move) * 60}px)` }}>
          <Panel style={{ left: VIDEO.left, top: VIDEO.top, width: VIDEO.width, height: VIEW_H + 50 }}>
            <TitleBar title={onDuebook ? "stranger-2yf3.vercel.app/duebook/" : "stranger-2yf3.vercel.app"} url />
            <div style={{ position: "relative", width: VIDEO.width, height: VIEW_H, overflow: "hidden", background: "#f5f4f0" }}>
              <Sequence from={aFrom} durationInFrames={cut - aFrom} layout="none" name="live: page and click">
                <OffthreadVideo src={staticFile("capture/live.mp4")} trimBefore={aTrim} muted style={{ position: "absolute", inset: 0, width: VIDEO.width, height: VIEW_H }} />
              </Sequence>
              <Sequence from={cut} layout="none" name="live: Maya's invoices">
                <OffthreadVideo src={staticFile("capture/live.mp4")} trimBefore={bTrim} muted style={{ position: "absolute", inset: 0, width: VIDEO.width, height: VIEW_H }} />
              </Sequence>
              {/* Maya's invoice, while the page is still: drawn in the capture's 1920 × 1080 pixels */}
              <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transform: `scale(${VIDEO.width / 1920})`, transformOrigin: "0 0", opacity: interpolate(f, [mayas + 36, mayas + 44], [1, 0], clamp) }}>
                <Box at={mayas} x={invoice.x} y={invoice.y} w={invoice.w} h={invoice.h} color={ink.leak} tag="Maya's invoice, open to the stranger" tagSide="top" width={7} />
              </div>
              {f >= cut && f < cut + 34 && (
                <div style={{ position: "absolute", left: 24, top: 24, opacity: interpolate(f, [cut, cut + 4, cut + 26, cut + 34], [0, 1, 1, 0], clamp) }}>
                  <Pill text={`login wait cut · ${wait} s`} color={ink.soft} size={20} glow={false} />
                </div>
              )}
            </div>
          </Panel>
          <div style={{ position: "absolute", left: VIDEO.left, top: 52, width: VIDEO.width, display: "flex", alignItems: "center", gap: 14, opacity: ramp(f, live - 6, 10) }}>
            <span style={{ width: 14, height: 14, borderRadius: "50%", background: ink.leak, boxShadow: `0 0 ${12 + 8 * Math.sin(f / 5)}px ${ink.leak}` }} />
            <Label size={18} color={ink.text}>
              The live site · filmed {plan.live.filmed ?? "17 Nov"}
            </Label>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: VIDEO.top + VIEW_H + 50 + 26, display: "flex", justifyContent: "center", opacity: ramp(f, open, 12), transform: `translateY(${(1 - ramp(f, open, 14)) * 12}px)` }}>
            <span style={{ fontFamily: fonts.mono, fontSize: 28, color: ink.night, background: ink.canary, borderRadius: 999, padding: "10px 30px", boxShadow: `0 0 40px ${ink.canary}55` }}>
              stranger-2yf3.vercel.app/duebook/?as=stranger
            </span>
          </div>
        </div>
      )}
      <Flash at={cut} dur={6} peak={0.25} />
      <Sfx name="typing" at={command - 8} frames={20} volume={0.15} />
      <Sfx name="whoosh" at={and - 10} volume={0.25} />
      <Sfx name="press" at={strangerAt} volume={0.35} />
      <Sfx name="whoosh" at={cut - 4} volume={0.2} />
      <Sfx name="thud" at={mayas} volume={0.4} />
    </AbsoluteFill>
  );
}
