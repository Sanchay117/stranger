# Stranger: LEAK

The stranger's pages looked clean, but a read from the owner's page, sent with the stranger's login, returns the owner's canary from https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_view_list. With no login at all, the API returns it too.

- App: http://localhost:5231/bench/?case=leaky_view
- Owner: maya@duebook.demo planted `stranger-canary-e4b354`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-e4b354`)
- When: 2026-11-19T16:12:23.963Z

## Coverage
0 of 10 user-data tables were read during this check.
Not checked: `bench_rls_off`, `bench_client_filter`, `bench_leaky_rpc`, `bench_detail_page`, `bench_leaky_view`, `bench_forged_insert`, `bench_leaky_total`, `bench_storage_leak`, `bench_broadcast_leak`, `bench_all_good`. Add a probe whose `plant` and `look` reach them.

## Kane runs
- Owner plants the canary: **passed** in 187s, 23.592677499999997 credits
  - Kane: created and saved a new note on the notes page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T99D2FGYRP9N2TM02NX3PR/dashboard/share/US_OAY51RW8XZAYS8BVZIGNHLOV0GC85NN4MXVL9KAYUZTO8E9V3VBRFJSO8ER36J2I?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/884bb2aa-a885-4697-bad8-48d1f0850df2`
- Stranger looks for it: **passed** in 154s, 23.150435499999997 credits
  - Kane: created a new note on the notes site
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T9F3B0DYMDMHNXJ8VVABYB/dashboard/share/US_CBF88BEURZGV1SM8HH2J2RCC27GYM960AD3E1BUPR0DWWB9VBHRATMNC0S8QCL9J?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/ac8fa56e-3c12-4570-95ac-4f2d45b47da0`

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.

- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_view_list (owner's page) -> 200, **owner's canary in the response**
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_view_list (owner's page) -> 200, **owner's canary in the response**
- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_view_list (stranger's page) -> 200
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_view_list (stranger's page) -> 200

## Numeric canary
Not run: the owner could not add a second row (403).

## Tamper check
The stranger tried to change, then delete, the owner's canary row in `bench_leaky_view_list`, and the owner read it back after each try.

- Change `body`: blocked, the row is as the owner left it (HTTP 403)
- Delete: blocked, the row is still there (HTTP 403)

## Forged owner
Signed in as the stranger, Stranger tried to add a row to `bench_leaky_view_list` that names the owner in `user_id` (HTTP 403).

- Refused: no such row was stored.

## Live updates
Not run: the owner could not add a row to listen for (403).

## Blast radius
Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.

- `bench_leaky_view_list`: stranger reads 1 row from 1 other account. With no login: 1 row. Returned sensitive columns: `amount_cents`.

## Where the canary showed up
- https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_view_list, the owner's page read, sent again with the stranger's login: …stranger-canary-e4b354…
- https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_view_list, the owner's page read, sent again with no login: …stranger-canary-e4b354…
