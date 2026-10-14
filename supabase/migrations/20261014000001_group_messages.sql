
-- COVA: Group messages with membership, posting-policy and lock protection.

ALTER TABLE public.communities
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.community_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL
    REFERENCES public.communities(id) ON DELETE CASCADE,
  author_id UUID NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_messages_body_not_empty
    CHECK (length(trim(body)) > 0),
  CONSTRAINT community_messages_body_max_length
    CHECK (length(body) <= 5000)
);

CREATE INDEX IF NOT EXISTS community_messages_community_created_idx
ON public.community_messages (community_id, created_at DESC);

ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.community_messages FROM PUBLIC, anon, authenticated;

GRANT SELECT, DELETE ON public.community_messages TO authenticated;

GRANT INSERT (community_id, body, author_id)
ON public.community_messages TO authenticated;

CREATE POLICY community_messages_select_members
ON public.community_messages
FOR SELECT TO authenticated
USING (public.is_member(community_id));

DROP POLICY IF EXISTS community_messages_insert_members
ON public.community_messages;

CREATE POLICY community_messages_insert_members
ON public.community_messages
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND public.is_member(community_id)
  AND (
    EXISTS (
      SELECT 1
      FROM public.communities AS c
      WHERE c.id = community_messages.community_id
        AND c.is_locked = FALSE
    )
    OR public.my_role(community_id) IN ('owner', 'admin')
  )
);

CREATE POLICY community_messages_delete_own
ON public.community_messages
FOR DELETE TO authenticated
USING (
  author_id = auth.uid()
  AND public.is_member(community_id)
);

-- Enable Realtime for new group messages when available.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'community_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime
    ADD TABLE public.community_messages;
  END IF;
END;
$$;
