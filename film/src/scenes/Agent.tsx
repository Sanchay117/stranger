import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { cue } from "../plan.ts";
import { fonts, ink } from "../theme.ts";
import { Camera, clamp, easeInOut, Label, ramp, Slam } from "../ui/kit.tsx";
import { Code, Term, type TermLine } from "../ui/code.tsx";
import { Glow, Panel, Pill, TitleBar } from "../ui/parts.tsx";
import { Kicker, LoopRing, type Node } from "../ui/scene.tsx";
import { Sfx, Typing } from "../ui/Sfx.tsx";

// The closed loop of 16 Nov, branch agent-loop in its own worktree. Every line the agent, the user
// or the hook says here is quoted from the session's own log (.stranger/runs/agent-loop*.jsonl),
// cut short where it runs on. The two dim "Kane CLI as ..." lines only describe the hook's two
// Kane runs; they are not printed text. The search box commit is 509a8d9 and the fix 59c1942.

const PROMPT =
  'In Duebook (demo/src/App.jsx), add a search box above the "Your invoices" list that filters the list by client name as you type. Keep it small and match the existing styles. Commit when you\'re done.';

const TERM = { left: 760, top: 110, width: 1040, height: 720 };

function AgentTerm({ lines, enter = 1 }: { lines: TermLine[]; enter?: number }) {
  return (
    <Panel style={{ ...TERM, opacity: enter, transform: `translateX(${(1 - enter) * 120}px)` }}>
      <TitleBar title="claude · kane-loop · branch agent-loop" />
      <div style={{ padding: "22px 30px" }}>
        <Term lines={lines} height={TERM.height - 50 - 44} size={23} />
      </div>
    </Panel>
  );
}

/** Where the ring sits once the terminal is on screen. */
const SIDE = { cx: 410, cy: 420, scale: 0.72 };

export function Loop({ shot }: SceneProps) {
  const f = useCurrentFrame();
  const claude = cue(shot, "claude");
  const skill = cue(shot, "skill");
  const stop = cue(shot, "stop");
  const we = cue(shot, "we");
  const fresh = cue(shot, "fresh");
  const ordinary = cue(shot, "ordinary");
  const move = interpolate(f, [we - 8, we + 16], [0, 1], { ...clamp, easing: easeInOut });
  const active: Node | undefined = f >= stop ? "hook" : f >= claude ? "agent" : undefined;
  return (
    <AbsoluteFill>
      <Kicker>The closed loop</Kicker>
      <LoopRing cx={960 + (SIDE.cx - 960) * move} cy={480 + (SIDE.cy - 480) * move} r={250} at={8} scale={1 - (1 - SIDE.scale) * move} active={move > 0.5 ? undefined : active} />
      {/* What install-claude adds, pinned to the ring before it moves aside */}
      <div style={{ opacity: 1 - move }}>
        <div style={{ position: "absolute", left: 1130, top: 196, opacity: ramp(f, skill - 4, 10), transform: `translateX(${(1 - ramp(f, skill - 4, 12)) * -16}px)` }}>
          <Pill text=".claude/skills/stranger/SKILL.md" color={ink.text} size={22} glow={false} />
        </div>
        <div style={{ position: "absolute", left: 1100, top: 572, opacity: ramp(f, stop - 4, 10), transform: `translateX(${(1 - ramp(f, stop - 4, 12)) * -16}px)` }}>
          <Pill text=".claude/hooks/stranger-stop.js" color={ink.coral} size={22} />
        </div>
      </div>
      {move > 0 && (
        <AgentTerm
          enter={move}
          lines={[
            { at: we + 4, kind: "dim", text: "a fresh Claude Code session · Stop hook armed · 16 Nov" },
            { at: we + 10, kind: "blank", text: "" },
            { at: fresh, kind: "user", text: PROMPT, rows: 3, cps: 105 },
          ]}
        />
      )}
      <div style={{ position: "absolute", left: 140, top: 740, width: 520, opacity: ramp(f, ordinary, 12) * move }}>
        <Label size={17} color={ink.canary}>the task</Label>
        <div style={{ marginTop: 10, fontFamily: fonts.text, fontWeight: 600, fontSize: 34, color: ink.text, lineHeight: 1.3 }}>
          A search box.
          <br />
          Nothing about security.
        </div>
      </div>
      <Sfx name="whoosh" at={4} volume={0.25} />
      <Sfx name="tick" at={skill} volume={0.3} />
      <Sfx name="tick" at={stop} volume={0.3} />
      <Typing at={fresh} frames={60} />
    </AbsoluteFill>
  );
}

const BEFORE: TermLine[] = [
  { at: -200, kind: "user", text: PROMPT, rows: 3 },
  { at: -200, kind: "tool", text: "Edit(demo/src/App.jsx)" },
  { at: -200, kind: "tool", text: "Bash(npm --prefix demo run build)" },
  { at: -200, kind: "ok", text: "64 modules transformed." },
  { at: -200, kind: "tool", text: 'Bash(git commit -m "Add a client name search box above…")' },
  { at: -200, kind: "out", text: "509a8d9 Add a client name search box above Duebook's invoice list" },
];

export function Hook({ shot }: SceneProps) {
  const f = useCurrentFrame();
  const finish = cue(shot, "finish");
  const hook = cue(shot, "hook");
  const kane = cue(shot, "kane");
  const leak = cue(shot, "leak");
  const brief = cue(shot, "brief");
  const agent = cue(shot, "agent");
  const cant = cue(shot, "cant");
  const active: Node = f >= agent ? "agent" : f >= brief ? "brief" : f >= kane ? "kane" : f >= hook ? "hook" : "agent";
  return (
    <AbsoluteFill>
      <Camera hits={[leak, cant]} power={8} push={0.00015}>
        <Kicker color={ink.coral}>The Stop hook</Kicker>
        <LoopRing cx={SIDE.cx} cy={SIDE.cy} r={250} at={-60} scale={SIDE.scale} active={active} />
        <AgentTerm
          lines={[
            ...BEFORE,
            { at: finish - 14, kind: "agent", text: "I added the search box and committed it on agent-loop." },
            { at: hook, kind: "hook", text: "Stop hook · running Stranger" },
            { at: kane - 6, kind: "dim", text: "Kane CLI as maya@duebook.demo · canary planted" },
            { at: kane + 10, kind: "dim", text: "Kane CLI as stranger@duebook.demo · looking for it" },
            { at: leak, kind: "bad", text: "LEAK f5b2cc · the stranger saw Maya's canary" },
            { at: brief, kind: "hook", text: "Stop hook feedback: Stranger ran Kane CLI as a second account and found a data leak. Signed in as stranger@duebook.demo, Kane found the owner's canary on the page.", rows: 3 },
          ]}
        />
        {f >= cant - 2 && (
          <div style={{ position: "absolute", left: 120, top: 760, width: 560, opacity: ramp(f, cant - 2, 6) }}>
            <Slam at={cant} from={1.5}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 14, fontFamily: fonts.mono, fontWeight: 700, fontSize: 30, color: ink.night, background: ink.coral, borderRadius: 14, padding: "10px 22px", boxShadow: `0 0 50px ${ink.coral}88` }}>
                {'{"decision": "block"}'}
              </span>
            </Slam>
            <div style={{ marginTop: 14, fontFamily: fonts.text, fontWeight: 600, fontSize: 28, color: ink.text, opacity: ramp(f, cant + 10, 10) }}>No "done" until Kane says CLEAN.</div>
          </div>
        )}
        {f >= leak && <Glow x={1280} y={600} size={900} color={ink.leak} opacity={0.18 * Math.exp(-(f - leak) / 30) + 0.04} drift={0} />}
      </Camera>
      <Sfx name="press" at={hook} volume={0.3} />
      <Sfx name="tick" at={kane - 6} volume={0.25} />
      <Sfx name="tick" at={kane + 10} volume={0.25} />
      <Sfx name="thud" at={leak} volume={0.5} />
      <Sfx name="paper" at={brief} volume={0.35} />
      <Sfx name="stamp" at={cant} volume={0.5} />
    </AbsoluteFill>
  );
}

/** The agent stopped and asked before changing the live database; the go-ahead. */
export function Ask({ shot }: SceneProps) {
  const f = useCurrentFrame();
  const asked = cue(shot, "asked");
  const live = cue(shot, "live");
  const we = cue(shot, "we");
  const yes = cue(shot, "yes");
  const a = ramp(f, asked - 6, 14);
  return (
    <AbsoluteFill>
      <Kicker>Before it touched the database</Kicker>
      <div style={{ position: "absolute", left: 220, top: 200, width: 1240, opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>
        <Label size={17}>the agent</Label>
        <div style={{ marginTop: 14, padding: "32px 40px", borderRadius: "30px 30px 30px 8px", background: "rgba(30,37,64,0.9)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 30px 70px rgba(0,0,0,0.4)" }}>
          <div style={{ fontFamily: fonts.text, fontWeight: 600, fontSize: 42, lineHeight: 1.32, color: ink.text }}>"I haven't written or applied the migration Stranger asks for, because I think you should make that call."</div>
          <div style={{ marginTop: 20, fontFamily: fonts.text, fontWeight: 500, fontSize: 32, lineHeight: 1.4, color: ink.soft, opacity: ramp(f, live - 6, 10) }}>
            "A fix would change the <span style={{ color: ink.amber }}>live database</span> and close the public demo leak your product page links to."
          </div>
        </div>
      </div>
      {f >= we - 2 && (
        <div style={{ position: "absolute", right: 220, top: 680, textAlign: "right" }}>
          <Label size={17} style={{ opacity: ramp(f, we - 2, 8) }}>
            us
          </Label>
          <div style={{ marginTop: 12 }}>
            <Slam at={yes - 4} from={1.5}>
              <span style={{ display: "inline-block", fontFamily: fonts.text, fontWeight: 700, fontSize: 56, color: ink.night, background: ink.canary, borderRadius: "30px 30px 8px 30px", padding: "18px 40px", boxShadow: `0 0 60px ${ink.canary}66` }}>Yes, run it</span>
            </Slam>
          </div>
        </div>
      )}
      <Sfx name="paper" at={asked - 6} volume={0.3} />
      <Sfx name="press" at={yes - 4} volume={0.45} />
    </AbsoluteFill>
  );
}

export function Fix({ shot }: SceneProps) {
  const f = useCurrentFrame();
  const wrote = cue(shot, "wrote");
  const owners = cue(shot, "owners");
  const applied = cue(shot, "applied");
  const committed = cue(shot, "committed");
  const code = ramp(f, wrote - 14, 14);
  return (
    <AbsoluteFill>
      <Kicker color={ink.clean}>The agent's fix</Kicker>
      <Panel style={{ left: 120, top: 120, width: 1680, height: 370, opacity: code, transform: `translateY(${(1 - code) * 30}px)` }}>
        <TitleBar title="supabase/migrations/0002_invoices_owner_read.sql" />
        <div style={{ padding: "30px 40px" }}>
          <Code
            size={30}
            cps={110}
            lines={[
              { text: 'drop policy if exists "Enable read access for all users" on public.invoices;', at: wrote, type: true },
              { text: "", at: wrote },
              { text: 'create policy "Users can read their own invoices"', at: wrote + 26, type: true },
              { text: "  on public.invoices for select to authenticated", at: wrote + 40, type: true },
              { text: "  using ((select auth.uid()) = user_id);", at: wrote + 52, type: true, mark: owners + 4, markColor: ink.clean },
            ]}
          />
        </div>
      </Panel>
      <Panel style={{ left: 120, top: 530, width: 1680, height: 320, opacity: ramp(f, applied - 20, 12) }}>
        <TitleBar title="claude · kane-loop · branch agent-loop" />
        <div style={{ padding: "20px 30px" }}>
          <Term
            size={25}
            height={240}
            lines={[
              { at: applied - 14, kind: "cmd", text: "npm run db:apply", cps: 70 },
              { at: applied + 2, kind: "out", text: "skip 0001_invoices.sql" },
              { at: applied + 8, kind: "ok", text: "apply 0002_invoices_owner_read.sql" },
              { at: committed - 10, kind: "cmd", text: 'git commit -m "Fix the invoices leak Stranger found: only owners can read their rows"', cps: 160 },
              { at: committed + 12, kind: "ok", text: "59c1942 Fix the invoices leak Stranger found: only owners can read their rows" },
            ]}
          />
        </div>
      </Panel>
      <Typing at={wrote} frames={70} />
      <Sfx name="chime" at={owners + 4} volume={0.25} />
      <Sfx name="press" at={applied + 8} volume={0.3} />
      <Sfx name="press" at={committed + 12} volume={0.3} />
    </AbsoluteFill>
  );
}
