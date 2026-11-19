-- Bench case leaky_view: the notes table has owner-only policies, but the page reads it through a
-- view made without security_invoker. A view runs with its creator's rights, so row level security
-- never applies and every account's notes come back. The page asks only for its own (user_id=eq.<me>).

drop table if exists public.bench_leaky_view cascade;
create table public.bench_leaky_view (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
alter table public.bench_leaky_view enable row level security;
create policy "Owners read their notes" on public.bench_leaky_view
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add their notes" on public.bench_leaky_view
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners edit their notes" on public.bench_leaky_view
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their notes" on public.bench_leaky_view
  for delete to authenticated using ((select auth.uid()) = user_id);
create view public.bench_leaky_view_list as
  select id, user_id, title, body, amount_cents, created_at from public.bench_leaky_view;
revoke insert, update, delete on public.bench_leaky_view_list from anon, authenticated;
