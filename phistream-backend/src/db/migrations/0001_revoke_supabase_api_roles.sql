-- Supabase exposes the "public" schema through its Data API (PostgREST) to the
-- "anon" and "authenticated" roles and grants them privileges on new tables by
-- default. This backend is the only intended database client, so those roles
-- must not be able to read or write application tables.
--
-- Row Level Security is already enabled on every table with no policies (deny
-- all for non-owner roles); revoking privileges is defense in depth.
-- On plain PostgreSQL (local development/CI) the roles do not exist and this
-- migration is a no-op.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      -- Stop future tables created by the migration role from being granted.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
