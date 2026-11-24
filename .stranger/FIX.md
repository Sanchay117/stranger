# Stranger found a data leak

Impact: `invoices`: stranger reads 5 rows from 1 other account (6 rows with no login).

Owner: **maya@duebook.demo**. Stranger: **stranger@duebook.demo**.

- Canary the owner planted: `stranger-canary-e18167`
- How it showed up: on the page
- **No login needed:** the API returned it to a request with no login (only the public key), so anyone on the internet can read these rows.
- Response that carried it: https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices (table `invoices`)
- Kane's failing check: assert: the text "stranger-canary-e18167" does not appear anywhere on the page
- Kane run: https://test-manager.lambdatest.com/projects/01M7J50DR7X78CBZ60F58CF03Y/test-cases/01M873Z7V6VEXWXV5MRYQQD6CK/dashboard/share/US_HUMRJRNVABD3PRAP6LWUQN06I39D3X2208MHDR4LXH8KQYXQKDY2XIYSO2YXUX1S?type=summary&agentView=true&fqdn=summary-page
- Full report: .stranger/report.md

## What to fix

This app reads its data straight from Supabase, so the database decides who sees which rows (Row Level Security).

Read (SELECT) policies on `invoices`, as your migrations in `supabase/migrations/` leave them:

- `"Enable read access for all users"` (0001_invoices.sql, for select to public): `using (true)` **This lets every account read every row.**

Replace the open policy with one that only returns the signed-in user's rows:

```sql
drop policy if exists "Enable read access for all users" on public.invoices;
create policy "Owners can read their own rows" on public.invoices
  for select to authenticated
  using ((select auth.uid()) = user_id);
```

Write it as a new migration in `supabase/migrations/` (never edit an applied one), apply it, and check UPDATE and DELETE policies on the same table too.

Live in the database right now (row level security on):

- `"Enable read access for all users"` for select to public: `using (true)` **open to everyone**
- `"Users can delete their own invoices"` for delete to authenticated: `using ((( SELECT auth.uid() AS uid) = user_id))`
- `"Users can insert their own invoices"` for insert to authenticated
- `"Users can update their own invoices"` for update to authenticated: `using ((( SELECT auth.uid() AS uid) = user_id))`

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
