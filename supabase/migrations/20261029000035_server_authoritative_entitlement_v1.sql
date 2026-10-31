-- ============================================================================
-- MIGRATION: SERVER-AUTHORITATIVE ENTITLEMENT FOUNDATION V1
-- Target: supabase/migrations/20261029000035_server_authoritative_entitlement_v1.sql
-- Dependencies: M-1, M-2, M-3 (20261004000003_m3_billing_subscriptions.sql)
-- Milestone: PF-MVP-08 / BLK-003
-- Mode: Forward-only unexecuted SQL migration draft
-- Invariants:
--   1. Authoritative time strictly from PostgreSQL transaction_timestamp() at time zone 'utc'.
--   2. Strict APP-02 states: TRIAL (14d), ACTIVE, GRACE (7d inheriting prior plan), EXPIRED, UNKNOWN.
--   3. Historical reads and legitimate previously accepted offline recovery remain unconditionally authorized.
--   4. New business mutations are blocked under EXPIRED, SUSPENDED, and UNKNOWN states.
--   5. Least privilege: REVOKE table mutations from authenticated/anon/public; audited SECURITY DEFINER RPC.
-- ============================================================================

-- 1. PRECONDITIONS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
        RAISE EXCEPTION 'Precondition failed: public.subscriptions missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscription_plans') THEN
        RAISE EXCEPTION 'Precondition failed: public.subscription_plans missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pharmacies') THEN
        RAISE EXCEPTION 'Precondition failed: public.pharmacies missing.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pharmacy_entitlement_anchors') THEN
        RAISE EXCEPTION 'Precondition failed: public.pharmacy_entitlement_anchors already exists.';
    END IF;
END $$;

-- 2. OBJECTS CREATED: pharmacy_entitlement_anchors (Active Audit Ledger)
CREATE TABLE public.pharmacy_entitlement_anchors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    plan_code VARCHAR(32) NOT NULL REFERENCES public.subscription_plans(code),
    status VARCHAR(24) NOT NULL CHECK (status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'SUSPENDED')),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    grace_end TIMESTAMPTZ NOT NULL,
    mutations_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    reason TEXT NOT NULL,
    recorded_by TEXT NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT chk_period_order CHECK (period_end >= period_start),
    CONSTRAINT chk_grace_order CHECK (grace_end >= period_end)
);

CREATE INDEX idx_entitlement_anchors_pharmacy_created 
    ON public.pharmacy_entitlement_anchors(pharmacy_id, created_at DESC);

ALTER TABLE public.pharmacy_entitlement_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_entitlement_anchors FORCE ROW LEVEL SECURITY;

-- 3. RLS POLICIES & AUTOMATED AUDIT TRIGGER: pharmacy_entitlement_anchors
-- Tenant members can view their own pharmacy's entitlement ledger; platform admins can view all.
CREATE POLICY rls_entitlement_anchors_select ON public.pharmacy_entitlement_anchors
FOR SELECT USING (
    public.is_pharmacy_member(pharmacy_id) OR public.is_platform_admin('ADMIN')
);

-- Revoke direct mutation privileges from standard client roles: anchors are append-only via trusted backend/RPC functions
REVOKE INSERT, UPDATE, DELETE ON public.pharmacy_entitlement_anchors FROM authenticated, anon, public;

-- Trigger: Automatically record state transitions from public.subscriptions into public.pharmacy_entitlement_anchors
CREATE OR REPLACE FUNCTION public.trg_record_subscription_entitlement_anchor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    INSERT INTO public.pharmacy_entitlement_anchors (
        pharmacy_id,
        plan_code,
        status,
        period_start,
        period_end,
        grace_end,
        mutations_allowed,
        reason,
        recorded_by,
        created_at
    ) VALUES (
        NEW.pharmacy_id,
        NEW.plan_code,
        NEW.status,
        NEW.current_period_start,
        NEW.current_period_end,
        NEW.current_period_end + INTERVAL '7 days',
        (NEW.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE') AND (NEW.current_period_end + INTERVAL '7 days') > timezone('utc', now())),
        'Subscription lifecycle event: ' || NEW.status,
        'TRIGGER:subscriptions',
        timezone('utc', now())
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_entitlement_anchor ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_entitlement_anchor
AFTER INSERT OR UPDATE OF status, plan_code, current_period_end ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.trg_record_subscription_entitlement_anchor();

-- Admin RPC: Allows platform admins to record administrative entitlement anchors or suspensions
CREATE OR REPLACE FUNCTION public.rpc_record_entitlement_anchor_v1(
    p_pharmacy_id UUID,
    p_status VARCHAR(24),
    p_reason TEXT,
    p_mutations_allowed BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_sub RECORD;
    v_anchor_id UUID;
BEGIN
    IF NOT public.is_platform_admin('ADMIN') THEN
        RAISE EXCEPTION 'Unauthorized: Platform admin privileges required' USING ERRCODE = '42501';
    END IF;

    SELECT plan_code, current_period_start, current_period_end INTO v_sub
    FROM public.subscriptions WHERE pharmacy_id = p_pharmacy_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription missing for pharmacy %', p_pharmacy_id USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.pharmacy_entitlement_anchors (
        pharmacy_id,
        plan_code,
        status,
        period_start,
        period_end,
        grace_end,
        mutations_allowed,
        reason,
        recorded_by,
        created_at
    ) VALUES (
        p_pharmacy_id,
        v_sub.plan_code,
        p_status,
        v_sub.current_period_start,
        v_sub.current_period_end,
        v_sub.current_period_end + INTERVAL '7 days',
        p_mutations_allowed,
        p_reason,
        'ADMIN:' || COALESCE(auth.uid()::TEXT, 'ANON'),
        timezone('utc', now())
    ) RETURNING id INTO v_anchor_id;

    RETURN v_anchor_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_record_entitlement_anchor_v1(UUID, VARCHAR, TEXT, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_record_entitlement_anchor_v1(UUID, VARCHAR, TEXT, BOOLEAN) FROM public, anon;

-- 4. FUNCTION: rpc_get_effective_entitlement_v1
-- Evaluates authoritative subscription entitlement for a pharmacy using database UTC time.
-- Returns strongly typed JSONB evidence matching the APP-02 lifecycle contract.
CREATE OR REPLACE FUNCTION public.rpc_get_effective_entitlement_v1(p_pharmacy_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ;
    v_sub RECORD;
    v_plan RECORD;
    v_state TEXT;
    v_mutations_allowed BOOLEAN;
    v_reason TEXT;
    v_grace_end TIMESTAMPTZ;
    v_features JSONB;
BEGIN
    -- Authorization: Caller must be a member of the pharmacy or a platform admin
    IF NOT (public.is_pharmacy_member(p_pharmacy_id) OR public.is_platform_admin('ADMIN')) THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an authorized member of pharmacy %', p_pharmacy_id
            USING ERRCODE = '42501';
    END IF;

    -- Strict UTC authoritative timestamp
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

    -- Check for administrative suspension in the active audit anchor ledger
    -- (Preserves M-3 check constraint on public.subscriptions while supporting administrative suspension)
    IF EXISTS (
        SELECT 1 FROM public.pharmacy_entitlement_anchors a
        WHERE a.pharmacy_id = p_pharmacy_id
          AND a.status = 'SUSPENDED'
        ORDER BY a.created_at DESC
        LIMIT 1
    ) THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_effective_entitlement_v1(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_get_effective_entitlement_v1(UUID) FROM public, anon;

-- 5. FUNCTION: assert_pharmacy_mutation_entitled_v1
-- Operation-level enforcement guard for protected business mutations.
-- Raises P0001 with ENTITLEMENT_EXPIRED or ENTITLEMENT_UNKNOWN when mutations are blocked.
-- Preserves legitimate offline replay: if p_operation_id is recognized as a previously
-- committed/accepted operation, it passes through to allow idempotent recovery.
CREATE OR REPLACE FUNCTION public.assert_pharmacy_mutation_entitled_v1(
    p_pharmacy_id UUID,
    p_operation_type TEXT,
    p_operation_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_entitlement JSONB;
    v_state TEXT;
    v_mutations_allowed BOOLEAN;
    v_reason TEXT;
    v_already_accepted BOOLEAN := FALSE;
BEGIN
    -- 1. Attest Caller Authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Unauthenticated caller.' USING ERRCODE = '28000';
    END IF;

    -- 2. Verify Caller Membership in Target Pharmacy or Platform Admin
    IF NOT (public.is_pharmacy_member(p_pharmacy_id) OR public.is_platform_admin('ADMIN')) THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an authorized member of pharmacy %', p_pharmacy_id
            USING ERRCODE = '42501';
    END IF;

    -- 3. Replay Preservation Guard:
    -- If an operation_id is provided, check if it was already accepted and committed in authoritative tables.
    -- Legitimate previously accepted operations must never be blocked during replay reconciliation
    -- even if the subscription expired post-facto.
    IF p_operation_id IS NOT NULL THEN
        -- Check sales
        IF EXISTS (SELECT 1 FROM public.sales WHERE id = p_operation_id AND pharmacy_id = p_pharmacy_id) THEN
            v_already_accepted := TRUE;
        END IF;
        -- Check sync journal
        IF NOT v_already_accepted AND EXISTS (
            SELECT 1 FROM public.sync_journal WHERE client_op_id = p_operation_id AND pharmacy_id = p_pharmacy_id
        ) THEN
            v_already_accepted := TRUE;
        END IF;
        -- Check purchases
        IF NOT v_already_accepted AND EXISTS (
            SELECT 1 FROM public.purchases WHERE (client_op_id = p_operation_id OR id = p_operation_id) AND pharmacy_id = p_pharmacy_id
        ) THEN
            v_already_accepted := TRUE;
        END IF;
        -- Check stock adjustments
        IF NOT v_already_accepted AND EXISTS (
            SELECT 1 FROM public.stock_adjustments WHERE (client_op_id = p_operation_id OR id = p_operation_id) AND pharmacy_id = p_pharmacy_id
        ) THEN
            v_already_accepted := TRUE;
        END IF;
        -- Check stock transfers
        IF NOT v_already_accepted AND EXISTS (
            SELECT 1 FROM public.stock_transfers 
            WHERE (dispatch_client_op_id = p_operation_id OR receive_client_op_id = p_operation_id OR id = p_operation_id) 
              AND pharmacy_id = p_pharmacy_id
        ) THEN
            v_already_accepted := TRUE;
        END IF;
        -- Check sale returns
        IF NOT v_already_accepted AND EXISTS (
            SELECT 1 FROM public.sale_returns WHERE (client_op_id = p_operation_id OR id = p_operation_id) AND pharmacy_id = p_pharmacy_id
        ) THEN
            v_already_accepted := TRUE;
        END IF;

        IF v_already_accepted THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- 4. Evaluate effective entitlement
    v_entitlement := public.rpc_get_effective_entitlement_v1(p_pharmacy_id);
    v_state := v_entitlement->>'state';
    v_mutations_allowed := (v_entitlement->>'mutations_allowed')::BOOLEAN;
    v_reason := v_entitlement->>'reason';

    IF NOT v_mutations_allowed THEN
        RAISE EXCEPTION 'Entitlement violation for operation %: Pharmacy subscription is % (%). New mutations are blocked.',
            p_operation_type, v_state, v_reason
            USING ERRCODE = 'P0001',
                  DETAIL = jsonb_build_object(
                      'code', CASE 
                          WHEN v_state = 'UNKNOWN' THEN 'ENTITLEMENT_UNKNOWN'
                          WHEN v_state = 'SUSPENDED' THEN 'ENTITLEMENT_SUSPENDED'
                          ELSE 'ENTITLEMENT_EXPIRED' 
                      END,
                      'state', v_state,
                      'pharmacy_id', p_pharmacy_id,
                      'operation_type', p_operation_type,
                      'reason', v_reason
                  )::text;
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_pharmacy_mutation_entitled_v1(UUID, TEXT, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_pharmacy_mutation_entitled_v1(UUID, TEXT, UUID) FROM public, anon;

-- 6. UPDATED HELPER: is_subscription_active (Aligned with APP-02 7-Day Grace)
-- Replaces legacy binary helper with grace-aware check while preserving backward compatibility.
CREATE OR REPLACE FUNCTION public.is_subscription_active(p_pharmacy_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.subscriptions
        WHERE pharmacy_id = p_pharmacy_id
          AND status IN ('ACTIVE', 'TRIAL', 'PAST_DUE')
          AND (current_period_end + INTERVAL '7 days') > timezone('utc', now())
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_subscription_active(UUID) TO authenticated;
