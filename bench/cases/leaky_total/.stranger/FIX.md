# Stranger found a data leak

Owner: **maya@duebook.demo**. Stranger: **stranger@duebook.demo**.

- Canary the owner planted: `stranger-canary-83c7f2`
- How it showed up: in the stranger's totals or counts, which moved when only the owner acted
- Table: `bench_leaky_total`
- LEAK: When only the owner added a row (odd number amount_cents = 7331), 1 of the stranger's reads changed: https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_leaky_total_sum. The stranger's data depends on the owner's.
- Kane run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TA5VKTDN0KBXGMWVTQ0MAT/dashboard/share/US_ZQHUQ9UDC60XJ3TC5V4IGOZW6EKCCQO5SMAZYTYBOVKLYLA927ZLFVQJ3QRJBO0O?type=summary&agentView=true&fqdn=summary-page
- Full report: .stranger/report.md

## What to fix

Something the stranger reads adds up or counts rows without checking who is asking: usually a view or a database function. In Postgres a view runs with its creator's rights unless it is made with `with (security_invoker = true)`, and a `security definer` function skips row level security too. Make them respect the caller, or filter by `auth.uid()` inside.

`bench_leaky_total_sum` is a view (07_leaky_total.sql) made without `security_invoker`, so it reads its tables with its creator's rights and row level security never applies.

```sql
alter view public.bench_leaky_total_sum set (security_invoker = true);
```

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
