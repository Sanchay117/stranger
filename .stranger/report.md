# Stranger: LEAK

Signed in as stranger@duebook.demo, Kane found the owner's canary on the page. The server sends it to the stranger from https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices. With no login at all, the API returns it too.

- App: https://stranger-2yf3.vercel.app/duebook/
- Owner: maya@duebook.demo planted `stranger-canary-23f429`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-23f429`)
- When: 2026-11-17T10:10:44.856Z

## Kane runs
- Owner plants the canary: **passed** in 92s, 27.0612725 credits
  - Kane: created and saved an invoice on DueBook
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7MFSQP08ZEQS064BH6D4709/dashboard/share/US_ZVP05IPJVQK5EGXT8FZ3R2DH1K67HG7OMTO2D0JM90Z7IGM9ZWIIY9LIDR8QKSPC?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/d6cbd18b-6984-4b9f-8dc1-5d7285f8ba26`
- Stranger looks for it: **failed** in 123s, 37.4209125 credits
  - Kane: The invoice list shows the canary record even though it should not be present.
  - Failed at step 5: assert: the text "stranger-canary-23f429" does not appear anywhere on the page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7MFWH7C0FS3TCNEHBB5QN25/dashboard/share/US_9UY0RSVTOXAYM76EZI26DOISI1SOWZOWN1VSPK906181SH8U5FL8MACE4YPE2HRC?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/e9f47be1-e8c8-404a-9c6b-47f2476a1be6`

## Data reads sent again
Right after Kane's run, Stranger sent the stranger's data requests again (GET only) to see what the server hands out.

- With the stranger's login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices -> 200, **owner's canary in the response**
- With no login: GET https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices -> 200, **owner's canary in the response**

## Where the canary showed up
- https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices, sent again with the stranger's login: …f-503d-47a6-8cc4-555f4ead0483","client_name":"Stranger check","client_email":null,"amount_cents":100,"currency":"USD","due_date":null,"status":"unpaid","note":"stranger-canary-23f429","created_at":"2026-11-17T10:11:46.247269+00:00"}, {"id":"c26c59f8-a149-47b0-97a9-445e2664562a","user_id":"cfc4f9b7-3752-4e19-b8cd-85954b6bcae9","client_name…
- https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices, sent again with no login: …f-503d-47a6-8cc4-555f4ead0483","client_name":"Stranger check","client_email":null,"amount_cents":100,"currency":"USD","due_date":null,"status":"unpaid","note":"stranger-canary-23f429","created_at":"2026-11-17T10:11:46.247269+00:00"}, {"id":"c26c59f8-a149-47b0-97a9-445e2664562a","user_id":"cfc4f9b7-3752-4e19-b8cd-85954b6bcae9","client_name…
