# Stranger: LEAK

The stranger's page was clean, but with no login at all the API returns the owner's canary from https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/rpc/bench_leaky_rpc_mine.

- App: http://localhost:5231/bench/?case=leaky_rpc
- Owner: maya@duebook.demo planted `stranger-canary-09ac22`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-09ac22`)
- When: 2026-11-19T16:18:15.951Z

## Coverage
0 of 10 user-data tables were read during this check.
Not checked: `bench_rls_off`, `bench_client_filter`, `bench_leaky_rpc`, `bench_detail_page`, `bench_leaky_view`, `bench_forged_insert`, `bench_leaky_total`, `bench_storage_leak`, `bench_broadcast_leak`, `bench_all_good`. Add a probe whose `plant` and `look` reach them.

## Kane runs
- Owner plants the canary: **passed** in 128s, 26.2816625 credits
  - Kane: created and saved a new note on the notes page
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T9M3WBABQY4JKM3QBZEQFK/dashboard/share/US_QHV6KM1NMCPFGUF7X0Q6676MJQU0HYGDHM5138RQ7QH2B0DNJUUEQH7D0PNFR23E?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/c6ee78d4-14ce-4080-a5cc-3572910ade3c`
- Stranger looks for it: **passed** in 109s, 23.724379999999996 credits
  - Kane: Created a new note and opened the notes list on the local notes site.
  - Run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T9R0QMH67JNQ2F0V21TS7F/dashboard/share/US_G70SXNVV9CT84483KSX4EL4HIEZ4K69MQYRLHIHH7WQJSU77GOBGBIZRY35XCBR6?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/36433cae-4a59-4d52-af91-f5d191a65db8`

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.

- With no login: POST https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/rpc/bench_leaky_rpc_mine (both pages) -> 200, **owner's canary in the response**

> Tamper, forge, numeric, storage, realtime and persona checks need a Supabase API in the logs; none was found.

## Where the canary showed up
- https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/rpc/bench_leaky_rpc_mine, the database function bench_leaky_rpc_mine() that the stranger's page called, called again with no login: …stranger-canary-09ac22…
