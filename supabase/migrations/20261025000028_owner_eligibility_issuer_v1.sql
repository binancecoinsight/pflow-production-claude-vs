-- BLK-002-I1 trusted OWNER eligibility issuer v1 (UNEXECUTED).
-- Local authoring only. Gateway identity/grants intentionally remain absent.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pharmacyflow_owner_eligibility_issuer') THEN
        RAISE EXCEPTION 'Precondition failed: pharmacyflow_owner_eligibility_issuer already exists; audit before retrying'
            USING ERRCODE = '55000';
    END IF;
    CREATE ROLE pharmacyflow_owner_eligibility_issuer NOLOGIN NOINHERIT NOBYPASSRLS;
END $$;

GRANT USAGE ON SCHEMA public, auth TO pharmacyflow_owner_eligibility_issuer;
GRANT SELECT (id, email, email_confirmed_at, raw_app_meta_data)
    ON auth.users TO pharmacyflow_owner_eligibility_issuer;

-- Empty by default: no requester is admitted until a separately controlled
-- manual admission action supplies an active evidence row.
CREATE TABLE public.owner_eligibility_admissions (
    normalized_email_digest TEXT PRIMARY KEY CHECK (normalized_email_digest ~ '^[0-9a-f]{64}$'),
    policy_version TEXT NOT NULL CHECK (policy_version = 'closed-manual-v1'),
    evidence_id TEXT NOT NULL UNIQUE CHECK (length(trim(evidence_id)) > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    approved_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    revoked_at TIMESTAMPTZ,
    CHECK ((is_active AND revoked_at IS NULL) OR (NOT is_active AND revoked_at IS NOT NULL))
);

CREATE TABLE public.owner_eligibility_requests (
    contract_version TEXT NOT NULL CHECK (contract_version = 'owner-eligibility-issuer-v1'),
    owner_contract_version TEXT NOT NULL CHECK (owner_contract_version = 'owner-onboarding-v1'),
    request_id UUID PRIMARY KEY,
    provider_operation_id UUID NOT NULL UNIQUE,
    normalized_email_digest TEXT NOT NULL CHECK (normalized_email_digest ~ '^[0-9a-f]{64}$'),
    intended_input_fingerprint TEXT NOT NULL CHECK (intended_input_fingerprint ~ '^[0-9a-f]{64}$'),
    admission_evidence_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN (
        'RESERVED', 'AUTH_CREATE_PENDING', 'EMAIL_CONFIRMATION_PENDING',
        'ACTIVE', 'CONSUMED', 'REVOKED', 'CONFLICTED'
    )),
    subject_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
    replaces_request_id UUID REFERENCES public.owner_eligibility_requests(request_id) ON DELETE RESTRICT,
    canonical_issuer_response JSONB NOT NULL,
    consumed_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    activated_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CHECK ((state = 'CONSUMED') = (consumed_response IS NOT NULL AND consumed_at IS NOT NULL)),
    CHECK ((state = 'ACTIVE' AND activated_at IS NOT NULL) OR state <> 'ACTIVE'),
    CHECK ((state = 'REVOKED' AND revoked_at IS NOT NULL) OR state <> 'REVOKED')
);

CREATE UNIQUE INDEX uq_owner_eligibility_open_email
ON public.owner_eligibility_requests(normalized_email_digest)
WHERE state IN ('RESERVED', 'AUTH_CREATE_PENDING', 'EMAIL_CONFIRMATION_PENDING', 'ACTIVE');

CREATE UNIQUE INDEX uq_owner_eligibility_subject_request
ON public.owner_eligibility_requests(subject_id, request_id)
WHERE subject_id IS NOT NULL;

ALTER TABLE public.owner_eligibility_admissions OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER TABLE public.owner_eligibility_requests OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER TABLE public.owner_eligibility_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_eligibility_admissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.owner_eligibility_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_eligibility_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_eligibility_admissions, public.owner_eligibility_requests
    FROM PUBLIC, anon, authenticated, service_role;

CREATE POLICY rls_owner_eligibility_admissions_private
ON public.owner_eligibility_admissions FOR ALL TO pharmacyflow_owner_eligibility_issuer
USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY rls_owner_eligibility_requests_private
ON public.owner_eligibility_requests FOR ALL TO pharmacyflow_owner_eligibility_issuer
USING (TRUE) WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION public.trg_owner_eligibility_monotonic()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.contract_version IS DISTINCT FROM OLD.contract_version
       OR NEW.owner_contract_version IS DISTINCT FROM OLD.owner_contract_version
       OR NEW.request_id IS DISTINCT FROM OLD.request_id
       OR NEW.provider_operation_id IS DISTINCT FROM OLD.provider_operation_id
       OR NEW.normalized_email_digest IS DISTINCT FROM OLD.normalized_email_digest
       OR NEW.intended_input_fingerprint IS DISTINCT FROM OLD.intended_input_fingerprint
       OR NEW.admission_evidence_id IS DISTINCT FROM OLD.admission_evidence_id
       OR NEW.replaces_request_id IS DISTINCT FROM OLD.replaces_request_id
       OR NEW.canonical_issuer_response IS DISTINCT FROM OLD.canonical_issuer_response
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION USING ERRCODE = 'PI001', MESSAGE = 'Issuer request binding is immutable';
    END IF;
    IF OLD.subject_id IS NOT NULL AND NEW.subject_id IS DISTINCT FROM OLD.subject_id THEN
        RAISE EXCEPTION USING ERRCODE = 'PI002', MESSAGE = 'Issuer subject binding is immutable';
    END IF;
    IF NOT (
        NEW.state = OLD.state
        OR (OLD.state = 'RESERVED' AND NEW.state IN ('AUTH_CREATE_PENDING', 'REVOKED'))
        OR (OLD.state = 'AUTH_CREATE_PENDING' AND NEW.state IN ('EMAIL_CONFIRMATION_PENDING', 'REVOKED', 'CONFLICTED'))
        OR (OLD.state = 'EMAIL_CONFIRMATION_PENDING' AND NEW.state IN ('ACTIVE', 'REVOKED', 'CONFLICTED'))
        OR (OLD.state = 'ACTIVE' AND NEW.state IN ('CONSUMED', 'REVOKED'))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'PI003', MESSAGE = 'Issuer state transition is not monotonic';
    END IF;
    IF OLD.state IN ('CONSUMED', 'REVOKED', 'CONFLICTED') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE = 'PI004', MESSAGE = 'Terminal issuer evidence is immutable';
    END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.trg_owner_eligibility_monotonic() OWNER TO pharmacyflow_owner_eligibility_issuer;
CREATE TRIGGER trg_owner_eligibility_monotonic
BEFORE UPDATE ON public.owner_eligibility_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_owner_eligibility_monotonic();

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

    -- Closed/manual admission is checked before a reservation that could lead to Auth work.
    SELECT evidence_id, policy_version INTO v_admission
    FROM public.owner_eligibility_admissions
    WHERE normalized_email_digest = v_email_digest AND is_active
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'PI010', MESSAGE = 'ISSUANCE_DISABLED: no active manual admission';
    END IF;

    SELECT * INTO v_existing
    FROM public.owner_eligibility_requests
    WHERE request_id = p_request_id
    FOR UPDATE;
    IF FOUND THEN
        IF v_existing.normalized_email_digest IS DISTINCT FROM v_email_digest
           OR v_existing.intended_input_fingerprint IS DISTINCT FROM v_fingerprint
           OR v_existing.owner_contract_version IS DISTINCT FROM 'owner-onboarding-v1' THEN
            RAISE EXCEPTION USING ERRCODE = 'PI011', MESSAGE = 'REQUEST_CONFLICT';
        END IF;
        RETURN v_existing.canonical_issuer_response || jsonb_build_object('state', v_existing.state);
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
        'admission_policy_version', v_admission.policy_version,
        'contract_version', 'owner-eligibility-issuer-v1',
        'intended_input_fingerprint', v_fingerprint,
        'owner_contract_version', 'owner-onboarding-v1',
        'provider_operation_id', v_operation_id,
        'request_id', p_request_id,
        'state', 'RESERVED'
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

CREATE OR REPLACE FUNCTION public.private_mark_owner_auth_pending_v1(
    p_request_id UUID, p_intended_input_fingerprint TEXT, p_provider_operation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_row public.owner_eligibility_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM public.owner_eligibility_requests WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND OR v_row.intended_input_fingerprint IS DISTINCT FROM p_intended_input_fingerprint
       OR v_row.provider_operation_id IS DISTINCT FROM p_provider_operation_id THEN
        RAISE EXCEPTION USING ERRCODE = 'PI014', MESSAGE = 'AUTH_OPERATION_CONFLICT';
    END IF;
    IF v_row.state = 'AUTH_CREATE_PENDING' THEN RETURN; END IF;
    IF v_row.state <> 'RESERVED' THEN RAISE EXCEPTION USING ERRCODE = 'PI003', MESSAGE = 'Invalid Auth-pending transition'; END IF;
    UPDATE public.owner_eligibility_requests SET state = 'AUTH_CREATE_PENDING', updated_at = timezone('utc', now())
    WHERE request_id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.private_correlate_owner_identity_v1(
    p_request_id UUID, p_intended_input_fingerprint TEXT, p_provider_operation_id UUID, p_subject_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_row public.owner_eligibility_requests%ROWTYPE; v_meta JSONB;
BEGIN
    SELECT * INTO v_row FROM public.owner_eligibility_requests WHERE request_id = p_request_id FOR UPDATE;
    SELECT raw_app_meta_data INTO v_meta FROM auth.users WHERE id = p_subject_id;
    IF NOT FOUND OR v_row.intended_input_fingerprint IS DISTINCT FROM p_intended_input_fingerprint
       OR v_row.provider_operation_id IS DISTINCT FROM p_provider_operation_id
       OR v_meta->>'pharmacyflow_identity_class' IS DISTINCT FROM 'OWNER_ONBOARDING_V1'
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
    SELECT email_confirmed_at, raw_app_meta_data INTO v_confirmed, v_meta FROM auth.users WHERE id = p_subject_id;
    IF NOT FOUND OR v_confirmed IS NULL OR v_row.subject_id IS DISTINCT FROM p_subject_id
       OR v_row.intended_input_fingerprint IS DISTINCT FROM p_intended_input_fingerprint
       OR v_row.provider_operation_id IS DISTINCT FROM p_provider_operation_id
       OR v_meta->>'pharmacyflow_identity_class' IS DISTINCT FROM 'OWNER_ONBOARDING_V1'
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

CREATE OR REPLACE FUNCTION public.private_revoke_owner_eligibility_v1(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_state TEXT; v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
    SELECT state INTO v_state FROM public.owner_eligibility_requests WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Eligibility request not found'; END IF;
    IF v_state = 'REVOKED' THEN RETURN; END IF;
    IF v_state IN ('CONSUMED', 'CONFLICTED') THEN RAISE EXCEPTION USING ERRCODE = 'PI013', MESSAGE = 'Terminal eligibility cannot be revoked'; END IF;
    UPDATE public.owner_eligibility_requests SET state = 'REVOKED', revoked_at = v_now, updated_at = v_now
    WHERE request_id = p_request_id;
END;
$$;

ALTER FUNCTION public.private_reserve_owner_eligibility_v1(UUID,TEXT,TEXT,TEXT,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_mark_owner_auth_pending_v1(UUID,TEXT,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_correlate_owner_identity_v1(UUID,TEXT,UUID,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_activate_owner_eligibility_v1(UUID,TEXT,UUID,UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_revoke_owner_eligibility_v1(UUID) OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.private_reserve_owner_eligibility_v1(UUID,TEXT,TEXT,TEXT,UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.private_mark_owner_auth_pending_v1(UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.private_correlate_owner_identity_v1(UUID,TEXT,UUID,UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.private_activate_owner_eligibility_v1(UUID,TEXT,UUID,UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.private_revoke_owner_eligibility_v1(UUID) FROM PUBLIC, anon, authenticated, service_role;

-- The existing onboarding owner receives only subject-scoped ledger access.
GRANT SELECT ON public.owner_eligibility_requests TO pharmacyflow_onboarding_owner;
GRANT UPDATE (state, consumed_response, consumed_at, updated_at)
    ON public.owner_eligibility_requests TO pharmacyflow_onboarding_owner;
GRANT SELECT (email) ON auth.users TO pharmacyflow_onboarding_owner;

CREATE POLICY rls_owner_eligibility_onboarding_select
ON public.owner_eligibility_requests FOR SELECT TO pharmacyflow_onboarding_owner
USING (subject_id = auth.uid());

CREATE POLICY rls_owner_eligibility_onboarding_consume
ON public.owner_eligibility_requests FOR UPDATE TO pharmacyflow_onboarding_owner
USING (subject_id = auth.uid() AND state IN ('ACTIVE', 'CONSUMED'))
WITH CHECK (subject_id = auth.uid() AND state = 'CONSUMED');

-- Forward-only replacement integrates authoritative eligibility consumption with
-- tenant creation. Sealed migrations and M-16 remain unchanged.
CREATE OR REPLACE FUNCTION public.rpc_create_pharmacy_owner_v1(
    p_request_id UUID,
    p_pharmacy_name TEXT,
    p_currency TEXT DEFAULT 'NGN'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_email TEXT;
    v_confirmed TIMESTAMPTZ;
    v_meta JSONB;
    v_name TEXT := trim(p_pharmacy_name);
    v_currency TEXT := upper(trim(p_currency));
    v_fingerprint TEXT;
    v_eligibility public.owner_eligibility_requests%ROWTYPE;
    v_request public.owner_onboarding_requests%ROWTYPE;
    v_now TIMESTAMPTZ := timezone('utc', now());
    v_trial_end TIMESTAMPTZ;
    v_pharmacy_id UUID := gen_random_uuid();
    v_branch_id UUID := gen_random_uuid();
    v_membership_id UUID := gen_random_uuid();
    v_subscription_id UUID := gen_random_uuid();
    v_response JSONB;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'PF001', MESSAGE = 'Authentication required'; END IF;
    IF p_request_id IS NULL OR length(v_name) < 2 OR length(v_name) > 120 OR v_currency !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid owner onboarding request';
    END IF;
    SELECT lower(trim(email)), email_confirmed_at, raw_app_meta_data INTO v_email, v_confirmed, v_meta
    FROM auth.users WHERE id = v_user_id;
    IF NOT FOUND OR v_confirmed IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'PF002', MESSAGE = 'Verified identity required'; END IF;
    IF v_meta->>'pharmacyflow_identity_class' IS DISTINCT FROM 'OWNER_ONBOARDING_V1'
       OR v_meta ? 'pharmacyflow_staff_bootstrap_v1' THEN
        RAISE EXCEPTION USING ERRCODE = 'PF003', MESSAGE = 'Identity is not OWNER eligible';
    END IF;
    v_fingerprint := encode(digest(convert_to(concat_ws(E'\n',
        'PF-OWNER-INTENT-V1', p_request_id::TEXT, v_email, v_name, v_currency
    ), 'UTF8'), 'sha256'), 'hex');

    -- Canonical lock for activation/revocation/replacement/consumption serialization.
    SELECT * INTO v_eligibility FROM public.owner_eligibility_requests
    WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND OR v_eligibility.subject_id IS DISTINCT FROM v_user_id THEN
        RAISE EXCEPTION USING ERRCODE = 'PF004', MESSAGE = 'Authoritative eligibility is missing for subject';
    END IF;
    IF v_eligibility.intended_input_fingerprint IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION USING ERRCODE = 'PF005', MESSAGE = 'REQUEST_CONFLICT';
    END IF;

    SELECT * INTO v_request FROM public.owner_onboarding_requests
    WHERE user_id = v_user_id AND request_id = p_request_id FOR UPDATE;
    IF v_eligibility.state = 'CONSUMED' THEN
        IF NOT FOUND OR v_request.status <> 'COMPLETED'
           OR v_request.request_fingerprint IS DISTINCT FROM v_fingerprint
           OR v_eligibility.consumed_response IS DISTINCT FROM v_request.response_body THEN
            RAISE EXCEPTION USING ERRCODE = 'PF006', MESSAGE = 'Consumed replay evidence is inconsistent';
        END IF;
        RETURN v_request.response_body;
    END IF;
    IF v_eligibility.state <> 'ACTIVE' THEN
        RAISE EXCEPTION USING ERRCODE = 'PF004', MESSAGE = 'Eligibility is not active';
    END IF;
    IF v_meta->'pharmacyflow_owner_eligibility_v1'->>'request_id' IS DISTINCT FROM p_request_id::TEXT
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'provider_operation_id' IS DISTINCT FROM v_eligibility.provider_operation_id::TEXT
       OR v_meta->'pharmacyflow_owner_eligibility_v1'->>'intended_input_fingerprint' IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION USING ERRCODE = 'PF004', MESSAGE = 'Trusted eligibility evidence mismatch';
    END IF;
    IF FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'PF006', MESSAGE = 'Unexpected onboarding request state before consumption';
    END IF;

    INSERT INTO public.owner_onboarding_requests (
        user_id, request_id, contract_version, request_fingerprint, status
    ) VALUES (v_user_id, p_request_id, 'owner-onboarding-v1', v_fingerprint, 'PENDING');

    v_trial_end := v_now + interval '14 days';
    INSERT INTO public.pharmacies (id,name,owner_id,currency,subscription_plan,subscription_expires_at)
    VALUES (v_pharmacy_id,v_name,v_user_id,v_currency,'TRIAL',v_trial_end);
    INSERT INTO public.branches (id,pharmacy_id,name,is_main)
    VALUES (v_branch_id,v_pharmacy_id,'Main Branch',TRUE);
    INSERT INTO public.subscriptions (id,pharmacy_id,plan_code,status,current_period_start,current_period_end)
    VALUES (v_subscription_id,v_pharmacy_id,'TRIAL','TRIAL',v_now,v_trial_end);
    INSERT INTO public.pharmacy_members (id,user_id,pharmacy_id,role,default_branch_id,status)
    VALUES (v_membership_id,v_user_id,v_pharmacy_id,'OWNER',v_branch_id,'ACTIVE');

    v_response := jsonb_build_object(
        'branch_id',v_branch_id,'completed_at',v_now,'contract_version','owner-onboarding-v1',
        'currency',v_currency,'membership_id',v_membership_id,'pharmacy_id',v_pharmacy_id,
        'plan_code','TRIAL','request_id',p_request_id,'request_scope','AUTHENTICATED_USER',
        'role','OWNER','status','ACTIVE','subscription_id',v_subscription_id,'success',TRUE,
        'trial_ends_at',v_trial_end,'trial_started_at',v_now
    );
    UPDATE public.owner_onboarding_requests
    SET status='COMPLETED',response_body=v_response,completed_at=v_now
    WHERE user_id=v_user_id AND request_id=p_request_id;
    UPDATE public.owner_eligibility_requests
    SET state='CONSUMED',consumed_response=v_response,consumed_at=v_now,updated_at=v_now
    WHERE request_id=p_request_id;
    RETURN v_response;
END;
$$;

ALTER FUNCTION public.rpc_create_pharmacy_owner_v1(UUID,TEXT,TEXT) OWNER TO pharmacyflow_onboarding_owner;
REVOKE ALL ON FUNCTION public.rpc_create_pharmacy_owner_v1(UUID,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_pharmacy_owner_v1(UUID,TEXT,TEXT) TO authenticated;
