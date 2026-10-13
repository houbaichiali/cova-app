# RLS tests (plain Postgres)

142 checks of the rules in the second migration, run as different users.
`00_mock_supabase.sql` fakes the `auth` schema, `auth.uid()` and the roles. Do not run it on Supabase.

    createdb covatest
    psql -d covatest -f 00_mock_supabase.sql
    psql -d covatest -f ../migrations/20261012000001_social_schema.sql
    psql -d covatest -f ../migrations/20261012000002_social_rls_and_rpc.sql
    psql -d covatest -f 10_rls_tests.sql     # last lines: TOTAL n pass=n fail=0
