# Stranger: LEAK

Signed in as stranger@duebook.demo, Kane found the owner's canary on the page. The server sends it to the stranger from https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_rls_off. With no login at all, the API returns it too. The stranger could change and delete the owner's row in `bench_rls_off`. The stranger could create a row in `bench_rls_off` that names the owner in `user_id`, so anyone can add records to someone else's account.

- App: http://localhost:5231/bench/?case=rls_off
- Owner: maya@duebook.demo planted `stranger-canary-a855b8`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-a855b8`)
- When: 2026-11-19T15:58:22.189Z

## Coverage
1 of 10 user-data tables were read during this check (`bench_rls_off`).
Not checked: `bench_client_filter`, `bench_leaky_rpc`, `bench_detail_page`, `bench_leaky_view`, `bench_forged_insert`, `bench_leaky_total`, `bench_storage_leak`, `bench_broadcast_leak`, `bench_all_good`. Add a probe whose `plant` and `look` reach them.

## Kane runs
- Owner plants the canary: **passed** in 206s, 30.0698 credits
  - Kane: created and saved a new note on the notes page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T8FNQR588A1Y78N966RKFB/dashboard/share/US_TH1ORK0ZRZFIIJU5W81L395H3FQLK511EQ0K5N8DGMR6LXNQSVF8BSC2NGSMV4O0?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/9264ad1f-b13c-4c1f-8a00-92e2f2d60e67`
- Stranger looks for it: **failed** in 222s, 38.583991999999995 credits
  - Kane: The Your notes page shows the stranger-canary-a855b8 note even though it should not be available to this user.
  - Failed at step 5: assert: the text "stranger-canary-a855b8" does not appear anywhere on the page.
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T8NZKNERXXKA6RHQVVYA8N/dashboard/share/US_BB40D5K3VONJ066GPIE2WU9JJFHMS6AU50NITTJZK57VFUGDL6UKVTY21A81ZCJJ?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/2d00f72f-d069-4ec6-90dc-f5f4a7c2bea5`

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.

- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_rls_off (both pages) -> 200, **owner's canary in the response**
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_rls_off (both pages) -> 200, **owner's canary in the response**

## Numeric canary
The owner added a second row with 7331 in `amount_cents`, then Stranger read the stranger's data again (1 of 1 reads were stable enough to compare). The row was removed afterwards.

- **Changed:** GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_rls_off (the new row itself)

## Tamper check
The stranger tried to change, then delete, the owner's canary row in `bench_rls_off`, and the owner read it back after each try.

- Change `body`: **the owner's row changed** (HTTP 204)
- Delete: **the owner's row was deleted** (HTTP 204)
- Put back by the owner afterwards: yes

## Forged owner
Signed in as the stranger, Stranger tried to add a row to `bench_rls_off` that names the owner in `user_id` (HTTP 201).

- **It was stored: the stranger put a record into the owner's account.**
- Deleted again afterwards: yes

## Live updates
The stranger opened the app's realtime connection and listened for database changes on `bench_rls_off` and on 4 likely channels (`bench_rls_off:{owner}`, `user:{owner}`, `{owner}`, `bench_rls_off`). Then the owner added a row.

- Joined: `database changes on bench_rls_off`, `bench_rls_off:{owner}`, `user:{owner}`, `{owner}`, `bench_rls_off`
- Heard nothing of the owner's row.
- Row deleted afterwards: yes

## Blast radius
Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.

- `bench_rls_off`: stranger reads 1 row from 1 other account. With no login: 2 rows. Returned sensitive columns: `amount_cents`.

## Where the canary showed up
- https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_rls_off, the stranger's page read, sent again with the stranger's login: …stranger-canary-a855b8…
- https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_rls_off, the stranger's page read, sent again with no login: …stranger-canary-a855b8…
