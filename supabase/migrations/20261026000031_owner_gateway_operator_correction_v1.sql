-- BLK-002-I3 bounded correction v1 (UNEXECUTED; independent review required).
-- Forward-only correction of 000030. No identity provisioning, memberships, credentials,
-- runtime mapping, service_role substitution, activation, or data reconciliation is included.

CREATE TABLE public.owner_gateway_authorities (
    principal_id TEXT PRIMARY KEY CHECK (length(trim(principal_id)) > 0),
    active BOOLEAN NOT NULL DEFAULT FALSE,
    credential_version INTEGER NOT NULL CHECK (credential_version > 0),
    capabilities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CHECK (capabilities <@ ARRAY['ELIGIBILITY_RESERVE','IDENTITY_ISSUE','IDENTITY_RECOVER']::TEXT[])
);
CREATE TABLE public.owner_operator_authorities (
    principal_id TEXT PRIMARY KEY CHECK (length(trim(principal_id)) > 0),
    active BOOLEAN NOT NULL DEFAULT FALSE,
    credential_version INTEGER NOT NULL CHECK (credential_version > 0),
    permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CHECK (permissions <@ ARRAY['ADMISSION_APPROVE','ADMISSION_REPLACE','ADMISSION_REVOKE','ELIGIBILITY_REVOKE']::TEXT[])
);
ALTER TABLE public.owner_gateway_authorities OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER TABLE public.owner_operator_authorities OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER TABLE public.owner_gateway_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_gateway_authorities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.owner_operator_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_operator_authorities FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_gateway_authorities, public.owner_operator_authorities
FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor,
     pharmacyflow_platform_admission_operator;
CREATE POLICY rls_owner_gateway_authorities_private ON public.owner_gateway_authorities
FOR ALL TO pharmacyflow_owner_eligibility_issuer USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY rls_owner_operator_authorities_private ON public.owner_operator_authorities
FOR ALL TO pharmacyflow_owner_eligibility_issuer USING (TRUE) WITH CHECK (TRUE);

-- Empty registries deliberately fail closed. A separately authorized migration must provision them.
CREATE OR REPLACE FUNCTION public.private_i3_require_gateway_v1(p_capability TEXT)
RETURNS TABLE(principal_id TEXT, credential_version INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE v_claims JSONB := auth.jwt(); v_version INTEGER; v_principal TEXT;
BEGIN
    IF p_capability NOT IN ('ELIGIBILITY_RESERVE','IDENTITY_ISSUE','IDENTITY_RECOVER')
       OR v_claims->>'role' IS DISTINCT FROM 'pharmacyflow_owner_gateway_executor'
       OR v_claims->>'aud' IS DISTINCT FROM 'pharmacyflow-owner-i3'
       OR v_claims->>'pharmacyflow_principal_class' IS DISTINCT FROM 'GATEWAY'
       OR NULLIF(trim(v_claims->>'sub'),'') IS NULL
       OR COALESCE(v_claims->>'pharmacyflow_credential_version','') !~ '^[1-9][0-9]*$' THEN
        RAISE EXCEPTION USING ERRCODE='PI031', MESSAGE='GATEWAY_AUTHORITY_DENIED';
    END IF;
    v_principal := v_claims->>'sub'; v_version := (v_claims->>'pharmacyflow_credential_version')::INTEGER;
    IF NOT EXISTS (SELECT 1 FROM public.owner_gateway_authorities a
        WHERE a.principal_id=v_principal AND a.active AND a.credential_version=v_version
          AND p_capability=ANY(a.capabilities)) THEN
        RAISE EXCEPTION USING ERRCODE='PI031', MESSAGE='GATEWAY_AUTHORITY_DENIED';
    END IF;
    RETURN QUERY SELECT v_principal, v_version;
END; $$;
CREATE OR REPLACE FUNCTION public.private_i3_require_operator_v1(p_permission TEXT)
RETURNS TABLE(principal_id TEXT, credential_version INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE v_claims JSONB := auth.jwt(); v_version INTEGER; v_principal TEXT;
BEGIN
    IF p_permission NOT IN ('ADMISSION_APPROVE','ADMISSION_REPLACE','ADMISSION_REVOKE','ELIGIBILITY_REVOKE')
       OR v_claims->>'role' IS DISTINCT FROM 'pharmacyflow_platform_admission_operator'
       OR v_claims->>'aud' IS DISTINCT FROM 'pharmacyflow-owner-i3'
       OR v_claims->>'pharmacyflow_principal_class' IS DISTINCT FROM 'PLATFORM_OPERATOR'
       OR NULLIF(trim(v_claims->>'sub'),'') IS NULL
       OR COALESCE(v_claims->>'pharmacyflow_credential_version','') !~ '^[1-9][0-9]*$' THEN
        RAISE EXCEPTION USING ERRCODE='PI032', MESSAGE='OPERATOR_AUTHORITY_DENIED';
    END IF;
    v_principal := v_claims->>'sub'; v_version := (v_claims->>'pharmacyflow_credential_version')::INTEGER;
    IF NOT EXISTS (SELECT 1 FROM public.owner_operator_authorities a
        WHERE a.principal_id=v_principal AND a.active AND a.credential_version=v_version
          AND p_permission=ANY(a.permissions)) THEN
        RAISE EXCEPTION USING ERRCODE='PI032', MESSAGE='OPERATOR_AUTHORITY_DENIED';
    END IF;
    RETURN QUERY SELECT v_principal, v_version;
END; $$;
ALTER FUNCTION public.private_i3_require_gateway_v1(TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_require_operator_v1(TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.private_i3_require_gateway_v1(TEXT), public.private_i3_require_operator_v1(TEXT)
FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;

-- Identical UTF-8 byte-length/null framing is implemented in owner-security-i3.ts.
CREATE OR REPLACE FUNCTION public.private_i3_frame_command_field_v1(p_value TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
    SELECT octet_length(convert_to(p_value,'UTF8'))::TEXT || ':' || p_value
$$;
CREATE OR REPLACE FUNCTION public.private_i3_command_fingerprint_v1(p_fields TEXT[])
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT encode(digest(convert_to('PF-I3-COMMAND-V1' || COALESCE((
        SELECT string_agg(E'\n' || CASE WHEN v IS NULL THEN '-1:' ELSE public.private_i3_frame_command_field_v1(v) END, '' ORDER BY n)
        FROM unnest(p_fields) WITH ORDINALITY AS f(v,n)), ''), 'UTF8'), 'sha256'), 'hex')
$$;
CREATE OR REPLACE FUNCTION public.private_i3_assert_fingerprint_v1(p_supplied TEXT, p_fields TEXT[])
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_expected TEXT := public.private_i3_command_fingerprint_v1(p_fields);
BEGIN
    IF p_supplied !~ '^[0-9a-f]{64}$' OR p_supplied IS DISTINCT FROM v_expected THEN
        RAISE EXCEPTION USING ERRCODE='PI033', MESSAGE='OPERATION_CONFLICT';
    END IF;
    RETURN v_expected;
END; $$;
ALTER FUNCTION public.private_i3_frame_command_field_v1(TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_command_fingerprint_v1(TEXT[]) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_assert_fingerprint_v1(TEXT,TEXT[]) OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.private_i3_frame_command_field_v1(TEXT), public.private_i3_command_fingerprint_v1(TEXT[]),
    public.private_i3_assert_fingerprint_v1(TEXT,TEXT[]) FROM PUBLIC, anon, authenticated, service_role,
    pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;

CREATE TABLE public.owner_identity_issuance_attempts (
    operation_id UUID PRIMARY KEY,
    request_id UUID NOT NULL UNIQUE REFERENCES public.owner_eligibility_requests(request_id) ON DELETE RESTRICT,
    provider_operation_id UUID NOT NULL UNIQUE,
    principal_id TEXT NOT NULL,
    applicant_email_digest TEXT NOT NULL CHECK (applicant_email_digest ~ '^[0-9a-f]{64}$'),
    pharmacy_context_id UUID NOT NULL,
    command_fingerprint TEXT NOT NULL CHECK (command_fingerprint ~ '^[0-9a-f]{64}$'),
    state TEXT NOT NULL CHECK (state IN ('PROVIDER_PENDING','COMPLETED')),
    subject_id UUID,
    canonical_result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc',now()),
    completed_at TIMESTAMPTZ,
    CHECK ((state='PROVIDER_PENDING' AND subject_id IS NULL AND canonical_result IS NULL AND completed_at IS NULL)
        OR (state='COMPLETED' AND subject_id IS NOT NULL AND canonical_result IS NOT NULL AND completed_at IS NOT NULL))
);
ALTER TABLE public.owner_identity_issuance_attempts OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER TABLE public.owner_identity_issuance_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_identity_issuance_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_identity_issuance_attempts FROM PUBLIC, anon, authenticated, service_role,
    pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;
CREATE POLICY rls_owner_identity_attempts_private ON public.owner_identity_issuance_attempts
FOR ALL TO pharmacyflow_owner_eligibility_issuer USING (TRUE) WITH CHECK (TRUE);
ALTER TABLE public.owner_security_operations ADD COLUMN subject_id UUID;
ALTER TABLE public.owner_eligibility_revocation_decisions ADD COLUMN subject_id UUID;

-- The begin transaction locks operation then request, validates every authoritative binding and revocable
-- state, persists the attempt, and moves the request to AUTH_CREATE_PENDING before provider work is allowed.
CREATE FUNCTION public.rpc_gateway_begin_owner_identity_v2(
 p_operation_id UUID,p_request_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID,
 p_eligibility_id UUID,p_provider_operation_id UUID,p_intended_input_fingerprint TEXT,
 p_email TEXT,p_full_name TEXT,p_command_fingerprint TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_actor RECORD; v_row public.owner_eligibility_requests%ROWTYPE;
 v_attempt public.owner_identity_issuance_attempts%ROWTYPE; v_email TEXT:=lower(trim(p_email)); v_fp TEXT; v_result JSONB;
BEGIN
 IF p_operation_id IS NULL OR p_request_id IS NULL OR p_eligibility_id IS NULL OR p_provider_operation_id IS NULL
   OR p_pharmacy_context_id IS NULL OR p_applicant_key !~ '^[0-9a-f]{64}$'
   OR p_intended_input_fingerprint !~ '^[0-9a-f]{64}$' OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$'
   OR length(trim(p_full_name)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid identity command'; END IF;
 SELECT * INTO v_actor FROM public.private_i3_require_gateway_v1('IDENTITY_ISSUE');
 v_fp:=public.private_i3_assert_fingerprint_v1(p_command_fingerprint,ARRAY[
  'owner-gateway-operator-v1','IDENTITY_ISSUE',v_actor.principal_id,p_applicant_key,p_pharmacy_context_id::TEXT,
  p_operation_id::TEXT,p_request_id::TEXT,p_eligibility_id::TEXT,p_provider_operation_id::TEXT,
  p_intended_input_fingerprint,v_email,trim(p_full_name)]);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::TEXT,2));
 SELECT * INTO v_attempt FROM public.owner_identity_issuance_attempts WHERE operation_id=p_operation_id FOR UPDATE;
 IF FOUND THEN
  IF v_attempt.principal_id IS DISTINCT FROM v_actor.principal_id OR v_attempt.applicant_email_digest IS DISTINCT FROM p_applicant_key
   OR v_attempt.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id OR v_attempt.request_id IS DISTINCT FROM p_request_id
   OR v_attempt.provider_operation_id IS DISTINCT FROM p_provider_operation_id OR v_attempt.command_fingerprint IS DISTINCT FROM v_fp
   THEN RAISE EXCEPTION USING ERRCODE='PI033',MESSAGE='OPERATION_CONFLICT'; END IF;
  RETURN jsonb_build_object('outcome','REPLAY','state',v_attempt.state,'result',v_attempt.canonical_result);
 END IF;
 SELECT * INTO v_row FROM public.owner_eligibility_requests WHERE request_id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v_row.request_id IS DISTINCT FROM p_eligibility_id OR v_row.normalized_email_digest IS DISTINCT FROM p_applicant_key
  OR v_row.normalized_email_digest IS DISTINCT FROM encode(digest(convert_to(v_email,'UTF8'),'sha256'),'hex')
  OR v_row.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id OR v_row.provider_operation_id IS DISTINCT FROM p_provider_operation_id
  OR v_row.intended_input_fingerprint IS DISTINCT FROM p_intended_input_fingerprint OR v_row.state <> 'RESERVED'
  THEN RAISE EXCEPTION USING ERRCODE='PI014',MESSAGE='AUTHORITATIVE_RESERVATION_CONFLICT'; END IF;
 INSERT INTO public.owner_identity_issuance_attempts(operation_id,request_id,provider_operation_id,principal_id,
  applicant_email_digest,pharmacy_context_id,command_fingerprint,state) VALUES
  (p_operation_id,p_request_id,p_provider_operation_id,v_actor.principal_id,p_applicant_key,p_pharmacy_context_id,v_fp,'PROVIDER_PENDING');
 PERFORM public.private_mark_owner_auth_pending_v1(p_request_id,p_intended_input_fingerprint,p_provider_operation_id);
 RETURN jsonb_build_object('outcome','APPLIED','state','PROVIDER_PENDING','result',NULL);
END; $$;

-- Completion requires the durable attempt; correlation, canonical result, subject evidence and operation
-- evidence commit in this single transaction. Existing I1 trusted-marker/Auth checks remain authoritative.
CREATE FUNCTION public.rpc_gateway_complete_owner_identity_v2(
 p_operation_id UUID,p_request_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID,
 p_eligibility_id UUID,p_provider_operation_id UUID,p_intended_input_fingerprint TEXT,p_email TEXT,
 p_full_name TEXT,p_subject_id UUID,p_command_fingerprint TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_actor RECORD; v_a public.owner_identity_issuance_attempts%ROWTYPE; v_result JSONB; v_fp TEXT; v_email TEXT:=lower(trim(p_email));
BEGIN
 IF p_subject_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid subject'; END IF;
 SELECT * INTO v_actor FROM public.private_i3_require_gateway_v1('IDENTITY_ISSUE');
 v_fp:=public.private_i3_assert_fingerprint_v1(p_command_fingerprint,ARRAY['owner-gateway-operator-v1','IDENTITY_ISSUE',
  v_actor.principal_id,p_applicant_key,p_pharmacy_context_id::TEXT,p_operation_id::TEXT,p_request_id::TEXT,
  p_eligibility_id::TEXT,p_provider_operation_id::TEXT,p_intended_input_fingerprint,v_email,trim(p_full_name)]);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::TEXT,2));
 SELECT * INTO v_a FROM public.owner_identity_issuance_attempts WHERE operation_id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR v_a.command_fingerprint IS DISTINCT FROM v_fp OR v_a.principal_id IS DISTINCT FROM v_actor.principal_id
  OR v_a.request_id IS DISTINCT FROM p_request_id OR v_a.provider_operation_id IS DISTINCT FROM p_provider_operation_id
  OR v_a.applicant_email_digest IS DISTINCT FROM p_applicant_key OR v_a.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
  THEN RAISE EXCEPTION USING ERRCODE='PI014',MESSAGE='ISSUANCE_ATTEMPT_CONFLICT'; END IF;
 IF v_a.state='COMPLETED' THEN
  IF v_a.subject_id IS DISTINCT FROM p_subject_id THEN RAISE EXCEPTION USING ERRCODE='PI033',MESSAGE='OPERATION_CONFLICT'; END IF;
  RETURN v_a.canonical_result;
 END IF;
 PERFORM public.private_correlate_owner_identity_v1(p_request_id,p_intended_input_fingerprint,p_provider_operation_id,p_subject_id);
 SELECT canonical_issuer_response || jsonb_build_object('state','EMAIL_CONFIRMATION_PENDING','subject_id',p_subject_id)
 INTO v_result FROM public.owner_eligibility_requests WHERE request_id=p_request_id;
 INSERT INTO public.owner_security_operations(contract_version,operation_id,action,principal_class,principal_id,
  credential_version,applicant_key,pharmacy_context_id,command_fingerprint,result_identity,canonical_result,occurred_at,subject_id)
 VALUES('owner-gateway-operator-v1',p_operation_id,'IDENTITY_ISSUE','GATEWAY',v_actor.principal_id,v_actor.credential_version,
  p_applicant_key,p_pharmacy_context_id,v_fp,p_subject_id::TEXT,v_result,timezone('utc',now()),p_subject_id);
 UPDATE public.owner_identity_issuance_attempts SET state='COMPLETED',subject_id=p_subject_id,
  canonical_result=v_result,completed_at=timezone('utc',now()) WHERE operation_id=p_operation_id;
 RETURN v_result;
END; $$;

CREATE FUNCTION public.rpc_gateway_recover_owner_identity_v2(
 p_operation_id UUID,p_request_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID,p_eligibility_id UUID,
 p_provider_operation_id UUID,p_intended_input_fingerprint TEXT,p_email TEXT,p_full_name TEXT,p_command_fingerprint TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_actor RECORD; v_a public.owner_identity_issuance_attempts%ROWTYPE; v_fp TEXT;
BEGIN
 SELECT * INTO v_actor FROM public.private_i3_require_gateway_v1('IDENTITY_RECOVER');
 v_fp:=public.private_i3_assert_fingerprint_v1(p_command_fingerprint,ARRAY['owner-gateway-operator-v1','IDENTITY_ISSUE',
  v_actor.principal_id,p_applicant_key,p_pharmacy_context_id::TEXT,p_operation_id::TEXT,p_request_id::TEXT,
  p_eligibility_id::TEXT,p_provider_operation_id::TEXT,p_intended_input_fingerprint,lower(trim(p_email)),trim(p_full_name)]);
 SELECT * INTO v_a FROM public.owner_identity_issuance_attempts WHERE operation_id=p_operation_id;
 IF NOT FOUND OR v_a.command_fingerprint IS DISTINCT FROM v_fp OR v_a.principal_id IS DISTINCT FROM v_actor.principal_id
  THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='AUTHORITATIVE_RESULT_NOT_FOUND'; END IF;
 IF v_a.state='PROVIDER_PENDING' THEN RAISE EXCEPTION USING ERRCODE='PI038',MESSAGE='ISSUANCE_RECOVERY_PENDING'; END IF;
 RETURN v_a.canonical_result;
END; $$;

-- Corrected wrappers compute the fingerprint from normalized complete fields, then invoke the existing
-- transaction bodies with that computed value. Executor-supplied hashes are comparison inputs only.
CREATE FUNCTION public.rpc_gateway_reserve_owner_eligibility_v2(
 p_operation_id UUID,p_request_id UUID,p_email TEXT,p_pharmacy_context_id UUID,p_pharmacy_name TEXT,p_currency TEXT,
 p_admission_decision_id UUID,p_replaces_request_id UUID,p_command_fingerprint TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE a RECORD; f TEXT; k TEXT:=encode(digest(convert_to(lower(trim(p_email)),'UTF8'),'sha256'),'hex');
BEGIN SELECT * INTO a FROM public.private_i3_require_gateway_v1('ELIGIBILITY_RESERVE');
 f:=public.private_i3_assert_fingerprint_v1(p_command_fingerprint,ARRAY['owner-gateway-operator-v1','ELIGIBILITY_RESERVE',a.principal_id,k,p_pharmacy_context_id::TEXT,p_operation_id::TEXT,p_request_id::TEXT,lower(trim(p_email)),trim(p_pharmacy_name),upper(trim(p_currency)),p_admission_decision_id::TEXT,p_replaces_request_id::TEXT]);
 RETURN public.rpc_gateway_reserve_owner_eligibility_v1(p_operation_id,p_request_id,p_email,p_pharmacy_context_id,p_pharmacy_name,p_currency,p_admission_decision_id,p_replaces_request_id,f); END; $$;

CREATE FUNCTION public.rpc_platform_owner_admission_decide_v2(
 p_operation_id UUID,p_action TEXT,p_decision_id UUID,p_email TEXT,p_pharmacy_context_id UUID,p_reason_code TEXT,
 p_predecessor_decision_id UUID,p_command_fingerprint TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE a RECORD; f TEXT; x TEXT:=upper(trim(p_action)); k TEXT:=encode(digest(convert_to(lower(trim(p_email)),'UTF8'),'sha256'),'hex'); perm TEXT;
BEGIN perm:=CASE x WHEN 'APPROVE' THEN 'ADMISSION_APPROVE' WHEN 'REPLACE' THEN 'ADMISSION_REPLACE' WHEN 'REVOKE' THEN 'ADMISSION_REVOKE' ELSE NULL END;
 IF perm IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='UNKNOWN_ADMISSION_ACTION'; END IF;
 SELECT * INTO a FROM public.private_i3_require_operator_v1(perm);
 f:=public.private_i3_assert_fingerprint_v1(p_command_fingerprint,ARRAY['owner-gateway-operator-v1','ADMISSION_'||x,a.principal_id,k,p_pharmacy_context_id::TEXT,p_operation_id::TEXT,x,p_decision_id::TEXT,lower(trim(p_email)),trim(p_reason_code),p_predecessor_decision_id::TEXT]);
 RETURN public.rpc_platform_owner_admission_decide_v1(p_operation_id,x,p_decision_id,p_email,p_pharmacy_context_id,p_reason_code,p_predecessor_decision_id,f); END; $$;

CREATE FUNCTION public.rpc_platform_owner_eligibility_revoke_v2(
 p_operation_id UUID,p_revocation_id UUID,p_request_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID,
 p_reason_code TEXT,p_command_fingerprint TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE a RECORD; f TEXT; r public.owner_eligibility_requests%ROWTYPE; result JSONB; now_utc TIMESTAMPTZ:=timezone('utc',now()); old_op public.owner_security_operations%ROWTYPE;
BEGIN
 IF p_operation_id IS NULL OR p_revocation_id IS NULL OR p_request_id IS NULL OR p_pharmacy_context_id IS NULL
  OR p_applicant_key !~ '^[0-9a-f]{64}$' OR NULLIF(trim(p_reason_code),'') IS NULL
  THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid eligibility revocation command'; END IF;
 SELECT * INTO a FROM public.private_i3_require_operator_v1('ELIGIBILITY_REVOKE');
 f:=public.private_i3_assert_fingerprint_v1(p_command_fingerprint,ARRAY['owner-gateway-operator-v1','ELIGIBILITY_REVOKE',a.principal_id,p_applicant_key,p_pharmacy_context_id::TEXT,p_operation_id::TEXT,p_revocation_id::TEXT,p_request_id::TEXT,trim(p_reason_code)]);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::TEXT,2));
 SELECT * INTO old_op FROM public.owner_security_operations WHERE operation_id=p_operation_id FOR UPDATE;
 IF FOUND THEN
  IF old_op.action IS DISTINCT FROM 'ELIGIBILITY_REVOKE' OR old_op.principal_id IS DISTINCT FROM a.principal_id
   OR old_op.applicant_key IS DISTINCT FROM p_applicant_key OR old_op.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
   OR old_op.command_fingerprint IS DISTINCT FROM f THEN RAISE EXCEPTION USING ERRCODE='PI033',MESSAGE='OPERATION_CONFLICT'; END IF;
  RETURN old_op.canonical_result;
 END IF;
 SELECT * INTO r FROM public.owner_eligibility_requests WHERE request_id=p_request_id FOR UPDATE;
 IF NOT FOUND OR r.normalized_email_digest IS DISTINCT FROM p_applicant_key OR r.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
  THEN RAISE EXCEPTION USING ERRCODE='PI014',MESSAGE='ELIGIBILITY_BINDING_CONFLICT'; END IF;
 IF r.state='CONSUMED' THEN RAISE EXCEPTION USING ERRCODE='PI013',MESSAGE='CONSUMED_IMMUTABLE'; END IF;
 IF r.state NOT IN ('RESERVED','AUTH_CREATE_PENDING','EMAIL_CONFIRMATION_PENDING','ACTIVE')
  THEN RAISE EXCEPTION USING ERRCODE='PI037',MESSAGE='ELIGIBILITY_NOT_REVOCABLE'; END IF;
 result:=jsonb_build_object('applicant_key',p_applicant_key,'contract_version','owner-gateway-operator-v1',
  'eligibility_request_id',p_request_id,'pharmacy_context_id',p_pharmacy_context_id,'revocation_id',p_revocation_id,'state','REVOKED');
 INSERT INTO public.owner_security_operations(contract_version,operation_id,action,principal_class,principal_id,credential_version,
  applicant_key,pharmacy_context_id,command_fingerprint,result_identity,canonical_result,occurred_at,subject_id)
 VALUES('owner-gateway-operator-v1',p_operation_id,'ELIGIBILITY_REVOKE','PLATFORM_OPERATOR',a.principal_id,a.credential_version,
  p_applicant_key,p_pharmacy_context_id,f,p_revocation_id::TEXT,result,now_utc,r.subject_id);
 INSERT INTO public.owner_eligibility_revocation_decisions(revocation_id,operation_id,eligibility_request_id,operator_id,
  applicant_key,pharmacy_context_id,reason_code,revoked_at,subject_id)
 VALUES(p_revocation_id,p_operation_id,p_request_id,a.principal_id,p_applicant_key,p_pharmacy_context_id,trim(p_reason_code),now_utc,r.subject_id);
 UPDATE public.owner_eligibility_requests SET state='REVOKED',revoked_at=now_utc,updated_at=now_utc WHERE request_id=p_request_id;
 RETURN result; END; $$;

ALTER FUNCTION public.rpc_gateway_begin_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_gateway_complete_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_gateway_recover_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_gateway_reserve_owner_eligibility_v2(UUID,UUID,TEXT,UUID,TEXT,TEXT,UUID,UUID,TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_platform_owner_admission_decide_v2(UUID,TEXT,UUID,TEXT,UUID,TEXT,UUID,TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_platform_owner_eligibility_revoke_v2(UUID,UUID,UUID,TEXT,UUID,TEXT,TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;

REVOKE EXECUTE ON FUNCTION public.rpc_gateway_reserve_owner_eligibility_v1(UUID,UUID,TEXT,UUID,TEXT,TEXT,UUID,UUID,TEXT),
 public.rpc_gateway_correlate_owner_identity_v1(UUID,UUID,TEXT,UUID,TEXT,UUID,UUID,TEXT),
 public.rpc_gateway_recover_owner_operation_v1(UUID,TEXT,TEXT,UUID,TEXT) FROM pharmacyflow_owner_gateway_executor;
REVOKE EXECUTE ON FUNCTION public.rpc_platform_owner_admission_decide_v1(UUID,TEXT,UUID,TEXT,UUID,TEXT,UUID,TEXT),
 public.rpc_platform_owner_eligibility_revoke_v1(UUID,UUID,UUID,TEXT,UUID,TEXT,TEXT) FROM pharmacyflow_platform_admission_operator;
GRANT EXECUTE ON FUNCTION public.rpc_gateway_begin_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT),
 public.rpc_gateway_complete_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT),
 public.rpc_gateway_recover_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT),
 public.rpc_gateway_reserve_owner_eligibility_v2(UUID,UUID,TEXT,UUID,TEXT,TEXT,UUID,UUID,TEXT)
 TO pharmacyflow_owner_gateway_executor;
GRANT EXECUTE ON FUNCTION public.rpc_platform_owner_admission_decide_v2(UUID,TEXT,UUID,TEXT,UUID,TEXT,UUID,TEXT),
 public.rpc_platform_owner_eligibility_revoke_v2(UUID,UUID,UUID,TEXT,UUID,TEXT,TEXT)
 TO pharmacyflow_platform_admission_operator;

-- Lock compatibility: 000028/000029 already serialize target request rows. New paths acquire operation
-- advisory lock before request row; reserve remains operation -> request -> email -> admission -> request.
-- This source ordering is proposed compatibility, not PostgreSQL concurrency proof. Acceptance remains unexecuted.
