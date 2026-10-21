-- PharmacyFlow unified atomic sales commit (UNEXECUTED).
-- Additive post-sealed artifact. M-6 remains immutable and untouched.
-- Requires a clean Foundation V1 followed by M-1 through M-16.

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS client_op_id UUID;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS checkout_intent_id UUID;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS client_created_at TIMESTAMPTZ;
ALTER TABLE public.sync_journal ADD COLUMN IF NOT EXISTS response_payload JSONB;
ALTER TABLE public.sync_journal ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES auth.users(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_pharmacy_checkout_intent
ON public.sales(pharmacy_id, checkout_intent_id) WHERE checkout_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_pharmacy_client_op
ON public.sales(pharmacy_id, client_op_id) WHERE client_op_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.offline_stock_deficits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
    quantity_deficit INT NOT NULL CHECK (quantity_deficit > 0),
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RECONCILED', 'WAIVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    reconciled_at TIMESTAMPTZ,
    UNIQUE (sale_id, batch_id)
);

CREATE TABLE IF NOT EXISTS public.late_cash_sale_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    cashier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL UNIQUE REFERENCES public.sales(id) ON DELETE RESTRICT,
    client_created_at TIMESTAMPTZ,
    server_committed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RECONCILED')),
    notes TEXT
);

CREATE OR REPLACE FUNCTION public.rpc_commit_sale_v1(
    p_actor_user_id UUID,
    p_pharmacy_id UUID,
    p_branch_id UUID,
    p_device_id UUID,
    p_client_op_id UUID,
    p_checkout_intent_id UUID,
    p_nonce UUID,
    p_payload_hash TEXT,
    p_sale JSONB,
    p_items JSONB
)
RETURNS TABLE (
    operation_status VARCHAR,
    sale_id UUID,
    processed_at TIMESTAMPTZ,
    response_payload JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := timezone('utc', now());
    v_sale_id UUID := (p_sale->>'id')::UUID;
    v_customer_id UUID := NULLIF(p_sale->>'customer_id', '')::UUID;
    v_currency VARCHAR(3) := upper(p_sale->>'currency');
    v_payment_method VARCHAR(32) := upper(p_sale->>'payment_method');
    v_payment_status VARCHAR(32) := upper(COALESCE(p_sale->>'payment_status', 'SETTLED'));
    v_subtotal BIGINT := (p_sale->>'subtotal')::BIGINT;
    v_discount BIGINT := (p_sale->>'discount')::BIGINT;
    v_tax BIGINT := (p_sale->>'tax')::BIGINT;
    v_total BIGINT := (p_sale->>'total')::BIGINT;
    v_tendered BIGINT := (p_sale->>'amount_tendered')::BIGINT;
    v_change_due BIGINT := (p_sale->>'change_due')::BIGINT;
    v_existing_hash TEXT;
    v_existing_sale UUID;
    v_existing_response JSONB;
    v_line JSONB;
    v_item_id UUID;
    v_product_id UUID;
    v_batch_id UUID;
    v_quantity INT;
    v_unit_price BIGINT;
    v_line_discount BIGINT;
    v_line_tax BIGINT;
    v_line_total BIGINT;
    v_calculated_subtotal BIGINT := 0;
    v_calculated_discount BIGINT := 0;
    v_calculated_tax BIGINT := 0;
    v_calculated_total BIGINT := 0;
    v_batch RECORD;
    v_updated_stock INT;
    v_deficit INT;
    v_ledger_id UUID;
    v_response JSONB;
    v_has_open_register BOOLEAN := FALSE;
BEGIN
    -- The Edge Function is the policy-enforcement point for JWT and P-256
    -- verification. Browser roles cannot execute this function. The requested
    -- service-role claim check must be catalog-verified in disposable staging.
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'TRUSTED_GATEWAY_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF p_payload_hash !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'INVALID_SALE_PAYLOAD' USING ERRCODE = '22023';
    END IF;

    -- Atomic nonce consumption happens after Edge signature verification and
    -- inside this transaction, so failed sale commits do not burn a nonce.
    INSERT INTO public.sync_nonces(nonce, pharmacy_id, device_id, created_at)
    VALUES (p_nonce, p_pharmacy_id, p_device_id, v_now)
    ON CONFLICT (nonce) DO NOTHING;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NONCE_REPLAY' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.sync_journal (
        client_op_id, pharmacy_id, device_id, table_name, record_id, operation,
        payload_hash, status, processed_at, actor_user_id
    ) VALUES (
        p_client_op_id, p_pharmacy_id, p_device_id, 'sales', v_sale_id, 'INSERT',
        p_payload_hash, 'PENDING', v_now, p_actor_user_id
    ) ON CONFLICT (pharmacy_id, client_op_id) DO NOTHING;

    IF NOT FOUND THEN
        SELECT payload_hash, sale_id, response_payload
        INTO v_existing_hash, v_existing_sale, v_existing_response
        FROM public.sync_journal
        WHERE pharmacy_id = p_pharmacy_id AND client_op_id = p_client_op_id
        FOR UPDATE;
        IF v_existing_hash IS DISTINCT FROM p_payload_hash THEN
            RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION' USING ERRCODE = '23505';
        END IF;
        RETURN QUERY SELECT 'ALREADY_COMMITTED'::VARCHAR, v_existing_sale, v_now, v_existing_response;
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.pharmacy_members pm
        JOIN public.role_permissions rp ON rp.role = pm.role
        WHERE pm.user_id = p_actor_user_id
          AND pm.pharmacy_id = p_pharmacy_id
          AND pm.status = 'ACTIVE'
          AND rp.permission = 'sales.create'
          AND (pm.default_branch_id = p_branch_id OR pm.role IN ('OWNER', 'MANAGER'))
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_SALE_AUTHORIZATION' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.devices d
        WHERE d.id = p_device_id AND d.pharmacy_id = p_pharmacy_id
          AND d.branch_id = p_branch_id AND d.status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'DEVICE_BRANCH_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF v_customer_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.customers c WHERE c.id = v_customer_id AND c.pharmacy_id = p_pharmacy_id
    ) THEN
        RAISE EXCEPTION 'CUSTOMER_TENANT_MISMATCH' USING ERRCODE = '23503';
    END IF;
    IF v_currency !~ '^[A-Z]{3}$' OR v_subtotal < 0 OR v_discount < 0 OR v_tax < 0 OR v_total < 0
       OR v_tendered < 0 OR v_change_due < 0 THEN
        RAISE EXCEPTION 'INVALID_MINOR_UNITS' USING ERRCODE = '22003';
    END IF;

    -- Lock all requested batches in a deterministic order before checking or
    -- changing any stock. This reduces, but cannot eliminate, deadlocks.
    PERFORM 1 FROM public.inventory_batches ib
    JOIN (
        SELECT DISTINCT (value->>'batch_id')::UUID AS batch_id
        FROM jsonb_array_elements(p_items)
    ) requested ON requested.batch_id = ib.id
    WHERE ib.pharmacy_id = p_pharmacy_id
    ORDER BY ib.id
    FOR UPDATE;

    FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_item_id := (v_line->>'id')::UUID;
        v_product_id := (v_line->>'product_id')::UUID;
        v_batch_id := (v_line->>'batch_id')::UUID;
        v_quantity := (v_line->>'quantity')::INT;
        v_unit_price := (v_line->>'unit_price')::BIGINT;
        v_line_discount := COALESCE((v_line->>'discount')::BIGINT, 0);
        v_line_tax := COALESCE((v_line->>'tax')::BIGINT, 0);
        v_line_total := (v_line->>'line_total')::BIGINT;
        IF v_quantity <= 0 OR v_unit_price < 0 OR v_line_discount < 0 OR v_line_tax < 0
           OR v_line_total <> (v_quantity::BIGINT * v_unit_price) - v_line_discount + v_line_tax THEN
            RAISE EXCEPTION 'INVALID_SALE_LINE' USING ERRCODE = '22003';
        END IF;
        SELECT * INTO v_batch FROM public.inventory_batches
        WHERE id = v_batch_id AND pharmacy_id = p_pharmacy_id AND product_id = v_product_id;
        IF NOT FOUND OR v_batch.branch_id <> p_branch_id THEN
            RAISE EXCEPTION 'BATCH_TENANT_OR_BRANCH_MISMATCH' USING ERRCODE = '23503';
        END IF;
        -- Price overrides require an explicit role permission; otherwise the
        -- signed offline snapshot must equal the authoritative batch price.
        IF v_unit_price <> v_batch.selling_price AND NOT EXISTS (
            SELECT 1 FROM public.pharmacy_members pm JOIN public.role_permissions rp ON rp.role = pm.role
            WHERE pm.user_id = p_actor_user_id AND pm.pharmacy_id = p_pharmacy_id
              AND pm.status = 'ACTIVE' AND rp.permission = 'sales.price_override'
        ) THEN
            RAISE EXCEPTION 'PRICE_OVERRIDE_FORBIDDEN' USING ERRCODE = '42501';
        END IF;
        v_calculated_subtotal := v_calculated_subtotal + (v_quantity::BIGINT * v_unit_price);
        v_calculated_discount := v_calculated_discount + v_line_discount;
        v_calculated_tax := v_calculated_tax + v_line_tax;
        v_calculated_total := v_calculated_total + v_line_total;
    END LOOP;
    IF v_subtotal <> v_calculated_subtotal OR v_discount < v_calculated_discount
       OR v_tax < v_calculated_tax OR v_total <> v_subtotal - v_discount + v_tax THEN
        RAISE EXCEPTION 'SALE_TOTAL_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF v_payment_method = 'CASH' AND (v_tendered < v_total OR v_change_due <> v_tendered - v_total) THEN
        RAISE EXCEPTION 'CASH_TENDER_MISMATCH' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.sales (
        id, pharmacy_id, branch_id, cashier_id, customer_id, currency, subtotal,
        discount, tax, total, payment_method, amount_tendered, change_due,
        payment_status, created_at, client_op_id, checkout_intent_id, client_created_at
    ) VALUES (
        v_sale_id, p_pharmacy_id, p_branch_id, p_actor_user_id, v_customer_id, v_currency,
        v_subtotal, v_discount, v_tax, v_total, v_payment_method, v_tendered, v_change_due,
        v_payment_status, v_now, p_client_op_id, p_checkout_intent_id,
        NULLIF(p_sale->>'client_created_at', '')::TIMESTAMPTZ
    );

    FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_item_id := (v_line->>'id')::UUID;
        v_product_id := (v_line->>'product_id')::UUID;
        v_batch_id := (v_line->>'batch_id')::UUID;
        v_quantity := (v_line->>'quantity')::INT;
        v_unit_price := (v_line->>'unit_price')::BIGINT;
        v_line_discount := COALESCE((v_line->>'discount')::BIGINT, 0);
        v_line_tax := COALESCE((v_line->>'tax')::BIGINT, 0);
        v_line_total := (v_line->>'line_total')::BIGINT;
        INSERT INTO public.sale_items (
            id, sale_id, pharmacy_id, product_id, batch_id, quantity, unit_price, discount, tax, total
        ) VALUES (
            v_item_id, v_sale_id, p_pharmacy_id, v_product_id, v_batch_id,
            v_quantity, v_unit_price, v_line_discount, v_line_tax, v_line_total
        );
        SELECT * INTO v_batch FROM public.inventory_batches WHERE id = v_batch_id FOR UPDATE;
        v_updated_stock := v_batch.quantity - v_quantity;
        UPDATE public.inventory_batches SET quantity = v_updated_stock, updated_at = v_now WHERE id = v_batch_id;
        v_ledger_id := gen_random_uuid();
        INSERT INTO public.stock_ledger (
            id, pharmacy_id, branch_id, product_id, batch_id, movement_type,
            quantity_delta, resulting_batch_stock, reference_id, device_id, notes, created_at
        ) VALUES (
            v_ledger_id, p_pharmacy_id, p_branch_id, v_product_id, v_batch_id, 'SALE',
            -v_quantity, v_updated_stock, v_sale_id, p_device_id,
            CASE WHEN v_updated_stock < 0 THEN 'OFFLINE_CONTROLLED_DEFICIT' ELSE NULL END, v_now
        );
        IF v_updated_stock < 0 THEN
            INSERT INTO public.offline_stock_deficits(pharmacy_id, branch_id, sale_id, batch_id, quantity_deficit)
            VALUES (p_pharmacy_id, p_branch_id, v_sale_id, v_batch_id, abs(v_updated_stock));
        END IF;
    END LOOP;

    IF v_payment_method = 'CASH' AND NOT EXISTS (
        SELECT 1 FROM public.cash_register_sessions crs
        WHERE crs.pharmacy_id = p_pharmacy_id AND crs.branch_id = p_branch_id
          AND crs.cashier_id = p_actor_user_id AND crs.status = 'OPEN'
    ) THEN
        INSERT INTO public.late_cash_sale_exceptions(pharmacy_id, branch_id, cashier_id, sale_id, client_created_at)
        VALUES (p_pharmacy_id, p_branch_id, p_actor_user_id, v_sale_id,
                NULLIF(p_sale->>'client_created_at', '')::TIMESTAMPTZ);
    END IF;

    v_response := jsonb_build_object(
        'operation_status', 'COMMITTED', 'sale_id', v_sale_id,
        'client_op_id', p_client_op_id, 'checkout_intent_id', p_checkout_intent_id,
        'total', v_total, 'currency', v_currency, 'processed_at', v_now
    );
    UPDATE public.sync_journal
    SET status = 'COMMITTED', response_status = 'COMMITTED', sale_id = v_sale_id,
        response_payload = v_response, processed_at = v_now
    WHERE pharmacy_id = p_pharmacy_id AND client_op_id = p_client_op_id;
    RETURN QUERY SELECT 'COMMITTED'::VARCHAR, v_sale_id, v_now, v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_commit_sale_v1(UUID, UUID, UUID, UUID, UUID, UUID, UUID, TEXT, JSONB, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_commit_sale_v1(UUID, UUID, UUID, UUID, UUID, UUID, UUID, TEXT, JSONB, JSONB)
TO service_role;

-- Required staging checks: role claim visibility for a service RPC; function
-- owner/forced-RLS behavior; concurrent same-operation locking; rollback after
-- every failure point; integer overflow boundaries; and register exception flow.
