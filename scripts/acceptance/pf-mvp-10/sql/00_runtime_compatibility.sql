\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_setting('server_version_num')::INT < 150000 THEN RAISE EXCEPTION 'RUNTIME_POSTGRES_UNSUPPORTED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='auth') OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='extensions') THEN RAISE EXCEPTION 'RUNTIME_SUPABASE_SCHEMAS_MISSING'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN RAISE EXCEPTION 'RUNTIME_API_ROLES_MISSING'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pgcrypto') THEN RAISE EXCEPTION 'RUNTIME_PGCRYPTO_MISSING'; END IF;
 IF to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.jwt()') IS NULL THEN RAISE EXCEPTION 'RUNTIME_AUTH_PRIMITIVES_MISSING'; END IF;
END $$;
SELECT ((SELECT system_identifier::TEXT FROM pg_control_system())=:'pf_system_identifier'
 AND (SELECT oid::TEXT FROM pg_database WHERE datname=current_database())=:'pf_database_oid'
 AND (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())=:'pf_target_marker')::int AS pf_target_ok \gset
\if :pf_target_ok
\else
  \echo 'TARGET_IDENTITY_MISMATCH'
  \quit 3
\endif
SELECT 'PF_PASS|runtime|'||current_setting('server_version_num')||'|target-verified';
