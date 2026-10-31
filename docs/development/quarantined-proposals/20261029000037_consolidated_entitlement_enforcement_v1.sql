-- ============================================================================
-- PharmacyFlow Database Migration: 20261029000037_consolidated_entitlement_enforcement_v1.sql
-- Description: Consolidated Server Entitlement Enforcement, Replay Hardening and Operational RPC Wireup
-- Mode: UNEXECUTED DRAFT (Awaiting Owner & Independent GPT-6 Review)
-- Author: Gemini 3.8 — Antigravity
-- Milestone: PF-MVP-09R / BLK-003 Server Wiring Acceptance Hardening
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PRECONDITIONS & TAMPER-RESISTANCE CHECKS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Verify presence of billing foundation and entitlement anchor ledgers
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'subscriptions'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_PRECONDITION_FAILED: public.subscriptions table does not exist.' USING ERRCODE = '55000';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'pharmacy_entitlement_anchors'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_PRECONDITION_FAILED: public.pharmacy_entitlement_anchors table does not exist.' USING ERRCODE = '55000';
    END IF;

    -- Verify presence of authoritative entitlement functions from Migration 000035
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.routines
        WHERE routine_schema = 'public' AND routine_name = 'rpc_get_effective_entitlement_v1'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_PRECONDITION_FAILED: public.rpc_get_effective_entitlement_v1 does not exist.' USING ERRCODE = '55000';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.routines
        WHERE routine_schema = 'public' AND routine_name = 'assert_pharmacy_mutation_entitled_v1'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_PRECONDITION_FAILED: public.assert_pharmacy_mutation_entitled_v1 does not exist.' USING ERRCODE = '55000';
    END IF;
END $$;

-- Enforce FORCE ROW LEVEL SECURITY across all subscription and anchor tables
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_entitlement_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_entitlement_anchors FORCE ROW LEVEL SECURITY;

-- Enforce FORCE ROW LEVEL SECURITY on entitlement_administrative_decisions_v1 if present
DO 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'entitlement_administrative_decisions_v1') THEN
        EXECUTE 'ALTER TABLE public.entitlement_administrative_decisions_v1 ENABLE ROW LEVEL SECURITY;';
        EXECUTE 'ALTER TABLE public.entitlement_administrative_decisions_v1 FORCE ROW LEVEL SECURITY;';
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.entitlement_administrative_decisions_v1 FROM authenticated, anon, public;';
    END IF;
END ;

-- Revoke all direct mutations on billing tables from public/anon/authenticated client roles
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated, anon, public;
REVOKE INSERT, UPDATE, DELETE ON public.subscription_plans FROM authenticated, anon, public;
REVOKE INSERT, UPDATE, DELETE ON public.pharmacy_entitlement_anchors FROM authenticated, anon, public;

-- ----------------------------------------------------------------------------
-- 1B. RE-DEFINED AUTHORITATIVE RESOLUTION & ASSERTION FUNCTIONS
-- Hardened for trusted caller identity (service_role + authenticated),
-- administrative suspension ordering, and scoped replay verification.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_get_effective_entitlement_v1(p_pharmacy_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $
DECLARE
    v_now TIMESTAMPTZ;
    v_sub RECORD;
    v_plan RECORD;
    v_state TEXT;
    v_mutations_allowed BOOLEAN;
    v_reason TEXT;
    v_grace_end TIMESTAMPTZ;
    v_features JSONB;
    v_latest_decision RECORD;
    v_latest_anchor RECORD;
    v_claim_sub TEXT;
BEGIN
    -- Authorization: Caller must be an active member of the pharmacy, platform admin,
    -- or trusted service_role gateway operating on behalf of a verified registered pharmacy.
    IF (
        auth.role() = 'service_role'
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
        OR current_user = 'service_role'
    ) THEN
        -- Service-role gateway: target pharmacy must exist and have active membership
        IF NOT EXISTS (SELECT 1 FROM public.pharmacies WHERE id = p_pharmacy_id) THEN
            RAISE EXCEPTION 'PHARMACY_NOT_FOUND: Target pharmacy % does not exist.', p_pharmacy_id
                USING ERRCODE = '02000';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.pharmacy_members 
            WHERE pharmacy_id = p_pharmacy_id AND status = 'ACTIVE'
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN_PHARMACY: Target pharmacy % has no active operators or members.', p_pharmacy_id
                USING ERRCODE = '42501';
        END IF;

        -- If request.jwt.claim.sub is passed, verify operator membership
        v_claim_sub := current_setting('request.jwt.claim.sub', true);
        IF v_claim_sub IS NOT NULL AND v_claim_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.pharmacy_members
                WHERE user_id = v_claim_sub::UUID AND pharmacy_id = p_pharmacy_id AND status = 'ACTIVE'
            ) THEN
                RAISE EXCEPTION 'FORBIDDEN_OPERATOR: Operator claim is not an active member of pharmacy %', p_pharmacy_id
                    USING ERRCODE = '42501';
            END IF;
        END IF;
    ELSIF auth.uid() IS NOT NULL THEN
        IF NOT (public.is_pharmacy_member(p_pharmacy_id) OR public.is_platform_admin('ADMIN')) THEN
            RAISE EXCEPTION 'Unauthorized: Caller is not an authorized member of pharmacy %', p_pharmacy_id
                USING ERRCODE = '42501';
        END IF;
    ELSE
        RAISE EXCEPTION 'AUTH_REQUIRED: Unauthenticated caller.' USING ERRCODE = '28000';
    END IF;

    -- Strict UTC authoritative timestamp derived from database transaction clock
    v_now := timezone('utc', now());

    -- Fetch current subscription record
    SELECT s.id, s.pharmacy_id, s.plan_code, s.status, s.current_period_start, s.current_period_end, s.cancelled_at
    INTO v_sub
    FROM public.subscriptions s
    WHERE s.pharmacy_id = p_pharmacy_id;

    -- Case 1: Missing subscription evidence fails closed to UNKNOWN
    IF NOT FOUND OR v_sub.id IS NULL THEN
        RETURN jsonb_build_object(
            'pharmacy_id', p_pharmacy_id,
            'state', 'UNKNOWN',
            'plan_code', NULL,
            'features', '{}'::jsonb,
            'current_period_start', NULL,
            'current_period_end', NULL,
            'grace_period_end', NULL,
            'mutations_allowed', FALSE,
            'historical_reads_allowed', TRUE,
            'server_time', v_now,
            'reason', 'No authoritative subscription record found for pharmacy'
        );
    END IF;

    -- Case 2: Incomplete or invalid period evidence fails closed to UNKNOWN
    IF v_sub.current_period_end IS NULL OR v_sub.current_period_start IS NULL THEN
        RETURN jsonb_build_object(
            'pharmacy_id', p_pharmacy_id,
            'state', 'UNKNOWN',
            'plan_code', v_sub.plan_code,
            'features', '{}'::jsonb,
            'current_period_start', v_sub.current_period_start,
            'current_period_end', v_sub.current_period_end,
            'grace_period_end', NULL,
            'mutations_allowed', FALSE,
            'historical_reads_allowed', TRUE,
            'server_time', v_now,
            'reason', 'Subscription timing evidence is incomplete or invalid'
        );
    END IF;

    -- Fetch plan features
    SELECT sp.features INTO v_features
    FROM public.subscription_plans sp
    WHERE sp.code = v_sub.plan_code;
    IF v_features IS NULL THEN
        v_features := '{}'::jsonb;
    END IF;

    -- 1. Check for administrative decisions in entitlement_administrative_decisions_v1 (if present)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'entitlement_administrative_decisions_v1'
    ) THEN
        SELECT d.decision_kind, d.effective_at, d.decision_sequence, d.id
        INTO v_latest_decision
        FROM public.entitlement_administrative_decisions_v1 d
        WHERE d.pharmacy_id = p_pharmacy_id AND d.effective_at <= v_now
        ORDER BY d.effective_at DESC, d.decision_sequence DESC, d.id DESC
        LIMIT 1;

        IF FOUND THEN
            IF v_latest_decision.decision_kind IN ('SUSPEND', 'DENY_MUTATIONS') THEN
                RETURN jsonb_build_object(
                    'pharmacy_id', p_pharmacy_id,
                    'state', 'SUSPENDED',
                    'plan_code', v_sub.plan_code,
                    'features', v_features,
                    'current_period_start', v_sub.current_period_start,
                    'current_period_end', v_sub.current_period_end,
                    'grace_period_end', v_sub.current_period_end + INTERVAL '7 days',
                    'mutations_allowed', FALSE,
                    'historical_reads_allowed', TRUE,
                    'server_time', v_now,
                    'reason', 'Administrative suspension is active. New mutations are blocked.'
                );
            END IF;
            -- When decision_kind is 'REINSTATE' or 'ALLOW_MUTATIONS', administrative suspension
            -- is explicitly lifted; skip checking older suspension anchors and proceed to lifecycle.
        END IF;
    END IF;

    -- 2. Check for administrative suspension in pharmacy_entitlement_anchors (if not explicitly reinstated above)
    IF NOT (FOUND AND v_latest_decision.decision_kind IN ('REINSTATE', 'ALLOW_MUTATIONS')) THEN
        SELECT a.status, a.mutations_allowed INTO v_latest_anchor
        FROM public.pharmacy_entitlement_anchors a
        WHERE a.pharmacy_id = p_pharmacy_id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 1;

        IF FOUND AND (v_latest_anchor.status = 'SUSPENDED' OR v_latest_anchor.mutations_allowed = FALSE) THEN
            RETURN jsonb_build_object(
                'pharmacy_id', p_pharmacy_id,
                'state', 'SUSPENDED',
                'plan_code', v_sub.plan_code,
                'features', v_features,
                'current_period_start', v_sub.current_period_start,
                'current_period_end', v_sub.current_period_end,
                'grace_period_end', v_sub.current_period_end + INTERVAL '7 days',
                'mutations_allowed', FALSE,
                'historical_reads_allowed', TRUE,
                'server_time', v_now,
                'reason', 'Administrative suspension is active. New mutations are blocked.'
            );
        END IF;
    END IF;

    -- Approved 7-day grace period window
    v_grace_end := v_sub.current_period_end + INTERVAL '7 days';

    -- Lifecycle resolution based on status and UTC boundaries
    IF v_sub.status IN ('CANCELLED', 'EXPIRED') THEN
        v_state := 'EXPIRED';
        v_mutations_allowed := FALSE;
        v_reason := 'The subscription is ' || v_sub.status || '. New mutations are blocked.';
    ELSIF v_sub.status = 'PAST_DUE' THEN
        IF v_now < v_grace_end THEN
            v_state := 'GRACE';
            v_mutations_allowed := TRUE;
            v_reason := 'Payment is past due; seven-day grace window is currently active.';
        ELSE
            v_state := 'EXPIRED';
            v_mutations_allowed := FALSE;
            v_reason := 'Payment is past due and the approved grace window has ended.';
        END IF;
    ELSIF v_sub.status IN ('TRIAL', 'ACTIVE') THEN
        IF v_now < v_sub.current_period_end THEN
            v_state := v_sub.status;
            v_mutations_allowed := TRUE;
            IF v_sub.status = 'TRIAL' THEN
                v_reason := '14-Day Free Trial is active within its recorded period.';
            ELSE
                v_reason := 'Subscription is active within its recorded period.';
            END IF;
        ELSIF v_now < v_grace_end THEN
            v_state := 'GRACE';
            v_mutations_allowed := TRUE;
            v_reason := 'The recorded period has ended; seven-day grace window is currently active.';
        ELSE
            v_state := 'EXPIRED';
            v_mutations_allowed := FALSE;
            v_reason := 'The recorded period and approved grace window have ended.';
        END IF;
    ELSE
        -- Unrecognized status fails closed to UNKNOWN
        v_state := 'UNKNOWN';
        v_mutations_allowed := FALSE;
        v_reason := 'Subscription status ' || COALESCE(v_sub.status, 'NULL') || ' is unrecognized.';
    END IF;

    RETURN jsonb_build_object(
        'pharmacy_id', p_pharmacy_id,
        'state', v_state,
        'plan_code', v_sub.plan_code,
        'features', v_features,
        'current_period_start', v_sub.current_period_start,
        'current_period_end', v_sub.current_period_end,
        'grace_period_end', v_grace_end,
        'mutations_allowed', v_mutations_allowed,
        'historical_reads_allowed', TRUE,
        'server_time', v_now,
        'reason', v_reason
    );
END;
$;

GRANT EXECUTE ON FUNCTION public.rpc_get_effective_entitlement_v1(UUID) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public.rpc_get_effective_entitlement_v1(UUID) FROM public, anon;

-- FUNCTION: assert_pharmacy_mutation_entitled_v1 (4-argument signature with payload verification)
CREATE OR REPLACE FUNCTION public.assert_pharmacy_mutation_entitled_v1(
    p_pharmacy_id UUID,
    p_operation_type TEXT,
    p_operation_id UUID DEFAULT NULL,
    p_payload_hash TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $
DECLARE
    v_entitlement JSONB;
    v_state TEXT;
    v_mutations_allowed BOOLEAN;
    v_reason TEXT;
    v_already_accepted BOOLEAN := FALSE;
    v_existing_hash TEXT;
    v_claim_sub TEXT;
BEGIN
    -- 1. Attest Caller Authentication & Provenance
    IF (
        auth.role() = 'service_role'
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
        OR current_user = 'service_role'
    ) THEN
        -- Service-role gateway: target pharmacy must exist and have active membership
        IF NOT EXISTS (SELECT 1 FROM public.pharmacies WHERE id = p_pharmacy_id) THEN
            RAISE EXCEPTION 'PHARMACY_NOT_FOUND: Target pharmacy % does not exist.', p_pharmacy_id
                USING ERRCODE = '02000';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.pharmacy_members 
            WHERE pharmacy_id = p_pharmacy_id AND status = 'ACTIVE'
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN_PHARMACY: Target pharmacy % has no active operators or members.', p_pharmacy_id
                USING ERRCODE = '42501';
        END IF;

        -- If request.jwt.claim.sub is passed, verify operator membership
        v_claim_sub := current_setting('request.jwt.claim.sub', true);
        IF v_claim_sub IS NOT NULL AND v_claim_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.pharmacy_members
                WHERE user_id = v_claim_sub::UUID AND pharmacy_id = p_pharmacy_id AND status = 'ACTIVE'
            ) THEN
                RAISE EXCEPTION 'FORBIDDEN_OPERATOR: Operator claim is not an active member of pharmacy %', p_pharmacy_id
                    USING ERRCODE = '42501';
            END IF;
        END IF;
    ELSIF auth.uid() IS NOT NULL THEN
        -- Authenticated client caller: must be an active member of target pharmacy or platform admin
        IF NOT (public.is_pharmacy_member(p_pharmacy_id) OR public.is_platform_admin('ADMIN')) THEN
            RAISE EXCEPTION 'Unauthorized: Caller is not an authorized member of pharmacy %', p_pharmacy_id
                USING ERRCODE = '42501';
        END IF;
    ELSE
        RAISE EXCEPTION 'AUTH_REQUIRED: Unauthenticated caller.' USING ERRCODE = '28000';
    END IF;

    -- 2. Scoped Replay Hardening Guard
    -- Preserves legitimate previously accepted operations during idempotent replay
    -- even if the subscription expired post-facto.
    -- Replay is strictly bound to the matching operation kind, caller target pharmacy,
    -- verified client_op_id, and verified matching 64-char SHA-256 payload hash.
    IF p_operation_id IS NOT NULL AND p_payload_hash IS NOT NULL AND p_payload_hash ~ '^[0-9a-fA-F]{64}$' THEN
        CASE p_operation_type
            WHEN 'SALE_CREATE', 'SALE_COMMIT' THEN
                SELECT payload_hash INTO v_existing_hash
                FROM public.sync_journal
                WHERE pharmacy_id = p_pharmacy_id 
                  AND client_op_id = p_operation_id
                  AND table_name = 'sales'
                  AND status = 'COMMITTED';

                IF FOUND THEN
                    IF v_existing_hash IS NULL OR v_existing_hash !~ '^[0-9a-fA-F]{64}$' THEN
                        v_already_accepted := FALSE;
                    ELSIF lower(v_existing_hash) <> lower(p_payload_hash) THEN
                        RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION: client_op_id % reused with mismatched payload hash.', p_operation_id
                            USING ERRCODE = '23505';
                    ELSE
                        v_already_accepted := TRUE;
                    END IF;
                ELSE
                    v_already_accepted := FALSE;
                END IF;

            WHEN 'SALE_REFUND' THEN
                SELECT payload_hash INTO v_existing_hash
                FROM public.sync_journal
                WHERE pharmacy_id = p_pharmacy_id 
                  AND client_op_id = p_operation_id
                  AND table_name = 'sale_returns'
                  AND status = 'COMMITTED';

                IF NOT FOUND THEN
                    SELECT payload_hash INTO v_existing_hash
                    FROM public.sale_returns
                    WHERE pharmacy_id = p_pharmacy_id 
                      AND client_op_id = p_operation_id
                      AND status = 'COMPLETED';
                END IF;

                IF FOUND THEN
                    IF v_existing_hash IS NULL OR v_existing_hash !~ '^[0-9a-fA-F]{64}$' THEN
                        v_already_accepted := FALSE;
                    ELSIF lower(v_existing_hash) <> lower(p_payload_hash) THEN
                        RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION: client_op_id % reused with mismatched payload hash.', p_operation_id
                            USING ERRCODE = '23505';
                    ELSE
                        v_already_accepted := TRUE;
                    END IF;
                ELSE
                    v_already_accepted := FALSE;
                END IF;

            WHEN 'STOCK_INTAKE' THEN
                SELECT payload_hash INTO v_existing_hash
                FROM public.purchases
                WHERE pharmacy_id = p_pharmacy_id 
                  AND client_op_id = p_operation_id
                  AND status IN ('COMPLETED', 'RECEIVED');

                IF FOUND THEN
                    IF v_existing_hash IS NULL OR v_existing_hash !~ '^[0-9a-fA-F]{64}$' THEN
                        v_already_accepted := FALSE;
                    ELSIF lower(v_existing_hash) <> lower(p_payload_hash) THEN
                        RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION: client_op_id % reused with mismatched payload hash.', p_operation_id
                            USING ERRCODE = '23505';
                    ELSE
                        v_already_accepted := TRUE;
                    END IF;
                ELSE
                    v_already_accepted := FALSE;
                END IF;

            WHEN 'STOCK_ADJUST' THEN
                SELECT payload_hash INTO v_existing_hash
                FROM public.stock_adjustments
                WHERE pharmacy_id = p_pharmacy_id AND client_op_id = p_operation_id;

                IF FOUND THEN
                    IF v_existing_hash IS NULL OR v_existing_hash !~ '^[0-9a-fA-F]{64}$' THEN
                        v_already_accepted := FALSE;
                    ELSIF lower(v_existing_hash) <> lower(p_payload_hash) THEN
                        RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION: client_op_id % reused with mismatched payload hash.', p_operation_id
                            USING ERRCODE = '23505';
                    ELSE
                        v_already_accepted := TRUE;
                    END IF;
                ELSE
                    v_already_accepted := FALSE;
                END IF;

            WHEN 'TRANSFER_DISPATCH' THEN
                SELECT dispatch_payload_hash INTO v_existing_hash
                FROM public.stock_transfers
                WHERE pharmacy_id = p_pharmacy_id AND dispatch_client_op_id = p_operation_id;

                IF FOUND THEN
                    IF v_existing_hash IS NULL OR v_existing_hash !~ '^[0-9a-fA-F]{64}$' THEN
                        v_already_accepted := FALSE;
                    ELSIF lower(v_existing_hash) <> lower(p_payload_hash) THEN
                        RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION: client_op_id % reused with mismatched payload hash.', p_operation_id
                            USING ERRCODE = '23505';
                    ELSE
                        v_already_accepted := TRUE;
                    END IF;
                ELSE
                    v_already_accepted := FALSE;
                END IF;

            WHEN 'TRANSFER_RECEIVE' THEN
                SELECT receive_payload_hash INTO v_existing_hash
                FROM public.stock_transfers
                WHERE pharmacy_id = p_pharmacy_id 
                  AND receive_client_op_id = p_operation_id
                  AND status = 'RECEIVED';

                IF FOUND THEN
                    IF v_existing_hash IS NULL OR v_existing_hash !~ '^[0-9a-fA-F]{64}$' THEN
                        v_already_accepted := FALSE;
                    ELSIF lower(v_existing_hash) <> lower(p_payload_hash) THEN
                        RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION: client_op_id % reused with mismatched payload hash.', p_operation_id
                            USING ERRCODE = '23505';
                    ELSE
                        v_already_accepted := TRUE;
                    END IF;
                ELSE
                    v_already_accepted := FALSE;
                END IF;

            -- Online staff mutations cannot be bypassed via offline replay
            WHEN 'STAFF_INVITE', 'STAFF_ROLE', 'STAFF_REACTIVATE', 'STAFF_SUSPEND', 'STAFF_MUTATION', 'STAFF_REVOKE_INVITATION', 'STAFF_ACCEPT_INVITATION' THEN
                v_already_accepted := FALSE;

            ELSE
                v_already_accepted := FALSE;
        END CASE;

        IF v_already_accepted THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- 3. Evaluate Authoritative Entitlement
    v_entitlement := public.rpc_get_effective_entitlement_v1(p_pharmacy_id);
    v_state := v_entitlement->>'state';
    v_mutations_allowed := (v_entitlement->>'mutations_allowed')::BOOLEAN;
    v_reason := v_entitlement->>'reason';

    IF v_mutations_allowed IS NOT TRUE THEN
        RAISE EXCEPTION 'ENTITLEMENT_BLOCKED: Pharmacy % is not entitled to perform % (state: %, reason: %)',
            p_pharmacy_id, p_operation_type, v_state, v_reason
            USING ERRCODE = 'P0001',
                  DETAIL = jsonb_build_object(
                      'code', CASE 
                          WHEN v_state = 'SUSPENDED' THEN 'ENTITLEMENT_SUSPENDED'
                          WHEN v_state = 'EXPIRED' THEN 'ENTITLEMENT_EXPIRED'
                          ELSE 'ENTITLEMENT_UNKNOWN'
                      END,
                      'pharmacy_id', p_pharmacy_id,
                      'operation_type', p_operation_type,
                      'state', v_state,
                      'reason', v_reason
                  )::text;
    END IF;

    RETURN TRUE;
END;
$;

GRANT EXECUTE ON FUNCTION public.assert_pharmacy_mutation_entitled_v1(UUID, TEXT, UUID, TEXT) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public.assert_pharmacy_mutation_entitled_v1(UUID, TEXT, UUID, TEXT) FROM public, anon;

-- Overload for backwards compatibility with 3-argument callers
CREATE OR REPLACE FUNCTION public.assert_pharmacy_mutation_entitled_v1(
    p_pharmacy_id UUID,
    p_operation_type TEXT,
    p_operation_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $
    SELECT public.assert_pharmacy_mutation_entitled_v1(p_pharmacy_id, p_operation_type, p_operation_id, NULL);
$;

GRANT EXECUTE ON FUNCTION public.assert_pharmacy_mutation_entitled_v1(UUID, TEXT, UUID) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public.assert_pharmacy_mutation_entitled_v1(UUID, TEXT, UUID) FROM public, anon;


-- ----------------------------------------------------------------------------
-- 2. OPERATIONAL RPC 1: rpc_ingest_sale_stock_movement (Sales Movement Ingestion)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_ingest_sale_stock_movement(
    p_client_op_id UUID,
    p_pharmacy_id UUID,
    p_branch_id UUID,
    p_device_id UUID,
    p_sale_id UUID,
    p_product_id UUID,
    p_batch_id UUID,
    p_quantity INT,
    p_payload_hash TEXT
)
RETURNS TABLE (
    operation_status VARCHAR,
    new_stock INT,
    deficit_created BOOLEAN,
    processed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_rows_inserted INT;
    v_existing_hash TEXT;
    v_existing_status VARCHAR;
    v_existing_stock INT;
    v_existing_deficit BOOLEAN;
    v_existing_time TIMESTAMPTZ;
    v_device_status VARCHAR;
    v_sale_branch UUID;
    v_batch_pharmacy UUID;
    v_batch_product UUID;
    v_current_stock INT;
    v_updated_stock INT;
    v_deficit BOOLEAN := FALSE;
    v_ledger_id UUID := gen_random_uuid();
    v_timestamp TIMESTAMPTZ := timezone('utc', now());
    v_actor_user_id UUID;
    v_claim_sub TEXT;
    v_actor_status VARCHAR(16);
    v_actor_role VARCHAR(32);
BEGIN
    -- 0. Server-Authoritative Entitlement Assertion
    PERFORM public.assert_pharmacy_mutation_entitled_v1(
        p_pharmacy_id,
        'SALE_CREATE',
        p_client_op_id,
        p_payload_hash
    );

    -- 1. Attest Caller Provenance (Strict service_role gateway or system principal required)
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' 
       AND session_user != 'postgres' AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'TRUSTED_GATEWAY_REQUIRED' USING ERRCODE = '42501';
    END IF;

    -- 2. Resolve and Validate Initiating Operator or Authorized System Principal
    IF session_user = 'postgres' OR current_user = 'postgres' THEN
        -- Explicitly authorized system principal (e.g. migration runner / database administrator)
        NULL;
    ELSE
        -- Service-role gateway execution: MUST validate the actual initiating operator
        v_actor_user_id := auth.uid();
        IF v_actor_user_id IS NULL THEN
            v_claim_sub := current_setting('request.jwt.claim.sub', true);
            IF v_claim_sub IS NOT NULL AND v_claim_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                v_actor_user_id := v_claim_sub::UUID;
            END IF;
        END IF;

        IF v_actor_user_id IS NULL THEN
            RAISE EXCEPTION 'FORBIDDEN_OPERATOR: Initiating operator identity required for privileged ingestion'
                USING ERRCODE = '42501';
        END IF;

        -- Verify Operator Active Status in Target Pharmacy
        SELECT pm.status, pm.role INTO v_actor_status, v_actor_role
        FROM public.pharmacy_members pm
        WHERE pm.pharmacy_id = p_pharmacy_id AND pm.user_id = v_actor_user_id;

        IF v_actor_status IS DISTINCT FROM 'ACTIVE' THEN
            RAISE EXCEPTION 'FORBIDDEN_PHARMACY: Initiating operator lacks active membership in pharmacy %', p_pharmacy_id
                USING ERRCODE = '42501';
        END IF;

        -- Verify Operator sales.create Permission
        IF NOT EXISTS (
            SELECT 1 FROM public.role_permissions rp
            WHERE rp.role = v_actor_role AND rp.permission = 'sales.create'
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN_PERMISSION: Initiating operator lacks sales.create permission'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 4. Verify Active Device Assignment to Branch
    SELECT status INTO v_device_status
    FROM public.devices
    WHERE id = p_device_id AND pharmacy_id = p_pharmacy_id AND branch_id = p_branch_id;

    IF v_device_status IS NULL THEN
        RAISE EXCEPTION 'DEVICE_NOT_FOUND: Device does not exist in branch.' USING ERRCODE = '02000';
    ELSIF v_device_status != 'ACTIVE' THEN
        RAISE EXCEPTION 'DEVICE_BLOCKED: Device is suspended or revoked.' USING ERRCODE = '42501';
    END IF;

    -- 5. Atomic Idempotency Reservation
    INSERT INTO public.sync_journal (
        client_op_id, pharmacy_id, device_id, table_name,
        record_id, operation, payload_hash, status, processed_at
    ) VALUES (
        p_client_op_id, p_pharmacy_id, p_device_id, 'sales',
        p_sale_id, 'INSERT', p_payload_hash, 'PENDING', v_timestamp
    )
    ON CONFLICT (pharmacy_id, client_op_id) DO NOTHING;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    IF v_rows_inserted = 0 THEN
        SELECT payload_hash, response_status, resulting_stock, deficit_created, processed_at
        INTO v_existing_hash, v_existing_status, v_existing_stock, v_existing_deficit, v_existing_time
        FROM public.sync_journal
        WHERE pharmacy_id = p_pharmacy_id AND client_op_id = p_client_op_id;

        IF v_existing_hash IS DISTINCT FROM p_payload_hash THEN
            RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION: client_op_id % reused with mismatched payload hash.', p_client_op_id
                USING ERRCODE = '23505';
        ELSE
            RETURN QUERY SELECT 
                'ALREADY_COMMITTED'::VARCHAR,
                v_existing_stock,
                v_existing_deficit,
                v_existing_time;
            RETURN;
        END IF;
    END IF;

    -- 6. Validate Quantity
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_QUANTITY: Movement quantity must be positive.' USING ERRCODE = '22003';
    END IF;

    -- 7. Validate Parent Sale Entity
    SELECT branch_id INTO v_sale_branch
    FROM public.sales
    WHERE id = p_sale_id AND pharmacy_id = p_pharmacy_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SALE_NOT_FOUND: Referenced sale % does not exist in pharmacy %', p_sale_id, p_pharmacy_id 
            USING ERRCODE = '02000';
    ELSIF v_sale_branch != p_branch_id THEN
        RAISE EXCEPTION 'SALE_BRANCH_MISMATCH: Sale branch does not match operation branch.' USING ERRCODE = '23503';
    END IF;

    -- 8. Concurrency Safety: Row Lock Batch
    SELECT pharmacy_id, product_id, quantity
    INTO v_batch_pharmacy, v_batch_product, v_current_stock
    FROM public.inventory_batches
    WHERE id = p_batch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'BATCH_NOT_FOUND: Target inventory batch % does not exist.', p_batch_id USING ERRCODE = '02000';
    END IF;

    IF v_batch_pharmacy != p_pharmacy_id OR v_batch_product != p_product_id THEN
        RAISE EXCEPTION 'RELATIONAL_VIOLATION: Batch does not belong to specified product or pharmacy.' USING ERRCODE = '42501';
    END IF;

    -- 9. Calculate Stock & Deficit Status
    v_updated_stock := v_current_stock - p_quantity;
    IF v_updated_stock < 0 THEN
        v_deficit := TRUE;
    END IF;

    -- 10. Update Batch Quantity
    UPDATE public.inventory_batches
    SET quantity = v_updated_stock,
        updated_at = v_timestamp
    WHERE id = p_batch_id;

    -- 11. Record Movement in Stock Ledger
    INSERT INTO public.stock_ledger (
        id, pharmacy_id, branch_id, product_id, batch_id,
        movement_type, quantity_delta, resulting_batch_stock,
        reference_id, device_id, notes, created_at
    ) VALUES (
        v_ledger_id, p_pharmacy_id, p_branch_id, p_product_id, p_batch_id,
        'SALE', -p_quantity, v_updated_stock,
        p_sale_id, p_device_id,
        CASE WHEN v_deficit THEN 'OFFLINE_CONCURRENT_DEFICIT' ELSE NULL END,
        v_timestamp
    );

    -- 12. Update Sync Journal with deterministic output
    UPDATE public.sync_journal
    SET response_status = 'COMMITTED',
        resulting_stock = v_updated_stock,
        deficit_created = v_deficit,
        ledger_entry_id = v_ledger_id,
        batch_id = p_batch_id,
        sale_id = p_sale_id,
        status = 'COMMITTED'
    WHERE pharmacy_id = p_pharmacy_id AND client_op_id = p_client_op_id;

    RETURN QUERY SELECT 'COMMITTED'::VARCHAR, v_updated_stock, v_deficit, v_timestamp;
END;
$$;

ALTER FUNCTION public.rpc_ingest_sale_stock_movement(UUID, UUID, UUID, UUID, UUID, UUID, UUID, INT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_ingest_sale_stock_movement(UUID, UUID, UUID, UUID, UUID, UUID, UUID, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ingest_sale_stock_movement(UUID, UUID, UUID, UUID, UUID, UUID, UUID, INT, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. OPERATIONAL RPC 2: rpc_commit_sale_v1 (Unified Sales Commit)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_commit_sale_v1(
    p_actor_user_id UUID,
    p_pharmacy_id UUID,
    p_branch_id UUID,
    p_device_id UUID,
    p_client_op_id UUID,
    p_checkout_intent_id UUID,
    p_nonce UUID,
    p_payload_hash TEXT,
    p_sale JSONB,
    p_items JSONB
)
RETURNS TABLE (
    operation_status VARCHAR,
    sale_id UUID,
    processed_at TIMESTAMPTZ,
    response_payload JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := timezone('utc', now());
    v_sale_id UUID := (p_sale->>'id')::UUID;
    v_customer_id UUID := NULLIF(p_sale->>'customer_id', '')::UUID;
    v_currency VARCHAR(3) := upper(p_sale->>'currency');
    v_payment_method VARCHAR(32) := upper(p_sale->>'payment_method');
    v_payment_status VARCHAR(32) := upper(COALESCE(p_sale->>'payment_status', 'SETTLED'));
    v_subtotal BIGINT := (p_sale->>'subtotal')::BIGINT;
    v_discount BIGINT := (p_sale->>'discount')::BIGINT;
    v_tax BIGINT := (p_sale->>'tax')::BIGINT;
    v_total BIGINT := (p_sale->>'total')::BIGINT;
    v_tendered BIGINT := (p_sale->>'amount_tendered')::BIGINT;
    v_change_due BIGINT := (p_sale->>'change_due')::BIGINT;
    v_existing_hash TEXT;
    v_existing_sale UUID;
    v_existing_response JSONB;
    v_line JSONB;
    v_item_id UUID;
    v_product_id UUID;
    v_batch_id UUID;
    v_quantity INT;
    v_unit_price BIGINT;
    v_line_discount BIGINT;
    v_line_tax BIGINT;
    v_line_total BIGINT;
    v_calculated_subtotal BIGINT := 0;
    v_calculated_discount BIGINT := 0;
    v_calculated_tax BIGINT := 0;
    v_calculated_total BIGINT := 0;
    v_batch RECORD;
    v_updated_stock INT;
    v_deficit INT;
    v_ledger_id UUID;
    v_response JSONB;
    v_has_open_register BOOLEAN := FALSE;
    v_actor_status VARCHAR(16);
    v_actor_role VARCHAR(32);
BEGIN
    -- 0. Server-Authoritative Entitlement Assertion
    PERFORM public.assert_pharmacy_mutation_entitled_v1(
        p_pharmacy_id,
        'SALE_COMMIT',
        p_client_op_id,
        p_payload_hash
    );

    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' AND session_user != 'postgres' AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'TRUSTED_GATEWAY_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF p_payload_hash !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 OR v_subtotal < 0 OR v_discount < 0
       OR v_tax < 0 OR v_total < 0 OR v_tendered < 0 OR v_change_due < 0 THEN
        RAISE EXCEPTION 'INVALID_SALE_PAYLOAD' USING ERRCODE = '22023';
    END IF;

    SELECT payload_hash, sale_id, response_payload INTO v_existing_hash, v_existing_sale, v_existing_response
    FROM public.sync_journal
    WHERE pharmacy_id = p_pharmacy_id AND client_op_id = p_client_op_id
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing_hash IS DISTINCT FROM p_payload_hash THEN
            RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION: client_op_id % reused with mismatched payload hash.', p_client_op_id
                USING ERRCODE = '23505';
        END IF;
        RETURN QUERY SELECT 'ALREADY_COMMITTED'::VARCHAR, v_existing_sale, v_now, v_existing_response;
        RETURN;
    END IF;

    INSERT INTO public.sync_journal (
        client_op_id, pharmacy_id, device_id, table_name, record_id,
        operation, payload_hash, status, response_status, processed_at
    ) VALUES (
        p_client_op_id, p_pharmacy_id, p_device_id, 'sales', v_sale_id,
        'INSERT', p_payload_hash, 'PENDING', 'PENDING', v_now
    );

    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN_OPERATOR: Initiating operator ID is required' USING ERRCODE = '42501';
    END IF;

    SELECT pm.status, pm.role INTO v_actor_status, v_actor_role
    FROM public.pharmacy_members pm
    WHERE pm.pharmacy_id = p_pharmacy_id AND pm.user_id = p_actor_user_id;

    IF v_actor_status IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'FORBIDDEN_PHARMACY: Actor lacks active membership' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.role_permissions rp
        WHERE rp.role = v_actor_role AND rp.permission = 'sales.create'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_PERMISSION: sales.create permission required.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.devices d
        WHERE d.id = p_device_id AND d.pharmacy_id = p_pharmacy_id
          AND d.branch_id = p_branch_id AND d.status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'DEVICE_BRANCH_FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    IF v_customer_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = v_customer_id AND c.pharmacy_id = p_pharmacy_id
    ) THEN
        RAISE EXCEPTION 'CUSTOMER_PHARMACY_MISMATCH' USING ERRCODE = '23503';
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_line->>'id')::UUID;
        v_product_id := (v_line->>'product_id')::UUID;
        v_batch_id := (v_line->>'batch_id')::UUID;
        v_quantity := (v_line->>'quantity')::INT;
        v_unit_price := (v_line->>'unit_price')::BIGINT;
        v_line_discount := (v_line->>'discount')::BIGINT;
        v_line_tax := (v_line->>'tax')::BIGINT;
        v_line_total := (v_line->>'total')::BIGINT;

        IF v_quantity <= 0 OR v_unit_price < 0 OR v_line_discount < 0 OR v_line_tax < 0 OR v_line_total < 0 THEN
            RAISE EXCEPTION 'INVALID_ITEM_AMOUNTS' USING ERRCODE = '22023';
        END IF;

        IF v_line_total <> ((v_quantity * v_unit_price) - v_line_discount + v_line_tax) THEN
            RAISE EXCEPTION 'ITEM_LINE_TOTAL_MISMATCH' USING ERRCODE = '22023';
        END IF;

        v_calculated_subtotal := v_calculated_subtotal + (v_quantity * v_unit_price);
        v_calculated_discount := v_calculated_discount + v_line_discount;
        v_calculated_tax := v_calculated_tax + v_line_tax;
        v_calculated_total := v_calculated_total + v_line_total;

        SELECT b.id, b.pharmacy_id, b.product_id, b.quantity, b.selling_price
        INTO v_batch
        FROM public.inventory_batches b
        WHERE b.id = v_batch_id
        FOR UPDATE;

        IF NOT FOUND OR v_batch.pharmacy_id <> p_pharmacy_id OR v_batch.product_id <> v_product_id THEN
            RAISE EXCEPTION 'BATCH_NOT_FOUND_OR_FORBIDDEN' USING ERRCODE = '02000';
        END IF;

        IF v_unit_price <> v_batch.selling_price AND NOT EXISTS (
            SELECT 1 FROM public.pharmacy_members pm
            JOIN public.role_permissions rp ON rp.role = pm.role
            WHERE pm.pharmacy_id = p_pharmacy_id AND pm.user_id = p_actor_user_id
              AND pm.status = 'ACTIVE' AND rp.permission = 'sales.price_override'
        ) THEN
            RAISE EXCEPTION 'PRICE_OVERRIDE_FORBIDDEN' USING ERRCODE = '42501';
        END IF;
    END LOOP;

    IF v_subtotal <> v_calculated_subtotal OR v_discount <> v_calculated_discount
       OR v_tax <> v_calculated_tax OR v_total <> v_calculated_total THEN
        RAISE EXCEPTION 'SALE_TOTAL_MISMATCH' USING ERRCODE = '22023';
    END IF;

    IF v_tendered < v_total OR v_change_due <> (v_tendered - v_total) THEN
        RAISE EXCEPTION 'TENDER_CHANGE_MISMATCH' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.sales (
        id, pharmacy_id, branch_id, customer_id, cashier_id,
        currency, subtotal, discount, tax, total,
        amount_tendered, change_due, payment_method, payment_status,
        device_id, client_op_id, checkout_intent_id, client_created_at, created_at
    ) VALUES (
        v_sale_id, p_pharmacy_id, p_branch_id, v_customer_id, p_actor_user_id,
        v_currency, v_subtotal, v_discount, v_tax, v_total,
        v_tendered, v_change_due, v_payment_method, v_payment_status,
        p_device_id, p_client_op_id, p_checkout_intent_id,
        NULLIF(p_sale->>'client_created_at', '')::TIMESTAMPTZ, v_now
    );

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_line->>'id')::UUID;
        v_product_id := (v_line->>'product_id')::UUID;
        v_batch_id := (v_line->>'batch_id')::UUID;
        v_quantity := (v_line->>'quantity')::INT;
        v_unit_price := (v_line->>'unit_price')::BIGINT;
        v_line_discount := (v_line->>'discount')::BIGINT;
        v_line_tax := (v_line->>'tax')::BIGINT;
        v_line_total := (v_line->>'total')::BIGINT;

        INSERT INTO public.sale_items (
            id, pharmacy_id, sale_id, product_id, batch_id,
            quantity, unit_price, discount, tax, total, created_at
        ) VALUES (
            v_item_id, p_pharmacy_id, v_sale_id, v_product_id, v_batch_id,
            v_quantity, v_unit_price, v_line_discount, v_line_tax, v_line_total, v_now
        );

        SELECT quantity INTO v_updated_stock FROM public.inventory_batches WHERE id = v_batch_id;
        v_updated_stock := v_updated_stock - v_quantity;
        v_deficit := CASE WHEN v_updated_stock < 0 THEN abs(v_updated_stock) ELSE 0 END;

        UPDATE public.inventory_batches
        SET quantity = v_updated_stock, updated_at = v_now
        WHERE id = v_batch_id;

        v_ledger_id := gen_random_uuid();
        INSERT INTO public.stock_ledger (
            id, pharmacy_id, branch_id, product_id, batch_id,
            movement_type, quantity_delta, resulting_batch_stock,
            reference_id, device_id, notes, created_at
        ) VALUES (
            v_ledger_id, p_pharmacy_id, p_branch_id, v_product_id, v_batch_id,
            'SALE', -v_quantity, v_updated_stock,
            v_sale_id, p_device_id,
            CASE WHEN v_deficit > 0 THEN 'OFFLINE_CONCURRENT_DEFICIT' ELSE NULL END,
            v_now
        );
    END LOOP;

    IF v_payment_method = 'CASH' AND NOT EXISTS (
        SELECT 1 FROM public.cash_register_sessions crs
        WHERE crs.pharmacy_id = p_pharmacy_id AND crs.branch_id = p_branch_id
          AND crs.cashier_id = p_actor_user_id AND crs.status = 'OPEN'
    ) THEN
        INSERT INTO public.late_cash_sale_exceptions(pharmacy_id, branch_id, cashier_id, sale_id, client_created_at)
        VALUES (p_pharmacy_id, p_branch_id, p_actor_user_id, v_sale_id,
                NULLIF(p_sale->>'client_created_at', '')::TIMESTAMPTZ);
    END IF;

    v_response := jsonb_build_object(
        'operation_status', 'COMMITTED', 'sale_id', v_sale_id,
        'client_op_id', p_client_op_id, 'checkout_intent_id', p_checkout_intent_id,
        'total', v_total, 'currency', v_currency, 'processed_at', v_now
    );
    UPDATE public.sync_journal
    SET status = 'COMMITTED', response_status = 'COMMITTED', sale_id = v_sale_id,
        response_payload = v_response, processed_at = v_now
    WHERE pharmacy_id = p_pharmacy_id AND client_op_id = p_client_op_id;
    RETURN QUERY SELECT 'COMMITTED'::VARCHAR, v_sale_id, v_now, v_response;
END;
$$;

ALTER FUNCTION public.rpc_commit_sale_v1(UUID, UUID, UUID, UUID, UUID, UUID, UUID, TEXT, JSONB, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_commit_sale_v1(UUID, UUID, UUID, UUID, UUID, UUID, UUID, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_commit_sale_v1(UUID, UUID, UUID, UUID, UUID, UUID, UUID, TEXT, JSONB, JSONB) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. OPERATIONAL RPC 3A: rpc_process_sale_return (Sale Return & Restock)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_process_sale_return(
    p_pharmacy_id UUID,
    p_branch_id UUID,
    p_sale_id UUID,
    p_items JSONB,
    p_refund_amount NUMERIC(12,2),
    p_refund_payment_method VARCHAR(32),
    p_reason TEXT,
    p_client_op_id UUID DEFAULT NULL,
    p_payload_hash TEXT DEFAULT NULL
)
RETURNS TABLE (
    return_id UUID,
    status VARCHAR(16),
    refund_amount NUMERIC(12,2),
    processed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_timestamp TIMESTAMPTZ := timezone('utc', now());
    v_return_id UUID := gen_random_uuid();
    v_existing_id UUID;
    v_existing_hash TEXT;
    v_sale_branch UUID;
    v_sale_total NUMERIC(12,2);
    v_item JSONB;
    v_product_id UUID;
    v_batch_id UUID;
    v_qty INT;
    v_restock BOOLEAN;
    v_orig_qty INT;
    v_already_returned INT;
    v_current_stock INT;
    v_new_stock INT;
    v_ledger_id UUID;
    v_batch_pharmacy UUID;
    v_batch_product UUID;
BEGIN
    -- 0. Server-Authoritative Entitlement Assertion
    PERFORM public.assert_pharmacy_mutation_entitled_v1(
        p_pharmacy_id,
        'SALE_REFUND',
        p_client_op_id,
        p_payload_hash
    );

    -- 1. Attest Caller Authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Unauthenticated caller.' USING ERRCODE = '28000';
    END IF;

    -- 2. Verify Active Pharmacy Membership
    IF NOT EXISTS (
        SELECT 1 FROM public.pharmacy_members
        WHERE user_id = auth.uid() AND pharmacy_id = p_pharmacy_id AND status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_PHARMACY: Caller not active in pharmacy.' USING ERRCODE = '42501';
    END IF;

    -- 3. Verify Role Permission: 'sales.refund'
    IF NOT public.has_pharmacy_permission(p_pharmacy_id, 'sales.refund') THEN
        RAISE EXCEPTION 'FORBIDDEN_PERMISSION: sales.refund permission required.' USING ERRCODE = '42501';
    END IF;

    -- 4. Idempotency Check: if client_op_id already processed, verify hash and return existing record
    IF p_client_op_id IS NOT NULL THEN
        SELECT id, sale_returns.status, sale_returns.refund_amount, created_at, sale_returns.payload_hash
        INTO v_existing_id, status, refund_amount, processed_at, v_existing_hash
        FROM public.sale_returns
        WHERE pharmacy_id = p_pharmacy_id AND client_op_id = p_client_op_id;

        IF FOUND THEN
            IF p_payload_hash IS NOT NULL AND v_existing_hash IS NOT NULL AND v_existing_hash != p_payload_hash THEN
                RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION: client_op_id % reused with mismatched payload hash.', p_client_op_id
                    USING ERRCODE = '23505';
            END IF;

            return_id := v_existing_id;
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    -- 5. Validate Input Parameters
    IF p_refund_amount < 0 THEN
        RAISE EXCEPTION 'INVALID_REFUND_AMOUNT: Refund amount cannot be negative.' USING ERRCODE = '22003';
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'EMPTY_RETURN: At least one item must be returned.' USING ERRCODE = '22000';
    END IF;

    -- 6. Lock Parent Sale Row for Update (Prevents concurrent race conditions on same sale)
    SELECT branch_id, total INTO v_sale_branch, v_sale_total
    FROM public.sales
    WHERE id = p_sale_id AND pharmacy_id = p_pharmacy_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SALE_NOT_FOUND: Sale % does not exist in pharmacy %', p_sale_id, p_pharmacy_id 
            USING ERRCODE = '02000';
    END IF;

    IF v_sale_branch != p_branch_id THEN
        RAISE EXCEPTION 'BRANCH_MISMATCH: Sale branch does not match operation branch.' USING ERRCODE = '23503';
    END IF;

    -- 7. Validate Return Items and Calculate Returnable Quantities
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_batch_id := (v_item->>'batch_id')::UUID;
        v_qty := (v_item->>'quantity')::INT;
        v_restock := COALESCE((v_item->>'restock_to_inventory')::BOOLEAN, TRUE);

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: Return quantity must be positive.' USING ERRCODE = '22003';
        END IF;

        SELECT quantity INTO v_orig_qty
        FROM public.sale_items
        WHERE sale_id = p_sale_id 
          AND pharmacy_id = p_pharmacy_id 
          AND product_id = v_product_id 
          AND batch_id = v_batch_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ITEM_NOT_IN_SALE: Product % batch % was not sold in sale %', v_product_id, v_batch_id, p_sale_id
                USING ERRCODE = '02000';
        END IF;

        SELECT COALESCE(SUM(ri.quantity), 0) INTO v_already_returned
        FROM public.return_items ri
        JOIN public.sale_returns sr ON ri.return_id = sr.id AND ri.pharmacy_id = sr.pharmacy_id
        WHERE sr.original_sale_id = p_sale_id
          AND sr.pharmacy_id = p_pharmacy_id
          AND ri.product_id = v_product_id
          AND ri.batch_id = v_batch_id;

        IF (v_already_returned + v_qty) > v_orig_qty THEN
            RAISE EXCEPTION 'EXCEEDS_RETURNABLE_QUANTITY: Cannot return % units. Only % of % originally sold are returnable.',
                v_qty, (v_orig_qty - v_already_returned), v_orig_qty
                USING ERRCODE = '22003';
        END IF;
    END LOOP;

    -- 8. Insert Return Header
    INSERT INTO public.sale_returns (
        id, pharmacy_id, branch_id, original_sale_id,
        refund_amount, refund_payment_method, reason,
        authorized_by, client_op_id, payload_hash, status, created_at
    ) VALUES (
        v_return_id, p_pharmacy_id, p_branch_id, p_sale_id,
        p_refund_amount, p_refund_payment_method, p_reason,
        auth.uid(), p_client_op_id, p_payload_hash, 'COMPLETED', v_timestamp
    );

    -- 9. Insert Return Items & Restore Inventory Batch / Stock Ledger
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_batch_id := (v_item->>'batch_id')::UUID;
        v_qty := (v_item->>'quantity')::INT;
        v_restock := COALESCE((v_item->>'restock_to_inventory')::BOOLEAN, TRUE);

        INSERT INTO public.return_items (
            pharmacy_id, return_id, product_id, batch_id,
            quantity, restock_to_inventory, created_at
        ) VALUES (
            p_pharmacy_id, v_return_id, v_product_id, v_batch_id,
            v_qty, v_restock, v_timestamp
        );

        IF v_restock THEN
            SELECT pharmacy_id, product_id, quantity
            INTO v_batch_pharmacy, v_batch_product, v_current_stock
            FROM public.inventory_batches
            WHERE id = v_batch_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'BATCH_NOT_FOUND: Batch % does not exist.', v_batch_id USING ERRCODE = '02000';
            END IF;

            IF v_batch_pharmacy != p_pharmacy_id OR v_batch_product != v_product_id THEN
                RAISE EXCEPTION 'BATCH_MISMATCH: Batch does not belong to product/pharmacy.' USING ERRCODE = '42501';
            END IF;

            v_new_stock := v_current_stock + v_qty;

            UPDATE public.inventory_batches
            SET quantity = v_new_stock,
                updated_at = v_timestamp
            WHERE id = v_batch_id;

            v_ledger_id := gen_random_uuid();

            INSERT INTO public.stock_ledger (
                id, pharmacy_id, branch_id, product_id, batch_id,
                movement_type, quantity_delta, resulting_batch_stock,
                reference_id, notes, created_at
            ) VALUES (
                v_ledger_id, p_pharmacy_id, p_branch_id, v_product_id, v_batch_id,
                'RETURN', v_qty, v_new_stock,
                v_return_id, 'Restock from return: ' || p_reason, v_timestamp
            );
        END IF;
    END LOOP;

    -- 10. Audit Logging
    INSERT INTO public.audit_logs (
        pharmacy_id, actor_id, actor_type, action,
        target_entity, target_id, new_data, created_at
    ) VALUES (
        p_pharmacy_id, auth.uid(), 'USER', 'SALE_RETURN_PROCESSED',
        'sale_returns', v_return_id::TEXT,
        jsonb_build_object(
            'sale_id', p_sale_id,
            'refund_amount', p_refund_amount,
            'payment_method', p_refund_payment_method,
            'items_count', jsonb_array_length(p_items)
        ),
        v_timestamp
    );

    -- 11. Return Results
    return_id := v_return_id;
    status := 'COMPLETED';
    refund_amount := p_refund_amount;
    processed_at := v_timestamp;
    RETURN NEXT;
END;
$$;

ALTER FUNCTION public.rpc_process_sale_return(UUID, UUID, UUID, JSONB, NUMERIC, VARCHAR, TEXT, UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_process_sale_return(UUID, UUID, UUID, JSONB, NUMERIC, VARCHAR, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_process_sale_return(UUID, UUID, UUID, JSONB, NUMERIC, VARCHAR, TEXT, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. OPERATIONAL RPC 3B: rpc_process_sale_return_v2 (Refund V2 Commit)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_process_sale_return_v2(
    p_actor_user_id UUID,
    p_pharmacy_id UUID,
    p_branch_id UUID,
    p_device_id UUID,
    p_client_op_id UUID,
    p_nonce UUID,
    p_payload_hash TEXT,
    p_sale_id UUID,
    p_items JSONB,
    p_expected_refund_amount_minor BIGINT,
    p_refund_payment_method VARCHAR(32),
    p_reason TEXT
)
RETURNS TABLE (
    operation_status VARCHAR,
    return_id UUID,
    processed_at TIMESTAMPTZ,
    response_payload JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := timezone('utc', now());
    v_return_id UUID := gen_random_uuid();
    v_existing_hash TEXT;
    v_existing_response JSONB;
    v_existing_return UUID;
    v_sale RECORD;
    v_line RECORD;
    v_item JSONB;
    v_requested_qty INT;
    v_returned_qty INT;
    v_header_discount BIGINT;
    v_header_tax BIGINT;
    v_gross_total BIGINT;
    v_base_total BIGINT;
    v_sum_line_discount BIGINT;
    v_sum_line_tax BIGINT;
    v_expected BIGINT := 0;
    v_item_line RECORD;
    v_new_stock INT;
    v_response JSONB;
BEGIN
    -- 0. Server-Authoritative Entitlement Assertion
    PERFORM public.assert_pharmacy_mutation_entitled_v1(
        p_pharmacy_id,
        'SALE_REFUND',
        p_client_op_id,
        p_payload_hash
    );

    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' AND session_user != 'postgres' AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'TRUSTED_GATEWAY_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF p_payload_hash !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 OR p_expected_refund_amount_minor IS NULL
       OR p_expected_refund_amount_minor <= 0 OR p_expected_refund_amount_minor > 9999999999
       OR btrim(COALESCE(p_reason, '')) = '' THEN
        RAISE EXCEPTION 'INVALID_REFUND_REQUEST' USING ERRCODE = '22023';
    END IF;

    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN_OPERATOR: Initiating operator ID is required' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.pharmacy_members pm
        JOIN public.role_permissions rp ON rp.role = pm.role
        WHERE pm.user_id = p_actor_user_id
          AND pm.pharmacy_id = p_pharmacy_id
          AND pm.status = 'ACTIVE'
          AND rp.permission = 'sales.refund'
          AND (pm.default_branch_id = p_branch_id OR pm.role IN ('OWNER', 'MANAGER'))
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_REFUND_AUTHORIZATION' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.devices d
        WHERE d.id = p_device_id AND d.pharmacy_id = p_pharmacy_id
          AND d.branch_id = p_branch_id AND d.status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'DEVICE_BRANCH_FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    SELECT payload_hash, return_id, response_payload INTO v_existing_hash, v_existing_return, v_existing_response
    FROM public.sync_journal
    WHERE pharmacy_id = p_pharmacy_id AND client_op_id = p_client_op_id
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing_hash IS DISTINCT FROM p_payload_hash THEN
            RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION: client_op_id % reused with mismatched payload hash.', p_client_op_id
                USING ERRCODE = '23505';
        END IF;
        RETURN QUERY SELECT 'ALREADY_COMMITTED'::VARCHAR, v_existing_return, v_now, v_existing_response;
        RETURN;
    END IF;

    INSERT INTO public.sync_journal (
        client_op_id, pharmacy_id, device_id, table_name, record_id,
        operation, payload_hash, status, response_status, processed_at
    ) VALUES (
        p_client_op_id, p_pharmacy_id, p_device_id, 'sale_returns', v_return_id,
        'INSERT', p_payload_hash, 'PENDING', 'PENDING', v_now
    );

    SELECT s.id, s.branch_id, s.total, s.discount, s.tax
    INTO v_sale
    FROM public.sales s
    WHERE s.id = p_sale_id AND s.pharmacy_id = p_pharmacy_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORIGINAL_SALE_NOT_FOUND' USING ERRCODE = '02000';
    END IF;
    IF v_sale.branch_id <> p_branch_id THEN
        RAISE EXCEPTION 'ORIGINAL_SALE_BRANCH_MISMATCH' USING ERRCODE = '23503';
    END IF;

    SELECT COALESCE(SUM(si.discount), 0), COALESCE(SUM(si.tax), 0), COALESCE(SUM(si.total), 0)
    INTO v_sum_line_discount, v_sum_line_tax, v_gross_total
    FROM public.sale_items si
    WHERE si.sale_id = p_sale_id AND si.pharmacy_id = p_pharmacy_id;

    v_base_total := v_gross_total + v_sum_line_discount - v_sum_line_tax;
    v_header_discount := GREATEST(0, v_sale.discount - v_sum_line_discount);
    v_header_tax := GREATEST(0, v_sale.tax - v_sum_line_tax);

    PERFORM 1 FROM public.sale_items si
    WHERE si.sale_id = p_sale_id AND si.pharmacy_id = p_pharmacy_id
    ORDER BY si.id
    FOR UPDATE;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_requested_qty := (v_item->>'quantity')::INT;
        IF v_requested_qty <= 0 THEN
            RAISE EXCEPTION 'INVALID_REFUND_QUANTITY' USING ERRCODE = '22023';
        END IF;

        SELECT si.id, si.quantity, si.unit_price, si.discount, si.tax, si.total, si.batch_id
        INTO v_item_line
        FROM public.sale_items si
        WHERE si.id = (v_item->>'sale_item_id')::UUID
          AND si.sale_id = p_sale_id
          AND si.pharmacy_id = p_pharmacy_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'SALE_ITEM_NOT_FOUND' USING ERRCODE = '02000';
        END IF;

        SELECT COALESCE(SUM(ri.quantity), 0)
        INTO v_returned_qty
        FROM public.return_items ri
        JOIN public.sale_returns sr ON sr.id = ri.return_id AND sr.pharmacy_id = ri.pharmacy_id
        WHERE sr.original_sale_id = p_sale_id AND ri.sale_item_id = v_item_line.id
          AND sr.status = 'COMPLETED';

        IF (v_returned_qty + v_requested_qty) > v_item_line.quantity THEN
            RAISE EXCEPTION 'RETURN_QUANTITY_EXCEEDED' USING ERRCODE = '22023';
        END IF;

        v_expected := v_expected + (v_requested_qty * (
            v_item_line.unit_price
            - (v_item_line.discount / v_item_line.quantity)
            + (v_item_line.tax / v_item_line.quantity)
            - CASE WHEN v_base_total > 0 THEN ((v_item_line.unit_price * v_header_discount) / v_base_total) ELSE 0 END
            + CASE WHEN v_base_total > 0 THEN ((v_item_line.unit_price * v_header_tax) / v_base_total) ELSE 0 END
        ));
    END LOOP;

    IF v_expected <> p_expected_refund_amount_minor THEN
        RAISE EXCEPTION 'REFUND_AMOUNT_MISMATCH' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.sale_returns (
        id, pharmacy_id, branch_id, original_sale_id, refund_amount,
        refund_payment_method, reason, authorized_by, client_op_id,
        payload_hash, status, created_at
    ) VALUES (
        v_return_id, p_pharmacy_id, p_branch_id, p_sale_id,
        (p_expected_refund_amount_minor::NUMERIC / 100.00),
        p_refund_payment_method, p_reason, p_actor_user_id, p_client_op_id,
        p_payload_hash, 'COMPLETED', v_now
    );

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_requested_qty := (v_item->>'quantity')::INT;

        SELECT si.id, si.product_id, si.batch_id
        INTO v_item_line
        FROM public.sale_items si
        WHERE si.id = (v_item->>'sale_item_id')::UUID;

        INSERT INTO public.return_items (
            pharmacy_id, return_id, product_id, batch_id,
            sale_item_id, quantity, restock_to_inventory, created_at
        ) VALUES (
            p_pharmacy_id, v_return_id, v_item_line.product_id, v_item_line.batch_id,
            v_item_line.id, v_requested_qty, TRUE, v_now
        );

        SELECT b.quantity INTO v_new_stock
        FROM public.inventory_batches b
        WHERE b.id = v_item_line.batch_id
        FOR UPDATE;

        v_new_stock := v_new_stock + v_requested_qty;
        UPDATE public.inventory_batches
        SET quantity = v_new_stock, updated_at = v_now
        WHERE id = v_item_line.batch_id;

        INSERT INTO public.stock_ledger (
            id, pharmacy_id, branch_id, product_id, batch_id,
            movement_type, quantity_delta, resulting_batch_stock,
            reference_id, device_id, notes, created_at
        ) VALUES (
            gen_random_uuid(), p_pharmacy_id, p_branch_id, v_item_line.product_id, v_item_line.batch_id,
            'RETURN', v_requested_qty, v_new_stock,
            v_return_id, p_device_id, 'Restock from return: ' || p_reason, v_now
        );
    END LOOP;

    v_response := jsonb_build_object(
        'operation_status', 'COMMITTED', 'return_id', v_return_id,
        'refund_amount_minor', p_expected_refund_amount_minor, 'processed_at', v_now
    );
    UPDATE public.sync_journal
    SET status = 'COMMITTED', response_status = 'COMMITTED', return_id = v_return_id,
        response_payload = v_response, processed_at = v_now
    WHERE pharmacy_id = p_pharmacy_id AND client_op_id = p_client_op_id;

    RETURN QUERY SELECT 'COMMITTED'::VARCHAR, v_return_id, v_now, v_response;
END;
$$;

ALTER FUNCTION public.rpc_process_sale_return_v2(UUID, UUID, UUID, UUID, UUID, UUID, TEXT, UUID, JSONB, BIGINT, VARCHAR, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_process_sale_return_v2(UUID, UUID, UUID, UUID, UUID, UUID, TEXT, UUID, JSONB, BIGINT, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_process_sale_return_v2(UUID, UUID, UUID, UUID, UUID, UUID, TEXT, UUID, JSONB, BIGINT, VARCHAR, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 6. OPERATIONAL RPC 4: rpc_receive_inventory_stock (Stock Intake)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_receive_inventory_stock(
    p_pharmacy_id UUID,
    p_branch_id UUID,
    p_items JSONB,
    p_supplier_id UUID DEFAULT NULL,
    p_invoice_number TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_client_op_id UUID DEFAULT NULL
)
RETURNS TABLE (
    purchase_id UUID,
    status VARCHAR(16),
    total_items INT,
    total_cost BIGINT,
    processed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_timestamp TIMESTAMPTZ := timezone('utc', now());
    v_purchase_id UUID := gen_random_uuid();
    v_existing_id UUID;
    v_existing_payload_hash TEXT;
    v_incoming_payload_hash TEXT;
    v_item JSONB;
    v_product_id UUID;
    v_batch_id UUID;
    v_existing_batch_id UUID;
    v_batch_number TEXT;
    v_expiry_date DATE;
    v_qty INT;
    v_cost_price BIGINT;
    v_selling_price BIGINT;
    v_calc_total_cost BIGINT := 0;
    v_current_stock INT;
    v_new_stock INT;
    v_ledger_id UUID;
    v_item_count INT;
BEGIN
    -- 1. Attest Caller Authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Unauthenticated caller.' USING ERRCODE = '28000';
    END IF;

    -- 2. Verify Active Pharmacy Membership
    IF NOT EXISTS (
        SELECT 1 FROM public.pharmacy_members
        WHERE user_id = auth.uid() AND pharmacy_id = p_pharmacy_id AND status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_PHARMACY: Caller not active in pharmacy.' USING ERRCODE = '42501';
    END IF;

    -- 3. Verify Role Authorization: Caller must possess 'inventory.write' or 'purchases.manage'
    IF NOT (
        public.has_pharmacy_permission(p_pharmacy_id, 'inventory.write') OR
        public.has_pharmacy_permission(p_pharmacy_id, 'purchases.manage')
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_PERMISSION: Caller lacks inventory.write or purchases.manage permission.' USING ERRCODE = '42501';
    END IF;

    -- Compute deterministic canonical payload representation and SHA-256 hash (64-char lowercase hex)
    SELECT encode(sha256(
        (
            SELECT jsonb_build_object(
                'branch_id', lower(p_branch_id::TEXT),
                'invoice_number', COALESCE(trim(p_invoice_number), ''),
                'items', COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'batch_number', trim(elem->>'batch_number'),
                                'cost_price', COALESCE((elem->>'cost_price')::BIGINT, 0),
                                'expiry_date', trim(elem->>'expiry_date'),
                                'product_id', lower(trim(elem->>'product_id')),
                                'quantity', (elem->>'quantity')::INT,
                                'selling_price', COALESCE((elem->>'selling_price')::BIGINT, 0)
                            )
                            ORDER BY lower(trim(elem->>'product_id')), trim(elem->>'batch_number'), trim(elem->>'expiry_date')
                        )
                        FROM jsonb_array_elements(p_items) AS elem
                    ),
                    '[]'::jsonb
                ),
                'supplier_id', COALESCE(lower(p_supplier_id::TEXT), '')
            )::TEXT
        )::bytea
    ), 'hex')
    INTO v_incoming_payload_hash;

    -- 0. Server-Authoritative Entitlement Assertion
    PERFORM public.assert_pharmacy_mutation_entitled_v1(
        p_pharmacy_id,
        'STOCK_INTAKE',
        p_client_op_id,
        v_incoming_payload_hash
    );

    -- 4. Idempotency Check: if client_op_id already processed, inspect existing record
    IF p_client_op_id IS NOT NULL THEN
        SELECT p.id, p.status, p.total_cost, p.created_at, p.payload_hash
        INTO v_existing_id, status, total_cost, processed_at, v_existing_payload_hash
        FROM public.purchases p
        WHERE p.pharmacy_id = p_pharmacy_id AND p.client_op_id = p_client_op_id;

        IF FOUND THEN
            IF v_existing_payload_hash IS NOT NULL AND v_existing_payload_hash != v_incoming_payload_hash THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: client_op_id % already processed with divergent payload.', p_client_op_id
                    USING ERRCODE = '23505';
            END IF;

            SELECT COUNT(*)::INT INTO total_items
            FROM public.purchase_items pi
            WHERE pi.purchase_id = v_existing_id AND pi.pharmacy_id = p_pharmacy_id;

            purchase_id := v_existing_id;
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    -- 5. Validate Branch Belongs to Pharmacy
    IF NOT EXISTS (
        SELECT 1 FROM public.branches
        WHERE id = p_branch_id AND pharmacy_id = p_pharmacy_id
    ) THEN
        RAISE EXCEPTION 'BRANCH_NOT_FOUND: Branch % does not exist in pharmacy %', p_branch_id, p_pharmacy_id USING ERRCODE = '23503';
    END IF;

    -- 6. Validate Supplier If Specified
    IF p_supplier_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.suppliers
        WHERE id = p_supplier_id AND pharmacy_id = p_pharmacy_id
    ) THEN
        RAISE EXCEPTION 'SUPPLIER_NOT_FOUND: Supplier % does not belong to pharmacy %', p_supplier_id, p_pharmacy_id USING ERRCODE = '23503';
    END IF;

    -- 7. Validate Items Array
    IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'EMPTY_ITEMS: Items must be a non-empty array.' USING ERRCODE = '22000';
    END IF;

    -- 8. First Pass: Validate and calculate total cost
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_batch_number := trim(v_item->>'batch_number');
        v_expiry_date := (v_item->>'expiry_date')::DATE;
        v_qty := (v_item->>'quantity')::INT;
        v_cost_price := (v_item->>'cost_price')::BIGINT;
        v_selling_price := (v_item->>'selling_price')::BIGINT;

        IF v_product_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_PRODUCT: product_id is required for every received item.' USING ERRCODE = '22023';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.products
            WHERE id = v_product_id AND pharmacy_id = p_pharmacy_id
        ) THEN
            RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not belong to pharmacy %', v_product_id, p_pharmacy_id USING ERRCODE = '23503';
        END IF;

        IF v_batch_number IS NULL OR length(v_batch_number) = 0 THEN
            RAISE EXCEPTION 'INVALID_BATCH_NUMBER: batch_number cannot be empty.' USING ERRCODE = '22023';
        END IF;

        IF v_expiry_date IS NULL THEN
            RAISE EXCEPTION 'INVALID_EXPIRY: expiry_date is required for every received item.' USING ERRCODE = '22023';
        END IF;

        IF v_expiry_date <= CURRENT_DATE THEN
            RAISE EXCEPTION 'EXPIRED_MEDICATION_RECEIVED: Cannot receive batch % which has already expired (%).',
                v_batch_number, v_expiry_date USING ERRCODE = '22023';
        END IF;

        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: Received quantity must be positive, got %.', v_qty USING ERRCODE = '22003';
        END IF;

        IF v_cost_price IS NULL OR v_cost_price < 0 THEN
            RAISE EXCEPTION 'INVALID_COST_PRICE: cost_price cannot be negative.' USING ERRCODE = '22003';
        END IF;

        IF v_selling_price IS NULL OR v_selling_price < 0 THEN
            RAISE EXCEPTION 'INVALID_SELLING_PRICE: selling_price cannot be negative.' USING ERRCODE = '22003';
        END IF;

        v_calc_total_cost := v_calc_total_cost + (v_qty::BIGINT * v_cost_price);
    END LOOP;

    -- 9. Insert Parent Purchase Entity
    INSERT INTO public.purchases (
        id, pharmacy_id, branch_id, supplier_id, invoice_number,
        total_cost, status, client_op_id, payload_hash, notes,
        received_at, created_at
    ) VALUES (
        v_purchase_id, p_pharmacy_id, p_branch_id, p_supplier_id, p_invoice_number,
        v_calc_total_cost, 'RECEIVED', p_client_op_id, v_incoming_payload_hash, p_notes,
        v_timestamp, v_timestamp
    );

    -- 10. Second Pass: Insert items and update inventory
    v_item_count := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_batch_number := trim(v_item->>'batch_number');
        v_expiry_date := (v_item->>'expiry_date')::DATE;
        v_qty := (v_item->>'quantity')::INT;
        v_cost_price := (v_item->>'cost_price')::BIGINT;
        v_selling_price := (v_item->>'selling_price')::BIGINT;

        SELECT id, quantity INTO v_existing_batch_id, v_current_stock
        FROM public.inventory_batches
        WHERE pharmacy_id = p_pharmacy_id
          AND branch_id = p_branch_id
          AND product_id = v_product_id
          AND batch_number = v_batch_number
        FOR UPDATE;

        IF FOUND THEN
            v_batch_id := v_existing_batch_id;
            v_new_stock := v_current_stock + v_qty;

            UPDATE public.inventory_batches
            SET quantity = v_new_stock,
                cost_price = v_cost_price,
                selling_price = v_selling_price,
                expiry_date = v_expiry_date,
                updated_at = v_timestamp
            WHERE id = v_batch_id;
        ELSE
            v_batch_id := gen_random_uuid();
            v_new_stock := v_qty;

            INSERT INTO public.inventory_batches (
                id, pharmacy_id, branch_id, product_id, batch_number,
                expiry_date, quantity, cost_price, selling_price,
                created_at, updated_at
            ) VALUES (
                v_batch_id, p_pharmacy_id, p_branch_id, v_product_id, v_batch_number,
                v_expiry_date, v_new_stock, v_cost_price, v_selling_price,
                v_timestamp, v_timestamp
            );
        END IF;

        INSERT INTO public.purchase_items (
            id, pharmacy_id, purchase_id, product_id, batch_id,
            batch_number, expiry_date, quantity, cost_price, selling_price,
            created_at
        ) VALUES (
            gen_random_uuid(), p_pharmacy_id, v_purchase_id, v_product_id, v_batch_id,
            v_batch_number, v_expiry_date, v_qty, v_cost_price, v_selling_price,
            v_timestamp
        );

        v_ledger_id := gen_random_uuid();
        INSERT INTO public.stock_ledger (
            id, pharmacy_id, branch_id, product_id, batch_id,
            movement_type, quantity_delta, resulting_batch_stock,
            reference_id, notes, created_at
        ) VALUES (
            v_ledger_id, p_pharmacy_id, p_branch_id, v_product_id, v_batch_id,
            'PURCHASE', v_qty, v_new_stock,
            v_purchase_id, 'Stock intake receipt: ' || COALESCE(p_invoice_number, 'DIRECT'),
            v_timestamp
        );

        v_item_count := v_item_count + 1;
    END LOOP;

    -- 11. Audit Logging
    INSERT INTO public.audit_logs (
        pharmacy_id, actor_id, actor_type, action,
        target_entity, target_id, new_data, created_at
    ) VALUES (
        p_pharmacy_id, auth.uid(), 'USER', 'INVENTORY_STOCK_RECEIVED',
        'purchases', v_purchase_id::TEXT,
        jsonb_build_object(
            'branch_id', p_branch_id,
            'supplier_id', p_supplier_id,
            'invoice_number', p_invoice_number,
            'total_items', v_item_count,
            'total_cost', v_calc_total_cost,
            'client_op_id', p_client_op_id
        ),
        v_timestamp
    );

    purchase_id := v_purchase_id;
    status := 'RECEIVED';
    total_items := v_item_count;
    total_cost := v_calc_total_cost;
    processed_at := v_timestamp;
    RETURN NEXT;
END;
$$;

ALTER FUNCTION public.rpc_receive_inventory_stock(UUID, UUID, JSONB, UUID, TEXT, TEXT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_receive_inventory_stock(UUID, UUID, JSONB, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_receive_inventory_stock(UUID, UUID, JSONB, UUID, TEXT, TEXT, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. OPERATIONAL RPC 5: rpc_adjust_inventory_stock (Stock Adjustment)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_adjust_inventory_stock(
    p_pharmacy_id UUID,
    p_branch_id UUID,
    p_product_id UUID,
    p_batch_id UUID,
    p_direction VARCHAR(16),
    p_quantity INT,
    p_reason VARCHAR(64),
    p_client_op_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
    adjustment_id UUID,
    batch_id UUID,
    previous_quantity INT,
    adjustment_quantity INT,
    resulting_quantity INT,
    adjusted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_timestamp TIMESTAMPTZ := timezone('utc', now());
    v_adjustment_id UUID := gen_random_uuid();
    v_clean_direction VARCHAR(16);
    v_clean_reason VARCHAR(64);
    v_clean_notes TEXT;
    v_signed_delta INT;
    v_current_stock INT;
    v_new_stock INT;
    v_batch_status VARCHAR(16);
    v_incoming_payload_hash TEXT;
    v_existing_id UUID;
    v_existing_batch_id UUID;
    v_existing_prev_stock INT;
    v_existing_qty_delta INT;
    v_existing_res_stock INT;
    v_existing_created_at TIMESTAMPTZ;
    v_existing_payload_hash TEXT;
BEGIN
    -- 1. Attest Caller Authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Unauthenticated caller.' USING ERRCODE = '28000';
    END IF;

    -- 2. Verify Mandatory client_op_id
    IF p_client_op_id IS NULL THEN
        RAISE EXCEPTION 'CLIENT_OP_REQUIRED: client_op_id is mandatory for authoritative stock adjustments.' USING ERRCODE = '22023';
    END IF;

    -- 3. Verify Active Pharmacy Membership
    IF NOT EXISTS (
        SELECT 1 FROM public.pharmacy_members
        WHERE user_id = auth.uid() AND pharmacy_id = p_pharmacy_id AND status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_PHARMACY: Caller not active in pharmacy.' USING ERRCODE = '42501';
    END IF;

    -- 4. Verify Role Authorization: Caller must possess 'inventory.adjust' or 'inventory.write'
    IF NOT (
        public.has_pharmacy_permission(p_pharmacy_id, 'inventory.adjust') OR
        public.has_pharmacy_permission(p_pharmacy_id, 'inventory.write')
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_PERMISSION: Caller lacks inventory.adjust or inventory.write permission.' USING ERRCODE = '42501';
    END IF;

    -- 5. Canonical Direction & Quantity Enforcement
    v_clean_direction := upper(trim(p_direction));
    IF v_clean_direction NOT IN ('INCREASE', 'DECREASE') THEN
        RAISE EXCEPTION 'INVALID_DIRECTION: Direction must be INCREASE or DECREASE.' USING ERRCODE = '22023';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_QUANTITY: Adjustment quantity must be a positive integer, got %.', p_quantity USING ERRCODE = '22003';
    END IF;

    -- 6. Server-Side Structured Reason Validation
    v_clean_reason := upper(trim(p_reason));
    IF v_clean_reason NOT IN ('COUNT_DISCREPANCY', 'DAMAGED', 'EXPIRED', 'RECEIVED_CORRECTION', 'THEFT', 'OTHER') THEN
        RAISE EXCEPTION 'INVALID_REASON: Reason must be one of COUNT_DISCREPANCY, DAMAGED, EXPIRED, RECEIVED_CORRECTION, THEFT, OTHER.' USING ERRCODE = '22023';
    END IF;

    v_clean_notes := COALESCE(trim(p_notes), '');

    -- 7. Deterministic Canonical Payload Hash
    SELECT encode(sha256(
        jsonb_build_object(
            'batch_id', lower(p_batch_id::TEXT),
            'branch_id', lower(p_branch_id::TEXT),
            'direction', v_clean_direction,
            'notes', v_clean_notes,
            'pharmacy_id', lower(p_pharmacy_id::TEXT),
            'product_id', lower(p_product_id::TEXT),
            'quantity', p_quantity,
            'reason', v_clean_reason
        )::TEXT::bytea
    ), 'hex')
    INTO v_incoming_payload_hash;

    -- 0. Server-Authoritative Entitlement Assertion
    PERFORM public.assert_pharmacy_mutation_entitled_v1(
        p_pharmacy_id,
        'STOCK_ADJUST',
        p_client_op_id,
        v_incoming_payload_hash
    );

    -- 8. Idempotency Check
    SELECT a.id, a.batch_id, a.previous_stock, a.quantity_delta, a.resulting_stock, a.created_at, a.payload_hash
    INTO v_existing_id, v_existing_batch_id, v_existing_prev_stock, v_existing_qty_delta, v_existing_res_stock, v_existing_created_at, v_existing_payload_hash
    FROM public.stock_adjustments a
    WHERE a.pharmacy_id = p_pharmacy_id AND a.client_op_id = p_client_op_id;

    IF FOUND THEN
        IF v_existing_payload_hash != v_incoming_payload_hash THEN
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: client_op_id % already processed with divergent payload.', p_client_op_id
                USING ERRCODE = '23505';
        END IF;

        RETURN QUERY SELECT v_existing_id, v_existing_batch_id, v_existing_prev_stock, v_existing_qty_delta, v_existing_res_stock, v_existing_created_at;
        RETURN;
    END IF;

    -- 9. Validate Branch Belongs to Requested Pharmacy
    IF NOT EXISTS (
        SELECT 1 FROM public.branches
        WHERE id = p_branch_id AND pharmacy_id = p_pharmacy_id
    ) THEN
        RAISE EXCEPTION 'BRANCH_NOT_FOUND: Branch % does not belong to pharmacy %', p_branch_id, p_pharmacy_id USING ERRCODE = '23503';
    END IF;

    -- 10. Concurrency Safety: Lock Target Batch Row
    SELECT quantity, status INTO v_current_stock, v_batch_status
    FROM public.inventory_batches
    WHERE id = p_batch_id
      AND pharmacy_id = p_pharmacy_id
      AND branch_id = p_branch_id
      AND product_id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'BATCH_NOT_FOUND: Target batch % does not exist for product % in branch % of pharmacy %',
            p_batch_id, p_product_id, p_branch_id, p_pharmacy_id USING ERRCODE = '02000';
    END IF;

    -- 11. Compute Direction-Signed Delta and Resulting Stock
    IF v_clean_direction = 'INCREASE' THEN
        v_signed_delta := p_quantity;
    ELSE
        v_signed_delta := -p_quantity;
    END IF;

    v_new_stock := v_current_stock + v_signed_delta;

    -- Floor Protection: Resulting quantity cannot drop below zero
    IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Adjustment would result in negative stock (%) from current quantity (%).',
            v_new_stock, v_current_stock USING ERRCODE = '22003';
    END IF;

    -- 12. Update Batch Quantity
    UPDATE public.inventory_batches
    SET quantity = v_new_stock,
        updated_at = v_timestamp
    WHERE id = p_batch_id;

    -- 13. Insert Immutable Adjustment Audit Record
    INSERT INTO public.stock_adjustments (
        id, pharmacy_id, branch_id, product_id, batch_id,
        direction, previous_stock, quantity_delta, resulting_stock,
        reason, notes, client_op_id, payload_hash, adjusted_by, created_at
    ) VALUES (
        v_adjustment_id, p_pharmacy_id, p_branch_id, p_product_id, p_batch_id,
        v_clean_direction, v_current_stock, v_signed_delta, v_new_stock,
        v_clean_reason, v_clean_notes, p_client_op_id, v_incoming_payload_hash,
        auth.uid(), v_timestamp
    );

    -- 14. Append Movement to Unified Immutable Stock Ledger
    INSERT INTO public.stock_ledger (
        id, pharmacy_id, branch_id, product_id, batch_id,
        movement_type, quantity_delta, resulting_batch_stock,
        reference_id, notes, created_at
    ) VALUES (
        gen_random_uuid(), p_pharmacy_id, p_branch_id, p_product_id, p_batch_id,
        'ADJUSTMENT', v_signed_delta, v_new_stock,
        v_adjustment_id, 'Stock adjustment (' || v_clean_reason || '): ' || v_clean_notes,
        v_timestamp
    );

    -- 15. Audit Logging
    INSERT INTO public.audit_logs (
        pharmacy_id, actor_id, actor_type, action,
        target_entity, target_id, new_data, created_at
    ) VALUES (
        p_pharmacy_id, auth.uid(), 'USER', 'INVENTORY_STOCK_ADJUSTED',
        'stock_adjustments', v_adjustment_id::TEXT,
        jsonb_build_object(
            'branch_id', p_branch_id,
            'product_id', p_product_id,
            'batch_id', p_batch_id,
            'direction', v_clean_direction,
            'previous_stock', v_current_stock,
            'quantity_delta', v_signed_delta,
            'resulting_stock', v_new_stock,
            'reason', v_clean_reason,
            'client_op_id', p_client_op_id
        ),
        v_timestamp
    );

    adjustment_id := v_adjustment_id;
    batch_id := p_batch_id;
    previous_quantity := v_current_stock;
    adjustment_quantity := v_signed_delta;
    resulting_quantity := v_new_stock;
    adjusted_at := v_timestamp;
    RETURN NEXT;
END;
$$;

ALTER FUNCTION public.rpc_adjust_inventory_stock(UUID, UUID, UUID, UUID, VARCHAR, INT, VARCHAR, UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_adjust_inventory_stock FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_inventory_stock TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. OPERATIONAL RPC 6: rpc_dispatch_stock_transfer (Transfer Dispatch)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_dispatch_stock_transfer(
    p_pharmacy_id UUID,
    p_source_branch_id UUID,
    p_destination_branch_id UUID,
    p_items JSONB,
    p_client_op_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
    transfer_id UUID,
    status VARCHAR(16),
    total_items INT,
    dispatched_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_timestamp TIMESTAMPTZ := timezone('utc', now());
    v_transfer_id UUID := gen_random_uuid();
    v_incoming_payload_hash TEXT;
    v_clean_notes TEXT;
    v_total_items INT;
    v_item RECORD;
    v_source_current_stock INT;
    v_source_new_stock INT;
    v_batch_number VARCHAR(64);
    v_expiry_date DATE;
    v_cost_price BIGINT;
    v_selling_price BIGINT;
    v_batch_status VARCHAR(16);
    v_existing_id UUID;
    v_existing_status VARCHAR(16);
    v_existing_total_items INT;
    v_existing_dispatched_at TIMESTAMPTZ;
    v_existing_payload_hash TEXT;
BEGIN
    -- 1. Attest Caller Authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Unauthenticated caller.' USING ERRCODE = '28000';
    END IF;

    -- 2. Verify Mandatory client_op_id
    IF p_client_op_id IS NULL THEN
        RAISE EXCEPTION 'CLIENT_OP_REQUIRED: client_op_id is mandatory for stock transfer dispatch.' USING ERRCODE = '22023';
    END IF;

    -- 3. Verify Active Pharmacy Membership
    IF NOT EXISTS (
        SELECT 1 FROM public.pharmacy_members
        WHERE user_id = auth.uid() AND pharmacy_id = p_pharmacy_id AND status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_PHARMACY: Caller not active in pharmacy.' USING ERRCODE = '42501';
    END IF;

    -- 4. Verify Branch Assignment Authorization: Caller must belong to source branch OR be OWNER/MANAGER
    IF NOT (
        public.is_pharmacy_role(p_pharmacy_id, 'OWNER') OR
        public.is_pharmacy_role(p_pharmacy_id, 'MANAGER') OR
        EXISTS (
            SELECT 1 FROM public.pharmacy_members
            WHERE user_id = auth.uid() AND pharmacy_id = p_pharmacy_id AND default_branch_id = p_source_branch_id AND status = 'ACTIVE'
        )
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_BRANCH_ACCESS: Caller does not have operational authority in source branch %.', p_source_branch_id
            USING ERRCODE = '42501';
    END IF;

    -- 5. Validate Inter-Branch Constraint: Source and Destination must be distinct
    IF p_source_branch_id = p_destination_branch_id THEN
        RAISE EXCEPTION 'IDENTICAL_BRANCHES: Stock transfer source and destination branches must be distinct.' USING ERRCODE = '22023';
    END IF;

    -- 6. Validate Branches Belong to Pharmacy
    IF NOT EXISTS (
        SELECT 1 FROM public.branches WHERE id = p_source_branch_id AND pharmacy_id = p_pharmacy_id
    ) THEN
        RAISE EXCEPTION 'SOURCE_BRANCH_NOT_FOUND: Source branch % does not belong to pharmacy %', p_source_branch_id, p_pharmacy_id
            USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.branches WHERE id = p_destination_branch_id AND pharmacy_id = p_pharmacy_id
    ) THEN
        RAISE EXCEPTION 'DESTINATION_BRANCH_NOT_FOUND: Destination branch % does not belong to pharmacy %', p_destination_branch_id, p_pharmacy_id
            USING ERRCODE = '23503';
    END IF;

    v_clean_notes := COALESCE(trim(p_notes), '');

    -- 7. Deterministic Canonical Payload Hash
    SELECT encode(sha256(
        jsonb_build_object(
            'client_op_id', lower(p_client_op_id::TEXT),
            'destination_branch_id', lower(p_destination_branch_id::TEXT),
            'items', p_items,
            'notes', v_clean_notes,
            'pharmacy_id', lower(p_pharmacy_id::TEXT),
            'source_branch_id', lower(p_source_branch_id::TEXT)
        )::TEXT::bytea
    ), 'hex')
    INTO v_incoming_payload_hash;

    -- 0. Server-Authoritative Entitlement Assertion
    PERFORM public.assert_pharmacy_mutation_entitled_v1(
        p_pharmacy_id,
        'TRANSFER_DISPATCH',
        p_client_op_id,
        v_incoming_payload_hash
    );

    -- 8. Idempotency Check on dispatch_client_op_id
    SELECT t.id, t.status, t.dispatched_at, t.dispatch_payload_hash,
           (SELECT COUNT(*)::INT FROM public.stock_transfer_items WHERE transfer_id = t.id)
    INTO v_existing_id, v_existing_status, v_existing_dispatched_at, v_existing_payload_hash, v_existing_total_items
    FROM public.stock_transfers t
    WHERE t.pharmacy_id = p_pharmacy_id AND t.dispatch_client_op_id = p_client_op_id;

    IF FOUND THEN
        IF v_existing_payload_hash <> v_incoming_payload_hash THEN
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: dispatch_client_op_id % already processed with divergent payload.', p_client_op_id
                USING ERRCODE = '23505';
        END IF;

        RETURN QUERY SELECT v_existing_id, v_existing_status, v_existing_total_items, v_existing_dispatched_at;
        RETURN;
    END IF;

    -- 9. Insert Transfer Record in DISPATCHED status
    INSERT INTO public.stock_transfers (
        id, pharmacy_id, source_branch_id, destination_branch_id,
        status, dispatch_client_op_id, dispatch_payload_hash,
        dispatched_by, dispatched_at, notes, created_at, updated_at
    ) VALUES (
        v_transfer_id, p_pharmacy_id, p_source_branch_id, p_destination_branch_id,
        'DISPATCHED', p_client_op_id, v_incoming_payload_hash,
        auth.uid(), v_timestamp, v_clean_notes, v_timestamp, v_timestamp
    );

    -- 10. Process and Lock Source Batches, Deduct Inventory, Write Transfer Items
    v_total_items := 0;
    FOR v_item IN
        SELECT
            (elem->>'product_id')::UUID AS product_id,
            (elem->>'source_batch_id')::UUID AS source_batch_id,
            (elem->>'quantity')::INT AS quantity
        FROM jsonb_array_elements(p_items) AS elem
        ORDER BY (elem->>'source_batch_id')::UUID
    LOOP
        SELECT quantity, batch_number, expiry_date, cost_price, selling_price, status
        INTO v_source_current_stock, v_batch_number, v_expiry_date, v_cost_price, v_selling_price, v_batch_status
        FROM public.inventory_batches
        WHERE id = v_item.source_batch_id
          AND pharmacy_id = p_pharmacy_id
          AND branch_id = p_source_branch_id
          AND product_id = v_item.product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'SOURCE_BATCH_NOT_FOUND: Source batch % for product % not found in source branch %.',
                v_item.source_batch_id, v_item.product_id, p_source_branch_id USING ERRCODE = '02000';
        END IF;

        IF v_source_current_stock < v_item.quantity THEN
            RAISE EXCEPTION 'INSUFFICIENT_SOURCE_STOCK: Batch % has % available, requested % for transfer.',
                v_batch_number, v_source_current_stock, v_item.quantity USING ERRCODE = '22003';
        END IF;

        v_source_new_stock := v_source_current_stock - v_item.quantity;

        UPDATE public.inventory_batches
        SET quantity = v_source_new_stock,
            updated_at = v_timestamp
        WHERE id = v_item.source_batch_id;

        INSERT INTO public.stock_transfer_items (
            id, pharmacy_id, transfer_id, product_id,
            source_batch_id, batch_number, expiry_date,
            quantity, cost_price, selling_price, created_at
        ) VALUES (
            gen_random_uuid(), p_pharmacy_id, v_transfer_id, v_item.product_id,
            v_item.source_batch_id, v_batch_number, v_expiry_date,
            v_item.quantity, v_cost_price, v_selling_price, v_timestamp
        );

        INSERT INTO public.stock_ledger (
            id, pharmacy_id, branch_id, product_id, batch_id,
            movement_type, quantity_delta, resulting_batch_stock,
            reference_id, notes, created_at
        ) VALUES (
            gen_random_uuid(), p_pharmacy_id, p_source_branch_id, v_item.product_id, v_item.source_batch_id,
            'TRANSFER_OUT', -v_item.quantity, v_source_new_stock,
            v_transfer_id, 'Stock transfer dispatched to branch ' || p_destination_branch_id::TEXT,
            v_timestamp
        );

        v_total_items := v_total_items + 1;
    END LOOP;

    -- 11. Audit Logging
    INSERT INTO public.audit_logs (
        pharmacy_id, actor_id, actor_type, action,
        target_entity, target_id, new_data, created_at
    ) VALUES (
        p_pharmacy_id, auth.uid(), 'USER', 'STOCK_TRANSFER_DISPATCHED',
        'stock_transfers', v_transfer_id::TEXT,
        jsonb_build_object(
            'source_branch_id', p_source_branch_id,
            'destination_branch_id', p_destination_branch_id,
            'total_items', v_total_items,
            'dispatch_client_op_id', p_client_op_id
        ),
        v_timestamp
    );

    transfer_id := v_transfer_id;
    status := 'DISPATCHED';
    total_items := v_total_items;
    dispatched_at := v_timestamp;
    RETURN NEXT;
END;
$$;

ALTER FUNCTION public.rpc_dispatch_stock_transfer(UUID, UUID, UUID, JSONB, UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_dispatch_stock_transfer FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_dispatch_stock_transfer TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. OPERATIONAL RPC 7: rpc_receive_stock_transfer (Transfer Receipt)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_receive_stock_transfer(
    p_pharmacy_id UUID,
    p_transfer_id UUID,
    p_client_op_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
    transfer_id UUID,
    status VARCHAR(16),
    total_items INT,
    received_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_timestamp TIMESTAMPTZ := timezone('utc', now());
    v_incoming_payload_hash TEXT;
    v_clean_notes TEXT;
    v_transfer_id UUID;
    v_source_branch_id UUID;
    v_dest_branch_id UUID;
    v_current_status VARCHAR(16);
    v_total_items INT;
    v_existing_received_at TIMESTAMPTZ;
    v_existing_rec_op_id UUID;
    v_existing_rec_hash TEXT;
    v_item RECORD;
    v_dest_batch_id UUID;
    v_dest_current_stock INT;
    v_dest_new_stock INT;
    v_dest_expiry DATE;
    v_dest_cost BIGINT;
    v_dest_selling BIGINT;
    v_dest_status VARCHAR(16);
BEGIN
    -- 1. Attest Caller Authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Unauthenticated caller.' USING ERRCODE = '28000';
    END IF;

    -- 2. Verify Mandatory client_op_id
    IF p_client_op_id IS NULL THEN
        RAISE EXCEPTION 'CLIENT_OP_REQUIRED: client_op_id is mandatory for stock transfer receipt.' USING ERRCODE = '22023';
    END IF;

    -- 3. Verify Active Pharmacy Membership
    IF NOT EXISTS (
        SELECT 1 FROM public.pharmacy_members
        WHERE user_id = auth.uid() AND pharmacy_id = p_pharmacy_id AND status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_PHARMACY: Caller not active in pharmacy.' USING ERRCODE = '42501';
    END IF;

    -- 4. Lock and Validate Transfer Record
    SELECT t.id, t.source_branch_id, t.destination_branch_id, t.status,
           t.received_at, t.receive_client_op_id, t.receive_payload_hash,
           (SELECT COUNT(*)::INT FROM public.stock_transfer_items WHERE transfer_id = t.id)
    INTO v_transfer_id, v_source_branch_id, v_dest_branch_id, v_current_status,
         v_existing_received_at, v_existing_rec_op_id, v_existing_rec_hash, v_total_items
    FROM public.stock_transfers t
    WHERE t.id = p_transfer_id AND t.pharmacy_id = p_pharmacy_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TRANSFER_NOT_FOUND: Stock transfer % does not exist in pharmacy %.', p_transfer_id, p_pharmacy_id
            USING ERRCODE = '02000';
    END IF;

    -- 5. Verify Destination Branch Authority
    IF NOT (
        public.is_pharmacy_role(p_pharmacy_id, 'OWNER') OR
        public.is_pharmacy_role(p_pharmacy_id, 'MANAGER') OR
        EXISTS (
            SELECT 1 FROM public.pharmacy_members
            WHERE user_id = auth.uid() AND pharmacy_id = p_pharmacy_id AND default_branch_id = v_dest_branch_id AND status = 'ACTIVE'
        )
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_BRANCH_ACCESS: Caller does not have operational authority in destination branch %.', v_dest_branch_id
            USING ERRCODE = '42501';
    END IF;

    v_clean_notes := COALESCE(trim(p_notes), '');

    -- 6. Deterministic Canonical Payload Hash
    SELECT encode(sha256(
        jsonb_build_object(
            'client_op_id', lower(p_client_op_id::TEXT),
            'notes', v_clean_notes,
            'pharmacy_id', lower(p_pharmacy_id::TEXT),
            'transfer_id', lower(p_transfer_id::TEXT)
        )::TEXT::bytea
    ), 'hex')
    INTO v_incoming_payload_hash;

    -- 0. Server-Authoritative Entitlement Assertion
    PERFORM public.assert_pharmacy_mutation_entitled_v1(
        p_pharmacy_id,
        'TRANSFER_RECEIVE',
        p_client_op_id,
        v_incoming_payload_hash
    );

    -- 7. Idempotency Check on receive_client_op_id
    IF v_current_status = 'RECEIVED' THEN
        IF v_existing_rec_op_id = p_client_op_id THEN
            IF v_existing_rec_hash <> v_incoming_payload_hash THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: receive_client_op_id % already processed with divergent payload.', p_client_op_id
                    USING ERRCODE = '23505';
            END IF;

            RETURN QUERY SELECT v_transfer_id, 'RECEIVED'::VARCHAR(16), v_total_items, v_existing_received_at;
            RETURN;
        ELSE
            RAISE EXCEPTION 'TRANSFER_ALREADY_RECEIVED: Stock transfer % is already in RECEIVED status.', p_transfer_id
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF v_current_status <> 'DISPATCHED' THEN
        RAISE EXCEPTION 'INVALID_TRANSFER_STATUS: Transfer % is in status %, expected DISPATCHED.', p_transfer_id, v_current_status
            USING ERRCODE = '22023';
    END IF;

    -- 8. Ingest Inventory at Destination Branch
    FOR v_item IN
        SELECT
            sti.id AS item_id,
            sti.product_id,
            sti.batch_number,
            sti.expiry_date,
            sti.quantity,
            sti.cost_price,
            sti.selling_price
        FROM public.stock_transfer_items sti
        WHERE sti.transfer_id = p_transfer_id
        ORDER BY sti.batch_number, sti.product_id
    LOOP
        SELECT id, quantity, expiry_date, cost_price, selling_price, status
        INTO v_dest_batch_id, v_dest_current_stock, v_dest_expiry, v_dest_cost, v_dest_selling, v_dest_status
        FROM public.inventory_batches
        WHERE pharmacy_id = p_pharmacy_id
          AND branch_id = v_dest_branch_id
          AND product_id = v_item.product_id
          AND batch_number = v_item.batch_number
        FOR UPDATE;

        IF FOUND THEN
            v_dest_new_stock := v_dest_current_stock + v_item.quantity;

            UPDATE public.inventory_batches
            SET quantity = v_dest_new_stock,
                cost_price = v_item.cost_price,
                selling_price = v_item.selling_price,
                expiry_date = v_item.expiry_date,
                updated_at = v_timestamp
            WHERE id = v_dest_batch_id;
        ELSE
            v_dest_batch_id := gen_random_uuid();
            v_dest_new_stock := v_item.quantity;

            INSERT INTO public.inventory_batches (
                id, pharmacy_id, branch_id, product_id, batch_number,
                expiry_date, quantity, cost_price, selling_price,
                created_at, updated_at
            ) VALUES (
                v_dest_batch_id, p_pharmacy_id, v_dest_branch_id, v_item.product_id, v_item.batch_number,
                v_item.expiry_date, v_dest_new_stock, v_item.cost_price, v_item.selling_price,
                v_timestamp, v_timestamp
            );
        END IF;

        UPDATE public.stock_transfer_items
        SET destination_batch_id = v_dest_batch_id
        WHERE id = v_item.item_id;

        INSERT INTO public.stock_ledger (
            id, pharmacy_id, branch_id, product_id, batch_id,
            movement_type, quantity_delta, resulting_batch_stock,
            reference_id, notes, created_at
        ) VALUES (
            gen_random_uuid(), p_pharmacy_id, v_dest_branch_id, v_item.product_id, v_dest_batch_id,
            'TRANSFER_IN', v_item.quantity, v_dest_new_stock,
            p_transfer_id, 'Stock transfer received from branch ' || v_source_branch_id::TEXT,
            v_timestamp
        );
    END LOOP;

    -- 9. Update Transfer Record to RECEIVED
    UPDATE public.stock_transfers
    SET status = 'RECEIVED',
        receive_client_op_id = p_client_op_id,
        receive_payload_hash = v_incoming_payload_hash,
        received_by = auth.uid(),
        received_at = v_timestamp,
        notes = CASE
            WHEN length(v_clean_notes) > 0 THEN COALESCE(notes || '; ', '') || 'Receipt notes: ' || v_clean_notes
            ELSE notes
        END,
        updated_at = v_timestamp
    WHERE id = p_transfer_id;

    -- 10. Audit Logging
    INSERT INTO public.audit_logs (
        pharmacy_id, actor_id, actor_type, action,
        target_entity, target_id, new_data, created_at
    ) VALUES (
        p_pharmacy_id, auth.uid(), 'USER', 'STOCK_TRANSFER_RECEIVED',
        'stock_transfers', p_transfer_id::TEXT,
        jsonb_build_object(
            'source_branch_id', v_source_branch_id,
            'destination_branch_id', v_dest_branch_id,
            'total_items', v_total_items,
            'receive_client_op_id', p_client_op_id
        ),
        v_timestamp
    );

    transfer_id := p_transfer_id;
    status := 'RECEIVED';
    total_items := v_total_items;
    received_at := v_timestamp;
    RETURN NEXT;
END;
$$;

ALTER FUNCTION public.rpc_receive_stock_transfer(UUID, UUID, UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_receive_stock_transfer FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_receive_stock_transfer TO authenticated;

-- ----------------------------------------------------------------------------
-- 10. OPERATIONAL RPC 8: Staff Management RPCs (Authoritative Entitlement Wireup)
-- ----------------------------------------------------------------------------

-- RPC 8A: rpc_create_staff_invitation
CREATE OR REPLACE FUNCTION public.rpc_create_staff_invitation(
    p_pharmacy_id UUID,
    p_branch_id UUID,
    p_email TEXT,
    p_role VARCHAR(32)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role VARCHAR(32);
    v_norm_email TEXT;
    v_max_seats INT;
    v_active_seats INT;
    v_pending_seats INT;
    v_invitation_id UUID;
    v_raw_token TEXT;
    v_token_hash TEXT;
    v_expires_at TIMESTAMPTZ := now() + INTERVAL '7 days';
    r_old_inv RECORD;
    v_effective_entitlement JSONB;
BEGIN
    -- 0. Server-Authoritative Entitlement Assertion
    PERFORM public.assert_pharmacy_mutation_entitled_v1(
        p_pharmacy_id,
        'STAFF_INVITE'
    );

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_email IS NULL OR trim(p_email) = '' OR position('@' in p_email) < 2 THEN
        RAISE EXCEPTION 'Invalid email address: %', p_email USING ERRCODE = '22023';
    END IF;
    v_norm_email := lower(trim(p_email));

    IF p_role = 'OWNER' THEN
        RAISE EXCEPTION 'Ownership transfer and owner invitations are deferred and prohibited' USING ERRCODE = '0A000';
    END IF;
    IF p_role NOT IN ('MANAGER', 'PHARMACIST', 'CASHIER') THEN
        RAISE EXCEPTION 'Invalid role: %', p_role USING ERRCODE = '22023';
    END IF;

    -- Canonical Lock Order: Level 1 -> public.pharmacies
    PERFORM id FROM public.pharmacies WHERE id = p_pharmacy_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pharmacy % not found', p_pharmacy_id USING ERRCODE = 'P0002';
    END IF;

    -- Verify caller active membership
    SELECT role INTO v_caller_role
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND user_id = v_caller_id AND status = 'ACTIVE';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller lacks active membership in pharmacy %', p_pharmacy_id USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'OWNER' THEN
        NULL;
    ELSIF v_caller_role = 'MANAGER' THEN
        IF p_role NOT IN ('PHARMACIST', 'CASHIER') THEN
            RAISE EXCEPTION 'MANAGER cannot invite role %', p_role USING ERRCODE = '42501';
        END IF;
    ELSE
        RAISE EXCEPTION 'Insufficient permissions to invite staff' USING ERRCODE = '42501';
    END IF;

    -- Canonical Lock Order: Level 2 -> public.branches (if specified)
    IF p_branch_id IS NOT NULL THEN
        PERFORM id FROM public.branches WHERE id = p_branch_id AND pharmacy_id = p_pharmacy_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Branch % does not belong to pharmacy %', p_branch_id, p_pharmacy_id USING ERRCODE = '23503';
        END IF;
    END IF;

    -- Authoritative Subscription & Seat Verification
    v_effective_entitlement := public.rpc_get_effective_entitlement_v1(p_pharmacy_id);
    IF (v_effective_entitlement->>'mutations_allowed')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'Subscription is ineligible (state: %). Staff invitations require an active subscription or valid grace period.'
            , v_effective_entitlement->>'state' USING ERRCODE = '54000';
    END IF;

    SELECT sp.max_staff INTO v_max_seats
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.code = s.plan_code
    WHERE s.pharmacy_id = p_pharmacy_id;

    IF NOT FOUND OR v_max_seats IS NULL OR v_max_seats < 1 THEN
        RAISE EXCEPTION 'Subscription plan seat quota is invalid. Staff mutations blocked.' USING ERRCODE = '54000';
    END IF;

    -- Canonical Lock Order: Level 3 -> public.pharmacy_members
    PERFORM id FROM public.pharmacy_members WHERE pharmacy_id = p_pharmacy_id FOR UPDATE;

    IF EXISTS (
        SELECT 1
        FROM public.pharmacy_members pm
        JOIN auth.users u ON u.id = pm.user_id
        WHERE pm.pharmacy_id = p_pharmacy_id
          AND lower(u.email) = v_norm_email
          AND pm.status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'User with email % is already an active member of this pharmacy', v_norm_email
            USING ERRCODE = '23505';
    END IF;

    -- Canonical Lock Order: Level 4 -> public.staff_invitations
    PERFORM id FROM public.staff_invitations WHERE pharmacy_id = p_pharmacy_id FOR UPDATE;

    SELECT COUNT(*) INTO v_active_seats
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND status = 'ACTIVE';

    SELECT COUNT(*) INTO v_pending_seats
    FROM public.staff_invitations
    WHERE pharmacy_id = p_pharmacy_id AND status = 'PENDING' AND expires_at > now();

    IF (v_active_seats + v_pending_seats + 1) > v_max_seats THEN
        RAISE EXCEPTION 'Cannot invite: Pharmacy seat quota (%) exceeded. Current active: %, pending: %',
            v_max_seats, v_active_seats, v_pending_seats
            USING ERRCODE = '54000';
    END IF;

    SELECT id INTO r_old_inv
    FROM public.staff_invitations
    WHERE pharmacy_id = p_pharmacy_id
      AND lower(email) = v_norm_email
      AND status = 'PENDING'
      AND expires_at > now()
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.staff_invitations
        SET status = 'REVOKED', updated_at = now()
        WHERE id = r_old_inv.id;
    END IF;

    v_invitation_id := gen_random_uuid();
    v_raw_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(sha256(v_raw_token::bytea), 'hex');

    INSERT INTO public.staff_invitations (
        id, pharmacy_id, branch_id, email, role,
        token_hash, status, invited_by, expires_at, created_at, updated_at
    ) VALUES (
        v_invitation_id, p_pharmacy_id, p_branch_id, v_norm_email, p_role,
        v_token_hash, 'PENDING', v_caller_id, v_expires_at, now(), now()
    );

    RETURN jsonb_build_object(
        'invitation_id', v_invitation_id,
        'email', v_norm_email,
        'role', p_role,
        'branch_id', p_branch_id,
        'expires_at', v_expires_at,
        'raw_token', v_raw_token
    );
END;
$$;

ALTER FUNCTION public.rpc_create_staff_invitation(UUID, UUID, TEXT, VARCHAR) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_create_staff_invitation(UUID, UUID, TEXT, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_staff_invitation(UUID, UUID, TEXT, VARCHAR) TO authenticated;

-- RPC 8B: rpc_change_member_role
CREATE OR REPLACE FUNCTION public.rpc_change_member_role(
    p_pharmacy_id UUID,
    p_target_user_id UUID,
    p_new_role VARCHAR(32)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role VARCHAR(32);
    v_target_role VARCHAR(32);
    v_target_member_id UUID;
BEGIN
    -- 0. Server-Authoritative Entitlement Assertion
    PERFORM public.assert_pharmacy_mutation_entitled_v1(
        p_pharmacy_id,
        'STAFF_ROLE'
    );

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_new_role = 'OWNER' THEN
        RAISE EXCEPTION 'Ownership promotion is deferred and prohibited' USING ERRCODE = '0A000';
    END IF;
    IF p_new_role NOT IN ('MANAGER', 'PHARMACIST', 'CASHIER') THEN
        RAISE EXCEPTION 'Invalid role: %', p_new_role USING ERRCODE = '22023';
    END IF;

    PERFORM id FROM public.pharmacies WHERE id = p_pharmacy_id FOR UPDATE;

    SELECT role INTO v_caller_role
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND user_id = v_caller_id AND status = 'ACTIVE';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller lacks active membership in pharmacy %', p_pharmacy_id USING ERRCODE = '42501';
    END IF;

    SELECT id, role INTO v_target_member_id, v_target_role
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND user_id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target member not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_role = 'OWNER' THEN
        NULL;
    ELSIF v_caller_role = 'MANAGER' THEN
        IF v_target_role IN ('OWNER', 'MANAGER') THEN
            RAISE EXCEPTION 'MANAGER cannot change role of OWNER or MANAGER' USING ERRCODE = '42501';
        END IF;
        IF p_new_role NOT IN ('PHARMACIST', 'CASHIER') THEN
            RAISE EXCEPTION 'MANAGER can only assign PHARMACIST or CASHIER role' USING ERRCODE = '42501';
        END IF;
    ELSE
        RAISE EXCEPTION 'Insufficient permissions to change member role' USING ERRCODE = '42501';
    END IF;

    UPDATE public.pharmacy_members
    SET role = p_new_role, updated_at = now()
    WHERE id = v_target_member_id;
END;
$$;

ALTER FUNCTION public.rpc_change_member_role(UUID, UUID, VARCHAR) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_change_member_role FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_change_member_role TO authenticated;

-- RPC 8C: rpc_reactivate_pharmacy_member
CREATE OR REPLACE FUNCTION public.rpc_reactivate_pharmacy_member(
    p_pharmacy_id UUID,
    p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role VARCHAR(32);
    v_target_member RECORD;
    v_max_seats INT;
    v_active_seats INT;
    v_pending_seats INT;
    v_effective_entitlement JSONB;
BEGIN
    -- 0. Server-Authoritative Entitlement Assertion
    PERFORM public.assert_pharmacy_mutation_entitled_v1(
        p_pharmacy_id,
        'STAFF_REACTIVATE'
    );

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    PERFORM id FROM public.pharmacies WHERE id = p_pharmacy_id FOR UPDATE;

    SELECT role INTO v_caller_role
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND user_id = v_caller_id AND status = 'ACTIVE';

    IF NOT FOUND OR v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
        RAISE EXCEPTION 'Caller must be an active OWNER or MANAGER in pharmacy %', p_pharmacy_id USING ERRCODE = '42501';
    END IF;

    SELECT id, role, status INTO v_target_member
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND user_id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target member not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_role = 'MANAGER' AND v_target_member.role IN ('OWNER', 'MANAGER') THEN
        RAISE EXCEPTION 'MANAGER cannot reactivate OWNER or MANAGER' USING ERRCODE = '42501';
    END IF;

    IF v_target_member.status = 'ACTIVE' THEN
        RETURN;
    END IF;

    -- Authoritative Subscription & Seat Verification
    v_effective_entitlement := public.rpc_get_effective_entitlement_v1(p_pharmacy_id);
    IF (v_effective_entitlement->>'mutations_allowed')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'Subscription is ineligible (state: %). Reactivation requires an active subscription or valid grace period.'
            , v_effective_entitlement->>'state' USING ERRCODE = '54000';
    END IF;

    SELECT sp.max_staff INTO v_max_seats
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.code = s.plan_code
    WHERE s.pharmacy_id = p_pharmacy_id;

    IF NOT FOUND OR v_max_seats IS NULL OR v_max_seats < 1 THEN
        RAISE EXCEPTION 'Subscription plan seat quota is invalid. Staff mutations blocked.' USING ERRCODE = '54000';
    END IF;

    SELECT COUNT(*) INTO v_active_seats
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND status = 'ACTIVE';

    SELECT COUNT(*) INTO v_pending_seats
    FROM public.staff_invitations
    WHERE pharmacy_id = p_pharmacy_id AND status = 'PENDING' AND expires_at > now();

    IF (v_active_seats + v_pending_seats + 1) > v_max_seats THEN
        RAISE EXCEPTION 'Cannot reactivate member: Pharmacy seat quota (%) exceeded. Current active: %, pending: %',
            v_max_seats, v_active_seats, v_pending_seats
            USING ERRCODE = '54000';
    END IF;

    UPDATE public.pharmacy_members
    SET status = 'ACTIVE', updated_at = now()
    WHERE id = v_target_member.id;
END;
$$;

ALTER FUNCTION public.rpc_reactivate_pharmacy_member(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_reactivate_pharmacy_member FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reactivate_pharmacy_member TO authenticated;

-- RPC 8D: rpc_suspend_pharmacy_member
CREATE OR REPLACE FUNCTION public.rpc_suspend_pharmacy_member(
    p_pharmacy_id UUID,
    p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role VARCHAR(32);
    v_target_member RECORD;
BEGIN
    -- 0. Server-Authoritative Entitlement Assertion
    PERFORM public.assert_pharmacy_mutation_entitled_v1(
        p_pharmacy_id,
        'STAFF_SUSPEND'
    );

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    PERFORM id FROM public.pharmacies WHERE id = p_pharmacy_id FOR UPDATE;

    SELECT role INTO v_caller_role
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND user_id = v_caller_id AND status = 'ACTIVE';

    IF NOT FOUND OR v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
        RAISE EXCEPTION 'Caller must be an active OWNER or MANAGER in pharmacy %', p_pharmacy_id USING ERRCODE = '42501';
    END IF;

    SELECT id, role, status INTO v_target_member
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND user_id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target member not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_target_member.role = 'OWNER' THEN
        RAISE EXCEPTION 'Cannot suspend an OWNER' USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'MANAGER' AND v_target_member.role = 'MANAGER' THEN
        RAISE EXCEPTION 'MANAGER cannot suspend another MANAGER' USING ERRCODE = '42501';
    END IF;

    UPDATE public.pharmacy_members
    SET status = 'SUSPENDED', updated_at = now()
    WHERE id = v_target_member.id;
END;
$$;

ALTER FUNCTION public.rpc_suspend_pharmacy_member(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_suspend_pharmacy_member FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_suspend_pharmacy_member TO authenticated;


-- RPC 8E: rpc_accept_staff_invitation (Entitlement Hardened & Grace Window Compatible)
CREATE OR REPLACE FUNCTION public.rpc_accept_staff_invitation(
    p_invitation_id UUID,
    p_raw_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_email TEXT;
    v_email_confirmed TIMESTAMPTZ;
    v_computed_hash TEXT;
    v_pharmacy_id UUID;
    v_inv RECORD;
    v_existing_member RECORD;
    v_sub_status VARCHAR(24);
    v_sub_end TIMESTAMPTZ;
    v_max_seats INT;
    v_active_seats INT;
    v_pending_seats INT;
    v_member_id UUID;
    v_latest_anchor RECORD;
    v_latest_decision RECORD;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT email, email_confirmed_at INTO v_caller_email, v_email_confirmed
    FROM auth.users
    WHERE id = v_caller_id;

    IF v_caller_email IS NULL OR trim(v_caller_email) = '' THEN
        RAISE EXCEPTION 'Authenticated user email is missing or empty' USING ERRCODE = '42501';
    END IF;
    IF v_email_confirmed IS NULL THEN
        RAISE EXCEPTION 'Authenticated email must be confirmed before accepting invitation'
            USING ERRCODE = '42501';
    END IF;

    IF p_raw_token IS NULL OR trim(p_raw_token) = '' THEN
        RAISE EXCEPTION 'Invalid invitation token' USING ERRCODE = '42501';
    END IF;

    v_computed_hash := encode(sha256(p_raw_token::bytea), 'hex');

    -- Non-locking lookup to determine target pharmacy for canonical locking
    SELECT pharmacy_id INTO v_pharmacy_id
    FROM public.staff_invitations
    WHERE id = p_invitation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation % not found', p_invitation_id USING ERRCODE = 'P0002';
    END IF;

    -- Canonical Lock Order: Level 1 -> public.pharmacies
    PERFORM id FROM public.pharmacies WHERE id = v_pharmacy_id FOR UPDATE;

    -- Canonical Lock Order: Level 3 -> public.staff_invitations
    SELECT * INTO v_inv
    FROM public.staff_invitations
    WHERE id = p_invitation_id
    FOR UPDATE;

    -- Recheck state under lock
    IF v_inv.status = 'ACCEPTED' THEN
        RAISE EXCEPTION 'Invitation already accepted' USING ERRCODE = '23505';
    END IF;
    IF v_inv.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Invitation is not pending (status: %)', v_inv.status USING ERRCODE = 'P0002';
    END IF;

    IF v_inv.expires_at <= now() THEN
        -- Persist expired status so subsequent queries and replays reflect EXPIRED state
        UPDATE public.staff_invitations
        SET status = 'EXPIRED', updated_at = now()
        WHERE id = v_inv.id;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invitation has expired',
            'error_code', '22023',
            'invitation_id', v_inv.id,
            'status', 'EXPIRED'
        );
    END IF;

    IF v_inv.token_hash <> v_computed_hash THEN
        RAISE EXCEPTION 'Invalid invitation token' USING ERRCODE = '42501';
    END IF;

    IF lower(trim(v_caller_email)) IS DISTINCT FROM v_inv.email THEN
        RAISE EXCEPTION 'Authenticated caller email does not match invitation recipient'
            USING ERRCODE = '42501';
    END IF;

    IF v_inv.role = 'OWNER' THEN
        RAISE EXCEPTION 'Ownership invitation acceptance is prohibited' USING ERRCODE = '0A000';
    END IF;

    -- Check for administrative decisions / suspension in entitlement_administrative_decisions_v1
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'entitlement_administrative_decisions_v1'
    ) THEN
        SELECT d.decision_kind INTO v_latest_decision
        FROM public.entitlement_administrative_decisions_v1 d
        WHERE d.pharmacy_id = v_inv.pharmacy_id
        ORDER BY d.effective_at DESC, d.decision_sequence DESC, d.id DESC
        LIMIT 1;

        IF FOUND AND v_latest_decision.decision_kind IN ('SUSPEND', 'DENY_MUTATIONS') THEN
            RAISE EXCEPTION 'Administrative suspension active for pharmacy. Staff mutations blocked.'
                USING ERRCODE = '54000';
        END IF;
    END IF;

    -- Check for administrative suspension in pharmacy_entitlement_anchors
    SELECT a.status, a.mutations_allowed INTO v_latest_anchor
    FROM public.pharmacy_entitlement_anchors a
    WHERE a.pharmacy_id = v_inv.pharmacy_id
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 1;

    IF FOUND AND (v_latest_anchor.status = 'SUSPENDED' OR v_latest_anchor.mutations_allowed = FALSE) THEN
        RAISE EXCEPTION 'Administrative suspension active for pharmacy. Staff mutations blocked.'
            USING ERRCODE = '54000';
    END IF;

    -- Live Subscription & Seat Quota Verification (with approved 7-day grace window)
    SELECT s.status, s.current_period_end, sp.max_staff
    INTO v_sub_status, v_sub_end, v_max_seats
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.code = s.plan_code
    WHERE s.pharmacy_id = v_inv.pharmacy_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pharmacy lacks a subscription. Invitation acceptance requires an active subscription.'
            USING ERRCODE = '54000';
    ELSIF v_sub_status NOT IN ('TRIAL', 'ACTIVE') THEN
        RAISE EXCEPTION 'Subscription is ineligible (status: %). Invitation acceptance requires TRIAL or ACTIVE status.'
            , v_sub_status USING ERRCODE = '54000';
    ELSIF v_sub_end IS NULL OR v_sub_end + INTERVAL '7 days' <= now() THEN
        RAISE EXCEPTION 'Subscription period and approved grace window have ended (ended: %). Staff mutations require an active subscription.'
            , v_sub_end USING ERRCODE = '54000';
    ELSIF v_max_seats IS NULL OR v_max_seats < 1 THEN
        RAISE EXCEPTION 'Subscription plan seat quota is invalid (max_staff: %). Staff mutations blocked.'
            , v_max_seats USING ERRCODE = '54000';
    END IF;

    SELECT COUNT(*) INTO v_active_seats
    FROM public.pharmacy_members
    WHERE pharmacy_id = v_inv.pharmacy_id AND status = 'ACTIVE';

    -- Count other pending, unexpired invitations reserving seats (excluding this invitation being consumed)
    SELECT COUNT(*) INTO v_pending_seats
    FROM public.staff_invitations
    WHERE pharmacy_id = v_inv.pharmacy_id
      AND status = 'PENDING'
      AND expires_at > now()
      AND id <> v_inv.id;

    -- Canonical Lock Order: Level 4 -> public.pharmacy_members
    SELECT id, role, default_branch_id, status INTO v_existing_member
    FROM public.pharmacy_members
    WHERE pharmacy_id = v_inv.pharmacy_id AND user_id = v_caller_id
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing_member.role = 'OWNER' THEN
            RAISE EXCEPTION 'Cannot modify existing OWNER membership via invitation acceptance'
                USING ERRCODE = '42501';
        END IF;

        IF v_existing_member.status = 'SUSPENDED' THEN
            RAISE EXCEPTION 'Member is currently SUSPENDED. Reactivation must use rpc_reactivate_pharmacy_member.'
                USING ERRCODE = '42501';
        END IF;

        IF v_existing_member.status = 'ACTIVE' THEN
            IF v_existing_member.role = v_inv.role AND (v_existing_member.default_branch_id IS NOT DISTINCT FROM v_inv.branch_id) THEN
                v_member_id := v_existing_member.id;
            ELSE
                RAISE EXCEPTION 'Active member already exists with role % and branch %. Role changes must use rpc_change_member_role.',
                    v_existing_member.role, v_existing_member.default_branch_id USING ERRCODE = '42501';
            END IF;
        END IF;
    ELSE
        IF (v_active_seats + v_pending_seats + 1) > v_max_seats THEN
            RAISE EXCEPTION 'Pharmacy staff seat quota (%) exceeded. Active: %, Pending: %',
                v_max_seats, v_active_seats, v_pending_seats USING ERRCODE = '54000';
        END IF;

        INSERT INTO public.pharmacy_members (
            pharmacy_id,
            user_id,
            role,
            status,
            default_branch_id
        ) VALUES (
            v_inv.pharmacy_id,
            v_caller_id,
            v_inv.role,
            'ACTIVE',
            v_inv.branch_id
        ) RETURNING id INTO v_member_id;
    END IF;

    UPDATE public.staff_invitations
    SET status = 'ACCEPTED',
        accepted_at = now(),
        accepted_by = v_caller_id,
        updated_at = now()
    WHERE id = v_inv.id;

    RETURN jsonb_build_object(
        'success', true,
        'invitation_id', v_inv.id,
        'member_id', v_member_id,
        'pharmacy_id', v_inv.pharmacy_id,
        'role', v_inv.role,
        'status', 'ACTIVE'
    );
END;
$$;

ALTER FUNCTION public.rpc_accept_staff_invitation(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_accept_staff_invitation FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_accept_staff_invitation TO authenticated;

-- RPC 8F: rpc_revoke_staff_invitation (Entitlement Hardened)
CREATE OR REPLACE FUNCTION public.rpc_revoke_staff_invitation(
    p_invitation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role VARCHAR(32);
    v_pharmacy_id UUID;
    v_inv RECORD;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT pharmacy_id INTO v_pharmacy_id FROM public.staff_invitations WHERE id = p_invitation_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
    END IF;

    -- Canonical Lock Order: Level 1 -> pharmacies
    PERFORM id FROM public.pharmacies WHERE id = v_pharmacy_id FOR UPDATE;

    -- 0. Server-Authoritative Entitlement Assertion
    PERFORM public.assert_pharmacy_mutation_entitled_v1(
        v_pharmacy_id,
        'STAFF_REVOKE_INVITATION'
    );

    SELECT role INTO v_caller_role
    FROM public.pharmacy_members
    WHERE pharmacy_id = v_pharmacy_id AND user_id = v_caller_id AND status = 'ACTIVE';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller lacks active membership in pharmacy %', v_pharmacy_id USING ERRCODE = '42501';
    END IF;

    -- Canonical Lock Order: Level 3 -> staff_invitations
    SELECT * INTO v_inv FROM public.staff_invitations WHERE id = p_invitation_id FOR UPDATE;

    IF v_caller_role = 'OWNER' THEN
        NULL;
    ELSIF v_caller_role = 'MANAGER' THEN
        IF v_inv.role NOT IN ('PHARMACIST', 'CASHIER') THEN
            RAISE EXCEPTION 'MANAGER cannot revoke invitation for role %', v_inv.role USING ERRCODE = '42501';
        END IF;
    ELSE
        RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
    END IF;

    IF v_inv.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Invitation is not in PENDING status' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.staff_invitations
    SET status = 'REVOKED', updated_at = now()
    WHERE id = p_invitation_id;
END;
$$;

ALTER FUNCTION public.rpc_revoke_staff_invitation(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_revoke_staff_invitation FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_staff_invitation TO authenticated;
