-- PharmacyFlow Phase B: authorization-scoped, evidence-bearing operation status.
-- Forward-only authoring artifact. DO NOT execute without separate database authorization.

CREATE OR REPLACE FUNCTION public.rpc_get_client_op_status_v2(
    p_pharmacy_id UUID,
    p_client_op_id UUID
)
RETURNS TABLE (
    outcome TEXT,
    pharmacy_id UUID,
    client_op_id UUID,
    operation_kind TEXT,
    payload_hash TEXT,
    sale_id UUID,
    checkout_intent_id UUID,
    response_status TEXT,
    response_payload JSONB,
    processed_at TIMESTAMPTZ,
    record_id UUID,
    return_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_journal public.sync_journal%ROWTYPE;
    v_sale public.sales%ROWTYPE;
    v_return public.sale_returns%ROWTYPE;
    v_kind TEXT;
    v_response JSONB;
    v_checkout UUID;
    v_evidence_ok BOOLEAN := FALSE;
    v_member_role TEXT;
    v_management BOOLEAN := FALSE;
    v_record_found BOOLEAN := FALSE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'OPERATION_STATUS_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    SELECT pm.role::TEXT INTO v_member_role
        FROM public.pharmacy_members pm
        WHERE pm.pharmacy_id = p_pharmacy_id
          AND pm.user_id = auth.uid()
          AND pm.status = 'ACTIVE'
        LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'OPERATION_STATUS_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    v_management := v_member_role IN ('OWNER', 'MANAGER', 'PHARMACIST');

    SELECT sj.* INTO v_journal
    FROM public.sync_journal sj
    WHERE sj.pharmacy_id = p_pharmacy_id AND sj.client_op_id = p_client_op_id;

    IF NOT FOUND THEN
        SELECT sr.* INTO v_return FROM public.sale_returns sr
        WHERE sr.pharmacy_id = p_pharmacy_id AND sr.client_op_id = p_client_op_id LIMIT 1;
        IF FOUND THEN
            IF NOT v_management AND v_return.authorized_by IS DISTINCT FROM auth.uid() AND NOT EXISTS (
                SELECT 1 FROM public.sales s WHERE s.pharmacy_id = p_pharmacy_id
                  AND s.id = v_return.original_sale_id AND s.cashier_id = auth.uid()
            ) THEN
                RAISE EXCEPTION 'OPERATION_STATUS_FORBIDDEN' USING ERRCODE = '42501';
            END IF;
            v_evidence_ok := v_return.status = 'COMPLETED' AND v_return.payload_hash IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.return_items ri
                WHERE ri.pharmacy_id = p_pharmacy_id AND ri.return_id = v_return.id
            );
            v_response := jsonb_build_object(
                'operation_status', CASE WHEN v_evidence_ok THEN 'COMMITTED' ELSE 'UNKNOWN' END,
                'client_op_id', p_client_op_id, 'return_id', v_return.id,
                'sale_id', v_return.original_sale_id, 'processed_at', v_return.created_at
            );
            RETURN QUERY SELECT
                CASE WHEN v_evidence_ok THEN 'CONFIRMED_COMMITTED' ELSE 'UNKNOWN' END::TEXT,
                p_pharmacy_id, p_client_op_id, 'SALE_RETURN_V1'::TEXT, v_return.payload_hash,
                v_return.original_sale_id, NULL::UUID,
                CASE WHEN v_evidence_ok THEN 'COMMITTED' ELSE 'INCOMPLETE_RETURN_EVIDENCE' END::TEXT,
                v_response, v_return.created_at, v_return.id, v_return.id;
            RETURN;
        END IF;

        SELECT s.* INTO v_sale FROM public.sales s
        WHERE s.pharmacy_id = p_pharmacy_id AND s.client_op_id = p_client_op_id LIMIT 1;
        IF FOUND THEN
            IF NOT v_management AND v_sale.cashier_id <> auth.uid() THEN
                RAISE EXCEPTION 'OPERATION_STATUS_FORBIDDEN' USING ERRCODE = '42501';
            END IF;
            -- A financial row without journal/hash evidence is not absence and cannot authorize resend.
            RETURN QUERY SELECT 'UNKNOWN'::TEXT, p_pharmacy_id, p_client_op_id,
                'UNIFIED_SALE_V1'::TEXT, NULL::TEXT, v_sale.id, v_sale.checkout_intent_id,
                'MISSING_JOURNAL_EVIDENCE'::TEXT, NULL::JSONB, v_sale.created_at,
                v_sale.id, NULL::UUID;
            RETURN;
        END IF;

        RETURN QUERY SELECT 'CONFIRMED_ABSENT'::TEXT, p_pharmacy_id, p_client_op_id,
            'UNKNOWN'::TEXT, NULL::TEXT, NULL::UUID, NULL::UUID,
            'AUTHORIZED_ABSENCE'::TEXT, NULL::JSONB, NULL::TIMESTAMPTZ,
            NULL::UUID, NULL::UUID;
        RETURN;
    END IF;

    v_response := v_journal.response_payload;
    v_checkout := CASE WHEN v_response ? 'checkout_intent_id'
        AND (v_response->>'checkout_intent_id') ~* '^[0-9a-f-]{36}$'
        THEN (v_response->>'checkout_intent_id')::UUID ELSE NULL END;
    v_kind := CASE
        WHEN v_journal.table_name = 'sales' AND v_checkout IS NOT NULL THEN 'UNIFIED_SALE_V1'
        WHEN v_journal.table_name = 'sale_returns' AND COALESCE((v_response->>'contract_version')::INTEGER, 1) = 2 THEN 'SALE_RETURN_V2'
        WHEN v_journal.table_name = 'sale_returns' THEN 'SALE_RETURN_V1'
        ELSE 'LEGACY_SALE_STOCK'
    END;

    IF v_kind = 'UNIFIED_SALE_V1' THEN
        SELECT s.* INTO v_sale FROM public.sales s
        WHERE s.pharmacy_id = p_pharmacy_id AND s.id = v_journal.record_id
          AND s.client_op_id = p_client_op_id;
        v_record_found := FOUND;
        IF NOT v_management AND ((v_record_found AND v_sale.cashier_id <> auth.uid()) OR
            (NOT v_record_found AND v_journal.actor_user_id IS DISTINCT FROM auth.uid())) THEN
            RAISE EXCEPTION 'OPERATION_STATUS_FORBIDDEN' USING ERRCODE = '42501';
        END IF;
        v_evidence_ok := v_record_found AND v_journal.sale_id = v_sale.id
            AND v_checkout = v_sale.checkout_intent_id
            AND v_response->>'client_op_id' = p_client_op_id::TEXT
            AND v_response->>'sale_id' = v_sale.id::TEXT;
    ELSIF v_kind = 'SALE_RETURN_V2' THEN
        SELECT sr.* INTO v_return FROM public.sale_returns sr
        WHERE sr.pharmacy_id = p_pharmacy_id AND sr.id = v_journal.record_id
          AND sr.client_op_id = p_client_op_id AND sr.contract_version = 2;
        v_record_found := FOUND;
        IF NOT v_management AND ((v_record_found AND v_return.authorized_by IS DISTINCT FROM auth.uid() AND NOT EXISTS (
                SELECT 1 FROM public.sales s WHERE s.pharmacy_id = p_pharmacy_id
                  AND s.id = v_return.original_sale_id AND s.cashier_id = auth.uid()
            )) OR (NOT v_record_found AND v_journal.actor_user_id IS DISTINCT FROM auth.uid())) THEN
            RAISE EXCEPTION 'OPERATION_STATUS_FORBIDDEN' USING ERRCODE = '42501';
        END IF;
        v_evidence_ok := v_record_found AND v_return.status = 'COMPLETED'
            AND v_return.payload_hash = v_journal.payload_hash
            AND v_response->>'client_op_id' = p_client_op_id::TEXT
            AND v_response->>'return_id' = v_return.id::TEXT
            AND EXISTS (SELECT 1 FROM public.sale_return_line_allocations a
                WHERE a.pharmacy_id = p_pharmacy_id AND a.return_id = v_return.id);
        IF v_return.id IS NOT NULL THEN
            v_response := COALESCE(v_response, '{}'::JSONB) || jsonb_build_object('sale_id', v_return.original_sale_id);
        END IF;
    ELSIF v_kind = 'SALE_RETURN_V1' THEN
        SELECT sr.* INTO v_return FROM public.sale_returns sr
        WHERE sr.pharmacy_id = p_pharmacy_id AND sr.id = v_journal.record_id
          AND sr.client_op_id = p_client_op_id;
        v_record_found := FOUND;
        IF NOT v_management AND ((v_record_found AND v_return.authorized_by IS DISTINCT FROM auth.uid() AND NOT EXISTS (
                SELECT 1 FROM public.sales s WHERE s.pharmacy_id = p_pharmacy_id
                  AND s.id = v_return.original_sale_id AND s.cashier_id = auth.uid()
            )) OR (NOT v_record_found AND v_journal.actor_user_id IS DISTINCT FROM auth.uid())) THEN
            RAISE EXCEPTION 'OPERATION_STATUS_FORBIDDEN' USING ERRCODE = '42501';
        END IF;
        v_evidence_ok := v_record_found AND v_return.status = 'COMPLETED'
            AND v_return.payload_hash = v_journal.payload_hash
            AND EXISTS (SELECT 1 FROM public.return_items ri
                WHERE ri.pharmacy_id = p_pharmacy_id AND ri.return_id = v_return.id);
        IF v_return.id IS NOT NULL THEN
            v_response := COALESCE(v_response, '{}'::JSONB) || jsonb_build_object(
                'operation_status', 'COMMITTED', 'client_op_id', p_client_op_id,
                'return_id', v_return.id, 'sale_id', v_return.original_sale_id,
                'processed_at', v_journal.processed_at);
        END IF;
    ELSE
        -- Legacy stock journal evidence is deliberately never financial sale completion evidence.
        IF NOT v_management AND v_journal.actor_user_id IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'OPERATION_STATUS_FORBIDDEN' USING ERRCODE = '42501';
        END IF;
        v_evidence_ok := FALSE;
    END IF;

    RETURN QUERY SELECT
        CASE
            WHEN v_kind = 'LEGACY_SALE_STOCK' THEN 'UNKNOWN'
            WHEN v_journal.status = 'COMMITTED' AND v_evidence_ok THEN 'CONFIRMED_COMMITTED'
            WHEN v_journal.status = 'COMMITTED' AND NOT v_evidence_ok THEN 'CONFLICT'
            WHEN v_journal.status = 'PENDING' THEN 'IN_PROGRESS'
            WHEN v_journal.status = 'REJECTED' THEN 'CONFLICT'
            ELSE 'UNKNOWN'
        END::TEXT,
        p_pharmacy_id, v_journal.client_op_id, v_kind, v_journal.payload_hash,
        CASE WHEN v_kind = 'UNIFIED_SALE_V1' THEN v_journal.sale_id
             WHEN v_kind LIKE 'SALE_RETURN_%' THEN v_return.original_sale_id ELSE NULL END,
        v_checkout, v_journal.response_status::TEXT, v_response, v_journal.processed_at,
        v_journal.record_id,
        CASE WHEN v_kind LIKE 'SALE_RETURN_%' THEN v_journal.record_id ELSE NULL END;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_client_op_status_v2(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_client_op_status_v2(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_client_op_status_v2(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.rpc_get_client_op_status_v2(UUID, UUID) IS
'Role- and ownership-authorized evidence for unified sales and Refund V1/V2. Legacy stock evidence is explicitly non-financial; inaccessible existence cannot become authorized absence.';
