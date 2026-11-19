# Stranger: CLEAN

The stranger saw their own data and none of the owner's.

- App: http://localhost:5231/bench/?case=all_good
- Owner: maya@duebook.demo planted `stranger-canary-62c1b9`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-62c1b9`)
- When: 2026-11-19T16:37:22.913Z

## Coverage
1 of 10 user-data tables were read during this check (`bench_all_good`).
Not checked: `bench_rls_off`, `bench_client_filter`, `bench_leaky_rpc`, `bench_detail_page`, `bench_leaky_view`, `bench_forged_insert`, `bench_leaky_total`, `bench_storage_leak`, `bench_broadcast_leak`. Add a probe whose `plant` and `look` reach them.

## Kane runs
- Owner plants the canary: **passed** in 118s, 31.800104999999995 credits
  - Kane: created and saved a note on the notes page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TAQ3BSKW00QYJ94SCK3PNJ/dashboard/share/US_T3786HT0IB7B3PDW4G72JX6QCE2587X8O96DEZ8HEAUYZAQ87E1GNOHFRK826QIP?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/6564ea69-90c1-4803-8cb1-b1e2d81fb721`
- Stranger looks for it: **passed** in 168s, 45.8490625 credits
  - Kane: opened the requested note page on localhost
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TATPPWZBF3ZKM0HFBV0MAD/dashboard/share/US_FS53LVYGHM7C8MRK5NG4Y0X3RQGMS1SEFXE5CJSOYKYLM0F2KHWWEU14B8QK6U3A?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/6580ccdf-8331-461e-bf33-5c42a75cd4ca`

The stranger also opened the owner's own record page directly, by address from the owner's run: `http://localhost:5231/bench/?case=all_good&note=06f4f863-d263-471e-97f4-50c75e9ffbd0`.

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.

- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_all_good (both pages) -> 200
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_all_good (both pages) -> 200
- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_all_good (both pages) -> 200
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_all_good (both pages) -> 200
- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_all_good (stranger's page) -> 200
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_all_good (stranger's page) -> 200

## Numeric canary
The owner added a second row with 7331 in `amount_cents`, then Stranger read the stranger's data again (3 of 3 reads were stable enough to compare). The row was removed afterwards.

- Nothing the stranger reads changed. Totals and counts don't depend on the owner's data.

## Tamper check
The stranger tried to change, then delete, the owner's canary row in `bench_all_good`, and the owner read it back after each try.

- Change `body`: blocked, the row is as the owner left it (HTTP 204)
- Delete: blocked, the row is still there (HTTP 204)

## Forged owner
Signed in as the stranger, Stranger tried to add a row to `bench_all_good` that names the owner in `user_id` (HTTP 403).

- Refused: no such row was stored.

## Files
In each storage bucket the pages used, the owner uploaded a small file holding the canary. Then the stranger, and a request with no login, tried to download it and to list the owner's folder.

- `bench-good`: stranger download blocked (HTTP 400), stranger list blocked (HTTP 200), no login download blocked (HTTP 400), no login list blocked (HTTP 200). File deleted afterwards.

## Live updates
The stranger opened the app's realtime connection and listened for database changes on `bench_all_good` and on 4 likely channels (`bench_all_good:{owner}`, `user:{owner}`, `{owner}`, `bench_all_good`). Then the owner added a row.

- Joined: `database changes on bench_all_good`, `bench_all_good:{owner}`, `user:{owner}`, `{owner}`, `bench_all_good`
- Heard nothing of the owner's row.
- Row deleted afterwards: yes

## Blast radius
Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.

- `bench_all_good`: stranger reads none. With no login: none.
