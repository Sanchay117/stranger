-- Fix for the leak Stranger found (canary f5b2cc): signed in as the stranger,
-- Kane could read Maya's invoices. The read policy was using (true), so every
-- account, and anyone with the public anon key, could read every row.
-- Reads now return only the signed-in user's own invoices, the same rule the
-- insert, update and delete policies already use.

drop policy if exists "Enable read access for all users" on public.invoices;

create policy "Users can read their own invoices"
  on public.invoices for select to authenticated
  using ((select auth.uid()) = user_id);
