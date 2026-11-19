# Stranger found that the stranger can change the owner's data

Owner: **maya@duebook.demo**. Stranger: **stranger@duebook.demo**.

- Canary the owner planted: `stranger-canary-812289`
- Table: `bench_forged_insert`
- TAMPER: The stranger could create a row in `bench_forged_insert` that names the owner in `user_id`, so anyone can add records to someone else's account.
- Kane run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T9Y7YTA3NB34WCZXYQ3GKK/dashboard/share/US_A3MOZMA60CZZT7YR8ZILUQ9JFDI30JFZ0ND6W7LNMZ5TEFUL68ZJ52PANDTH0NC8?type=summary&agentView=true&fqdn=summary-page
- Full report: .stranger/report.md

## What to fix

The stranger could add a row to `bench_forged_insert` with the owner's id in `user_id`. The insert policy never checks that new rows belong to the person adding them, so anyone can put records into anyone's account.

Your migrations leave these insert policies:

- `"Signed-in users can add notes"` (06_forged_insert.sql, for insert): `with check (true)` **checks nothing about the owner**

New rows should only be allowed in the signed-in user's own name:

```sql
drop policy if exists "Signed-in users can add notes" on public.bench_forged_insert;
create policy "Users can add their own rows" on public.bench_forged_insert
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
```

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
