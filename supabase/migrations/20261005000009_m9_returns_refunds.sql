-- ==============================================================================
-- MIGRATION M-9: Returns & Refunds / Transaction Corrections
-- ==============================================================================
-- Purpose:
-- 1. Adds client_op_id and status to public.sale_returns for idempotency tracking.
-- 2. Grants 'sales.refund' permission to PHARMACIST role to align with management model.
-- 3. Implements atomic RPC public.rpc_process_sale_return for concurrency-safe returns,
--    server-authoritative returnable quantity calculation, stock ledger restoration,
--    idempotency reservation, and audit logging.
-- 4. Hardens RLS on public.sale_returns and public.return_items matching M-8 standards:
--    - Management (OWNER, MANAGER, PHARMACIST) has store-wide visibility.
--    - CASHIER is restricted to returns on their own sales (or authorized by them).
-- ==============================================================================

-- 1. EXTEND sale_returns SCHEMA
ALTER TABLE public.sale_returns 
ADD COLUMN IF NOT EXISTS client_op_id UUID,
ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'PENDING', 'REJECTED'));

-- Unique constraint for idempotency within pharmacy partition (if client_op_id provided)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_returns_pharmacy_op 
ON public.sale_returns(pharmacy_id, client_op_id) 
WHERE client_op_id IS NOT NULL;

-- 2. SEED ROLE PERMISSION: PHARMACIST -> sales.refund
INSERT INTO public.role_permissions (role, permission)
VALUES ('PHARMACIST', 'sales.refund')
ON CONFLICT (role, permission) DO NOTHING;

-- 3. HARDEN RLS POLICIES ON sale_returns AND return_items (MATCHING M-8 SECURITY)

-- Sale Returns Select Policy
DROP POLICY IF EXISTS rls_sale_returns_select ON public.sale_returns;
CREATE POLICY rls_sale_returns_select ON public.sale_returns
FOR SELECT
USING (
    public.is_pharmacy_member(pharmacy_id)
    AND (
        public.has_pharmacy_sales_management_access(pharmacy_id)
        OR authorized_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.sales s
            WHERE s.id = sale_returns.original_sale_id
              AND s.pharmacy_id = sale_returns.pharmacy_id
              AND s.cashier_id = auth.uid()
        )
    )
);

-- Return Items Select Policy
DROP POLICY IF EXISTS rls_return_items_select ON public.return_items;
CREATE POLICY rls_return_items_select ON public.return_items
FOR SELECT
USING (
    public.is_pharmacy_member(pharmacy_id)
    AND (
        public.has_pharmacy_sales_management_access(pharmacy_id)
        OR EXISTS (
            SELECT 1 FROM public.sale_returns sr
            JOIN public.sales s ON sr.original_sale_id = s.id AND sr.pharmacy_id = s.pharmacy_id
            WHERE sr.id = return_items.return_id
              AND sr.pharmacy_id = return_items.pharmacy_id
              AND (sr.authorized_by = auth.uid() OR s.cashier_id = auth.uid())
        )
    )
);

-- Immutability on returns (no UPDATE or DELETE)
DROP POLICY IF EXISTS rls_sale_returns_update ON public.sale_returns;
CREATE POLICY rls_sale_returns_update ON public.sale_returns FOR UPDATE USING (FALSE);
DROP POLICY IF EXISTS rls_sale_returns_delete ON public.sale_returns;
CREATE POLICY rls_sale_returns_delete ON public.sale_returns FOR DELETE USING (FALSE);

DROP POLICY IF EXISTS rls_return_items_update ON public.return_items;
CREATE POLICY rls_return_items_update ON public.return_items FOR UPDATE USING (FALSE);
DROP POLICY IF EXISTS rls_return_items_delete ON public.return_items;
CREATE POLICY rls_return_items_delete ON public.return_items FOR DELETE USING (FALSE);

-- 4. ATOMIC AUTHORITATIVE RETURN PROCESSING RPC
CREATE OR REPLACE FUNCTION public.rpc_process_sale_return(
    p_pharmacy_id UUID,
    p_branch_id UUID,
    p_sale_id UUID,
    p_items JSONB,
    p_refund_amount NUMERIC(12,2),
    p_refund_payment_method VARCHAR(32),
    p_reason TEXT,
    p_client_op_id UUID DEFAULT NULL
)
RETURNS TABLE (
    return_id UUID,
    status VARCHAR(16),
    refund_amount NUMERIC(12,2),
    processed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_timestamp TIMESTAMPTZ := timezone('utc', now());
    v_return_id UUID := gen_random_uuid();
    v_existing_id UUID;
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

    -- 4. Idempotency Check: if client_op_id already processed, return existing record
    IF p_client_op_id IS NOT NULL THEN
        SELECT id, sale_returns.status, sale_returns.refund_amount, created_at
        INTO v_existing_id, status, refund_amount, processed_at
        FROM public.sale_returns
        WHERE pharmacy_id = p_pharmacy_id AND client_op_id = p_client_op_id;

        IF FOUND THEN
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

        -- Verify item exists in original sale
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

        -- Calculate already successfully returned quantity
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
        authorized_by, client_op_id, status, created_at
    ) VALUES (
        v_return_id, p_pharmacy_id, p_branch_id, p_sale_id,
        p_refund_amount, p_refund_payment_method, p_reason,
        auth.uid(), p_client_op_id, 'COMPLETED', v_timestamp
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
            -- Lock batch row for inventory update
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

            -- Append to immutable stock ledger
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

-- Revoke all privileges from public/anon, grant EXECUTE only to authenticated role
REVOKE ALL ON FUNCTION public.rpc_process_sale_return(UUID, UUID, UUID, JSONB, NUMERIC, VARCHAR, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_process_sale_return(UUID, UUID, UUID, JSONB, NUMERIC, VARCHAR, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_process_sale_return(UUID, UUID, UUID, JSONB, NUMERIC, VARCHAR, TEXT, UUID) TO authenticated;
