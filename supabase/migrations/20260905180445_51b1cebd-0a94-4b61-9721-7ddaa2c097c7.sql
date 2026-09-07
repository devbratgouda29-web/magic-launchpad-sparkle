ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS division text NOT NULL DEFAULT 'General';