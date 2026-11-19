# The Xiao Library (TXL)

TXL is a community library for sprites, sounds, photos, videos, and other creative assets.

## Preview and deployment

Open `index.html` locally for the demo, or publish the repository's `main` branch from **Settings → Pages**. The production URL is https://xiaolerdacoder.github.io/The-Xiao-Library/.

## Supabase setup

The browser client uses the project URL and publishable key in `app.js`; never put a service-role/secret key in browser code. Configure Supabase Auth **Site URL** and redirect URL as `https://xiaolerdacoder.github.io/The-Xiao-Library/`.

The initial database and storage instructions are in the repository history / original setup documentation. For the new features, run `setup.sql` in Supabase **SQL Editor** after the original `assets` and `profiles` tables exist. Create public storage buckets named `assets` and `avatars` and configure their upload policies as described in the original setup instructions. Do not rerun table-creation SQL if your project already has the original tables; `setup.sql` is an additive migration.

New features require the migration: favorites, comments, collections, reports, and admin moderation. To grant moderation access, set the intended user's profile role from the Supabase SQL editor, not from the website:

```sql
update public.profiles set role = 'admin' where id = 'AUTH_USER_UUID';
```

The admin role is deliberately not exposed as an editable profile field. Public collection pages are available through the collection links; private collections remain owner-only.

## Features

- Search, category filters, sorting, and pagination.
- Preview image, video, and audio assets; open/save files and copy links.
- Sign-in, editable profile/avatar, and uploads.
- Favorites, My uploads, comments, and user collections.
- Public profile and collection links.
- Report queue for designated admins.

Comments, favorites, collections, and moderation depend on the Supabase migration in `setup.sql`. Public file buckets make shared files accessible to anyone with their links. Browser-side upload checks are usability checks, not a security boundary; apply reasonable project limits and review content before a public launch.
