\ir 00_guard.sql
BEGIN;
DO $collisions$
DECLARE result jsonb; fp text:=repeat('a',64);
BEGIN
 INSERT INTO public.owner_security_operation_claims(operation_id,action,principal_id,applicant_key,pharmacy_context_id,command_fingerprint,claim_state)
 VALUES('20000000-0000-4000-8000-000000000101','IDENTITY_ISSUE','i3a-gateway-0001','c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf','10000000-0000-4000-8000-000000000001',fp,'PENDING');
 BEGIN
  INSERT INTO public.owner_security_operations(contract_version,operation_id,action,principal_class,principal_id,credential_version,applicant_key,pharmacy_context_id,command_fingerprint,result_identity,canonical_result)
  VALUES('owner-gateway-operator-v1','20000000-0000-4000-8000-000000000101','ADMISSION_APPROVE','PLATFORM_OPERATOR','i3a-operator-0001',1,'c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf','10000000-0000-4000-8000-000000000001',fp,'collision','{}');
  RAISE EXCEPTION 'OPERATION_COLLISION_PENDING_FIRST accepted';
 EXCEPTION WHEN SQLSTATE 'PI033' THEN NULL; END;
 INSERT INTO public.owner_security_operations(contract_version,operation_id,action,principal_class,principal_id,credential_version,applicant_key,pharmacy_context_id,command_fingerprint,result_identity,canonical_result)
 VALUES('owner-gateway-operator-v1','20000000-0000-4000-8000-000000000102','ADMISSION_APPROVE','PLATFORM_OPERATOR','i3a-operator-0001',1,'c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf','10000000-0000-4000-8000-000000000001',fp,'complete-first','{"stable":true}');
 BEGIN
  INSERT INTO public.owner_identity_issuance_attempts(operation_id,request_id,provider_operation_id,principal_id,applicant_email_digest,pharmacy_context_id,command_fingerprint,state)
  VALUES('20000000-0000-4000-8000-000000000102','30000000-0000-4000-8000-000000000102','50000000-0000-4000-8000-000000000102','i3a-gateway-0001','c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf','10000000-0000-4000-8000-000000000001',fp,'PROVIDER_PENDING');
  RAISE EXCEPTION 'OPERATION_COLLISION_COMPLETED_FIRST accepted';
 EXCEPTION WHEN SQLSTATE 'PI033' THEN NULL; END;
 IF (SELECT canonical_result FROM public.owner_security_operations WHERE operation_id='20000000-0000-4000-8000-000000000102') IS DISTINCT FROM '{"stable":true}'::jsonb THEN RAISE EXCEPTION 'completed evidence changed'; END IF;
END $collisions$;

-- Concrete recovery permission checks use a durable pending claim. Exact pending-attempt RPC
-- recovery additionally requires its authoritative request row and is covered by the reviewed
-- concurrency scenario body; no provider create occurs in this SQL batch.
DO $recovery_authority$
BEGIN
 UPDATE public.owner_gateway_authorities SET capabilities=ARRAY['IDENTITY_ISSUE'] WHERE principal_id='i3a-gateway-0001';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_owner_gateway_executor','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','GATEWAY','sub','i3a-gateway-0001','pharmacyflow_credential_version','1')::text,true);
 BEGIN PERFORM public.private_i3_require_gateway_v1('IDENTITY_RECOVER'); RAISE EXCEPTION 'issue-only recovered'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;
 UPDATE public.owner_gateway_authorities SET capabilities=ARRAY['IDENTITY_RECOVER'] WHERE principal_id='i3a-gateway-0001';
 BEGIN PERFORM public.private_i3_require_gateway_v1('IDENTITY_ISSUE'); RAISE EXCEPTION 'recovery-only created'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;
 PERFORM public.private_i3_require_gateway_v1('IDENTITY_RECOVER');
END $recovery_authority$;
ROLLBACK;
SELECT 'PF_I3A_RESULT=' || json_build_object('schema','pharmacyflow-i3a-process-v1','kind','23_operation_recovery_assertions','payload',json_build_object('sequential_collision','PASS','recovery_authority','PASS_SIMULATED_DATABASE_CLAIMS'))::text;
