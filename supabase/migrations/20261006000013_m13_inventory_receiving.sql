-- ==============================================================================
-- MIGRATION M-13: Inventory Receiving & Stock Intake
-- Target: supabase/migrations/20261006000013_m13_inventory_receiving.sql
-- Dependencies: M-1 through M-12
-- ==============================================================================
-- Purpose:
-- 1. Hardens purchases, purchase_items, and inventory_batches schemas for authoritative stock intake.
-- 2. Adds client_op_id and payload_hash to public.purchases with tenant-scoped uniqueness for idempotency.
-- 3. Implements atomic RPC public.rpc_receive_inventory_stock:
--    - Authoritative server-side batch creation and quantity increment.
--    - Immutable stock_ledger append with movement_type = 'PURCHASE'.
--    - Purchase header and purchase items creation.
--    - Append-only audit logging into public.audit_logs.
--    - Enforces strict tenant isolation, branch matching, and role authorization (OWNER, MANAGER, PHARMACIST).
--    - Blocks CASHIER role from receiving stock (FORBIDDEN_PERMISSION).
--    - Detects divergent idempotent payload reuses and rejects with IDEMPOTENCY_CONFLICT (ERRCODE 23505).
-- 4. Hardens RLS and triggers across inventory_batches, purchases, and purchase_items:
--    - Prohibits direct client INSERT/UPDATE/DELETE on inventory_batches, purchases, and purchase_items.
--    - Prevents CASHIER from selecting restricted purchases and purchase_items (cost-price protection).
--    - Enforces permanent immutability on completed purchases, purchase items, and stock ledger.
-- ==============================================================================

-- 1. PRECONDITIONS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory_batches') THEN
        RAISE EXCEPTION 'Precondition failed: public.inventory_batches missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_ledger') THEN
        RAISE EXCEPTION 'Precondition failed: public.stock_ledger missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'purchases') THEN
        RAISE EXCEPTION 'Precondition failed: public.purchases missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'purchase_items') THEN
        RAISE EXCEPTION 'Precondition failed: public.purchase_items missing.';
    END IF;
END $$;

-- 2. EXTEND purchases SCHEMA FOR IDEMPOTENCY & AUDIT INTEGRITY
ALTER TABLE public.purchases 
ADD COLUMN IF NOT EXISTS client_op_id UUID,
ADD COLUMN IF NOT EXISTS payload_hash TEXT,
ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'PENDING', 'CANCELLED')),
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(128),
ADD COLUMN IF NOT EXISTS total_cost BIGINT NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT timezone('utc', now());

-- Idempotency unique index scoped to pharmacy tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchases_pharmacy_op 
ON public.purchases(pharmacy_id, client_op_id) 
WHERE client_op_id IS NOT NULL;

-- Lookup indexes for purchases
CREATE INDEX IF NOT EXISTS idx_purchases_pharmacy_branch 
ON public.purchases(pharmacy_id, branch_id, created_at DESC);

-- Ensure purchase_items schema fields
ALTER TABLE public.purchase_items
ADD COLUMN IF NOT EXISTS unit_cost BIGINT NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
ADD COLUMN IF NOT EXISTS total_cost BIGINT NOT NULL DEFAULT 0 CHECK (total_cost >= 0);

-- Index for batch lookup in inventory_batches
CREATE INDEX IF NOT EXISTS idx_batches_product_branch_batchno 
ON public.inventory_batches(pharmacy_id, product_id, branch_id, batch_number);

-- 3. PURCHASES IMMUTABILITY TRIGGER
CREATE OR REPLACE FUNCTION public.trg_prevent_purchases_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'IMMUTABLE_LOG: Completed purchase records cannot be deleted.'
            USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'COMPLETED' THEN
            RAISE EXCEPTION 'IMMUTABLE_LOG: Completed purchase records cannot be modified.'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_purchases_immutability ON public.purchases;
CREATE TRIGGER trg_guard_purchases_immutability
BEFORE UPDATE OR DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_purchases_mutation();

-- 4. BATCH IDENTITY INTEGRITY TRIGGER
CREATE OR REPLACE FUNCTION public.trg_guard_inventory_batches_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'IMMUTABLE_BATCHES: inventory_batches cannot be deleted directly.'
            USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.pharmacy_id != OLD.pharmacy_id OR NEW.branch_id != OLD.branch_id OR NEW.product_id != OLD.product_id THEN
            RAISE EXCEPTION 'IMMUTABLE_KEY: Tenant, branch, and product identity cannot be modified.'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_inventory_batches_immutability ON public.inventory_batches;
CREATE TRIGGER trg_guard_inventory_batches_immutability
BEFORE UPDATE OR DELETE ON public.inventory_batches
FOR EACH ROW EXECUTE FUNCTION public.trg_guard_inventory_batches_mutation();

-- 5. ROW LEVEL SECURITY HARDENING (PREVENT DIRECT MUTATIONS & PROTECT FINANCIAL DATA)

-- A. inventory_batches: direct client INSERT, UPDATE, DELETE strictly denied
-- All quantity modifications and lot creations MUST occur through authoritative RPCs
DROP POLICY IF EXISTS rls_batches_insert ON public.inventory_batches;
CREATE POLICY rls_batches_insert ON public.inventory_batches FOR INSERT WITH CHECK (FALSE);

DROP POLICY IF EXISTS rls_batches_update ON public.inventory_batches;
CREATE POLICY rls_batches_update ON public.inventory_batches FOR UPDATE USING (FALSE);

DROP POLICY IF EXISTS rls_batches_delete ON public.inventory_batches;
CREATE POLICY rls_batches_delete ON public.inventory_batches FOR DELETE USING (FALSE);

-- B. purchases: direct client INSERT, UPDATE, DELETE strictly denied
DROP POLICY IF EXISTS rls_purchases_insert ON public.purchases;
CREATE POLICY rls_purchases_insert ON public.purchases FOR INSERT WITH CHECK (FALSE);

DROP POLICY IF EXISTS rls_purchases_update ON public.purchases;
CREATE POLICY rls_purchases_update ON public.purchases FOR UPDATE USING (FALSE);

DROP POLICY IF EXISTS rls_purchases_delete ON public.purchases;
CREATE POLICY rls_purchases_delete ON public.purchases FOR DELETE USING (FALSE);

-- Restrict SELECT on purchases to management roles (protects cost totals from CASHIER)
DROP POLICY IF EXISTS rls_purchases_select ON public.purchases;
CREATE POLICY rls_purchases_select ON public.purchases
FOR SELECT
USING (
    public.is_pharmacy_member(pharmacy_id)
    AND (
        public.has_pharmacy_role(pharmacy_id, 'OWNER')
        OR public.has_pharmacy_role(pharmacy_id, 'MANAGER')
        OR public.has_pharmacy_role(pharmacy_id, 'PHARMACIST')
        OR public.has_pharmacy_permission(pharmacy_id, 'purchases.manage')
        OR public.has_pharmacy_permission(pharmacy_id, 'reports.financial')
    )
);

-- C. purchase_items: direct client INSERT, UPDATE, DELETE strictly denied
DROP POLICY IF EXISTS rls_purchase_items_insert ON public.purchase_items;
CREATE POLICY rls_purchase_items_insert ON public.purchase_items FOR INSERT WITH CHECK (FALSE);

DROP POLICY IF EXISTS rls_purchase_items_update ON public.purchase_items;
CREATE POLICY rls_purchase_items_update ON public.purchase_items FOR UPDATE USING (FALSE);

DROP POLICY IF EXISTS rls_purchase_items_delete ON public.purchase_items;
CREATE POLICY rls_purchase_items_delete ON public.purchase_items FOR DELETE USING (FALSE);

-- Restrict SELECT on purchase_items to management roles (protects unit costs from CASHIER)
DROP POLICY IF EXISTS rls_purchase_items_select ON public.purchase_items;
CREATE POLICY rls_purchase_items_select ON public.purchase_items
FOR SELECT
USING (
    public.is_pharmacy_member(pharmacy_id)
    AND (
        public.has_pharmacy_role(pharmacy_id, 'OWNER')
        OR public.has_pharmacy_role(pharmacy_id, 'MANAGER')
        OR public.has_pharmacy_role(pharmacy_id, 'PHARMACIST')
        OR public.has_pharmacy_permission(pharmacy_id, 'purchases.manage')
        OR public.has_pharmacy_permission(pharmacy_id, 'reports.financial')
    )
);

-- 6. ATOMIC AUTHORITATIVE STOCK INTAKE RPC
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
SET search_path = public, pg_temp
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
    -- Canonicalizes all materially significant receipt fields and sorts multi-item payloads deterministically
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

    -- 4. Idempotency Check: if client_op_id already processed, inspect existing record
    IF p_client_op_id IS NOT NULL THEN
        SELECT p.id, p.status, p.total_cost, p.created_at, p.payload_hash
        INTO v_existing_id, status, total_cost, processed_at, v_existing_payload_hash
        FROM public.purchases p
        WHERE p.pharmacy_id = p_pharmacy_id AND p.client_op_id = p_client_op_id;

        IF FOUND THEN
            -- If payload differs from original request, reject as conflicting reuse
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
        RAISE EXCEPTION 'BRANCH_MISMATCH: Branch % does not belong to pharmacy %.', p_branch_id, p_pharmacy_id
            USING ERRCODE = '23503';
    END IF;

    -- 6. Validate Supplier (if specified)
    IF p_supplier_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.suppliers
            WHERE id = p_supplier_id AND pharmacy_id = p_pharmacy_id
        ) THEN
            RAISE EXCEPTION 'SUPPLIER_MISMATCH: Supplier % does not belong to pharmacy %.', p_supplier_id, p_pharmacy_id
                USING ERRCODE = '23503';
        END IF;
    END IF;

    -- 7. Validate Items Array
    v_item_count := jsonb_array_length(p_items);
    IF v_item_count = 0 THEN
        RAISE EXCEPTION 'EMPTY_RECEIPT: At least one item must be received.' USING ERRCODE = '22000';
    END IF;

    -- Preflight check on all items (Atomic validation before any state changes)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_qty := (v_item->>'quantity')::INT;
        v_batch_number := trim(COALESCE(v_item->>'batch_number', ''));
        v_cost_price := COALESCE((v_item->>'cost_price')::BIGINT, 0);
        v_selling_price := COALESCE((v_item->>'selling_price')::BIGINT, 0);

        -- Product must exist and belong to pharmacy
        IF NOT EXISTS (
            SELECT 1 FROM public.products
            WHERE id = v_product_id AND pharmacy_id = p_pharmacy_id
        ) THEN
            RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not exist in pharmacy %.', v_product_id, p_pharmacy_id
                USING ERRCODE = '02000';
        END IF;

        -- Quantity must be strictly positive
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: Intake quantity must be greater than zero.' USING ERRCODE = '22003';
        END IF;

        -- Batch number must be present
        IF v_batch_number = '' THEN
            RAISE EXCEPTION 'INVALID_BATCH_NUMBER: Batch number is required for all intake items.' USING ERRCODE = '22000';
        END IF;

        -- Expiry date must be valid
        IF (v_item->>'expiry_date') IS NULL OR trim(v_item->>'expiry_date') = '' THEN
            RAISE EXCEPTION 'INVALID_EXPIRY: Expiry date is required for intake.' USING ERRCODE = '22007';
        END IF;

        -- Prices cannot be negative
        IF v_cost_price < 0 THEN
            RAISE EXCEPTION 'INVALID_COST_PRICE: Cost price cannot be negative.' USING ERRCODE = '22003';
        END IF;
        IF v_selling_price < 0 THEN
            RAISE EXCEPTION 'INVALID_SELLING_PRICE: Selling price cannot be negative.' USING ERRCODE = '22003';
        END IF;

        v_calc_total_cost := v_calc_total_cost + (v_qty * v_cost_price);
    END LOOP;

    -- 8. Create Authoritative Purchase Header
    INSERT INTO public.purchases (
        id, pharmacy_id, branch_id, supplier_id,
        invoice_number, total_cost, status,
        client_op_id, payload_hash, notes, received_at, created_at
    ) VALUES (
        v_purchase_id, p_pharmacy_id, p_branch_id, p_supplier_id,
        p_invoice_number, v_calc_total_cost, 'COMPLETED',
        p_client_op_id, v_incoming_payload_hash, p_notes, v_timestamp, v_timestamp
    );

    -- 9. Process Each Line Item: Update/Create Batch, Record Purchase Item, Append Stock Ledger
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_qty := (v_item->>'quantity')::INT;
        v_batch_number := trim(v_item->>'batch_number');
        v_expiry_date := (v_item->>'expiry_date')::DATE;
        v_cost_price := COALESCE((v_item->>'cost_price')::BIGINT, 0);
        v_selling_price := COALESCE((v_item->>'selling_price')::BIGINT, 0);
        v_existing_batch_id := CASE 
            WHEN (v_item->>'batch_id') IS NOT NULL AND (v_item->>'batch_id') != '' 
            THEN (v_item->>'batch_id')::UUID 
            ELSE NULL 
        END;

        -- Check if batch exists (by explicit batch_id OR by exact (product_id, branch_id, batch_number) match)
        v_batch_id := NULL;
        IF v_existing_batch_id IS NOT NULL THEN
            SELECT id, quantity INTO v_batch_id, v_current_stock
            FROM public.inventory_batches
            WHERE id = v_existing_batch_id 
              AND pharmacy_id = p_pharmacy_id 
              AND product_id = v_product_id 
              AND branch_id = p_branch_id
            FOR UPDATE;
        END IF;

        IF v_batch_id IS NULL THEN
            SELECT id, quantity INTO v_batch_id, v_current_stock
            FROM public.inventory_batches
            WHERE pharmacy_id = p_pharmacy_id 
              AND product_id = v_product_id 
              AND branch_id = p_branch_id
              AND batch_number = v_batch_number
            FOR UPDATE;
        END IF;

        IF v_batch_id IS NOT NULL THEN
            -- Existing batch: atomically increment stock and update latest pricing/expiry
            v_new_stock := v_current_stock + v_qty;

            UPDATE public.inventory_batches
            SET quantity = v_new_stock,
                cost_price = CASE WHEN v_cost_price > 0 THEN v_cost_price ELSE cost_price END,
                selling_price = CASE WHEN v_selling_price > 0 THEN v_selling_price ELSE selling_price END,
                expiry_date = v_expiry_date,
                status = CASE WHEN v_new_stock > 0 AND status = 'DEPLETED' THEN 'ACTIVE' ELSE status END,
                updated_at = v_timestamp
            WHERE id = v_batch_id;
        ELSE
            -- New batch: generate fresh UUID and insert
            v_batch_id := gen_random_uuid();
            v_new_stock := v_qty;

            INSERT INTO public.inventory_batches (
                id, pharmacy_id, branch_id, product_id,
                batch_number, expiry_date, quantity,
                cost_price, selling_price, status,
                created_at, updated_at
            ) VALUES (
                v_batch_id, p_pharmacy_id, p_branch_id, v_product_id,
                v_batch_number, v_expiry_date, v_new_stock,
                v_cost_price, v_selling_price, 'ACTIVE',
                v_timestamp, v_timestamp
            );
        END IF;

        -- Insert Purchase Item Record
        INSERT INTO public.purchase_items (
            id, pharmacy_id, purchase_id, product_id, batch_id,
            quantity, unit_cost, total_cost, created_at
        ) VALUES (
            gen_random_uuid(), p_pharmacy_id, v_purchase_id, v_product_id, v_batch_id,
            v_qty, v_cost_price, (v_qty * v_cost_price), v_timestamp
        );

        -- Append to Immutable Stock Ledger (movement_type = 'PURCHASE')
        v_ledger_id := gen_random_uuid();
        INSERT INTO public.stock_ledger (
            id, pharmacy_id, branch_id, product_id, batch_id,
            movement_type, quantity_delta, resulting_batch_stock,
            reference_id, notes, created_at
        ) VALUES (
            v_ledger_id, p_pharmacy_id, p_branch_id, v_product_id, v_batch_id,
            'PURCHASE', v_qty, v_new_stock,
            v_purchase_id, 'Stock intake: ' || COALESCE(p_invoice_number, 'Lot ' || v_batch_number), v_timestamp
        );
    END LOOP;

    -- 10. Audit Logging
    INSERT INTO public.audit_logs (
        pharmacy_id, actor_id, actor_type, action,
        target_entity, target_id, new_data, created_at
    ) VALUES (
        p_pharmacy_id, auth.uid(), 'USER', 'STOCK_INTAKE_RECEIVED',
        'purchases', v_purchase_id::TEXT,
        jsonb_build_object(
            'items_count', v_item_count,
            'total_cost', v_calc_total_cost,
            'invoice_number', p_invoice_number,
            'branch_id', p_branch_id,
            'supplier_id', p_supplier_id
        ),
        v_timestamp
    );

    -- 11. Return Results
    purchase_id := v_purchase_id;
    status := 'COMPLETED';
    total_items := v_item_count;
    total_cost := v_calc_total_cost;
    processed_at := v_timestamp;
    RETURN NEXT;
END;
$$;

-- Revoke all privileges from public and anon; grant EXECUTE only to authenticated role
REVOKE ALL ON FUNCTION public.rpc_receive_inventory_stock(UUID, UUID, JSONB, UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_receive_inventory_stock(UUID, UUID, JSONB, UUID, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_receive_inventory_stock(UUID, UUID, JSONB, UUID, TEXT, TEXT, UUID) TO authenticated;
