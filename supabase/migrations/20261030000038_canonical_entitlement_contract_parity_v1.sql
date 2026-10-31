-- PF-SUP-2026-10-30-01 canonical entitlement contract-parity implementation.
-- ADDITIVE, UNEXECUTED. Depends on 000035, 000036 and 20261030000037.
-- Protected RPC bodies are renamed and delegated to, preserving the latest
-- effective sealed definitions (including M-21 through M-25 corrections).

ALTER TABLE public.entitlement_committed_operations_v1
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT;

ALTER TABLE public.entitlement_committed_operations_v1
  DROP CONSTRAINT IF EXISTS entitlement_committed_operations_v1_operation_kind_check;
ALTER TABLE public.entitlement_committed_operations_v1
  ADD CONSTRAINT entitlement_committed_operations_v1_operation_kind_check CHECK (operation_kind IN (
    'SALE_COMMIT','SALE_CREATE','SALE_REFUND','INVENTORY_MUTATION','INVENTORY_INTAKE','INVENTORY_ADJUST',
    'STOCK_INTAKE','STOCK_ADJUSTMENT','STOCK_TRANSFER','TRANSFER_DISPATCH','TRANSFER_RECEIVE','REFUND_RESTOCK',
    'CUSTOMER_MUTATION','SUPPLIER_MUTATION','CASH_SHIFT_OPEN','DEVICE_ENROLLMENT','STAFF_MUTATION',
    'STAFF_INVITE','STAFF_INVITE_REVOKE','STAFF_ROLE_CHANGE','STAFF_REACTIVATE','STAFF_SUSPEND'
  ));

CREATE OR REPLACE FUNCTION public.entitlement_header_uuid_v1(p_headers JSONB,p_name TEXT)
RETURNS UUID LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v TEXT:=NULLIF(p_headers->>p_name,'');
BEGIN
  IF v IS NULL OR v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN NULL; END IF;
  RETURN v::UUID;
END; $$;
REVOKE ALL ON FUNCTION public.entitlement_header_uuid_v1(JSONB,TEXT) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.assert_entitlement_gateway_provenance_v1(
  p_actor_id UUID, p_pharmacy_id UUID, p_branch_id UUID, p_device_id UUID,
  p_operation_kind TEXT, p_client_operation_id UUID, p_payload_fingerprint TEXT
) RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_headers JSONB := COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::JSONB;
BEGIN
  IF COALESCE(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'TRUSTED_GATEWAY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF public.entitlement_header_uuid_v1(v_headers,'x-pharmacyflow-actor-id') IS DISTINCT FROM p_actor_id OR
     public.entitlement_header_uuid_v1(v_headers,'x-pharmacyflow-pharmacy-id') IS DISTINCT FROM p_pharmacy_id OR
     public.entitlement_header_uuid_v1(v_headers,'x-pharmacyflow-branch-id') IS DISTINCT FROM p_branch_id OR
     public.entitlement_header_uuid_v1(v_headers,'x-pharmacyflow-device-id') IS DISTINCT FROM p_device_id OR
     v_headers->>'x-pharmacyflow-operation-kind' IS DISTINCT FROM p_operation_kind OR
     public.entitlement_header_uuid_v1(v_headers,'x-pharmacyflow-client-operation-id') IS DISTINCT FROM p_client_operation_id OR
     lower(COALESCE(v_headers->>'x-pharmacyflow-payload-fingerprint','')) IS DISTINCT FROM lower(p_payload_fingerprint) THEN
    RAISE EXCEPTION 'TRUSTED_GATEWAY_PROVENANCE_MISMATCH' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_entitlement_gateway_provenance_v1(UUID,UUID,UUID,UUID,TEXT,UUID,TEXT) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_committed_entitlement_operation_v4(
  p_pharmacy_id UUID, p_branch_id UUID, p_operation_kind TEXT, p_client_operation_id UUID,
  p_actor_id UUID, p_device_id UUID, p_payload_fingerprint TEXT,
  p_domain_entity_id UUID, p_committed_at TIMESTAMPTZ
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_existing RECORD;
BEGIN
  IF p_operation_kind NOT IN ('SALE_COMMIT','SALE_CREATE','SALE_REFUND','INVENTORY_INTAKE','INVENTORY_ADJUST',
    'TRANSFER_DISPATCH','TRANSFER_RECEIVE','STAFF_INVITE','STAFF_INVITE_REVOKE','STAFF_ROLE_CHANGE',
    'STAFF_REACTIVATE','STAFF_SUSPEND') THEN
    RAISE EXCEPTION 'ENTITLEMENT_OPERATION_KIND_INVALID' USING ERRCODE='22023';
  END IF;
  IF auth.uid() IS DISTINCT FROM p_actor_id AND COALESCE(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'ENTITLEMENT_EVIDENCE_PRODUCER_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pharmacy_members pm WHERE pm.pharmacy_id=p_pharmacy_id AND pm.user_id=p_actor_id AND pm.status='ACTIVE') OR
     p_payload_fingerprint !~ '^[0-9a-f]{64}$' OR p_domain_entity_id=p_client_operation_id OR p_committed_at IS NULL THEN
    RAISE EXCEPTION 'ENTITLEMENT_EVIDENCE_INVALID' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.entitlement_committed_operations_v1
    (pharmacy_id,branch_id,operation_kind,client_operation_id,actor_id,device_id,payload_fingerprint,outcome,domain_entity_id,committed_at)
  VALUES (p_pharmacy_id,p_branch_id,p_operation_kind,p_client_operation_id,p_actor_id,p_device_id,lower(p_payload_fingerprint),'COMMITTED',p_domain_entity_id,p_committed_at)
  ON CONFLICT (pharmacy_id,operation_kind,client_operation_id) DO NOTHING;
  SELECT * INTO v_existing FROM public.entitlement_committed_operations_v1 e
  WHERE e.pharmacy_id=p_pharmacy_id AND e.operation_kind=p_operation_kind AND e.client_operation_id=p_client_operation_id;
  IF v_existing.branch_id IS DISTINCT FROM p_branch_id OR v_existing.actor_id<>p_actor_id OR
     v_existing.device_id IS DISTINCT FROM p_device_id OR v_existing.payload_fingerprint<>lower(p_payload_fingerprint) OR
     v_existing.outcome<>'COMMITTED' OR v_existing.domain_entity_id<>p_domain_entity_id THEN
    RAISE EXCEPTION 'ENTITLEMENT_EVIDENCE_CONFLICT' USING ERRCODE = '23505';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.record_committed_entitlement_operation_v4(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,UUID,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.entitlement_mutations_allowed_for_operator_v1(
  p_pharmacy_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_now TIMESTAMPTZ := transaction_timestamp();
  v_sub RECORD;
  v_decision_kind TEXT;
BEGIN
  SELECT s.status, s.current_period_start, s.current_period_end
    INTO v_sub
  FROM public.subscriptions s
  WHERE s.pharmacy_id = p_pharmacy_id;

  IF NOT FOUND OR v_sub.current_period_start IS NULL OR v_sub.current_period_end IS NULL OR
     v_sub.current_period_end < v_sub.current_period_start THEN
    RETURN FALSE;
  END IF;

  SELECT d.decision_kind INTO v_decision_kind
  FROM public.entitlement_administrative_decisions_v1 d
  WHERE d.pharmacy_id = p_pharmacy_id AND d.effective_at <= v_now
  ORDER BY d.effective_at DESC, d.decision_sequence DESC, d.id DESC
  LIMIT 1;

  IF FOUND AND v_decision_kind IN ('SUSPEND', 'DENY_MUTATIONS') THEN
    RETURN FALSE;
  END IF;

  IF v_sub.status IN ('CANCELLED', 'EXPIRED') THEN RETURN FALSE; END IF;
  IF v_sub.status = 'PAST_DUE' THEN RETURN v_now < v_sub.current_period_end + INTERVAL '7 days'; END IF;
  IF v_sub.status IN ('TRIAL', 'ACTIVE') THEN RETURN v_now < v_sub.current_period_end + INTERVAL '7 days'; END IF;
  RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.entitlement_mutations_allowed_for_operator_v1(UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_entitlement_operation_v5(
  p_pharmacy_id UUID, p_branch_id UUID, p_device_id UUID, p_actor_id UUID,
  p_operation_kind TEXT, p_client_operation_id UUID, p_payload_fingerprint TEXT,
  p_gateway_required BOOLEAN, p_replay_allowed BOOLEAN
) RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF p_operation_kind NOT IN ('SALE_COMMIT','SALE_CREATE','SALE_REFUND','INVENTORY_INTAKE','INVENTORY_ADJUST',
    'TRANSFER_DISPATCH','TRANSFER_RECEIVE','STAFF_INVITE','STAFF_INVITE_REVOKE','STAFF_ROLE_CHANGE',
    'STAFF_REACTIVATE','STAFF_SUSPEND') THEN
    RAISE EXCEPTION 'ENTITLEMENT_OPERATION_KIND_INVALID' USING ERRCODE='22023';
  END IF;
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pharmacy_members pm
    WHERE pm.pharmacy_id=p_pharmacy_id AND pm.user_id=p_actor_id AND pm.status='ACTIVE'
      AND (p_branch_id IS NULL OR pm.default_branch_id=p_branch_id OR pm.role IN ('OWNER','MANAGER'))
  ) THEN RAISE EXCEPTION 'INITIATING_OPERATOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_device_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.devices d WHERE d.id=p_device_id AND d.pharmacy_id=p_pharmacy_id
      AND d.branch_id=p_branch_id AND d.status='ACTIVE'
  ) THEN RAISE EXCEPTION 'DEVICE_BRANCH_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_gateway_required THEN
    PERFORM public.assert_entitlement_gateway_provenance_v1(p_actor_id,p_pharmacy_id,p_branch_id,p_device_id,p_operation_kind,p_client_operation_id,p_payload_fingerprint);
  ELSIF auth.uid() IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'INITIATING_OPERATOR_MISMATCH' USING ERRCODE='42501';
  END IF;
  IF public.entitlement_mutations_allowed_for_operator_v1(p_pharmacy_id) THEN RETURN; END IF;
  IF p_replay_allowed AND p_client_operation_id IS NOT NULL AND p_payload_fingerprint ~ '^[0-9a-f]{64}$' AND EXISTS (
    SELECT 1 FROM public.entitlement_committed_operations_v1 e
    WHERE e.pharmacy_id=p_pharmacy_id AND e.branch_id IS NOT DISTINCT FROM p_branch_id
      AND e.operation_kind=p_operation_kind AND e.client_operation_id=p_client_operation_id
      AND e.actor_id=p_actor_id AND e.device_id IS NOT DISTINCT FROM p_device_id
      AND e.payload_fingerprint=lower(p_payload_fingerprint) AND e.outcome='COMMITTED'
      AND e.committed_at IS NOT NULL AND e.domain_entity_id IS NOT NULL
  ) THEN RETURN; END IF;
  RAISE EXCEPTION 'ENTITLEMENT_MUTATION_BLOCKED' USING ERRCODE='P0001';
END;
$$;
REVOKE ALL ON FUNCTION public.assert_entitlement_operation_v5(UUID,UUID,UUID,UUID,TEXT,UUID,TEXT,BOOLEAN,BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;

-- Rename the latest effective protected definitions. Their bodies, locks,
-- nonce/claim logic, arithmetic, allocations, lifecycle and responses remain intact.
ALTER FUNCTION public.rpc_ingest_sale_stock_movement(UUID,UUID,UUID,UUID,UUID,UUID,UUID,INT,TEXT) RENAME TO rpc_ingest_sale_stock_movement_entitlement_base;
ALTER FUNCTION public.rpc_commit_sale_v1(UUID,UUID,UUID,UUID,UUID,UUID,UUID,TEXT,JSONB,JSONB) RENAME TO rpc_commit_sale_v1_entitlement_base;
ALTER FUNCTION public.rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID,TEXT) RENAME TO rpc_process_sale_return_entitlement_base;
ALTER FUNCTION public.rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) RENAME TO rpc_process_sale_return_v2_entitlement_base;
ALTER FUNCTION public.rpc_receive_inventory_stock(UUID,UUID,JSONB,UUID,TEXT,TEXT,UUID) RENAME TO rpc_receive_inventory_stock_entitlement_base;
ALTER FUNCTION public.rpc_adjust_inventory_stock(UUID,UUID,UUID,UUID,VARCHAR,INT,VARCHAR,UUID,TEXT) RENAME TO rpc_adjust_inventory_stock_entitlement_base;
ALTER FUNCTION public.rpc_dispatch_stock_transfer(UUID,UUID,UUID,JSONB,UUID,TEXT) RENAME TO rpc_dispatch_stock_transfer_entitlement_base;
ALTER FUNCTION public.rpc_receive_stock_transfer(UUID,UUID,UUID,TEXT) RENAME TO rpc_receive_stock_transfer_entitlement_base;
ALTER FUNCTION public.rpc_create_staff_invitation(UUID,UUID,TEXT,VARCHAR) RENAME TO rpc_create_staff_invitation_entitlement_base;
ALTER FUNCTION public.rpc_accept_staff_invitation(UUID,TEXT) RENAME TO rpc_accept_staff_invitation_entitlement_base;
ALTER FUNCTION public.rpc_revoke_staff_invitation(UUID) RENAME TO rpc_revoke_staff_invitation_entitlement_base;
ALTER FUNCTION public.rpc_change_member_role(UUID,UUID,VARCHAR) RENAME TO rpc_change_member_role_entitlement_base;
ALTER FUNCTION public.rpc_reactivate_pharmacy_member(UUID,UUID) RENAME TO rpc_reactivate_pharmacy_member_entitlement_base;
ALTER FUNCTION public.rpc_suspend_pharmacy_member(UUID,UUID) RENAME TO rpc_suspend_pharmacy_member_entitlement_base;

REVOKE ALL ON FUNCTION public.rpc_ingest_sale_stock_movement_entitlement_base(UUID,UUID,UUID,UUID,UUID,UUID,UUID,INT,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_commit_sale_v1_entitlement_base(UUID,UUID,UUID,UUID,UUID,UUID,UUID,TEXT,JSONB,JSONB) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_process_sale_return_entitlement_base(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_process_sale_return_v2_entitlement_base(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_receive_inventory_stock_entitlement_base(UUID,UUID,JSONB,UUID,TEXT,TEXT,UUID) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_adjust_inventory_stock_entitlement_base(UUID,UUID,UUID,UUID,VARCHAR,INT,VARCHAR,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_dispatch_stock_transfer_entitlement_base(UUID,UUID,UUID,JSONB,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_receive_stock_transfer_entitlement_base(UUID,UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_create_staff_invitation_entitlement_base(UUID,UUID,TEXT,VARCHAR) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_accept_staff_invitation_entitlement_base(UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_revoke_staff_invitation_entitlement_base(UUID) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_change_member_role_entitlement_base(UUID,UUID,VARCHAR) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_reactivate_pharmacy_member_entitlement_base(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_suspend_pharmacy_member_entitlement_base(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.entitlement_payload_fingerprint_v1(p_payload JSONB)
RETURNS TEXT LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $$ SELECT encode(public.sha256(p_payload::TEXT::bytea), 'hex') $$;
REVOKE ALL ON FUNCTION public.entitlement_payload_fingerprint_v1(JSONB) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rpc_commit_sale_v1(
 p_actor_user_id UUID,p_pharmacy_id UUID,p_branch_id UUID,p_device_id UUID,p_client_op_id UUID,
 p_checkout_intent_id UUID,p_nonce UUID,p_payload_hash TEXT,p_sale JSONB,p_items JSONB)
RETURNS TABLE(operation_status VARCHAR,sale_id UUID,processed_at TIMESTAMPTZ,response_payload JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r RECORD;
BEGIN
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,p_branch_id,p_device_id,p_actor_user_id,'SALE_COMMIT',p_client_op_id,p_payload_hash,TRUE,TRUE);
  SELECT * INTO r FROM public.rpc_commit_sale_v1_entitlement_base(p_actor_user_id,p_pharmacy_id,p_branch_id,p_device_id,p_client_op_id,p_checkout_intent_id,p_nonce,p_payload_hash,p_sale,p_items);
  PERFORM public.record_committed_entitlement_operation_v4(p_pharmacy_id,p_branch_id,'SALE_COMMIT',p_client_op_id,p_actor_user_id,p_device_id,p_payload_hash,r.sale_id,r.processed_at);
  RETURN QUERY SELECT r.operation_status::VARCHAR,r.sale_id::UUID,r.processed_at::TIMESTAMPTZ,r.response_payload::JSONB;
END; $$;
REVOKE ALL ON FUNCTION public.rpc_commit_sale_v1(UUID,UUID,UUID,UUID,UUID,UUID,UUID,TEXT,JSONB,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_commit_sale_v1(UUID,UUID,UUID,UUID,UUID,UUID,UUID,TEXT,JSONB,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_process_sale_return_v2(
 p_actor_user_id UUID,p_pharmacy_id UUID,p_branch_id UUID,p_device_id UUID,p_client_op_id UUID,p_nonce UUID,
 p_payload_hash TEXT,p_sale_id UUID,p_items JSONB,p_expected_refund_amount_minor BIGINT,p_refund_payment_method VARCHAR,p_reason TEXT)
RETURNS TABLE(operation_status VARCHAR,return_id UUID,processed_at TIMESTAMPTZ,response_payload JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r RECORD;
BEGIN
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,p_branch_id,p_device_id,p_actor_user_id,'SALE_REFUND',p_client_op_id,p_payload_hash,TRUE,TRUE);
  SELECT * INTO r FROM public.rpc_process_sale_return_v2_entitlement_base(p_actor_user_id,p_pharmacy_id,p_branch_id,p_device_id,p_client_op_id,p_nonce,p_payload_hash,p_sale_id,p_items,p_expected_refund_amount_minor,p_refund_payment_method,p_reason);
  PERFORM public.record_committed_entitlement_operation_v4(p_pharmacy_id,p_branch_id,'SALE_REFUND',p_client_op_id,p_actor_user_id,p_device_id,p_payload_hash,r.return_id,r.processed_at);
  RETURN QUERY SELECT r.operation_status::VARCHAR,r.return_id::UUID,r.processed_at::TIMESTAMPTZ,r.response_payload::JSONB;
END; $$;
REVOKE ALL ON FUNCTION public.rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_ingest_sale_stock_movement(
 p_client_op_id UUID,p_pharmacy_id UUID,p_branch_id UUID,p_device_id UUID,p_sale_id UUID,
 p_product_id UUID,p_batch_id UUID,p_quantity INT,p_payload_hash TEXT)
RETURNS TABLE(operation_status VARCHAR,new_stock INT,deficit_created BOOLEAN,processed_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r RECORD; v_headers JSONB:=COALESCE(NULLIF(current_setting('request.headers',true),''),'{}')::JSONB;
  v_actor UUID;
BEGIN
  v_actor:=public.entitlement_header_uuid_v1(v_headers,'x-pharmacyflow-actor-id');
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,p_branch_id,p_device_id,v_actor,'SALE_CREATE',p_client_op_id,p_payload_hash,TRUE,TRUE);
  SELECT * INTO r FROM public.rpc_ingest_sale_stock_movement_entitlement_base(p_client_op_id,p_pharmacy_id,p_branch_id,p_device_id,p_sale_id,p_product_id,p_batch_id,p_quantity,p_payload_hash);
  PERFORM public.record_committed_entitlement_operation_v4(p_pharmacy_id,p_branch_id,'SALE_CREATE',p_client_op_id,v_actor,p_device_id,p_payload_hash,p_sale_id,r.processed_at);
  RETURN QUERY SELECT r.operation_status::VARCHAR,r.new_stock::INT,r.deficit_created::BOOLEAN,r.processed_at::TIMESTAMPTZ;
END; $$;
REVOKE ALL ON FUNCTION public.rpc_ingest_sale_stock_movement(UUID,UUID,UUID,UUID,UUID,UUID,UUID,INT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ingest_sale_stock_movement(UUID,UUID,UUID,UUID,UUID,UUID,UUID,INT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_process_sale_return(
 p_pharmacy_id UUID,p_branch_id UUID,p_sale_id UUID,p_items JSONB,p_refund_amount NUMERIC(12,2),
 p_refund_payment_method VARCHAR,p_reason TEXT,p_client_op_id UUID DEFAULT NULL,p_payload_hash TEXT DEFAULT NULL)
RETURNS TABLE(return_id UUID,status VARCHAR,refund_amount NUMERIC(12,2),processed_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r RECORD; v_actor UUID:=auth.uid();
BEGIN
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,p_branch_id,NULL,v_actor,'SALE_REFUND',p_client_op_id,p_payload_hash,FALSE,p_client_op_id IS NOT NULL AND p_payload_hash IS NOT NULL);
  SELECT * INTO r FROM public.rpc_process_sale_return_entitlement_base(p_pharmacy_id,p_branch_id,p_sale_id,p_items,p_refund_amount,p_refund_payment_method,p_reason,p_client_op_id,p_payload_hash);
  IF p_client_op_id IS NOT NULL AND p_payload_hash ~ '^[0-9a-f]{64}$' THEN
    PERFORM public.record_committed_entitlement_operation_v4(p_pharmacy_id,p_branch_id,'SALE_REFUND',p_client_op_id,v_actor,NULL,p_payload_hash,r.return_id,r.processed_at);
  END IF;
  RETURN QUERY SELECT r.return_id::UUID,r.status::VARCHAR,r.refund_amount::NUMERIC(12,2),r.processed_at::TIMESTAMPTZ;
END; $$;
REVOKE ALL ON FUNCTION public.rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_receive_inventory_stock(
 p_pharmacy_id UUID,p_branch_id UUID,p_items JSONB,p_supplier_id UUID DEFAULT NULL,
 p_invoice_number TEXT DEFAULT NULL,p_notes TEXT DEFAULT NULL,p_client_op_id UUID DEFAULT NULL)
RETURNS TABLE(purchase_id UUID,status VARCHAR(16),total_items INT,total_cost BIGINT,processed_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r RECORD; v_actor UUID:=auth.uid(); v_hash TEXT;
BEGIN
  v_hash:=public.entitlement_payload_fingerprint_v1(jsonb_build_object(
    'branch_id',p_branch_id,'invoice_number',COALESCE(trim(p_invoice_number),''),'items',p_items,
    'supplier_id',p_supplier_id));
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,p_branch_id,NULL,v_actor,'INVENTORY_INTAKE',p_client_op_id,v_hash,FALSE,p_client_op_id IS NOT NULL);
  SELECT * INTO r FROM public.rpc_receive_inventory_stock_entitlement_base(p_pharmacy_id,p_branch_id,p_items,p_supplier_id,p_invoice_number,p_notes,p_client_op_id);
  IF p_client_op_id IS NOT NULL THEN
    PERFORM public.record_committed_entitlement_operation_v4(p_pharmacy_id,p_branch_id,'INVENTORY_INTAKE',p_client_op_id,v_actor,NULL,v_hash,r.purchase_id,r.processed_at);
  END IF;
  RETURN QUERY SELECT r.purchase_id::UUID,r.status::VARCHAR(16),r.total_items::INT,r.total_cost::BIGINT,r.processed_at::TIMESTAMPTZ;
END; $$;
REVOKE ALL ON FUNCTION public.rpc_receive_inventory_stock(UUID,UUID,JSONB,UUID,TEXT,TEXT,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_receive_inventory_stock(UUID,UUID,JSONB,UUID,TEXT,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_adjust_inventory_stock(
 p_pharmacy_id UUID,p_branch_id UUID,p_product_id UUID,p_batch_id UUID,p_direction VARCHAR(16),
 p_quantity INT,p_reason VARCHAR(64),p_client_op_id UUID,p_notes TEXT DEFAULT NULL)
RETURNS TABLE(adjustment_id UUID,batch_id UUID,previous_quantity INT,adjustment_quantity INT,resulting_quantity INT,adjusted_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r RECORD; v_actor UUID:=auth.uid(); v_hash TEXT;
BEGIN
  v_hash:=public.entitlement_payload_fingerprint_v1(jsonb_build_object(
    'batch_id',p_batch_id,'branch_id',p_branch_id,'direction',upper(trim(p_direction)),
    'notes',COALESCE(trim(p_notes),''),'pharmacy_id',p_pharmacy_id,'product_id',p_product_id,
    'quantity',p_quantity,'reason',upper(trim(p_reason))));
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,p_branch_id,NULL,v_actor,'INVENTORY_ADJUST',p_client_op_id,v_hash,FALSE,TRUE);
  SELECT * INTO r FROM public.rpc_adjust_inventory_stock_entitlement_base(p_pharmacy_id,p_branch_id,p_product_id,p_batch_id,p_direction,p_quantity,p_reason,p_client_op_id,p_notes);
  PERFORM public.record_committed_entitlement_operation_v4(p_pharmacy_id,p_branch_id,'INVENTORY_ADJUST',p_client_op_id,v_actor,NULL,v_hash,r.adjustment_id,r.adjusted_at);
  RETURN QUERY SELECT r.adjustment_id::UUID,r.batch_id::UUID,r.previous_quantity::INT,r.adjustment_quantity::INT,r.resulting_quantity::INT,r.adjusted_at::TIMESTAMPTZ;
END; $$;
REVOKE ALL ON FUNCTION public.rpc_adjust_inventory_stock(UUID,UUID,UUID,UUID,VARCHAR,INT,VARCHAR,UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_inventory_stock(UUID,UUID,UUID,UUID,VARCHAR,INT,VARCHAR,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_dispatch_stock_transfer(
 p_pharmacy_id UUID,p_source_branch_id UUID,p_destination_branch_id UUID,p_items JSONB,
 p_client_op_id UUID,p_notes TEXT DEFAULT NULL)
RETURNS TABLE(transfer_id UUID,status VARCHAR(16),total_items INT,dispatched_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r RECORD; v_actor UUID:=auth.uid(); v_hash TEXT;
BEGIN
  v_hash:=public.entitlement_payload_fingerprint_v1(jsonb_build_object(
    'client_op_id',p_client_op_id,'destination_branch_id',p_destination_branch_id,
    'items',p_items,'notes',COALESCE(trim(p_notes),''),'pharmacy_id',p_pharmacy_id,
    'source_branch_id',p_source_branch_id));
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,p_source_branch_id,NULL,v_actor,'TRANSFER_DISPATCH',p_client_op_id,v_hash,FALSE,TRUE);
  SELECT * INTO r FROM public.rpc_dispatch_stock_transfer_entitlement_base(p_pharmacy_id,p_source_branch_id,p_destination_branch_id,p_items,p_client_op_id,p_notes);
  PERFORM public.record_committed_entitlement_operation_v4(p_pharmacy_id,p_source_branch_id,'TRANSFER_DISPATCH',p_client_op_id,v_actor,NULL,v_hash,r.transfer_id,r.dispatched_at);
  RETURN QUERY SELECT r.transfer_id::UUID,r.status::VARCHAR(16),r.total_items::INT,r.dispatched_at::TIMESTAMPTZ;
END; $$;
REVOKE ALL ON FUNCTION public.rpc_dispatch_stock_transfer(UUID,UUID,UUID,JSONB,UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_dispatch_stock_transfer(UUID,UUID,UUID,JSONB,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_receive_stock_transfer(
 p_pharmacy_id UUID,p_transfer_id UUID,p_client_op_id UUID,p_notes TEXT DEFAULT NULL)
RETURNS TABLE(transfer_id UUID,status VARCHAR(16),total_items INT,received_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r RECORD; v_actor UUID:=auth.uid(); v_hash TEXT; v_branch UUID;
BEGIN
  SELECT t.destination_branch_id INTO v_branch FROM public.stock_transfers t
  WHERE t.id=p_transfer_id AND t.pharmacy_id=p_pharmacy_id;
  v_hash:=public.entitlement_payload_fingerprint_v1(jsonb_build_object(
    'client_op_id',p_client_op_id,'notes',COALESCE(trim(p_notes),''),
    'pharmacy_id',p_pharmacy_id,'transfer_id',p_transfer_id));
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,v_branch,NULL,v_actor,'TRANSFER_RECEIVE',p_client_op_id,v_hash,FALSE,TRUE);
  SELECT * INTO r FROM public.rpc_receive_stock_transfer_entitlement_base(p_pharmacy_id,p_transfer_id,p_client_op_id,p_notes);
  PERFORM public.record_committed_entitlement_operation_v4(p_pharmacy_id,v_branch,'TRANSFER_RECEIVE',p_client_op_id,v_actor,NULL,v_hash,r.transfer_id,r.received_at);
  RETURN QUERY SELECT r.transfer_id::UUID,r.status::VARCHAR(16),r.total_items::INT,r.received_at::TIMESTAMPTZ;
END; $$;
REVOKE ALL ON FUNCTION public.rpc_receive_stock_transfer(UUID,UUID,UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_receive_stock_transfer(UUID,UUID,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_entitlement_for_invitation_accept_v1(p_pharmacy_id UUID)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
  IF NOT public.entitlement_mutations_allowed_for_operator_v1(p_pharmacy_id) THEN
    RAISE EXCEPTION 'ENTITLEMENT_MUTATION_BLOCKED' USING ERRCODE='P0001';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.assert_entitlement_for_invitation_accept_v1(UUID) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rpc_create_staff_invitation(
 p_pharmacy_id UUID,p_branch_id UUID,p_email TEXT,p_role VARCHAR(32)) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_actor UUID:=auth.uid(); v_result JSONB;
BEGIN
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,p_branch_id,NULL,v_actor,'STAFF_INVITE',NULL,NULL,FALSE,FALSE);
  v_result:=public.rpc_create_staff_invitation_entitlement_base(p_pharmacy_id,p_branch_id,p_email,p_role);
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.rpc_create_staff_invitation(UUID,UUID,TEXT,VARCHAR) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_staff_invitation(UUID,UUID,TEXT,VARCHAR) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_accept_staff_invitation(p_invitation_id UUID,p_raw_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_pharmacy UUID; v_result JSONB;
BEGIN
  SELECT i.pharmacy_id INTO v_pharmacy FROM public.staff_invitations i WHERE i.id=p_invitation_id;
  IF FOUND THEN PERFORM public.assert_entitlement_for_invitation_accept_v1(v_pharmacy); END IF;
  v_result:=public.rpc_accept_staff_invitation_entitlement_base(p_invitation_id,p_raw_token);
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.rpc_accept_staff_invitation(UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_accept_staff_invitation(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_revoke_staff_invitation(p_invitation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_pharmacy UUID; v_branch UUID; v_actor UUID:=auth.uid();
BEGIN
  SELECT i.pharmacy_id,i.branch_id INTO v_pharmacy,v_branch FROM public.staff_invitations i WHERE i.id=p_invitation_id;
  IF FOUND THEN PERFORM public.assert_entitlement_operation_v5(v_pharmacy,v_branch,NULL,v_actor,'STAFF_INVITE_REVOKE',NULL,NULL,FALSE,FALSE); END IF;
  PERFORM public.rpc_revoke_staff_invitation_entitlement_base(p_invitation_id);
END; $$;
REVOKE ALL ON FUNCTION public.rpc_revoke_staff_invitation(UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_staff_invitation(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_change_member_role(p_pharmacy_id UUID,p_target_user_id UUID,p_new_role VARCHAR(32))
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,NULL,NULL,auth.uid(),'STAFF_ROLE_CHANGE',NULL,NULL,FALSE,FALSE);
  PERFORM public.rpc_change_member_role_entitlement_base(p_pharmacy_id,p_target_user_id,p_new_role);
END; $$;
REVOKE ALL ON FUNCTION public.rpc_change_member_role(UUID,UUID,VARCHAR) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_change_member_role(UUID,UUID,VARCHAR) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_reactivate_pharmacy_member(p_pharmacy_id UUID,p_target_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,NULL,NULL,auth.uid(),'STAFF_REACTIVATE',NULL,NULL,FALSE,FALSE);
  PERFORM public.rpc_reactivate_pharmacy_member_entitlement_base(p_pharmacy_id,p_target_user_id);
END; $$;
REVOKE ALL ON FUNCTION public.rpc_reactivate_pharmacy_member(UUID,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_reactivate_pharmacy_member(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_suspend_pharmacy_member(p_pharmacy_id UUID,p_target_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,NULL,NULL,auth.uid(),'STAFF_SUSPEND',NULL,NULL,FALSE,FALSE);
  PERFORM public.rpc_suspend_pharmacy_member_entitlement_base(p_pharmacy_id,p_target_user_id);
END; $$;
REVOKE ALL ON FUNCTION public.rpc_suspend_pharmacy_member(UUID,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_suspend_pharmacy_member(UUID,UUID) TO authenticated;

COMMENT ON FUNCTION public.assert_entitlement_operation_v5(UUID,UUID,UUID,UUID,TEXT,UUID,TEXT,BOOLEAN,BOOLEAN) IS
  'Canonical private mutation guard. Exact replay is bound to pharmacy, branch, operation kind, client operation, actor, device and fingerprint.';
