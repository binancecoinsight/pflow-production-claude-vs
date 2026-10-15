-- ============================================================================
-- MIGRATION M-14: INVENTORY STOCK ADJUSTMENTS
-- Target: supabase/migrations/20261007000014_m14_inventory_adjustments.sql
-- Dependencies: M-1, M-2, M-5, M-6, M-7, M-13
-- 
-- Implements Phase 5D-16: Authoritative Inventory Stock Adjustments
-- 1. Creates public.stock_adjustments table for tracking physical count corrections.
--    - Foreign keys to pharmacies, branches, products, batches enforce ON DELETE RESTRICT
--      to protect immutable audit history from cascade deletions.
--    - client_op_id is mandatory (NOT NULL) for cryptographic idempotency.
--    - reason is constrained to approved structured values.
-- 2. Enforces append-only immutability and RLS on public.stock_adjustments.
-- 3. Provides authoritative public.rpc_adjust_inventory_stock RPC:
--    - Authenticated session requirement (auth.uid() IS NOT NULL)
--    - Active tenant membership verification (status = 'ACTIVE')
--    - Mandatory client_op_id validation (rejects NULL)
--    - Authoritative permission check via public.has_pharmacy_permission(pharmacy_id, 'inventory.adjust')
--    - Server-side structured reason validation
--    - Cross-tenant & cross-branch validation for products and batches
--    - Pessimistic row locking on authoritative batch (FOR UPDATE)
--    - Server-side calculation from authoritative stock (delta application)
--    - Atomic stock ledger movement ('ADJUSTMENT' movement_type)
--    - Append-only compliance audit logging
--    - Deterministic canonical SHA-256 idempotency protection (including notes)
-- ============================================================================

-- 1. PRECONDITIONS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory_batches') THEN
        RAISE EXCEPTION 'Precondition failed: public.inventory_batches table missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_ledger') THEN
        RAISE EXCEPTION 'Precondition failed: public.stock_ledger table missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
        RAISE EXCEPTION 'Precondition failed: public.audit_logs table missing.';
    END IF;
END $$;

-- Ensure PHARMACIST possesses inventory.adjust permission in role matrix
INSERT INTO public.role_permissions (role, permission) VALUES
    ('PHARMACIST', 'inventory.adjust')
ON CONFLICT DO NOTHING;

-- 2. OBJECTS CREATED: public.stock_adjustments
CREATE TABLE IF NOT EXISTS public.stock_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
    adjustment_type VARCHAR(16) NOT NULL CHECK (adjustment_type IN ('INCREASE', 'DECREASE')),
    quantity_delta INT NOT NULL,
    previous_stock INT NOT NULL,
    resulting_stock INT NOT NULL,
    reason VARCHAR(64) NOT NULL CHECK (reason IN (
        'COUNT_DISCREPANCY', 'DAMAGED', 'EXPIRED', 
        'RECEIVED_CORRECTION', 'THEFT', 'OTHER'
    )),
    notes TEXT,
    client_op_id UUID NOT NULL,
    payload_hash TEXT NOT NULL,
    adjusted_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes for performance & tenant-scoped idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_adjustments_pharmacy_client_op 
ON public.stock_adjustments (pharmacy_id, client_op_id);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_batch 
ON public.stock_adjustments (pharmacy_id, batch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product 
ON public.stock_adjustments (pharmacy_id, product_id, created_at DESC);

-- 3. IMMUTABILITY TRIGGER ON public.stock_adjustments
CREATE OR REPLACE FUNCTION public.trg_prevent_stock_adjustments_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABLE_RECORD: stock_adjustments records are append-only and cannot be updated or deleted.'
        USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_stock_adjustments_immutability ON public.stock_adjustments;
CREATE TRIGGER trg_guard_stock_adjustments_immutability
BEFORE UPDATE OR DELETE ON public.stock_adjustments
FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_stock_adjustments_mutation();

-- 4. ROW LEVEL SECURITY ON public.stock_adjustments
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

-- Block all direct client mutations; must use authoritative RPC
DROP POLICY IF EXISTS rls_stock_adjustments_insert ON public.stock_adjustments;
CREATE POLICY rls_stock_adjustments_insert ON public.stock_adjustments FOR INSERT WITH CHECK (FALSE);

DROP POLICY IF EXISTS rls_stock_adjustments_update ON public.stock_adjustments;
CREATE POLICY rls_stock_adjustments_update ON public.stock_adjustments FOR UPDATE USING (FALSE);

DROP POLICY IF EXISTS rls_stock_adjustments_delete ON public.stock_adjustments;
CREATE POLICY rls_stock_adjustments_delete ON public.stock_adjustments FOR DELETE USING (FALSE);

-- Select policy: Authorized pharmacy members can view stock adjustments for their pharmacy
DROP POLICY IF EXISTS rls_stock_adjustments_select ON public.stock_adjustments;
CREATE POLICY rls_stock_adjustments_select ON public.stock_adjustments
FOR SELECT
USING (
    public.is_pharmacy_member(pharmacy_id)
    AND (
        public.has_pharmacy_role(pharmacy_id, 'OWNER')
        OR public.has_pharmacy_role(pharmacy_id, 'MANAGER')
        OR public.has_pharmacy_permission(pharmacy_id, 'inventory.read')
        OR public.has_pharmacy_permission(pharmacy_id, 'inventory.adjust')
    )
);

REVOKE INSERT, UPDATE, DELETE ON public.stock_adjustments FROM authenticated, anon, public;
GRANT SELECT ON public.stock_adjustments TO authenticated;

-- 5. AUTHORITATIVE INVENTORY STOCK ADJUSTMENT RPC
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
SET search_path = public, pg_temp
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

    -- 4. Verify Role Authorization: Caller must possess 'inventory.adjust' permission
    -- Enforced via authoritative permission helper (possessed by OWNER, MANAGER in M-2)
    -- CASHIER and unauthorized roles are strictly prohibited
    IF NOT public.has_pharmacy_permission(p_pharmacy_id, 'inventory.adjust') THEN
        RAISE EXCEPTION 'FORBIDDEN_PERMISSION: Caller lacks inventory.adjust permission.' USING ERRCODE = '42501';
    END IF;

    -- 5. Validate Direction & Quantity Rules
    v_clean_direction := upper(trim(p_direction));
    IF v_clean_direction NOT IN ('INCREASE', 'DECREASE') THEN
        RAISE EXCEPTION 'INVALID_DIRECTION: Direction must be INCREASE or DECREASE.' USING ERRCODE = '22023';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_QUANTITY: Adjustment quantity must be a positive integer.' USING ERRCODE = '22003';
    END IF;

    -- 6. Server-Side Structured Reason Validation
    v_clean_reason := upper(trim(p_reason));
    IF v_clean_reason NOT IN ('COUNT_DISCREPANCY', 'DAMAGED', 'EXPIRED', 'RECEIVED_CORRECTION', 'THEFT', 'OTHER') THEN
        RAISE EXCEPTION 'INVALID_REASON: Reason must be one of COUNT_DISCREPANCY, DAMAGED, EXPIRED, RECEIVED_CORRECTION, THEFT, OTHER.' USING ERRCODE = '22023';
    END IF;

    v_clean_notes := COALESCE(trim(p_notes), '');

    -- 7. Deterministic Canonical Payload Hash (SHA-256 lowercase 64-character hex, including notes)
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

    -- 8. Idempotency Check: inspect existing record for (pharmacy_id, client_op_id)
    SELECT a.id, a.batch_id, a.previous_stock, a.quantity_delta, a.resulting_stock, a.created_at, a.payload_hash
    INTO v_existing_id, v_existing_batch_id, v_existing_prev_stock, v_existing_qty_delta, v_existing_res_stock, v_existing_created_at, v_existing_payload_hash
    FROM public.stock_adjustments a
    WHERE a.pharmacy_id = p_pharmacy_id AND a.client_op_id = p_client_op_id;

    IF FOUND THEN
        -- If payload differs from original request (including notes), reject as conflicting reuse
        IF v_existing_payload_hash != v_incoming_payload_hash THEN
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: client_op_id % already processed with divergent payload.', p_client_op_id
                USING ERRCODE = '23505';
        END IF;

        -- Replay: Return original authoritative result without secondary mutations
        RETURN QUERY SELECT v_existing_id, v_existing_batch_id, v_existing_prev_stock, v_existing_qty_delta, v_existing_res_stock, v_existing_created_at;
        RETURN;
    END IF;

    -- 9. Validate Branch Belongs to Requested Pharmacy
    IF NOT EXISTS (
        SELECT 1 FROM public.branches
        WHERE id = p_branch_id AND pharmacy_id = p_pharmacy_id
    ) THEN
        RAISE EXCEPTION 'BRANCH_MISMATCH: Branch % does not belong to pharmacy.', p_branch_id USING ERRCODE = '23503';
    END IF;

    -- 10. Validate Product Belongs to Requested Pharmacy
    IF NOT EXISTS (
        SELECT 1 FROM public.products
        WHERE id = p_product_id AND pharmacy_id = p_pharmacy_id
    ) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not belong to pharmacy.', p_product_id USING ERRCODE = '23503';
    END IF;

    -- 11. Lock Authoritative Batch Row (FOR UPDATE) & Verify Tenant/Branch/Product Relationships
    SELECT b.quantity, b.status
    INTO v_current_stock, v_batch_status
    FROM public.inventory_batches b
    WHERE b.id = p_batch_id
      AND b.pharmacy_id = p_pharmacy_id
      AND b.branch_id = p_branch_id
      AND b.product_id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'BATCH_NOT_FOUND: Batch % does not belong to pharmacy %, branch %, and product %.',
            p_batch_id, p_pharmacy_id, p_branch_id, p_product_id USING ERRCODE = '23503';
    END IF;

    -- 12. Calculate New Quantity Authoritatively Server-Side
    IF v_clean_direction = 'INCREASE' THEN
        v_signed_delta := p_quantity;
        v_new_stock := v_current_stock + p_quantity;
    ELSE
        v_signed_delta := -p_quantity;
        v_new_stock := v_current_stock - p_quantity;
    END IF;

    -- 13. Atomically Update Authoritative Batch Quantity
    UPDATE public.inventory_batches
    SET quantity = v_new_stock,
        status = CASE 
            WHEN v_new_stock <= 0 THEN 'DEPLETED'
            WHEN status = 'DEPLETED' AND v_new_stock > 0 THEN 'ACTIVE'
            ELSE status
        END,
        updated_at = v_timestamp
    WHERE id = p_batch_id;

    -- 14. Create Authoritative Stock Adjustment Entity
    INSERT INTO public.stock_adjustments (
        id, pharmacy_id, branch_id, product_id, batch_id,
        adjustment_type, quantity_delta, previous_stock, resulting_stock,
        reason, notes, client_op_id, payload_hash, adjusted_by, created_at
    ) VALUES (
        v_adjustment_id, p_pharmacy_id, p_branch_id, p_product_id, p_batch_id,
        v_clean_direction, v_signed_delta, v_current_stock, v_new_stock,
        v_clean_reason, CASE WHEN v_clean_notes = '' THEN NULL ELSE v_clean_notes END,
        p_client_op_id, v_incoming_payload_hash, auth.uid(), v_timestamp
    );

    -- 15. Append Immutable Stock Ledger Movement
    INSERT INTO public.stock_ledger (
        id, pharmacy_id, branch_id, product_id, batch_id,
        movement_type, quantity_delta, resulting_batch_stock,
        reference_id, notes, created_at
    ) VALUES (
        gen_random_uuid(), p_pharmacy_id, p_branch_id, p_product_id, p_batch_id,
        'ADJUSTMENT', v_signed_delta, v_new_stock,
        v_adjustment_id, 'Stock Adjustment (' || v_clean_direction || '): ' || v_clean_reason, v_timestamp
    );

    -- 16. Append Immutable Audit Record
    INSERT INTO public.audit_logs (
        id, pharmacy_id, actor_id, actor_type,
        action, target_entity, target_id,
        new_data, created_at
    ) VALUES (
        gen_random_uuid(), p_pharmacy_id, auth.uid(), 'USER',
        'STOCK_ADJUSTMENT_EXECUTED', 'inventory_batches', p_batch_id::TEXT,
        jsonb_build_object(
            'adjustment_id', v_adjustment_id,
            'batch_id', p_batch_id,
            'product_id', p_product_id,
            'branch_id', p_branch_id,
            'direction', v_clean_direction,
            'quantity', p_quantity,
            'previous_quantity', v_current_stock,
            'resulting_quantity', v_new_stock,
            'reason', v_clean_reason,
            'notes', v_clean_notes,
            'client_op_id', p_client_op_id
        ),
        v_timestamp
    );

    -- 17. Return Authoritative Result
    RETURN QUERY SELECT v_adjustment_id, p_batch_id, v_current_stock, v_signed_delta, v_new_stock, v_timestamp;
END;
$$;

-- Secure Execution Privileges
REVOKE ALL ON FUNCTION public.rpc_adjust_inventory_stock FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_inventory_stock TO authenticated;
