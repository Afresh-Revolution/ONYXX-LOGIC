-- =============================================================================
-- ONYXX — consolidated PostgreSQL schema (standard Postgres 13+; Supabase-compatible)
-- Requires: gen_random_uuid() (built-in PG 13+; else: CREATE EXTENSION IF NOT EXISTS pgcrypto;)
-- Apply with: psql "$DATABASE_URL" -f sql/schema.sql
-- =============================================================================

SET client_min_messages = WARNING;

-- ---------------------------------------------------------------------------
-- Admin users (Fastify POST /api/auth/login — bcrypt password_hash)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Optional: seed an admin (generate password_hash with bcrypt, e.g. cost 10)
-- INSERT INTO public.admin_users (email, password_hash)
-- VALUES ('you@example.com', '$2b$10$...')
-- ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Public content
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.editorial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  image_url text,
  video_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Legacy: add video column; allow poster-only or video-only rows
ALTER TABLE public.editorial
  ADD COLUMN IF NOT EXISTS video_url text;

ALTER TABLE public.editorial
  ALTER COLUMN image_url DROP NOT NULL;

ALTER TABLE public.editorial
  DROP CONSTRAINT IF EXISTS editorial_media_required;

ALTER TABLE public.editorial
  ADD CONSTRAINT editorial_media_required CHECK (
    NULLIF(TRIM(COALESCE(image_url, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(video_url, '')), '') IS NOT NULL
  );

COMMENT ON COLUMN public.editorial.video_url IS
  'HTTPS URL to campaign video after Cloudinary upload (e.g. .../video/upload/...mp4); surfaced on the public site Film section.';

-- ---------------------------------------------------------------------------
-- Applications (public apply form + admin API)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  date_of_birth date,
  height text,
  city text,
  experience_level text,
  portfolio_url text,
  message text,
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new',
  interview_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applications_status_check CHECK (
    status = ANY (
      ARRAY[
        'new'::text,
        'reviewed'::text,
        'shortlisted'::text,
        'rejected'::text,
        'archived'::text
      ]
    )
  )
);

-- Legacy columns / backfill (safe if already present)
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS interview_at timestamptz;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS photo_urls jsonb;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.applications SET photo_urls = '[]'::jsonb WHERE photo_urls IS NULL;
ALTER TABLE public.applications ALTER COLUMN photo_urls SET DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.applications.message IS 'Tell us about yourself (public apply form).';
COMMENT ON COLUMN public.applications.interview_at IS 'Scheduled interview when status is shortlisted.';
COMMENT ON COLUMN public.applications.photo_urls IS 'JSON array of image HTTPS URLs (e.g. Cloudinary).';

CREATE INDEX IF NOT EXISTS applications_created_at_idx ON public.applications (created_at DESC);
CREATE INDEX IF NOT EXISTS applications_status_idx ON public.applications (status);
CREATE INDEX IF NOT EXISTS applications_email_idx ON public.applications (email);

-- ---------------------------------------------------------------------------
-- Homepage performance metrics + chart data (singleton row id = 1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_metrics (
  id smallint PRIMARY KEY CHECK (id = 1),
  total_earnings_display text NOT NULL DEFAULT '$4.2M',
  brand_partnerships integer NOT NULL DEFAULT 87,
  countries_placements integer NOT NULL DEFAULT 32,
  models_represented integer NOT NULL DEFAULT 250,
  campaigns_delivered integer NOT NULL DEFAULT 1200,
  years_excellence integer NOT NULL DEFAULT 12,
  placement_rate_percent integer NOT NULL DEFAULT 94 CHECK (placement_rate_percent >= 0 AND placement_rate_percent <= 100),
  category_distribution jsonb NOT NULL DEFAULT '[
    {"label":"Editorial","value":35},
    {"label":"Commercial","value":25},
    {"label":"Runway","value":20},
    {"label":"Plus Size","value":12},
    {"label":"Fitness","value":8}
  ]'::jsonb,
  placement_by_year jsonb NOT NULL DEFAULT '[
    {"year":2019,"rate":72},
    {"year":2020,"rate":65},
    {"year":2021,"rate":78},
    {"year":2022,"rate":85},
    {"year":2023,"rate":91},
    {"year":2024,"rate":94},
    {"year":2025,"rate":95},
    {"year":2026,"rate":96}
  ]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.site_metrics (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Row level security (Supabase: anon uses policies; direct Postgres role may bypass)
-- ---------------------------------------------------------------------------
ALTER TABLE public.roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roster_select_public" ON public.roster;
CREATE POLICY "roster_select_public" ON public.roster FOR SELECT USING (true);

DROP POLICY IF EXISTS "editorial_select_public" ON public.editorial;
CREATE POLICY "editorial_select_public" ON public.editorial FOR SELECT USING (true);

ALTER TABLE public.site_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_metrics_select_public" ON public.site_metrics;
CREATE POLICY "site_metrics_select_public" ON public.site_metrics FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- Indexes (sort order)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS roster_sort_idx ON public.roster (sort_order);
CREATE INDEX IF NOT EXISTS editorial_sort_idx ON public.editorial (sort_order);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roster_set_updated_at ON public.roster;
CREATE TRIGGER roster_set_updated_at
  BEFORE UPDATE ON public.roster
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS editorial_set_updated_at ON public.editorial;
CREATE TRIGGER editorial_set_updated_at
  BEFORE UPDATE ON public.editorial
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS applications_set_updated_at ON public.applications;
CREATE TRIGGER applications_set_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS site_metrics_set_updated_at ON public.site_metrics;
CREATE TRIGGER site_metrics_set_updated_at
  BEFORE UPDATE ON public.site_metrics
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();
