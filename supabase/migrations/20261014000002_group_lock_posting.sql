-- COVA: Centralize group posting permissions and respect group locks.

CREATE OR REPLACE FUNCTION public.can_post(p_community uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.communities AS c
    JOIN public.community_members AS m
      ON m.community_id = c.id
     AND m.user_id = auth.uid()
    WHERE c.id = p_community
      AND (
        (
          c.is_locked = TRUE
          AND m.role IN ('owner', 'admin')
        )
        OR
        (
          c.is_locked = FALSE
          AND (
            c.posting_policy = 'everyone'
            OR (
              c.posting_policy = 'admins'
              AND m.role IN ('owner', 'admin')
            )
            OR (
              c.posting_policy = 'owner'
              AND m.role = 'owner'
            )
          )
        )
      )
  );
$function$;

DROP POLICY IF EXISTS community_messages_insert_members
ON public.community_messages;

CREATE POLICY community_messages_insert_members
ON public.community_messages
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND public.is_member(community_id)
  AND public.can_post(community_id)
);
