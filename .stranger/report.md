# Stranger: LEAK

Signed in as stranger@duebook.demo, Kane found the owner's canary on the page.

- App: http://localhost:5231
- Owner: maya@duebook.demo planted `stranger-canary-afb57e`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-afb57e`)
- When: 2026-11-16T12:58:44.670Z

## Kane runs
- Owner plants the canary: **passed** in 114s, 25.511912499999994 credits
  - Kane: created and saved an invoice on localhost
  - Run: https://test-manager.lambdatest.com/projects/01M7J50DR7X78CBZ60F58CF03Y/test-cases/01M7J70NGTYXV8194J12SZ536Q/dashboard/share/US_QYQ9FRGPLTT35D0V2SBZ3EKO10QPXH2X63U1TGSF4TH08UR4LS4A3MRMDNKSAI0S?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/859784d7-a77c-4823-be76-6441d3e44802`
- Stranger looks for it: **failed** in 131s, 23.37914749999999 credits
  - Kane: The final check failed because the canary text was already present in the account's invoice list.
  - Failed at step 19: assert: the text "stranger-canary-afb57e" does not appear anywhere on the page
  - Run: https://test-manager.lambdatest.com/projects/01M7J50DR7X78CBZ60F58CF03Y/test-cases/01M7J7445WJJF4J9HEDY5990DR/dashboard/share/US_AXCN64531FX215G8MXCEUXZ03K68DKLZ7PE0ZIAOC7JI320IP742NE1CETY5QAFP?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/a601fe05-cfe2-4736-9223-d282391db1fb`
