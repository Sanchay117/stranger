# Stranger: LEAK

The stranger's pages looked clean, but a read from the owner's page, sent with the stranger's login, returns the owner's canary from https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_client_filter.

- App: http://localhost:5231/bench/?case=client_filter
- Owner: maya@duebook.demo planted `stranger-canary-d8f938`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-d8f938`)
- When: 2026-11-19T16:05:43.325Z

## Coverage
1 of 10 user-data tables were read during this check (`bench_client_filter`).
Not checked: `bench_rls_off`, `bench_leaky_rpc`, `bench_detail_page`, `bench_leaky_view`, `bench_forged_insert`, `bench_leaky_total`, `bench_storage_leak`, `bench_broadcast_leak`, `bench_all_good`. Add a probe whose `plant` and `look` reach them.

## Kane runs
- Owner plants the canary: **passed** in 160s, 25.857135999999997 credits
  - Kane: created and saved a new note on the notes page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T8X5JS1A69D9WE93QJ3F9K/dashboard/share/US_IWC1MQ3G8ZOM3JXI45RYOILPIB3VC2YSEFPWD55W6LB1VHQAKQ1YM73V7ZEJ4CIP?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/4d35e667-27b5-45ae-bbfa-1dddfd857089`
- Stranger looks for it: **passed** in 228s, 34.68037999999999 credits
  - Kane: created a new note and opened the notes list on localhost
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T9216CS5AEH4DSQJE7YDE8/dashboard/share/US_OWT1NJN9T1Z8A47BEUY9UCR9NAXNQ2PU68U5ZCX543C7K1IWSZEDG01LS40U1928?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/72eed868-fbb0-488e-b25d-681fdd5b670d`

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.

- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_client_filter (owner's page) -> 200, **owner's canary in the response**
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_client_filter (owner's page) -> 200
- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_client_filter (stranger's page) -> 200
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_client_filter (stranger's page) -> 200

## Numeric canary
The owner added a second row with 7331 in `amount_cents`, then Stranger read the stranger's data again (2 of 2 reads were stable enough to compare). The row was removed afterwards.

- **Changed:** GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_client_filter (the new row itself)

## Tamper check
The stranger tried to change, then delete, the owner's canary row in `bench_client_filter`, and the owner read it back after each try.

- Change `body`: blocked, the row is as the owner left it (HTTP 204)
- Delete: blocked, the row is still there (HTTP 204)

## Forged owner
Signed in as the stranger, Stranger tried to add a row to `bench_client_filter` that names the owner in `user_id` (HTTP 403).

- Refused: no such row was stored.

## Live updates
The stranger opened the app's realtime connection and listened for database changes on `bench_client_filter` and on 4 likely channels (`bench_client_filter:{owner}`, `user:{owner}`, `{owner}`, `bench_client_filter`). Then the owner added a row.

- Joined: `database changes on bench_client_filter`, `bench_client_filter:{owner}`, `user:{owner}`, `{owner}`, `bench_client_filter`
- Heard nothing of the owner's row.
- Row deleted afterwards: yes

## Blast radius
Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.

- `bench_client_filter`: stranger reads 1 row from 1 other account. With no login: none. Returned sensitive columns: `amount_cents`.

## Where the canary showed up
- https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_client_filter, the owner's page read, sent again with the stranger's login: …stranger-canary-d8f938…
