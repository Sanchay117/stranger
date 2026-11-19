-- Bench case broadcast_leak: notes are scoped, but each new note is also broadcast for live updates
-- on the public channel bench_broadcast_leak:<user id>. Public channels need no permission, and the
-- name is easy to guess, so anyone who joins it hears the owner's notes as they are saved.

drop table if exists public.bench_broadcast_leak cascade;
create table public.bench_broadcast_leak (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
alter table public.bench_broadcast_leak enable row level security;
create policy "Owners read their notes" on public.bench_broadcast_leak
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add their notes" on public.bench_broadcast_leak
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners edit their notes" on public.bench_broadcast_leak
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their notes" on public.bench_broadcast_leak
  for delete to authenticated using ((select auth.uid()) = user_id);
create or replace function public.bench_broadcast_leak_send()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'title', new.title, 'body', new.body),
    'new_note',
    'bench_broadcast_leak:' || new.user_id::text,
    false
  );
  return new;
end
$$;
create trigger bench_broadcast_leak_send after insert on public.bench_broadcast_leak
  for each row execute function public.bench_broadcast_leak_send();
