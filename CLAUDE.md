# CLAUDE.md

Entry for the Kane CLI Online Hackathon (TestMu AI): build a working web app with an AI coding agent, verify it with Kane CLI, ship it.

**The project: Stranger.** "You only ever test your app as yourself. Stranger tests it as someone else." Kane signs in as the owner and plants a random canary, then signs in as a second user and looks for it. If the stranger can see it, the app leaks other users' data. The coding agent fixes it at the database and Stranger runs again until it is clean.

**Deadline: Thu 19 Nov 2026, 11:59 PM IST. No pushes after it.**

## Read first
- `HACKATHON.md` (local only, gitignored): event facts, judging, must-do list, timeline, the chosen idea. Check every decision against it and update it as things change.
- Keep this file current. When the stack, commands, Kane loop or status change, update the matching section here in the same change.

## Status
- 16 Nov: repo started. Stranger picked. Kane CLI 0.10.4 installed, not logged in yet (needs the user's TestMu AI account).
- 16 Nov evening: Duebook demo app, migration and seed script written (no Supabase project yet). Stranger CLI, skill and Stop hook written and tested against a stand-in Kane; not yet run against real Kane. Next: Kane login, Supabase project, first real red run.

## How this entry is judged (short)
Three gates, then four equal scores (Ships, Verified, Closed loop, Craft). Full detail in `HACKATHON.md`.
- The app works end to end at a live URL or with one command.
- Kane CLI caught or proved something meaningful, not one trivial flow added at the end.
- The agent and Kane talk to each other: Kane runs, the result goes back to the agent, the agent fixes, Kane runs again.

## Rules for working here
- **Run Kane on every change a judge would see.** Read the `run_end` line, fix, re-run. Never skip the loop to save time: it is a gate and a quarter of the score.
- **Keep the evidence.** Red runs count as much as green ones. Save each run's `run_end` line and `test_url` (location to be decided once the stack exists).
- **Commit small and often** with plain messages that say what changed and what Kane found. Judges read the history to check the work was done during the event. Never squash, rebase away or rewrite history.
- **Mind the credits.** 10,000 free credits for one month. Keep objectives narrow and use `--timeout`. Check `credits_consumed` on runs.
- **Judges must get in.** No sign-up wall on the live app. If something needs a login, put working judge credentials in the README. If it depends on a third-party service, keep a fallback (a recorded run or a backup deploy).
- **Secrets stay out of git.** Kane credentials live in `~/.testmuai/`; app keys go in `.env` (ignored). Commit only `.env.example`.

## House style
- No em dashes anywhere: docs, UI text, code comments, commit messages.
- No `Co-Authored-By: Claude` or other AI self-attribution in commits or PRs.
- Plain words and short sentences in the README and UI.

## Kane CLI quick reference
Verify these after install; details in `HACKATHON.md`.
- Install and log in: `npm install -g @testmuai/kane-cli`, `kane-cli login`, `kane-cli whoami`
- Agent run: `kane-cli run "<what to check, in plain English>" --url <url> --agent --headless`
- stdout is NDJSON; the last line is `run_end` with `status`, `one_liner`, `reason`, `test_url`, `credits_consumed`, `result_code`.
- Exit codes: 0 passed, 1 failed, 2 did not start (no credits used), 3 cancelled or timed out.
- Evidence pack: `kane-cli evidence serve <path-to-pack>`
- Objectives must not need user prompts (`ask_user` is off without a TTY).

## Layout
- `demo/`: Duebook, the deliberately leaky invoicing app Stranger is shown on (Vite + React + Supabase). The leak is on purpose. Never fix it by hand: fixes happen only through the Stranger loop, so the history shows Kane finding it and the agent fixing it.
- `supabase/migrations/`: database schema and policies, applied in order. A data-leak fix is always a new migration here, never a client-side filter.
- `scripts/`: apply migrations and seed demo users and invoices (needs `.env`).
- `stranger/`: the Stranger CLI that drives Kane.
- `site/`: the landing page judges see.
- `.claude/`: the Stranger skill and the opt-in Stop hook (the closed loop).

## Stack and commands
- Node 24, npm. Secrets in `.env` at the repo root (copy `.env.example`); load with `node --env-file=.env`.
- Demo app: `cd demo && npm install && npm run dev`
- Database: `npm run db:apply` (all migrations), `npm run db:seed` (demo users and invoices)
- Stranger: `npm run stranger` (add `-- --json` for one machine-readable line, `-- --headed` to watch the browser). Exit 0 CLEAN, 1 LEAK, 2 INCONCLUSIVE, 3 setup error. Config: `stranger.config.json` (values like `$OWNER_PASSWORD` come from `.env`).
- Each run writes `.stranger/report.md`, appends `.stranger/history.jsonl` (tracked as proof), and on a LEAK writes `.stranger/FIX.md` for the agent. Raw Kane NDJSON per run sits in `.stranger/runs/` (ignored).
- The loop: the `stranger` skill (`.claude/skills/stranger/`) tells the agent how to act on a verdict. `touch .stranger/armed` arms the Stop hook in `.claude/settings.json`: after watched files change, the agent can't finish until Stranger says CLEAN. `rm .stranger/armed` disarms it. Keep it disarmed while building Stranger itself, or every stop costs two Kane runs.
- Testing Stranger without Kane credits: point `KANE_CLI_BIN` at a stand-in that prints Kane's agent-mode NDJSON.
