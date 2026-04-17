-- Add optional campaign video URL (Cloudinary or other HTTPS URL).
-- Run once against existing databases.

ALTER TABLE public.editorial
  ADD COLUMN IF NOT EXISTS video_url text;

COMMENT ON COLUMN public.editorial.video_url IS 'Optional HTTPS URL for campaign video; poster still uses image_url.';
