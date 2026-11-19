# Stranger found a data leak

Owner: **maya@duebook.demo**. Stranger: **stranger@duebook.demo**.

- Canary the owner planted: `stranger-canary-09ac22`
- How it showed up: in what the server sends with no login at all
- **No login needed:** the API returned it to a request with no login (only the public key), so anyone on the internet can read these rows.
- Response that carried it: https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/rpc/bench_leaky_rpc_mine
- Kane run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T9R0QMH67JNQ2F0V21TS7F/dashboard/share/US_G70SXNVV9CT84483KSX4EL4HIEZ4K69MQYRLHIHH7WQJSU77GOBGBIZRY35XCBR6?type=summary&agentView=true&fqdn=summary-page
- Full report: .stranger/report.md

## What to fix

The owner's canary came back from `bench_leaky_rpc_mine()`, a database function the app calls. It is `security definer`, so it runs with its creator's rights and row level security never applies to what it reads.

- `bench_leaky_rpc_mine()` is in 03_leaky_rpc.sql (security definer)

Make it run with the caller's rights, or filter by the caller inside it, in a new migration:

```sql
alter function public.bench_leaky_rpc_mine() security invoker;
-- or, if it must stay security definer, add  where user_id = (select auth.uid())  to its query
```

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
