-- 1) Internal helper functions must not be directly callable by app users
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_admin_to_known_emails() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- has_role must remain callable (RLS policies use it) but no longer needs definer rights:
-- users can read their own rows in user_roles, which is all this check does.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- 2) profiles: hide email from everyone except the owner's own session
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Public profile info is viewable"
ON public.profiles FOR SELECT
TO anon, authenticated
USING (true);

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, full_name, avatar_url, created_at, updated_at) ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 3) review_votes: raw votes are private to their owner; public pages read aggregates only
DROP POLICY IF EXISTS "Review votes are viewable by everyone" ON public.review_votes;

CREATE POLICY "Users can view own votes"
ON public.review_votes FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE VIEW public.review_vote_counts
WITH (security_invoker = false) AS
  SELECT review_id,
         count(*) FILTER (WHERE vote = 1)::int  AS helpful,
         count(*) FILTER (WHERE vote = -1)::int AS unhelpful
  FROM public.review_votes
  GROUP BY review_id;

GRANT SELECT ON public.review_vote_counts TO anon, authenticated, service_role;