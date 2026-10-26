\ir 00_guard.sql
BEGIN;
DO $setup_and_assert$
DECLARE
 k constant text:='c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf';
 ctx constant uuid:='10000000-0000-4000-8000-000000000001';
 fp text:=repeat('b',64); cmd text; admission_fp text; reserve_fp text;
 begun jsonb; recovered jsonb;
BEGIN
 -- A RESERVED row is the committed-fixture starting state. Every tested transition after
 -- that point uses the intended application RPC boundary.
 INSERT INTO public.owner_security_operations(contract_version,operation_id,action,principal_class,principal_id,credential_version,applicant_key,pharmacy_context_id,command_fingerprint,result_identity,canonical_result)
 VALUES('owner-gateway-operator-v1','20000000-0000-4000-8000-000000000301','ADMISSION_APPROVE','PLATFORM_OPERATOR','i3a-operator-0001',1,k,ctx,repeat('c',64),'40000000-0000-4000-8000-000000000301','{"state":"ACTIVE"}');
 INSERT INTO public.owner_admission_decisions(decision_id,operation_id,action,operator_id,applicant_email_digest,pharmacy_context_id,reason_code,resulting_state)
 VALUES('40000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000301','APPROVE','i3a-operator-0001',k,ctx,'ACC01','ACTIVE');
 INSERT INTO public.owner_eligibility_admissions(normalized_email_digest,policy_version,evidence_id,is_active,pharmacy_context_id,current_decision_id)
 VALUES(k,'closed-manual-v1','40000000-0000-4000-8000-000000000301',true,ctx,'40000000-0000-4000-8000-000000000301');
 INSERT INTO public.owner_eligibility_requests(contract_version,owner_contract_version,request_id,provider_operation_id,normalized_email_digest,intended_input_fingerprint,admission_evidence_id,state,canonical_issuer_response,pharmacy_context_id,admission_decision_id)
 VALUES('owner-eligibility-issuer-v1','owner-onboarding-v1','30000000-0000-4000-8000-000000000301','50000000-0000-4000-8000-000000000301',k,fp,'40000000-0000-4000-8000-000000000301','RESERVED','{"state":"RESERVED","subject_id":null}',ctx,'40000000-0000-4000-8000-000000000301');

 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_owner_gateway_executor','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','GATEWAY','sub','i3a-gateway-0001','pharmacyflow_credential_version','1')::text,true);
 cmd:=public.private_i3_command_fingerprint_v1(ARRAY['owner-gateway-operator-v1','IDENTITY_ISSUE','i3a-gateway-0001',k,ctx::text,'20000000-0000-4000-8000-000000000302','30000000-0000-4000-8000-000000000301','30000000-0000-4000-8000-000000000301','50000000-0000-4000-8000-000000000301',fp,'owner.i3a.001@example.invalid','Owner I3A']);
 begun:=public.rpc_gateway_begin_owner_identity_v3('20000000-0000-4000-8000-000000000302','30000000-0000-4000-8000-000000000301',k,ctx,'30000000-0000-4000-8000-000000000301','50000000-0000-4000-8000-000000000301',fp,'owner.i3a.001@example.invalid','Owner I3A',cmd);
 IF begun->>'state'<>'PROVIDER_PENDING' OR (SELECT state FROM public.owner_eligibility_requests WHERE request_id='30000000-0000-4000-8000-000000000301')<>'AUTH_CREATE_PENDING' THEN RAISE EXCEPTION 'begin boundary did not perform valid transition'; END IF;
 recovered:=public.rpc_gateway_recover_owner_identity_v3('20000000-0000-4000-8000-000000000302','30000000-0000-4000-8000-000000000301',k,ctx,'30000000-0000-4000-8000-000000000301','50000000-0000-4000-8000-000000000301',fp,'owner.i3a.001@example.invalid','Owner I3A',cmd);
 IF recovered->>'state'<>'PROVIDER_PENDING' OR recovered->'result' IS DISTINCT FROM 'null'::jsonb OR NOT (recovered ? 'result') THEN RAISE EXCEPTION 'DURABLE_PENDING_RECOVERY exact boundary replay failed'; END IF;

 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_platform_admission_operator','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','PLATFORM_OPERATOR','sub','i3a-operator-0001','pharmacyflow_credential_version','1')::text,true);
 admission_fp:=public.private_i3_command_fingerprint_v1(ARRAY['owner-gateway-operator-v1','ADMISSION_REVOKE','i3a-operator-0001',k,ctx::text,'20000000-0000-4000-8000-000000000304','REVOKE','40000000-0000-4000-8000-000000000304','owner.i3a.001@example.invalid','ACC01_REVOKE','40000000-0000-4000-8000-000000000301']);
 PERFORM public.rpc_platform_owner_admission_decide_v2('20000000-0000-4000-8000-000000000304','REVOKE','40000000-0000-4000-8000-000000000304','owner.i3a.001@example.invalid',ctx,'ACC01_REVOKE','40000000-0000-4000-8000-000000000301',admission_fp);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_owner_gateway_executor','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','GATEWAY','sub','i3a-gateway-0001','pharmacyflow_credential_version','1')::text,true);
 reserve_fp:=public.private_i3_command_fingerprint_v1(ARRAY['owner-gateway-operator-v1','ELIGIBILITY_RESERVE','i3a-gateway-0001',k,ctx::text,'20000000-0000-4000-8000-000000000305','30000000-0000-4000-8000-000000000305','owner.i3a.001@example.invalid','I3A Pharmacy','NGN','40000000-0000-4000-8000-000000000304',NULL]);
 BEGIN
  PERFORM public.rpc_gateway_reserve_owner_eligibility_v2('20000000-0000-4000-8000-000000000305','30000000-0000-4000-8000-000000000305','owner.i3a.001@example.invalid',ctx,'I3A Pharmacy','NGN','40000000-0000-4000-8000-000000000304',NULL,reserve_fp);
  RAISE EXCEPTION 'RESERVATION_REVOCATION admitted revoked applicant';
 EXCEPTION WHEN SQLSTATE 'PI010' THEN NULL; END;
END $setup_and_assert$;
ROLLBACK;
SELECT 'PF_I3A_RESULT=' || json_build_object('schema','pharmacyflow-i3a-process-v1','kind','25_lifecycle_recovery_assertions','payload',json_build_object(
 'DURABLE_PENDING_RECOVERY','PASS_SIMULATED_DATABASE_CLAIMS',
 'RESERVATION_REVOCATION','PASS_SEQUENTIAL_ONLY',
 'CONSUMPTION_REVOCATION','NOT_IMPLEMENTED_AUTH_REQUIRED',
 'CONFIRMED_APPLICANT_CONTINUATION','NOT_IMPLEMENTED_AUTH_REQUIRED'))::text;
-- Genuine consumption must pass rpc_create_pharmacy_owner_v1 with a confirmed auth.users identity,
-- trusted metadata and auth.uid(). ACC-01 has no Auth scope, so no direct state mutation substitutes for it.
