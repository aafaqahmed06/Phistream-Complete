-- Supabase grants EXECUTE on new functions in "public" to its Data API roles
-- (anon, authenticated), which PostgREST exposes as RPC endpoints. The backend
-- is the only intended database client, so revoke function access as well
-- (0001 covered tables and sequences). Trigger functions cannot be invoked
-- directly anyway; this is defense in depth. A no-op on plain PostgreSQL.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
