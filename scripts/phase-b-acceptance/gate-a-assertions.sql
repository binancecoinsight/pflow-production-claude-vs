\set ON_ERROR_STOP on
\echo 'UNEXECUTED WORKSHEET: Gate A status-v2 authorization matrix'

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_forbidden(p_case text, p_caller uuid, p_pharmacy uuid, p_op uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',COALESCE(p_caller::text,''),true);
  BEGIN
    PERFORM * FROM public.rpc_get_client_op_status_v2(p_pharmacy,p_op);
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'OPERATION_STATUS_FORBIDDEN' THEN RAISE; END IF;
    caught := true;
  END;
  IF NOT caught THEN RAISE EXCEPTION '% expected 42501 OPERATION_STATUS_FORBIDDEN', p_case; END IF;
  RAISE NOTICE 'PASS % forbidden', p_case;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_outcome(p_case text, p_caller uuid, p_op uuid, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',p_caller::text,true);
  SELECT * INTO STRICT r FROM public.rpc_get_client_op_status_v2('b1000000-0000-4000-8000-000000000001',p_op);
  IF r.outcome <> p_expected THEN RAISE EXCEPTION '% expected %, got %',p_case,p_expected,r.outcome; END IF;
  IF r.pharmacy_id <> 'b1000000-0000-4000-8000-000000000001'::uuid OR r.client_op_id <> p_op THEN
    RAISE EXCEPTION '% identity mismatch',p_case;
  END IF;
  RAISE NOTICE 'PASS % outcome=% kind=%',p_case,r.outcome,r.operation_kind;
END $$;

-- A-01: anonymous, suspended and cross-tenant callers cannot distinguish
-- present from absent tenant-A operations.
SELECT pg_temp.expect_forbidden('A-01 anonymous present',NULL,'b1000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_forbidden('A-01 suspended present','b3000000-0000-4000-8000-000000000006','b1000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_forbidden('A-01 suspended absent','b3000000-0000-4000-8000-000000000006','b1000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000099');
SELECT pg_temp.expect_forbidden('A-01 tenant-B present','b3000000-0000-4000-8000-000000000007','b1000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_forbidden('A-01 tenant-B absent','b3000000-0000-4000-8000-000000000007','b1000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000099');

-- A-02: management roles may inspect tenant-A evidence across its branches.
SELECT pg_temp.expect_outcome('A-02 owner sale','b3000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000002','CONFIRMED_COMMITTED');
SELECT pg_temp.expect_outcome('A-02 manager V1','b3000000-0000-4000-8000-000000000002','ba000000-0000-4000-8000-000000000003','CONFIRMED_COMMITTED');
SELECT pg_temp.expect_outcome('A-02 pharmacist V2','b3000000-0000-4000-8000-000000000003','ba000000-0000-4000-8000-000000000004','CONFIRMED_COMMITTED');

-- A-03: cashier ownership.
SELECT pg_temp.expect_outcome('A-03 cashier A own sale','b3000000-0000-4000-8000-000000000004','ba000000-0000-4000-8000-000000000001','CONFIRMED_COMMITTED');
SELECT pg_temp.expect_forbidden('A-03 cashier A other sale','b3000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000002');

-- A-04: return author and original-sale cashier are allowed; unrelated cashier denied.
SELECT pg_temp.expect_outcome('A-04 original cashier V1','b3000000-0000-4000-8000-000000000004','ba000000-0000-4000-8000-000000000003','CONFIRMED_COMMITTED');
SELECT pg_temp.expect_outcome('A-04 return author V1','b3000000-0000-4000-8000-000000000005','ba000000-0000-4000-8000-000000000003','CONFIRMED_COMMITTED');
SELECT pg_temp.expect_outcome('A-04 original cashier V2','b3000000-0000-4000-8000-000000000004','ba000000-0000-4000-8000-000000000004','CONFIRMED_COMMITTED');
SELECT pg_temp.expect_outcome('A-04 return author V2','b3000000-0000-4000-8000-000000000005','ba000000-0000-4000-8000-000000000004','CONFIRMED_COMMITTED');
SELECT pg_temp.expect_forbidden('A-04 unrelated cashier V1','b3000000-0000-4000-8000-000000000008','b1000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000003');
SELECT pg_temp.expect_forbidden('A-04 unrelated cashier V2','b3000000-0000-4000-8000-000000000008','b1000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000004');

-- A-05/A-06: incomplete and legacy evidence never becomes absence/commit.
SELECT pg_temp.expect_outcome('A-05 journal-only actor','b3000000-0000-4000-8000-000000000004','ba000000-0000-4000-8000-000000000005','CONFLICT');
SELECT pg_temp.expect_outcome('A-05 journal-only owner','b3000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000005','CONFLICT');
SELECT pg_temp.expect_outcome('A-06 legacy actor','b3000000-0000-4000-8000-000000000004','ba000000-0000-4000-8000-000000000006','UNKNOWN');
SELECT pg_temp.expect_outcome('A-06 legacy owner','b3000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000006','UNKNOWN');
SELECT pg_temp.expect_forbidden('A-06 legacy unrelated','b3000000-0000-4000-8000-000000000008','b1000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000006');

-- A-07: only a genuinely unused operation is authorized absence, with no evidence fields.
DO $$ DECLARE r record; BEGIN
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000004',true);
  IF EXISTS (SELECT 1 FROM public.sync_journal WHERE pharmacy_id='b1000000-0000-4000-8000-000000000001' AND client_op_id='ba000000-0000-4000-8000-000000000099')
     OR EXISTS (SELECT 1 FROM public.sales WHERE pharmacy_id='b1000000-0000-4000-8000-000000000001' AND client_op_id='ba000000-0000-4000-8000-000000000099')
     OR EXISTS (SELECT 1 FROM public.sale_returns WHERE pharmacy_id='b1000000-0000-4000-8000-000000000001' AND client_op_id='ba000000-0000-4000-8000-000000000099') THEN
    RAISE EXCEPTION 'A-07 fixture is not absent';
  END IF;
  SELECT * INTO STRICT r FROM public.rpc_get_client_op_status_v2('b1000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000099');
  IF r.outcome <> 'CONFIRMED_ABSENT' OR r.operation_kind <> 'UNKNOWN' OR r.payload_hash IS NOT NULL
     OR r.sale_id IS NOT NULL OR r.checkout_intent_id IS NOT NULL OR r.response_payload IS NOT NULL
     OR r.processed_at IS NOT NULL OR r.record_id IS NOT NULL OR r.return_id IS NOT NULL THEN
    RAISE EXCEPTION 'A-07 absence response disclosed evidence: %',row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS A-07 authorized structural absence';
END $$;

ROLLBACK;
\echo 'GATE_A_ASSERTIONS_PASS'
