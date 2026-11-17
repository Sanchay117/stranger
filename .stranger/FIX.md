# Stranger found a data leak

Signed in as **stranger@duebook.demo**, Kane could see a record that only **maya@duebook.demo** created.

- Canary the owner planted: `stranger-canary-23f429`
- How it showed up: on the page
- **No login needed:** the API returned it to a request with no login (only the public key), so anyone on the internet can read these rows.
- Response that carried it: https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/invoices (table `invoices`)
- Kane's failing check: assert: the text "stranger-canary-23f429" does not appear anywhere on the page
- Kane run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7MFWH7C0FS3TCNEHBB5QN25/dashboard/share/US_9UY0RSVTOXAYM76EZI26DOISI1SOWZOWN1VSPK906181SH8U5FL8MACE4YPE2HRC?type=summary&agentView=true&fqdn=summary-page
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

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
