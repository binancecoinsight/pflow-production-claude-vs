-- BLK-002-I3 final boundary/parity correction (UNEXECUTED; independent review required).
-- Forward-only repair of 000031. No principal provisioning, credential, runtime mapping,
-- provider adapter, activation, reconciliation mutation, or protected execution is included.

CREATE TABLE public.owner_security_operation_claims (
    operation_id UUID PRIMARY KEY,
    action TEXT NOT NULL CHECK (action IN (
        'ADMISSION_APPROVE','ADMISSION_REPLACE','ADMISSION_REVOKE',
        'ELIGIBILITY_RESERVE','IDENTITY_ISSUE','ELIGIBILITY_REVOKE'
    )),
    principal_id TEXT NOT NULL CHECK (length(trim(principal_id)) > 0),
    applicant_key TEXT NOT NULL CHECK (length(trim(applicant_key)) > 0),
    pharmacy_context_id UUID NOT NULL,
    command_fingerprint TEXT NOT NULL CHECK (command_fingerprint ~ '^[0-9a-f]{64}$'),
    claim_state TEXT NOT NULL CHECK (claim_state IN ('PENDING','COMPLETED')),
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc',now()),
    completed_at TIMESTAMPTZ,
    CHECK ((claim_state='PENDING' AND completed_at IS NULL)
        OR (claim_state='COMPLETED' AND completed_at IS NOT NULL))
);
ALTER TABLE public.owner_security_operation_claims OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER TABLE public.owner_security_operation_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_security_operation_claims FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_security_operation_claims FROM PUBLIC, anon, authenticated, service_role,
    pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;
CREATE POLICY rls_owner_security_operation_claims_private ON public.owner_security_operation_claims
FOR ALL TO pharmacyflow_owner_eligibility_issuer USING (TRUE) WITH CHECK (TRUE);

-- Prospective 000030/000031 execution is empty by precondition, but this makes the repair safe if
-- completed I3 evidence exists when 000032 is later considered for an already-authored environment.
INSERT INTO public.owner_security_operation_claims(
    operation_id,action,principal_id,applicant_key,pharmacy_context_id,command_fingerprint,
    claim_state,claimed_at,completed_at
)
SELECT operation_id,action,principal_id,applicant_key,pharmacy_context_id,command_fingerprint,
       'COMPLETED',occurred_at,occurred_at
FROM public.owner_security_operations
ON CONFLICT (operation_id) DO NOTHING;

CREATE FUNCTION public.private_i3_claim_pending_operation_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.owner_security_operation_claims%ROWTYPE; completed public.owner_security_operations%ROWTYPE;
BEGIN
    SELECT * INTO completed FROM public.owner_security_operations WHERE operation_id=NEW.operation_id FOR UPDATE;
    IF FOUND THEN
        RAISE EXCEPTION USING ERRCODE='PI033',MESSAGE='OPERATION_ALREADY_COMPLETED';
    END IF;
    INSERT INTO public.owner_security_operation_claims(
        operation_id,action,principal_id,applicant_key,pharmacy_context_id,command_fingerprint,claim_state
    ) VALUES (
        NEW.operation_id,'IDENTITY_ISSUE',NEW.principal_id,NEW.applicant_email_digest,
        NEW.pharmacy_context_id,NEW.command_fingerprint,'PENDING'
    ) ON CONFLICT (operation_id) DO NOTHING;
    SELECT * INTO c FROM public.owner_security_operation_claims WHERE operation_id=NEW.operation_id FOR UPDATE;
    IF c.action IS DISTINCT FROM 'IDENTITY_ISSUE' OR c.principal_id IS DISTINCT FROM NEW.principal_id
       OR c.applicant_key IS DISTINCT FROM NEW.applicant_email_digest
       OR c.pharmacy_context_id IS DISTINCT FROM NEW.pharmacy_context_id
       OR c.command_fingerprint IS DISTINCT FROM NEW.command_fingerprint
       OR c.claim_state IS DISTINCT FROM 'PENDING' THEN
        RAISE EXCEPTION USING ERRCODE='PI033',MESSAGE='OPERATION_CONFLICT';
    END IF;
    RETURN NEW;
END; $$;

CREATE FUNCTION public.private_i3_claim_completed_operation_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.owner_security_operation_claims%ROWTYPE;
BEGIN
    INSERT INTO public.owner_security_operation_claims(
        operation_id,action,principal_id,applicant_key,pharmacy_context_id,command_fingerprint,
        claim_state,claimed_at,completed_at
    ) VALUES (
        NEW.operation_id,NEW.action,NEW.principal_id,NEW.applicant_key,NEW.pharmacy_context_id,
        NEW.command_fingerprint,'COMPLETED',NEW.occurred_at,NEW.occurred_at
    ) ON CONFLICT (operation_id) DO NOTHING;
    SELECT * INTO c FROM public.owner_security_operation_claims WHERE operation_id=NEW.operation_id FOR UPDATE;
    IF c.action IS DISTINCT FROM NEW.action OR c.principal_id IS DISTINCT FROM NEW.principal_id
       OR c.applicant_key IS DISTINCT FROM NEW.applicant_key
       OR c.pharmacy_context_id IS DISTINCT FROM NEW.pharmacy_context_id
       OR c.command_fingerprint IS DISTINCT FROM NEW.command_fingerprint THEN
        RAISE EXCEPTION USING ERRCODE='PI033',MESSAGE='OPERATION_CONFLICT';
    END IF;
    IF c.claim_state='PENDING' AND NEW.action IS DISTINCT FROM 'IDENTITY_ISSUE' THEN
        RAISE EXCEPTION USING ERRCODE='PI033',MESSAGE='OPERATION_CONFLICT';
    END IF;
    UPDATE public.owner_security_operation_claims SET claim_state='COMPLETED',completed_at=NEW.occurred_at
    WHERE operation_id=NEW.operation_id AND claim_state='PENDING';
    RETURN NEW;
END; $$;

CREATE FUNCTION public.private_i3_operation_claim_monotonic_v1()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
    IF NEW.operation_id IS DISTINCT FROM OLD.operation_id OR NEW.action IS DISTINCT FROM OLD.action
       OR NEW.principal_id IS DISTINCT FROM OLD.principal_id OR NEW.applicant_key IS DISTINCT FROM OLD.applicant_key
       OR NEW.pharmacy_context_id IS DISTINCT FROM OLD.pharmacy_context_id
       OR NEW.command_fingerprint IS DISTINCT FROM OLD.command_fingerprint OR NEW.claimed_at IS DISTINCT FROM OLD.claimed_at
       OR NOT (OLD.claim_state='PENDING' AND NEW.claim_state='COMPLETED' AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL) THEN
        RAISE EXCEPTION USING ERRCODE='PI030',MESSAGE='Operation claim binding is immutable';
    END IF;
    RETURN NEW;
END; $$;

ALTER FUNCTION public.private_i3_claim_pending_operation_v1() OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_claim_completed_operation_v1() OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_operation_claim_monotonic_v1() OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.private_i3_claim_pending_operation_v1() FROM PUBLIC, anon, authenticated, service_role,
    pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;
REVOKE ALL ON FUNCTION public.private_i3_claim_completed_operation_v1() FROM PUBLIC, anon, authenticated, service_role,
    pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;
REVOKE ALL ON FUNCTION public.private_i3_operation_claim_monotonic_v1() FROM PUBLIC, anon, authenticated, service_role,
    pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;
CREATE TRIGGER trg_i3_claim_pending_operation BEFORE INSERT ON public.owner_identity_issuance_attempts
FOR EACH ROW EXECUTE FUNCTION public.private_i3_claim_pending_operation_v1();
CREATE TRIGGER trg_i3_claim_completed_operation BEFORE INSERT ON public.owner_security_operations
FOR EACH ROW EXECUTE FUNCTION public.private_i3_claim_completed_operation_v1();
CREATE TRIGGER trg_i3_operation_claim_monotonic BEFORE UPDATE ON public.owner_security_operation_claims
FOR EACH ROW EXECUTE FUNCTION public.private_i3_operation_claim_monotonic_v1();

CREATE FUNCTION public.rpc_gateway_begin_owner_identity_v3(
 p_operation_id UUID,p_request_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID,
 p_eligibility_id UUID,p_provider_operation_id UUID,p_intended_input_fingerprint TEXT,
 p_email TEXT,p_full_name TEXT,p_command_fingerprint TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE actor RECORD; row_ public.owner_eligibility_requests%ROWTYPE; attempt public.owner_identity_issuance_attempts%ROWTYPE;
 completed public.owner_security_operations%ROWTYPE; email_ TEXT:=lower(trim(p_email)); fp TEXT;
BEGIN
 IF p_operation_id IS NULL OR p_request_id IS NULL OR p_eligibility_id IS NULL OR p_provider_operation_id IS NULL
  OR p_pharmacy_context_id IS NULL OR p_applicant_key !~ '^[0-9a-f]{64}$'
  OR p_intended_input_fingerprint !~ '^[0-9a-f]{64}$' OR email_ !~ '^[^@[:space:]]+@[^@[:space:]]+$'
  OR length(trim(p_full_name)) NOT BETWEEN 1 AND 120 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid identity command'; END IF;
 SELECT * INTO actor FROM public.private_i3_require_gateway_v1('IDENTITY_ISSUE');
 fp:=public.private_i3_assert_fingerprint_v1(p_command_fingerprint,ARRAY[
  'owner-gateway-operator-v1','IDENTITY_ISSUE',actor.principal_id,p_applicant_key,p_pharmacy_context_id::TEXT,
  p_operation_id::TEXT,p_request_id::TEXT,p_eligibility_id::TEXT,p_provider_operation_id::TEXT,
  p_intended_input_fingerprint,email_,trim(p_full_name)]);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::TEXT,2));
 SELECT * INTO completed FROM public.owner_security_operations WHERE operation_id=p_operation_id FOR UPDATE;
 IF FOUND THEN
  IF completed.action IS DISTINCT FROM 'IDENTITY_ISSUE' OR completed.principal_id IS DISTINCT FROM actor.principal_id
   OR completed.applicant_key IS DISTINCT FROM p_applicant_key OR completed.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
   OR completed.command_fingerprint IS DISTINCT FROM fp THEN RAISE EXCEPTION USING ERRCODE='PI033',MESSAGE='OPERATION_CONFLICT'; END IF;
  RETURN jsonb_build_object('outcome','REPLAY','state','COMPLETED','result',completed.canonical_result);
 END IF;
 SELECT * INTO attempt FROM public.owner_identity_issuance_attempts WHERE operation_id=p_operation_id FOR UPDATE;
 IF FOUND THEN
  IF attempt.principal_id IS DISTINCT FROM actor.principal_id OR attempt.applicant_email_digest IS DISTINCT FROM p_applicant_key
   OR attempt.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id OR attempt.request_id IS DISTINCT FROM p_request_id
   OR attempt.provider_operation_id IS DISTINCT FROM p_provider_operation_id OR attempt.command_fingerprint IS DISTINCT FROM fp
   THEN RAISE EXCEPTION USING ERRCODE='PI033',MESSAGE='OPERATION_CONFLICT'; END IF;
  RETURN jsonb_build_object('outcome','REPLAY','state',attempt.state,'result',attempt.canonical_result);
 END IF;
 SELECT * INTO row_ FROM public.owner_eligibility_requests WHERE request_id=p_request_id FOR UPDATE;
 IF NOT FOUND OR row_.request_id IS DISTINCT FROM p_eligibility_id
  OR row_.normalized_email_digest IS DISTINCT FROM p_applicant_key
  OR row_.normalized_email_digest IS DISTINCT FROM encode(digest(convert_to(email_,'UTF8'),'sha256'),'hex')
  OR row_.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
  OR row_.provider_operation_id IS DISTINCT FROM p_provider_operation_id
  OR row_.intended_input_fingerprint IS DISTINCT FROM p_intended_input_fingerprint OR row_.state <> 'RESERVED'
  THEN RAISE EXCEPTION USING ERRCODE='PI014',MESSAGE='AUTHORITATIVE_RESERVATION_CONFLICT'; END IF;
 INSERT INTO public.owner_identity_issuance_attempts(operation_id,request_id,provider_operation_id,principal_id,
  applicant_email_digest,pharmacy_context_id,command_fingerprint,state)
 VALUES(p_operation_id,p_request_id,p_provider_operation_id,actor.principal_id,p_applicant_key,p_pharmacy_context_id,fp,'PROVIDER_PENDING');
 PERFORM public.private_mark_owner_auth_pending_v1(p_request_id,p_intended_input_fingerprint,p_provider_operation_id);
 RETURN jsonb_build_object('outcome','APPLIED','state','PROVIDER_PENDING','result',NULL);
END; $$;

CREATE FUNCTION public.private_i3_complete_owner_identity_v2(
 p_capability TEXT,p_operation_id UUID,p_request_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID,
 p_eligibility_id UUID,p_provider_operation_id UUID,p_intended_input_fingerprint TEXT,p_email TEXT,
 p_full_name TEXT,p_subject_id UUID,p_command_fingerprint TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE actor RECORD; attempt public.owner_identity_issuance_attempts%ROWTYPE; result JSONB; fp TEXT; email_ TEXT:=lower(trim(p_email));
BEGIN
 IF p_capability NOT IN ('IDENTITY_ISSUE','IDENTITY_RECOVER') OR p_subject_id IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid identity completion'; END IF;
 SELECT * INTO actor FROM public.private_i3_require_gateway_v1(p_capability);
 fp:=public.private_i3_assert_fingerprint_v1(p_command_fingerprint,ARRAY['owner-gateway-operator-v1','IDENTITY_ISSUE',
  actor.principal_id,p_applicant_key,p_pharmacy_context_id::TEXT,p_operation_id::TEXT,p_request_id::TEXT,
  p_eligibility_id::TEXT,p_provider_operation_id::TEXT,p_intended_input_fingerprint,email_,trim(p_full_name)]);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::TEXT,2));
 SELECT * INTO attempt FROM public.owner_identity_issuance_attempts WHERE operation_id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR attempt.command_fingerprint IS DISTINCT FROM fp OR attempt.principal_id IS DISTINCT FROM actor.principal_id
  OR attempt.request_id IS DISTINCT FROM p_request_id OR attempt.provider_operation_id IS DISTINCT FROM p_provider_operation_id
  OR attempt.applicant_email_digest IS DISTINCT FROM p_applicant_key
  OR attempt.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
  THEN RAISE EXCEPTION USING ERRCODE='PI014',MESSAGE='ISSUANCE_ATTEMPT_CONFLICT'; END IF;
 IF attempt.state='COMPLETED' THEN
  IF attempt.subject_id IS DISTINCT FROM p_subject_id THEN RAISE EXCEPTION USING ERRCODE='PI033',MESSAGE='OPERATION_CONFLICT'; END IF;
  RETURN attempt.canonical_result;
 END IF;
 PERFORM public.private_correlate_owner_identity_v1(p_request_id,p_intended_input_fingerprint,p_provider_operation_id,p_subject_id);
 SELECT canonical_issuer_response || jsonb_build_object('state','EMAIL_CONFIRMATION_PENDING','subject_id',p_subject_id)
 INTO result FROM public.owner_eligibility_requests WHERE request_id=p_request_id;
 INSERT INTO public.owner_security_operations(contract_version,operation_id,action,principal_class,principal_id,
  credential_version,applicant_key,pharmacy_context_id,command_fingerprint,result_identity,canonical_result,occurred_at,subject_id)
 VALUES('owner-gateway-operator-v1',p_operation_id,'IDENTITY_ISSUE','GATEWAY',actor.principal_id,actor.credential_version,
  p_applicant_key,p_pharmacy_context_id,fp,p_subject_id::TEXT,result,timezone('utc',now()),p_subject_id);
 UPDATE public.owner_identity_issuance_attempts SET state='COMPLETED',subject_id=p_subject_id,
  canonical_result=result,completed_at=timezone('utc',now()) WHERE operation_id=p_operation_id;
 RETURN result;
END; $$;

CREATE FUNCTION public.rpc_gateway_complete_owner_identity_issue_v3(
 p_operation_id UUID,p_request_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID,p_eligibility_id UUID,
 p_provider_operation_id UUID,p_intended_input_fingerprint TEXT,p_email TEXT,p_full_name TEXT,p_subject_id UUID,
 p_command_fingerprint TEXT) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
 SELECT public.private_i3_complete_owner_identity_v2('IDENTITY_ISSUE',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
$$;
CREATE FUNCTION public.rpc_gateway_complete_owner_identity_recovery_v3(
 p_operation_id UUID,p_request_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID,p_eligibility_id UUID,
 p_provider_operation_id UUID,p_intended_input_fingerprint TEXT,p_email TEXT,p_full_name TEXT,p_subject_id UUID,
 p_command_fingerprint TEXT) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
 SELECT public.private_i3_complete_owner_identity_v2('IDENTITY_RECOVER',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
$$;

CREATE FUNCTION public.rpc_gateway_recover_owner_identity_v3(
 p_operation_id UUID,p_request_id UUID,p_applicant_key TEXT,p_pharmacy_context_id UUID,p_eligibility_id UUID,
 p_provider_operation_id UUID,p_intended_input_fingerprint TEXT,p_email TEXT,p_full_name TEXT,p_command_fingerprint TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE actor RECORD; attempt public.owner_identity_issuance_attempts%ROWTYPE; fp TEXT;
BEGIN
 SELECT * INTO actor FROM public.private_i3_require_gateway_v1('IDENTITY_RECOVER');
 fp:=public.private_i3_assert_fingerprint_v1(p_command_fingerprint,ARRAY['owner-gateway-operator-v1','IDENTITY_ISSUE',
  actor.principal_id,p_applicant_key,p_pharmacy_context_id::TEXT,p_operation_id::TEXT,p_request_id::TEXT,
  p_eligibility_id::TEXT,p_provider_operation_id::TEXT,p_intended_input_fingerprint,lower(trim(p_email)),trim(p_full_name)]);
 SELECT * INTO attempt FROM public.owner_identity_issuance_attempts WHERE operation_id=p_operation_id;
 IF NOT FOUND OR attempt.command_fingerprint IS DISTINCT FROM fp OR attempt.principal_id IS DISTINCT FROM actor.principal_id
  OR attempt.request_id IS DISTINCT FROM p_request_id OR attempt.provider_operation_id IS DISTINCT FROM p_provider_operation_id
  OR attempt.applicant_email_digest IS DISTINCT FROM p_applicant_key OR attempt.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
  THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='AUTHORITATIVE_RESULT_NOT_FOUND'; END IF;
 RETURN jsonb_build_object('outcome','REPLAY','state',attempt.state,'result',attempt.canonical_result);
END; $$;

ALTER FUNCTION public.rpc_gateway_begin_owner_identity_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_complete_owner_identity_v2(TEXT,UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_gateway_complete_owner_identity_issue_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_gateway_complete_owner_identity_recovery_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.rpc_gateway_recover_owner_identity_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.private_i3_complete_owner_identity_v2(TEXT,UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT)
 FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;

-- Signature-specific closure: revoke defaults and every unintended principal, then grant one executor.
REVOKE ALL ON FUNCTION public.rpc_gateway_reserve_owner_eligibility_v2(UUID,UUID,TEXT,UUID,TEXT,TEXT,UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_platform_admission_operator, pharmacyflow_owner_gateway_executor;
GRANT EXECUTE ON FUNCTION public.rpc_gateway_reserve_owner_eligibility_v2(UUID,UUID,TEXT,UUID,TEXT,TEXT,UUID,UUID,TEXT) TO pharmacyflow_owner_gateway_executor;
REVOKE ALL ON FUNCTION public.rpc_gateway_begin_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_platform_admission_operator, pharmacyflow_owner_gateway_executor;
REVOKE ALL ON FUNCTION public.rpc_gateway_complete_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT) FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_platform_admission_operator, pharmacyflow_owner_gateway_executor;
REVOKE ALL ON FUNCTION public.rpc_gateway_recover_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_platform_admission_operator, pharmacyflow_owner_gateway_executor;
REVOKE ALL ON FUNCTION public.rpc_platform_owner_admission_decide_v2(UUID,TEXT,UUID,TEXT,UUID,TEXT,UUID,TEXT) FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;
GRANT EXECUTE ON FUNCTION public.rpc_platform_owner_admission_decide_v2(UUID,TEXT,UUID,TEXT,UUID,TEXT,UUID,TEXT) TO pharmacyflow_platform_admission_operator;
REVOKE ALL ON FUNCTION public.rpc_platform_owner_eligibility_revoke_v2(UUID,UUID,UUID,TEXT,UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;
GRANT EXECUTE ON FUNCTION public.rpc_platform_owner_eligibility_revoke_v2(UUID,UUID,UUID,TEXT,UUID,TEXT,TEXT) TO pharmacyflow_platform_admission_operator;

REVOKE ALL ON FUNCTION public.rpc_gateway_begin_owner_identity_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_platform_admission_operator, pharmacyflow_owner_gateway_executor;
GRANT EXECUTE ON FUNCTION public.rpc_gateway_begin_owner_identity_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT) TO pharmacyflow_owner_gateway_executor;
REVOKE ALL ON FUNCTION public.rpc_gateway_complete_owner_identity_issue_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT) FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_platform_admission_operator, pharmacyflow_owner_gateway_executor;
GRANT EXECUTE ON FUNCTION public.rpc_gateway_complete_owner_identity_issue_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT) TO pharmacyflow_owner_gateway_executor;
REVOKE ALL ON FUNCTION public.rpc_gateway_complete_owner_identity_recovery_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT) FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_platform_admission_operator, pharmacyflow_owner_gateway_executor;
GRANT EXECUTE ON FUNCTION public.rpc_gateway_complete_owner_identity_recovery_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT) TO pharmacyflow_owner_gateway_executor;
REVOKE ALL ON FUNCTION public.rpc_gateway_recover_owner_identity_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_platform_admission_operator, pharmacyflow_owner_gateway_executor;
GRANT EXECUTE ON FUNCTION public.rpc_gateway_recover_owner_identity_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT) TO pharmacyflow_owner_gateway_executor;

-- Existing 000028/000029 target-row ordering is unchanged. Global claims add operation serialization.
-- Static ordering and sequential models are not PostgreSQL deadlock, concurrency, or effective-ACL proof.
