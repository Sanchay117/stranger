# Stranger found a data leak

Signed in as **stranger@duebook.demo**, Kane could see a record that only **maya@duebook.demo** created.

- Canary the owner planted: `stranger-canary-afb57e`
- How it showed up: on the page
- Tables the stranger's page read: `invoices`
- Kane's failing check: assert: the text "stranger-canary-afb57e" does not appear anywhere on the page
- Kane run: https://test-manager.lambdatest.com/projects/01M7J50DR7X78CBZ60F58CF03Y/test-cases/01M7J7445WJJF4J9HEDY5990DR/dashboard/share/US_AXCN64531FX215G8MXCEUXZ03K68DKLZ7PE0ZIAOC7JI320IP742NE1CETY5QAFP?type=summary&agentView=true&fqdn=summary-page
- Full report: .stranger/report.md

## What to fix

This app reads its data straight from Supabase, so the database decides who sees which rows (Row Level Security).

Find the SELECT policy on the leaking table. A policy like `using (true)` ("Enable read access for all users") lets every account, and anyone holding the public anon key, read every row.

Replace it with a policy that only returns the signed-in user's rows, for example:

```sql
drop policy if exists "Enable read access for all users" on public.invoices;
create policy "Owners can read their own rows" on public.invoices
  for select to authenticated
  using ((select auth.uid()) = user_id);
```

Write it as a new migration in `supabase/migrations/` (never edit an applied one), apply it, and check UPDATE and DELETE policies on the same table too.

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
