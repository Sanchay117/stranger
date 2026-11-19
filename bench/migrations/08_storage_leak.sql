-- Bench case storage_leak: notes are scoped, and each note is also saved as a file in the private
-- bucket bench-files under <user id>/. But the storage read policy only checks the bucket, so any
-- signed-in account can download or list anyone's files.

drop table if exists public.bench_storage_leak cascade;
create table public.bench_storage_leak (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
alter table public.bench_storage_leak enable row level security;
create policy "Owners read their notes" on public.bench_storage_leak
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add their notes" on public.bench_storage_leak
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners edit their notes" on public.bench_storage_leak
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their notes" on public.bench_storage_leak
  for delete to authenticated using ((select auth.uid()) = user_id);
insert into storage.buckets (id, name, public) values ('bench-files', 'bench-files', false)
  on conflict (id) do update set public = false;
drop policy if exists "Bench: signed-in users can read files" on storage.objects;
drop policy if exists "Bench: owners upload to their folder" on storage.objects;
drop policy if exists "Bench: owners replace their files" on storage.objects;
drop policy if exists "Bench: owners delete their files" on storage.objects;
create policy "Bench: signed-in users can read files" on storage.objects
  for select to authenticated using (bucket_id = 'bench-files');
create policy "Bench: owners upload to their folder" on storage.objects
  for insert to authenticated with check (bucket_id = 'bench-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Bench: owners replace their files" on storage.objects
  for update to authenticated using (bucket_id = 'bench-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Bench: owners delete their files" on storage.objects
  for delete to authenticated using (bucket_id = 'bench-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
