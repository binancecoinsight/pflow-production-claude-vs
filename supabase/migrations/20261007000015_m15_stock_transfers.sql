-- ============================================================================
-- MIGRATION M-15: INVENTORY STOCK TRANSFERS
-- Target: supabase/migrations/20261007000015_m15_stock_transfers.sql
-- Dependencies: M-1, M-2, M-5, M-6, M-7, M-13, M-14
--
-- Implements Phase 5D-17: Inter-Branch Inventory Stock Transfers
-- 1. Creates public.stock_transfers header table:
--    - Strict lifecycle: DISPATCHED -> RECEIVED (No CANCELLED, no deletion)
--    - Branch distinction: source_branch_id <> destination_branch_id
--    - Composite foreign keys guarantee source and destination branches belong to same pharmacy
--    - Separate cryptographic idempotency for dispatch and receive
--    - Receive header fields: receive_notes, updated_at
-- 2. Creates public.stock_transfer_items line items table:
--    - Composite parent foreign key: (pharmacy_id, source_branch_id, destination_branch_id, transfer_id)
--    - Composite product foreign key: (pharmacy_id, product_id)
--    - Composite source batch foreign key: (pharmacy_id, source_branch_id, product_id, source_batch_id)
--    - Composite destination batch foreign key: (pharmacy_id, destination_branch_id, product_id, destination_batch_id)
--    - quantity_received tracks verified quantity (NULL on DISPATCHED, equals quantity on RECEIVED)
--    - ON DELETE RESTRICT on all foreign keys to protect historical records
-- 3. Immutability triggers:
--    - Blocks DELETE on transfers and items
--    - Guards DISPATCHED state: receive fields (including receive_notes) must remain NULL while DISPATCHED
--    - Guards child item mutation: parent transfer status must be RECEIVED before populating destination_batch_id / quantity_received
--    - Blocks all mutations once RECEIVED (terminal state)
-- 4. RLS policies:
--    - Block direct client mutations (INSERT, UPDATE, DELETE WITH CHECK FALSE / USING FALSE)
--    - Read access scoped to authorized pharmacy members
-- 5. Authoritative RPCs:
--    - public.rpc_dispatch_stock_transfer: Deducts source batch stock, appends TRANSFER_OUT ledger, creates transfer
--    - public.rpc_receive_stock_transfer: All-or-nothing receipt, protects destination batch expiry conflicts,
--      handles destination batch creation race via ON CONFLICT DO UPDATE, appends TRANSFER_IN ledger
-- ============================================================================

-- 1. PRECONDITIONS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pharmacies') THEN
        RAISE EXCEPTION 'Precondition failed: public.pharmacies table missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'branches') THEN
        RAISE EXCEPTION 'Precondition failed: public.branches table missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
        RAISE EXCEPTION 'Precondition failed: public.products table missing.';
    END IF;
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

-- Preconditions verified

-- Extend stock_ledger movement_type CHECK constraint to support TRANSFER_OUT and TRANSFER_IN
ALTER TABLE public.stock_ledger DROP CONSTRAINT IF EXISTS stock_ledger_movement_type_check;
ALTER TABLE public.stock_ledger ADD CONSTRAINT stock_ledger_movement_type_check CHECK (movement_type IN (
    'PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 
    'DEFICIT_RECONCILIATION', 'OPENING_BALANCE',
    'TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER'
));

-- Ensure natural unique constraint exists on inventory_batches for destination batch creation race protection
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_inventory_batches_branch_batch'
    ) THEN
        ALTER TABLE public.inventory_batches 
        ADD CONSTRAINT uq_inventory_batches_branch_batch 
        UNIQUE (pharmacy_id, product_id, branch_id, batch_number);
    END IF;
EXCEPTION
    WHEN duplicate_table OR duplicate_object THEN
        NULL;
END $$;

-- Ensure supporting unique constraint exists on inventory_batches for composite source and destination batch foreign keys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_batches_pharmacy_branch_prod_id'
    ) THEN
        ALTER TABLE public.inventory_batches 
        ADD CONSTRAINT uq_batches_pharmacy_branch_prod_id 
        UNIQUE (pharmacy_id, branch_id, product_id, id);
    END IF;
EXCEPTION
    WHEN duplicate_table OR duplicate_object THEN
        NULL;
END $$;

-- 2. OBJECTS CREATED: public.stock_transfers
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE RESTRICT,
    source_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    destination_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    status VARCHAR(16) NOT NULL DEFAULT 'DISPATCHED' CHECK (status IN ('DISPATCHED', 'RECEIVED')),
    notes TEXT,
    dispatched_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    dispatched_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    dispatch_client_op_id UUID NOT NULL,
    dispatch_payload_hash TEXT NOT NULL,
    received_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
    received_at TIMESTAMPTZ,
    receive_client_op_id UUID,
    receive_payload_hash TEXT,
    receive_notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CHECK (source_branch_id <> destination_branch_id),
    CONSTRAINT fk_stock_transfers_source_branch FOREIGN KEY (pharmacy_id, source_branch_id) 
        REFERENCES public.branches(pharmacy_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_stock_transfers_dest_branch FOREIGN KEY (pharmacy_id, destination_branch_id) 
        REFERENCES public.branches(pharmacy_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_stock_transfers_parent UNIQUE (pharmacy_id, source_branch_id, id),
    CONSTRAINT uq_stock_transfers_parent_route UNIQUE (pharmacy_id, source_branch_id, destination_branch_id, id),
    CONSTRAINT uq_stock_transfers_dest UNIQUE (pharmacy_id, destination_branch_id, id),
    CONSTRAINT uq_stock_transfers_pharmacy_id UNIQUE (pharmacy_id, id),
    CONSTRAINT uq_stock_transfers_dispatch_client_op UNIQUE (pharmacy_id, dispatch_client_op_id),
    CONSTRAINT uq_stock_transfers_receive_client_op UNIQUE (pharmacy_id, receive_client_op_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_stock_transfers_receive_client_op 
ON public.stock_transfers (pharmacy_id, receive_client_op_id) 
WHERE receive_client_op_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_transfers_pharmacy_status 
ON public.stock_transfers (pharmacy_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_source_branch 
ON public.stock_transfers (pharmacy_id, source_branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_dest_branch 
ON public.stock_transfers (pharmacy_id, destination_branch_id, created_at DESC);

-- 3. OBJECTS CREATED: public.stock_transfer_items
CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE RESTRICT,
    transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE RESTRICT,
    source_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    destination_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL,
    source_batch_id UUID NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
    destination_batch_id UUID REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
    batch_number VARCHAR(64) NOT NULL,
    expiry_date DATE NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    quantity_received INT NULL,
    cost_price BIGINT NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    selling_price BIGINT NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CHECK (quantity_received IS NULL OR quantity_received = quantity),
    CHECK (
        (destination_batch_id IS NULL AND quantity_received IS NULL)
        OR
        (destination_batch_id IS NOT NULL AND quantity_received = quantity)
    ),
    CONSTRAINT fk_transfer_items_parent FOREIGN KEY (pharmacy_id, source_branch_id, destination_branch_id, transfer_id)
        REFERENCES public.stock_transfers(pharmacy_id, source_branch_id, destination_branch_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_transfer_items_product FOREIGN KEY (pharmacy_id, product_id)
        REFERENCES public.products(pharmacy_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_transfer_items_source_batch FOREIGN KEY (pharmacy_id, source_branch_id, product_id, source_batch_id)
        REFERENCES public.inventory_batches(pharmacy_id, branch_id, product_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_transfer_items_dest_batch FOREIGN KEY (pharmacy_id, destination_branch_id, product_id, destination_batch_id)
        REFERENCES public.inventory_batches(pharmacy_id, branch_id, product_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer 
ON public.stock_transfer_items (pharmacy_id, transfer_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product 
ON public.stock_transfer_items (pharmacy_id, product_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_source_batch 
ON public.stock_transfer_items (pharmacy_id, source_batch_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_dest_batch 
ON public.stock_transfer_items (pharmacy_id, destination_batch_id);

-- 4. IMMUTABILITY & LIFECYCLE TRIGGERS
CREATE OR REPLACE FUNCTION public.trg_guard_stock_transfers_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Historical deletion protection
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'IMMUTABLE_RECORD: stock_transfers records are immutable and cannot be deleted.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Once RECEIVED, transfer is terminal and completely immutable
        IF OLD.status = 'RECEIVED' THEN
            RAISE EXCEPTION 'IMMUTABLE_RECORD: Received stock transfers are terminal and immutable.'
                USING ERRCODE = '42501';
        END IF;

        IF OLD.status = 'DISPATCHED' THEN
            IF NEW.status = 'DISPATCHED' THEN
                -- While DISPATCHED, receive fields must strictly remain NULL
                IF NEW.received_at IS NOT NULL OR NEW.received_by IS NOT NULL OR 
                   NEW.receive_client_op_id IS NOT NULL OR NEW.receive_payload_hash IS NOT NULL OR
                   NEW.receive_notes IS NOT NULL THEN
                    RAISE EXCEPTION 'INVALID_TRANSITION: Receive fields cannot be set while transfer is DISPATCHED.'
                        USING ERRCODE = '22023';
                END IF;
                -- Dispatch details cannot be mutated
                IF NEW.id <> OLD.id OR NEW.pharmacy_id <> OLD.pharmacy_id OR 
                   NEW.source_branch_id <> OLD.source_branch_id OR NEW.destination_branch_id <> OLD.destination_branch_id OR
                   NEW.dispatched_by <> OLD.dispatched_by OR NEW.dispatched_at <> OLD.dispatched_at OR
                   NEW.dispatch_client_op_id <> OLD.dispatch_client_op_id OR NEW.dispatch_payload_hash <> OLD.dispatch_payload_hash OR
                   COALESCE(NEW.notes, '') <> COALESCE(OLD.notes, '') THEN
                    RAISE EXCEPTION 'IMMUTABLE_RECORD: Dispatched transfer details cannot be modified.'
                        USING ERRCODE = '42501';
                END IF;
            ELSIF NEW.status = 'RECEIVED' THEN
                -- Transition to RECEIVED requires complete receive metadata
                IF NEW.received_at IS NULL OR NEW.received_by IS NULL OR 
                   NEW.receive_client_op_id IS NULL OR NEW.receive_payload_hash IS NULL THEN
                    RAISE EXCEPTION 'INVALID_TRANSITION: Receive metadata is mandatory when marking transfer RECEIVED.'
                        USING ERRCODE = '22023';
                END IF;
                -- Dispatch details must remain completely untouched
                IF NEW.id <> OLD.id OR NEW.pharmacy_id <> OLD.pharmacy_id OR 
                   NEW.source_branch_id <> OLD.source_branch_id OR NEW.destination_branch_id <> OLD.destination_branch_id OR
                   NEW.dispatched_by <> OLD.dispatched_by OR NEW.dispatched_at <> OLD.dispatched_at OR
                   NEW.dispatch_client_op_id <> OLD.dispatch_client_op_id OR NEW.dispatch_payload_hash <> OLD.dispatch_payload_hash OR
                   COALESCE(NEW.notes, '') <> COALESCE(OLD.notes, '') THEN
                    RAISE EXCEPTION 'IMMUTABLE_RECORD: Dispatch metadata cannot be modified upon receipt.'
                        USING ERRCODE = '42501';
                END IF;
            ELSE
                RAISE EXCEPTION 'INVALID_TRANSITION: Permitted lifecycle transitions are strictly DISPATCHED -> RECEIVED.'
                    USING ERRCODE = '22023';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_stock_transfers_lifecycle_trigger ON public.stock_transfers;
CREATE TRIGGER trg_guard_stock_transfers_lifecycle_trigger
BEFORE UPDATE OR DELETE ON public.stock_transfers
FOR EACH ROW EXECUTE FUNCTION public.trg_guard_stock_transfers_lifecycle();

CREATE OR REPLACE FUNCTION public.trg_guard_stock_transfer_items_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_parent_status VARCHAR(16);
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'IMMUTABLE_RECORD: stock_transfer_items records cannot be deleted.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- 1. Inspect parent transfer status using OLD.transfer_id
        SELECT status INTO v_parent_status
        FROM public.stock_transfers
        WHERE id = OLD.transfer_id;

        -- 2. If parent transfer is DISPATCHED, completely reject populating receipt fields
        IF v_parent_status = 'DISPATCHED' THEN
            IF NEW.destination_batch_id IS NOT NULL OR NEW.quantity_received IS NOT NULL THEN
                RAISE EXCEPTION 'INVALID_TRANSITION: Cannot populate receive fields while parent transfer status is DISPATCHED.'
                    USING ERRCODE = '22023';
            END IF;
            RAISE EXCEPTION 'IMMUTABLE_RECORD: stock_transfer_items records cannot be modified while DISPATCHED.'
                USING ERRCODE = '42501';
        END IF;

        -- 3. Only when parent transfer status is RECEIVED may the atomic transition occur
        IF v_parent_status = 'RECEIVED' THEN
            -- If already received previously, item is permanently immutable
            IF OLD.destination_batch_id IS NOT NULL OR OLD.quantity_received IS NOT NULL THEN
                RAISE EXCEPTION 'IMMUTABLE_RECORD: Already received transfer items cannot be modified.'
                    USING ERRCODE = '42501';
            END IF;

            -- Permit atomic NULL -> valid transition
            IF OLD.destination_batch_id IS NULL AND OLD.quantity_received IS NULL 
               AND NEW.destination_batch_id IS NOT NULL AND NEW.quantity_received = OLD.quantity THEN
                IF NEW.id <> OLD.id OR NEW.pharmacy_id <> OLD.pharmacy_id OR 
                   NEW.transfer_id <> OLD.transfer_id OR NEW.source_branch_id <> OLD.source_branch_id OR
                   NEW.destination_branch_id <> OLD.destination_branch_id OR
                   NEW.product_id <> OLD.product_id OR NEW.source_batch_id <> OLD.source_batch_id OR
                   NEW.batch_number <> OLD.batch_number OR NEW.expiry_date <> OLD.expiry_date OR
                   NEW.quantity <> OLD.quantity OR NEW.cost_price <> OLD.cost_price OR
                   NEW.selling_price <> OLD.selling_price THEN
                    RAISE EXCEPTION 'IMMUTABLE_RECORD: stock_transfer_items line attributes cannot be modified.'
                        USING ERRCODE = '42501';
                END IF;
            ELSE
                RAISE EXCEPTION 'IMMUTABLE_RECORD: stock_transfer_items records cannot be modified.'
                    USING ERRCODE = '42501';
            END IF;
        ELSE
            RAISE EXCEPTION 'IMMUTABLE_RECORD: Invalid parent transfer status for item update.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_stock_transfer_items_immutability_trigger ON public.stock_transfer_items;
CREATE TRIGGER trg_guard_stock_transfer_items_immutability_trigger
BEFORE UPDATE OR DELETE ON public.stock_transfer_items
FOR EACH ROW EXECUTE FUNCTION public.trg_guard_stock_transfer_items_immutability();

-- 5. ROW LEVEL SECURITY
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

-- Block direct mutations
DROP POLICY IF EXISTS rls_stock_transfers_insert ON public.stock_transfers;
CREATE POLICY rls_stock_transfers_insert ON public.stock_transfers FOR INSERT WITH CHECK (FALSE);

DROP POLICY IF EXISTS rls_stock_transfers_update ON public.stock_transfers;
CREATE POLICY rls_stock_transfers_update ON public.stock_transfers FOR UPDATE USING (FALSE);

DROP POLICY IF EXISTS rls_stock_transfers_delete ON public.stock_transfers;
CREATE POLICY rls_stock_transfers_delete ON public.stock_transfers FOR DELETE USING (FALSE);

DROP POLICY IF EXISTS rls_stock_transfers_select ON public.stock_transfers;
CREATE POLICY rls_stock_transfers_select ON public.stock_transfers
FOR SELECT
USING (
    public.is_pharmacy_member(pharmacy_id)
    AND (
        public.has_pharmacy_role(pharmacy_id, 'OWNER')
        OR public.has_pharmacy_role(pharmacy_id, 'MANAGER')
        OR public.has_pharmacy_permission(pharmacy_id, 'inventory.read')
        OR public.has_pharmacy_permission(pharmacy_id, 'inventory.adjust')
        OR public.has_pharmacy_permission(pharmacy_id, 'inventory.write')
    )
);

DROP POLICY IF EXISTS rls_stock_transfer_items_insert ON public.stock_transfer_items;
CREATE POLICY rls_stock_transfer_items_insert ON public.stock_transfer_items FOR INSERT WITH CHECK (FALSE);

DROP POLICY IF EXISTS rls_stock_transfer_items_update ON public.stock_transfer_items;
CREATE POLICY rls_stock_transfer_items_update ON public.stock_transfer_items FOR UPDATE USING (FALSE);

DROP POLICY IF EXISTS rls_stock_transfer_items_delete ON public.stock_transfer_items;
CREATE POLICY rls_stock_transfer_items_delete ON public.stock_transfer_items FOR DELETE USING (FALSE);

DROP POLICY IF EXISTS rls_stock_transfer_items_select ON public.stock_transfer_items;
CREATE POLICY rls_stock_transfer_items_select ON public.stock_transfer_items
FOR SELECT
USING (
    public.is_pharmacy_member(pharmacy_id)
    AND (
        public.has_pharmacy_role(pharmacy_id, 'OWNER')
        OR public.has_pharmacy_role(pharmacy_id, 'MANAGER')
        OR public.has_pharmacy_permission(pharmacy_id, 'inventory.read')
        OR public.has_pharmacy_permission(pharmacy_id, 'inventory.adjust')
        OR public.has_pharmacy_permission(pharmacy_id, 'inventory.write')
    )
);

REVOKE INSERT, UPDATE, DELETE ON public.stock_transfers FROM authenticated, anon, public;
GRANT SELECT ON public.stock_transfers TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.stock_transfer_items FROM authenticated, anon, public;
GRANT SELECT ON public.stock_transfer_items TO authenticated;

-- 6. AUTHORITATIVE DISPATCH RPC
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
SET search_path = public, pg_temp
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

    -- 4. Verify Role Authorization: OWNER is pharmacy-wide; MANAGER and PHARMACIST must match default_branch_id
    IF public.has_pharmacy_role(p_pharmacy_id, 'OWNER') THEN
        -- Permitted pharmacy-wide across any source branch
        NULL;
    ELSIF public.has_pharmacy_role(p_pharmacy_id, 'MANAGER') OR public.has_pharmacy_role(p_pharmacy_id, 'PHARMACIST') THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.pharmacy_members
            WHERE user_id = auth.uid()
              AND pharmacy_id = p_pharmacy_id
              AND default_branch_id = p_source_branch_id
              AND status = 'ACTIVE'
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN_BRANCH: Caller is not assigned to source branch.' USING ERRCODE = '42501';
        END IF;
    ELSE
        RAISE EXCEPTION 'FORBIDDEN_PERMISSION: Caller lacks authority to dispatch stock transfers.' USING ERRCODE = '42501';
    END IF;

    -- 5. Validate Branch Rules
    IF p_source_branch_id = p_destination_branch_id THEN
        RAISE EXCEPTION 'SAME_BRANCH_TRANSFER: Source and destination branches cannot be identical.' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.branches WHERE id = p_source_branch_id AND pharmacy_id = p_pharmacy_id
    ) THEN
        RAISE EXCEPTION 'SOURCE_BRANCH_NOT_FOUND: Source branch % does not belong to pharmacy.', p_source_branch_id USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.branches WHERE id = p_destination_branch_id AND pharmacy_id = p_pharmacy_id
    ) THEN
        RAISE EXCEPTION 'DESTINATION_BRANCH_NOT_FOUND: Destination branch % does not belong to pharmacy.', p_destination_branch_id USING ERRCODE = '23503';
    END IF;

    -- 6. Validate Items Array
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'INVALID_ITEMS: Transfer must include at least one item.' USING ERRCODE = '22023';
    END IF;

    v_total_items := jsonb_array_length(p_items);
    v_clean_notes := COALESCE(trim(p_notes), '');

    -- Verify no duplicate source batch items in transfer payload
    IF (
        SELECT COUNT(DISTINCT (elem->>'source_batch_id')::UUID)
        FROM jsonb_array_elements(p_items) AS elem
        WHERE (elem->>'source_batch_id') IS NOT NULL
    ) <> v_total_items THEN
        RAISE EXCEPTION 'DUPLICATE_SOURCE_BATCH: Duplicate source batch entries are not permitted in transfer payload.'
            USING ERRCODE = '22023';
    END IF;

    -- 7. Deterministic Canonical Payload Hash (SHA-256 lowercase 64-character hex, canonical source_batch_id)
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

        -- Replay: Return original authoritative dispatch result
        RETURN QUERY SELECT v_existing_id, v_existing_status, v_existing_total_items, v_existing_dispatched_at;
        RETURN;
    END IF;

    -- 9. Insert Transfer Header (DISPATCHED status)
    INSERT INTO public.stock_transfers (
        id, pharmacy_id, source_branch_id, destination_branch_id,
        status, notes, dispatched_by, dispatched_at,
        dispatch_client_op_id, dispatch_payload_hash,
        receive_notes, updated_at, created_at
    ) VALUES (
        v_transfer_id, p_pharmacy_id, p_source_branch_id, p_destination_branch_id,
        'DISPATCHED', CASE WHEN v_clean_notes = '' THEN NULL ELSE v_clean_notes END,
        auth.uid(), v_timestamp,
        p_client_op_id, v_incoming_payload_hash,
        NULL, v_timestamp, v_timestamp
    );

    -- 10. Process Each Item (Lock source batch, verify stock, deduct, append items & ledger)
    -- Deterministic ascending UUID locking order to reduce deadlocks
    FOR v_item IN
        SELECT product_id, source_batch_id, quantity
        FROM jsonb_to_recordset(p_items) AS x(
            product_id UUID,
            source_batch_id UUID,
            quantity INT
        )
        ORDER BY source_batch_id ASC
    LOOP
        IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: Item quantity must be a positive integer.' USING ERRCODE = '22003';
        END IF;

        IF v_item.product_id IS NULL OR v_item.source_batch_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_ITEM: product_id and source_batch_id are mandatory.' USING ERRCODE = '22023';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.products WHERE id = v_item.product_id AND pharmacy_id = p_pharmacy_id
        ) THEN
            RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not belong to pharmacy.', v_item.product_id USING ERRCODE = '23503';
        END IF;

        -- Pessimistic row locking on source batch in deterministic order
        SELECT b.quantity, b.batch_number, b.expiry_date, b.cost_price, b.selling_price, b.status
        INTO v_source_current_stock, v_batch_number, v_expiry_date, v_cost_price, v_selling_price, v_batch_status
        FROM public.inventory_batches b
        WHERE b.id = v_item.source_batch_id
          AND b.pharmacy_id = p_pharmacy_id
          AND b.branch_id = p_source_branch_id
          AND b.product_id = v_item.product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'BATCH_NOT_FOUND: Batch % does not belong to pharmacy, source branch, and product.', v_item.source_batch_id
                USING ERRCODE = '23503';
        END IF;

        IF v_batch_status IN ('RECALLED', 'ARCHIVED') THEN
            RAISE EXCEPTION 'BATCH_STATUS_INVALID: Source batch % is % and cannot be dispatched.',
                v_item.source_batch_id, v_batch_status
                USING ERRCODE = '22023';
        END IF;

        -- Negative stock enforcement: source branch cannot dispatch more than available physical inventory
        IF v_source_current_stock < v_item.quantity THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Batch % has % available, requested %.',
                v_item.source_batch_id, v_source_current_stock, v_item.quantity USING ERRCODE = '22003';
        END IF;

        v_source_new_stock := v_source_current_stock - v_item.quantity;

        -- Deduct stock from source batch
        UPDATE public.inventory_batches
        SET quantity = v_source_new_stock,
            status = CASE WHEN v_source_new_stock <= 0 THEN 'DEPLETED' ELSE status END,
            updated_at = v_timestamp
        WHERE id = v_item.source_batch_id;

        -- Insert Line Item with authoritative destination_branch_id and NULL quantity_received
        INSERT INTO public.stock_transfer_items (
            id, pharmacy_id, transfer_id, source_branch_id, destination_branch_id,
            product_id, source_batch_id, destination_batch_id,
            batch_number, expiry_date, quantity, quantity_received,
            cost_price, selling_price, created_at
        ) VALUES (
            gen_random_uuid(), p_pharmacy_id, v_transfer_id, p_source_branch_id, p_destination_branch_id,
            v_item.product_id, v_item.source_batch_id, NULL,
            v_batch_number, v_expiry_date, v_item.quantity, NULL,
            v_cost_price, v_selling_price, v_timestamp
        );

        -- Append Immutable Stock Ledger Movement at Source Branch
        INSERT INTO public.stock_ledger (
            id, pharmacy_id, branch_id, product_id, batch_id,
            movement_type, quantity_delta, resulting_batch_stock,
            reference_id, notes, created_at
        ) VALUES (
            gen_random_uuid(), p_pharmacy_id, p_source_branch_id, v_item.product_id, v_item.source_batch_id,
            'TRANSFER_OUT', -v_item.quantity, v_source_new_stock,
            v_transfer_id, 'Stock Transfer Dispatch to branch ' || p_destination_branch_id::TEXT, v_timestamp
        );
    END LOOP;

    -- 11. Append Audit Log
    INSERT INTO public.audit_logs (
        id, pharmacy_id, actor_id, actor_type,
        action, target_entity, target_id,
        new_data, created_at
    ) VALUES (
        gen_random_uuid(), p_pharmacy_id, auth.uid(), 'USER',
        'STOCK_TRANSFER_DISPATCHED', 'stock_transfers', v_transfer_id::TEXT,
        jsonb_build_object(
            'transfer_id', v_transfer_id,
            'source_branch_id', p_source_branch_id,
            'destination_branch_id', p_destination_branch_id,
            'total_items', v_total_items,
            'dispatch_client_op_id', p_client_op_id
        ),
        v_timestamp
    );

    -- 12. Return Authoritative Result
    RETURN QUERY SELECT v_transfer_id, 'DISPATCHED'::VARCHAR(16), v_total_items, v_timestamp;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_dispatch_stock_transfer FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_dispatch_stock_transfer TO authenticated;

-- 7. AUTHORITATIVE RECEIVE RPC
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
SET search_path = public, pg_temp
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

    -- 4. Lock Transfer Header Row (FOR UPDATE)
    SELECT t.id, t.source_branch_id, t.destination_branch_id, t.status,
           t.received_at, t.receive_client_op_id, t.receive_payload_hash,
           (SELECT COUNT(*)::INT FROM public.stock_transfer_items WHERE transfer_id = t.id)
    INTO v_transfer_id, v_source_branch_id, v_dest_branch_id, v_current_status,
         v_existing_received_at, v_existing_rec_op_id, v_existing_rec_hash, v_total_items
    FROM public.stock_transfers t
    WHERE t.id = p_transfer_id AND t.pharmacy_id = p_pharmacy_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TRANSFER_NOT_FOUND: Stock transfer % not found in pharmacy.', p_transfer_id USING ERRCODE = '23503';
    END IF;

    -- 5. Caller Branch Authorization at Destination Branch
    IF public.has_pharmacy_role(p_pharmacy_id, 'OWNER') THEN
        -- OWNER has pharmacy-wide receive authority across any destination branch
        NULL;
    ELSIF public.has_pharmacy_role(p_pharmacy_id, 'MANAGER') OR public.has_pharmacy_role(p_pharmacy_id, 'PHARMACIST') THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.pharmacy_members
            WHERE user_id = auth.uid()
              AND pharmacy_id = p_pharmacy_id
              AND default_branch_id = v_dest_branch_id
              AND status = 'ACTIVE'
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN_BRANCH: Caller is not assigned to destination branch.' USING ERRCODE = '42501';
        END IF;
    ELSE
        RAISE EXCEPTION 'FORBIDDEN_PERMISSION: Caller lacks authority to receive stock transfers.' USING ERRCODE = '42501';
    END IF;

    v_clean_notes := COALESCE(trim(p_notes), '');

    -- 6. Deterministic Canonical Payload Hash for Receipt
    SELECT encode(sha256(
        jsonb_build_object(
            'client_op_id', lower(p_client_op_id::TEXT),
            'notes', v_clean_notes,
            'pharmacy_id', lower(p_pharmacy_id::TEXT),
            'transfer_id', lower(p_transfer_id::TEXT)
        )::TEXT::bytea
    ), 'hex')
    INTO v_incoming_payload_hash;

    -- 7. Idempotency Check on receive_client_op_id
    IF v_current_status = 'RECEIVED' THEN
        IF v_existing_rec_op_id = p_client_op_id THEN
            IF v_existing_rec_hash <> v_incoming_payload_hash THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: receive_client_op_id % already processed with divergent payload.', p_client_op_id
                    USING ERRCODE = '23505';
            END IF;

            -- Replay: Return original authoritative receive result
            RETURN QUERY SELECT v_transfer_id, 'RECEIVED'::VARCHAR(16), v_total_items, v_existing_received_at;
            RETURN;
        ELSE
            RAISE EXCEPTION 'TRANSFER_ALREADY_RECEIVED: Stock transfer % is already in RECEIVED status.', p_transfer_id
                USING ERRCODE = '22023';
        END IF;
    END IF;

    -- Conflicting client_op_id reuse check across other transfers
    IF EXISTS (
        SELECT 1 FROM public.stock_transfers
        WHERE pharmacy_id = p_pharmacy_id AND receive_client_op_id = p_client_op_id AND id <> p_transfer_id
    ) THEN
        RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: receive_client_op_id % already used on another transfer.', p_client_op_id
            USING ERRCODE = '23505';
    END IF;

    -- Verify transfer is in DISPATCHED status
    IF v_current_status <> 'DISPATCHED' THEN
        RAISE EXCEPTION 'INVALID_TRANSFER_STATUS: Only DISPATCHED transfers can be received.' USING ERRCODE = '22023';
    END IF;

    -- 8. Update Transfer Header to RECEIVED FIRST so child item trigger validates parent status = RECEIVED
    UPDATE public.stock_transfers
    SET status = 'RECEIVED',
        received_by = auth.uid(),
        received_at = v_timestamp,
        receive_client_op_id = p_client_op_id,
        receive_payload_hash = v_incoming_payload_hash,
        receive_notes = CASE WHEN v_clean_notes = '' THEN NULL ELSE v_clean_notes END,
        updated_at = v_timestamp
    WHERE id = p_transfer_id;

    -- 9. All-Or-Nothing Receipt of Transfer Items (deterministic ascending order)
    FOR v_item IN
        SELECT id, product_id, source_batch_id, batch_number, expiry_date, quantity, cost_price, selling_price
        FROM public.stock_transfer_items
        WHERE transfer_id = p_transfer_id AND pharmacy_id = p_pharmacy_id
        ORDER BY source_batch_id ASC
    LOOP
        -- Check if destination batch already exists
        SELECT id, quantity, expiry_date, cost_price, selling_price, status
        INTO v_dest_batch_id, v_dest_current_stock, v_dest_expiry, v_dest_cost, v_dest_selling, v_dest_status
        FROM public.inventory_batches
        WHERE pharmacy_id = p_pharmacy_id
          AND product_id = v_item.product_id
          AND branch_id = v_dest_branch_id
          AND batch_number = v_item.batch_number
        FOR UPDATE;

        IF FOUND THEN
            -- Destination Expiry Conflict Protection
            IF v_dest_expiry <> v_item.expiry_date THEN
                RAISE EXCEPTION 'BATCH_METADATA_CONFLICT: Destination batch % exists with expiry % differing from incoming transfer expiry %.',
                    v_item.batch_number, v_dest_expiry, v_item.expiry_date
                    USING ERRCODE = '22023';
            END IF;

            -- Inactive/Recalled Batch Protection
            IF v_dest_status IN ('RECALLED', 'ARCHIVED') THEN
                RAISE EXCEPTION 'BATCH_STATUS_INVALID: Destination batch % is % and cannot receive inventory.',
                    v_item.batch_number, v_dest_status
                    USING ERRCODE = '22023';
            END IF;

            v_dest_new_stock := v_dest_current_stock + v_item.quantity;

            -- Increment destination batch quantity; preserve existing destination batch pricing
            UPDATE public.inventory_batches
            SET quantity = v_dest_new_stock,
                status = CASE WHEN v_dest_new_stock > 0 AND status = 'DEPLETED' THEN 'ACTIVE' ELSE status END,
                updated_at = v_timestamp
            WHERE id = v_dest_batch_id;
        ELSE
            -- Destination batch creation race protection (INSERT ... ON CONFLICT DO UPDATE)
            v_dest_batch_id := gen_random_uuid();
            v_dest_new_stock := v_item.quantity;

            INSERT INTO public.inventory_batches (
                id, pharmacy_id, branch_id, product_id,
                batch_number, expiry_date, quantity,
                cost_price, selling_price, status,
                created_at, updated_at
            ) VALUES (
                v_dest_batch_id, p_pharmacy_id, v_dest_branch_id, v_item.product_id,
                v_item.batch_number, v_item.expiry_date, v_item.quantity,
                v_item.cost_price, v_item.selling_price, 'ACTIVE',
                v_timestamp, v_timestamp
            )
            ON CONFLICT (pharmacy_id, product_id, branch_id, batch_number)
            DO UPDATE SET
                quantity = inventory_batches.quantity + EXCLUDED.quantity,
                status = CASE WHEN (inventory_batches.quantity + EXCLUDED.quantity) > 0 AND inventory_batches.status = 'DEPLETED' THEN 'ACTIVE' ELSE inventory_batches.status END,
                updated_at = v_timestamp
            RETURNING id, quantity INTO v_dest_batch_id, v_dest_new_stock;
        END IF;

        -- Associate line item with destination batch and populate quantity_received atomically
        UPDATE public.stock_transfer_items
        SET destination_batch_id = v_dest_batch_id,
            quantity_received = v_item.quantity
        WHERE id = v_item.id;

        -- Append Immutable Stock Ledger Movement at Destination Branch
        INSERT INTO public.stock_ledger (
            id, pharmacy_id, branch_id, product_id, batch_id,
            movement_type, quantity_delta, resulting_batch_stock,
            reference_id, notes, created_at
        ) VALUES (
            gen_random_uuid(), p_pharmacy_id, v_dest_branch_id, v_item.product_id, v_dest_batch_id,
            'TRANSFER_IN', v_item.quantity, v_dest_new_stock,
            p_transfer_id, 'Stock Transfer Received from branch ' || v_source_branch_id::TEXT, v_timestamp
        );
    END LOOP;

    -- 10. Append Audit Log
    INSERT INTO public.audit_logs (
        id, pharmacy_id, actor_id, actor_type,
        action, target_entity, target_id,
        new_data, created_at
    ) VALUES (
        gen_random_uuid(), p_pharmacy_id, auth.uid(), 'USER',
        'STOCK_TRANSFER_RECEIVED', 'stock_transfers', p_transfer_id::TEXT,
        jsonb_build_object(
            'transfer_id', p_transfer_id,
            'source_branch_id', v_source_branch_id,
            'destination_branch_id', v_dest_branch_id,
            'total_items', v_total_items,
            'receive_client_op_id', p_client_op_id,
            'receive_notes', v_clean_notes
        ),
        v_timestamp
    );

    -- 11. Return Authoritative Result
    RETURN QUERY SELECT p_transfer_id, 'RECEIVED'::VARCHAR(16), v_total_items, v_timestamp;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_receive_stock_transfer FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_receive_stock_transfer TO authenticated;
