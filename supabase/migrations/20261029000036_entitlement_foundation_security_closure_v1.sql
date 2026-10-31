-- PF-MVP-08 foundation-only security correction proposal.
-- ADDITIVE, UNEXECUTED. Does not wire any business mutation route.

CREATE TABLE public.entitlement_administrative_decisions_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  decision_kind TEXT NOT NULL CHECK (decision_kind IN ('SUSPEND','REINSTATE','DENY_MUTATIONS','ALLOW_MUTATIONS')),
  effective_at TIMESTAMPTZ NOT NULL,
  decision_sequence BIGINT GENERATED ALWAYS AS IDENTITY,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  decided_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (pharmacy_id, effective_at, decision_sequence)
);

ALTER TABLE public.entitlement_administrative_decisions_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_administrative_decisions_v1 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.entitlement_administrative_decisions_v1 FROM PUBLIC, anon, authenticated;

CREATE TABLE public.entitlement_committed_operations_v1 (
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id),
  operation_kind TEXT NOT NULL CHECK (operation_kind IN ('SALE_COMMIT','INVENTORY_MUTATION','STOCK_INTAKE','STOCK_ADJUSTMENT','STOCK_TRANSFER','REFUND_RESTOCK','CUSTOMER_MUTATION','SUPPLIER_MUTATION','CASH_SHIFT_OPEN','DEVICE_ENROLLMENT','STAFF_MUTATION')),
  client_operation_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  device_id UUID,
  payload_fingerprint TEXT NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  outcome TEXT NOT NULL CHECK (outcome IN ('COMMITTED','PENDING','REJECTED')),
  domain_entity_id UUID,
  committed_at TIMESTAMPTZ,
  PRIMARY KEY (pharmacy_id, operation_kind, client_operation_id),
  CHECK ((outcome = 'COMMITTED') = (committed_at IS NOT NULL AND domain_entity_id IS NOT NULL)),
  CHECK (domain_entity_id IS NULL OR domain_entity_id <> client_operation_id)
);

ALTER TABLE public.entitlement_committed_operations_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_committed_operations_v1 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.entitlement_committed_operations_v1 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.authorize_exact_entitlement_replay_v2(
  p_pharmacy_id UUID, p_operation_kind TEXT, p_client_operation_id UUID,
  p_actor_id UUID, p_device_id UUID, p_payload_fingerprint TEXT
) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.is_pharmacy_member(p_pharmacy_id)
    AND p_operation_kind IN ('SALE_COMMIT','INVENTORY_MUTATION','STOCK_INTAKE','STOCK_ADJUSTMENT','STOCK_TRANSFER','REFUND_RESTOCK','CUSTOMER_MUTATION','SUPPLIER_MUTATION','CASH_SHIFT_OPEN','DEVICE_ENROLLMENT','STAFF_MUTATION')
    AND EXISTS (
      SELECT 1 FROM public.entitlement_committed_operations_v1 e
      WHERE e.pharmacy_id = p_pharmacy_id AND e.operation_kind = p_operation_kind
        AND e.client_operation_id = p_client_operation_id AND e.actor_id = p_actor_id
        AND e.device_id IS NOT DISTINCT FROM p_device_id
        AND e.payload_fingerprint = lower(p_payload_fingerprint)
        AND e.outcome = 'COMMITTED' AND e.committed_at IS NOT NULL
        AND e.domain_entity_id IS NOT NULL AND e.domain_entity_id <> e.client_operation_id
    );
$$;

REVOKE ALL ON FUNCTION public.authorize_exact_entitlement_replay_v2(UUID,TEXT,UUID,UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated;

-- Deterministic decision overlay for future server wiring. Later effective time wins;
-- ties use the monotonic sequence and UUID. Renewal records never bypass a later
-- SUSPEND or DENY_MUTATIONS decision; only explicit REINSTATE/ALLOW_MUTATIONS does.
CREATE OR REPLACE FUNCTION public.latest_entitlement_decision_v1(p_pharmacy_id UUID, p_as_of TIMESTAMPTZ)
RETURNS TABLE(decision_kind TEXT, effective_at TIMESTAMPTZ, decision_sequence BIGINT, decision_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT d.decision_kind, d.effective_at, d.decision_sequence, d.id
  FROM public.entitlement_administrative_decisions_v1 d
  WHERE d.pharmacy_id = p_pharmacy_id AND d.effective_at <= p_as_of
  ORDER BY d.effective_at DESC, d.decision_sequence DESC, d.id DESC LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.latest_entitlement_decision_v1(UUID,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
