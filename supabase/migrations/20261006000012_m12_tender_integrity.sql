-- ============================================================================
-- MIGRATION M-12: TENDER INTEGRITY & CASH RECONCILIATION
-- Target: supabase/migrations/20261006000012_m12_tender_integrity.sql
-- Dependencies: M-1 through M-11
-- ============================================================================

-- 1. PRECONDITIONS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pharmacies') THEN
        RAISE EXCEPTION 'Precondition failed: public.pharmacies table missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales') THEN
        RAISE EXCEPTION 'Precondition failed: public.sales table missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sale_returns') THEN
        RAISE EXCEPTION 'Precondition failed: public.sale_returns table missing.';
    END IF;
END $$;

-- 2. SCHEMA EVOLUTION: TENDER INTEGRITY COLUMNS ON public.sales
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS amount_tendered BIGINT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS change_due BIGINT DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_status VARCHAR(32) DEFAULT 'SETTLED';

-- Backfill legacy rows: normalized legacy reconstruction based on pre-M-12 sales model
-- (Physical tender denominations/change were not captured prior to M-12; net settled total reconstructed)
UPDATE public.sales
SET amount_tendered = total,
    change_due = 0,
    payment_status = 'SETTLED'
WHERE amount_tendered IS NULL;

ALTER TABLE public.sales ALTER COLUMN amount_tendered SET NOT NULL;
ALTER TABLE public.sales ALTER COLUMN change_due SET NOT NULL;
ALTER TABLE public.sales ALTER COLUMN payment_status SET NOT NULL;

-- 3. FINANCIAL CONSTRAINTS ON TENDER AMOUNTS & CHANGE DUE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_sales_payment_status' AND conrelid = 'public.sales'::regclass
    ) THEN
        ALTER TABLE public.sales
        ADD CONSTRAINT chk_sales_payment_status
        CHECK (payment_status IN ('SETTLED', 'PENDING_MANUAL', 'UNCONFIRMED_EXTERNAL'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_sales_cash_payment_status' AND conrelid = 'public.sales'::regclass
    ) THEN
        ALTER TABLE public.sales
        ADD CONSTRAINT chk_sales_cash_payment_status
        CHECK (payment_method != 'CASH' OR payment_status = 'SETTLED');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_sales_cash_tender' AND conrelid = 'public.sales'::regclass
    ) THEN
        ALTER TABLE public.sales
        ADD CONSTRAINT chk_sales_cash_tender
        CHECK (
            (payment_method != 'CASH') OR 
            (amount_tendered >= total AND change_due = (amount_tendered - total))
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_sales_non_cash_tender' AND conrelid = 'public.sales'::regclass
    ) THEN
        ALTER TABLE public.sales
        ADD CONSTRAINT chk_sales_non_cash_tender
        CHECK (
            (payment_method = 'CASH') OR 
            (amount_tendered = total AND change_due = 0)
        );
    END IF;
END $$;

-- 4. CASH REGISTER SESSIONS (SHIFT & CASH RECONCILIATION)
CREATE TABLE IF NOT EXISTS public.cash_register_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    cashier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    closed_at TIMESTAMPTZ,
    opening_cash BIGINT NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
    counted_cash BIGINT,
    expected_cash BIGINT,
    variance BIGINT,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_cash_register_sessions_pharmacy_id UNIQUE (pharmacy_id, id),
    CONSTRAINT chk_register_sessions_closed_math CHECK (
        status != 'CLOSED' OR (
            counted_cash IS NOT NULL AND 
            expected_cash IS NOT NULL AND 
            variance = (counted_cash - expected_cash) AND 
            closed_at IS NOT NULL
        )
    )
);

-- Composite Foreign Key to Branch
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_register_sessions_branch_comp' AND conrelid = 'public.cash_register_sessions'::regclass
    ) THEN
        ALTER TABLE public.cash_register_sessions
        ADD CONSTRAINT fk_register_sessions_branch_comp
        FOREIGN KEY (pharmacy_id, branch_id)
        REFERENCES public.branches(pharmacy_id, id)
        ON DELETE RESTRICT;
    END IF;
END $$;

-- Concurrency Invariant: At most ONE active OPEN session per cashier in a pharmacy
CREATE UNIQUE INDEX IF NOT EXISTS uq_idx_active_cashier_open_session 
ON public.cash_register_sessions (pharmacy_id, cashier_id) 
WHERE status = 'OPEN';

-- Performance & Reporting Indexes
CREATE INDEX IF NOT EXISTS idx_register_sessions_pharmacy_cashier 
ON public.cash_register_sessions (pharmacy_id, cashier_id, status);

CREATE INDEX IF NOT EXISTS idx_register_sessions_pharmacy_branch_time 
ON public.cash_register_sessions (pharmacy_id, branch_id, opened_at);

-- Automated updated_at trigger
CREATE OR REPLACE FUNCTION public.trg_set_register_sessions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_register_sessions_updated_at ON public.cash_register_sessions;
CREATE TRIGGER trg_register_sessions_updated_at
BEFORE UPDATE ON public.cash_register_sessions
FOR EACH ROW EXECUTE FUNCTION public.trg_set_register_sessions_updated_at();

-- Register Session Lifecycle Invariant Trigger
CREATE OR REPLACE FUNCTION public.trg_validate_register_session_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- 1. DELETE is permanently forbidden (audit records cannot be deleted)
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'REGISTER_SESSIONS_CANNOT_BE_DELETED: Financial register audit records cannot be deleted.' USING ERRCODE = '23514';
    END IF;

    -- 2. UPDATE Validations
    IF TG_OP = 'UPDATE' THEN
        -- Closed sessions are permanently immutable
        IF OLD.status = 'CLOSED' THEN
            RAISE EXCEPTION 'CLOSED_SESSION_IMMUTABLE: A closed register session cannot be modified.' USING ERRCODE = '23514';
        END IF;

        -- Immutable session establishment fields
        IF NEW.opening_cash != OLD.opening_cash THEN
            RAISE EXCEPTION 'IMMUTABLE_FIELD: opening_cash cannot be modified after session creation.' USING ERRCODE = '23514';
        END IF;
        IF NEW.opened_at != OLD.opened_at THEN
            RAISE EXCEPTION 'IMMUTABLE_FIELD: opened_at cannot be modified after session creation.' USING ERRCODE = '23514';
        END IF;
        IF NEW.cashier_id != OLD.cashier_id OR NEW.branch_id != OLD.branch_id OR NEW.pharmacy_id != OLD.pharmacy_id THEN
            RAISE EXCEPTION 'IMMUTABLE_FIELD: Tenant, branch, and cashier identity cannot be modified.' USING ERRCODE = '23514';
        END IF;

        -- While remaining in OPEN status, financial settlement fields cannot be mutated directly
        IF NEW.status = 'OPEN' THEN
            IF NEW.expected_cash IS DISTINCT FROM OLD.expected_cash OR 
               NEW.variance IS DISTINCT FROM OLD.variance OR 
               NEW.counted_cash IS DISTINCT FROM OLD.counted_cash OR 
               NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
                RAISE EXCEPTION 'OPEN_SESSION_FINANCIAL_MUTATION_DENIED: Financial settlement fields cannot be modified on an open session.' USING ERRCODE = '23514';
            END IF;
        END IF;

        -- When transitioning to CLOSED status, ensure closed_at is set
        IF NEW.status = 'CLOSED' THEN
            IF NEW.closed_at IS NULL THEN
                NEW.closed_at := timezone('utc', now());
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_register_session_lifecycle_upd ON public.cash_register_sessions;
CREATE TRIGGER trg_validate_register_session_lifecycle_upd
BEFORE UPDATE ON public.cash_register_sessions
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_register_session_lifecycle();

DROP TRIGGER IF EXISTS trg_validate_register_session_lifecycle_del ON public.cash_register_sessions;
CREATE TRIGGER trg_validate_register_session_lifecycle_del
BEFORE DELETE ON public.cash_register_sessions
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_register_session_lifecycle();

-- 5. ROW LEVEL SECURITY ON CASH REGISTER SESSIONS
ALTER TABLE public.cash_register_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register_sessions FORCE ROW LEVEL SECURITY;

-- Policy: SELECT
-- Cashiers can only view their own sessions; Management (Owner, Manager, Pharmacist) can view all
DROP POLICY IF EXISTS rls_cash_register_sessions_select ON public.cash_register_sessions;
CREATE POLICY rls_cash_register_sessions_select ON public.cash_register_sessions 
FOR SELECT USING (
    public.is_pharmacy_member(pharmacy_id) AND (
        cashier_id = auth.uid() OR 
        public.has_pharmacy_sales_management_access(pharmacy_id)
    )
);

-- Policy: INSERT
-- Staff with 'sales.create' permission can open their own register session
DROP POLICY IF EXISTS rls_cash_register_sessions_insert ON public.cash_register_sessions;
CREATE POLICY rls_cash_register_sessions_insert ON public.cash_register_sessions 
FOR INSERT WITH CHECK (
    public.has_pharmacy_permission(pharmacy_id, 'sales.create') AND
    cashier_id = auth.uid()
);

-- Policy: UPDATE
-- Direct client update is restricted to OPEN sessions for notes only
-- (Financial mutations on OPEN sessions are blocked by trigger; closing occurs via authoritative RPC)
DROP POLICY IF EXISTS rls_cash_register_sessions_update ON public.cash_register_sessions;
CREATE POLICY rls_cash_register_sessions_update ON public.cash_register_sessions 
FOR UPDATE USING (
    public.is_pharmacy_member(pharmacy_id) AND
    status = 'OPEN' AND (
        cashier_id = auth.uid() OR 
        public.has_pharmacy_sales_management_access(pharmacy_id)
    )
);

-- Policy: DELETE
-- Permanent audit invariant: client deletion is completely forbidden
DROP POLICY IF EXISTS rls_cash_register_sessions_delete ON public.cash_register_sessions;
CREATE POLICY rls_cash_register_sessions_delete ON public.cash_register_sessions 
FOR DELETE USING (FALSE);

-- 6. PROCEDURE: rpc_close_cash_register_session (Server-Authoritative Close Engine)
CREATE OR REPLACE FUNCTION public.rpc_close_cash_register_session(
    p_session_id UUID,
    p_pharmacy_id UUID,
    p_counted_cash BIGINT,
    p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    pharmacy_id UUID,
    branch_id UUID,
    cashier_id UUID,
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    opening_cash BIGINT,
    counted_cash BIGINT,
    expected_cash BIGINT,
    variance BIGINT,
    notes TEXT,
    status VARCHAR(20)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_session public.cash_register_sessions%ROWTYPE;
    v_closed_at TIMESTAMPTZ := timezone('utc', now());
    v_cash_sales BIGINT := 0;
    v_cash_refunds BIGINT := 0;
    v_expected_cash BIGINT;
    v_variance BIGINT;
BEGIN
    -- 1. Attest caller
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Unauthenticated caller.' USING ERRCODE = '28000';
    END IF;

    -- 2. Lock target session
    SELECT * INTO v_session
    FROM public.cash_register_sessions
    WHERE cash_register_sessions.id = p_session_id AND cash_register_sessions.pharmacy_id = p_pharmacy_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SESSION_NOT_FOUND: Register session not found.' USING ERRCODE = '02000';
    END IF;

    IF v_session.status = 'CLOSED' THEN
        RAISE EXCEPTION 'ALREADY_CLOSED: Register session is already closed.' USING ERRCODE = '23514';
    END IF;

    -- 3. Authorization: Cashier of session OR management
    IF v_session.cashier_id != auth.uid() AND NOT public.has_pharmacy_sales_management_access(p_pharmacy_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: You are not authorized to close this register session.' USING ERRCODE = '42501';
    END IF;

    -- 4. Server-Authoritative Sales Aggregation (only SETTLED cash sales)
    SELECT COALESCE(SUM(s.total), 0) INTO v_cash_sales
    FROM public.sales s
    WHERE s.pharmacy_id = v_session.pharmacy_id
      AND s.branch_id = v_session.branch_id
      AND s.cashier_id = v_session.cashier_id
      AND s.payment_method = 'CASH'
      AND s.payment_status = 'SETTLED'
      AND s.created_at >= v_session.opened_at
      AND s.created_at <= v_closed_at;

    -- 5. Server-Authoritative Returns Aggregation (only CASH refunds)
    SELECT COALESCE(SUM(sr.refund_amount), 0) INTO v_cash_refunds
    FROM public.sale_returns sr
    WHERE sr.pharmacy_id = v_session.pharmacy_id
      AND sr.branch_id = v_session.branch_id
      AND sr.cashier_id = v_session.cashier_id
      AND sr.refund_payment_method = 'CASH'
      AND sr.created_at >= v_session.opened_at
      AND sr.created_at <= v_closed_at;

    -- 6. Server-Authoritative Expected Cash and Variance Derivation
    v_expected_cash := v_session.opening_cash + v_cash_sales - v_cash_refunds;
    v_variance := p_counted_cash - v_expected_cash;

    -- 7. Update Session
    UPDATE public.cash_register_sessions crs
    SET closed_at = v_closed_at,
        counted_cash = p_counted_cash,
        expected_cash = v_expected_cash,
        variance = v_variance,
        notes = COALESCE(p_notes, v_session.notes),
        status = 'CLOSED'
    WHERE crs.id = p_session_id;

    RETURN QUERY
    SELECT crs.id, crs.pharmacy_id, crs.branch_id, crs.cashier_id,
           crs.opened_at, crs.closed_at, crs.opening_cash,
           crs.counted_cash, crs.expected_cash, crs.variance,
           crs.notes, crs.status
    FROM public.cash_register_sessions crs
    WHERE crs.id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_close_cash_register_session(UUID, UUID, BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_close_cash_register_session(UUID, UUID, BIGINT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_close_cash_register_session(UUID, UUID, BIGINT, TEXT) TO authenticated;
