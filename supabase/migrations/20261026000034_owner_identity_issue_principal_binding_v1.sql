-- BLK-002 PF-SUP-2026-10-26-15 issue-route principal binding correction (UNEXECUTED).
-- Forward-only repair of 000033. No scope grants, identity provisioning, credentials,
-- runtime mapping, provider adapter, data repair, activation or protected execution is included.

-- IDENTITY_ISSUE is restricted to the immutable original attempt principal. Credential rotation
-- remains valid because the current version is checked by private_i3_require_gateway_scope_v1,
-- while the stable principal_id (not the version) is compared with original authorship.
CREATE OR REPLACE FUNCTION public.private_i3_authorize_identity_phase_v1(
 p_capability TEXT,p_phase TEXT,p_operation_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE actor RECORD; attempt public.owner_identity_issuance_attempts%ROWTYPE;
BEGIN
 IF (p_capability,p_phase) NOT IN (('IDENTITY_ISSUE','PROVIDER_DISPATCH_AUTHORIZED'),('IDENTITY_RECOVER','PROVIDER_RESOLUTION_AUTHORIZED')) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid identity phase'; END IF;
 SELECT * INTO actor FROM public.private_i3_require_gateway_scope_v1(p_capability,p_applicant_key,p_pharmacy_context_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::TEXT,2));
 SELECT * INTO attempt FROM public.owner_identity_issuance_attempts WHERE operation_id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR attempt.applicant_email_digest IS DISTINCT FROM p_applicant_key
  OR attempt.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id THEN
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='AUTHORITATIVE_RESULT_NOT_FOUND'; END IF;
 PERFORM public.private_i3_assert_attempt_provenance_v1(attempt);
 IF p_capability='IDENTITY_ISSUE' AND actor.principal_id IS DISTINCT FROM attempt.principal_id THEN
  RAISE EXCEPTION USING ERRCODE='PI031',MESSAGE='ORIGINAL_ISSUE_PRINCIPAL_REQUIRED'; END IF;
 IF attempt.state <> 'PROVIDER_PENDING' THEN
  RAISE EXCEPTION USING ERRCODE='PI037',MESSAGE='ISSUANCE_NOT_PENDING'; END IF;
 PERFORM public.private_i3_audit_identity_phase_v1(attempt,p_phase,actor.principal_id,actor.credential_version,p_capability);
 RETURN public.private_i3_attempt_payload_v1(attempt);
END; $$;

CREATE OR REPLACE FUNCTION public.private_i3_complete_owner_identity_v3(
 p_capability TEXT,p_phase TEXT,p_replay_phase TEXT,p_operation_id UUID,p_applicant_key TEXT,
 p_pharmacy_context_id UUID,p_provider_operation_id UUID,p_subject_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE actor RECORD; attempt public.owner_identity_issuance_attempts%ROWTYPE; result JSONB; now_utc TIMESTAMPTZ:=timezone('utc',now());
BEGIN
 IF (p_capability,p_phase,p_replay_phase) NOT IN (
    ('IDENTITY_ISSUE','ISSUE_COMPLETED','ISSUE_REPLAY'),
    ('IDENTITY_RECOVER','RECOVERY_COMPLETED','RECOVERY_REPLAY'))
    OR p_operation_id IS NULL OR p_provider_operation_id IS NULL OR p_subject_id IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid identity completion'; END IF;
 SELECT * INTO actor FROM public.private_i3_require_gateway_scope_v1(p_capability,p_applicant_key,p_pharmacy_context_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::TEXT,2));
 SELECT * INTO attempt FROM public.owner_identity_issuance_attempts WHERE operation_id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR attempt.applicant_email_digest IS DISTINCT FROM p_applicant_key
  OR attempt.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id THEN
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='AUTHORITATIVE_RESULT_NOT_FOUND'; END IF;
 PERFORM public.private_i3_assert_attempt_provenance_v1(attempt);
 IF p_capability='IDENTITY_ISSUE' AND actor.principal_id IS DISTINCT FROM attempt.principal_id THEN
  RAISE EXCEPTION USING ERRCODE='PI031',MESSAGE='ORIGINAL_ISSUE_PRINCIPAL_REQUIRED'; END IF;
 IF attempt.provider_operation_id IS DISTINCT FROM p_provider_operation_id THEN
  RAISE EXCEPTION USING ERRCODE='PI033',MESSAGE='OPERATION_CONFLICT'; END IF;
 IF attempt.state='COMPLETED' THEN
  IF attempt.subject_id IS DISTINCT FROM p_subject_id THEN
   RAISE EXCEPTION USING ERRCODE='PI033',MESSAGE='OPERATION_CONFLICT'; END IF;
  PERFORM public.private_i3_audit_identity_phase_v1(attempt,p_replay_phase,actor.principal_id,actor.credential_version,p_capability);
  RETURN attempt.canonical_result;
 END IF;
 PERFORM public.private_correlate_owner_identity_v1(
  attempt.request_id,attempt.intended_input_fingerprint,attempt.provider_operation_id,p_subject_id);
 SELECT canonical_issuer_response || jsonb_build_object('state','EMAIL_CONFIRMATION_PENDING','subject_id',p_subject_id)
 INTO result FROM public.owner_eligibility_requests WHERE request_id=attempt.request_id;
 INSERT INTO public.owner_security_operations(
  contract_version,operation_id,action,principal_class,principal_id,credential_version,applicant_key,
  pharmacy_context_id,command_fingerprint,result_identity,canonical_result,occurred_at,subject_id
 ) VALUES (
  'owner-gateway-operator-v1',attempt.operation_id,'IDENTITY_ISSUE','GATEWAY',attempt.principal_id,
  attempt.original_credential_version,attempt.applicant_email_digest,attempt.pharmacy_context_id,
  attempt.command_fingerprint,p_subject_id::TEXT,result,now_utc,p_subject_id);
 UPDATE public.owner_identity_issuance_attempts SET state='COMPLETED',subject_id=p_subject_id,
  canonical_result=result,completed_at=now_utc WHERE operation_id=attempt.operation_id;
 SELECT * INTO attempt FROM public.owner_identity_issuance_attempts WHERE operation_id=p_operation_id;
 -- Required audit shares this transaction; an audit error rolls back correlation, operation and completion.
 PERFORM public.private_i3_audit_identity_phase_v1(attempt,p_phase,actor.principal_id,actor.credential_version,p_capability);
 RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.private_i3_lookup_owner_identity_v1(
 p_capability TEXT,p_phase TEXT,p_operation_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID,p_require_completed BOOLEAN
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE actor RECORD; attempt public.owner_identity_issuance_attempts%ROWTYPE;
BEGIN
 IF (p_capability,p_phase) NOT IN (
    ('IDENTITY_RECOVER','RECOVERY_LOOKUP'),('IDENTITY_ISSUE','ISSUE_RESULT_LOOKUP'),
    ('IDENTITY_RECOVER','RECOVERY_RESULT_LOOKUP')) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid identity lookup'; END IF;
 SELECT * INTO actor FROM public.private_i3_require_gateway_scope_v1(p_capability,p_applicant_key,p_pharmacy_context_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::TEXT,2));
 SELECT * INTO attempt FROM public.owner_identity_issuance_attempts WHERE operation_id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR attempt.applicant_email_digest IS DISTINCT FROM p_applicant_key
  OR attempt.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id THEN
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='AUTHORITATIVE_RESULT_NOT_FOUND'; END IF;
 PERFORM public.private_i3_assert_attempt_provenance_v1(attempt);
 IF p_capability='IDENTITY_ISSUE' AND actor.principal_id IS DISTINCT FROM attempt.principal_id THEN
  RAISE EXCEPTION USING ERRCODE='PI031',MESSAGE='ORIGINAL_ISSUE_PRINCIPAL_REQUIRED'; END IF;
 IF p_require_completed AND attempt.state <> 'COMPLETED' THEN
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='AUTHORITATIVE_RESULT_NOT_FOUND'; END IF;
 PERFORM public.private_i3_audit_identity_phase_v1(attempt,p_phase,actor.principal_id,actor.credential_version,p_capability);
 RETURN public.private_i3_attempt_payload_v1(attempt);
END; $$;

ALTER FUNCTION public.private_i3_authorize_identity_phase_v1(TEXT,TEXT,UUID,TEXT,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_complete_owner_identity_v3(TEXT,TEXT,TEXT,UUID,TEXT,UUID,UUID,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_lookup_owner_identity_v1(TEXT,TEXT,UUID,TEXT,UUID,BOOLEAN) OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.private_i3_authorize_identity_phase_v1(TEXT,TEXT,UUID,TEXT,UUID),
 public.private_i3_complete_owner_identity_v3(TEXT,TEXT,TEXT,UUID,TEXT,UUID,UUID,UUID),
 public.private_i3_lookup_owner_identity_v1(TEXT,TEXT,UUID,TEXT,UUID,BOOLEAN)
FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;

-- Reassert closure of every superseded identity RPC. No weaker route remains executable.
REVOKE ALL ON FUNCTION public.rpc_gateway_correlate_owner_identity_v1(UUID,UUID,TEXT,UUID,TEXT,UUID,UUID,TEXT),
 public.rpc_gateway_recover_owner_operation_v1(UUID,TEXT,TEXT,UUID,TEXT),
 public.rpc_gateway_begin_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT),
 public.rpc_gateway_complete_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT),
 public.rpc_gateway_recover_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT),
 public.rpc_gateway_begin_owner_identity_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT),
 public.rpc_gateway_complete_owner_identity_issue_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT),
 public.rpc_gateway_complete_owner_identity_recovery_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT),
 public.rpc_gateway_recover_owner_identity_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT)
FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;

-- Reassert exact 000033 public RPC ACLs: close all known roles, then grant only the gateway executor.
REVOKE ALL ON FUNCTION public.rpc_gateway_begin_owner_identity_v4(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT),
 public.rpc_gateway_authorize_owner_identity_dispatch_v1(UUID,TEXT,UUID),
 public.rpc_gateway_authorize_owner_identity_resolution_v1(UUID,TEXT,UUID),
 public.rpc_gateway_complete_owner_identity_issue_v4(UUID,TEXT,UUID,UUID,UUID),
 public.rpc_gateway_complete_owner_identity_recovery_v4(UUID,TEXT,UUID,UUID,UUID),
 public.rpc_gateway_recover_owner_identity_v4(UUID,TEXT,UUID),
 public.rpc_gateway_lookup_owner_identity_issue_result_v1(UUID,TEXT,UUID),
 public.rpc_gateway_lookup_owner_identity_recovery_result_v1(UUID,TEXT,UUID)
FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;
GRANT EXECUTE ON FUNCTION public.rpc_gateway_begin_owner_identity_v4(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT),
 public.rpc_gateway_authorize_owner_identity_dispatch_v1(UUID,TEXT,UUID),
 public.rpc_gateway_authorize_owner_identity_resolution_v1(UUID,TEXT,UUID),
 public.rpc_gateway_complete_owner_identity_issue_v4(UUID,TEXT,UUID,UUID,UUID),
 public.rpc_gateway_complete_owner_identity_recovery_v4(UUID,TEXT,UUID,UUID,UUID),
 public.rpc_gateway_recover_owner_identity_v4(UUID,TEXT,UUID),
 public.rpc_gateway_lookup_owner_identity_issue_result_v1(UUID,TEXT,UUID),
 public.rpc_gateway_lookup_owner_identity_recovery_result_v1(UUID,TEXT,UUID)
TO pharmacyflow_owner_gateway_executor;

-- Static/source verification is not PostgreSQL parsing, execution, effective ACL/RLS,
-- transaction rollback, lock/concurrency, Auth/provider or production acceptance.
