# CLAUDE.md

Entry for the Kane CLI Online Hackathon (TestMu AI): build a working web app with an AI coding agent, verify it with Kane CLI, ship it.

**Deadline: Thu 19 Nov 2026, 11:59 PM IST. No pushes after it.**

## Read first
- `HACKATHON.md` (local only, gitignored): event facts, judging, must-do list, timeline, the chosen idea. Check every decision against it and update it as things change.
- Keep this file current. When the stack, commands, Kane loop or status change, update the matching section here in the same change.

## Status
- 16 Nov: repo started. Idea not chosen. Kane CLI not installed or logged in yet.

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

## Stack and commands
To fill in once the idea is picked: install, dev server, tests, deploy, and the command that runs the Kane loop.
