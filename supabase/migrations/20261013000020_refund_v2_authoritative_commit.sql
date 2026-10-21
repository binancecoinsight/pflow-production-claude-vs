-- PharmacyFlow Refund V2: server-authoritative minor-unit refunds.
--
-- Lock order for rpc_process_sale_return_v2:
--   1. sync_journal operation row (pharmacy_id, client_op_id)
--   2. original sale row
--   3. requested sale_items, ascending id
--   4. affected inventory_batches, ascending id
-- All locks are acquired in this order to reduce deadlocks. PostgreSQL may still
-- raise 40P01/40001; callers must retry with the same operation/hash and a new nonce.

ALTER TABLE public.sale_returns
    ADD COLUMN IF NOT EXISTS contract_version SMALLINT;

ALTER TABLE public.sale_returns
    ADD CONSTRAINT chk_sale_returns_contract_version
    CHECK (contract_version IS NULL OR contract_version IN (1, 2));

ALTER TABLE public.sale_items
    ADD CONSTRAINT uq_sale_items_pharmacy_id UNIQUE (pharmacy_id, id);

CREATE TABLE public.sale_return_line_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    return_id UUID NOT NULL,
    sale_item_id UUID NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    base_line_total_minor BIGINT NOT NULL CHECK (base_line_total_minor >= 0),
    allocated_header_discount_minor BIGINT NOT NULL CHECK (allocated_header_discount_minor >= 0),
    allocated_header_tax_minor BIGINT NOT NULL CHECK (allocated_header_tax_minor >= 0),
    entitlement_minor BIGINT NOT NULL CHECK (entitlement_minor >= 0),
    refund_amount_minor BIGINT NOT NULL CHECK (refund_amount_minor > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_sale_return_line_allocations_return_item UNIQUE (return_id, sale_item_id),
    CONSTRAINT fk_sale_return_line_allocations_return
        FOREIGN KEY (pharmacy_id, return_id)
        REFERENCES public.sale_returns(pharmacy_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_sale_return_line_allocations_sale_item
        FOREIGN KEY (pharmacy_id, sale_item_id)
        REFERENCES public.sale_items(pharmacy_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_sale_return_line_allocations_sale_item
    ON public.sale_return_line_allocations(pharmacy_id, sale_item_id);

ALTER TABLE public.sale_return_line_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_line_allocations FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_sale_return_line_allocations_select
ON public.sale_return_line_allocations
FOR SELECT USING (public.is_pharmacy_member(pharmacy_id));

CREATE POLICY rls_sale_return_line_allocations_insert_service
ON public.sale_return_line_allocations
FOR INSERT WITH CHECK (current_setting('request.jwt.claim.role', true) = 'service_role');

CREATE OR REPLACE FUNCTION public.rpc_process_sale_return_v2(
    p_actor_user_id UUID,
    p_pharmacy_id UUID,
    p_branch_id UUID,
    p_device_id UUID,
    p_client_op_id UUID,
    p_nonce UUID,
    p_payload_hash TEXT,
    p_sale_id UUID,
    p_items JSONB,
    p_expected_refund_amount_minor BIGINT,
    p_refund_payment_method VARCHAR(32),
    p_reason TEXT
)
RETURNS TABLE (
    operation_status VARCHAR,
    return_id UUID,
    processed_at TIMESTAMPTZ,
    response_payload JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := timezone('utc', now());
    v_return_id UUID := gen_random_uuid();
    v_existing_hash TEXT;
    v_existing_response JSONB;
    v_existing_return UUID;
    v_sale RECORD;
    v_line RECORD;
    v_item JSONB;
    v_requested_qty INT;
    v_returned_qty INT;
    v_header_discount BIGINT;
    v_header_tax BIGINT;
    v_gross_total BIGINT;
    v_base_total BIGINT;
    v_sum_line_discount BIGINT;
    v_sum_line_tax BIGINT;
    v_expected BIGINT := 0;
    v_item_line RECORD;
    v_new_stock INT;
    v_response JSONB;
BEGIN
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'TRUSTED_GATEWAY_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF p_payload_hash !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 OR p_expected_refund_amount_minor IS NULL
       OR p_expected_refund_amount_minor <= 0 OR p_expected_refund_amount_minor > 9999999999
       OR btrim(COALESCE(p_reason, '')) = '' THEN
        RAISE EXCEPTION 'INVALID_REFUND_REQUEST' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.pharmacy_members pm
        JOIN public.role_permissions rp ON rp.role = pm.role
        WHERE pm.user_id = p_actor_user_id
          AND pm.pharmacy_id = p_pharmacy_id
          AND pm.status = 'ACTIVE'
          AND rp.permission = 'sales.refund'
          AND (pm.default_branch_id = p_branch_id OR pm.role IN ('OWNER', 'MANAGER'))
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_REFUND_AUTHORIZATION' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.devices d
        WHERE d.id = p_device_id AND d.pharmacy_id = p_pharmacy_id
          AND d.branch_id = p_branch_id AND d.status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'DEVICE_BRANCH_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.sale_returns sr
        WHERE sr.pharmacy_id = p_pharmacy_id AND sr.client_op_id = p_client_op_id
    ) AND NOT EXISTS (
        SELECT 1 FROM public.sync_journal sj
        WHERE sj.pharmacy_id = p_pharmacy_id AND sj.client_op_id = p_client_op_id
    ) THEN
        RAISE EXCEPTION 'OPERATION_VERSION_CONFLICT' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.sync_journal (
        client_op_id, pharmacy_id, device_id, table_name, record_id, operation,
        payload_hash, status, processed_at, actor_user_id
    ) VALUES (
        p_client_op_id, p_pharmacy_id, p_device_id, 'sale_returns', v_return_id, 'INSERT',
        p_payload_hash, 'PENDING', v_now, p_actor_user_id
    ) ON CONFLICT (pharmacy_id, client_op_id) DO NOTHING;

    IF NOT FOUND THEN
        SELECT payload_hash, record_id, response_payload
        INTO v_existing_hash, v_existing_return, v_existing_response
        FROM public.sync_journal
        WHERE pharmacy_id = p_pharmacy_id AND client_op_id = p_client_op_id
        FOR UPDATE;
        IF v_existing_hash IS DISTINCT FROM p_payload_hash THEN
            RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION' USING ERRCODE = '23505';
        END IF;
        INSERT INTO public.sync_nonces(nonce, pharmacy_id, device_id, created_at)
        VALUES (p_nonce, p_pharmacy_id, p_device_id, v_now)
        ON CONFLICT (nonce) DO NOTHING;
        IF NOT FOUND THEN RAISE EXCEPTION 'NONCE_REPLAY' USING ERRCODE = '23505'; END IF;
        RETURN QUERY SELECT 'ALREADY_COMMITTED'::VARCHAR, v_existing_return, v_now, v_existing_response;
        RETURN;
    END IF;

    INSERT INTO public.sync_nonces(nonce, pharmacy_id, device_id, created_at)
    VALUES (p_nonce, p_pharmacy_id, p_device_id, v_now)
    ON CONFLICT (nonce) DO NOTHING;
    IF NOT FOUND THEN RAISE EXCEPTION 'NONCE_REPLAY' USING ERRCODE = '23505'; END IF;

    SELECT * INTO v_sale FROM public.sales
    WHERE id = p_sale_id AND pharmacy_id = p_pharmacy_id AND branch_id = p_branch_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SALE_NOT_FOUND' USING ERRCODE = '02000'; END IF;
    IF v_sale.currency NOT IN ('NGN', 'USD') THEN RAISE EXCEPTION 'UNSUPPORTED_CURRENCY' USING ERRCODE = '22023'; END IF;
    IF v_sale.payment_method <> upper(p_refund_payment_method) THEN
        RAISE EXCEPTION 'REFUND_PAYMENT_METHOD_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.sale_returns sr
        WHERE sr.pharmacy_id = p_pharmacy_id AND sr.original_sale_id = p_sale_id
          AND sr.reconciliation_status = 'LEGACY_UNVERIFIED'
    ) THEN RAISE EXCEPTION 'LEGACY_RECONCILIATION_REQUIRED' USING ERRCODE = '23514'; END IF;

    SELECT COALESCE(SUM(si.quantity::BIGINT * si.unit_price), 0),
           COALESCE(SUM(si.discount), 0), COALESCE(SUM(si.tax), 0),
           COALESCE(SUM(si.total), 0)
    INTO v_gross_total, v_sum_line_discount, v_sum_line_tax, v_base_total
    FROM public.sale_items si
    WHERE si.pharmacy_id = p_pharmacy_id AND si.sale_id = p_sale_id;
    IF v_gross_total <> v_sale.subtotal OR v_sale.discount < v_sum_line_discount
       OR v_sale.tax < v_sum_line_tax OR v_sale.total <> v_sale.subtotal - v_sale.discount + v_sale.tax THEN
        RAISE EXCEPTION 'SALE_FINANCIAL_INCONSISTENCY' USING ERRCODE = '23514';
    END IF;
    v_header_discount := v_sale.discount - v_sum_line_discount;
    v_header_tax := v_sale.tax - v_sum_line_tax;
    IF v_gross_total <= 0 THEN RAISE EXCEPTION 'SALE_FINANCIAL_INCONSISTENCY' USING ERRCODE = '23514'; END IF;

    PERFORM 1 FROM public.sale_items si
    JOIN (SELECT DISTINCT (value->>'sale_item_id')::UUID AS sale_item_id FROM jsonb_array_elements(p_items)) r
      ON r.sale_item_id = si.id
    WHERE si.pharmacy_id = p_pharmacy_id AND si.sale_id = p_sale_id
    ORDER BY si.id FOR UPDATE;
    IF (SELECT count(DISTINCT (value->>'sale_item_id')::UUID) FROM jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) THEN
        RAISE EXCEPTION 'DUPLICATE_SALE_ITEM' USING ERRCODE = '22023';
    END IF;

    -- Calculate all full-line entitlements with largest-remainder allocation.
    -- This CTE is deliberately repeated for validation and insert so every stored
    -- allocation is derived from immutable sale rows inside this transaction.
    WITH lines AS (
        SELECT si.id, si.quantity, si.product_id, si.batch_id, si.total,
               (si.quantity::BIGINT * si.unit_price) AS gross
        FROM public.sale_items si
        WHERE si.pharmacy_id = p_pharmacy_id AND si.sale_id = p_sale_id
    ), raw AS (
        SELECT lines.*, (v_header_discount::NUMERIC * gross / v_gross_total) AS raw_discount,
               (v_header_tax::NUMERIC * gross / v_gross_total) AS raw_tax
        FROM lines
    ), floored AS (
        SELECT raw.*, floor(raw_discount)::BIGINT AS discount_floor, floor(raw_tax)::BIGINT AS tax_floor
        FROM raw
    ), ranked AS (
        SELECT floored.*, row_number() OVER (ORDER BY raw_discount - discount_floor DESC, id ASC) AS discount_rank,
               row_number() OVER (ORDER BY raw_tax - tax_floor DESC, id ASC) AS tax_rank,
               sum(discount_floor) OVER () AS discount_floor_sum, sum(tax_floor) OVER () AS tax_floor_sum
        FROM floored
    ), entitlements AS (
        SELECT id, quantity, product_id, batch_id, total,
               discount_floor + CASE WHEN discount_rank <= v_header_discount - discount_floor_sum THEN 1 ELSE 0 END AS allocated_discount,
               tax_floor + CASE WHEN tax_rank <= v_header_tax - tax_floor_sum THEN 1 ELSE 0 END AS allocated_tax
        FROM ranked
    ), requested AS (
        SELECT (value->>'sale_item_id')::UUID AS sale_item_id, (value->>'quantity')::INT AS quantity
        FROM jsonb_array_elements(p_items)
    ), calculated AS (
        SELECT e.*, r.quantity AS requested_quantity,
               COALESCE((SELECT sum(a.quantity) FROM public.sale_return_line_allocations a
                         JOIN public.sale_returns sr ON sr.id = a.return_id AND sr.pharmacy_id = a.pharmacy_id
                         WHERE a.pharmacy_id = p_pharmacy_id AND a.sale_item_id = e.id AND sr.contract_version = 2), 0) AS returned_quantity,
               e.total - e.allocated_discount + e.allocated_tax AS entitlement
        FROM entitlements e JOIN requested r ON r.sale_item_id = e.id
    )
    SELECT COALESCE(sum(
        floor(entitlement::NUMERIC * (returned_quantity + requested_quantity) / quantity)
        - floor(entitlement::NUMERIC * returned_quantity / quantity)
    ), 0)::BIGINT INTO v_expected
    FROM calculated;
    IF (SELECT count(*) FROM jsonb_array_elements(p_items)) <> (SELECT count(*) FROM public.sale_items WHERE pharmacy_id = p_pharmacy_id AND sale_id = p_sale_id AND id IN (SELECT (value->>'sale_item_id')::UUID FROM jsonb_array_elements(p_items))) THEN
        RAISE EXCEPTION 'ITEM_NOT_IN_SALE' USING ERRCODE = '23503';
    END IF;
    IF EXISTS (
        WITH requested AS (SELECT (value->>'sale_item_id')::UUID AS sale_item_id, (value->>'quantity')::INT AS quantity FROM jsonb_array_elements(p_items))
        SELECT 1 FROM requested r JOIN public.sale_items si ON si.id = r.sale_item_id
        LEFT JOIN LATERAL (
            SELECT COALESCE(sum(a.quantity), 0) AS returned_quantity
            FROM public.sale_return_line_allocations a JOIN public.sale_returns sr ON sr.id = a.return_id AND sr.pharmacy_id = a.pharmacy_id
            WHERE a.pharmacy_id = p_pharmacy_id AND a.sale_item_id = si.id AND sr.contract_version = 2
        ) prior ON true
        WHERE r.quantity IS NULL OR r.quantity <= 0 OR prior.returned_quantity + r.quantity > si.quantity
    ) THEN RAISE EXCEPTION 'EXCEEDS_RETURNABLE_QUANTITY' USING ERRCODE = '23514'; END IF;
    IF v_expected <> p_expected_refund_amount_minor THEN RAISE EXCEPTION 'REFUND_AMOUNT_MISMATCH' USING ERRCODE = '23514'; END IF;

    -- Fourth lock class: batches in ascending UUID order, after journal/sale/items.
    PERFORM 1 FROM public.inventory_batches ib
    JOIN public.sale_items si ON si.batch_id = ib.id AND si.pharmacy_id = ib.pharmacy_id
    JOIN (SELECT (value->>'sale_item_id')::UUID AS sale_item_id FROM jsonb_array_elements(p_items)) r ON r.sale_item_id = si.id
    WHERE ib.pharmacy_id = p_pharmacy_id ORDER BY ib.id FOR UPDATE;

    INSERT INTO public.sale_returns (
        id, pharmacy_id, branch_id, original_sale_id, refund_amount, refund_amount_minor,
        reconciliation_status, refund_payment_method, reason, authorized_by, client_op_id,
        payload_hash, status, contract_version, created_at
    ) VALUES (
        v_return_id, p_pharmacy_id, p_branch_id, p_sale_id, v_expected::NUMERIC, v_expected,
        'VERIFIED_MINOR_UNITS', upper(p_refund_payment_method), btrim(p_reason), p_actor_user_id,
        p_client_op_id, p_payload_hash, 'COMPLETED', 2, v_now
    );

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        SELECT si.* INTO v_item_line FROM public.sale_items si
        WHERE si.id = (v_item->>'sale_item_id')::UUID;
        v_requested_qty := (v_item->>'quantity')::INT;
        SELECT COALESCE(sum(a.quantity), 0) - v_requested_qty INTO v_returned_qty
        FROM public.sale_return_line_allocations a WHERE a.pharmacy_id = p_pharmacy_id AND a.sale_item_id = v_item_line.id;
        WITH lines AS (
            SELECT si.id, si.quantity, si.total, (si.quantity::BIGINT * si.unit_price) AS gross FROM public.sale_items si WHERE si.pharmacy_id = p_pharmacy_id AND si.sale_id = p_sale_id
        ), ranked AS (
            SELECT lines.*, floor(v_header_discount::NUMERIC * gross / v_gross_total)::BIGINT AS discount_floor,
                   floor(v_header_tax::NUMERIC * gross / v_gross_total)::BIGINT AS tax_floor,
                   row_number() OVER (ORDER BY (v_header_discount::NUMERIC * gross / v_gross_total) - floor(v_header_discount::NUMERIC * gross / v_gross_total) DESC, id) AS discount_rank,
                   row_number() OVER (ORDER BY (v_header_tax::NUMERIC * gross / v_gross_total) - floor(v_header_tax::NUMERIC * gross / v_gross_total) DESC, id) AS tax_rank
            FROM lines
        )
        INSERT INTO public.sale_return_line_allocations (
            pharmacy_id, return_id, sale_item_id, quantity, base_line_total_minor,
            allocated_header_discount_minor, allocated_header_tax_minor, entitlement_minor, refund_amount_minor
        )
        SELECT p_pharmacy_id, v_return_id, id, v_requested_qty, total,
               discount_floor + CASE WHEN discount_rank <= v_header_discount - (SELECT sum(discount_floor) FROM ranked) THEN 1 ELSE 0 END,
               tax_floor + CASE WHEN tax_rank <= v_header_tax - (SELECT sum(tax_floor) FROM ranked) THEN 1 ELSE 0 END,
               total - (discount_floor + CASE WHEN discount_rank <= v_header_discount - (SELECT sum(discount_floor) FROM ranked) THEN 1 ELSE 0 END)
                     + (tax_floor + CASE WHEN tax_rank <= v_header_tax - (SELECT sum(tax_floor) FROM ranked) THEN 1 ELSE 0 END),
               floor((total - (discount_floor + CASE WHEN discount_rank <= v_header_discount - (SELECT sum(discount_floor) FROM ranked) THEN 1 ELSE 0 END)
                     + (tax_floor + CASE WHEN tax_rank <= v_header_tax - (SELECT sum(tax_floor) FROM ranked) THEN 1 ELSE 0 END))::NUMERIC * (v_returned_qty + v_requested_qty) / quantity)
               - floor((total - (discount_floor + CASE WHEN discount_rank <= v_header_discount - (SELECT sum(discount_floor) FROM ranked) THEN 1 ELSE 0 END)
                     + (tax_floor + CASE WHEN tax_rank <= v_header_tax - (SELECT sum(tax_floor) FROM ranked) THEN 1 ELSE 0 END))::NUMERIC * v_returned_qty / quantity)
        FROM ranked WHERE id = v_item_line.id;
        INSERT INTO public.return_items(pharmacy_id, return_id, product_id, batch_id, quantity, restock_to_inventory, created_at)
        VALUES (p_pharmacy_id, v_return_id, v_item_line.product_id, v_item_line.batch_id, v_requested_qty,
                COALESCE((v_item->>'restock_to_inventory')::BOOLEAN, TRUE), v_now);
        IF COALESCE((v_item->>'restock_to_inventory')::BOOLEAN, TRUE) THEN
            UPDATE public.inventory_batches SET quantity = quantity + v_requested_qty, updated_at = v_now
            WHERE id = v_item_line.batch_id AND pharmacy_id = p_pharmacy_id RETURNING quantity INTO v_new_stock;
            INSERT INTO public.stock_ledger(id, pharmacy_id, branch_id, product_id, batch_id, movement_type, quantity_delta, resulting_batch_stock, reference_id, notes, created_at)
            VALUES (gen_random_uuid(), p_pharmacy_id, p_branch_id, v_item_line.product_id, v_item_line.batch_id, 'RETURN', v_requested_qty, v_new_stock, v_return_id, 'Refund V2 inventory restoration', v_now);
        END IF;
    END LOOP;
    v_response := jsonb_build_object('operation_status', 'COMMITTED', 'return_id', v_return_id, 'client_op_id', p_client_op_id,
        'refund_amount_minor', v_expected, 'currency', v_sale.currency, 'processed_at', v_now, 'contract_version', 2);
    UPDATE public.sync_journal SET status = 'COMMITTED', response_status = 'COMMITTED', record_id = v_return_id,
        response_payload = v_response, processed_at = v_now WHERE pharmacy_id = p_pharmacy_id AND client_op_id = p_client_op_id;
    INSERT INTO public.audit_logs(pharmacy_id, actor_id, actor_type, action, target_entity, target_id, new_data, created_at)
    VALUES (p_pharmacy_id, p_actor_user_id, 'USER', 'SALE_RETURN_V2_PROCESSED', 'sale_returns', v_return_id::TEXT,
        jsonb_build_object('sale_id', p_sale_id, 'refund_amount_minor', v_expected, 'client_op_id', p_client_op_id), v_now);
    RETURN QUERY SELECT 'COMMITTED'::VARCHAR, v_return_id, v_now, v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_process_sale_return_v2(UUID, UUID, UUID, UUID, UUID, UUID, TEXT, UUID, JSONB, BIGINT, VARCHAR, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_process_sale_return_v2(UUID, UUID, UUID, UUID, UUID, UUID, TEXT, UUID, JSONB, BIGINT, VARCHAR, TEXT)
TO service_role;
