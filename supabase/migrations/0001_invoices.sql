-- Duebook schema, written the way AI app builders often ship it.
-- RLS is on, so the dashboard shows the table as protected, but the read
-- policy lets anyone read every row. With one account you never notice.

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_name text not null,
  client_email text,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD',
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'overdue')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists invoices_user_id_idx on public.invoices (user_id);

alter table public.invoices enable row level security;

create policy "Enable read access for all users"
  on public.invoices for select
  using (true);

create policy "Users can insert their own invoices"
  on public.invoices for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own invoices"
  on public.invoices for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own invoices"
  on public.invoices for delete to authenticated
  using ((select auth.uid()) = user_id);
