# Stranger

**You only ever test your app as yourself. Stranger tests it as someone else.**

Stranger uses [Kane CLI](https://www.npmjs.com/package/@testmuai/kane-cli) to sign in to your app as one user, hide a random word in their data, then sign in as a *different* user and look for it. If the second user can see it, your app leaks people's data to each other. Your coding agent gets a fix brief, fixes the database, and Stranger checks again until it is clean.

Built for the Kane CLI Online Hackathon (TestMu AI).

- **Live page:** https://stranger-2yf3.vercel.app
- **See the leak yourself (one click, no sign-up):** https://stranger-2yf3.vercel.app/duebook/?as=stranger

## Why

AI app builders often ship a database rule that lets every account read every row. The app looks fine, because the person building it only ever logs in as themselves. You need a second account to notice, and nobody tests with one.

## How it works

1. **The owner plants a canary.** Kane signs in as your first test account and saves a random string, like `stranger-canary-afb57e`, into a record.
2. **A stranger looks for it.** Kane signs in as a second account. It saves its own control string and checks it can see that, so an empty or broken page can never pass. Then it checks the owner's canary is nowhere on the page.
3. **Verdict.**
   - **LEAK**: the stranger saw the canary on the page, or the server sent it to them (see step 4), so a page that hides the data still fails.
   - **CLEAN**: the stranger saw their own data and none of the owner's.
   - **INCONCLUSIVE**: Kane could not finish (login failed, a wrong hint in the config, no credits). Never treated as clean.

4. **What the server really sends.** Kane logs every request the stranger's browser made, but not the answers. So right after Kane finishes, Stranger sends the stranger's own data requests again (GET only, nothing changes) and looks for the canary in the answer. Then it sends them once more **with no login at all**, which catches data that anyone on the internet can read.

Every run uses a fresh canary, so old data can't fake a pass.

## Try it in 30 seconds

Duebook is a small invoicing app we built with the leak left in **on purpose**, so Stranger has something to catch.

- [Open Duebook as a stranger](https://stranger-2yf3.vercel.app/duebook/?as=stranger): you will see Maya's invoices, her clients, and the bank account in her notes.
- [Open Duebook as Maya](https://stranger-2yf3.vercel.app/duebook/?as=owner), the owner, to compare.

It is worse than it looks: Stranger's replay found that Duebook's API returns every invoice even **with no login at all**, to anyone who has the site's public key (run `cf7845`).

The demo accounts are public on purpose. Please don't type real details into Duebook.

## Proof: the loop really closed

On branch [`agent-loop`](https://github.com/Sanchay117/stranger/tree/agent-loop), a fresh Claude Code agent with the Stranger hook armed was asked only to add a search box. It was never told about the leak.

| Step | What happened |
| --- | --- |
| Agent adds the search box and tries to stop | The hook runs Stranger on the live Duebook: **LEAK** `f5b2cc` ([Kane run](https://test-manager.lambdatest.com/projects/01M7J50DR7X78CBZ60F58CF03Y/test-cases/01M7JBVNX0WRHTEJF9MXTP1E39/dashboard/share/US_4UGM76WIWN73PFNGZ2X23WBXQTDH8PYUZ8CW2D2AJ3E0CIXFCJHBNVUB34ZUDGL4?type=summary&agentView=true&fqdn=summary-page)) |
| Agent reads `.stranger/FIX.md` | Writes [`0002_invoices_owner_read.sql`](https://github.com/Sanchay117/stranger/blob/agent-loop/supabase/migrations/0002_invoices_owner_read.sql), applies it, commits `59c1942` |
| Agent tries to stop again | The hook re-runs Stranger with a new canary: **CLEAN** `c789a7` ([Kane run](https://test-manager.lambdatest.com/projects/01M7J50DR7X78CBZ60F58CF03Y/test-cases/01M7JC8WCN8W9WJMZ716MDTQPE/dashboard/share/US_LQHHOX2UJNLEXWU8GC96XO8BVWJSI0PA1N12I4DL8J26G5X2909QXM8HTV8ZKK8S?type=summary&agentView=true&fqdn=summary-page)) |

After that, `npm run demo:reset` put the live leak back, so you can still see it. `main` stays leaky on purpose; the fix lives on its branch as proof. Every real run is logged in [`.stranger/history.jsonl`](.stranger/history.jsonl) with its Kane link. Kane's share links open without a TestMu login.

## Use it on your own app

You need Node 20.12 or newer, Kane CLI, and **two test accounts on your app that you own**.

```bash
npm install -g @testmuai/kane-cli
kane-cli login
```

```bash
npx --yes github:Sanchay117/stranger init
```

That writes `stranger.config.json`. Put the two accounts in `.env` (keep it out of git):

```bash
OWNER_EMAIL=you+owner@example.com
OWNER_PASSWORD=...
STRANGER_EMAIL=you+stranger@example.com
STRANGER_PASSWORD=...
```

Then run it:

```bash
npx --yes github:Sanchay117/stranger run
```

A check takes about 4 minutes and about 50 Kane credits (two Kane runs).

### The config

| Field | What it is |
| --- | --- |
| `url` | Where your app lives. `$NAME` values come from `.env`. |
| `owner`, `stranger` | The two test accounts. |
| `plant` | In plain English: how to create a record and where to type the canary. Example: `click New invoice and type the text into the Note field`. |
| `look` | Where a user sees their own records. Example: `the Your invoices list`. |
| `probes` | Optional. A list of `{ "name", "plant", "look" }`, one per kind of private record (invoices, notes, messages). Each probe costs two Kane runs. If any probe leaks, the check is LEAK. |
| `database` | `supabase`, `firebase` or `unknown`. Picks the fix advice. |
| `migrations` | Your migrations folder. For Supabase, the fix brief reads it and names the exact policy that lets everyone in. |
| `watch` | Folders the Claude Code hook watches for changes. |
| `timeout` | Seconds per Kane run (default 420). |

### What you get

- `.stranger/report.md`: what happened, with Kane's run links and every replayed request (with the stranger's login and with none) and what came back.
- `.stranger/FIX.md` (on a LEAK): a brief for your coding agent. For Supabase it lists the table's read policies from your migrations, marks the open one, and gives the exact SQL to replace it.
- `.stranger/history.jsonl`: one line per run, worth committing as proof.

Exit codes: `0` CLEAN, `1` LEAK, `2` INCONCLUSIVE, `3` setup error. Add `--json` for one machine-readable line, `--headed` to watch the browser.

## Let your coding agent fix it (Claude Code)

```bash
npx --yes github:Sanchay117/stranger install-claude
touch .stranger/armed
```

This adds a Stranger skill and a Stop hook. While `.stranger/armed` exists and watched files changed, the agent can't finish until Stranger says CLEAN. On a LEAK the hook hands it the fix brief. It lets go after 3 failed checks, or after 2 reminders where the agent changed nothing (for example when it explains why it shouldn't touch the database), so it never traps the agent. `rm .stranger/armed` turns it off.

## What it does not check

Be honest about the edges:

- It checks **reading** only: not whether a stranger can edit or delete someone else's records.
- It sees only what the probes visit. A leaking table with no probe is not caught.
- It needs a canary it can type. Leaks through totals, counts or files are not caught yet.
- The replay sends only the data requests the stranger's page made, with the login token Kane captured. It runs right after Kane, while that token is still valid; it never sends anything that changes data, and it never writes the token down.
- The fix brief reads your migrations, not the live database. Policies added by hand in the dashboard are not listed.

## Develop

```bash
npm test
```

Runs Stranger end to end against a stand-in Kane (`stranger/test/fake-kane.js`): page leaks, leaks only the server shows (found by replaying requests against a stand-in API), logged-out leaks, clean runs, inconclusive runs, several probes and the Stop hook. No Kane credits.

```bash
cd demo && npm install && npm run dev
```

The product page at `/` and Duebook at `/duebook/`, on port 5231. Duebook needs a Supabase project: copy `.env.example` to `.env`, then `npm run db:apply` and `npm run db:seed`.

| Folder | What is in it |
| --- | --- |
| `stranger/` | The CLI, the Claude Code skill and Stop hook, and tests. No runtime dependencies. |
| `demo/` | The product page and Duebook (React + Supabase). |
| `supabase/migrations/` | Duebook's schema, including the leaky read policy. |
| `scripts/` | Apply migrations, seed demo data, reset the live leak, export a run for the page. |

## License

MIT
