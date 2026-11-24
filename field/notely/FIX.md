# Stranger found a data leak

> Saved from Notely run `106ece`. This was a local checkout with a throwaway Supabase database and synthetic test accounts. The RLS state described below applies to that test setup.

Impact: `notes`: stranger reads 4 rows from 1 other account (8 rows with no login).

Owner: **owner@field.test**. Stranger: **stranger@field.test**.

- Canary the owner planted: `stranger-canary-106ece`
- How it showed up: in what the server sent the stranger
- **No login needed:** the API returned it to a request with no login (only the public key), so a signed-out client could read rows in this test setup.
- Response that carried it: [Supabase notes endpoint] (table `notes`)
- TAMPER: The stranger could change and delete the owner's row in `notes`.
- TAMPER: The stranger could create a row in `notes` that names the owner in `user_id`, so anyone can add records to someone else's account.
- Kane run: [Owner and stranger evidence](https://stranger-2yf3.vercel.app/runs/106ece/)
- Full report: [report.md](report.md)

## What to fix

This app loads its data through its own server code, but it signs in with Supabase from the browser, so every visitor has the project's address and public key. With them anyone can read `notes` straight from Supabase, and Stranger did: the stranger got the owner's row. So the database decides who sees which rows (Row Level Security), whatever the server code filters.

Row Level Security is **off** for `notes` in the live database right now, so its policies do nothing: every account can read every row (so can anyone with just the public key), and the stranger could change rows they do not own and add rows in the owner's name. Your migrations turn it on, so it was turned off by hand, in the dashboard or the SQL editor. Turn it back on:

```sql
alter table public.notes enable row level security;
```

Once it is on, the policies already on `notes` limit each account to its own rows, so no new policy is needed. Write it as a new migration in `supabase/migrations/` (never edit an applied one) so every copy of the database gets it, and apply it. This one change fixes everything above together. Then run Stranger again: the policies themselves only count once Row Level Security is on.

Live in the database right now (row level security **off**):

- `"Users can manage their own notes"` for all to authenticated: `using ((auth.uid() = user_id))`

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
