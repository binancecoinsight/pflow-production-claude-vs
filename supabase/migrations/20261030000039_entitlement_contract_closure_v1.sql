-- PF-SUP-2026-10-30-03 entitlement contract closure.
-- FORWARD-ONLY, ADDITIVE, UNEXECUTED. Preserves 000038 and all sealed bodies.

CREATE OR REPLACE FUNCTION public.resolve_effective_entitlement_v3(p_pharmacy_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
  v_now TIMESTAMPTZ:=transaction_timestamp();
  v_sub RECORD;
  v_features JSONB:='{}'::JSONB;
  v_state TEXT:='UNKNOWN';
  v_allowed BOOLEAN:=FALSE;
  v_reason TEXT;
  v_grace_end TIMESTAMPTZ;
  v_decision RECORD;
  v_has_decision BOOLEAN:=FALSE;
  v_historical_suspension BOOLEAN:=FALSE;
BEGIN
  SELECT s.plan_code,s.status,s.current_period_start,s.current_period_end
    INTO v_sub FROM public.subscriptions s WHERE s.pharmacy_id=p_pharmacy_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('pharmacy_id',p_pharmacy_id,'state','UNKNOWN','plan_code',NULL,
      'features','{}'::JSONB,'current_period_start',NULL,'current_period_end',NULL,'grace_period_end',NULL,
      'mutations_allowed',FALSE,'historical_reads_allowed',TRUE,'server_time',v_now,
      'administrative_decision_id',NULL,'administrative_decision_kind',NULL,
      'historical_suspension_anchor',FALSE,'reason','No authoritative subscription record found for pharmacy');
  END IF;
  IF v_sub.current_period_start IS NULL OR v_sub.current_period_end IS NULL OR
     v_sub.current_period_end < v_sub.current_period_start THEN
    RETURN jsonb_build_object('pharmacy_id',p_pharmacy_id,'state','UNKNOWN','plan_code',v_sub.plan_code,
      'features','{}'::JSONB,'current_period_start',v_sub.current_period_start,
      'current_period_end',v_sub.current_period_end,'grace_period_end',NULL,
      'mutations_allowed',FALSE,'historical_reads_allowed',TRUE,'server_time',v_now,
      'administrative_decision_id',NULL,'administrative_decision_kind',NULL,
      'historical_suspension_anchor',FALSE,'reason','Subscription timing evidence is incomplete or invalid');
  END IF;

  SELECT sp.features INTO v_features FROM public.subscription_plans sp WHERE sp.code=v_sub.plan_code;
  v_features:=COALESCE(v_features,'{}'::JSONB);
  v_grace_end:=v_sub.current_period_end+INTERVAL '7 days';
  IF v_sub.status IN ('CANCELLED','EXPIRED') THEN
    v_state:='EXPIRED'; v_allowed:=FALSE; v_reason:='The subscription is expired or cancelled.';
  ELSIF v_sub.status='PAST_DUE' AND v_now<v_grace_end THEN
    v_state:='GRACE'; v_allowed:=TRUE; v_reason:='Payment is past due; the recorded grace window is active.';
  ELSIF v_sub.status='PAST_DUE' THEN
    v_state:='EXPIRED'; v_allowed:=FALSE; v_reason:='Payment grace has ended.';
  ELSIF v_sub.status IN ('TRIAL','ACTIVE') AND v_now<v_sub.current_period_end THEN
    v_state:=v_sub.status; v_allowed:=TRUE; v_reason:='The recorded commercial period is active.';
  ELSIF v_sub.status IN ('TRIAL','ACTIVE') AND v_now<v_grace_end THEN
    v_state:='GRACE'; v_allowed:=TRUE; v_reason:='The recorded commercial period ended; grace is active.';
  ELSIF v_sub.status IN ('TRIAL','ACTIVE') THEN
    v_state:='EXPIRED'; v_allowed:=FALSE; v_reason:='The recorded commercial period and grace have ended.';
  ELSE
    v_state:='UNKNOWN'; v_allowed:=FALSE; v_reason:='Subscription status evidence is unrecognized.';
  END IF;

  SELECT d.id,d.decision_kind,d.effective_at,d.decision_sequence INTO v_decision
  FROM public.entitlement_administrative_decisions_v1 d
  WHERE d.pharmacy_id=p_pharmacy_id AND d.effective_at<=v_now
  ORDER BY d.effective_at DESC,d.decision_sequence DESC,d.id DESC LIMIT 1;
  v_has_decision:=FOUND;
  SELECT EXISTS (SELECT 1 FROM public.pharmacy_entitlement_anchors a
    WHERE a.pharmacy_id=p_pharmacy_id AND a.status='SUSPENDED') INTO v_historical_suspension;

  IF v_has_decision THEN
    IF v_decision.decision_kind IN ('SUSPEND','DENY_MUTATIONS') THEN
      v_state:='SUSPENDED'; v_allowed:=FALSE;
      v_reason:='An effective ordered administrative decision blocks new mutations.';
    ELSIF v_decision.decision_kind IN ('REINSTATE','ALLOW_MUTATIONS') THEN
      -- Explicit positive administration removes only the historical administrative overlay.
      -- It never manufactures a valid commercial period.
      NULL;
    ELSE
      v_state:='UNKNOWN'; v_allowed:=FALSE; v_reason:='Administrative decision evidence is invalid.';
    END IF;
  ELSIF v_historical_suspension THEN
    v_state:='SUSPENDED'; v_allowed:=FALSE;
    v_reason:='A historical suspension anchor remains effective until an explicit ordered decision supersedes it.';
  END IF;

  RETURN jsonb_build_object('pharmacy_id',p_pharmacy_id,'state',v_state,'plan_code',v_sub.plan_code,
    'features',v_features,'current_period_start',v_sub.current_period_start,
    'current_period_end',v_sub.current_period_end,'grace_period_end',v_grace_end,
    'mutations_allowed',v_allowed,'historical_reads_allowed',TRUE,'server_time',v_now,
    'administrative_decision_id',CASE WHEN v_has_decision THEN v_decision.id ELSE NULL END,
    'administrative_decision_kind',CASE WHEN v_has_decision THEN v_decision.decision_kind ELSE NULL END,
    'historical_suspension_anchor',v_historical_suspension,'reason',v_reason);
END; $$;
REVOKE ALL ON FUNCTION public.resolve_effective_entitlement_v3(UUID) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rpc_get_effective_entitlement_v2(p_pharmacy_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_effective JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_pharmacy_member(p_pharmacy_id) OR public.is_platform_admin('ADMIN')) THEN
    RAISE EXCEPTION 'ENTITLEMENT_READ_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  v_effective:=public.resolve_effective_entitlement_v3(p_pharmacy_id);
  RETURN v_effective;
END; $$;
REVOKE ALL ON FUNCTION public.rpc_get_effective_entitlement_v2(UUID) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_effective_entitlement_v2(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.entitlement_mutations_allowed_for_operator_v1(p_pharmacy_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  RETURN COALESCE((public.resolve_effective_entitlement_v3(p_pharmacy_id)->>'mutations_allowed')::BOOLEAN,FALSE);
END; $$;
REVOKE ALL ON FUNCTION public.entitlement_mutations_allowed_for_operator_v1(UUID) FROM PUBLIC,anon,authenticated,service_role;

-- Close the inherited M-9 overload without changing its financial body or response.
ALTER FUNCTION public.rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID)
  RENAME TO rpc_process_sale_return_m9_entitlement_base;
REVOKE ALL ON FUNCTION public.rpc_process_sale_return_m9_entitlement_base(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rpc_process_sale_return(
 p_pharmacy_id UUID,p_branch_id UUID,p_sale_id UUID,p_items JSONB,p_refund_amount NUMERIC(12,2),
 p_refund_payment_method VARCHAR(32),p_reason TEXT,p_client_op_id UUID DEFAULT NULL)
RETURNS TABLE(return_id UUID,status VARCHAR(16),refund_amount NUMERIC(12,2),processed_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r RECORD; v_actor UUID:=auth.uid();
BEGIN
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,p_branch_id,NULL,v_actor,'SALE_REFUND',p_client_op_id,NULL,FALSE,FALSE);
  SELECT * INTO r FROM public.rpc_process_sale_return_m9_entitlement_base(
    p_pharmacy_id,p_branch_id,p_sale_id,p_items,p_refund_amount,p_refund_payment_method,p_reason,p_client_op_id);
  RETURN QUERY SELECT r.return_id::UUID,r.status::VARCHAR(16),r.refund_amount::NUMERIC(12,2),r.processed_at::TIMESTAMPTZ;
END; $$;
REVOKE ALL ON FUNCTION public.rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.entitlement_intake_fingerprint_v2(
 p_branch_id UUID,p_items JSONB,p_supplier_id UUID,p_invoice_number TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT encode(sha256((SELECT jsonb_build_object(
    'branch_id',lower(p_branch_id::TEXT),
    'invoice_number',COALESCE(trim(p_invoice_number),''),
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'batch_number',trim(elem->>'batch_number'),
      'cost_price',COALESCE((elem->>'cost_price')::BIGINT,0),
      'expiry_date',trim(elem->>'expiry_date'),
      'product_id',lower(trim(elem->>'product_id')),
      'quantity',(elem->>'quantity')::INT,
      'selling_price',COALESCE((elem->>'selling_price')::BIGINT,0)
    ) ORDER BY lower(trim(elem->>'product_id')),trim(elem->>'batch_number'),trim(elem->>'expiry_date')
      FROM jsonb_array_elements(p_items) AS elem),'[]'::JSONB),
    'supplier_id',COALESCE(lower(p_supplier_id::TEXT),'')
  )::TEXT)::bytea),'hex');
$$;

CREATE OR REPLACE FUNCTION public.entitlement_adjustment_fingerprint_v2(
 p_pharmacy_id UUID,p_branch_id UUID,p_product_id UUID,p_batch_id UUID,p_direction VARCHAR,
 p_quantity INT,p_reason VARCHAR,p_notes TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT encode(sha256(jsonb_build_object(
    'batch_id',lower(p_batch_id::TEXT),'branch_id',lower(p_branch_id::TEXT),
    'direction',upper(trim(p_direction)),'notes',COALESCE(trim(p_notes),''),
    'pharmacy_id',lower(p_pharmacy_id::TEXT),'product_id',lower(p_product_id::TEXT),
    'quantity',p_quantity,'reason',upper(trim(p_reason))
  )::TEXT::bytea),'hex');
$$;

CREATE OR REPLACE FUNCTION public.entitlement_dispatch_fingerprint_v2(
 p_pharmacy_id UUID,p_source_branch_id UUID,p_destination_branch_id UUID,p_items JSONB,
 p_client_op_id UUID,p_notes TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT encode(sha256(jsonb_build_object(
    'client_op_id',lower(p_client_op_id::TEXT),
    'destination_branch_id',lower(p_destination_branch_id::TEXT),'items',p_items,
    'notes',COALESCE(trim(p_notes),''),'pharmacy_id',lower(p_pharmacy_id::TEXT),
    'source_branch_id',lower(p_source_branch_id::TEXT)
  )::TEXT::bytea),'hex');
$$;

CREATE OR REPLACE FUNCTION public.entitlement_receive_fingerprint_v2(
 p_pharmacy_id UUID,p_transfer_id UUID,p_client_op_id UUID,p_notes TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT encode(sha256(jsonb_build_object(
    'client_op_id',lower(p_client_op_id::TEXT),'notes',COALESCE(trim(p_notes),''),
    'pharmacy_id',lower(p_pharmacy_id::TEXT),'transfer_id',lower(p_transfer_id::TEXT)
  )::TEXT::bytea),'hex');
$$;

REVOKE ALL ON FUNCTION public.entitlement_intake_fingerprint_v2(UUID,JSONB,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.entitlement_adjustment_fingerprint_v2(UUID,UUID,UUID,UUID,VARCHAR,INT,VARCHAR,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.entitlement_dispatch_fingerprint_v2(UUID,UUID,UUID,JSONB,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.entitlement_receive_fingerprint_v2(UUID,UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rpc_receive_inventory_stock(
 p_pharmacy_id UUID,p_branch_id UUID,p_items JSONB,p_supplier_id UUID DEFAULT NULL,
 p_invoice_number TEXT DEFAULT NULL,p_notes TEXT DEFAULT NULL,p_client_op_id UUID DEFAULT NULL)
RETURNS TABLE(purchase_id UUID,status VARCHAR(16),total_items INT,total_cost BIGINT,processed_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r RECORD; v_actor UUID:=auth.uid(); v_hash TEXT;
BEGIN
  v_hash:=public.entitlement_intake_fingerprint_v2(p_branch_id,p_items,p_supplier_id,p_invoice_number);
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,p_branch_id,NULL,v_actor,'INVENTORY_INTAKE',p_client_op_id,v_hash,FALSE,p_client_op_id IS NOT NULL);
  SELECT * INTO r FROM public.rpc_receive_inventory_stock_entitlement_base(p_pharmacy_id,p_branch_id,p_items,p_supplier_id,p_invoice_number,p_notes,p_client_op_id);
  IF p_client_op_id IS NOT NULL THEN
    -- Evidence failure raises from this statement and atomically rolls back the delegated intake.
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
  v_hash:=public.entitlement_adjustment_fingerprint_v2(p_pharmacy_id,p_branch_id,p_product_id,p_batch_id,p_direction,p_quantity,p_reason,p_notes);
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
  v_hash:=public.entitlement_dispatch_fingerprint_v2(p_pharmacy_id,p_source_branch_id,p_destination_branch_id,p_items,p_client_op_id,p_notes);
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
  v_hash:=public.entitlement_receive_fingerprint_v2(p_pharmacy_id,p_transfer_id,p_client_op_id,p_notes);
  PERFORM public.assert_entitlement_operation_v5(p_pharmacy_id,v_branch,NULL,v_actor,'TRANSFER_RECEIVE',p_client_op_id,v_hash,FALSE,TRUE);
  SELECT * INTO r FROM public.rpc_receive_stock_transfer_entitlement_base(p_pharmacy_id,p_transfer_id,p_client_op_id,p_notes);
  PERFORM public.record_committed_entitlement_operation_v4(p_pharmacy_id,v_branch,'TRANSFER_RECEIVE',p_client_op_id,v_actor,NULL,v_hash,r.transfer_id,r.received_at);
  RETURN QUERY SELECT r.transfer_id::UUID,r.status::VARCHAR(16),r.total_items::INT,r.received_at::TIMESTAMPTZ;
END; $$;
REVOKE ALL ON FUNCTION public.rpc_receive_stock_transfer(UUID,UUID,UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_receive_stock_transfer(UUID,UUID,UUID,TEXT) TO authenticated;
