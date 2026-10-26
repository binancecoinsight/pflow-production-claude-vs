\ir 00_guard.sql
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assert_dml_denied(p_role text,p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE format('SET LOCAL ROLE %I',p_role);
 BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'ROLE_DML_DENIAL failed role=% sql=%',p_role,p_sql;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RESET ROLE;
END $$;
DO $matrix$ DECLARE r text;t text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','pharmacyflow_owner_gateway_executor','pharmacyflow_platform_admission_operator'] LOOP
  FOREACH t IN ARRAY ARRAY[
   'SELECT * FROM public.owner_gateway_authorities LIMIT 1',
   'INSERT INTO public.owner_security_operation_claims(operation_id,action,principal_id,applicant_key,pharmacy_context_id,command_fingerprint,claim_state) VALUES(''2fffffff-ffff-4fff-8fff-ffffffffffff'',''IDENTITY_ISSUE'',''denied'',''x'',''10000000-0000-4000-8000-000000000001'',''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'',''PENDING'')',
   'UPDATE public.owner_operator_authorities SET active=false WHERE principal_id=''i3a-operator-0001''',
   'DELETE FROM public.owner_identity_issuance_attempts WHERE operation_id=''2fffffff-ffff-4fff-8fff-ffffffffffff'''
  ] LOOP PERFORM pg_temp.assert_dml_denied(r,t); END LOOP;
 END LOOP;
END $matrix$;
ROLLBACK;
SELECT 'PF_I3A_RESULT=' || json_build_object('schema','pharmacyflow-i3a-process-v1','kind','21_role_dml_denial','payload',json_build_object('role_dml_denial','PASS'))::text;
