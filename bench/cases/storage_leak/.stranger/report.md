# Stranger: LEAK

The owner's file in the `bench-files` storage bucket: the stranger could download it, the stranger could see it in a listing. (Page check: CLEAN.)

- App: http://localhost:5231/bench/?case=storage_leak
- Owner: maya@duebook.demo planted `stranger-canary-46d442`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-46d442`)
- When: 2026-11-19T16:30:13.714Z

## Coverage
1 of 10 user-data tables were read during this check (`bench_storage_leak`).
Not checked: `bench_rls_off`, `bench_client_filter`, `bench_leaky_rpc`, `bench_detail_page`, `bench_leaky_view`, `bench_forged_insert`, `bench_leaky_total`, `bench_broadcast_leak`, `bench_all_good`. Add a probe whose `plant` and `look` reach them.

## Kane runs
- Owner plants the canary: **passed** in 98s, 21.552242499999995 credits
  - Kane: created a new note on the notes page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TAA0TX7CEV4F7RCKD62BCA/dashboard/share/US_67V5VZQG1UW2N5TNY7D3L566TQ8QXDSXPE597YV3Q9BFEFD0OSC3IA3CF6F3REX7?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/32c4f9cb-2fec-4a7e-a4ca-eebb96931400`
- Stranger looks for it: **passed** in 110s, 24.335250000000002 credits
  - Kane: created a new note and opened the notes list on the local notes site
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TACZWFZV12211TQP06BK3D/dashboard/share/US_6F4IKTUFA2G5KP95WORLKY5B45WCSY3B9N6XGKYGN1UV23M9JXF35PASDYB3V7KD?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/f9556dac-abd9-4ca7-87ce-a816d82adc30`

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.

- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_storage_leak (both pages) -> 200
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_storage_leak (both pages) -> 200

## Numeric canary
The owner added a second row with 7331 in `amount_cents`, then Stranger read the stranger's data again (1 of 1 reads were stable enough to compare). The row was removed afterwards.

- Nothing the stranger reads changed. Totals and counts don't depend on the owner's data.

## Tamper check
The stranger tried to change, then delete, the owner's canary row in `bench_storage_leak`, and the owner read it back after each try.

- Change `body`: blocked, the row is as the owner left it (HTTP 204)
- Delete: blocked, the row is still there (HTTP 204)

## Forged owner
Signed in as the stranger, Stranger tried to add a row to `bench_storage_leak` that names the owner in `user_id` (HTTP 403).

- Refused: no such row was stored.

## Files
In each storage bucket the pages used, the owner uploaded a small file holding the canary. Then the stranger, and a request with no login, tried to download it and to list the owner's folder.

- `bench-files`: stranger download **got it** (HTTP 200), stranger list **got it** (HTTP 200), no login download blocked (HTTP 400), no login list blocked (HTTP 200). File deleted afterwards.

## Live updates
The stranger opened the app's realtime connection and listened for database changes on `bench_storage_leak` and on 4 likely channels (`bench_storage_leak:{owner}`, `user:{owner}`, `{owner}`, `bench_storage_leak`). Then the owner added a row.

- Joined: `database changes on bench_storage_leak`, `bench_storage_leak:{owner}`, `user:{owner}`, `{owner}`, `bench_storage_leak`
- Heard nothing of the owner's row.
- Row deleted afterwards: yes

## Blast radius
Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.

- `bench_storage_leak`: stranger reads none. With no login: none.
