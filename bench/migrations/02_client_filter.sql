-- Bench case client_filter: the page asks only for the signed-in user's rows (user_id=eq.<me>),
-- but the read policy lets any signed-in account read every row. The page looks right; the API is open.

drop table if exists public.bench_client_filter cascade;
create table public.bench_client_filter (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
alter table public.bench_client_filter enable row level security;
create policy "Signed-in users can read notes" on public.bench_client_filter
  for select to authenticated using (true);
create policy "Owners add their notes" on public.bench_client_filter
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners edit their notes" on public.bench_client_filter
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their notes" on public.bench_client_filter
  for delete to authenticated using ((select auth.uid()) = user_id);
