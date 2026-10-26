\ir 00_guard.sql
-- Rollback-only, but not READ ONLY: the assertion creates a temporary expectation table.
BEGIN;
CREATE TEMP TABLE expected_rpc_acl(signature regprocedure PRIMARY KEY, intended_executor name NOT NULL);
INSERT INTO expected_rpc_acl VALUES
 ('public.rpc_gateway_reserve_owner_eligibility_v2(uuid,uuid,text,uuid,text,text,uuid,uuid,text)'::regprocedure,'pharmacyflow_owner_gateway_executor'),
 ('public.rpc_gateway_begin_owner_identity_v3(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text)'::regprocedure,'pharmacyflow_owner_gateway_executor'),
 ('public.rpc_gateway_complete_owner_identity_issue_v3(uuid,uuid,text,uuid,uuid,uuid,text,text,text,uuid,text)'::regprocedure,'pharmacyflow_owner_gateway_executor'),
 ('public.rpc_gateway_complete_owner_identity_recovery_v3(uuid,uuid,text,uuid,uuid,uuid,text,text,text,uuid,text)'::regprocedure,'pharmacyflow_owner_gateway_executor'),
 ('public.rpc_gateway_recover_owner_identity_v3(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text)'::regprocedure,'pharmacyflow_owner_gateway_executor'),
 ('public.rpc_platform_owner_admission_decide_v2(uuid,text,uuid,text,uuid,text,uuid,text)'::regprocedure,'pharmacyflow_platform_admission_operator'),
 ('public.rpc_platform_owner_eligibility_revoke_v2(uuid,uuid,uuid,text,uuid,text,text)'::regprocedure,'pharmacyflow_platform_admission_operator');

DO $acl$
DECLARE r record; role_name name;
BEGIN
 FOR r IN SELECT * FROM expected_rpc_acl LOOP
   IF EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x
      WHERE p.oid=r.signature AND x.grantee=0 AND x.privilege_type='EXECUTE') THEN
     RAISE EXCEPTION 'ACL_EXACT_SIGNATURES failed signature=% role=PUBLIC',r.signature;
   END IF;
   FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role',
      'pharmacyflow_owner_gateway_executor','pharmacyflow_platform_admission_operator']::name[] LOOP
     IF has_function_privilege(role_name,r.signature,'EXECUTE') IS DISTINCT FROM (role_name=r.intended_executor) THEN
       RAISE EXCEPTION 'ACL_EXACT_SIGNATURES failed signature=% role=%',r.signature,role_name;
     END IF;
   END LOOP;
 END LOOP;
END $acl$;

DO $rls$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['owner_security_operations','owner_security_operation_claims',
  'owner_identity_issuance_attempts','owner_gateway_authorities','owner_operator_authorities',
  'owner_admission_decisions','owner_eligibility_revocation_decisions'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity AND c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'RLS_FORCED failed table=%',t;
  END IF;
 END LOOP;
END $rls$;
ROLLBACK;
SELECT 'PF_I3A_RESULT=' || json_build_object('schema','pharmacyflow-i3a-process-v1','kind','20_acl_rls_assertions','payload',json_build_object('acl','PASS','forced_rls','PASS'))::text;
