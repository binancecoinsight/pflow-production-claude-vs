\ir 00_guard.sql
BEGIN;
DO $atomic_replay$
DECLARE before_ops bigint; before_decisions bigint; result1 jsonb; result2 jsonb; fp text;
BEGIN
 SELECT count(*) INTO before_ops FROM public.owner_security_operations;
 SELECT count(*) INTO before_decisions FROM public.owner_admission_decisions;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_platform_admission_operator','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','PLATFORM_OPERATOR','sub','i3a-operator-0001','pharmacyflow_credential_version','1')::text,true);
 fp:=public.private_i3_command_fingerprint_v1(ARRAY['owner-gateway-operator-v1','ADMISSION_APPROVE','i3a-operator-0001','0f46f0ba6b7213ccafdfd4a8245a5b323735e7970e69f67cdbf0a3ab00633d29','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000201','APPROVE','40000000-0000-4000-8000-000000000201','owner.i3a.002@example.invalid','ACC01_ATOMIC',NULL]);
 CREATE FUNCTION pg_temp.fail_i3a_audit() RETURNS trigger LANGUAGE plpgsql AS $f$BEGIN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INJECTED_AUDIT_FAILURE'; END$f$;
 CREATE TRIGGER pf_i3a_fail_audit BEFORE INSERT ON public.owner_security_operations FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_i3a_audit();
 BEGIN
  PERFORM public.rpc_platform_owner_admission_decide_v2('20000000-0000-4000-8000-000000000201','APPROVE','40000000-0000-4000-8000-000000000201','owner.i3a.002@example.invalid','10000000-0000-4000-8000-000000000002','ACC01_ATOMIC',NULL,fp);
  RAISE EXCEPTION 'audit failure did not abort';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
 DROP TRIGGER pf_i3a_fail_audit ON public.owner_security_operations;
 IF (SELECT count(*) FROM public.owner_security_operations)<>before_ops OR (SELECT count(*) FROM public.owner_admission_decisions)<>before_decisions
  OR EXISTS(SELECT 1 FROM public.owner_security_operation_claims WHERE operation_id='20000000-0000-4000-8000-000000000201') THEN RAISE EXCEPTION 'ROLLBACK_AUDIT_ATOMICITY failed'; END IF;
 result1:=public.rpc_platform_owner_admission_decide_v2('20000000-0000-4000-8000-000000000201','APPROVE','40000000-0000-4000-8000-000000000201','owner.i3a.002@example.invalid','10000000-0000-4000-8000-000000000002','ACC01_ATOMIC',NULL,fp);
 result2:=public.rpc_platform_owner_admission_decide_v2('20000000-0000-4000-8000-000000000201','APPROVE','40000000-0000-4000-8000-000000000201','owner.i3a.002@example.invalid','10000000-0000-4000-8000-000000000002','ACC01_ATOMIC',NULL,fp);
 IF result1 IS DISTINCT FROM result2 OR (SELECT count(*) FROM public.owner_security_operations WHERE operation_id='20000000-0000-4000-8000-000000000201')<>1
  OR (SELECT count(*) FROM public.owner_admission_decisions WHERE operation_id='20000000-0000-4000-8000-000000000201')<>1 THEN RAISE EXCEPTION 'CANONICAL_REPLAY failed'; END IF;
 IF NOT (result1 ? 'predecessor_decision_id') OR result1->'predecessor_decision_id' IS DISTINCT FROM 'null'::jsonb
   OR result1 ? 'missing_field' OR result1->>'predecessor_decision_id' IS NOT NULL OR result1->>'missing_field' IS NOT NULL
  THEN RAISE EXCEPTION 'JSON_NULL_SQL_NULL_MISSING distinction failed'; END IF;
 BEGIN
  PERFORM public.rpc_platform_owner_admission_decide_v2('20000000-0000-4000-8000-000000000201','APPROVE','40000000-0000-4000-8000-000000000201','owner.i3a.002@example.invalid','10000000-0000-4000-8000-000000000002','CHANGED_REASON',NULL,fp);
  RAISE EXCEPTION 'changed command reused claimed fingerprint';
 EXCEPTION WHEN SQLSTATE 'PI033' THEN NULL; END;
 IF public.private_i3_command_fingerprint_v1(ARRAY['café','薬局','10000000-0000-4000-8000-000000000001'])<>'a62e4f43c1ca44705e5dce925f61f08b23990bea6280f3526eaefe1c1ea3232e'
    OR public.private_i3_command_fingerprint_v1(ARRAY['café',NULL,'10000000-0000-4000-8000-000000000001'])<>'3c3e4ed13b76fd97cbddf4193784c9febf795cb5aef8b1f9d88c654f9975ea8b'
    OR public.private_i3_frame_command_field_v1('薬局') NOT LIKE '6:%' THEN RAISE EXCEPTION 'UTF8_NULL_UUID_PARITY failed'; END IF;
END $atomic_replay$;
ROLLBACK;
SELECT 'PF_I3A_RESULT=' || json_build_object('schema','pharmacyflow-i3a-process-v1','kind','24_atomic_replay_assertions','payload',json_build_object('audit_atomicity','PASS','canonical_replay','PASS','json_null_sql_null_missing','PASS','utf8_null_uuid','PASS'))::text;
