# Stranger field tests

We used local checkouts of two third-party apps with a throwaway local Supabase stack and synthetic test data. We never tested either app's hosted production deployment. The Notely leaks below came from changes made to our local test setup.

- **Notely** is a Lovable notes app built with TanStack Start and Supabase. It signs in from the browser and loads notes through server functions. [Source repository](https://github.com/vamshicreates/thought-journal-box)
- **PennyFlow** is a personal finance tracker built with Vite, React, TypeScript, Tailwind CSS, shadcn/ui, and Supabase. Its browser reads transactions and categories directly from Supabase. [Source repository](https://github.com/fragan7dsouza/PennyFlow-Personal-Finance-Tracker)

## Results

| App and setup | Stranger verdict | What the check showed | Kane credits | Kane time | Saved run |
| --- | --- | --- | ---: | ---: | --- |
| Notely as shipped | CLEAN | The second account saw its own control note. Kane and the server read replay found no owner canary. | 49.53 | 3m 23s | [115d8f](https://stranger-2yf3.vercel.app/runs/115d8f/) |
| Notely with row-level security (RLS) off on `notes`, original Stranger | LEAK | Kane saw the owner's note on the second account's page. The app's server response also contained it. | 67.85 | 3m 53s | [e7ff8f](https://stranger-2yf3.vercel.app/runs/e7ff8f/) |
| Notely with RLS off, after the direct-read change | LEAK | Kane saw the owner's note. The database checks also confirmed unauthorized reads, edits, deletes, and insertion under another owner. | 59.46 | 3m 46s | [a9bd3f](https://stranger-2yf3.vercel.app/runs/a9bd3f/) |
| Notely with server-side owner filtering and RLS still off | LEAK | Kane's page check and the app's server replay missed the owner's note. Stranger's direct Supabase check found it and the fix brief identified disabled RLS. | 58.70 | 3m 40s | [106ece](https://stranger-2yf3.vercel.app/runs/106ece/) |
| PennyFlow as shipped | CLEAN | The second account saw its own control transaction and none of the owner's. Replays as the stranger and with no login, tamper, forged owner and live updates were all blocked. | 79.35 | 4m 53s | [3555e0](https://stranger-2yf3.vercel.app/runs/3555e0/) |
| PennyFlow with RLS off on `transactions` (local regression) | LEAK | Kane saw the owner's transaction on the second account's page. The API returned it with no login (5 rows), and the stranger could edit, delete and forge the owner's rows. The fix brief named RLS turned off by hand and the one-line fix. | 102.56 | 6m 8s | [56eb00](https://stranger-2yf3.vercel.app/runs/56eb00/) |
| PennyFlow after the agent's migration, fresh canary | CLEAN | A fresh headless Claude Code agent got only the fix brief and wrote [`agent-migration.sql`](pennyflow/agent-migration.sql). With it applied, every check from the LEAK run passed again. | 85.99 | 5m 35s | [10dfea](https://stranger-2yf3.vercel.app/runs/10dfea/) |

Kane time is the sum of the two CLI run durations recorded by Stranger. The four Notely runs used **235.54 credits** and the three PennyFlow runs **267.90**. The CLEAN Notely run predates direct table coverage. Its result covers the browser and server reads checked in that run.

The Notely replay pages and screenshots are committed in `demo/public/runs/`. The Vercel links use their intended public URLs and returned 404 when checked on 24 November 2026.

## What field testing caught in Stranger itself

1. Notely loaded data through server functions, so the browser trace did not contain a direct Supabase table read. Stranger now identifies the Supabase project from sign-in traffic and can check the canary's table directly. This caught the local regression even with owner filtering in Notely's server code. [4e20df9](https://github.com/Sanchay117/stranger/commit/4e20df9307a4ef4d9065ff613cb6f247b64009e7)
2. The earlier fix brief could suggest replacing a policy when the database had RLS switched off and the existing policy was already correct. Stranger now checks the live RLS flag, can load `pg` from either the app or Stranger, and falls back to `psql`. The brief for `106ece` identified the one-line change to enable RLS again. [df8770a](https://github.com/Sanchay117/stranger/commit/df8770a1cd4835f82d6e74aaa9ee93b2c374a272)

PennyFlow's migration enables RLS for both `transactions` and `categories`, and each table limits reads, inserts, updates and deletes to the row's owner. On 24 November we ran it locally on port 5301 against the throwaway Supabase stack with two synthetic accounts, and the Kane runs above confirmed those policies hold as shipped.

## External-app fix evidence

PennyFlow closes the loop on an app we didn't write, with no human writing the fix:

1. As shipped: CLEAN [`3555e0`](https://stranger-2yf3.vercel.app/runs/3555e0/).
2. RLS turned off on `transactions` in our local database: LEAK [`56eb00`](https://stranger-2yf3.vercel.app/runs/56eb00/), with a [report](pennyflow/report.md) and a [fix brief](pennyflow/FIX.md) naming the one-line fix.
3. A fresh Claude Code agent (`claude -p`, headless, 37 cents) got only that brief and wrote a new migration, [`agent-migration.sql`](pennyflow/agent-migration.sql). In its words: it "turns Row Level Security back on" because "the per-user policies already on that table weren't being applied". We applied it to the local database.
4. Stranger ran again with a fresh canary: CLEAN [`10dfea`](https://stranger-2yf3.vercel.app/runs/10dfea/).

Notely run `106ece` also produced a LEAK and a fix brief. Its CLEAN `115d8f` came before the regression, so it is not a closed loop. [LEAK replay](https://stranger-2yf3.vercel.app/runs/106ece/) · [Report](notely/report.md) · [FIX.md](notely/FIX.md)

`pennyflow/run-local.mjs` is the runner we used. It refuses any database or API that is not the local Supabase stack.
