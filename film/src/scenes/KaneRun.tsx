import type { CSSProperties } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { cue } from "../plan.ts";
import { fonts, ink } from "../theme.ts";
import { Camera, clamp, easeInOut, Flash, Label, ramp } from "../ui/kit.tsx";
import { Box, Glow, Mark, Pill, Verdict } from "../ui/parts.tsx";
import { Job, Kicker, Screens, Ticker, Tok } from "../ui/scene.tsx";
import { Sfx } from "../ui/Sfx.tsx";

// The two jobs are Stranger's real objectives (stranger/src/check.js), cut down to their steps.
// Every screenshot and step remark is Kane's own, from the closed loop's runs on 16 Nov: f5b2cc
// (LEAK, before the agent's fix) and c789a7 (CLEAN, after it).

const URL = "stranger-2yf3.vercel.app/duebook/";

type JobProps = { at: number; current?: number; lit?: number; style?: CSSProperties };

function OwnerJob(props: JobProps) {
  return (
    <Job
      n={1}
      who="as maya@duebook.demo, the owner"
      color={ink.canary}
      lines={[
        "Log in with the email form.",
        <>
          Click New invoice, type the canary into the Note. Save it.
        </>,
        <>
          Verify that <Tok>stranger-canary-f5b2cc</Tok> is visible.
        </>,
      ]}
      {...props}
    />
  );
}

function StrangerJob(props: JobProps) {
  return (
    <Job
      n={2}
      who="as stranger@duebook.demo"
      color={ink.teal}
      lines={[
        "Log in with the email form.",
        <>
          Save an invoice with <Tok color={ink.teal}>stranger-control-f5b2cc</Tok> in the Note.
        </>,
        <>
          Verify that the control is visible.
        </>,
        <>
          Verify that <Tok>stranger-canary-f5b2cc</Tok> does not appear anywhere on the page.
        </>,
      ]}
      {...props}
    />
  );
}

/** Stranger hands Kane two jobs; the first one runs: Maya plants the canary. */
export function Owner({ shot }: SceneProps) {
  const f = useCurrentFrame();
  const two = cue(shot, "two");
  const first = cue(shot, "first");
  const maya = cue(shot, "maya");
  const save = cue(shot, "save");
  const canary = cue(shot, "canary");
  const split = interpolate(f, [first - 4, first + 18], [0, 1], { ...clamp, easing: easeInOut });
  return (
    <AbsoluteFill>
      <Kicker>Stranger → Kane CLI</Kicker>
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center", fontFamily: fonts.display, fontWeight: 400, fontSize: 60, letterSpacing: "-0.02em", color: ink.text, opacity: ramp(f, 14, 14) * (1 - split), transform: `translateY(${(1 - ramp(f, 14, 16)) * 20 - split * 40}px)` }}>
        Two jobs, in plain English
      </div>
      <OwnerJob at={two} current={f < save ? 0 : f < canary ? 1 : 2} style={{ left: 360 - split * 240, top: 300 - split * 40 }} />
      <StrangerJob at={two + 8} lit={1 - split} style={{ left: 1000 + split * 700, top: 300, opacity: (1 - split) * ramp(f, two + 8, 16) }} />
      {f >= first - 2 && (
        <div style={{ opacity: ramp(f, first, 14), transform: `translateX(${(1 - ramp(f, first, 18)) * 80}px)` }}>
          <Label color={ink.canary} style={{ position: "absolute", left: 740, top: 64 }}>
            Kane CLI · real run f5b2cc · 16 Nov
          </Label>
          <Screens
            x={740}
            y={110}
            width={1060}
            url={URL}
            screens={[
              { at: first, src: "kane/stranger-owner-f5b2cc/6-annotated.png", focus: { x: 960, y: 420, zoom: 1.4 } },
              { at: save, src: "kane/stranger-owner-f5b2cc/8-annotated.png", focus: { x: 1050, y: 300, zoom: 1.35 } },
              { at: save + 18, src: "kane/stranger-owner-f5b2cc/14-annotated.png", focus: { x: 952, y: 400, zoom: 1.4 } },
              { at: canary - 4, src: "kane/stranger-owner-f5b2cc/18.jpg", focus: { x: 953, y: 330, zoom: 1.45 } },
            ]}
            refocus={[{ at: maya, focus: { x: 960, y: 500, zoom: 1.6 } }]}
          >
            <Box at={canary + 6} x={609} y={231} w={688} h={151} color={ink.canary} tag="the canary, saved as Maya" tagSide="bottom" />
          </Screens>
          <Ticker
            x={740}
            y={780}
            width={1060}
            size={22}
            steps={[
              { at: first, n: 6, text: "click: Clicking Log in button" },
              { at: save, n: 8, text: "click: Clicking New invoice button" },
              { at: save + 18, n: 14, text: 'type: Type "stranger-canary-f5b2cc" into "Note"' },
              { at: canary - 4, n: 18, text: 'assert: the text "stranger-canary-f5b2cc" is visible on the page' },
            ]}
          />
        </div>
      )}
      <Sfx name="whoosh" at={first - 4} volume={0.25} />
      <Sfx name="tick" at={save} volume={0.3} />
      <Sfx name="tick" at={save + 18} volume={0.3} />
      <Sfx name="chime" at={canary + 6} volume={0.3} />
    </AbsoluteFill>
  );
}

/** The second job: the stranger saves a control row, and Kane finds Maya's canary beside it. */
export function Probe({ shot }: SceneProps) {
  const f = useCurrentFrame();
  const save = cue(shot, "save");
  const control = cue(shot, "control");
  const look = cue(shot, "look");
  const proves = cue(shot, "control", 1);
  const canary = cue(shot, "canary");
  const right = cue(shot, "right");
  const current = f < save ? 0 : f < proves ? 1 : f < canary ? 2 : 3;
  return (
    <AbsoluteFill>
      <Camera hits={[right]} power={12} push={0.0002}>
        <Kicker color={ink.teal}>Kane CLI · job 2 · the stranger</Kicker>
        <StrangerJob at={0} current={current} style={{ left: 120, top: 250 }} />
        <Label color={ink.teal} style={{ position: "absolute", left: 740, top: 64 }}>
          Kane CLI · real run f5b2cc · 16 Nov
        </Label>
        <Screens
          x={740}
          y={110}
          width={1060}
          url={URL}
          screens={[
            { at: 0, src: "kane/stranger-probe-f5b2cc/6-annotated.png", focus: { x: 960, y: 420, zoom: 1.4 } },
            { at: control, src: "kane/stranger-probe-f5b2cc/13-annotated.png", focus: { x: 952, y: 330, zoom: 1.4 } },
            { at: look, src: "kane/stranger-probe-f5b2cc/21.jpg", focus: { x: 953, y: 330, zoom: 1.35 } },
          ]}
          refocus={[{ at: canary, focus: { x: 953, y: 420, zoom: 1.5 } }]}
        >
          <Box at={proves} x={609} y={231} w={688} h={151} color={ink.teal} tag="their own control: the page loaded" />
          <Box at={right} x={609} y={392} w={688} h={151} color={ink.leak} tag="Maya's canary" tagSide="bottom" width={7} />
        </Screens>
        <Ticker
          x={740}
          y={780}
          width={1060}
          size={22}
          steps={[
            { at: 0, n: 6, text: "click: Clicking Log in button" },
            { at: control, n: 13, text: 'type: Type "stranger-control-f5b2cc" into "Note"' },
            { at: look - 10, n: 15, text: "click: Clicking Save invoice button" },
            { at: proves, n: 20, text: 'assert: the text "stranger-control-f5b2cc" is visible on the page' },
            { at: right, n: 21, text: 'assert: the text "stranger-canary-f5b2cc" does not appear anywhere', ok: false },
          ]}
        />
        {f >= right && <Glow x={1270} y={520} size={1000} color={ink.leak} opacity={0.22 * Math.exp(-(f - right) / 24) + 0.06} drift={0} />}
      </Camera>
      <Flash at={right} dur={8} peak={0.3} color={ink.leak} />
      <Sfx name="tick" at={control} volume={0.3} />
      <Sfx name="chime" at={proves} volume={0.25} />
      <Sfx name="thud" at={right} volume={0.6} />
    </AbsoluteFill>
  );
}

/** The second stop: a fresh canary, and the stranger sees only their own rows. */
export function Clean({ shot }: SceneProps) {
  const f = useCurrentFrame();
  const stop = cue(shot, "stop");
  const kane = cue(shot, "kane");
  const fresh = cue(shot, "fresh");
  const stranger = cue(shot, "stranger");
  const only = cue(shot, "only");
  const own = cue(shot, "own");
  const clean = cue(shot, "clean");
  const dim = interpolate(f, [clean - 4, clean + 6], [0, 0.72], clamp);
  return (
    <AbsoluteFill>
      <Camera hits={[clean]} power={10} push={0.0002}>
        <Kicker color={ink.clean}>The second stop · run c789a7</Kicker>
        <div style={{ position: "absolute", left: 120, top: 230, width: 560 }}>
          <div style={{ opacity: ramp(f, stop, 12), display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderRadius: 14, background: "rgba(255,94,87,0.12)", border: `1px solid ${ink.coral}55`, fontFamily: fonts.mono, fontSize: 22, color: ink.text }}>
            <span style={{ color: ink.coral }}>▌</span> Stop hook: running Stranger again
          </div>
          <div style={{ marginTop: 44, opacity: ramp(f, fresh - 6, 12) }}>
            <Label size={17}>a fresh canary from Maya</Label>
            <div style={{ marginTop: 14, transform: `scale(${interpolate(f, [fresh, fresh + 4, fresh + 9], [1.2, 0.97, 1], clamp)})`, transformOrigin: "left center" }}>
              <Pill text="stranger-canary-c789a7" size={26} />
            </div>
          </div>
          <div style={{ marginTop: 52, opacity: ramp(f, stranger, 12) }}>
            <Label size={17}>"Outstanding", as the stranger sees it</Label>
            <div style={{ display: "flex", alignItems: "baseline", gap: 22, marginTop: 14, fontFamily: fonts.display, fontWeight: 600, letterSpacing: "-0.02em" }}>
              <span style={{ fontSize: 46, color: ink.leak, textDecoration: f >= only ? "line-through" : undefined, opacity: f >= only ? 0.7 : 1 }}>$3,936.00</span>
              <span style={{ fontSize: 34, color: ink.faint }}>→</span>
              <span style={{ fontSize: 64, color: ink.clean, opacity: ramp(f, only, 10) }}>$4.00</span>
            </div>
            <div style={{ display: "flex", gap: 22, marginTop: 6, opacity: ramp(f, only, 10) }}>
              <Label size={15} color={ink.faint}>before the fix · f5b2cc</Label>
              <Label size={15} color={ink.faint}>after · c789a7</Label>
            </div>
          </div>
        </div>
        <div style={{ opacity: ramp(f, kane, 14), transform: `translateX(${(1 - ramp(f, kane, 18)) * 60}px)` }}>
          <Label color={ink.clean} style={{ position: "absolute", left: 760, top: 64 }}>
            Kane CLI · real run c789a7 · after the agent's fix
          </Label>
          <Screens
            x={760}
            y={110}
            width={1040}
            url={URL}
            screens={[
              { at: kane, src: "kane/stranger-probe-c789a7/11-annotated.png", focus: { x: 960, y: 330, zoom: 1.4 } },
              { at: stranger, src: "kane/stranger-probe-c789a7/17.jpg", focus: { x: 960, y: 520, zoom: 1.2 } },
            ]}
          >
            <Box at={only} x={616} y={231} w={688} h={633} color={ink.clean} tag="only the stranger's own rows" />
          </Screens>
          <div style={{ position: "absolute", left: 760, top: 780, width: 1040, fontFamily: fonts.mono, fontSize: 21, color: ink.text }}>
            {[
              { at: own - 10, text: 'assert: the text "stranger-control-c789a7" is visible on the page' },
              { at: own + 6, text: 'assert: the text "stranger-canary-c789a7" does not appear anywhere' },
            ].map((a) => (
              <div key={a.text} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10, opacity: ramp(f, a.at, 8) }}>
                <Mark at={a.at + 2} ok size={30} />
                {a.text}
              </div>
            ))}
          </div>
        </div>
      </Camera>
      <AbsoluteFill style={{ background: ink.night, opacity: dim }} />
      {f >= clean - 1 && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 40 }}>
          <Glow x={960} y={460} size={1200} color={ink.clean} opacity={0.3 * ramp(f, clean, 20)} drift={0} />
          <Verdict at={clean} word="CLEAN" color={ink.clean} size={190} />
          <div style={{ fontFamily: fonts.mono, fontSize: 25, color: ink.text, opacity: ramp(f, clean + 14, 12), maxWidth: 1300, textAlign: "center", lineHeight: 1.5 }}>
            <span style={{ color: ink.soft }}>Stop says: </span>Stranger: CLEAN. The stranger saw their own data and none of the owner's.
          </div>
        </AbsoluteFill>
      )}
      <Flash at={clean} dur={10} peak={0.35} color={ink.clean} />
      <Sfx name="press" at={stop} volume={0.3} />
      <Sfx name="tick" at={fresh} volume={0.35} />
      <Sfx name="stamp" at={clean} volume={0.6} />
      <Sfx name="chime" at={clean + 4} volume={0.35} />
    </AbsoluteFill>
  );
}
