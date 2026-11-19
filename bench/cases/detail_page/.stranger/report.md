# Stranger: LEAK

Signed in as stranger@duebook.demo, Kane found the owner's canary on the owner's own record page, opened directly (http://localhost:5231/bench/?case=detail_page&note=345e95a9-1acb-4db5-bfb5-d5e2ed251281), though the list hid it.

- App: http://localhost:5231/bench/?case=detail_page
- Owner: maya@duebook.demo planted `stranger-canary-7220a5`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-7220a5`)
- When: 2026-11-19T15:49:48.383Z

## Coverage
1 of 10 user-data tables were read during this check (`bench_detail_page`).
Not checked: `bench_rls_off`, `bench_client_filter`, `bench_leaky_rpc`, `bench_leaky_view`, `bench_forged_insert`, `bench_leaky_total`, `bench_storage_leak`, `bench_broadcast_leak`, `bench_all_good`. Add a probe whose `plant` and `look` reach them.

## Kane runs
- Owner plants the canary: **passed** in 178s, 30.0858 credits
  - Kane: created and saved a new note on the notes site
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T8011V56C328VC1RD3NNFR/dashboard/share/US_A8S2KC0LRV0MUXU4OIEPFX0ZFMB2EU7F93EJ4XQW1JSZSLHPPYH9TU5PPWBG7MFL?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/bffae6f6-e584-4368-b03b-c49d9969ac7f`
- Stranger looks for it: **failed** in 244s, 56.002354999999994 credits
  - Kane: Opening the supplied note URL displays the canary text even though it should not be visible to this user.
  - Failed at step 10: assert: the text "stranger-canary-7220a5" is not shown on that page either
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T85EAGETJ9DG02M1F9XS7X/dashboard/share/US_WWDE90TAK0QDFE0RJ0XMQSJEL9QKC46A8Z6IEDGY20WJS55HMIEPLQLZD40O3JQE?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/550e980c-0061-445d-bf08-ed4d7f31bf74`

The stranger also opened the owner's own record page directly, by address from the owner's run: `http://localhost:5231/bench/?case=detail_page&note=345e95a9-1acb-4db5-bfb5-d5e2ed251281`. **The owner's canary showed there.**

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.

- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_detail_page (both pages) -> 200
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_detail_page (both pages) -> 200
- Not sent again: POST https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/rpc/bench_detail_page_get (takes arguments Kane did not log)

## Numeric canary
The owner added a second row with 7331 in `amount_cents`, then Stranger read the stranger's data again (1 of 1 reads were stable enough to compare). The row was removed afterwards.

- Nothing the stranger reads changed. Totals and counts don't depend on the owner's data.

## Tamper check
The stranger tried to change, then delete, the owner's canary row in `bench_detail_page`, and the owner read it back after each try.

- Change `body`: blocked, the row is as the owner left it (HTTP 204)
- Delete: blocked, the row is still there (HTTP 204)

## Forged owner
Signed in as the stranger, Stranger tried to add a row to `bench_detail_page` that names the owner in `user_id` (HTTP 403).

- Refused: no such row was stored.

## Live updates
The stranger opened the app's realtime connection and listened for database changes on `bench_detail_page` and on 4 likely channels (`bench_detail_page:{owner}`, `user:{owner}`, `{owner}`, `bench_detail_page`). Then the owner added a row.

- Joined: `database changes on bench_detail_page`, `bench_detail_page:{owner}`, `user:{owner}`, `{owner}`, `bench_detail_page`
- Heard nothing of the owner's row.
- Row deleted afterwards: yes

## Blast radius
Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.

- `bench_detail_page`: stranger reads none. With no login: none.
