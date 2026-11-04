-- ONE-TIME founder bootstrap. Run this manually in the Supabase SQL editor
-- AFTER applying migration 20261104000002_admin_foundation.sql.
--
-- Replace 'CV-XXXXXXXX' with your own COVA user code (visible on your
-- dashboard). The helper refuses to run once a founder exists.
--
-- Why manual? The first founder must come from the database owner (you),
-- never from an automatic rule or a public code path.

select public.admin_grant_founder('CV-MTXV8U8G');

-- Verify (should return is_admin = true, role = founder):
select public.admin_my_access();
