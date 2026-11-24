# Veritas MUN

Model United Nations conference website (`React + Vite + TypeScript + Tailwind CSS`) with Supabase authentication, team portal, and admin CMS/roster panel.

---

## Architecture Overview

- `/` — Public editorial website with 3D Three.js dotted globe intro, interactive Statue of Liberty torch, Secretariat drag cards, and dynamically loaded conference sections.
- `/login` — Team sign-in, password reset request, and password recovery completion.
- `/signup` — Roster-gated team sign-up (requires an email already added by an admin to `public.roster` and email verification).
- `/account` — Authenticated team member portal displaying role, department, position, targeted announcements, and password update.
- `/admin` — Admin console (enforced by Postgres Row Level Security + `profiles.role = 'admin'`) with Overview, Roster (CRUD + CSV import/export), Members, Site Content (drafts, live preview, publish), Team Cards (drag-and-drop reorder + compressed photo upload), Announcements, Settings, and Audit Log.

---

## Setup Instructions

### 1. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In **Project Settings -> API**, copy:
   - **Project URL** (`VITE_SUPABASE_URL`)
   - **anon / public key** (`VITE_SUPABASE_ANON_KEY`)
   > Never place your `service_role` key in frontend code or `VITE_*` environment variables.

### 2. Run the Database Migration
1. Open **SQL Editor** in your Supabase Dashboard.
2. Paste and execute the contents of `/supabase/migrations/001_veritas_mun.sql`.
3. Verify it created:
   - Tables: `roster`, `profiles`, `site_content`, `site_content_drafts`, `team_cards`, `audit_log`, `announcements`
   - Storage bucket: `team-photos`
   - RLS policies on every table and `storage.objects`
   - Sign-up gatekeeping triggers (`trg_enforce_roster_on_signup`, `trg_handle_new_roster_user`) on `auth.users`

### 3. Enable Email Confirmation & Auth URLs
1. In **Authentication -> Providers -> Email**:
   - Ensure **Confirm email** is enabled.
2. In **Authentication -> URL Configuration**:
   - Set **Site URL** to your production Vercel URL (e.g. `https://your-site.vercel.app`) or `http://localhost:3000` for local dev.
   - Add Redirect URLs:
     - `http://localhost:3000/login`
     - `https://your-site.vercel.app/login`

### 4. Local Development Environment Variables
Copy `.env.example` to `.env.local` and fill in your values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Install dependencies and run locally:

```bash
npm install
npm run dev
```

### 5. Deploy to Vercel
1. Connect this repository in Vercel.
2. Add the environment variables in **Vercel Project Settings -> Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. `/vercel.json` is preconfigured to rewrite `/login`, `/signup`, `/account`, and `/admin` cleanly to `/index.html`.

### 6. Create Your First Admin
1. First, insert your own record into `public.roster` in the Supabase SQL Editor (replace with your real details):

```sql
insert into public.roster (full_name, email, phone, department, position)
values ('Your Name', 'you@example.edu', '555-0100', 'Secretariat', 'SG');
```

2. Open `/signup` on your site, create your account using that exact email (password >= 10 characters), and click the confirmation link in your email inbox.
3. Run this one-time SQL in Supabase to promote your account to `admin`:

```sql
update public.profiles
set role = 'admin'
where lower(email) = lower('you@example.edu');
```

4. Sign in at `/login` and visit `/admin`.

---

## Sample Roster CSV Format

Use this format in **Admin -> Roster -> Import CSV** (the rows below are fake examples):

```csv
full_name,email,phone,department,position
Jane Doe,jane.doe@example.edu,555-0101,Secretariat,SG
Alex Smith,alex.smith@example.edu,555-0102,Crisis,Head
Samira Patel,samira.patel@example.edu,555-0103,Operations,Co-head
David Kim,david.kim@example.edu,555-0104,Press,Member
```

Any row whose `position` includes `head` (case-insensitive) automatically receives the `head` role upon sign-up; all others start as `member`.
