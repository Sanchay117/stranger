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
| PennyFlow as shipped | Pending | The local sign-in page and Supabase auth gateway responded. The shipped migration enables RLS and defines owner-only policies. A two-account Kane run is pending. | 0 | N/A | None |
| PennyFlow with a local access-control regression | Pending | No run recorded. | 0 | N/A | None |
| External-app SQL fix and fresh-canary rerun | Pending | Notely produced a fix brief. An agent-applied migration and a fresh CLEAN result have yet to be recorded. | 0 | N/A | None |

Kane time is the sum of the two CLI run durations recorded by Stranger. The four Notely runs used **235.54 credits**. The CLEAN Notely run predates direct table coverage. Its result covers the browser and server reads checked in that run.

The Notely replay pages and screenshots are committed in `demo/public/runs/`. The Vercel links use their intended public URLs and returned 404 when checked on 24 November 2026.

## What field testing caught in Stranger itself

1. Notely loaded data through server functions, so the browser trace did not contain a direct Supabase table read. Stranger now identifies the Supabase project from sign-in traffic and can check the canary's table directly. This caught the local regression even with owner filtering in Notely's server code. [4e20df9](https://github.com/Sanchay117/stranger/commit/4e20df9307a4ef4d9065ff613cb6f247b64009e7)
2. The earlier fix brief could suggest replacing a policy when the database had RLS switched off and the existing policy was already correct. Stranger now checks the live RLS flag, can load `pg` from either the app or Stranger, and falls back to `psql`. The brief for `106ece` identified the one-line change to enable RLS again. [df8770a](https://github.com/Sanchay117/stranger/commit/df8770a1cd4835f82d6e74aaa9ee93b2c374a272)

PennyFlow's migration enables RLS for both `transactions` and `categories`. Each table restricts reads, inserts, updates, and deletes to signed-in users who own the affected rows. This was a source review. The local shell could not reach the running services, so the deployed policies and the two test logins remain unverified.

## External-app fix evidence

Notely run `106ece` gives us the LEAK and the generated SQL repair brief. The as-shipped CLEAN result `115d8f` came earlier. The closed loop needs a later CLEAN run after an agent applies the fix and Stranger plants a fresh canary. [LEAK replay](https://stranger-2yf3.vercel.app/runs/106ece/) · [Report](notely/report.md) · [FIX.md](notely/FIX.md)
