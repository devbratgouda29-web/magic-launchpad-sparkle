DROP VIEW IF EXISTS public.review_vote_counts;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS helpful_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unhelpful_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_review_vote_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target uuid := coalesce(NEW.review_id, OLD.review_id);
BEGIN
  UPDATE public.reviews r
     SET helpful_count = (select count(*) from public.review_votes v where v.review_id = target and v.vote = 1),
         unhelpful_count = (select count(*) from public.review_votes v where v.review_id = target and v.vote = -1)
   WHERE r.id = target;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_review_vote_counts() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS review_votes_sync_counts ON public.review_votes;
CREATE TRIGGER review_votes_sync_counts
AFTER INSERT OR UPDATE OR DELETE ON public.review_votes
FOR EACH ROW EXECUTE FUNCTION public.sync_review_vote_counts();

UPDATE public.reviews r
   SET helpful_count = (select count(*) from public.review_votes v where v.review_id = r.id and v.vote = 1),
       unhelpful_count = (select count(*) from public.review_votes v where v.review_id = r.id and v.vote = -1);