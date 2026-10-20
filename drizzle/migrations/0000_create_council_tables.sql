CREATE TABLE public.councils (
  id uuid primary key default gen_random_uuid(),
  council_tag text not null unique,
  name text not null default 'The War Council',
  created_by uuid not null,
  created_at timestamptz not null default now()
);

CREATE TABLE public.council_members (
  id uuid primary key default gen_random_uuid(),
  council_id uuid not null references public.councils(id) on delete cascade,
  user_id uuid not null,
  user_tag text not null,
  name text not null default 'You',
  is_leader boolean not null default false,
  daily_stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

CREATE INDEX council_members_council_id_idx ON public.council_members (council_id);
CREATE INDEX council_members_user_id_idx ON public.council_members (user_id);
CREATE INDEX council_members_user_tag_idx ON public.council_members (lower(user_tag));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.councils TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.council_members TO authenticated;
GRANT ALL ON public.councils TO service_role;
GRANT ALL ON public.council_members TO service_role;

ALTER TABLE public.councils ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.council_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view councils"
  ON public.councils FOR SELECT TO authenticated USING (true);

CREATE POLICY "Creators can create councils"
  ON public.councils FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creators can update own councils"
  ON public.councils FOR UPDATE TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creators can delete own councils"
  ON public.councils FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE POLICY "Signed-in users can view council members"
  ON public.council_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can join as themselves"
  ON public.council_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own seat"
  ON public.council_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave own seat"
  ON public.council_members FOR DELETE TO authenticated USING (user_id = auth.uid());