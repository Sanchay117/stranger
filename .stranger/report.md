# Stranger: LEAK

Signed in as stranger@duebook.demo, Kane found the owner's canary on the page. The server sends it to the stranger from https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices. With no login at all, the API returns it too.

- App: https://stranger-2yf3.vercel.app/duebook/
- Owner: maya@duebook.demo planted `stranger-canary-e7689f`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-e7689f`)
- When: 2026-11-17T13:58:28.071Z

## Coverage
1 of 1 user-data tables were read during this check (`invoices`).

## Kane runs
- Owner plants the canary: **passed** in 88s, 21.148744999999998 credits
  - Kane: created and saved a new invoice on Duebook
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7MWTPCNTZTY681T50AQTYAE/dashboard/share/US_PNIC8WGW4HPW27AHNMX4MZFTRYRSWBXUNGSBOB4R3G0MB0UPAML983T12G5CEAFE?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/87688a94-cf04-40f2-95d1-9bd51bea6e7d`
- Stranger looks for it: **failed** in 102s, 32.258717499999996 credits
  - Kane: The invoices page displays the canary record even though it should not be visible.
  - Failed at step 5: assert: the text "stranger-canary-e7689f" does not appear anywhere on the page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7MWXC72Z55BXNDY9AAAJQRN/dashboard/share/US_S70OVX9C4QCE6EJDN7WY3T69U0HIZ8AQYBGE7K2YQSDCTC656GQS77RX3UNRC63G?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/0a31c098-0d88-4826-8150-19078d0b2d48`

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GET only): with the stranger's login, then with none.

- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices (both pages) -> 200, **owner's canary in the response**
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices (both pages) -> 200, **owner's canary in the response**

## Numeric canary
The owner added a second row with 7331 in `amount_cents`, then Stranger read the stranger's data again (1 of 1 reads were stable enough to compare). The row was removed afterwards.

- **Changed:** GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices (the new row itself)

## Tamper check
The stranger tried to change, then delete, the owner's canary row in `invoices`, and the owner read it back after each try.

- Change `note`: blocked, the row is as the owner left it (HTTP 204)
- Delete: blocked, the row is still there (HTTP 204)

## Blast radius
Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.

- `invoices`: stranger reads 12 rows from 1 other account. With no login: 20 rows. Returned sensitive columns: `amount_cents`, `client_email`, `note`.

## Where the canary showed up
- https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices, the stranger's page read, sent again with the stranger's login: …stranger-canary-e7689f…
- https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices, the stranger's page read, sent again with no login: …stranger-canary-e7689f…
