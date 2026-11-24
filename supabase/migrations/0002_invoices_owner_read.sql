-- Stranger found that any account (and anyone with only the public key) could
-- read every invoice through the open "Enable read access for all users" policy.
-- Replace it with a read policy that returns only the signed-in user's rows.

drop policy if exists "Enable read access for all users" on public.invoices;

create policy "Owners can read their own invoices"
  on public.invoices for select to authenticated
  using ((select auth.uid()) = user_id);
