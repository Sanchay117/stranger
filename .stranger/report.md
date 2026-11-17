# Stranger: LEAK

Signed in as stranger@duebook.demo, Kane found the owner's canary on the page. The server sends it to the stranger from https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices. With no login at all, the API returns it too.

- App: https://stranger-2yf3.vercel.app/duebook/
- Owner: maya@duebook.demo planted `stranger-canary-6541c9`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-6541c9`)
- When: 2026-11-17T10:40:16.017Z

## Coverage
1 of 1 user-data tables were read during this check (`invoices`).

## Kane runs
- Owner plants the canary: **passed** in 87s, 20.888854999999996 credits
  - Kane: created and saved an invoice on Duebook
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7MHFSGG7SWDVZE5DQQNGECF/dashboard/share/US_WA19KNY8I8QPPZ2TDZ03CNCWHC6Y7NUG7SWAUJYSQOACWS2S11Y1M9NR2SGZ6GU4?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/df6c363f-4561-42b4-8d6e-15e201e9faa1`
- Stranger looks for it: **failed** in 105s, 31.963507499999995 credits
  - Kane: The final check failed because the shared invoice list already contained the canary text before this run finished.
  - Failed at step 19: assert: the text "stranger-canary-6541c9" does not appear anywhere on the page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7MHJE5WGRK8K5XFDJCW2MNV/dashboard/share/US_51GRF5CKCP9UZQ07964RHK0DTEAF9K8AOTYHPHTQ7WE66F5ZT63Z9T74Z2KVF4BJ?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/6ceae9ae-5735-452f-a812-f7db9d0e81cc`

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

## Where the canary showed up
- https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices, the stranger's page read, sent again with the stranger's login: …f-503d-47a6-8cc4-555f4ead0483","client_name":"Stranger check","client_email":null,"amount_cents":100,"currency":"USD","due_date":null,"status":"unpaid","note":"stranger-canary-6541c9","created_at":"2026-11-17T10:41:14.460355+00:00"}, {"id":"7eea1017-7048-4001-ba45-9cd119d12ab6","user_id":"cfc4f9b7-3752-4e19-b8cd-85954b6bcae9","client_name…
- https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices, the stranger's page read, sent again with no login: …f-503d-47a6-8cc4-555f4ead0483","client_name":"Stranger check","client_email":null,"amount_cents":100,"currency":"USD","due_date":null,"status":"unpaid","note":"stranger-canary-6541c9","created_at":"2026-11-17T10:41:14.460355+00:00"}, {"id":"7eea1017-7048-4001-ba45-9cd119d12ab6","user_id":"cfc4f9b7-3752-4e19-b8cd-85954b6bcae9","client_name…
