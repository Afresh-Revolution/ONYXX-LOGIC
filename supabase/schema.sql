-- ONYXX CLUB — standard PostgreSQL (Supabase SQL editor, psql, etc.).
-- Requires: gen_random_uuid() (PostgreSQL 13+, or extension pgcrypto on older versions).

-- ---------------------------------------------------------------------------
-- Admin users (Fastify /api/auth/login checks email + bcrypt password_hash)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz default now()
);

alter table public.admin_users enable row level security;
-- No policies: direct DB connections (backend) bypass RLS; anon cannot read hashes.

-- Seed admin (password plain text: Willy1@gmail.com — bcrypt cost 10)
insert into public.admin_users (email, password_hash)
values (
  'williambosworth420@gmail.com',
  '$2b$10$j3N2E5AKTzN9zSZi3NFntOu20aN5mS/OuXsx.KM6/m23L3B20//ne'
)
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Public site tables
-- ---------------------------------------------------------------------------
create table if not exists public.roster (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.editorial (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Allow video-only rows (direct-to-Cloudinary uploads).
  image_url text,
  video_url text,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Existing deployments: add column if the table was created before video support.
alter table public.editorial
  add column if not exists video_url text;

-- Existing deployments: allow video-only items by dropping NOT NULL.
alter table public.editorial
  alter column image_url drop not null;

-- Enforce: at least one media URL must be present.
alter table public.editorial
  drop constraint if exists editorial_media_required;
alter table public.editorial
  add constraint editorial_media_required
  check (
    nullif(trim(coalesce(image_url, '')), '') is not null
    or nullif(trim(coalesce(video_url, '')), '') is not null
  );

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  date_of_birth date not null,
  height text,
  city text,
  experience_level text,
  portfolio_url text,
  message text,
  photo_urls jsonb,
  status text not null default 'new',
  created_at timestamptz default now()
);

alter table public.roster enable row level security;
alter table public.editorial enable row level security;
alter table public.applications enable row level security;

drop policy if exists "roster_select_public" on public.roster;
create policy "roster_select_public" on public.roster
  for select using (true);

drop policy if exists "editorial_select_public" on public.editorial;
create policy "editorial_select_public" on public.editorial
  for select using (true);

create index if not exists roster_sort_idx on public.roster (sort_order);
create index if not exists editorial_sort_idx on public.editorial (sort_order);
create index if not exists applications_created_at_idx on public.applications (created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists roster_set_updated_at on public.roster;
create trigger roster_set_updated_at
  before update on public.roster
  for each row execute procedure public.set_updated_at();

drop trigger if exists editorial_set_updated_at on public.editorial;
create trigger editorial_set_updated_at
  before update on public.editorial
  for each row execute procedure public.set_updated_at();
