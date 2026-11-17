// The film's narration, in order. `text` is what the captions show; `say` (when set) is what the
// voice reads, spelled for the ear. scripts/voice.ts turns each entry into public/vo/<id>.wav and
// records its word timings in public/vo/manifest.json.
//
// Every claim is from a real run: LEAK f5b2cc and CLEAN c789a7 (the closed loop, 16 Nov), the
// request replay of 6541c9 (17 Nov), and the agent's own transcript.

export interface Line {
  id: string;
  text: string;
  say?: string;
  /** Seconds of picture before the narrator starts. */
  lead?: number;
  /** Seconds of picture after the narrator stops. */
  tail?: number;
  /** Speeds the take up without changing its pitch. */
  tempo?: number;
}

/** The teaser is cut to its score, so these lines sit at fixed places (TEASER_AT in plan.ts). */
export const TEASER: Line[] = [
  { id: "t-you", text: "You test your app as yourself.", tempo: 1.04 },
  { id: "t-pass", text: "Every check passes.", tempo: 1.04 },
  { id: "t-users", text: "But your users aren't you.", tempo: 1.04 },
  { id: "t-see", text: "Can one of them see another's data?", tempo: 1.06 },
  { id: "t-kane", text: "Kane CLI signed in as a stranger, and saw Maya's invoice.", say: "Kane C L I signed in as a stranger, and saw Maya's invoice.", tempo: 1.08 },
  { id: "t-name", text: "Stranger tests your app as someone else.", tempo: 1.02 },
];

/** The demo, one line per scene. */
export const DEMO: Line[] = [
  {
    id: "d-bug",
    text: "Here's how it happens. Row level security is on, so the table looks protected. But its read policy is \"using (true)\": every account reads every row. In 2025, one scan found leaks like this in 170 of 1,645 Lovable apps.",
    say: "Here's how it happens. Row level security is on, so the table looks protected. But its read policy is, using true. Every account reads every row. In twenty twenty-five, one scan found leaks like this in a hundred and seventy of sixteen hundred and forty-five Lovable apps.",
    lead: 0.5,
    tail: 0.6,
    tempo: 1.1,
  },
  { id: "d-owner", text: "Stranger gives Kane two jobs in plain English. First, sign in as Maya, the owner, and save an invoice with a random canary in the note.", lead: 0.4, tail: 0.5, tempo: 1.06 },
  { id: "d-stranger", text: "Then sign in as a stranger, save a control row of their own, and look. The control proves the page loaded. The canary should be nowhere. It's right there.", lead: 0.2, tail: 0.9, tempo: 1.06 },
  { id: "d-replay", text: "Then Stranger replays the page's data requests. With the stranger's login, Maya's canary comes back. With no login at all, it still does. Anyone on the internet can read these invoices.", lead: 0.4, tail: 0.6, tempo: 1.06 },
  { id: "d-brief", text: "The verdict is LEAK. Stranger writes a fix brief for your coding agent: the open policy, the migration it came from, and the fix.", say: "The verdict is: leak. Stranger writes a fix brief for your coding agent: the open policy, the migration it came from, and the fix.", lead: 0.3, tail: 0.6, tempo: 1.06 },
  { id: "d-loop", text: "Now the loop. Stranger installs into Claude Code as a skill and a Stop hook. We gave a fresh agent an ordinary job: add a search box to Duebook.", lead: 0.4, tail: 0.5, tempo: 1.06 },
  { id: "d-hook", text: "When it tried to finish, the hook ran Stranger. Kane found the leak, and the brief went straight back to the agent. It can't call the work done until Kane says clean.", lead: 0.2, tail: 0.6, tempo: 1.06 },
  { id: "d-ask", text: "It asked before touching the live database. We said yes.", lead: 0.2, tail: 0.4, tempo: 1.04 },
  { id: "d-fix", text: "So it wrote one migration: owners read only their own rows. Applied it. Committed it.", lead: 0.2, tail: 0.6, tempo: 1.04 },
  { id: "d-clean", text: "Then it tried to stop again. Kane planted a fresh canary, and this time the stranger saw only their own rows. Clean.", lead: 0.2, tail: 1.2, tempo: 1.04 },
  { id: "d-more", text: "Stranger also tries to change and delete the owner's rows, checks that a fix didn't lock teammates out, and never counts an unfinished run as clean.", lead: 0.4, tail: 0.6, tempo: 1.06 },
  { id: "d-live", text: "One command adds it to your project. And the leak in this film is live. Open Duebook as a stranger, and see Maya's invoices for yourself.", lead: 0.3, tail: 0.8, tempo: 1.04 },
  { id: "d-close", text: "Stranger. Test your app as someone else.", lead: 0.6, tail: 3.2, tempo: 1.0 },
];

export const SCRIPT: Line[] = [...TEASER, ...DEMO];
