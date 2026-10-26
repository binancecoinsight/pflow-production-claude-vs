-- BLK-002-I1 forward-only recovery/state correction (UNEXECUTED).
-- Preserves 000028. No gateway identity or caller EXECUTE grant is introduced.

CREATE OR REPLACE FUNCTION public.private_reserve_owner_eligibility_v1(
    p_request_id UUID,
    p_email TEXT,
    p_pharmacy_name TEXT,
    p_currency TEXT DEFAULT 'NGN',
    p_replaces_request_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_email TEXT := lower(trim(p_email));
    v_name TEXT := trim(p_pharmacy_name);
    v_currency TEXT := upper(trim(p_currency));
    v_email_digest TEXT;
    v_fingerprint TEXT;
    v_admission RECORD;
    v_existing public.owner_eligibility_requests%ROWTYPE;
    v_open_request_id UUID;
    v_operation_id UUID := gen_random_uuid();
    v_response JSONB;
    v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
    IF p_request_id IS NULL OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$'
       OR length(v_name) < 2 OR length(v_name) > 120 OR v_currency !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid owner eligibility request';
    END IF;
    v_email_digest := encode(digest(convert_to(v_email, 'UTF8'), 'sha256'), 'hex');
    v_fingerprint := encode(digest(convert_to(concat_ws(E'\n',
        'PF-OWNER-INTENT-V1', p_request_id::TEXT, v_email, v_name, v_currency
    ), 'UTF8'), 'sha256'), 'hex');

    -- Deterministic lock order makes competing first reservations observable before insert.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::TEXT, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended(v_email_digest, 1));

    SELECT * INTO v_existing
    FROM public.owner_eligibility_requests
    WHERE request_id = p_request_id
    FOR UPDATE;
    IF FOUND THEN
        IF v_existing.normalized_email_digest IS DISTINCT FROM v_email_digest
           OR v_existing.intended_input_fingerprint IS DISTINCT FROM v_fingerprint
           OR v_existing.contract_version IS DISTINCT FROM 'owner-eligibility-issuer-v1'
           OR v_existing.owner_contract_version IS DISTINCT FROM 'owner-onboarding-v1'
           OR v_existing.replaces_request_id IS DISTINCT FROM p_replaces_request_id THEN
            RAISE EXCEPTION USING ERRCODE = 'PI011', MESSAGE = 'REQUEST_CONFLICT';
        END IF;
        RETURN v_existing.canonical_issuer_response || jsonb_build_object(
            'admission_evidence_id', v_existing.admission_evidence_id,
            'consumed_response', v_existing.consumed_response,
            'state', v_existing.state,
            'subject_id', v_existing.subject_id
        );
    END IF;

    -- Admission is authoritative for a first reservation. Existing exact reservations retain
    -- their immutable evidence and require explicit eligibility revocation to become unusable.
    SELECT evidence_id, policy_version INTO v_admission
    FROM public.owner_eligibility_admissions
    WHERE normalized_email_digest = v_email_digest AND is_active
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'PI010', MESSAGE = 'ISSUANCE_DISABLED: no active manual admission';
    END IF;

    SELECT request_id INTO v_open_request_id
    FROM public.owner_eligibility_requests
    WHERE normalized_email_digest = v_email_digest
      AND state IN ('RESERVED', 'AUTH_CREATE_PENDING', 'EMAIL_CONFIRMATION_PENDING', 'ACTIVE')
      AND (p_replaces_request_id IS NULL OR request_id <> p_replaces_request_id)
    LIMIT 1 FOR UPDATE;
    IF FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'PI017', MESSAGE = 'OPEN_EMAIL_CONFLICT';
    END IF;

    IF p_replaces_request_id IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.owner_eligibility_requests
        WHERE request_id = p_replaces_request_id
        FOR UPDATE;
        IF NOT FOUND OR v_existing.normalized_email_digest IS DISTINCT FROM v_email_digest THEN
            RAISE EXCEPTION USING ERRCODE = 'PI012', MESSAGE = 'REPLACEMENT_CONFLICT';
        END IF;
        IF v_existing.state = 'CONSUMED' THEN
            RAISE EXCEPTION USING ERRCODE = 'PI013', MESSAGE = 'Consumed eligibility cannot be replaced';
        END IF;
        IF v_existing.state NOT IN ('REVOKED', 'CONFLICTED') THEN
            UPDATE public.owner_eligibility_requests
            SET state = 'REVOKED', revoked_at = v_now, updated_at = v_now
            WHERE request_id = p_replaces_request_id;
        END IF;
    END IF;

    v_response := jsonb_build_object(
        'admission_evidence_id', v_admission.evidence_id,
        'admission_policy_version', v_admission.policy_version,
        'contract_version', 'owner-eligibility-issuer-v1',
        'consumed_response', NULL,
        'intended_input_fingerprint', v_fingerprint,
        'owner_contract_version', 'owner-onboarding-v1',
        'provider_operation_id', v_operation_id,
        'request_id', p_request_id,
        'state', 'RESERVED',
        'subject_id', NULL
    );
    INSERT INTO public.owner_eligibility_requests (
        contract_version, owner_contract_version, request_id, provider_operation_id,
        normalized_email_digest, intended_input_fingerprint, admission_evidence_id,
        state, replaces_request_id, canonical_issuer_response, created_at, updated_at
    ) VALUES (
        'owner-eligibility-issuer-v1', 'owner-onboarding-v1', p_request_id, v_operation_id,
        v_email_digest, v_fingerprint, v_admission.evidence_id,
        'RESERVED', p_replaces_request_id, v_response, v_now, v_now
    );
    RETURN v_response;
END;
$$;

ALTER FUNCTION public.private_reserve_owner_eligibility_v1(UUID,TEXT,TEXT,TEXT,UUID)
    OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.private_reserve_owner_eligibility_v1(UUID,TEXT,TEXT,TEXT,UUID)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.private_get_owner_eligibility_v1(
    p_request_id UUID,
    p_intended_input_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_row public.owner_eligibility_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM public.owner_eligibility_requests
    WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND OR v_row.intended_input_fingerprint IS DISTINCT FROM p_intended_input_fingerprint THEN
        RAISE EXCEPTION USING ERRCODE = 'PI011', MESSAGE = 'REQUEST_CONFLICT';
    END IF;
    RETURN v_row.canonical_issuer_response || jsonb_build_object(
        'admission_evidence_id', v_row.admission_evidence_id,
        'consumed_response', v_row.consumed_response,
        'state', v_row.state,
        'subject_id', v_row.subject_id
    );
END;
$$;

ALTER FUNCTION public.private_get_owner_eligibility_v1(UUID,TEXT)
    OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.private_get_owner_eligibility_v1(UUID,TEXT)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.private_correlate_owner_identity_v1(
    p_request_id UUID, p_intended_input_fingerprint TEXT, p_provider_operation_id UUID, p_subject_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_row public.owner_eligibility_requests%ROWTYPE; v_meta JSONB;
BEGIN
    SELECT * INTO v_row FROM public.owner_eligibility_requests WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PI014', MESSAGE = 'SUBJECT_OPERATION_CONFLICT'; END IF;
    SELECT raw_app_meta_data INTO v_meta FROM auth.users WHERE id = p_subject_id;
    IF NOT FOUND OR v_row.intended_input_fingerprint IS DISTINCT FROM p_intended_input_fingerprint
       OR v_row.provider_operation_id IS DISTINCT FROM p_provider_operation_id
       OR v_meta->>'pharmacyflow_identity_class' IS DISTINCT FROM 'OWNER_ONBOARDING_V1'
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'issuer_contract_version' IS DISTINCT FROM 'owner-eligibility-issuer-v1'
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'owner_contract_version' IS DISTINCT FROM 'owner-onboarding-v1'
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'request_id' IS DISTINCT FROM p_request_id::TEXT
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'provider_operation_id' IS DISTINCT FROM p_provider_operation_id::TEXT
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'intended_input_fingerprint' IS DISTINCT FROM p_intended_input_fingerprint THEN
        RAISE EXCEPTION USING ERRCODE = 'PI015', MESSAGE = 'TRUSTED_MARKER_CONFLICT';
    END IF;
    IF v_row.state = 'EMAIL_CONFIRMATION_PENDING' AND v_row.subject_id = p_subject_id THEN RETURN; END IF;
    IF v_row.state <> 'AUTH_CREATE_PENDING' OR (v_row.subject_id IS NOT NULL AND v_row.subject_id <> p_subject_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'PI014', MESSAGE = 'SUBJECT_OPERATION_CONFLICT';
    END IF;
    UPDATE public.owner_eligibility_requests
    SET subject_id = p_subject_id, state = 'EMAIL_CONFIRMATION_PENDING', updated_at = timezone('utc', now())
    WHERE request_id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.private_activate_owner_eligibility_v1(
    p_request_id UUID, p_intended_input_fingerprint TEXT, p_provider_operation_id UUID, p_subject_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_row public.owner_eligibility_requests%ROWTYPE; v_confirmed TIMESTAMPTZ; v_meta JSONB; v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
    SELECT * INTO v_row FROM public.owner_eligibility_requests WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PI016', MESSAGE = 'CONFIRMATION_OR_MARKER_CONFLICT'; END IF;
    SELECT email_confirmed_at, raw_app_meta_data INTO v_confirmed, v_meta FROM auth.users WHERE id = p_subject_id;
    IF NOT FOUND OR v_confirmed IS NULL OR v_row.subject_id IS DISTINCT FROM p_subject_id
       OR v_row.intended_input_fingerprint IS DISTINCT FROM p_intended_input_fingerprint
       OR v_row.provider_operation_id IS DISTINCT FROM p_provider_operation_id
       OR v_meta->>'pharmacyflow_identity_class' IS DISTINCT FROM 'OWNER_ONBOARDING_V1'
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'issuer_contract_version' IS DISTINCT FROM 'owner-eligibility-issuer-v1'
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'owner_contract_version' IS DISTINCT FROM 'owner-onboarding-v1'
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'request_id' IS DISTINCT FROM p_request_id::TEXT
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'provider_operation_id' IS DISTINCT FROM p_provider_operation_id::TEXT
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'intended_input_fingerprint' IS DISTINCT FROM p_intended_input_fingerprint THEN
        RAISE EXCEPTION USING ERRCODE = 'PI016', MESSAGE = 'CONFIRMATION_OR_MARKER_CONFLICT';
    END IF;
    IF v_row.state = 'ACTIVE' THEN RETURN; END IF;
    IF v_row.state <> 'EMAIL_CONFIRMATION_PENDING' THEN RAISE EXCEPTION USING ERRCODE = 'PI003', MESSAGE = 'Invalid activation transition'; END IF;
    UPDATE public.owner_eligibility_requests SET state = 'ACTIVE', activated_at = v_now, updated_at = v_now
    WHERE request_id = p_request_id;
END;
$$;

ALTER FUNCTION public.private_correlate_owner_identity_v1(UUID,TEXT,UUID,UUID)
    OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_activate_owner_eligibility_v1(UUID,TEXT,UUID,UUID)
    OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.private_correlate_owner_identity_v1(UUID,TEXT,UUID,UUID)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.private_activate_owner_eligibility_v1(UUID,TEXT,UUID,UUID)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.private_recover_confirmed_owner_eligibility_v1(
    p_request_id UUID,
    p_intended_input_fingerprint TEXT,
    p_provider_operation_id UUID,
    p_subject_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row public.owner_eligibility_requests%ROWTYPE;
    v_email TEXT;
    v_confirmed TIMESTAMPTZ;
    v_meta JSONB;
    v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_subject_id THEN
        RAISE EXCEPTION USING ERRCODE = 'PI018', MESSAGE = 'AUTHENTICATED_SUBJECT_REQUIRED';
    END IF;
    SELECT * INTO v_row FROM public.owner_eligibility_requests WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND OR v_row.intended_input_fingerprint IS DISTINCT FROM p_intended_input_fingerprint
       OR v_row.provider_operation_id IS DISTINCT FROM p_provider_operation_id THEN
        RAISE EXCEPTION USING ERRCODE = 'PI014', MESSAGE = 'AUTH_OPERATION_CONFLICT';
    END IF;
    IF v_row.state IN ('RESERVED', 'REVOKED', 'CONFLICTED') THEN
        RAISE EXCEPTION USING ERRCODE = 'PI019', MESSAGE = 'ELIGIBILITY_NOT_RECOVERABLE';
    END IF;
    IF v_row.subject_id IS NOT NULL AND v_row.subject_id IS DISTINCT FROM p_subject_id THEN
        RAISE EXCEPTION USING ERRCODE = 'PI014', MESSAGE = 'SUBJECT_OPERATION_CONFLICT';
    END IF;
    SELECT lower(trim(email)), email_confirmed_at, raw_app_meta_data
    INTO v_email, v_confirmed, v_meta FROM auth.users WHERE id = p_subject_id;
    IF NOT FOUND OR v_confirmed IS NULL
       OR encode(digest(convert_to(v_email, 'UTF8'), 'sha256'), 'hex') IS DISTINCT FROM v_row.normalized_email_digest
       OR v_meta->>'pharmacyflow_identity_class' IS DISTINCT FROM 'OWNER_ONBOARDING_V1'
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'issuer_contract_version' IS DISTINCT FROM 'owner-eligibility-issuer-v1'
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'owner_contract_version' IS DISTINCT FROM 'owner-onboarding-v1'
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'request_id' IS DISTINCT FROM p_request_id::TEXT
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'provider_operation_id' IS DISTINCT FROM p_provider_operation_id::TEXT
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'intended_input_fingerprint' IS DISTINCT FROM p_intended_input_fingerprint THEN
        RAISE EXCEPTION USING ERRCODE = 'PI016', MESSAGE = 'CONFIRMATION_OR_MARKER_CONFLICT';
    END IF;

    IF v_row.state = 'AUTH_CREATE_PENDING' THEN
        UPDATE public.owner_eligibility_requests
        SET subject_id = p_subject_id, state = 'EMAIL_CONFIRMATION_PENDING', updated_at = v_now
        WHERE request_id = p_request_id;
        v_row.state := 'EMAIL_CONFIRMATION_PENDING';
        v_row.subject_id := p_subject_id;
    END IF;
    IF v_row.state = 'EMAIL_CONFIRMATION_PENDING' THEN
        UPDATE public.owner_eligibility_requests
        SET state = 'ACTIVE', activated_at = v_now, updated_at = v_now
        WHERE request_id = p_request_id;
        v_row.state := 'ACTIVE';
    END IF;
    RETURN v_row.canonical_issuer_response || jsonb_build_object(
        'admission_evidence_id', v_row.admission_evidence_id,
        'consumed_response', v_row.consumed_response,
        'state', v_row.state,
        'subject_id', p_subject_id
    );
END;
$$;

ALTER FUNCTION public.private_recover_confirmed_owner_eligibility_v1(UUID,TEXT,UUID,UUID)
    OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.private_recover_confirmed_owner_eligibility_v1(UUID,TEXT,UUID,UUID)
    FROM PUBLIC, anon, authenticated, service_role;

-- Consumption remains callable only through the existing authenticated OWNER RPC.
-- This forward policy adds the version checks that 000028's function body did not contain.
DROP POLICY rls_owner_eligibility_onboarding_consume ON public.owner_eligibility_requests;
CREATE POLICY rls_owner_eligibility_onboarding_consume
ON public.owner_eligibility_requests FOR UPDATE TO pharmacyflow_onboarding_owner
USING (subject_id = auth.uid() AND state IN ('ACTIVE', 'CONSUMED'))
WITH CHECK (
    subject_id = auth.uid() AND state = 'CONSUMED'
    AND contract_version = 'owner-eligibility-issuer-v1'
    AND owner_contract_version = 'owner-onboarding-v1'
    AND EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id = auth.uid()
          AND u.raw_app_meta_data->>'pharmacyflow_identity_class' = 'OWNER_ONBOARDING_V1'
          AND u.raw_app_meta_data->'pharmacyflow_owner_eligibility_v1'->>'issuer_contract_version' = owner_eligibility_requests.contract_version
          AND u.raw_app_meta_data->'pharmacyflow_owner_eligibility_v1'->>'owner_contract_version' = owner_eligibility_requests.owner_contract_version
          AND u.raw_app_meta_data->'pharmacyflow_owner_eligibility_v1'->>'request_id' = owner_eligibility_requests.request_id::TEXT
          AND u.raw_app_meta_data->'pharmacyflow_owner_eligibility_v1'->>'provider_operation_id' = owner_eligibility_requests.provider_operation_id::TEXT
          AND u.raw_app_meta_data->'pharmacyflow_owner_eligibility_v1'->>'intended_input_fingerprint' = owner_eligibility_requests.intended_input_fingerprint
    )
);
