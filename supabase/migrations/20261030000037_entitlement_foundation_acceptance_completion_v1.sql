-- PF-MVP-08 foundation acceptance completion (PF-SUP-2026-10-29-04).
-- ADDITIVE AND UNEXECUTED. This migration does not wire any business route.
-- Migration 000035 is provenance-unresolved and byte-preserved; unsafe/superseded
-- callable surfaces are revoked here rather than rewritten in historical source.

-- Superseded public helpers are closed by exact signature. A SECURITY DEFINER
-- owner's current_user/session_user is never treated as caller authorization.
REVOKE ALL ON FUNCTION public.rpc_record_entitlement_anchor_v1(UUID,VARCHAR,TEXT,BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_get_effective_entitlement_v1(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_pharmacy_mutation_entitled_v1(UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated, service_role;
DO $$ BEGIN
  IF to_regprocedure('public.assert_pharmacy_mutation_entitled_v1(uuid,text,uuid,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.assert_pharmacy_mutation_entitled_v1(UUID,TEXT,UUID,TEXT) FROM PUBLIC, anon, authenticated, service_role';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.is_subscription_active(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.authorize_exact_entitlement_replay_v2(UUID,TEXT,UUID,UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.latest_entitlement_decision_v1(UUID,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_record_entitlement_decision_v2(
  p_pharmacy_id UUID, p_decision_kind TEXT, p_effective_at TIMESTAMPTZ, p_reason TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin('ADMIN') THEN
    RAISE EXCEPTION 'ENTITLEMENT_DECISION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_decision_kind NOT IN ('SUSPEND','REINSTATE','DENY_MUTATIONS','ALLOW_MUTATIONS') OR
     p_effective_at IS NULL OR length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'ENTITLEMENT_DECISION_INVALID' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.entitlement_administrative_decisions_v1
    (pharmacy_id, decision_kind, effective_at, reason, decided_by)
  VALUES (p_pharmacy_id, p_decision_kind, p_effective_at, btrim(p_reason), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_record_entitlement_decision_v2(UUID,TEXT,TIMESTAMPTZ,TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_record_entitlement_decision_v2(UUID,TEXT,TIMESTAMPTZ,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_committed_entitlement_operation_v2(
  p_pharmacy_id UUID, p_operation_kind TEXT, p_client_operation_id UUID,
  p_actor_id UUID, p_device_id UUID, p_payload_fingerprint TEXT,
  p_domain_entity_id UUID, p_committed_at TIMESTAMPTZ
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'ENTITLEMENT_EVIDENCE_PRODUCER_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_operation_kind NOT IN ('SALE_COMMIT','INVENTORY_MUTATION','STOCK_INTAKE','STOCK_ADJUSTMENT','STOCK_TRANSFER','REFUND_RESTOCK','CUSTOMER_MUTATION','SUPPLIER_MUTATION','CASH_SHIFT_OPEN','DEVICE_ENROLLMENT','STAFF_MUTATION') OR
     p_payload_fingerprint !~ '^[0-9a-f]{64}$' OR p_domain_entity_id = p_client_operation_id OR p_committed_at IS NULL THEN
    RAISE EXCEPTION 'ENTITLEMENT_EVIDENCE_INVALID' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.entitlement_committed_operations_v1
    (pharmacy_id, operation_kind, client_operation_id, actor_id, device_id,
     payload_fingerprint, outcome, domain_entity_id, committed_at)
  VALUES (p_pharmacy_id, p_operation_kind, p_client_operation_id, p_actor_id, p_device_id,
          p_payload_fingerprint, 'COMMITTED', p_domain_entity_id, p_committed_at);
END;
$$;
REVOKE ALL ON FUNCTION public.record_committed_entitlement_operation_v2(UUID,TEXT,UUID,UUID,UUID,TEXT,UUID,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_committed_entitlement_operation_v2(UUID,TEXT,UUID,UUID,UUID,TEXT,UUID,TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION public.authorize_exact_entitlement_replay_v3(
  p_pharmacy_id UUID, p_operation_kind TEXT, p_client_operation_id UUID,
  p_actor_id UUID, p_device_id UUID, p_payload_fingerprint TEXT
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_evidence RECORD;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_pharmacy_member(p_pharmacy_id) OR auth.uid() <> p_actor_id THEN
    RETURN NULL;
  END IF;
  IF p_operation_kind NOT IN ('SALE_COMMIT','INVENTORY_MUTATION','STOCK_INTAKE','STOCK_ADJUSTMENT','STOCK_TRANSFER','REFUND_RESTOCK','CUSTOMER_MUTATION','SUPPLIER_MUTATION','CASH_SHIFT_OPEN','DEVICE_ENROLLMENT','STAFF_MUTATION') OR
     p_payload_fingerprint !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT e.* INTO v_evidence FROM public.entitlement_committed_operations_v1 e
  WHERE e.pharmacy_id = p_pharmacy_id AND e.operation_kind = p_operation_kind
    AND e.client_operation_id = p_client_operation_id AND e.actor_id = p_actor_id
    AND e.device_id IS NOT DISTINCT FROM p_device_id
    AND e.payload_fingerprint = p_payload_fingerprint AND e.outcome = 'COMMITTED'
    AND e.domain_entity_id IS NOT NULL AND e.domain_entity_id <> e.client_operation_id
    AND e.committed_at IS NOT NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'pharmacy_id', v_evidence.pharmacy_id, 'operation_kind', v_evidence.operation_kind,
    'client_operation_id', v_evidence.client_operation_id, 'actor_id', v_evidence.actor_id,
    'device_id', v_evidence.device_id, 'payload_fingerprint', v_evidence.payload_fingerprint,
    'outcome', v_evidence.outcome, 'domain_entity_id', v_evidence.domain_entity_id,
    'committed_at', v_evidence.committed_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.authorize_exact_entitlement_replay_v3(UUID,TEXT,UUID,UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_get_effective_entitlement_v2(p_pharmacy_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_now TIMESTAMPTZ := transaction_timestamp(); v_base JSONB; v_decision RECORD;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_pharmacy_member(p_pharmacy_id) OR public.is_platform_admin('ADMIN')) THEN
    RAISE EXCEPTION 'ENTITLEMENT_READ_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  v_base := public.rpc_get_effective_entitlement_v1(p_pharmacy_id);
  SELECT d.decision_kind, d.effective_at, d.decision_sequence, d.id INTO v_decision
  FROM public.entitlement_administrative_decisions_v1 d
  WHERE d.pharmacy_id = p_pharmacy_id AND d.effective_at <= v_now
  ORDER BY d.effective_at DESC, d.decision_sequence DESC, d.id DESC LIMIT 1;
  IF FOUND AND v_decision.decision_kind IN ('SUSPEND','DENY_MUTATIONS') THEN
    v_base := v_base || jsonb_build_object(
      'state','SUSPENDED','mutations_allowed',FALSE,'server_time',v_now,
      'administrative_decision_id',v_decision.id,
      'administrative_decision_kind',v_decision.decision_kind,
      'reason','An effective administrative decision blocks new mutations.'
    );
  ELSE
    v_base := v_base || jsonb_build_object(
      'server_time',v_now,
      'administrative_decision_id',CASE WHEN FOUND THEN v_decision.id ELSE NULL END,
      'administrative_decision_kind',CASE WHEN FOUND THEN v_decision.decision_kind ELSE NULL END
    );
  END IF;
  RETURN v_base;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_get_effective_entitlement_v2(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_effective_entitlement_v2(UUID) TO authenticated;

COMMENT ON FUNCTION public.rpc_get_effective_entitlement_v2(UUID) IS
  'Foundation evaluator only. Business mutation routes remain unwired pending separate authorization.';
