-- Bench case forged_insert: reads, edits and deletes are scoped, but the insert policy never
-- checks the owner column, so anyone can add notes to someone else's account.

drop table if exists public.bench_forged_insert cascade;
create table public.bench_forged_insert (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
alter table public.bench_forged_insert enable row level security;
create policy "Owners read their notes" on public.bench_forged_insert
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners edit their notes" on public.bench_forged_insert
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their notes" on public.bench_forged_insert
  for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Signed-in users can add notes" on public.bench_forged_insert
  for insert to authenticated with check (true);
