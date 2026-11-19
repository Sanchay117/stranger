# Stranger found a data leak

Impact: `bench_rls_off`: stranger reads 1 row from 1 other account (2 rows with no login).

Owner: **maya@duebook.demo**. Stranger: **stranger@duebook.demo**.

- Canary the owner planted: `stranger-canary-a855b8`
- How it showed up: on the page
- **No login needed:** the API returned it to a request with no login (only the public key), so anyone on the internet can read these rows.
- Response that carried it: https://ydarovwsupwpcedidgwn.supabase.co/rest/v1/bench_rls_off (table `bench_rls_off`)
- TAMPER: The stranger could change and delete the owner's row in `bench_rls_off`.
- TAMPER: The stranger could create a row in `bench_rls_off` that names the owner in `user_id`, so anyone can add records to someone else's account.
- Kane's failing check: assert: the text "stranger-canary-a855b8" does not appear anywhere on the page.
- Kane run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T8NZKNERXXKA6RHQVVYA8N/dashboard/share/US_BB40D5K3VONJ066GPIE2WU9JJFHMS6AU50NITTJZK57VFUGDL6UKVTY21A81ZCJJ?type=summary&agentView=true&fqdn=summary-page
- Full report: .stranger/report.md

## What to fix

This app reads its data straight from Supabase, so the database decides who sees which rows (Row Level Security).

Your migrations turn Row Level Security **off** for `bench_rls_off`, so every account can read every row. Turn it on (`alter table public.bench_rls_off enable row level security;`) and add owner-only policies.

Each account should only get its own rows back, for example:

```sql
drop policy if exists "Enable read access for all users" on public.bench_rls_off;
create policy "Owners can read their own rows" on public.bench_rls_off
  for select to authenticated
  using ((select auth.uid()) = user_id);
```

Write it as a new migration in `../../migrations/` (never edit an applied one), apply it, and check UPDATE and DELETE policies on the same table too.

The stranger could change or delete a row they don't own, so the UPDATE and DELETE policies on `bench_rls_off` don't check the owner.

Each should only match the signed-in user's rows, for example:

```sql
create policy "Owners can update their own rows" on public.bench_rls_off
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners can delete their own rows" on public.bench_rls_off
  for delete to authenticated
  using ((select auth.uid()) = user_id);
```

The stranger could add a row to `bench_rls_off` with the owner's id in `user_id`. The insert policy never checks that new rows belong to the person adding them, so anyone can put records into anyone's account.

New rows should only be allowed in the signed-in user's own name:

```sql
create policy "Users can add their own rows" on public.bench_rls_off
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
```

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
