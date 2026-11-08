CREATE OR REPLACE FUNCTION public.approve_council_join_request(_request_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_row public.council_join_requests%ROWTYPE;
  council_row public.councils%ROWTYPE;
  requester_name text;
BEGIN
  SELECT * INTO request_row
  FROM public.council_join_requests
  WHERE id = _request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Join request not found'; END IF;
  IF NOT public.is_council_leader(request_row.council_id) THEN
    RAISE EXCEPTION 'Only the council leader can approve requests';
  END IF;
  IF request_row.status <> 'pending' THEN RAISE EXCEPTION 'Join request is no longer pending'; END IF;

  SELECT * INTO council_row
  FROM public.councils
  WHERE id = request_row.council_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Council not found'; END IF;
  IF (SELECT count(*) FROM public.council_members WHERE council_id = council_row.id) >= 5 THEN
    RAISE EXCEPTION 'Council is full (Maximum 5 seats occupied)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.council_members WHERE user_id = request_row.requester_id) THEN
    RAISE EXCEPTION 'Requester already belongs to a council';
  END IF;

  INSERT INTO public.council_members (council_id, user_id, user_tag, name, is_leader, daily_stats)
  VALUES (request_row.council_id, request_row.requester_id, request_row.requester_tag,
          request_row.requester_name, false, '{}'::jsonb);
  UPDATE public.council_join_requests SET status = 'approved' WHERE id = request_row.id;
  RETURN 'approved';
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_council_invite(_invite_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_row public.council_invites%ROWTYPE;
  council_row public.councils%ROWTYPE;
  player_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO invite_row
  FROM public.council_invites
  WHERE id = _invite_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  IF invite_row.target_user_id <> auth.uid() THEN RAISE EXCEPTION 'This invite belongs to another player'; END IF;
  IF invite_row.status <> 'pending' THEN RAISE EXCEPTION 'Invite is no longer pending'; END IF;

  SELECT * INTO council_row
  FROM public.councils
  WHERE id = invite_row.council_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Council not found'; END IF;
  IF (SELECT count(*) FROM public.council_members WHERE council_id = council_row.id) >= 5 THEN
    RAISE EXCEPTION 'Council is full (Maximum 5 seats occupied)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.council_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'You already belong to a council';
  END IF;

  SELECT COALESCE(NULLIF(full_name, ''), invite_row.target_tag) INTO player_name
  FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.council_members (council_id, user_id, user_tag, name, is_leader, daily_stats)
  VALUES (invite_row.council_id, auth.uid(), invite_row.target_tag,
          COALESCE(player_name, invite_row.target_tag), false, '{}'::jsonb);
  UPDATE public.council_invites SET status = 'accepted' WHERE id = invite_row.id;
  RETURN 'accepted';
END;
$$;

REVOKE ALL ON FUNCTION public.approve_council_join_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_council_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_council_join_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_council_invite(uuid) TO authenticated;