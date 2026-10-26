-- BLK-002: additive owner onboarding contract v1 (UNEXECUTED).
-- Requires independent security/privilege review and separate execution approval.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pharmacyflow_onboarding_owner') THEN
        RAISE EXCEPTION 'Precondition failed: pharmacyflow_onboarding_owner already exists; audit it before retrying'
            USING ERRCODE = '55000';
    END IF;
    CREATE ROLE pharmacyflow_onboarding_owner NOLOGIN NOINHERIT NOBYPASSRLS;
END $$;

ALTER ROLE pharmacyflow_onboarding_owner NOLOGIN NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO pharmacyflow_onboarding_owner;
GRANT SELECT (id, email_confirmed_at, raw_app_meta_data) ON auth.users TO pharmacyflow_onboarding_owner;
GRANT SELECT (id, full_name, phone_number),
      INSERT (id, full_name, phone_number),
      UPDATE (full_name, phone_number, updated_at)
    ON public.user_profiles TO pharmacyflow_onboarding_owner;
GRANT SELECT (id, owner_id),
      INSERT (id, name, owner_id, currency, subscription_plan, subscription_expires_at)
    ON public.pharmacies TO pharmacyflow_onboarding_owner;
GRANT INSERT (id, pharmacy_id, name, is_main)
    ON public.branches TO pharmacyflow_onboarding_owner;
GRANT INSERT (id, pharmacy_id, plan_code, status, current_period_start, current_period_end)
    ON public.subscriptions TO pharmacyflow_onboarding_owner;
GRANT INSERT (id, user_id, pharmacy_id, role, default_branch_id, status)
    ON public.pharmacy_members TO pharmacyflow_onboarding_owner;

CREATE TABLE public.owner_onboarding_requests (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    request_id UUID NOT NULL,
    contract_version TEXT NOT NULL CHECK (contract_version = 'owner-onboarding-v1'),
    request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
    status VARCHAR(16) NOT NULL CHECK (status IN ('PENDING', 'COMPLETED')),
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, request_id),
    CONSTRAINT chk_owner_onboarding_completed_response CHECK (
        (status = 'PENDING' AND response_body IS NULL AND completed_at IS NULL)
        OR (status = 'COMPLETED' AND response_body IS NOT NULL AND completed_at IS NOT NULL)
    )
);

ALTER TABLE public.owner_onboarding_requests OWNER TO pharmacyflow_onboarding_owner;
ALTER TABLE public.owner_onboarding_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_onboarding_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_onboarding_requests FROM PUBLIC, anon, authenticated;

CREATE POLICY rls_owner_onboarding_requests_boundary
ON public.owner_onboarding_requests
FOR ALL TO pharmacyflow_onboarding_owner
USING (user_id = auth.uid() AND contract_version = 'owner-onboarding-v1')
WITH CHECK (user_id = auth.uid() AND contract_version = 'owner-onboarding-v1');

-- Narrow role-specific policies permit only rows owned by the authenticated
-- eligible identity. They do not grant authenticated/anon any direct write path.
CREATE POLICY rls_pharmacies_owner_onboarding_insert
ON public.pharmacies FOR INSERT TO pharmacyflow_onboarding_owner
WITH CHECK (owner_id = auth.uid());

CREATE POLICY rls_pharmacies_owner_onboarding_select
ON public.pharmacies FOR SELECT TO pharmacyflow_onboarding_owner
USING (owner_id = auth.uid());

CREATE POLICY rls_branches_owner_onboarding_insert
ON public.branches FOR INSERT TO pharmacyflow_onboarding_owner
WITH CHECK (EXISTS (
    SELECT 1 FROM public.pharmacies p
    WHERE p.id = pharmacy_id AND p.owner_id = auth.uid()
));

CREATE POLICY rls_subscriptions_owner_onboarding_insert
ON public.subscriptions FOR INSERT TO pharmacyflow_onboarding_owner
WITH CHECK (EXISTS (
    SELECT 1 FROM public.pharmacies p
    WHERE p.id = pharmacy_id AND p.owner_id = auth.uid()
));

CREATE POLICY rls_pharmacy_members_owner_onboarding_insert
ON public.pharmacy_members FOR INSERT TO pharmacyflow_onboarding_owner
WITH CHECK (
    user_id = auth.uid()
    AND role = 'OWNER'
    AND status = 'ACTIVE'
    AND EXISTS (
        SELECT 1 FROM public.pharmacies p
        WHERE p.id = pharmacy_id AND p.owner_id = auth.uid()
    )
);

CREATE OR REPLACE FUNCTION public.trg_owner_onboarding_request_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.request_id IS DISTINCT FROM OLD.request_id
       OR NEW.contract_version IS DISTINCT FROM OLD.contract_version
       OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Owner onboarding request identity, version, scope and fingerprint are immutable'
            USING ERRCODE = '22023';
    END IF;
    IF OLD.status = 'COMPLETED' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Completed owner onboarding requests are immutable'
            USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.trg_owner_onboarding_request_immutable() OWNER TO pharmacyflow_onboarding_owner;
DROP TRIGGER IF EXISTS trg_owner_onboarding_request_immutable ON public.owner_onboarding_requests;
CREATE TRIGGER trg_owner_onboarding_request_immutable
BEFORE UPDATE ON public.owner_onboarding_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_owner_onboarding_request_immutable();

-- Replacement for the sealed bootstrap body: Auth creation creates a profile only.
-- Client-writable raw_user_meta_data never creates a tenant, subscription or role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, full_name, phone_number)
    VALUES (
        NEW.id,
        COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email),
        NULLIF(trim(NEW.raw_user_meta_data->>'phone'), '')
    )
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        phone_number = COALESCE(EXCLUDED.phone_number, public.user_profiles.phone_number),
        updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO pharmacyflow_onboarding_owner;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

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
    v_contract_version CONSTANT TEXT := 'owner-onboarding-v1';
    v_user_id UUID := auth.uid();
    v_email_confirmed_at TIMESTAMPTZ;
    v_app_metadata JSONB;
    v_eligibility JSONB;
    v_identity_class TEXT;
    v_name TEXT := trim(p_pharmacy_name);
    v_currency TEXT := upper(trim(p_currency));
    v_fingerprint TEXT;
    v_request public.owner_onboarding_requests%ROWTYPE;
    v_now TIMESTAMPTZ := timezone('utc', now());
    v_trial_end TIMESTAMPTZ;
    v_pharmacy_id UUID := gen_random_uuid();
    v_branch_id UUID := gen_random_uuid();
    v_membership_id UUID := gen_random_uuid();
    v_subscription_id UUID := gen_random_uuid();
    v_response JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'PF001', MESSAGE = 'Authentication required';
    END IF;
    IF p_request_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'request_id is required';
    END IF;
    IF v_name IS NULL OR length(v_name) < 2 OR length(v_name) > 120 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'pharmacy_name must contain 2 to 120 characters';
    END IF;
    IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'currency must be a three-letter uppercase code';
    END IF;

    SELECT email_confirmed_at, raw_app_meta_data
    INTO v_email_confirmed_at, v_app_metadata
    FROM auth.users
    WHERE id = v_user_id;
    IF NOT FOUND OR v_email_confirmed_at IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'PF002', MESSAGE = 'Verified identity required for owner onboarding';
    END IF;

    v_identity_class := v_app_metadata->>'pharmacyflow_identity_class';
    v_eligibility := v_app_metadata->'pharmacyflow_owner_eligibility_v1';
    IF v_identity_class = 'STAFF_INVITATION_BOOTSTRAP_V1'
       OR v_app_metadata ? 'pharmacyflow_staff_bootstrap_v1' THEN
        RAISE EXCEPTION USING ERRCODE = 'PF003', MESSAGE = 'Staff-bootstrap identities are not eligible for OWNER onboarding';
    END IF;
    IF v_identity_class IS DISTINCT FROM 'OWNER_ONBOARDING_V1'
       OR v_eligibility IS NULL
       OR v_eligibility->>'contract_version' IS DISTINCT FROM v_contract_version
       OR v_eligibility->>'request_id' IS DISTINCT FROM p_request_id::TEXT
       OR v_eligibility->>'subject_id' IS DISTINCT FROM v_user_id::TEXT
       OR NULLIF(v_eligibility->>'authorized_at', '') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'PF004', MESSAGE = 'Trusted OWNER eligibility is missing or does not match this request';
    END IF;

    v_fingerprint := encode(digest(convert_to(jsonb_build_object(
        'contract_version', v_contract_version,
        'currency', v_currency,
        'pharmacy_name', v_name,
        'request_scope', 'AUTHENTICATED_USER',
        'user_id', v_user_id
    )::text, 'UTF8'), 'sha256'), 'hex');

    INSERT INTO public.owner_onboarding_requests (
        user_id, request_id, contract_version, request_fingerprint, status
    ) VALUES (
        v_user_id, p_request_id, v_contract_version, v_fingerprint, 'PENDING'
    )
    ON CONFLICT (user_id, request_id) DO NOTHING;

    SELECT * INTO v_request
    FROM public.owner_onboarding_requests
    WHERE user_id = v_user_id AND request_id = p_request_id
    FOR UPDATE;

    IF v_request.request_fingerprint IS DISTINCT FROM v_fingerprint
       OR v_request.contract_version IS DISTINCT FROM v_contract_version THEN
        RAISE EXCEPTION USING
            ERRCODE = 'PF005',
            MESSAGE = 'request_id is already bound to a different immutable request';
    END IF;
    IF v_request.status = 'COMPLETED' THEN
        RETURN v_request.response_body;
    END IF;
    IF v_request.status <> 'PENDING' THEN
        RAISE EXCEPTION USING ERRCODE = 'PF006', MESSAGE = 'Owner onboarding request is in an unsafe state';
    END IF;

    v_trial_end := v_now + interval '14 days';
    INSERT INTO public.pharmacies (
        id, name, owner_id, currency, subscription_plan, subscription_expires_at
    ) VALUES (
        v_pharmacy_id, v_name, v_user_id, v_currency, 'TRIAL', v_trial_end
    );
    INSERT INTO public.branches (id, pharmacy_id, name, is_main)
    VALUES (v_branch_id, v_pharmacy_id, 'Main Branch', TRUE);
    INSERT INTO public.subscriptions (
        id, pharmacy_id, plan_code, status, current_period_start, current_period_end
    ) VALUES (
        v_subscription_id, v_pharmacy_id, 'TRIAL', 'TRIAL', v_now, v_trial_end
    );
    INSERT INTO public.pharmacy_members (
        id, user_id, pharmacy_id, role, default_branch_id, status
    ) VALUES (
        v_membership_id, v_user_id, v_pharmacy_id, 'OWNER', v_branch_id, 'ACTIVE'
    );

    v_response := jsonb_build_object(
        'branch_id', v_branch_id,
        'completed_at', v_now,
        'contract_version', v_contract_version,
        'currency', v_currency,
        'membership_id', v_membership_id,
        'pharmacy_id', v_pharmacy_id,
        'plan_code', 'TRIAL',
        'request_id', p_request_id,
        'request_scope', 'AUTHENTICATED_USER',
        'role', 'OWNER',
        'status', 'ACTIVE',
        'subscription_id', v_subscription_id,
        'success', TRUE,
        'trial_ends_at', v_trial_end,
        'trial_started_at', v_now
    );

    UPDATE public.owner_onboarding_requests
    SET status = 'COMPLETED', response_body = v_response, completed_at = v_now
    WHERE user_id = v_user_id AND request_id = p_request_id;
    RETURN v_response;
END;
$$;

ALTER FUNCTION public.rpc_create_pharmacy_owner_v1(UUID, TEXT, TEXT)
    OWNER TO pharmacyflow_onboarding_owner;
REVOKE ALL ON FUNCTION public.rpc_create_pharmacy_owner_v1(UUID, TEXT, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_pharmacy_owner_v1(UUID, TEXT, TEXT)
    TO authenticated;
