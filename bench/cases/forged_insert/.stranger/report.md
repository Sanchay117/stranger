# Stranger: TAMPER

The stranger could create a row in `bench_forged_insert` that names the owner in `user_id`, so anyone can add records to someone else's account. (Page check: CLEAN.)

- App: http://localhost:5231/bench/?case=forged_insert
- Owner: maya@duebook.demo planted `stranger-canary-812289`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-812289`)
- When: 2026-11-19T16:22:14.922Z

## Coverage
1 of 10 user-data tables were read during this check (`bench_forged_insert`).
Not checked: `bench_rls_off`, `bench_client_filter`, `bench_leaky_rpc`, `bench_detail_page`, `bench_leaky_view`, `bench_leaky_total`, `bench_storage_leak`, `bench_broadcast_leak`, `bench_all_good`. Add a probe whose `plant` and `look` reach them.

## Kane runs
- Owner plants the canary: **passed** in 93s, 21.010634999999994 credits
  - Kane: created and saved a note on the notes page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T9VCM9YPYDBFMC5EPPKNRX/dashboard/share/US_5QVXIKREHO7ZS5VEINW43WS3J6IXZ6CN7P90WEANKH8GJBQ9D8F9DO3Y6AFFYJDD?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/d5326b28-e501-4ec4-9885-8325455270d3`
- Stranger looks for it: **passed** in 125s, 28.870392499999998 credits
  - Kane: created a new note on the notes site
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T9Y7YTA3NB34WCZXYQ3GKK/dashboard/share/US_A3MOZMA60CZZT7YR8ZILUQ9JFDI30JFZ0ND6W7LNMZ5TEFUL68ZJ52PANDTH0NC8?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/f98a39c3-6683-439f-a412-b9d0d7bede5f`

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.

- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_forged_insert (both pages) -> 200
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_forged_insert (both pages) -> 200

## Numeric canary
The owner added a second row with 7331 in `amount_cents`, then Stranger read the stranger's data again (1 of 1 reads were stable enough to compare). The row was removed afterwards.

- Nothing the stranger reads changed. Totals and counts don't depend on the owner's data.

## Tamper check
The stranger tried to change, then delete, the owner's canary row in `bench_forged_insert`, and the owner read it back after each try.

- Change `body`: blocked, the row is as the owner left it (HTTP 204)
- Delete: blocked, the row is still there (HTTP 204)

## Forged owner
Signed in as the stranger, Stranger tried to add a row to `bench_forged_insert` that names the owner in `user_id` (HTTP 201).

- **It was stored: the stranger put a record into the owner's account.**
- Deleted again afterwards: yes

## Live updates
The stranger opened the app's realtime connection and listened for database changes on `bench_forged_insert` and on 4 likely channels (`bench_forged_insert:{owner}`, `user:{owner}`, `{owner}`, `bench_forged_insert`). Then the owner added a row.

- Joined: `database changes on bench_forged_insert`, `bench_forged_insert:{owner}`, `user:{owner}`, `{owner}`, `bench_forged_insert`
- Heard nothing of the owner's row.
- Row deleted afterwards: yes

## Blast radius
Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.

- `bench_forged_insert`: stranger reads none. With no login: none.
