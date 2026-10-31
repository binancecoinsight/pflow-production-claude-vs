-- BLK-002 REV-LIN-01 transaction-entry linearization correction (UNEXECUTED).
-- Forward-only repair of 000030-000032. No authority rows, identities, credentials,
-- runtime mapping, provider adapter, activation, data repair, or protected execution is included.

CREATE TABLE public.owner_gateway_authority_scopes (
    principal_id TEXT NOT NULL REFERENCES public.owner_gateway_authorities(principal_id) ON DELETE RESTRICT,
    capability TEXT NOT NULL CHECK (capability IN ('IDENTITY_ISSUE','IDENTITY_RECOVER')),
    applicant_key TEXT NOT NULL CHECK (applicant_key ~ '^[0-9a-f]{64}$'),
    pharmacy_context_id UUID NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc',now()),
    PRIMARY KEY (principal_id,capability,applicant_key,pharmacy_context_id)
);
ALTER TABLE public.owner_gateway_authority_scopes OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER TABLE public.owner_gateway_authority_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_gateway_authority_scopes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_gateway_authority_scopes FROM PUBLIC, anon, authenticated, service_role,
    pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;
CREATE POLICY rls_owner_gateway_authority_scopes_private ON public.owner_gateway_authority_scopes
FOR ALL TO pharmacyflow_owner_eligibility_issuer USING (TRUE) WITH CHECK (TRUE);

-- Empty scopes fail closed. Provisioning remains a separate owner-authorized activity.
CREATE FUNCTION public.private_i3_require_gateway_scope_v1(
    p_capability TEXT,p_applicant_key TEXT,p_pharmacy_context_id UUID
) RETURNS TABLE(principal_id TEXT,credential_version INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE actor RECORD;
BEGIN
    IF p_applicant_key !~ '^[0-9a-f]{64}$' OR p_pharmacy_context_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='PI031',MESSAGE='GATEWAY_AUTHORITY_DENIED';
    END IF;
    SELECT * INTO actor FROM public.private_i3_require_gateway_v1(p_capability);
    IF NOT EXISTS (
        SELECT 1 FROM public.owner_gateway_authority_scopes s
        WHERE s.principal_id=actor.principal_id AND s.capability=p_capability
          AND s.applicant_key=p_applicant_key AND s.pharmacy_context_id=p_pharmacy_context_id AND s.active
    ) THEN
        RAISE EXCEPTION USING ERRCODE='PI031',MESSAGE='GATEWAY_AUTHORITY_DENIED';
    END IF;
    RETURN QUERY SELECT actor.principal_id::TEXT,actor.credential_version::INTEGER;
END; $$;
ALTER FUNCTION public.private_i3_require_gateway_scope_v1(TEXT,TEXT,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.private_i3_require_gateway_scope_v1(TEXT,TEXT,UUID) FROM PUBLIC, anon, authenticated,
    service_role, pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;

-- Nullable additions distinguish pre-000033 evidence. New routes require every field and never invent it.
ALTER TABLE public.owner_identity_issuance_attempts
    ADD COLUMN original_credential_version INTEGER CHECK (original_credential_version > 0),
    ADD COLUMN eligibility_id UUID,
    ADD COLUMN intended_input_fingerprint TEXT CHECK (intended_input_fingerprint ~ '^[0-9a-f]{64}$'),
    ADD COLUMN normalized_email TEXT,
    ADD COLUMN full_name TEXT;

CREATE TABLE public.owner_identity_execution_audit (
    audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operation_id UUID NOT NULL REFERENCES public.owner_identity_issuance_attempts(operation_id) ON DELETE RESTRICT,
    phase TEXT NOT NULL CHECK (phase IN (
        'PROVIDER_DISPATCH_AUTHORIZED','PROVIDER_RESOLUTION_AUTHORIZED','RECOVERY_LOOKUP',
        'ISSUE_COMPLETED','RECOVERY_COMPLETED','ISSUE_REPLAY','RECOVERY_REPLAY','ISSUE_RESULT_LOOKUP','RECOVERY_RESULT_LOOKUP'
    )),
    execution_principal_id TEXT NOT NULL CHECK (length(trim(execution_principal_id)) > 0),
    execution_credential_version INTEGER NOT NULL CHECK (execution_credential_version > 0),
    required_capability TEXT NOT NULL CHECK (required_capability IN ('IDENTITY_ISSUE','IDENTITY_RECOVER')),
    original_principal_id TEXT NOT NULL CHECK (length(trim(original_principal_id)) > 0),
    original_credential_version INTEGER NOT NULL CHECK (original_credential_version > 0),
    applicant_key TEXT NOT NULL CHECK (applicant_key ~ '^[0-9a-f]{64}$'),
    pharmacy_context_id UUID NOT NULL,
    command_fingerprint TEXT NOT NULL CHECK (command_fingerprint ~ '^[0-9a-f]{64}$'),
    provider_operation_id UUID NOT NULL,
    observed_state TEXT NOT NULL CHECK (observed_state IN ('PROVIDER_PENDING','COMPLETED')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc',now())
);
ALTER TABLE public.owner_identity_execution_audit OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER TABLE public.owner_identity_execution_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_identity_execution_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_identity_execution_audit FROM PUBLIC, anon, authenticated, service_role,
    pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;
CREATE POLICY rls_owner_identity_execution_audit_private ON public.owner_identity_execution_audit
FOR ALL TO pharmacyflow_owner_eligibility_issuer USING (TRUE) WITH CHECK (TRUE);
CREATE TRIGGER trg_owner_identity_execution_audit_append_only
BEFORE UPDATE OR DELETE ON public.owner_identity_execution_audit
FOR EACH ROW EXECUTE FUNCTION public.trg_owner_i3_append_only();

CREATE FUNCTION public.private_i3_assert_attempt_provenance_v1(
    p_attempt public.owner_identity_issuance_attempts
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE expected_fingerprint TEXT;
BEGIN
    IF p_attempt.original_credential_version IS NULL OR p_attempt.eligibility_id IS NULL
       OR p_attempt.intended_input_fingerprint IS NULL OR p_attempt.normalized_email IS NULL
       OR p_attempt.full_name IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='PI039',MESSAGE='LEGACY_ISSUANCE_PROVENANCE_INCOMPLETE';
    END IF;
    expected_fingerprint:=public.private_i3_command_fingerprint_v1(ARRAY[
        'owner-gateway-operator-v1','IDENTITY_ISSUE',p_attempt.principal_id,
        p_attempt.applicant_email_digest,p_attempt.pharmacy_context_id::TEXT,p_attempt.operation_id::TEXT,
        p_attempt.request_id::TEXT,p_attempt.eligibility_id::TEXT,p_attempt.provider_operation_id::TEXT,
        p_attempt.intended_input_fingerprint,p_attempt.normalized_email,p_attempt.full_name
    ]);
    IF p_attempt.command_fingerprint IS DISTINCT FROM expected_fingerprint THEN
        RAISE EXCEPTION USING ERRCODE='PI014',MESSAGE='ISSUANCE_ATTEMPT_CONFLICT';
    END IF;
END; $$;

CREATE FUNCTION public.private_i3_attempt_payload_v1(p_attempt public.owner_identity_issuance_attempts)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT jsonb_build_object(
        'state',p_attempt.state,'result',p_attempt.canonical_result,
        'original_identity',jsonb_build_object(
            'operation_id',p_attempt.operation_id,'action','IDENTITY_ISSUE','principal_id',p_attempt.principal_id,
            'applicant_key',p_attempt.applicant_email_digest,'pharmacy_context_id',p_attempt.pharmacy_context_id,
            'command_fingerprint',p_attempt.command_fingerprint),
        'original_credential_version',p_attempt.original_credential_version,
        'authoritative_command',jsonb_build_object(
            'operation_id',p_attempt.operation_id,'request_id',p_attempt.request_id,
            'applicant_key',p_attempt.applicant_email_digest,'pharmacy_context_id',p_attempt.pharmacy_context_id,
            'eligibility_id',p_attempt.eligibility_id,'provider_operation_id',p_attempt.provider_operation_id,
            'intended_input_fingerprint',p_attempt.intended_input_fingerprint,
            'normalized_email',p_attempt.normalized_email,'full_name',p_attempt.full_name,
            'contract_version','owner-gateway-operator-v1'))
$$;

CREATE FUNCTION public.private_i3_audit_identity_phase_v1(
    p_attempt public.owner_identity_issuance_attempts,p_phase TEXT,p_actor_id TEXT,
    p_actor_version INTEGER,p_capability TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    INSERT INTO public.owner_identity_execution_audit(
        operation_id,phase,execution_principal_id,execution_credential_version,required_capability,
        original_principal_id,original_credential_version,applicant_key,pharmacy_context_id,
        command_fingerprint,provider_operation_id,observed_state
    ) VALUES (
        p_attempt.operation_id,p_phase,p_actor_id,p_actor_version,p_capability,p_attempt.principal_id,
        p_attempt.original_credential_version,p_attempt.applicant_email_digest,p_attempt.pharmacy_context_id,
        p_attempt.command_fingerprint,p_attempt.provider_operation_id,p_attempt.state
    );
END; $$;

CREATE FUNCTION public.private_i3_attempt_monotonic_v1()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
    IF NEW.operation_id IS DISTINCT FROM OLD.operation_id OR NEW.request_id IS DISTINCT FROM OLD.request_id
       OR NEW.provider_operation_id IS DISTINCT FROM OLD.provider_operation_id OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
       OR NEW.applicant_email_digest IS DISTINCT FROM OLD.applicant_email_digest
       OR NEW.pharmacy_context_id IS DISTINCT FROM OLD.pharmacy_context_id
       OR NEW.command_fingerprint IS DISTINCT FROM OLD.command_fingerprint OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.original_credential_version IS DISTINCT FROM OLD.original_credential_version
       OR NEW.eligibility_id IS DISTINCT FROM OLD.eligibility_id
       OR NEW.intended_input_fingerprint IS DISTINCT FROM OLD.intended_input_fingerprint
       OR NEW.normalized_email IS DISTINCT FROM OLD.normalized_email OR NEW.full_name IS DISTINCT FROM OLD.full_name
       OR NOT (OLD.state='PROVIDER_PENDING' AND NEW.state='COMPLETED' AND OLD.subject_id IS NULL
           AND NEW.subject_id IS NOT NULL AND OLD.canonical_result IS NULL AND NEW.canonical_result IS NOT NULL
           AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL) THEN
        RAISE EXCEPTION USING ERRCODE='PI030',MESSAGE='Issuance attempt binding is immutable';
    END IF;
    RETURN NEW;
END; $$;

ALTER FUNCTION public.private_i3_assert_attempt_provenance_v1(public.owner_identity_issuance_attempts) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_attempt_payload_v1(public.owner_identity_issuance_attempts) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_audit_identity_phase_v1(public.owner_identity_issuance_attempts,TEXT,TEXT,INTEGER,TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_attempt_monotonic_v1() OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.private_i3_assert_attempt_provenance_v1(public.owner_identity_issuance_attempts),
    public.private_i3_attempt_payload_v1(public.owner_identity_issuance_attempts),
    public.private_i3_audit_identity_phase_v1(public.owner_identity_issuance_attempts,TEXT,TEXT,INTEGER,TEXT),
    public.private_i3_attempt_monotonic_v1()
FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;
CREATE TRIGGER trg_i3_identity_attempt_monotonic BEFORE UPDATE ON public.owner_identity_issuance_attempts
FOR EACH ROW EXECUTE FUNCTION public.private_i3_attempt_monotonic_v1();

CREATE FUNCTION public.rpc_gateway_begin_owner_identity_v4(
 p_operation_id UUID,p_request_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID,
 p_eligibility_id UUID,p_provider_operation_id UUID,p_intended_input_fingerprint TEXT,
 p_email TEXT,p_full_name TEXT,p_command_fingerprint TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE actor RECORD; row_ public.owner_eligibility_requests%ROWTYPE; attempt public.owner_identity_issuance_attempts%ROWTYPE;
 completed public.owner_security_operations%ROWTYPE; email_ TEXT:=lower(trim(p_email)); name_ TEXT:=trim(p_full_name); fp TEXT;
 completed_found BOOLEAN;
BEGIN
 IF p_operation_id IS NULL OR p_request_id IS NULL OR p_eligibility_id IS NULL OR p_provider_operation_id IS NULL
  OR p_pharmacy_context_id IS NULL OR p_applicant_key !~ '^[0-9a-f]{64}$'
  OR p_intended_input_fingerprint !~ '^[0-9a-f]{64}$' OR email_ !~ '^[^@[:space:]]+@[^@[:space:]]+$'
  OR length(name_) NOT BETWEEN 1 AND 120 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid identity command'; END IF;
 SELECT * INTO actor FROM public.private_i3_require_gateway_scope_v1('IDENTITY_ISSUE',p_applicant_key,p_pharmacy_context_id);
 fp:=public.private_i3_assert_fingerprint_v1(p_command_fingerprint,ARRAY[
  'owner-gateway-operator-v1','IDENTITY_ISSUE',actor.principal_id,p_applicant_key,p_pharmacy_context_id::TEXT,
  p_operation_id::TEXT,p_request_id::TEXT,p_eligibility_id::TEXT,p_provider_operation_id::TEXT,
 p_intended_input_fingerprint,email_,name_]);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::TEXT,2));
 SELECT * INTO completed FROM public.owner_security_operations WHERE operation_id=p_operation_id FOR UPDATE;
 completed_found:=FOUND;
 IF FOUND AND (completed.action IS DISTINCT FROM 'IDENTITY_ISSUE'
  OR completed.principal_id IS DISTINCT FROM actor.principal_id
  OR completed.applicant_key IS DISTINCT FROM p_applicant_key
  OR completed.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
  OR completed.command_fingerprint IS DISTINCT FROM fp) THEN
  RAISE EXCEPTION USING ERRCODE='PI033',MESSAGE='OPERATION_CONFLICT';
 END IF;
 SELECT * INTO attempt FROM public.owner_identity_issuance_attempts WHERE operation_id=p_operation_id FOR UPDATE;
 IF FOUND THEN
  PERFORM public.private_i3_assert_attempt_provenance_v1(attempt);
  IF attempt.principal_id IS DISTINCT FROM actor.principal_id OR attempt.applicant_email_digest IS DISTINCT FROM p_applicant_key
   OR attempt.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id OR attempt.request_id IS DISTINCT FROM p_request_id
   OR attempt.eligibility_id IS DISTINCT FROM p_eligibility_id OR attempt.provider_operation_id IS DISTINCT FROM p_provider_operation_id
   OR attempt.intended_input_fingerprint IS DISTINCT FROM p_intended_input_fingerprint
   OR attempt.normalized_email IS DISTINCT FROM email_ OR attempt.full_name IS DISTINCT FROM name_
   OR attempt.command_fingerprint IS DISTINCT FROM fp THEN
   RAISE EXCEPTION USING ERRCODE='PI033',MESSAGE='OPERATION_CONFLICT'; END IF;
  RETURN jsonb_build_object('outcome','REPLAY') || public.private_i3_attempt_payload_v1(attempt);
  END IF;
 IF completed_found THEN RAISE EXCEPTION USING ERRCODE='PI039',MESSAGE='LEGACY_ISSUANCE_PROVENANCE_INCOMPLETE'; END IF;
 SELECT * INTO row_ FROM public.owner_eligibility_requests WHERE request_id=p_request_id FOR UPDATE;
 IF NOT FOUND OR row_.request_id IS DISTINCT FROM p_eligibility_id
  OR row_.normalized_email_digest IS DISTINCT FROM p_applicant_key
  OR row_.normalized_email_digest IS DISTINCT FROM encode(digest(convert_to(email_,'UTF8'),'sha256'),'hex')
  OR row_.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
  OR row_.provider_operation_id IS DISTINCT FROM p_provider_operation_id
  OR row_.intended_input_fingerprint IS DISTINCT FROM p_intended_input_fingerprint OR row_.state <> 'RESERVED'
  THEN RAISE EXCEPTION USING ERRCODE='PI014',MESSAGE='AUTHORITATIVE_RESERVATION_CONFLICT'; END IF;
 INSERT INTO public.owner_identity_issuance_attempts(
  operation_id,request_id,provider_operation_id,principal_id,applicant_email_digest,pharmacy_context_id,
  command_fingerprint,state,original_credential_version,eligibility_id,intended_input_fingerprint,normalized_email,full_name
 ) VALUES (
  p_operation_id,p_request_id,p_provider_operation_id,actor.principal_id,p_applicant_key,p_pharmacy_context_id,
  fp,'PROVIDER_PENDING',actor.credential_version,p_eligibility_id,p_intended_input_fingerprint,email_,name_);
 PERFORM public.private_mark_owner_auth_pending_v1(p_request_id,p_intended_input_fingerprint,p_provider_operation_id);
 SELECT * INTO attempt FROM public.owner_identity_issuance_attempts WHERE operation_id=p_operation_id;
 RETURN jsonb_build_object('outcome','APPLIED') || public.private_i3_attempt_payload_v1(attempt);
END; $$;

CREATE FUNCTION public.private_i3_authorize_identity_phase_v1(
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
 IF attempt.state <> 'PROVIDER_PENDING' THEN
  RAISE EXCEPTION USING ERRCODE='PI037',MESSAGE='ISSUANCE_NOT_PENDING'; END IF;
 PERFORM public.private_i3_audit_identity_phase_v1(attempt,p_phase,actor.principal_id,actor.credential_version,p_capability);
 RETURN public.private_i3_attempt_payload_v1(attempt);
END; $$;

CREATE FUNCTION public.rpc_gateway_authorize_owner_identity_dispatch_v1(
 p_operation_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
 SELECT public.private_i3_authorize_identity_phase_v1('IDENTITY_ISSUE','PROVIDER_DISPATCH_AUTHORIZED',$1,$2,$3)
$$;
CREATE FUNCTION public.rpc_gateway_authorize_owner_identity_resolution_v1(
 p_operation_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
 SELECT public.private_i3_authorize_identity_phase_v1('IDENTITY_RECOVER','PROVIDER_RESOLUTION_AUTHORIZED',$1,$2,$3)
$$;

CREATE FUNCTION public.private_i3_complete_owner_identity_v3(
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
  OR attempt.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
  OR attempt.provider_operation_id IS DISTINCT FROM p_provider_operation_id THEN
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='AUTHORITATIVE_RESULT_NOT_FOUND'; END IF;
 PERFORM public.private_i3_assert_attempt_provenance_v1(attempt);
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
 -- Required audit is in the same transaction: any audit error rolls back correlation, result and completion.
 PERFORM public.private_i3_audit_identity_phase_v1(attempt,p_phase,actor.principal_id,actor.credential_version,p_capability);
 RETURN result;
END; $$;

CREATE FUNCTION public.rpc_gateway_complete_owner_identity_issue_v4(
 p_operation_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID,p_provider_operation_id UUID,p_subject_id UUID
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
 SELECT public.private_i3_complete_owner_identity_v3('IDENTITY_ISSUE','ISSUE_COMPLETED','ISSUE_REPLAY',$1,$2,$3,$4,$5)
$$;
CREATE FUNCTION public.rpc_gateway_complete_owner_identity_recovery_v4(
 p_operation_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID,p_provider_operation_id UUID,p_subject_id UUID
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
 SELECT public.private_i3_complete_owner_identity_v3('IDENTITY_RECOVER','RECOVERY_COMPLETED','RECOVERY_REPLAY',$1,$2,$3,$4,$5)
$$;

CREATE FUNCTION public.private_i3_lookup_owner_identity_v1(
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
 IF p_require_completed AND attempt.state <> 'COMPLETED' THEN
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='AUTHORITATIVE_RESULT_NOT_FOUND'; END IF;
 PERFORM public.private_i3_audit_identity_phase_v1(attempt,p_phase,actor.principal_id,actor.credential_version,p_capability);
 RETURN public.private_i3_attempt_payload_v1(attempt);
END; $$;

CREATE FUNCTION public.rpc_gateway_recover_owner_identity_v4(
 p_operation_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
 SELECT public.private_i3_lookup_owner_identity_v1('IDENTITY_RECOVER','RECOVERY_LOOKUP',$1,$2,$3,FALSE)
$$;
CREATE FUNCTION public.rpc_gateway_lookup_owner_identity_issue_result_v1(
 p_operation_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
 SELECT public.private_i3_lookup_owner_identity_v1('IDENTITY_ISSUE','ISSUE_RESULT_LOOKUP',$1,$2,$3,TRUE)
$$;
CREATE FUNCTION public.rpc_gateway_lookup_owner_identity_recovery_result_v1(
 p_operation_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
 SELECT public.private_i3_lookup_owner_identity_v1('IDENTITY_RECOVER','RECOVERY_RESULT_LOOKUP',$1,$2,$3,TRUE)
$$;

ALTER FUNCTION public.rpc_gateway_begin_owner_identity_v4(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_authorize_identity_phase_v1(TEXT,TEXT,UUID,TEXT,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_gateway_authorize_owner_identity_dispatch_v1(UUID,TEXT,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_gateway_authorize_owner_identity_resolution_v1(UUID,TEXT,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_complete_owner_identity_v3(TEXT,TEXT,TEXT,UUID,TEXT,UUID,UUID,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_gateway_complete_owner_identity_issue_v4(UUID,TEXT,UUID,UUID,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_gateway_complete_owner_identity_recovery_v4(UUID,TEXT,UUID,UUID,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_lookup_owner_identity_v1(TEXT,TEXT,UUID,TEXT,UUID,BOOLEAN) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_gateway_recover_owner_identity_v4(UUID,TEXT,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_gateway_lookup_owner_identity_issue_result_v1(UUID,TEXT,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_gateway_lookup_owner_identity_recovery_result_v1(UUID,TEXT,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;

REVOKE ALL ON FUNCTION public.private_i3_authorize_identity_phase_v1(TEXT,TEXT,UUID,TEXT,UUID),
 public.private_i3_complete_owner_identity_v3(TEXT,TEXT,TEXT,UUID,TEXT,UUID,UUID,UUID),
 public.private_i3_lookup_owner_identity_v1(TEXT,TEXT,UUID,TEXT,UUID,BOOLEAN)
FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;

-- Close every superseded identity route explicitly, including defaults and both executors.
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

-- New public RPCs start closed, then grant only the gateway executor.
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

-- Each RPC performs its current authority/scope check inside its own transaction before protected lookup
-- or mutation. A committed authorization transaction does not authorize later dispatch/completion calls.
-- Source ordering and injected models are not PostgreSQL ACL, RLS, rollback, or concurrency acceptance.
