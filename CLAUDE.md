# CLAUDE.md

Entry for the Kane CLI Online Hackathon (TestMu AI): build a working web app with an AI coding agent, verify it with Kane CLI, ship it.

**The project: Stranger.** "You only ever test your app as yourself. Stranger tests it as someone else." Kane signs in as the owner and plants a random canary, then signs in as a second user and looks for it. If the stranger can see it, the app leaks other users' data. The coding agent fixes it at the database and Stranger runs again until it is clean.

**Deadline: Thu 19 Nov 2026, 11:59 PM IST. No pushes after it.**

## Read first
- `HACKATHON.md` (local only, gitignored): event facts, judging, must-do list, timeline, the chosen idea. Check every decision against it and update it as things change.
- Keep this file current. When the stack, commands, Kane loop or status change, update the matching section here in the same change.

## Status
- 16 Nov: repo started. Stranger picked. Kane CLI 0.10.4 installed, not logged in yet (needs the user's TestMu AI account).
- 16 Nov evening: Duebook demo app, migration and seed script written. Stranger CLI, skill and Stop hook written and tested against a stand-in Kane.
- 16 Nov 18:30: Supabase project live (Tokyo, IPv4 pooler URL), migration applied, demo data seeded. Two real Stranger runs against local Duebook both said LEAK. A full check takes about 4 minutes and 50 credits (10,986 credits left). Kane's share links (`test_url`) open without a TestMu login. 
- 16 Nov night: repo public at github.com/Sanchay117/stranger, Vercel deploy at stranger-2yf3.vercel.app (Duebook only so far). Built the Stranger product page (served at `/`, Duebook moved to `/duebook/`): the hero replays the real LEAK run afb57e and links to the live leak. The repo root is now the CLI package, so `npx github:Sanchay117/stranger run` works; `stranger install-claude` adds the skill and hook to any project. Pushed (9d694fe): live page, live `/duebook/?as=stranger` leak and npx from GitHub all checked. Every push to main redeploys Vercel within a minute.
- 16 Nov 19:50 IST: first closed loop, on branch `agent-loop` (worktree `../kane-loop`, its own `.env` pointing Stranger at the live Duebook). A fresh Claude Code agent (`claude -p`, hook armed) was asked only for a client search box. When it stopped, the hook ran Stranger against the live site: LEAK f5b2cc. The agent first refused to touch the shared database without the user's go-ahead, and the hook kept blocking that honest answer (fixed on main in f407d31). Resumed with the go-ahead, it wrote `0002_invoices_owner_read.sql`, applied it and committed (59c1942); the hook's re-run said CLEAN c789a7. Then `npm run demo:reset` put the live leak back. About 104 Kane credits. Agent transcripts are in `../kane-loop/.stranger/runs/agent-loop*.jsonl` (ignored). Next: push the branch and open its PR (not merged: main stays leaky), README, show the loop on the page, judge test, video, launch posts.

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

Learned from real runs (16 Nov, Kane 0.10.4):
- Works against `http://localhost:5231`. A login-and-check run took 75 s and about 19 credits.
- Step lines are `{step, status: running|done, remark}`; remarks start with the action (`navigate:`, `type:`, `analyze:`, `assert:`). Variables show as `{{global.email}}` in remarks, never their values, so anything Stranger must match in remarks goes into the objective as literal text.
- `run_end` adds `result_code` (100 = success), `reason_code`, `summary`, `final_state`, `per_flow_metadata`, and a shareable `test_url`.
- The evidence pack (`<session_dir>/evidence/*.evidence`, a zip) holds `logs/0-network.har` with response bodies for API calls, plus per-step screenshots.
- **Kane writes `.testmuai/tests/<name>_test.md` into its working folder with variable values, secrets included, in plain text.** Never run Kane from the repo root; Stranger runs it inside `.stranger/runs/<run>/`. `.testmuai/` is gitignored.

## Layout
- `demo/`: one Vite build (Vercel's root directory) with two pages.
  - `index.html` + `site/`: the Stranger product page judges land on, at `/`. Hero = composer + replay of a real Kane run (`site/replay-<id>.json`, made by `scripts/export-replay.mjs`). Proof screenshot in `public/proof/`. Built with the product-led-site skill: tokens in `site/site.css`, blob shader colours in `site/main.js`; keep glass only over the blob, keep it to three sections. Any demo content must say it is a replay.
  - `duebook/index.html` + `src/`: Duebook, the deliberately leaky invoicing app Stranger is shown on (React + Supabase), at `/duebook/`. The leak is on purpose. Never fix it by hand: fixes happen only through the Stranger loop, so the history shows Kane finding it and the agent fixing it.
    - Fix loops run on a branch in their own worktree. While `.stranger/armed` exists you are in one: fixing the leak with a new migration, applying it with `npm run db:apply` and committing it is expected, even though it closes the live leak for a while. Never run `demo:reset` yourself. Afterwards someone runs `npm run demo:reset` from `main`, which puts the live leak back and forgets the branch's migration. The fix stays on its branch (and its PR) as proof; `main` stays leaky.
  - No sign-up, ever: judges get one-click logins ("Open as Maya, the owner" / "Open as a stranger", or `/duebook/?as=stranger`). The demo account emails and passwords are public on purpose (Vite `envPrefix` exposes `OWNER_*` and `STRANGER_*`); service and database secrets must never get one of those prefixes.
- `supabase/migrations/`: database schema and policies, applied in order. A data-leak fix is always a new migration here, never a client-side filter.
- `scripts/`: apply migrations, seed demo users and invoices (needs `.env`), export a run as the page's replay.
- `stranger/`: the Stranger CLI that drives Kane. The repo root `package.json` is its package (`bin`, `files`), so `npx github:Sanchay117/stranger <command>` installs only `stranger/`. Keep runtime code dependency-free; `pg` and `supabase-js` are devDependencies for `scripts/`.
- `.claude/`: the Stranger skill and the opt-in Stop hook for this repo (the closed loop). `stranger install-claude` copies the same pair into another project (`.claude/hooks/stranger-stop.js`, which falls back to npx).

## Stack and commands
- Node 24, npm. Secrets in `.env` at the repo root (copy `.env.example`); load with `node --env-file=.env`.
- Site and demo app: `cd demo && npm install && npm run dev` (port 5231 in `.claude/launch.json` one level up: `/` is the Stranger page, `/duebook/` is Duebook). `npm run build` must produce both `dist/index.html` and `dist/duebook/index.html`.
- New replay for the page after a real run: `node scripts/export-replay.mjs <run id>`, then point the import in `demo/site/main.js` at it.
- Database: `npm run db:apply` (all migrations), `npm run db:seed` (demo users and invoices)
- Stranger: `npm run stranger` (add `-- --json` for one machine-readable line, `-- --headed` to watch the browser). Exit 0 CLEAN, 1 LEAK, 2 INCONCLUSIVE, 3 setup error. Config: `stranger.config.json` (values like `$OWNER_PASSWORD` come from `.env`).
- Each run writes `.stranger/report.md`, appends `.stranger/history.jsonl` (tracked as proof), and on a LEAK writes `.stranger/FIX.md` for the agent. Raw Kane NDJSON per run sits in `.stranger/runs/` (ignored). Every command adds the run folders and `.testmuai/` to `.gitignore` in any git repo it runs in, because Kane writes the test passwords there.
- Other commands: `stranger init` (starter config), `stranger install-claude` (skill + Stop hook into `.claude/`). Check the package before pushing: `npm pack --dry-run` should list only `stranger/` files.
- The loop: the `stranger` skill (`.claude/skills/stranger/`) tells the agent how to act on a verdict. `touch .stranger/armed` arms the Stop hook in `.claude/settings.json`: after watched files change, the agent can't finish until Stranger says CLEAN. `rm .stranger/armed` disarms it. Keep it disarmed while building Stranger itself, or every stop costs two Kane runs.
- Testing Stranger without Kane credits: point `KANE_CLI_BIN` at a stand-in that prints Kane's agent-mode NDJSON.
