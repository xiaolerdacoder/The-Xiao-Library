create extension if not exists pgcrypto;

-- Run this once in Supabase SQL Editor after the original TXL schema is installed.
alter table public.profiles add column if not exists role text not null default 'user' check (role in ('user', 'admin'));

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, asset_id)
);
alter table public.favorites enable row level security;
drop policy if exists "Users manage own favorites" on public.favorites;
create policy "Users manage own favorites" on public.favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.comments enable row level security;
drop policy if exists "Anyone reads comments" on public.comments;
drop policy if exists "Signed in users add comments" on public.comments;
drop policy if exists "Authors delete own comments" on public.comments;
create policy "Anyone reads comments" on public.comments for select using (true);
create policy "Signed in users add comments" on public.comments for insert with check (auth.uid() = user_id);
create policy "Authors delete own comments" on public.comments for delete using (auth.uid() = user_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.collections enable row level security;
drop policy if exists "Public collections visible and owners manage" on public.collections;
create policy "Public collections visible and owners manage" on public.collections for all
using (is_public or auth.uid() = owner_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (auth.uid() = owner_id);

create table if not exists public.collection_assets (
  collection_id uuid not null references public.collections(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, asset_id)
);
alter table public.collection_assets enable row level security;
drop policy if exists "Collection items visible to viewers and writable by owners" on public.collection_assets;
create policy "Collection items visible to viewers and writable by owners" on public.collection_assets for all
using (exists (select 1 from public.collections c where c.id = collection_id and (c.is_public or c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))))
with check (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()));

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "Users submit reports" on public.reports;
drop policy if exists "Admins view and manage reports" on public.reports;
create policy "Users submit reports" on public.reports for insert with check (auth.uid() = reporter_id);
create policy "Admins view and manage reports" on public.reports for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Admins can remove any asset; owners retain their existing ability to delete their own.
drop policy if exists "Admins moderate assets" on public.assets;
create policy "Admins moderate assets" on public.assets for delete
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- The profile username and avatar remain public; role is not editable through client-side policies.
