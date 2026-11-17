---
name: stranger
description: Check whether one user of this app can see another user's data, using Stranger and Kane CLI, then fix any leak at the database and re-check until clean. Use after changing database policies, auth, or code that loads user data; before calling a feature that touches user data done; and whenever the user asks about data leaks, RLS, row level security, or multi-user security.
---

# Stranger

Stranger signs in to the app as the owner and plants a random canary, then signs in as a second account and looks for it. Both are real browser runs by Kane CLI. If the second account can see the canary, the app leaks other users' data.

## Run it

From the repo root (needs `stranger.config.json`, a `.env` with the two test accounts, and `kane-cli login` done once):

```bash
npm run stranger -- --json
```

It takes a few minutes and prints one JSON line: `verdict`, `why`, `canary`, `report`, `fix`, and the Kane run links.

## Act on the verdict

- **CLEAN**: say so, with the canary id and the Kane run link. Do not claim more than this check covers.
- **LEAK**: read `.stranger/FIX.md` and `.stranger/report.md`. If the brief says **No login needed**, anyone on the internet can read the rows, so say that plainly to the user. Fix it where the data lives:
  - write a new migration (never edit an applied one) that limits the leaking table's SELECT policy to the owner, and check UPDATE and DELETE too. The brief names the open policy from the migrations when it can; with several probes it lists each leaking one, so fix every table it names;
  - apply it with the project's migration command;
  - run Stranger again. It plants a fresh canary every time. Repeat until CLEAN, at most three times, then stop and explain what you found.
- **TAMPER**: the stranger could change or delete the owner's row. FIX.md lists the UPDATE and DELETE policies; make them owner-only in a new migration, then re-run.
- **OVERLOCKED**: an account that should see the owner's rows (a teammate persona) can't, usually after a fix that went too far. Add the sharing rule FIX.md suggests rather than reopening the table.
- **INCONCLUSIVE**: Kane could not finish (login, a wrong `plant` or `look` hint in the config, out of credits). Read the report and fix the setup. Never treat it as clean.

## Never

- Never "fix" a leak by filtering rows in the page or client code. The data still reaches the browser.
- Never edit, skip or loosen the check, the canary, or `stranger.config.json` to get a CLEAN.
- Never say the work is done while the last verdict is LEAK, TAMPER or OVERLOCKED.
- When you add a table that holds user data, add a probe for it to `stranger.config.json` (the report's Coverage section lists tables no check reached).
- Never print the passwords in `.env`.

## Commit

Commit the fix on its own with a message that says what Stranger found and the canary id, for example: `Fix invoices read policy: stranger saw owner's canary 9eeb68`.

## Keep it honest automatically

`touch .stranger/armed` turns on the Stop hook (`stranger/hooks/claude-stop.js`): when watched files changed, the agent cannot finish until Stranger says CLEAN, and on a LEAK it gets the fix brief back. `rm .stranger/armed` turns it off.
