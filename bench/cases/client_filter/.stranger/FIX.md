# Stranger found a data leak

Impact: `bench_client_filter`: stranger reads 1 row from 1 other account (none with no login).

Owner: **maya@duebook.demo**. Stranger: **stranger@duebook.demo**.

- Canary the owner planted: `stranger-canary-d8f938`
- How it showed up: in what the server sent the stranger
- Response that carried it: https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_client_filter (table `bench_client_filter`)
- Kane run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T9216CS5AEH4DSQJE7YDE8/dashboard/share/US_OWT1NJN9T1Z8A47BEUY9UCR9NAXNQ2PU68U5ZCX543C7K1IWSZEDG01LS40U1928?type=summary&agentView=true&fqdn=summary-page
- Full report: .stranger/report.md

## What to fix

This app reads its data straight from Supabase, so the database decides who sees which rows (Row Level Security).

Read (SELECT) policies on `bench_client_filter`, as your migrations in `../../migrations/` leave them:

- `"Signed-in users can read notes"` (02_client_filter.sql, for select to authenticated): `using (true)` **This lets every account read every row.**

Replace the open policy with one that only returns the signed-in user's rows:

```sql
drop policy if exists "Signed-in users can read notes" on public.bench_client_filter;
create policy "Owners can read their own rows" on public.bench_client_filter
  for select to authenticated
  using ((select auth.uid()) = user_id);
```

Write it as a new migration in `../../migrations/` (never edit an applied one), apply it, and check UPDATE and DELETE policies on the same table too.

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
