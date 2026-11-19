# Stranger bench

Ten small notes apps on one Supabase project. Each has one bug left in on purpose, a different way to leak or
tamper with another account's data, and one has none. Stranger runs on each with the real Kane CLI, the same
way it runs on any app: the owner plants a canary, a second account looks for it, then the API checks.

**Stranger caught 1 of 9 bugs.** 1 cases run, 86 Kane credits, against http://localhost:5231.

| Case | The bug | Expected | Stranger said | | Kane |
| --- | --- | --- | --- | --- | --- |
| [rls_off](cases/rls_off/.stranger/report.md) | The table never turns on row level security, so every account, and anyone with the public key, reads every row. | LEAK |  | not run |  |
| [client_filter](cases/client_filter/.stranger/report.md) | The page asks only for its own rows, but the read policy lets any signed-in account read all of them. | LEAK |  | not run |  |
| [leaky_view](cases/leaky_view/.stranger/report.md) | The table is locked down, but the page reads a view that runs with its creator's rights, so row level security never applies. | LEAK |  | not run |  |
| [leaky_rpc](cases/leaky_rpc/.stranger/report.md) | "My notes" comes from a security definer function that forgets to filter by the caller. The page hides the rest. | LEAK |  | not run |  |
| [detail_page](cases/detail_page/.stranger/report.md) | The list is scoped, but each note's own page loads it by id through a function that never checks who is asking. | LEAK | LEAK (direct-link) | caught | [run](https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T85EAGETJ9DG02M1F9XS7X/dashboard/share/US_WWDE90TAK0QDFE0RJ0XMQSJEL9QKC46A8Z6IEDGY20WJS55HMIEPLQLZD40O3JQE?type=summary&agentView=true&fqdn=summary-page) |
| [forged_insert](cases/forged_insert/.stranger/report.md) | Reads and edits are scoped, but the insert policy never checks the owner column, so anyone can add notes to someone else's account. | TAMPER |  | not run |  |
| [leaky_total](cases/leaky_total/.stranger/report.md) | Every policy is right, but the total on the page comes from a view that sums every account. No text leaks, only a number. | LEAK |  | not run |  |
| [storage_leak](cases/storage_leak/.stranger/report.md) | Each note is also saved as a file under the owner's folder, but the storage policy only checks the bucket. | LEAK |  | not run |  |
| [broadcast_leak](cases/broadcast_leak/.stranger/report.md) | New notes are broadcast on the public channel bench_broadcast_leak:<user id>. Anyone who joins it hears them. | LEAK |  | not run |  |
| [all_good](cases/all_good/.stranger/report.md) | Owner-only policies for every action, a private bucket scoped to the owner's folder, and a note page that reads through row level security. | CLEAN |  | not run |  |

Each case folder has the run's `report.md`, its `FIX.md` (the brief a coding agent gets) and `history.jsonl`.
The bugs are in [`migrations/`](migrations/), the app is [`demo/bench/`](../demo/bench/), live at `/bench/?case=<case>`.

## What Stranger does not catch

- A database function that may write (not marked stable or immutable) or that needs arguments Kane did not log: Stranger never calls it on its own. The detail_page case is caught through its page instead.
- Apps whose server reads the database with the service key (API routes, server actions): the page check and replays still run, but the forged owner, files and live-update checks speak Supabase only.
- Pages Kane never visits. Stranger checks what the owner's and the stranger's runs touch, and lists the user tables it did not reach.

## Run it

```bash
node --env-file=.env scripts/bench-apply.mjs          # create or reset the case tables (needs SUPABASE_DB_URL)
node --env-file=.env bench/run.mjs --url http://localhost:5231   # about 50 Kane credits a case
```
