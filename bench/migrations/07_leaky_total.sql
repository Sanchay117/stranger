-- Bench case leaky_total: every policy on the notes is right, but the "total" on the page comes
-- from a view made without security_invoker, so it adds up every account's notes. No text leaks,
-- only a number that moves when someone else adds a note.

drop table if exists public.bench_leaky_total cascade;
create table public.bench_leaky_total (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
alter table public.bench_leaky_total enable row level security;
create policy "Owners read their notes" on public.bench_leaky_total
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add their notes" on public.bench_leaky_total
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners edit their notes" on public.bench_leaky_total
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their notes" on public.bench_leaky_total
  for delete to authenticated using ((select auth.uid()) = user_id);
create view public.bench_leaky_total_sum as
  select coalesce(sum(amount_cents), 0)::bigint as total_cents, count(*)::int as notes from public.bench_leaky_total;
revoke insert, update, delete on public.bench_leaky_total_sum from anon, authenticated;
