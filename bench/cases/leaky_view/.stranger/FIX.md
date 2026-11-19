# Stranger found a data leak

Impact: `bench_leaky_view_list`: stranger reads 1 row from 1 other account (1 row with no login).

Owner: **maya@duebook.demo**. Stranger: **stranger@duebook.demo**.

- Canary the owner planted: `stranger-canary-e4b354`
- How it showed up: in what the server sent the stranger
- **No login needed:** the API returned it to a request with no login (only the public key), so anyone on the internet can read these rows.
- Response that carried it: https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_view_list (table `bench_leaky_view_list`)
- Kane run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T9F3B0DYMDMHNXJ8VVABYB/dashboard/share/US_CBF88BEURZGV1SM8HH2J2RCC27GYM960AD3E1BUPR0DWWB9VBHRATMNC0S8QCL9J?type=summary&agentView=true&fqdn=summary-page
- Full report: .stranger/report.md

## What to fix

`bench_leaky_view_list` is a view (05_leaky_view.sql) made without `security_invoker`, so it reads its tables with its creator's rights and row level security never applies.

```sql
alter view public.bench_leaky_view_list set (security_invoker = true);
```

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
