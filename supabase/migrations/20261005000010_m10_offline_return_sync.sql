-- ==============================================================================
-- MIGRATION M-10: Offline Return Synchronization & Status Resolution
-- ==============================================================================
-- Purpose:
-- 1. Adds payload_hash to public.sale_returns to enforce cryptographic idempotency:
--    conflicting client_op_id reuse with a divergent payload hash is strictly rejected.
-- 2. Updates public.rpc_process_sale_return to store payload_hash and reject conflicting reuse.
-- 3. Extends public.rpc_get_client_op_status so that offline return operations
--    (identified by client_op_id) that suffer ambiguous network dropouts can be
--    safely confirmed and resolved against public.sale_returns without re-executing
--    return stock movements or duplicating financial refunds.
-- ==============================================================================

-- 1. ADD payload_hash COLUMN TO sale_returns
ALTER TABLE public.sale_returns 
ADD COLUMN IF NOT EXISTS payload_hash TEXT;

-- 2. UPDATE RPC: rpc_process_sale_return WITH IDEMPOTENCY PAYLOAD HASH PROTECTION
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
SET search_path = public, pg_temp
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
            -- Conflicting reuse check: reject if client_op_id reused with different payload hash
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
REVOKE ALL ON FUNCTION public.rpc_process_sale_return(UUID, UUID, UUID, JSONB, NUMERIC, VARCHAR, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_process_sale_return(UUID, UUID, UUID, JSONB, NUMERIC, VARCHAR, TEXT, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_process_sale_return(UUID, UUID, UUID, JSONB, NUMERIC, VARCHAR, TEXT, UUID, TEXT) TO authenticated;

-- 3. UPDATE RPC: rpc_get_client_op_status
-- Unifies sync_journal status lookups with sale_returns client_op_id idempotency records
CREATE OR REPLACE FUNCTION public.rpc_get_client_op_status(
    p_pharmacy_id UUID,
    p_client_op_id UUID
)
RETURNS TABLE (
    client_op_id UUID,
    status VARCHAR,
    response_status VARCHAR,
    processed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    -- Look in sync_journal first (for sales and general sync operations)
    SELECT 
        sj.client_op_id,
        sj.status,
        sj.response_status,
        sj.processed_at
    FROM public.sync_journal sj
    WHERE sj.pharmacy_id = p_pharmacy_id 
      AND sj.client_op_id = p_client_op_id
      AND public.is_pharmacy_member(p_pharmacy_id)

    UNION ALL

    -- Look in sale_returns (for return operations tracked by client_op_id)
    SELECT 
        sr.client_op_id,
        sr.status,
        sr.status AS response_status,
        sr.created_at AS processed_at
    FROM public.sale_returns sr
    WHERE sr.pharmacy_id = p_pharmacy_id 
      AND sr.client_op_id = p_client_op_id
      AND public.is_pharmacy_member(p_pharmacy_id)
      AND NOT EXISTS (
          SELECT 1 FROM public.sync_journal sj 
          WHERE sj.pharmacy_id = p_pharmacy_id AND sj.client_op_id = p_client_op_id
      );
$$;

-- Privileges: Grant EXECUTE to authenticated role, revoke from anon/public
REVOKE ALL ON FUNCTION public.rpc_get_client_op_status(UUID, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.rpc_get_client_op_status(UUID, UUID) TO authenticated;
