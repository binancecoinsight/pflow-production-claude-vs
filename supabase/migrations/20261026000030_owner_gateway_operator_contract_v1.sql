-- BLK-002-I3 gateway/operator contract v1 (UNEXECUTED).
-- Local authoring only. No identity membership, credential, runtime route, or activation is included.
-- Preserves migrations 000027-000029. Execution requires separate authorization and acceptance.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pharmacyflow_owner_gateway_executor')
       OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pharmacyflow_platform_admission_operator') THEN
        RAISE EXCEPTION 'I3 role precondition failed; audit existing roles before execution'
            USING ERRCODE = '55000';
    END IF;
    CREATE ROLE pharmacyflow_owner_gateway_executor NOLOGIN NOINHERIT NOBYPASSRLS;
    CREATE ROLE pharmacyflow_platform_admission_operator NOLOGIN NOINHERIT NOBYPASSRLS;
END $$;

ALTER ROLE pharmacyflow_owner_gateway_executor NOLOGIN NOINHERIT NOBYPASSRLS;
ALTER ROLE pharmacyflow_platform_admission_operator NOLOGIN NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;

-- I3 cannot silently guess a pharmacy context or operator decision for pre-I3 rows.
-- An environment with rows must use a separately reviewed reconciliation migration.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.owner_eligibility_admissions LIMIT 1)
       OR EXISTS (SELECT 1 FROM public.owner_eligibility_requests LIMIT 1) THEN
        RAISE EXCEPTION 'I3 compatibility precondition failed: existing admissions/eligibility require reviewed context reconciliation'
            USING ERRCODE = '55000';
    END IF;
END $$;

CREATE TABLE public.owner_security_operations (
    contract_version TEXT NOT NULL CHECK (contract_version = 'owner-gateway-operator-v1'),
    operation_id UUID PRIMARY KEY,
    action TEXT NOT NULL CHECK (action IN (
        'ADMISSION_APPROVE', 'ADMISSION_REPLACE', 'ADMISSION_REVOKE',
        'ELIGIBILITY_RESERVE', 'IDENTITY_ISSUE', 'ELIGIBILITY_REVOKE'
    )),
    principal_class TEXT NOT NULL CHECK (principal_class IN ('GATEWAY', 'PLATFORM_OPERATOR')),
    principal_id TEXT NOT NULL CHECK (length(trim(principal_id)) > 0),
    credential_version INTEGER NOT NULL CHECK (credential_version > 0),
    applicant_key TEXT NOT NULL CHECK (length(trim(applicant_key)) > 0),
    pharmacy_context_id UUID NOT NULL,
    command_fingerprint TEXT NOT NULL CHECK (command_fingerprint ~ '^[0-9a-f]{64}$'),
    result_identity TEXT NOT NULL CHECK (length(trim(result_identity)) > 0),
    canonical_result JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.owner_admission_decisions (
    decision_id UUID PRIMARY KEY,
    operation_id UUID NOT NULL UNIQUE REFERENCES public.owner_security_operations(operation_id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('APPROVE', 'REPLACE', 'REVOKE')),
    operator_id TEXT NOT NULL CHECK (length(trim(operator_id)) > 0),
    applicant_email_digest TEXT NOT NULL CHECK (applicant_email_digest ~ '^[0-9a-f]{64}$'),
    pharmacy_context_id UUID NOT NULL,
    predecessor_decision_id UUID REFERENCES public.owner_admission_decisions(decision_id) ON DELETE RESTRICT,
    reason_code TEXT NOT NULL CHECK (length(trim(reason_code)) > 0),
    resulting_state TEXT NOT NULL CHECK (resulting_state IN ('ACTIVE', 'REVOKED')),
    decided_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CHECK ((action = 'APPROVE' AND predecessor_decision_id IS NULL)
        OR (action IN ('REPLACE', 'REVOKE') AND predecessor_decision_id IS NOT NULL))
);

CREATE TABLE public.owner_eligibility_revocation_decisions (
    revocation_id UUID PRIMARY KEY,
    operation_id UUID NOT NULL UNIQUE REFERENCES public.owner_security_operations(operation_id) ON DELETE RESTRICT,
    eligibility_request_id UUID NOT NULL REFERENCES public.owner_eligibility_requests(request_id) ON DELETE RESTRICT,
    operator_id TEXT NOT NULL CHECK (length(trim(operator_id)) > 0),
    applicant_key TEXT NOT NULL CHECK (length(trim(applicant_key)) > 0),
    pharmacy_context_id UUID NOT NULL,
    reason_code TEXT NOT NULL CHECK (length(trim(reason_code)) > 0),
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.owner_eligibility_admissions
    ADD COLUMN pharmacy_context_id UUID NOT NULL,
    ADD COLUMN current_decision_id UUID NOT NULL REFERENCES public.owner_admission_decisions(decision_id) ON DELETE RESTRICT;

ALTER TABLE public.owner_eligibility_requests
    ADD COLUMN pharmacy_context_id UUID NOT NULL,
    ADD COLUMN admission_decision_id UUID NOT NULL REFERENCES public.owner_admission_decisions(decision_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX uq_owner_admission_context
ON public.owner_eligibility_admissions(normalized_email_digest, pharmacy_context_id);

CREATE UNIQUE INDEX uq_owner_eligibility_open_context
ON public.owner_eligibility_requests(normalized_email_digest, pharmacy_context_id)
WHERE state IN ('RESERVED', 'AUTH_CREATE_PENDING', 'EMAIL_CONFIRMATION_PENDING', 'ACTIVE');

ALTER TABLE public.owner_security_operations OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER TABLE public.owner_admission_decisions OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER TABLE public.owner_eligibility_revocation_decisions OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER TABLE public.owner_security_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_security_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.owner_admission_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_admission_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.owner_eligibility_revocation_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_eligibility_revocation_decisions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.owner_security_operations, public.owner_admission_decisions,
    public.owner_eligibility_revocation_decisions
FROM PUBLIC, anon, authenticated, service_role,
    pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;

CREATE POLICY rls_owner_security_operations_private
ON public.owner_security_operations FOR ALL TO pharmacyflow_owner_eligibility_issuer
USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY rls_owner_admission_decisions_private
ON public.owner_admission_decisions FOR ALL TO pharmacyflow_owner_eligibility_issuer
USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY rls_owner_eligibility_revocations_private
ON public.owner_eligibility_revocation_decisions FOR ALL TO pharmacyflow_owner_eligibility_issuer
USING (TRUE) WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION public.trg_owner_i3_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = 'PI030', MESSAGE = 'I3 security decision/audit evidence is append-only';
END;
$$;

ALTER FUNCTION public.trg_owner_i3_append_only() OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.trg_owner_i3_append_only() FROM PUBLIC, anon, authenticated, service_role,
    pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;
CREATE TRIGGER trg_owner_security_operations_append_only
BEFORE UPDATE OR DELETE ON public.owner_security_operations
FOR EACH ROW EXECUTE FUNCTION public.trg_owner_i3_append_only();
CREATE TRIGGER trg_owner_admission_decisions_append_only
BEFORE UPDATE OR DELETE ON public.owner_admission_decisions
FOR EACH ROW EXECUTE FUNCTION public.trg_owner_i3_append_only();
CREATE TRIGGER trg_owner_eligibility_revocations_append_only
BEFORE UPDATE OR DELETE ON public.owner_eligibility_revocation_decisions
FOR EACH ROW EXECUTE FUNCTION public.trg_owner_i3_append_only();

-- Extend the sealed I1 immutability contract to cover the new I3 bindings.
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
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.pharmacy_context_id IS DISTINCT FROM OLD.pharmacy_context_id
       OR NEW.admission_decision_id IS DISTINCT FROM OLD.admission_decision_id THEN
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

CREATE OR REPLACE FUNCTION public.private_i3_require_gateway_v1(p_capability TEXT)
RETURNS TABLE(principal_id TEXT, credential_version INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_claims JSONB := auth.jwt();
BEGIN
    IF p_capability NOT IN ('ELIGIBILITY_RESERVE', 'IDENTITY_ISSUE', 'IDENTITY_RECOVER')
       OR v_claims->>'role' IS DISTINCT FROM 'pharmacyflow_owner_gateway_executor'
       OR v_claims->>'aud' IS DISTINCT FROM 'pharmacyflow-owner-i3'
       OR v_claims->>'pharmacyflow_principal_class' IS DISTINCT FROM 'GATEWAY'
       OR NULLIF(trim(v_claims->>'sub'), '') IS NULL
       OR COALESCE(v_claims->'pharmacyflow_capabilities', '[]'::JSONB) ? p_capability IS NOT TRUE
       OR COALESCE(v_claims->>'pharmacyflow_credential_version', '') !~ '^[1-9][0-9]*$' THEN
        RAISE EXCEPTION USING ERRCODE = 'PI031', MESSAGE = 'GATEWAY_AUTHORITY_DENIED';
    END IF;
    RETURN QUERY SELECT v_claims->>'sub', (v_claims->>'pharmacyflow_credential_version')::INTEGER;
END;
$$;

CREATE OR REPLACE FUNCTION public.private_i3_require_operator_v1(p_permission TEXT)
RETURNS TABLE(principal_id TEXT, credential_version INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_claims JSONB := auth.jwt();
BEGIN
    IF p_permission NOT IN ('ADMISSION_APPROVE', 'ADMISSION_REPLACE', 'ADMISSION_REVOKE', 'ELIGIBILITY_REVOKE')
       OR v_claims->>'role' IS DISTINCT FROM 'pharmacyflow_platform_admission_operator'
       OR v_claims->>'aud' IS DISTINCT FROM 'pharmacyflow-owner-i3'
       OR v_claims->>'pharmacyflow_principal_class' IS DISTINCT FROM 'PLATFORM_OPERATOR'
       OR NULLIF(trim(v_claims->>'sub'), '') IS NULL
       OR COALESCE(v_claims->'pharmacyflow_permissions', '[]'::JSONB) ? p_permission IS NOT TRUE
       OR COALESCE(v_claims->>'pharmacyflow_credential_version', '') !~ '^[1-9][0-9]*$' THEN
        RAISE EXCEPTION USING ERRCODE = 'PI032', MESSAGE = 'OPERATOR_AUTHORITY_DENIED';
    END IF;
    RETURN QUERY SELECT v_claims->>'sub', (v_claims->>'pharmacyflow_credential_version')::INTEGER;
END;
$$;

ALTER FUNCTION public.private_i3_require_gateway_v1(TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
ALTER FUNCTION public.private_i3_require_operator_v1(TEXT) OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.private_i3_require_gateway_v1(TEXT) FROM PUBLIC, anon, authenticated, service_role,
    pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;
REVOKE ALL ON FUNCTION public.private_i3_require_operator_v1(TEXT) FROM PUBLIC, anon, authenticated, service_role,
    pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;

CREATE OR REPLACE FUNCTION public.rpc_platform_owner_admission_decide_v1(
    p_operation_id UUID,
    p_action TEXT,
    p_decision_id UUID,
    p_email TEXT,
    p_pharmacy_context_id UUID,
    p_reason_code TEXT,
    p_predecessor_decision_id UUID,
    p_command_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_action TEXT := upper(trim(p_action));
    v_email TEXT := lower(trim(p_email));
    v_email_digest TEXT;
    v_permission TEXT;
    v_actor RECORD;
    v_existing public.owner_security_operations%ROWTYPE;
    v_admission public.owner_eligibility_admissions%ROWTYPE;
    v_result JSONB;
    v_state TEXT;
    v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
    v_permission := CASE v_action
        WHEN 'APPROVE' THEN 'ADMISSION_APPROVE'
        WHEN 'REPLACE' THEN 'ADMISSION_REPLACE'
        WHEN 'REVOKE' THEN 'ADMISSION_REVOKE'
        ELSE NULL END;
    IF v_permission IS NULL OR p_operation_id IS NULL OR p_decision_id IS NULL OR p_pharmacy_context_id IS NULL
       OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' OR length(trim(p_reason_code)) = 0
       OR p_command_fingerprint !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid admission decision command';
    END IF;
    SELECT * INTO v_actor FROM public.private_i3_require_operator_v1(v_permission);
    v_email_digest := encode(digest(convert_to(v_email, 'UTF8'), 'sha256'), 'hex');

    -- I3 canonical order: operation -> applicant/email -> admission.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::TEXT, 2));
    SELECT * INTO v_existing FROM public.owner_security_operations WHERE operation_id = p_operation_id FOR UPDATE;
    IF FOUND THEN
        IF v_existing.action IS DISTINCT FROM ('ADMISSION_' || v_action)
           OR v_existing.principal_id IS DISTINCT FROM v_actor.principal_id
           OR v_existing.applicant_key IS DISTINCT FROM v_email_digest
           OR v_existing.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
           OR v_existing.command_fingerprint IS DISTINCT FROM p_command_fingerprint THEN
            RAISE EXCEPTION USING ERRCODE = 'PI033', MESSAGE = 'OPERATION_CONFLICT';
        END IF;
        RETURN v_existing.canonical_result;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_email_digest, 1));
    SELECT * INTO v_admission FROM public.owner_eligibility_admissions
    WHERE normalized_email_digest = v_email_digest FOR UPDATE;

    IF v_action = 'APPROVE' THEN
        IF FOUND AND v_admission.is_active THEN
            RAISE EXCEPTION USING ERRCODE = 'PI034', MESSAGE = 'ACTIVE_ADMISSION_EXISTS';
        END IF;
        IF p_predecessor_decision_id IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Approval cannot supply predecessor';
        END IF;
        v_state := 'ACTIVE';
    ELSE
        IF NOT FOUND OR NOT v_admission.is_active
           OR v_admission.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
           OR v_admission.current_decision_id IS DISTINCT FROM p_predecessor_decision_id THEN
            RAISE EXCEPTION USING ERRCODE = 'PI035', MESSAGE = 'ADMISSION_PREDECESSOR_CONFLICT';
        END IF;
        v_state := CASE WHEN v_action = 'REVOKE' THEN 'REVOKED' ELSE 'ACTIVE' END;
    END IF;

    v_result := jsonb_build_object(
        'action', v_action, 'applicant_key', v_email_digest, 'contract_version', 'owner-gateway-operator-v1',
        'decision_id', p_decision_id, 'pharmacy_context_id', p_pharmacy_context_id,
        'predecessor_decision_id', p_predecessor_decision_id, 'state', v_state
    );
    INSERT INTO public.owner_security_operations (
        contract_version, operation_id, action, principal_class, principal_id, credential_version,
        applicant_key, pharmacy_context_id, command_fingerprint, result_identity, canonical_result, occurred_at
    ) VALUES (
        'owner-gateway-operator-v1', p_operation_id, 'ADMISSION_' || v_action, 'PLATFORM_OPERATOR',
        v_actor.principal_id, v_actor.credential_version, v_email_digest, p_pharmacy_context_id,
        p_command_fingerprint, p_decision_id::TEXT, v_result, v_now
    );
    INSERT INTO public.owner_admission_decisions (
        decision_id, operation_id, action, operator_id, applicant_email_digest, pharmacy_context_id,
        predecessor_decision_id, reason_code, resulting_state, decided_at
    ) VALUES (
        p_decision_id, p_operation_id, v_action, v_actor.principal_id, v_email_digest,
        p_pharmacy_context_id, p_predecessor_decision_id, trim(p_reason_code), v_state, v_now
    );
    INSERT INTO public.owner_eligibility_admissions (
        normalized_email_digest, policy_version, evidence_id, is_active, approved_at, revoked_at,
        pharmacy_context_id, current_decision_id
    ) VALUES (
        v_email_digest, 'closed-manual-v1', p_decision_id::TEXT, v_state = 'ACTIVE', v_now,
        CASE WHEN v_state = 'REVOKED' THEN v_now ELSE NULL END, p_pharmacy_context_id, p_decision_id
    ) ON CONFLICT (normalized_email_digest) DO UPDATE
    SET evidence_id = EXCLUDED.evidence_id,
        is_active = EXCLUDED.is_active,
        approved_at = CASE WHEN EXCLUDED.is_active THEN v_now ELSE owner_eligibility_admissions.approved_at END,
        revoked_at = EXCLUDED.revoked_at,
        pharmacy_context_id = EXCLUDED.pharmacy_context_id,
        current_decision_id = EXCLUDED.current_decision_id;
    RETURN v_result;
END;
$$;

ALTER FUNCTION public.rpc_platform_owner_admission_decide_v1(UUID,TEXT,UUID,TEXT,UUID,TEXT,UUID,TEXT)
    OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.rpc_platform_owner_admission_decide_v1(UUID,TEXT,UUID,TEXT,UUID,TEXT,UUID,TEXT)
    FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor;
GRANT EXECUTE ON FUNCTION public.rpc_platform_owner_admission_decide_v1(UUID,TEXT,UUID,TEXT,UUID,TEXT,UUID,TEXT)
    TO pharmacyflow_platform_admission_operator;

CREATE OR REPLACE FUNCTION public.rpc_gateway_reserve_owner_eligibility_v1(
    p_operation_id UUID,
    p_request_id UUID,
    p_email TEXT,
    p_pharmacy_context_id UUID,
    p_pharmacy_name TEXT,
    p_currency TEXT,
    p_admission_decision_id UUID,
    p_replaces_request_id UUID,
    p_command_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor RECORD;
    v_existing_operation public.owner_security_operations%ROWTYPE;
    v_existing public.owner_eligibility_requests%ROWTYPE;
    v_admission public.owner_eligibility_admissions%ROWTYPE;
    v_email TEXT := lower(trim(p_email));
    v_name TEXT := trim(p_pharmacy_name);
    v_currency TEXT := upper(trim(p_currency));
    v_email_digest TEXT;
    v_fingerprint TEXT;
    v_open_request_id UUID;
    v_provider_operation_id UUID := gen_random_uuid();
    v_result JSONB;
    v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
    IF p_operation_id IS NULL OR p_request_id IS NULL OR p_pharmacy_context_id IS NULL OR p_admission_decision_id IS NULL
       OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' OR length(v_name) < 2 OR length(v_name) > 120
       OR v_currency !~ '^[A-Z]{3}$' OR p_command_fingerprint !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid gateway reservation command';
    END IF;
    SELECT * INTO v_actor FROM public.private_i3_require_gateway_v1('ELIGIBILITY_RESERVE');
    v_email_digest := encode(digest(convert_to(v_email, 'UTF8'), 'sha256'), 'hex');
    v_fingerprint := encode(digest(convert_to(concat_ws(E'\n',
        'PF-OWNER-INTENT-V1', p_request_id::TEXT, v_email, v_name, v_currency
    ), 'UTF8'), 'sha256'), 'hex');

    -- Compatible extension of 000029: operation -> request -> email -> admission -> eligibility.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::TEXT, 2));
    SELECT * INTO v_existing_operation FROM public.owner_security_operations
    WHERE operation_id = p_operation_id FOR UPDATE;
    IF FOUND THEN
        IF v_existing_operation.action IS DISTINCT FROM 'ELIGIBILITY_RESERVE'
           OR v_existing_operation.principal_id IS DISTINCT FROM v_actor.principal_id
           OR v_existing_operation.applicant_key IS DISTINCT FROM v_email_digest
           OR v_existing_operation.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
           OR v_existing_operation.command_fingerprint IS DISTINCT FROM p_command_fingerprint THEN
            RAISE EXCEPTION USING ERRCODE = 'PI033', MESSAGE = 'OPERATION_CONFLICT';
        END IF;
        RETURN v_existing_operation.canonical_result;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::TEXT, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended(v_email_digest, 1));

    SELECT * INTO v_existing FROM public.owner_eligibility_requests
    WHERE request_id = p_request_id FOR UPDATE;
    IF FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'PI036', MESSAGE = 'REQUEST_ALREADY_BOUND_TO_DIFFERENT_OPERATION';
    END IF;
    SELECT * INTO v_admission FROM public.owner_eligibility_admissions
    WHERE normalized_email_digest = v_email_digest FOR SHARE;
    IF NOT FOUND OR NOT v_admission.is_active
       OR v_admission.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
       OR v_admission.current_decision_id IS DISTINCT FROM p_admission_decision_id THEN
        RAISE EXCEPTION USING ERRCODE = 'PI010', MESSAGE = 'ISSUANCE_DISABLED: no exact active manual admission';
    END IF;
    SELECT request_id INTO v_open_request_id FROM public.owner_eligibility_requests
    WHERE normalized_email_digest = v_email_digest AND pharmacy_context_id = p_pharmacy_context_id
      AND state IN ('RESERVED', 'AUTH_CREATE_PENDING', 'EMAIL_CONFIRMATION_PENDING', 'ACTIVE')
      AND (p_replaces_request_id IS NULL OR request_id <> p_replaces_request_id)
    ORDER BY request_id LIMIT 1 FOR UPDATE;
    IF FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PI017', MESSAGE = 'OPEN_CONTEXT_CONFLICT'; END IF;
    IF p_replaces_request_id IS NOT NULL THEN
        SELECT * INTO v_existing FROM public.owner_eligibility_requests
        WHERE request_id = p_replaces_request_id FOR UPDATE;
        IF NOT FOUND OR v_existing.normalized_email_digest IS DISTINCT FROM v_email_digest
           OR v_existing.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id THEN
            RAISE EXCEPTION USING ERRCODE = 'PI012', MESSAGE = 'REPLACEMENT_CONFLICT';
        END IF;
        IF v_existing.state = 'CONSUMED' THEN
            RAISE EXCEPTION USING ERRCODE = 'PI013', MESSAGE = 'Consumed eligibility cannot be replaced';
        END IF;
        IF v_existing.state NOT IN ('REVOKED', 'CONFLICTED') THEN
            UPDATE public.owner_eligibility_requests SET state = 'REVOKED', revoked_at = v_now, updated_at = v_now
            WHERE request_id = p_replaces_request_id;
        END IF;
    END IF;

    v_result := jsonb_build_object(
        'admission_decision_id', p_admission_decision_id, 'admission_evidence_id', v_admission.evidence_id,
        'applicant_key', v_email_digest, 'contract_version', 'owner-eligibility-issuer-v1',
        'intended_input_fingerprint', v_fingerprint, 'owner_contract_version', 'owner-onboarding-v1',
        'pharmacy_context_id', p_pharmacy_context_id, 'provider_operation_id', v_provider_operation_id,
        'request_id', p_request_id, 'state', 'RESERVED', 'subject_id', NULL
    );
    INSERT INTO public.owner_eligibility_requests (
        contract_version, owner_contract_version, request_id, provider_operation_id,
        normalized_email_digest, intended_input_fingerprint, admission_evidence_id,
        state, replaces_request_id, canonical_issuer_response, created_at, updated_at,
        pharmacy_context_id, admission_decision_id
    ) VALUES (
        'owner-eligibility-issuer-v1', 'owner-onboarding-v1', p_request_id, v_provider_operation_id,
        v_email_digest, v_fingerprint, v_admission.evidence_id, 'RESERVED', p_replaces_request_id,
        v_result, v_now, v_now, p_pharmacy_context_id, p_admission_decision_id
    );
    INSERT INTO public.owner_security_operations (
        contract_version, operation_id, action, principal_class, principal_id, credential_version,
        applicant_key, pharmacy_context_id, command_fingerprint, result_identity, canonical_result, occurred_at
    ) VALUES (
        'owner-gateway-operator-v1', p_operation_id, 'ELIGIBILITY_RESERVE', 'GATEWAY',
        v_actor.principal_id, v_actor.credential_version, v_email_digest, p_pharmacy_context_id,
        p_command_fingerprint, p_request_id::TEXT, v_result, v_now
    );
    RETURN v_result;
END;
$$;

ALTER FUNCTION public.rpc_gateway_reserve_owner_eligibility_v1(UUID,UUID,TEXT,UUID,TEXT,TEXT,UUID,UUID,TEXT)
    OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.rpc_gateway_reserve_owner_eligibility_v1(UUID,UUID,TEXT,UUID,TEXT,TEXT,UUID,UUID,TEXT)
    FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_platform_admission_operator;
GRANT EXECUTE ON FUNCTION public.rpc_gateway_reserve_owner_eligibility_v1(UUID,UUID,TEXT,UUID,TEXT,TEXT,UUID,UUID,TEXT)
    TO pharmacyflow_owner_gateway_executor;

CREATE OR REPLACE FUNCTION public.rpc_gateway_correlate_owner_identity_v1(
    p_operation_id UUID,
    p_request_id UUID,
    p_applicant_key TEXT,
    p_pharmacy_context_id UUID,
    p_intended_input_fingerprint TEXT,
    p_provider_operation_id UUID,
    p_subject_id UUID,
    p_command_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor RECORD;
    v_existing_operation public.owner_security_operations%ROWTYPE;
    v_eligibility public.owner_eligibility_requests%ROWTYPE;
    v_result JSONB;
    v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
    IF p_operation_id IS NULL OR p_request_id IS NULL OR p_subject_id IS NULL OR p_pharmacy_context_id IS NULL
       OR p_applicant_key !~ '^[0-9a-f]{64}$' OR p_intended_input_fingerprint !~ '^[0-9a-f]{64}$'
       OR p_command_fingerprint !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid identity correlation command';
    END IF;
    SELECT * INTO v_actor FROM public.private_i3_require_gateway_v1('IDENTITY_ISSUE');
    PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::TEXT, 2));
    SELECT * INTO v_existing_operation FROM public.owner_security_operations
    WHERE operation_id = p_operation_id FOR UPDATE;
    IF FOUND THEN
        IF v_existing_operation.action IS DISTINCT FROM 'IDENTITY_ISSUE'
           OR v_existing_operation.principal_id IS DISTINCT FROM v_actor.principal_id
           OR v_existing_operation.applicant_key IS DISTINCT FROM p_applicant_key
           OR v_existing_operation.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
           OR v_existing_operation.command_fingerprint IS DISTINCT FROM p_command_fingerprint THEN
            RAISE EXCEPTION USING ERRCODE = 'PI033', MESSAGE = 'OPERATION_CONFLICT';
        END IF;
        RETURN v_existing_operation.canonical_result;
    END IF;
    SELECT * INTO v_eligibility FROM public.owner_eligibility_requests
    WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND OR v_eligibility.normalized_email_digest IS DISTINCT FROM p_applicant_key
       OR v_eligibility.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
       OR v_eligibility.intended_input_fingerprint IS DISTINCT FROM p_intended_input_fingerprint
       OR v_eligibility.provider_operation_id IS DISTINCT FROM p_provider_operation_id THEN
        RAISE EXCEPTION USING ERRCODE = 'PI014', MESSAGE = 'IDENTITY_OPERATION_CONFLICT';
    END IF;
    PERFORM public.private_mark_owner_auth_pending_v1(p_request_id, p_intended_input_fingerprint, p_provider_operation_id);
    PERFORM public.private_correlate_owner_identity_v1(p_request_id, p_intended_input_fingerprint, p_provider_operation_id, p_subject_id);
    v_result := v_eligibility.canonical_issuer_response || jsonb_build_object(
        'state', 'EMAIL_CONFIRMATION_PENDING', 'subject_id', p_subject_id
    );
    INSERT INTO public.owner_security_operations (
        contract_version, operation_id, action, principal_class, principal_id, credential_version,
        applicant_key, pharmacy_context_id, command_fingerprint, result_identity, canonical_result, occurred_at
    ) VALUES (
        'owner-gateway-operator-v1', p_operation_id, 'IDENTITY_ISSUE', 'GATEWAY',
        v_actor.principal_id, v_actor.credential_version, p_applicant_key, p_pharmacy_context_id,
        p_command_fingerprint, p_subject_id::TEXT, v_result, v_now
    );
    RETURN v_result;
END;
$$;

ALTER FUNCTION public.rpc_gateway_correlate_owner_identity_v1(UUID,UUID,TEXT,UUID,TEXT,UUID,UUID,TEXT)
    OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.rpc_gateway_correlate_owner_identity_v1(UUID,UUID,TEXT,UUID,TEXT,UUID,UUID,TEXT)
    FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_platform_admission_operator;
GRANT EXECUTE ON FUNCTION public.rpc_gateway_correlate_owner_identity_v1(UUID,UUID,TEXT,UUID,TEXT,UUID,UUID,TEXT)
    TO pharmacyflow_owner_gateway_executor;

CREATE OR REPLACE FUNCTION public.rpc_gateway_recover_owner_operation_v1(
    p_operation_id UUID,
    p_action TEXT,
    p_applicant_key TEXT,
    p_pharmacy_context_id UUID,
    p_command_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_actor RECORD; v_existing public.owner_security_operations%ROWTYPE; v_capability TEXT;
BEGIN
    v_capability := CASE p_action
        WHEN 'ELIGIBILITY_RESERVE' THEN 'ELIGIBILITY_RESERVE'
        WHEN 'IDENTITY_ISSUE' THEN 'IDENTITY_RECOVER'
        ELSE NULL END;
    IF v_capability IS NULL OR p_operation_id IS NULL OR p_pharmacy_context_id IS NULL
       OR length(trim(p_applicant_key)) = 0 OR p_command_fingerprint !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid gateway recovery command';
    END IF;
    SELECT * INTO v_actor FROM public.private_i3_require_gateway_v1(v_capability);
    SELECT * INTO v_existing FROM public.owner_security_operations WHERE operation_id = p_operation_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'AUTHORITATIVE_RESULT_NOT_FOUND'; END IF;
    IF v_existing.action IS DISTINCT FROM p_action
       OR v_existing.principal_id IS DISTINCT FROM v_actor.principal_id
       OR v_existing.applicant_key IS DISTINCT FROM p_applicant_key
       OR v_existing.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
       OR v_existing.command_fingerprint IS DISTINCT FROM p_command_fingerprint THEN
        RAISE EXCEPTION USING ERRCODE = 'PI033', MESSAGE = 'OPERATION_CONFLICT';
    END IF;
    RETURN v_existing.canonical_result;
END;
$$;

ALTER FUNCTION public.rpc_gateway_recover_owner_operation_v1(UUID,TEXT,TEXT,UUID,TEXT)
    OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.rpc_gateway_recover_owner_operation_v1(UUID,TEXT,TEXT,UUID,TEXT)
    FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_platform_admission_operator;
GRANT EXECUTE ON FUNCTION public.rpc_gateway_recover_owner_operation_v1(UUID,TEXT,TEXT,UUID,TEXT)
    TO pharmacyflow_owner_gateway_executor;

CREATE OR REPLACE FUNCTION public.rpc_platform_owner_eligibility_revoke_v1(
    p_operation_id UUID,
    p_revocation_id UUID,
    p_request_id UUID,
    p_applicant_key TEXT,
    p_pharmacy_context_id UUID,
    p_reason_code TEXT,
    p_command_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor RECORD;
    v_existing_operation public.owner_security_operations%ROWTYPE;
    v_eligibility public.owner_eligibility_requests%ROWTYPE;
    v_result JSONB;
    v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
    IF p_operation_id IS NULL OR p_revocation_id IS NULL OR p_request_id IS NULL OR p_pharmacy_context_id IS NULL
       OR length(trim(p_applicant_key)) = 0 OR length(trim(p_reason_code)) = 0
       OR p_command_fingerprint !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid eligibility revocation command';
    END IF;
    SELECT * INTO v_actor FROM public.private_i3_require_operator_v1('ELIGIBILITY_REVOKE');
    PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::TEXT, 2));
    SELECT * INTO v_existing_operation FROM public.owner_security_operations
    WHERE operation_id = p_operation_id FOR UPDATE;
    IF FOUND THEN
        IF v_existing_operation.action IS DISTINCT FROM 'ELIGIBILITY_REVOKE'
           OR v_existing_operation.principal_id IS DISTINCT FROM v_actor.principal_id
           OR v_existing_operation.applicant_key IS DISTINCT FROM p_applicant_key
           OR v_existing_operation.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id
           OR v_existing_operation.command_fingerprint IS DISTINCT FROM p_command_fingerprint THEN
            RAISE EXCEPTION USING ERRCODE = 'PI033', MESSAGE = 'OPERATION_CONFLICT';
        END IF;
        RETURN v_existing_operation.canonical_result;
    END IF;
    -- Same target-row lock used by 000028 consumption/revocation; commit order decides the winner.
    SELECT * INTO v_eligibility FROM public.owner_eligibility_requests
    WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND OR COALESCE(v_eligibility.subject_id::TEXT, v_eligibility.normalized_email_digest) IS DISTINCT FROM p_applicant_key
       OR v_eligibility.pharmacy_context_id IS DISTINCT FROM p_pharmacy_context_id THEN
        RAISE EXCEPTION USING ERRCODE = 'PI014', MESSAGE = 'ELIGIBILITY_BINDING_CONFLICT';
    END IF;
    IF v_eligibility.state = 'CONSUMED' THEN
        RAISE EXCEPTION USING ERRCODE = 'PI013', MESSAGE = 'CONSUMED_IMMUTABLE';
    END IF;
    IF v_eligibility.state IN ('REVOKED', 'CONFLICTED') THEN
        RAISE EXCEPTION USING ERRCODE = 'PI037', MESSAGE = 'ELIGIBILITY_NOT_REVOCABLE';
    END IF;
    v_result := jsonb_build_object(
        'applicant_key', p_applicant_key, 'contract_version', 'owner-gateway-operator-v1',
        'eligibility_request_id', p_request_id, 'pharmacy_context_id', p_pharmacy_context_id,
        'revocation_id', p_revocation_id, 'state', 'REVOKED'
    );
    INSERT INTO public.owner_security_operations (
        contract_version, operation_id, action, principal_class, principal_id, credential_version,
        applicant_key, pharmacy_context_id, command_fingerprint, result_identity, canonical_result, occurred_at
    ) VALUES (
        'owner-gateway-operator-v1', p_operation_id, 'ELIGIBILITY_REVOKE', 'PLATFORM_OPERATOR',
        v_actor.principal_id, v_actor.credential_version, p_applicant_key, p_pharmacy_context_id,
        p_command_fingerprint, p_revocation_id::TEXT, v_result, v_now
    );
    INSERT INTO public.owner_eligibility_revocation_decisions (
        revocation_id, operation_id, eligibility_request_id, operator_id,
        applicant_key, pharmacy_context_id, reason_code, revoked_at
    ) VALUES (
        p_revocation_id, p_operation_id, p_request_id, v_actor.principal_id,
        p_applicant_key, p_pharmacy_context_id, trim(p_reason_code), v_now
    );
    UPDATE public.owner_eligibility_requests
    SET state = 'REVOKED', revoked_at = v_now, updated_at = v_now
    WHERE request_id = p_request_id;
    RETURN v_result;
END;
$$;

ALTER FUNCTION public.rpc_platform_owner_eligibility_revoke_v1(UUID,UUID,UUID,TEXT,UUID,TEXT,TEXT)
    OWNER TO pharmacyflow_owner_eligibility_issuer;
REVOKE ALL ON FUNCTION public.rpc_platform_owner_eligibility_revoke_v1(UUID,UUID,UUID,TEXT,UUID,TEXT,TEXT)
    FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor;
GRANT EXECUTE ON FUNCTION public.rpc_platform_owner_eligibility_revoke_v1(UUID,UUID,UUID,TEXT,UUID,TEXT,TEXT)
    TO pharmacyflow_platform_admission_operator;

-- No membership grant maps any login/JWT to either executor role in this migration.
-- No gateway may call admission/revocation functions; no operator may reserve/correlate/recover gateway operations.
