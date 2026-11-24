# Stranger: LEAK

Signed in as stranger@duebook.demo, Kane found the owner's canary on the page. The server sends it to the stranger from https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices. With no login at all, the API returns it too.

- App: https://stranger-2yf3.vercel.app/duebook/
- Owner: maya@duebook.demo planted `stranger-canary-e18167`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-e18167`)
- When: 2026-11-24T15:47:09.427Z

## Coverage
1 of 1 user-data tables were read during this check (`invoices`).

## Kane runs
- Owner plants the canary: **passed** in 147s, 25.575917500000003 credits
  - Kane: created and saved an invoice on DueBook
  - Run: https://test-manager.lambdatest.com/projects/01M7J50DR7X78CBZ60F58CF03Y/test-cases/01M873TQRBHPWKZ3J48JDCY73P/dashboard/share/US_P498I5S5DYAVKOT0PRWDTOR7XXR87SHI0XD89LVRR19SCSQXV7O3A81SLFXS8IOM?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/3dba8373-c577-435b-83b2-93a83c356900`
- Stranger looks for it: **failed** in 135s, 34.691624999999995 credits
  - Kane: The invoice list contains the canary text that the test expected to be absent.
  - Failed at step 5: assert: the text "stranger-canary-e18167" does not appear anywhere on the page
  - Run: https://test-manager.lambdatest.com/projects/01M7J50DR7X78CBZ60F58CF03Y/test-cases/01M873Z7V6VEXWXV5MRYQQD6CK/dashboard/share/US_HUMRJRNVABD3PRAP6LWUQN06I39D3X2208MHDR4LXH8KQYXQKDY2XIYSO2YXUX1S?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/659abcef-d77e-4a65-9ddb-6a24e462c2fb`

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.

- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices (both pages) -> 200, **owner's canary in the response**
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices (both pages) -> 200, **owner's canary in the response**

## Numeric canary
The owner added a second row with 7331 in `amount_cents`, then Stranger read the stranger's data again (1 of 1 reads were stable enough to compare). The row was removed afterwards.

- **Changed:** GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices (the new row itself)

## Tamper check
The stranger tried to change, then delete, the owner's canary row in `invoices`, and the owner read it back after each try.

- Change `note`: blocked, the row is as the owner left it (HTTP 204)
- Delete: blocked, the row is still there (HTTP 204)

## Forged owner
Signed in as the stranger, Stranger tried to add a row to `invoices` that names the owner in `user_id` (HTTP 403).

- Refused: no such row was stored.

## Live updates
The stranger opened the app's realtime connection and listened for database changes on `invoices` and on 4 likely channels (`invoices:{owner}`, `user:{owner}`, `{owner}`, `invoices`). Then the owner added a row.

- Joined: `database changes on invoices`, `invoices:{owner}`, `user:{owner}`, `{owner}`, `invoices`
- Heard nothing of the owner's row.
- Row deleted afterwards: yes

## Blast radius
Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.

- `invoices`: stranger reads 5 rows from 1 other account. With no login: 6 rows. Returned sensitive columns: `amount_cents`, `client_email`, `note`.

## Where the canary showed up
- https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices, the stranger's page read, sent again with the stranger's login: …stranger-canary-e18167…
- https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices, the stranger's page read, sent again with no login: …stranger-canary-e18167…
