# Xiaoler Asset Library

Xiaoler is a community website for sharing sprites, sounds, photos, videos, and other creative assets.

## Preview locally

You do not need to install anything to start editing:

1. Open `index.html` in a browser.
2. The page will show three example assets.
3. Upload and sign-in controls need Supabase before they can work.

For a better local preview, VS Code's **Live Server** extension will refresh the page as you edit.

## GitHub Pages

1. Open the repository on GitHub.
2. Open **Settings** → **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select `main` and `/ (root)`, then save.
5. GitHub will give you a public address for the website.

## Add real uploads with Supabase

Supabase provides accounts and file storage. It has a free starter tier, but you should monitor your project's usage in the Supabase dashboard.

### 1. Create a project

1. Create an account at https://supabase.com
2. Create a new project.
3. Open **Project Settings** → **API**.
4. Copy the **Project URL** and **anon public** key.
5. In `app.js`, replace the empty `SUPABASE_URL` and `SUPABASE_ANON_KEY` values.

The anon key is public and is safe to use in a browser. Never put a service-role key in `app.js`.

### 2. Create the database table

Open **SQL Editor** in Supabase and run:

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

create policy "Anyone can read assets"
on public.assets for select
using (true);

create policy "Users can insert their own assets"
on public.assets for insert
with check (auth.uid() = uploader_id);

create policy "Users can delete their own assets"
on public.assets for delete
using (auth.uid() = uploader_id);
```

### 3. Create the storage bucket

Open **Storage**, create a public bucket named `assets`, and apply these policies:

- SELECT: public
- INSERT: authenticated users
- UPDATE: uploader only
- DELETE: uploader only

Supabase Storage policy SQL can look like:

```sql
create policy "Anyone can view assets"
on storage.objects for select
using (bucket_id = 'assets');

create policy "Signed-in users can upload assets"
on storage.objects for insert
with check (
  bucket_id = 'assets'
  and auth.uid() is not null
);

create policy "Users can delete their own asset files"
on storage.objects for delete
using (
  bucket_id = 'assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

### 4. Configure sign-in

In Supabase open **Authentication** → **URL Configuration** and add:

- Your GitHub Pages URL as a **Site URL**
- `http://localhost:3000/**` if you use a local server
- Your GitHub Pages URL with `/**` as a redirect URL

The site uses email sign-in links, so visitors do not need to create passwords.

## Important safety notes

- The browser checks that a file is under 25 MB and is not executable, but it is not a security boundary.
- The public bucket should contain only the asset types you support.
- Add moderation tools before a public launch: reports, blocking, deletion, and review.
- Never add secrets or a Supabase service-role key to repository files.

## Files in this project

- `index.html` describes the page and its buttons.
- `styles.css` controls colors, layout, spacing, and responsive design.
- `app.js` controls filtering, previews, authentication, uploads, and database requests.
- `README.md` contains setup instructions.
