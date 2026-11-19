# Stranger found a data leak

Owner: **maya@duebook.demo**. Stranger: **stranger@duebook.demo**.

- Canary the owner planted: `stranger-canary-7220a5`
- How it showed up: on the owner's own record page, which the stranger opened by its address (http://localhost:5231/bench/?case=detail_page&note=345e95a9-1acb-4db5-bfb5-d5e2ed251281)
- Table: `bench_detail_page`
- Kane's failing check: assert: the text "stranger-canary-7220a5" is not shown on that page either
- Kane run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T85EAGETJ9DG02M1F9XS7X/dashboard/share/US_WWDE90TAK0QDFE0RJ0XMQSJEL9QKC46A8Z6IEDGY20WJS55HMIEPLQLZD40O3JQE?type=summary&agentView=true&fqdn=summary-page
- Full report: .stranger/report.md

## What to fix

This app reads its data straight from Supabase, so the database decides who sees which rows (Row Level Security).

Read (SELECT) policies on `bench_detail_page`, as your migrations in `../../migrations/` leave them:

- `"Owners read their notes"` (04_detail_page.sql, for select to authenticated): `using ((select auth.uid()) = user_id)`

None of these looks open at a glance, so check what else can return these rows: a wider condition in one of them, a view, a `security definer` function, or a policy added in the dashboard (compare with `select * from pg_policies where tablename = 'bench_detail_page'`).

Each account should only get its own rows back, for example:

```sql
drop policy if exists "Enable read access for all users" on public.bench_detail_page;
create policy "Owners can read their own rows" on public.bench_detail_page
  for select to authenticated
  using ((select auth.uid()) = user_id);
```

Write it as a new migration in `../../migrations/` (never edit an applied one), apply it, and check UPDATE and DELETE policies on the same table too.

The list page hid the owner's record, but its own page (http://localhost:5231/bench/?case=detail_page&note=345e95a9-1acb-4db5-bfb5-d5e2ed251281) showed it to the stranger. Whatever loads one record by its id does not check who is asking. Fix that check on the server, in the policy or function the record page reads, not by hiding the link.

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
