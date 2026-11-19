-- Bench case rls_off: row level security is never turned on, so every account (and anyone
-- with the public key) reads every row. The most common Supabase leak.

drop table if exists public.bench_rls_off cascade;
create table public.bench_rls_off (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
alter table public.bench_rls_off disable row level security;
