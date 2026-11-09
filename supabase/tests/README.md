# RLS tests (plain Postgres)

142 checks of the rules in the second migration, run as different users.
`00_mock_supabase.sql` fakes the `auth` schema, `auth.uid()` and the roles. Do not run it on Supabase.

    createdb covatest
    psql -d covatest -f 00_mock_supabase.sql
    psql -d covatest -f ../migrations/20261012000001_social_schema.sql
    psql -d covatest -f ../migrations/20261012000002_social_rls_and_rpc.sql
    psql -d covatest -f 10_rls_tests.sql     # last lines: TOTAL n pass=n fail=0

## 30_profile_tests.sql

Profile & Portfolio suite (runs after 20_admin_tests.sql, same database):
appearance validation (hex/font/emoji whitelists, unknown keys refused),
per-section privacy (public / friends / private, strangers vs friends vs
owner), portfolio visibility, project draft/published rules, import
authenticity (only YOUR submitted assignments / completed challenges can be
imported), certificate verification rules (no self-issued COVA certificates),
the verified-skill permission gate, and storage policies for the
`profile-covers` (public) and `portfolio-documents` (private) buckets.
