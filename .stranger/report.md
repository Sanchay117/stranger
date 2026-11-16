# Stranger: LEAK

Signed in as stranger@duebook.demo, Kane found the owner's canary on the page.

- App: https://stranger-2yf3.vercel.app/duebook/
- Owner: maya@duebook.demo planted `stranger-canary-f5b2cc`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-f5b2cc`)
- When: 2026-11-16T14:21:37.196Z

## Kane runs
- Owner plants the canary: **passed** in 109s, 21.611690000000003 credits
  - Kane: created and saved an invoice on Duebook
  - Run: https://test-manager.lambdatest.com/projects/01M7J50DR7X78CBZ60F58CF03Y/test-cases/01M7JBRCJANTX1CCGB8KH7B3B4/dashboard/share/US_06EEHAYDD7I75ASMYC6W9D1SM6WCCN3LVA646DM922FCMGY3YYWGI2GU0KSRPL3O?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/fc2d8806-6f31-4573-b584-6994fa5d6a52`
- Stranger looks for it: **failed** in 130s, 35.486172499999995 credits
  - Kane: The invoices page shows the canary record that should not be visible.
  - Failed at step 5: assert: the text "stranger-canary-f5b2cc" does not appear anywhere on the page
  - Run: https://test-manager.lambdatest.com/projects/01M7J50DR7X78CBZ60F58CF03Y/test-cases/01M7JBVNX0WRHTEJF9MXTP1E39/dashboard/share/US_4UGM76WIWN73PFNGZ2X23WBXQTDH8PYUZ8CW2D2AJ3E0CIXFCJHBNVUB34ZUDGL4?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/442f39b7-04ae-480f-9caf-0291ff384200`
