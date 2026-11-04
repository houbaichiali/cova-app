-- ONE-TIME founder bootstrap. Run this manually in the Supabase SQL editor
-- AFTER applying migration 20261104000002_admin_foundation.sql.
--
-- Replace 'CV-XXXXXXXX' with your own COVA user code (visible on your
-- dashboard). The helper refuses to run once a founder exists.
--
-- Why manual? The first founder must come from the database owner (you),
-- never from an automatic rule or a public code path.

select public.admin_grant_founder('CV-MTXV8U8G');

-- Verify (the row below must exist with role_key = founder):
select uar.user_id, uar.role_key, r.label, uar.granted_at
from public.user_admin_roles uar
join public.admin_roles r on r.key = uar.role_key;
-- (admin_my_access() returns is_admin = false here because the SQL editor is
-- not a signed-in user session — the real check happens in the app.)
