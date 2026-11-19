# The Xiao Library (TXL)

TXL is a community website for sharing sprites, sounds, photos, videos, and other creative assets.

## Preview locally

1. Open `index.html` in a browser to see the demo library.
2. The example assets, search, and category filter work without a backend.
3. Sign-in, profile editing, and uploads need Supabase to be configured first.

For a better local preview, VS Code's **Live Server** extension will refresh the page as you edit.

## Publish with GitHub Pages

1. Open the repository on GitHub.
2. Open **Settings** → **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select `main` and `/ (root)`, then save.
5. GitHub will display the public site address when publishing finishes.

## Set up accounts, profiles, and uploads with Supabase

Supabase provides user accounts, a database, and file storage. Monitor usage and set project limits in your Supabase dashboard.

### 1. Create a Supabase project

1. Create an account at https://supabase.com and create a project.
2. Open **Project Settings** → **API**.
3. Copy the **Project URL** and **anon public** key.
4. Put them into the `SUPABASE_URL` and `SUPABASE_ANON_KEY` constants near the top of `app.js`.

The anon key is public and is intended for browser use. Never put a service-role key in website code.

### 2. Create the asset and profile tables

Open Supabase **SQL Editor** and run:

```sql
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  description text not null default '',
  category text not null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null,
  file_url text not null,
  uploader_id uuid references auth.users(id) default auth.uid()
);

alter table public.assets enable row level security;
create policy "Anyone can read assets" on public.assets for select using (true);
create policy "Users can insert their own assets" on public.assets for insert with check (auth.uid() = uploader_id);
create policy "Users can delete their own assets" on public.assets for delete using (auth.uid() = uploader_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 24),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Anyone can view profiles" on public.profiles for select using (true);
create policy "Users can create their own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
```

### 3. Create storage buckets

In **Storage**, create two buckets:

- `assets` — public bucket for shared files.
- `avatars` — public bucket for profile pictures.

A public bucket allows visitors to view/download files. Add these policies in the SQL Editor for uploads and avatar display:

```sql
create policy "Anyone can view shared assets"
on storage.objects for select
using (bucket_id = 'assets');

create policy "Signed-in users can upload assets"
on storage.objects for insert
with check (bucket_id = 'assets' and auth.uid() is not null);

create policy "Anyone can view profile pictures"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "Users can upload their own profile pictures"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

The website creates new uniquely named avatar files when a user changes their picture, so an update policy is not needed for this version.

### 4. Configure email sign-in

In Supabase open **Authentication** → **URL Configuration**. Set your GitHub Pages URL as the **Site URL**, and add it as a redirect URL. The site uses email sign-in links, so users do not need passwords.

## Important safety notes

- Browser file checks improve the experience but are not a security boundary. Enforce restrictions and monitor usage in Supabase too.
- Public buckets are visible to anyone with their file links. Only upload content you intend to share publicly.
- Add moderation, reporting, blocking, and review tools before a large public launch.
- Never add secrets or a Supabase service-role key to repository files.

## Project files

- `index.html` contains the page structure and profile form.
- `styles.css` controls the ocean-blue colors and layout.
- `app.js` controls search, previews, sign-in, profile editing, and uploads.
- `README.md` explains setup and deployment.
