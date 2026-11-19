# Stranger: LEAK

When only the owner added a row (odd number amount_cents = 7331), 1 of the stranger's reads changed: https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_total_sum. The stranger's data depends on the owner's. (Page check: CLEAN.)

- App: http://localhost:5231/bench/?case=leaky_total
- Owner: maya@duebook.demo planted `stranger-canary-83c7f2`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-83c7f2`)
- When: 2026-11-19T16:26:03.690Z

## Coverage
1 of 10 user-data tables were read during this check (`bench_leaky_total`).
Not checked: `bench_rls_off`, `bench_client_filter`, `bench_leaky_rpc`, `bench_detail_page`, `bench_leaky_view`, `bench_forged_insert`, `bench_storage_leak`, `bench_broadcast_leak`, `bench_all_good`. Add a probe whose `plant` and `look` reach them.

## Kane runs
- Owner plants the canary: **passed** in 114s, 27.263257499999998 credits
  - Kane: created and saved a note on the notes page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TA2D8J7AZJGVGXSKDT01MM/dashboard/share/US_N5OI9ZVVL4BR3LR8GV5WQED51Q8GQ8FLUPGEBG3M9MHMKY3X24PTTH4Y988J8EI5?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/c9746fd2-2dd0-40e2-a421-61454249f1b1`
- Stranger looks for it: **passed** in 123s, 30.66551 credits
  - Kane: opened the Your notes list on the notes page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TA5VKTDN0KBXGMWVTQ0MAT/dashboard/share/US_ZQHUQ9UDC60XJ3TC5V4IGOZW6EKCCQO5SMAZYTYBOVKLYLA927ZLFVQJ3QRJBO0O?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/58c1e4a1-59f4-4a4f-9829-ef778dc7263d`

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.

- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_total (both pages) -> 200
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_total (both pages) -> 200
- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_total_sum (both pages) -> 200
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_total_sum (both pages) -> 200

## Numeric canary
The owner added a second row with 7331 in `amount_cents`, then Stranger read the stranger's data again (2 of 2 reads were stable enough to compare). The row was removed afterwards.

- **Changed:** GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_total_sum (a count or total moved)

## Tamper check
The stranger tried to change, then delete, the owner's canary row in `bench_leaky_total`, and the owner read it back after each try.

- Change `body`: blocked, the row is as the owner left it (HTTP 204)
- Delete: blocked, the row is still there (HTTP 204)

## Forged owner
Signed in as the stranger, Stranger tried to add a row to `bench_leaky_total` that names the owner in `user_id` (HTTP 403).

- Refused: no such row was stored.

## Live updates
The stranger opened the app's realtime connection and listened for database changes on `bench_leaky_total` and on 4 likely channels (`bench_leaky_total:{owner}`, `user:{owner}`, `{owner}`, `bench_leaky_total`). Then the owner added a row.

- Joined: `database changes on bench_leaky_total`, `bench_leaky_total:{owner}`, `user:{owner}`, `{owner}`, `bench_leaky_total`
- Heard nothing of the owner's row.
- Row deleted afterwards: yes

## Blast radius
Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.

- `bench_leaky_total`: stranger reads none. With no login: none.
- `bench_leaky_total_sum`: stranger reads 1 row returned, ownership unknown. With no login: 1 row. Returned sensitive columns: `notes`, `total_cents`.
