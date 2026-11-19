-- Bench case detail_page: the list is scoped by row level security, but each note's own page
-- loads it through a function that takes the id and never checks who is asking. Anyone who has
-- (or guesses) the address of someone else's note can read it.

drop table if exists public.bench_detail_page cascade;
create table public.bench_detail_page (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
alter table public.bench_detail_page enable row level security;
create policy "Owners read their notes" on public.bench_detail_page
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add their notes" on public.bench_detail_page
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners edit their notes" on public.bench_detail_page
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their notes" on public.bench_detail_page
  for delete to authenticated using ((select auth.uid()) = user_id);
create or replace function public.bench_detail_page_get(note_id uuid)
returns setof public.bench_detail_page
language sql stable security definer set search_path = ''
as $$ select * from public.bench_detail_page where id = note_id $$;
