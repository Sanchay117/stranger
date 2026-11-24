# Stranger found a data leak

Impact: `transactions`: stranger reads 2 rows from 1 other account (5 rows with no login).

Owner: **owner@field.test**. Stranger: **stranger@field.test**.

- Canary the owner planted: `stranger-canary-56eb00`
- How it showed up: on the page
- **No login needed:** the API returned it to a request with no login (only the public key), so anyone on the internet can read these rows.
- Response that carried it: http://127.0.0.1:54321/rest/v1/transactions (table `transactions`)
- TAMPER: The stranger could change and delete the owner's row in `transactions`.
- TAMPER: The stranger could create a row in `transactions` that names the owner in `user_id`, so anyone can add records to someone else's account.
- Kane's failing check: assert: the text "stranger-canary-56eb00" does not appear anywhere on the page
- Kane run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M87CH0E908ZYTA9P8TDFPDS0/dashboard/share/US_KCG38J4PVOK6ALX206OPU88AN8YLN7WCRRY6YGRL402C4IWZYBGR6663BONSFX9Q?type=summary&agentView=true&fqdn=summary-page
- Full report: .stranger/report.md

## What to fix

This app reads its data straight from Supabase, so the database decides who sees which rows (Row Level Security).

Row Level Security is **off** for `transactions` in the live database right now, so its policies do nothing: every account can read every row (so can anyone with just the public key), and the stranger could change rows they do not own and add rows in the owner's name. Your migrations turn it on, so it was turned off by hand, in the dashboard or the SQL editor. Turn it back on:

```sql
alter table public.transactions enable row level security;
```

Once it is on, the policies already on `transactions` limit each account to its own rows, so no new policy is needed. Write it as a new migration in `supabase/migrations/` (never edit an applied one) so every copy of the database gets it, and apply it. This one change fixes everything above together. Then run Stranger again: the policies themselves only count once Row Level Security is on.

Live in the database right now (row level security **off**):

- `"Users can delete their own transactions"` for delete to authenticated: `using ((auth.uid() = user_id))`
- `"Users can insert their own transactions"` for insert to authenticated
- `"Users can update their own transactions"` for update to authenticated: `using ((auth.uid() = user_id))`
- `"Users can view their own transactions"` for select to authenticated: `using ((auth.uid() = user_id))`

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
