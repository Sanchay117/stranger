# Stranger: LEAK

Listening to the app's live updates, the stranger received the owner's new row the moment it was saved (broadcast on `bench_broadcast_leak:{owner}`). (Page check: CLEAN.)

- App: http://localhost:5231/bench/?case=broadcast_leak
- Owner: maya@duebook.demo planted `stranger-canary-ba95e5`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-ba95e5`)
- When: 2026-11-19T16:33:54.608Z

## Coverage
1 of 10 user-data tables were read during this check (`bench_broadcast_leak`).
Not checked: `bench_rls_off`, `bench_client_filter`, `bench_leaky_rpc`, `bench_detail_page`, `bench_leaky_view`, `bench_forged_insert`, `bench_leaky_total`, `bench_storage_leak`, `bench_all_good`. Add a probe whose `plant` and `look` reach them.

## Kane runs
- Owner plants the canary: **passed** in 98s, 22.261785 credits
  - Kane: created and saved a new note on the notes page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TAGRN0XB730P3BRVX9DDRV/dashboard/share/US_Q4HNU22WQ9KZ13GRZRF01MJFGDV10NZQC718Z3IJR5CVMZRJGWHZMLJBNY74FF2K?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/eb17a746-812e-4523-97c3-2719bf7830f3`
- Stranger looks for it: **passed** in 103s, 23.426935 credits
  - Kane: created a new note and opened the notes list on the local notes site
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TAKR079PYZ3VK5V243BEZK/dashboard/share/US_WOB2MN6YHU91JFCV8TTFC19EYU5DV3UE1B52U2ZFK67TZIPX6Z4ITFPPR8GEO932?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/9507180d-9f24-4a94-8d00-62ab4ff9f20a`

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.

- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_broadcast_leak (both pages) -> 200
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_broadcast_leak (both pages) -> 200

## Numeric canary
The owner added a second row with 7331 in `amount_cents`, then Stranger read the stranger's data again (1 of 1 reads were stable enough to compare). The row was removed afterwards.

- Nothing the stranger reads changed. Totals and counts don't depend on the owner's data.

## Tamper check
The stranger tried to change, then delete, the owner's canary row in `bench_broadcast_leak`, and the owner read it back after each try.

- Change `body`: blocked, the row is as the owner left it (HTTP 204)
- Delete: blocked, the row is still there (HTTP 204)

## Forged owner
Signed in as the stranger, Stranger tried to add a row to `bench_broadcast_leak` that names the owner in `user_id` (HTTP 403).

- Refused: no such row was stored.

## Live updates
The stranger opened the app's realtime connection and listened for database changes on `bench_broadcast_leak` and on 4 likely channels (`bench_broadcast_leak:{owner}`, `user:{owner}`, `{owner}`, `bench_broadcast_leak`). Then the owner added a row.

- Joined: `database changes on bench_broadcast_leak`, `bench_broadcast_leak:{owner}`, `user:{owner}`, `{owner}`, `bench_broadcast_leak`
- **Heard the owner's row:** broadcast on `bench_broadcast_leak:{owner}`
- Row deleted afterwards: yes

## Blast radius
Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.

- `bench_broadcast_leak`: stranger reads none. With no login: none.
