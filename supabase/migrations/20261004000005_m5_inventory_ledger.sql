-- ============================================================================
-- MIGRATION M-5: INVENTORY LEDGER & DEFICIT INTEGRITY
-- Target: supabase/migrations/20261004000005_m5_inventory_ledger.sql
-- Dependencies: M-1, M-2, M-3, M-4
-- ============================================================================

-- 1. PRECONDITIONS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'devices') THEN
        RAISE EXCEPTION 'Precondition failed: public.devices missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sync_nonces') THEN
        RAISE EXCEPTION 'Precondition failed: public.sync_nonces missing.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_ledger') THEN
        RAISE EXCEPTION 'Precondition failed: public.stock_ledger already exists.';
    END IF;
END $$;

-- 2. OBJECTS CREATED: stock_ledger (Immutable Journal)
CREATE TABLE public.stock_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.inventory_batches(id) ON DELETE CASCADE,
    movement_type VARCHAR(32) NOT NULL CHECK (movement_type IN (
        'PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 
        'DEFICIT_RECONCILIATION', 'OPENING_BALANCE'
    )),
    quantity_delta INT NOT NULL,
    resulting_batch_stock INT NOT NULL,
    reference_id UUID NOT NULL,
    device_id UUID REFERENCES public.devices(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_stock_ledger_batch 
ON public.stock_ledger(pharmacy_id, batch_id, created_at DESC);

CREATE INDEX idx_stock_ledger_product 
ON public.stock_ledger(pharmacy_id, product_id, created_at DESC);

-- 3. CRITICAL IMMUTABILITY ENFORCEMENT
-- Trigger: Complete block on UPDATE and DELETE operations
CREATE OR REPLACE FUNCTION public.trg_prevent_stock_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABLE_LOG: stock_ledger entries are append-only and cannot be updated or deleted.'
        USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_stock_ledger_immutability ON public.stock_ledger;
CREATE TRIGGER trg_guard_stock_ledger_immutability
BEFORE UPDATE OR DELETE ON public.stock_ledger
FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_stock_ledger_mutation();

-- 4. RLS ON stock_ledger
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;

-- Members can view ledger entries for their own pharmacy
CREATE POLICY rls_stock_ledger_select ON public.stock_ledger
FOR SELECT USING (
    public.is_pharmacy_member(pharmacy_id) OR public.is_platform_admin('ADMIN')
);

-- Revoke all client mutation permissions
REVOKE INSERT, UPDATE, DELETE ON public.stock_ledger FROM authenticated, anon, public;

-- 5. DATA BACKFILL: Opening Balances & Approved Deficit Batches
-- Backfill positive inventory batches as OPENING_BALANCE
INSERT INTO public.stock_ledger (
    pharmacy_id, product_id, batch_id, movement_type, 
    quantity_delta, resulting_batch_stock, reference_id, notes
)
SELECT 
    ib.pharmacy_id, ib.product_id, ib.id, 'OPENING_BALANCE',
    ib.quantity, ib.quantity, ib.id, 'M-5 Baseline Inventory Initialization'
FROM public.inventory_batches ib
WHERE ib.quantity >= 0
ON CONFLICT DO NOTHING;

-- Backfill the 2 approved negative deficit batches as DEFICIT_RECONCILIATION
INSERT INTO public.stock_ledger (
    pharmacy_id, product_id, batch_id, movement_type, 
    quantity_delta, resulting_batch_stock, reference_id, notes
)
SELECT 
    ib.pharmacy_id, ib.product_id, ib.id, 'DEFICIT_RECONCILIATION',
    ib.quantity, ib.quantity, ib.id, 'Approved Baseline Offline Deficit'
FROM public.inventory_batches ib
WHERE ib.quantity < 0
ON CONFLICT DO NOTHING;
