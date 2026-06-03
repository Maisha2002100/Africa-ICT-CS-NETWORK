-- ============================================================
-- Africa ICT & CS Network — Supabase Setup (Safe Re-run)
-- Project: oqkbcnnjudfhlizrqjeu.supabase.co
-- Site URL: https://maisha2002100.github.io/Africa-ICT-CS-NETWORK/
--
-- This script is safe to run multiple times — it drops existing
-- policies before recreating them, so no duplicate errors.
--
-- AFTER RUNNING:
-- 1. Authentication → Providers → Email → Enable → Save
-- 2. Authentication → URL Configuration:
--      Site URL: https://maisha2002100.github.io/Africa-ICT-CS-NETWORK/
--      Redirect URLs (add all 3):
--        https://maisha2002100.github.io/Africa-ICT-CS-NETWORK/
--        https://maisha2002100.github.io/*
--        http://localhost:3000/*
-- 3. Create admin in Authentication → Users:
--      Email: admin@africaictcs.com  Password: Admin@AfricaICT2025!
-- 4. Run the UPDATE at the bottom to grant admin role
-- ============================================================

-- ── 1. PROFILES ──────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  email        text,
  country      text default 'Kenya',
  role         text default 'learner' check (role in ('learner','instructor','admin')),
  avatar_url   text,
  bio          text,
  approved     boolean default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
alter table public.profiles enable row level security;

-- Drop existing policies first to avoid duplicate errors
drop policy if exists "Public profiles readable"        on public.profiles;
drop policy if exists "Users update own profile"        on public.profiles;
drop policy if exists "Admins manage profiles"          on public.profiles;

create policy "Public profiles readable"
  on public.profiles for select using (true);
create policy "Users update own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Admins manage profiles"
  on public.profiles for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, country, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'country', 'Kenya'),
    coalesce(new.raw_user_meta_data->>'role', 'learner')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 2. COURSES ────────────────────────────────────────────────
create table if not exists public.courses (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,
  category       text not null,
  level          text default 'Beginner' check (level in ('Beginner','Intermediate','Advanced')),
  instructor_id  uuid references public.profiles(id) on delete set null,
  price_kes      numeric default 0,
  original_price numeric,
  duration_hrs   numeric default 0,
  lesson_count   integer default 0,
  language       text default 'EN',
  thumbnail_url  text,
  published      boolean default false,
  featured       boolean default false,
  avg_rating     numeric default 5.0,
  review_count   integer default 0,
  badge          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
alter table public.courses enable row level security;

drop policy if exists "Published courses public"  on public.courses;
drop policy if exists "Admins manage courses"      on public.courses;
drop policy if exists "Instructors manage own courses" on public.courses;

create policy "Published courses public"
  on public.courses for select using (
    published = true or
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','instructor'))
  );
create policy "Admins manage courses"
  on public.courses for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── 3. ENROLLMENTS ───────────────────────────────────────────
create table if not exists public.enrollments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles(id) on delete cascade,
  course_id        uuid references public.courses(id) on delete cascade,
  status           text default 'active' check (status in ('active','completed','paused','refunded')),
  progress_percent integer default 0,
  enrolled_at      timestamptz default now(),
  completed_at     timestamptz,
  unique (user_id, course_id)
);
alter table public.enrollments enable row level security;

drop policy if exists "Users see own enrollments"  on public.enrollments;
drop policy if exists "Users enroll"               on public.enrollments;
drop policy if exists "Users update progress"      on public.enrollments;
drop policy if exists "Admins manage enrollments"  on public.enrollments;

create policy "Users see own enrollments"
  on public.enrollments for select using (user_id = auth.uid());
create policy "Users enroll"
  on public.enrollments for insert with check (user_id = auth.uid());
create policy "Users update progress"
  on public.enrollments for update using (user_id = auth.uid());
create policy "Admins manage enrollments"
  on public.enrollments for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── 4. PAYMENTS ──────────────────────────────────────────────
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id) on delete set null,
  course_id     uuid references public.courses(id) on delete set null,
  amount        numeric not null,
  phone         text,
  provider      text default 'mpesa',
  reference     text unique,
  payhero_ref   text,
  status        text default 'pending' check (status in ('pending','completed','failed','cancelled','refunded')),
  created_at    timestamptz default now(),
  completed_at  timestamptz
);
alter table public.payments enable row level security;

drop policy if exists "Users see own payments"   on public.payments;
drop policy if exists "Anyone insert payment"    on public.payments;
drop policy if exists "Users update own payments" on public.payments;
drop policy if exists "Admins manage payments"   on public.payments;

create policy "Users see own payments"
  on public.payments for select using (user_id = auth.uid());
create policy "Anyone insert payment"
  on public.payments for insert with check (true);
create policy "Users update own payments"
  on public.payments for update using (user_id = auth.uid());
create policy "Admins manage payments"
  on public.payments for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── 5. INSTRUCTOR APPLICATIONS ───────────────────────────────
create table if not exists public.instructor_applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  expertise   text not null,
  bio         text,
  status      text default 'pending' check (status in ('pending','approved','rejected')),
  admin_note  text,
  reviewed_at timestamptz,
  created_at  timestamptz default now()
);
alter table public.instructor_applications enable row level security;

drop policy if exists "Users see own apps"   on public.instructor_applications;
drop policy if exists "Users apply"          on public.instructor_applications;
drop policy if exists "Admins manage apps"   on public.instructor_applications;

create policy "Users see own apps"
  on public.instructor_applications for select using (user_id = auth.uid());
create policy "Users apply"
  on public.instructor_applications for insert with check (user_id = auth.uid());
create policy "Admins manage apps"
  on public.instructor_applications for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── 6. CERTIFICATES ──────────────────────────────────────────
create table if not exists public.certificates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  course_id   uuid references public.courses(id) on delete cascade,
  cert_number text unique default 'AICTN-' || upper(substr(gen_random_uuid()::text, 1, 8)),
  issued_at   timestamptz default now(),
  unique (user_id, course_id)
);
alter table public.certificates enable row level security;

drop policy if exists "Users see own certs"  on public.certificates;
drop policy if exists "Public verify certs"  on public.certificates;
drop policy if exists "Admins manage certs"  on public.certificates;

create policy "Users see own certs"
  on public.certificates for select using (user_id = auth.uid());
create policy "Public verify certs"
  on public.certificates for select using (true);
create policy "Admins manage certs"
  on public.certificates for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── 7. SITE SETTINGS ─────────────────────────────────────────
create table if not exists public.site_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz default now()
);
alter table public.site_settings enable row level security;

drop policy if exists "Public read settings"    on public.site_settings;
drop policy if exists "Admins manage settings"  on public.site_settings;

create policy "Public read settings"
  on public.site_settings for select using (true);
create policy "Admins manage settings"
  on public.site_settings for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

insert into public.site_settings (key, value) values
  ('announcement',        '🎉 Welcome to Africa ICT & CS Network — 420+ expert-led courses now live!'),
  ('announcement_active', 'true'),
  ('hero_title',          'Learn Tech. Build Africa. Lead the World.'),
  ('hero_subtitle',       'Expert-led courses in web dev, data science, AI, cybersecurity & more — built for African learners.')
on conflict (key) do nothing;

-- ── 8. REALTIME ───────────────────────────────────────────────
alter publication supabase_realtime add table public.courses;
alter publication supabase_realtime add table public.site_settings;
alter publication supabase_realtime add table public.enrollments;
alter publication supabase_realtime add table public.payments;

-- ── 9. GRANT ADMIN ROLE ───────────────────────────────────────
-- Run this AFTER creating the admin user in Auth → Users
-- (Email: admin@africaictcs.com  Password: Admin@AfricaICT2025!)
--
-- UPDATE public.profiles
-- SET role = 'admin', full_name = 'Super Admin', approved = true
-- WHERE email = 'admin@africaictcs.com';
-- ============================================================
