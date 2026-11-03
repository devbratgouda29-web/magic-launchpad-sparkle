-- Global player tag on profiles so leaders can invite any player by #USR-XXXX
ALTER TABLE public.profiles ADD COLUMN user_tag text;
CREATE UNIQUE INDEX profiles_user_tag_unique ON public.profiles (user_tag) WHERE user_tag IS NOT NULL;
COMMENT ON COLUMN public.profiles.user_tag IS 'Globally unique player tag (#USR-XXXX) used for direct council invites and lookup';

-- Helper functions (SECURITY DEFINER so policies avoid recursive RLS checks)
CREATE OR REPLACE FUNCTION public.is_council_leader(_council_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.council_members cm
    WHERE cm.council_id = _council_id
      AND cm.user_id = auth.uid()
      AND cm.is_leader
  )
$$;

CREATE OR REPLACE FUNCTION public.is_council_member(_council_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.council_members cm
    WHERE cm.council_id = _council_id
      AND cm.user_id = auth.uid()
  )
$$;

-- Direct invites to a player tag on an open seat
CREATE TABLE public.council_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_id uuid NOT NULL REFERENCES public.councils(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL,
  target_user_id uuid NOT NULL,
  target_tag text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX council_invites_one_pending_per_target
  ON public.council_invites (council_id, target_user_id) WHERE status = 'pending';
CREATE INDEX council_invites_target_idx ON public.council_invites (target_user_id, status);
CREATE INDEX council_invites_council_idx ON public.council_invites (council_id, status);

ALTER TABLE public.council_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invites are viewable by target, inviter, and council members"
  ON public.council_invites FOR SELECT TO authenticated
  USING (target_user_id = auth.uid() OR invited_by = auth.uid() OR public.is_council_member(council_id));

CREATE POLICY "Council leaders can send invites"
  ON public.council_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_council_leader(council_id));

CREATE POLICY "Invite targets can respond"
  ON public.council_invites FOR UPDATE TO authenticated
  USING (target_user_id = auth.uid())
  WITH CHECK (target_user_id = auth.uid());

CREATE POLICY "Inviters can cancel their invites"
  ON public.council_invites FOR DELETE TO authenticated
  USING (invited_by = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.council_invites TO authenticated;
GRANT ALL ON public.council_invites TO service_role;

-- Join requests when a player asks to enter a council by tag
CREATE TABLE public.council_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_id uuid NOT NULL REFERENCES public.councils(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL,
  requester_tag text NOT NULL,
  requester_name text NOT NULL DEFAULT 'You'::text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX council_join_requests_one_pending_per_requester
  ON public.council_join_requests (council_id, requester_id) WHERE status = 'pending';
CREATE INDEX council_join_requests_council_idx ON public.council_join_requests (council_id, status);
CREATE INDEX council_join_requests_requester_idx ON public.council_join_requests (requester_id, status);

ALTER TABLE public.council_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Join requests are viewable by requester and council members"
  ON public.council_join_requests FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR public.is_council_member(council_id));

CREATE POLICY "Players can submit their own join requests"
  ON public.council_join_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Council leaders can approve or decline join requests"
  ON public.council_join_requests FOR UPDATE TO authenticated
  USING (public.is_council_leader(council_id))
  WITH CHECK (public.is_council_leader(council_id));

CREATE POLICY "Requesters can withdraw their own requests"
  ON public.council_join_requests FOR DELETE TO authenticated
  USING (requester_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.council_join_requests TO authenticated;
GRANT ALL ON public.council_join_requests TO service_role;

-- Approved join requests seat the requester: council creator (leader) may insert seats
CREATE POLICY "Council leaders can seat approved members"
  ON public.council_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.councils c
      WHERE c.id = council_id AND c.created_by = auth.uid()
    )
  );

-- Keep updated_at fresh on both new tables
CREATE TRIGGER set_council_invites_updated_at
  BEFORE UPDATE ON public.council_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_council_join_requests_updated_at
  BEFORE UPDATE ON public.council_join_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime: every council-related table broadcasts changes to connected phones
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'councils'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.councils;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'council_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.council_members;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'council_invites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.council_invites;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'council_join_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.council_join_requests;
  END IF;
END $$;