-- PharmacyFlow post-sealed financial and inventory correction (UNEXECUTED).
-- This does not reinterpret existing NUMERIC refund data from M-7/M-9/M-10.
-- New code must use refund_amount_minor for all newly created refund records.

ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS refund_amount_minor BIGINT;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(24)
    NOT NULL DEFAULT 'LEGACY_UNVERIFIED'
    CHECK (reconciliation_status IN ('LEGACY_UNVERIFIED', 'VERIFIED_MINOR_UNITS', 'RECONCILED'));

ALTER TABLE public.sale_returns ADD CONSTRAINT chk_sale_returns_minor_nonnegative
CHECK (refund_amount_minor IS NULL OR refund_amount_minor >= 0);

CREATE TABLE IF NOT EXISTS public.refund_financial_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    sale_return_id UUID NOT NULL UNIQUE REFERENCES public.sale_returns(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Clean-install guard: the historical NUMERIC field may only be populated when
-- it has an exact minor-unit counterpart. Existing rows remain explicitly
-- LEGACY_UNVERIFIED until an approved migration/reconciliation proves meaning.
CREATE OR REPLACE FUNCTION public.trg_validate_sale_return_minor_units()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.refund_amount_minor IS NOT NULL
       AND NEW.refund_amount IS NOT NULL
       AND NEW.refund_amount <> NEW.refund_amount_minor::NUMERIC THEN
        RAISE EXCEPTION 'REFUND_UNIT_MISMATCH: refund_amount and refund_amount_minor differ.'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_sale_return_minor_units ON public.sale_returns;
CREATE TRIGGER trg_validate_sale_return_minor_units
BEFORE INSERT OR UPDATE ON public.sale_returns
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_sale_return_minor_units();

-- Late cash sales are intentionally excluded from a closed session's original
-- close calculation. Reconciliation must be explicit; no automatic historical
-- session mutation occurs here.
CREATE INDEX IF NOT EXISTS idx_late_cash_sale_exceptions_open
ON public.late_cash_sale_exceptions(pharmacy_id, branch_id, server_committed_at)
WHERE status = 'OPEN';

-- Staging verification required: all existing return RPCs must either write an
-- exact refund_amount_minor value or be superseded by an additive v2 RPC. No
-- deployment should claim historical NUMERIC values are minor units without
-- evidence.
