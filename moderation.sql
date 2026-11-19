-- AI moderation migration. Run after the original TXL schema and feature setup.sql.
-- The public assets bucket contains only approved files; new uploads are staged privately.
alter table public.assets add column if not exists status text not null default 'approved' check (status in ('pending', 'approved'));
alter table public.assets add column if not exists file_path text;
alter table public.assets add column if not exists moderation_categories jsonb not null default '{}'::jsonb;

update public.assets set status = 'approved' where status is null;

drop policy if exists "Anyone can read assets" on public.assets;
drop policy if exists "Users can insert their own assets" on public.assets;
drop policy if exists "Admins can read all assets" on public.assets;
drop policy if exists "Admins can update assets" on public.assets;
create policy "Read approved assets or own/admin uploads" on public.assets for select
using (status = 'approved' or uploader_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "Admins can update assets" on public.assets for update
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Only the Edge Function (service role) inserts assets after moderation.
-- Keep user deletes restricted to their own uploads; the existing owner delete policy remains.

insert into storage.buckets (id, name, public) values ('assets-staging', 'assets-staging', false) on conflict (id) do update set public = false;
drop policy if exists "Users upload own staged assets" on storage.objects;
drop policy if exists "Users delete own staged assets" on storage.objects;
create policy "Users upload own staged assets" on storage.objects for insert
with check (bucket_id = 'assets-staging' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete own staged assets" on storage.objects for delete
using (bucket_id = 'assets-staging' and (storage.foldername(name))[1] = auth.uid()::text);

-- Ensure the approved assets bucket remains public for the existing public preview/download links.
update storage.buckets set public = true where id = 'assets';
