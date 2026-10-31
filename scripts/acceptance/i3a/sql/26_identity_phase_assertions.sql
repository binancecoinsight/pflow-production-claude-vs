\ir 00_guard.sql
-- Rollback-only REV-LIN-01 boundary assertions aligned to migrations 000033-000034.
-- Completion success, completed replay and completion-audit rollback require a genuine provider-created
-- auth.users subject with trusted immutable markers. AUTH-02 is deferred, so those cases remain BLOCKED.
BEGIN;
CREATE FUNCTION pg_temp.assert_i3a_pending_identity_response(
 p_payload jsonb,p_operation_id uuid,p_principal_id text,p_applicant_key text,
 p_pharmacy_context_id uuid,p_original_credential_version integer,
 p_command_fingerprint text,p_provider_operation_id uuid
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE identity_ jsonb; command_ jsonb;
BEGIN
 IF p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='IDENTITY_RESPONSE_OBJECT_REQUIRED'; END IF;
 IF NOT (p_payload ? 'state') OR jsonb_typeof(p_payload->'state') IS DISTINCT FROM 'string'
  OR p_payload->>'state' IS DISTINCT FROM 'PROVIDER_PENDING' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='IDENTITY_RESPONSE_STATE_INVALID'; END IF;
 -- Pending result must be present JSON null. SQL NULL, a missing field and any non-null JSON value fail.
 IF NOT (p_payload ? 'result') OR p_payload->'result' IS DISTINCT FROM 'null'::jsonb THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='IDENTITY_RESPONSE_PENDING_RESULT_INVALID'; END IF;
 IF NOT (p_payload ? 'original_credential_version')
  OR jsonb_typeof(p_payload->'original_credential_version') IS DISTINCT FROM 'number'
  OR (p_payload->>'original_credential_version') !~ '^[1-9][0-9]*$' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='IDENTITY_RESPONSE_ORIGINAL_VERSION_INVALID'; END IF;
 IF (p_payload->>'original_credential_version')::integer IS DISTINCT FROM p_original_credential_version THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='IDENTITY_RESPONSE_ORIGINAL_VERSION_INVALID'; END IF;
 identity_:=p_payload->'original_identity';
 IF NOT (p_payload ? 'original_identity') OR jsonb_typeof(identity_) IS DISTINCT FROM 'object'
  OR NOT (identity_ ?& ARRAY['operation_id','action','principal_id','applicant_key','pharmacy_context_id','command_fingerprint'])
  OR jsonb_typeof(identity_->'operation_id') IS DISTINCT FROM 'string'
  OR jsonb_typeof(identity_->'action') IS DISTINCT FROM 'string'
  OR jsonb_typeof(identity_->'principal_id') IS DISTINCT FROM 'string'
  OR jsonb_typeof(identity_->'applicant_key') IS DISTINCT FROM 'string'
  OR jsonb_typeof(identity_->'pharmacy_context_id') IS DISTINCT FROM 'string'
  OR jsonb_typeof(identity_->'command_fingerprint') IS DISTINCT FROM 'string'
  OR identity_->>'operation_id' IS DISTINCT FROM p_operation_id::text
  OR identity_->>'action' IS DISTINCT FROM 'IDENTITY_ISSUE'
  OR identity_->>'principal_id' IS DISTINCT FROM p_principal_id
  OR identity_->>'applicant_key' IS DISTINCT FROM p_applicant_key
  OR identity_->>'pharmacy_context_id' IS DISTINCT FROM p_pharmacy_context_id::text
  OR identity_->>'command_fingerprint' IS DISTINCT FROM p_command_fingerprint THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='IDENTITY_RESPONSE_ORIGINAL_IDENTITY_INVALID'; END IF;
 command_:=p_payload->'authoritative_command';
 IF NOT (p_payload ? 'authoritative_command') OR jsonb_typeof(command_) IS DISTINCT FROM 'object'
  OR NOT (command_ ? 'provider_operation_id')
  OR jsonb_typeof(command_->'provider_operation_id') IS DISTINCT FROM 'string'
  OR command_->>'provider_operation_id' IS DISTINCT FROM p_provider_operation_id::text THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='IDENTITY_RESPONSE_PROVIDER_OPERATION_INVALID'; END IF;
END; $$;
DO $identity_phases$
DECLARE
 email_ constant text:='owner.i3a.001@example.invalid';
 applicant_ constant text:='c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf';
 context_ constant uuid:='10000000-0000-4000-8000-000000000001';
 approval_operation_ constant uuid:='20000000-0000-4000-8000-000000000701';
 decision_ constant uuid:='40000000-0000-4000-8000-000000000701';
 reserve_operation_ constant uuid:='20000000-0000-4000-8000-000000000702';
 request_ constant uuid:='30000000-0000-4000-8000-000000000702';
 identity_operation_ constant uuid:='20000000-0000-4000-8000-000000000703';
 subject_ constant uuid:='60000000-0000-4000-8000-000000000703';
 approval_fp text; reserve_fp text; identity_fp text; reserved jsonb; begun jsonb; phase_result jsonb;
 provider_operation_ uuid; intended_fp text; audit_before bigint; audit_after bigint;
BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_platform_admission_operator','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','PLATFORM_OPERATOR','sub','i3a-operator-0001','pharmacyflow_credential_version','1')::text,true);
 approval_fp:=public.private_i3_command_fingerprint_v1(ARRAY['owner-gateway-operator-v1','ADMISSION_APPROVE','i3a-operator-0001',applicant_,context_::text,approval_operation_::text,'APPROVE',decision_::text,email_,'ACC01_REV_LIN_SCOPE',NULL]);
 PERFORM public.rpc_platform_owner_admission_decide_v2(approval_operation_,'APPROVE',decision_,email_,context_,'ACC01_REV_LIN_SCOPE',NULL,approval_fp);

 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_owner_gateway_executor','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','GATEWAY','sub','i3a-gateway-0001','pharmacyflow_credential_version','1')::text,true);
 reserve_fp:=public.private_i3_command_fingerprint_v1(ARRAY['owner-gateway-operator-v1','ELIGIBILITY_RESERVE','i3a-gateway-0001',applicant_,context_::text,reserve_operation_::text,request_::text,email_,'I3A Phase Boundary','NGN',decision_::text,NULL]);
 reserved:=public.rpc_gateway_reserve_owner_eligibility_v2(reserve_operation_,request_,email_,context_,'I3A Phase Boundary','NGN',decision_,NULL,reserve_fp);
 provider_operation_:=(reserved->>'provider_operation_id')::uuid;
 intended_fp:=reserved->>'intended_input_fingerprint';
 identity_fp:=public.private_i3_command_fingerprint_v1(ARRAY['owner-gateway-operator-v1','IDENTITY_ISSUE','i3a-gateway-0001',applicant_,context_::text,identity_operation_::text,request_::text,request_::text,provider_operation_::text,intended_fp,email_,'Owner I3A']);
 begun:=public.rpc_gateway_begin_owner_identity_v4(identity_operation_,request_,applicant_,context_,request_,provider_operation_,intended_fp,email_,'Owner I3A',identity_fp);
 PERFORM pg_temp.assert_i3a_pending_identity_response(begun,identity_operation_,'i3a-gateway-0001',applicant_,context_,1,identity_fp,provider_operation_);

 SELECT count(*) INTO audit_before FROM public.owner_identity_execution_audit WHERE operation_id=identity_operation_;
 phase_result:=public.rpc_gateway_authorize_owner_identity_dispatch_v1(identity_operation_,applicant_,context_);
 PERFORM pg_temp.assert_i3a_pending_identity_response(phase_result,identity_operation_,'i3a-gateway-0001',applicant_,context_,1,identity_fp,provider_operation_);

 -- Stable principal identity survives an authorized credential rotation; original version stays immutable.
 UPDATE public.owner_gateway_authorities SET credential_version=2 WHERE principal_id='i3a-gateway-0001';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_owner_gateway_executor','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','GATEWAY','sub','i3a-gateway-0001','pharmacyflow_credential_version','2')::text,true);
 phase_result:=public.rpc_gateway_authorize_owner_identity_dispatch_v1(identity_operation_,applicant_,context_);
 PERFORM pg_temp.assert_i3a_pending_identity_response(phase_result,identity_operation_,'i3a-gateway-0001',applicant_,context_,1,identity_fp,provider_operation_);
 IF (SELECT original_credential_version FROM public.owner_identity_issuance_attempts WHERE operation_id=identity_operation_)<>1 THEN RAISE EXCEPTION 'ORIGINAL_CREDENTIAL_VERSION_REWRITTEN'; END IF;

 -- A second ISSUE-scoped principal cannot dispatch, complete or disclose the original principal's attempt.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_owner_gateway_executor','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','GATEWAY','sub','i3a-gateway-0002','pharmacyflow_credential_version','1')::text,true);
 BEGIN PERFORM public.rpc_gateway_authorize_owner_identity_dispatch_v1(identity_operation_,applicant_,context_); RAISE EXCEPTION 'CROSS_PRINCIPAL_ISSUE_DISPATCH accepted'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;
 BEGIN PERFORM public.rpc_gateway_complete_owner_identity_issue_v4(identity_operation_,applicant_,context_,provider_operation_,subject_); RAISE EXCEPTION 'CROSS_PRINCIPAL_ISSUE_COMPLETION accepted'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;
 BEGIN PERFORM public.rpc_gateway_lookup_owner_identity_issue_result_v1(identity_operation_,applicant_,context_); RAISE EXCEPTION 'CROSS_PRINCIPAL_ISSUE_DISCLOSURE accepted'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;

 -- The same alternate principal may resolve and inspect only via its current scoped RECOVER route.
 phase_result:=public.rpc_gateway_authorize_owner_identity_resolution_v1(identity_operation_,applicant_,context_);
 PERFORM pg_temp.assert_i3a_pending_identity_response(phase_result,identity_operation_,'i3a-gateway-0001',applicant_,context_,1,identity_fp,provider_operation_);
 phase_result:=public.rpc_gateway_recover_owner_identity_v4(identity_operation_,applicant_,context_);
 PERFORM pg_temp.assert_i3a_pending_identity_response(phase_result,identity_operation_,'i3a-gateway-0001',applicant_,context_,1,identity_fp,provider_operation_);

 -- Recovery-only authority cannot create an identity attempt.
 UPDATE public.owner_gateway_authorities SET capabilities=ARRAY['IDENTITY_RECOVER'] WHERE principal_id='i3a-gateway-0002';
 BEGIN PERFORM public.rpc_gateway_begin_owner_identity_v4('20000000-0000-4000-8000-000000000704',request_,applicant_,context_,request_,provider_operation_,intended_fp,email_,'Owner I3A',repeat('0',64)); RAISE EXCEPTION 'RECOVERY_ONLY_CREATED_IDENTITY'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;
 UPDATE public.owner_gateway_authorities SET capabilities=ARRAY['IDENTITY_ISSUE','IDENTITY_RECOVER'] WHERE principal_id='i3a-gateway-0002';

 -- Changed provider correlation conflicts before any Auth-dependent completion effect.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_owner_gateway_executor','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','GATEWAY','sub','i3a-gateway-0001','pharmacyflow_credential_version','2')::text,true);
 BEGIN PERFORM public.rpc_gateway_complete_owner_identity_issue_v4(identity_operation_,applicant_,context_,'50000000-0000-4000-8000-000000000799',subject_); RAISE EXCEPTION 'CHANGED_PROVIDER_CORRELATION accepted'; EXCEPTION WHEN SQLSTATE 'PI033' THEN NULL; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_owner_gateway_executor','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','GATEWAY','sub','i3a-gateway-0001','pharmacyflow_credential_version','1')::text,true);
 BEGIN PERFORM public.rpc_gateway_authorize_owner_identity_dispatch_v1(identity_operation_,applicant_,context_); RAISE EXCEPTION 'STALE_ROTATED_ISSUE accepted'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;

 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_owner_gateway_executor','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','GATEWAY','sub','i3a-gateway-0002','pharmacyflow_credential_version','1')::text,true);
 UPDATE public.owner_gateway_authorities SET active=false WHERE principal_id='i3a-gateway-0002';
 BEGIN PERFORM public.rpc_gateway_recover_owner_identity_v4(identity_operation_,applicant_,context_); RAISE EXCEPTION 'REVOKED_RECOVERY accepted'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;
 UPDATE public.owner_gateway_authorities SET active=true WHERE principal_id='i3a-gateway-0002';

 SELECT count(*) INTO audit_after FROM public.owner_identity_execution_audit WHERE operation_id=identity_operation_;
 IF audit_after-audit_before<>4
  OR (SELECT count(*) FROM public.owner_identity_execution_audit WHERE operation_id=identity_operation_ AND original_principal_id='i3a-gateway-0001' AND original_credential_version=1)<>4
  OR (SELECT count(*) FROM public.owner_identity_execution_audit WHERE operation_id=identity_operation_ AND execution_principal_id='i3a-gateway-0001' AND phase='PROVIDER_DISPATCH_AUTHORIZED' AND execution_credential_version IN(1,2))<>2
  OR (SELECT count(*) FROM public.owner_identity_execution_audit WHERE operation_id=identity_operation_ AND execution_principal_id='i3a-gateway-0002' AND phase IN('PROVIDER_RESOLUTION_AUTHORIZED','RECOVERY_LOOKUP'))<>2
  THEN RAISE EXCEPTION 'APPEND_ONLY_PHASE_AUDIT_PROVENANCE failed'; END IF;
END $identity_phases$;

-- Assertion-contract negatives are synthetic JSON only. They prove the authored assertion itself
-- rejects nullable/malformed evidence; they are not PostgreSQL execution evidence until this file runs.
DO $response_assertion_contract$
DECLARE
 op constant uuid:='20000000-0000-4000-8000-000000000703';
 ctx constant uuid:='10000000-0000-4000-8000-000000000001';
 provider constant uuid:='50000000-0000-4000-8000-000000000703';
 applicant constant text:='c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf';
 fp constant text:=repeat('a',64); valid jsonb; candidate jsonb;
BEGIN
 valid:=jsonb_build_object(
  'state','PROVIDER_PENDING','result',NULL,'original_credential_version',1,
  'original_identity',jsonb_build_object('operation_id',op,'action','IDENTITY_ISSUE','principal_id','i3a-gateway-0001','applicant_key',applicant,'pharmacy_context_id',ctx,'command_fingerprint',fp),
  'authoritative_command',jsonb_build_object('provider_operation_id',provider));
 PERFORM pg_temp.assert_i3a_pending_identity_response(valid,op,'i3a-gateway-0001',applicant,ctx,1,fp,provider);
 FOREACH candidate IN ARRAY ARRAY[
  NULL::jsonb,'null'::jsonb,'[]'::jsonb,
  valid-'state',jsonb_set(valid,'{state}','null'::jsonb),jsonb_set(valid,'{state}','1'::jsonb),jsonb_set(valid,'{state}','"WRONG"'::jsonb),
  valid-'result',jsonb_set(valid,'{result}','{}'::jsonb),
  valid-'original_credential_version',jsonb_set(valid,'{original_credential_version}','null'::jsonb),jsonb_set(valid,'{original_credential_version}','"1"'::jsonb),jsonb_set(valid,'{original_credential_version}','2'::jsonb),
  valid-'original_identity',jsonb_set(valid,'{original_identity}','null'::jsonb),jsonb_set(valid,'{original_identity}','[]'::jsonb),jsonb_set(valid,'{original_identity,principal_id}','null'::jsonb),jsonb_set(valid,'{original_identity,principal_id}','"wrong"'::jsonb),
  valid-'authoritative_command',jsonb_set(valid,'{authoritative_command}','null'::jsonb),jsonb_set(valid,'{authoritative_command,provider_operation_id}','null'::jsonb),jsonb_set(valid,'{authoritative_command,provider_operation_id}','1'::jsonb),jsonb_set(valid,'{authoritative_command,provider_operation_id}','"50000000-0000-4000-8000-000000000799"'::jsonb)
 ] LOOP
  BEGIN
   PERFORM pg_temp.assert_i3a_pending_identity_response(candidate,op,'i3a-gateway-0001',applicant,ctx,1,fp,provider);
   RAISE EXCEPTION 'MALFORMED_IDENTITY_RESPONSE_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 END LOOP;
END $response_assertion_contract$;
ROLLBACK;
SELECT 'PF_I3A_RESULT=' || json_build_object('schema','pharmacyflow-i3a-process-v1','kind','26_identity_phase_assertions','payload',json_build_object(
 'phase_authorization','AUTHORED_POSTGRESQL_NOT_RUN',
 'original_principal_issue_routes','AUTHORED_POSTGRESQL_NOT_RUN',
 'alternate_scoped_recovery','AUTHORED_POSTGRESQL_NOT_RUN',
 'response_contract_negatives','AUTHORED_STATIC_SYNTHETIC_POSTGRESQL_NOT_RUN',
 'completion_success','BLOCKED_AUTH_02_TRUSTED_SUBJECT_REQUIRED',
 'completed_exact_replay','BLOCKED_AUTH_02_TRUSTED_SUBJECT_REQUIRED',
 'completion_audit_rollback','BLOCKED_AUTH_02_TRUSTED_SUBJECT_REQUIRED'))::text;
