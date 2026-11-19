-- Bench case leaky_rpc: the page loads "my notes" through a database function. The table's
-- policies are right, but the function is security definer and forgets to filter by the caller,
-- so it returns every account's notes. The page filters them in the browser.

drop table if exists public.bench_leaky_rpc cascade;
create table public.bench_leaky_rpc (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
alter table public.bench_leaky_rpc enable row level security;
create policy "Owners read their notes" on public.bench_leaky_rpc
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add their notes" on public.bench_leaky_rpc
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners edit their notes" on public.bench_leaky_rpc
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their notes" on public.bench_leaky_rpc
  for delete to authenticated using ((select auth.uid()) = user_id);
create or replace function public.bench_leaky_rpc_mine()
returns setof public.bench_leaky_rpc
language sql stable security definer set search_path = ''
as $$ select * from public.bench_leaky_rpc order by created_at desc $$;
