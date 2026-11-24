# Stranger: LEAK

Signed in as stranger@field.test, Kane found the owner's canary on the page. The server sends it to the stranger from http://127.0.0.1:54321/rest/v1/transactions. With no login at all, the API returns it too. The stranger could change and delete the owner's row in `transactions`. The stranger could create a row in `transactions` that names the owner in `user_id`, so anyone can add records to someone else's account.

- App: http://127.0.0.1:5301/
- Owner: owner@field.test planted `stranger-canary-56eb00`
- Stranger: stranger@field.test looked for it (control `stranger-control-56eb00`)
- When: 2026-11-24T18:16:27.834Z

## Coverage
2 of 2 user-data tables were read during this check (`categories`, `transactions`).

## Kane runs
- Owner plants the canary: **passed** in 159s, 42.6849615 credits
  - Kane: added and saved an expense transaction on the Transactions page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M87CC45F0N9VN3D74M60VM3C/dashboard/share/US_0T00Z411MR9KH9GWDJFY4K1MY4C02XE6FU4TZO2MA52W3G51QM7KOQR350O65LO8?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/197b9e0f-d0ee-46b6-8e33-17133f97df26`
- Stranger looks for it: **failed** in 209s, 59.875924999999995 credits
  - Kane: The final check failed because an older transaction already contained the forbidden canary note.
  - Failed at step 23: assert: the text "stranger-canary-56eb00" does not appear anywhere on the page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M87CH0E908ZYTA9P8TDFPDS0/dashboard/share/US_KCG38J4PVOK6ALX206OPU88AN8YLN7WCRRY6YGRL402C4IWZYBGR6663BONSFX9Q?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/c97b71df-a28c-44e2-b599-495179f59c9b`

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.

- With the stranger's login: GET http://127.0.0.1:54321/rest/v1/transactions (both pages) -> 200, **owner's canary in the response**
- With no login: GET http://127.0.0.1:54321/rest/v1/transactions (both pages) -> 200, **owner's canary in the response**
- With the stranger's login: GET http://127.0.0.1:54321/rest/v1/categories (both pages) -> 200
- With no login: GET http://127.0.0.1:54321/rest/v1/categories (both pages) -> 200

## Numeric canary
The owner added a second row with 7331 in `amount`, then Stranger read the stranger's data again (2 of 2 reads were stable enough to compare). The row was removed afterwards.

- **Changed:** GET http://127.0.0.1:54321/rest/v1/transactions (the new row itself)

## Tamper check
The stranger tried to change, then delete, the owner's canary row in `transactions`, and the owner read it back after each try.

- Change `note`: **the owner's row changed** (HTTP 204)
- Delete: **the owner's row was deleted** (HTTP 204)
- Put back by the owner afterwards: yes

## Forged owner
Signed in as the stranger, Stranger tried to add a row to `transactions` that names the owner in `user_id` (HTTP 201).

- **It was stored: the stranger put a record into the owner's account.**
- Deleted again afterwards: yes

## Live updates
The stranger opened the app's realtime connection and listened for database changes on `transactions` and on 4 likely channels (`transactions:{owner}`, `user:{owner}`, `{owner}`, `transactions`). Then the owner added a row.

- Joined: `database changes on transactions`, `transactions:{owner}`, `user:{owner}`, `{owner}`, `transactions`
- Heard nothing of the owner's row.
- Row deleted afterwards: yes

## Blast radius
Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.

- `transactions`: stranger reads 2 rows from 1 other account. With no login: 5 rows. Returned sensitive columns: `amount`, `note`.
- `categories`: stranger reads none. With no login: none.

## Where the canary showed up
- http://127.0.0.1:54321/rest/v1/transactions, the stranger's page read, sent again with the stranger's login: …stranger-canary-56eb00…
- http://127.0.0.1:54321/rest/v1/transactions, the stranger's page read, sent again with no login: …stranger-canary-56eb00…
