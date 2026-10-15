-- ============================================================================
-- MIGRATION M-6: SYNC JOURNAL, AUDIT INFRASTRUCTURE & ATOMIC RPC
-- Target: supabase/migrations/20261004000006_m6_sync_audit.sql
-- Dependencies: M-1 through M-5
-- ============================================================================

-- 1. PRECONDITIONS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_ledger') THEN
        RAISE EXCEPTION 'Precondition failed: public.stock_ledger missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'devices') THEN
        RAISE EXCEPTION 'Precondition failed: public.devices missing.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sync_journal') THEN
        RAISE EXCEPTION 'Precondition failed: public.sync_journal already exists.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
        RAISE EXCEPTION 'Precondition failed: public.audit_logs already exists.';
    END IF;
END $$;

-- 2. OBJECTS CREATED: sync_journal (Authoritative Idempotency Barrier)
CREATE TABLE public.sync_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_op_id UUID NOT NULL,
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE RESTRICT,
    table_name VARCHAR(48) NOT NULL,
    record_id UUID NOT NULL,
    operation VARCHAR(16) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    payload_hash TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'COMMITTED' CHECK (status IN ('COMMITTED', 'REJECTED', 'PENDING')),
    response_status VARCHAR(32) NOT NULL DEFAULT 'COMMITTED',
    resulting_stock INT,
    deficit_created BOOLEAN DEFAULT FALSE,
    ledger_entry_id UUID,
    batch_id UUID,
    sale_id UUID,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_sync_journal_pharmacy_op UNIQUE (pharmacy_id, client_op_id)
);

CREATE INDEX idx_sync_journal_lookup 
ON public.sync_journal(pharmacy_id, device_id, processed_at DESC);

ALTER TABLE public.sync_journal ENABLE ROW LEVEL SECURITY;

-- Zero direct client access to raw journal
REVOKE ALL ON public.sync_journal FROM anon, authenticated, public;
GRANT SELECT, INSERT, UPDATE ON public.sync_journal TO service_role;

-- 3. OBJECTS CREATED: audit_logs (Append-Only Compliance Trail)
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE SET NULL,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_type VARCHAR(16) NOT NULL CHECK (actor_type IN ('USER', 'ADMIN', 'SYSTEM', 'WEBHOOK')),
    action VARCHAR(64) NOT NULL,
    target_entity VARCHAR(48) NOT NULL,
    target_id TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Audit Log Policy: Platform Admins can read
CREATE POLICY rls_audit_logs_read ON public.audit_logs
FOR SELECT USING (public.is_platform_admin('ADMIN'));

-- Trigger: Immutability on audit_logs
CREATE OR REPLACE FUNCTION public.trg_prevent_audit_logs_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABLE_LOG: audit_logs entries cannot be updated or deleted.'
        USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_audit_logs_immutability ON public.audit_logs;
CREATE TRIGGER trg_guard_audit_logs_immutability
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_audit_logs_mutation();

REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated, anon, public;

-- 4. TRIGGER: Membership & Role Mutation Auditing
CREATE OR REPLACE FUNCTION public.trg_audit_membership_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.audit_logs (
            pharmacy_id, actor_id, actor_type, action,
            target_entity, target_id, old_data, new_data
        ) VALUES (
            NEW.pharmacy_id, auth.uid(), 'USER', 'MEMBERSHIP_ROLE_UPDATED',
            'pharmacy_members', NEW.id::text,
            jsonb_build_object('role', OLD.role, 'status', OLD.status),
            jsonb_build_object('role', NEW.role, 'status', NEW.status)
        );
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (
            pharmacy_id, actor_id, actor_type, action,
            target_entity, target_id, old_data
        ) VALUES (
            OLD.pharmacy_id, auth.uid(), 'USER', 'MEMBERSHIP_REVOKED',
            'pharmacy_members', OLD.id::text,
            jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role)
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_membership_mutations ON public.pharmacy_members;
CREATE TRIGGER trg_audit_membership_mutations
AFTER UPDATE OR DELETE ON public.pharmacy_members
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_membership_changes();

-- 5. FUNCTION: rpc_get_client_op_status (Safe Client Sync Query)
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
    SELECT 
        sj.client_op_id,
        sj.status,
        sj.response_status,
        sj.processed_at
    FROM public.sync_journal sj
    WHERE sj.pharmacy_id = p_pharmacy_id 
      AND sj.client_op_id = p_client_op_id
      AND public.is_pharmacy_member(p_pharmacy_id);
$$;

REVOKE ALL ON FUNCTION public.rpc_get_client_op_status(UUID, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.rpc_get_client_op_status(UUID, UUID) TO authenticated;

-- 6. PROCEDURE: rpc_ingest_sale_stock_movement (Atomic Stock Ingestion Engine)
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
SET search_path = public, pg_temp
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

    -- 3. Verify Role Permission: 'sales.create'
    IF NOT EXISTS (
        SELECT 1 FROM public.pharmacy_members pm
        JOIN public.role_permissions rp ON pm.role = rp.role
        WHERE pm.user_id = auth.uid() 
          AND pm.pharmacy_id = p_pharmacy_id 
          AND pm.status = 'ACTIVE'
          AND rp.permission = 'sales.create'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_PERMISSION: sales.create permission required.' USING ERRCODE = '42501';
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

-- 7. PRIVILEGE RESTRICTION: Lock down mutation RPC to trusted service_role gateway
REVOKE ALL ON FUNCTION public.rpc_ingest_sale_stock_movement(UUID, UUID, UUID, UUID, UUID, UUID, UUID, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ingest_sale_stock_movement(UUID, UUID, UUID, UUID, UUID, UUID, UUID, INT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_ingest_sale_stock_movement(UUID, UUID, UUID, UUID, UUID, UUID, UUID, INT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ingest_sale_stock_movement(UUID, UUID, UUID, UUID, UUID, UUID, UUID, INT, TEXT) TO service_role;
