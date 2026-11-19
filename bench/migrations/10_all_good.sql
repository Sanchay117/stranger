-- Bench case all_good: owner-only policies for every action, and each note's own page reads it
-- through row level security. Stranger should find nothing here.

drop table if exists public.bench_all_good cascade;
create table public.bench_all_good (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
alter table public.bench_all_good enable row level security;
create policy "Owners read their notes" on public.bench_all_good
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add their notes" on public.bench_all_good
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners edit their notes" on public.bench_all_good
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their notes" on public.bench_all_good
  for delete to authenticated using ((select auth.uid()) = user_id);
-- Each note is also saved as a file in its own private bucket, readable only from the owner's folder.
insert into storage.buckets (id, name, public) values ('bench-good', 'bench-good', false)
  on conflict (id) do update set public = false;
drop policy if exists "Bench good: owners read their files" on storage.objects;
drop policy if exists "Bench good: owners upload to their folder" on storage.objects;
drop policy if exists "Bench good: owners replace their files" on storage.objects;
drop policy if exists "Bench good: owners delete their files" on storage.objects;
create policy "Bench good: owners read their files" on storage.objects
  for select to authenticated using (bucket_id = 'bench-good' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Bench good: owners upload to their folder" on storage.objects
  for insert to authenticated with check (bucket_id = 'bench-good' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Bench good: owners replace their files" on storage.objects
  for update to authenticated using (bucket_id = 'bench-good' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Bench good: owners delete their files" on storage.objects
  for delete to authenticated using (bucket_id = 'bench-good' and (storage.foldername(name))[1] = (select auth.uid())::text);
