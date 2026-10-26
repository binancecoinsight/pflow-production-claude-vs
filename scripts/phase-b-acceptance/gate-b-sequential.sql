\set ON_ERROR_STOP on
\echo 'UNEXECUTED WORKSHEET: Gate B M-18 sequential replay/conflict/rollback'

BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
CREATE TEMP TABLE gate_b_results(case_id text, operation_status text, sale_id uuid, response_payload jsonb) ON COMMIT DROP;

-- M18-01 first commit.
INSERT INTO gate_b_results
SELECT 'M18-01',operation_status,sale_id,response_payload FROM public.rpc_commit_sale_v1(
  'b3000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',
  'ba000000-0000-4000-8000-000000000101','bb000000-0000-4000-8000-000000000101','bc000000-0000-4000-8000-000000000101',repeat('a',64),
  jsonb_build_object('id','b8000000-0000-4000-8000-000000000101','customer_id','b7000000-0000-4000-8000-000000000001','currency','NGN','subtotal',1000,'discount',0,'tax',0,'total',1000,'payment_method','CASH','amount_tendered',1200,'change_due',200,'payment_status','SETTLED','client_created_at','2026-10-23T11:00:00Z'),
  jsonb_build_array(jsonb_build_object('id','b9000000-0000-4000-8000-000000000101','product_id','b5000000-0000-4000-8000-000000000001','batch_id','b6000000-0000-4000-8000-000000000101','quantity',1,'unit_price',1000,'discount',0,'tax',0,'line_total',1000))
);

-- M18-02 exact operation/hash replay with a fresh nonce.
INSERT INTO gate_b_results
SELECT 'M18-02',operation_status,sale_id,response_payload FROM public.rpc_commit_sale_v1(
  'b3000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',
  'ba000000-0000-4000-8000-000000000101','bb000000-0000-4000-8000-000000000101','bc000000-0000-4000-8000-000000000102',repeat('a',64),
  jsonb_build_object('id','b8000000-0000-4000-8000-000000000101','customer_id','b7000000-0000-4000-8000-000000000001','currency','NGN','subtotal',1000,'discount',0,'tax',0,'total',1000,'payment_method','CASH','amount_tendered',1200,'change_due',200,'payment_status','SETTLED','client_created_at','2026-10-23T11:00:00Z'),
  jsonb_build_array(jsonb_build_object('id','b9000000-0000-4000-8000-000000000101','product_id','b5000000-0000-4000-8000-000000000001','batch_id','b6000000-0000-4000-8000-000000000101','quantity',1,'unit_price',1000,'discount',0,'tax',0,'line_total',1000))
);

-- M18-03 changed hash must be 23505 IDEMPOTENCY_VIOLATION and roll back its nonce.
DO $$ DECLARE caught boolean:=false; BEGIN
  BEGIN
    PERFORM * FROM public.rpc_commit_sale_v1(
      'b3000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',
      'ba000000-0000-4000-8000-000000000101','bb000000-0000-4000-8000-000000000101','bc000000-0000-4000-8000-000000000103',repeat('b',64),
      jsonb_build_object('id','b8000000-0000-4000-8000-000000000101','currency','NGN','subtotal',1000,'discount',0,'tax',0,'total',1000,'payment_method','CASH','amount_tendered',1200,'change_due',200,'payment_status','SETTLED','client_created_at','2026-10-23T11:00:00Z'),
      jsonb_build_array(jsonb_build_object('id','b9000000-0000-4000-8000-000000000101','product_id','b5000000-0000-4000-8000-000000000001','batch_id','b6000000-0000-4000-8000-000000000101','quantity',1,'unit_price',1000,'discount',0,'tax',0,'line_total',1000))
    );
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE '%IDEMPOTENCY_VIOLATION%' THEN RAISE; END IF; caught:=true;
  END;
  IF NOT caught THEN RAISE EXCEPTION 'M18-03 expected idempotency conflict'; END IF;
END $$;

-- M18-04 different operation, same checkout: capture the real constraint name.
DO $$ DECLARE caught boolean:=false; constraint_seen text; BEGIN
  BEGIN
    PERFORM * FROM public.rpc_commit_sale_v1(
      'b3000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',
      'ba000000-0000-4000-8000-000000000102','bb000000-0000-4000-8000-000000000101','bc000000-0000-4000-8000-000000000104',repeat('b',64),
      jsonb_build_object('id','b8000000-0000-4000-8000-000000000102','currency','NGN','subtotal',1000,'discount',0,'tax',0,'total',1000,'payment_method','CASH','amount_tendered',1000,'change_due',0,'payment_status','SETTLED','client_created_at','2026-10-23T11:01:00Z'),
      jsonb_build_array(jsonb_build_object('id','b9000000-0000-4000-8000-000000000102','product_id','b5000000-0000-4000-8000-000000000001','batch_id','b6000000-0000-4000-8000-000000000101','quantity',1,'unit_price',1000,'discount',0,'tax',0,'line_total',1000))
    );
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS constraint_seen = CONSTRAINT_NAME;
    IF constraint_seen <> 'uq_sales_pharmacy_checkout_intent' THEN RAISE EXCEPTION 'M18-04 wrong constraint %',constraint_seen; END IF;
    caught:=true;
  END;
  IF NOT caught THEN RAISE EXCEPTION 'M18-04 expected checkout conflict'; END IF;
END $$;

-- M18-06 totals fail after nonce/journal reservation; the subtransaction must leave neither.
DO $$ DECLARE caught boolean:=false; BEGIN
  BEGIN
    PERFORM * FROM public.rpc_commit_sale_v1(
      'b3000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',
      'ba000000-0000-4000-8000-000000000103','bb000000-0000-4000-8000-000000000103','bc000000-0000-4000-8000-000000000105',repeat('c',64),
      jsonb_build_object('id','b8000000-0000-4000-8000-000000000103','currency','NGN','subtotal',1000,'discount',0,'tax',0,'total',999,'payment_method','CASH','amount_tendered',1000,'change_due',1,'payment_status','SETTLED','client_created_at','2026-10-23T11:02:00Z'),
      jsonb_build_array(jsonb_build_object('id','b9000000-0000-4000-8000-000000000103','product_id','b5000000-0000-4000-8000-000000000001','batch_id','b6000000-0000-4000-8000-000000000101','quantity',1,'unit_price',1000,'discount',0,'tax',0,'line_total',1000))
    );
  EXCEPTION WHEN check_violation THEN caught:=true;
  END;
  IF NOT caught THEN RAISE EXCEPTION 'M18-06 expected total validation failure'; END IF;
END $$;

DO $$ BEGIN
  IF (SELECT operation_status FROM gate_b_results WHERE case_id='M18-01') <> 'COMMITTED' THEN RAISE EXCEPTION 'M18-01 did not return COMMITTED'; END IF;
  IF (SELECT operation_status FROM gate_b_results WHERE case_id='M18-02') <> 'ALREADY_COMMITTED' THEN RAISE EXCEPTION 'M18-02 did not return ALREADY_COMMITTED'; END IF;
  IF (SELECT response_payload FROM gate_b_results WHERE case_id='M18-02') IS DISTINCT FROM (SELECT response_payload FROM gate_b_results WHERE case_id='M18-01') THEN RAISE EXCEPTION 'M18-02 did not return original response payload'; END IF;
  IF (SELECT count(*) FROM public.sales WHERE pharmacy_id='b1000000-0000-4000-8000-000000000001' AND checkout_intent_id='bb000000-0000-4000-8000-000000000101') <> 1 THEN RAISE EXCEPTION 'M18 sequential sale count mismatch'; END IF;
  IF (SELECT count(*) FROM public.sale_items WHERE pharmacy_id='b1000000-0000-4000-8000-000000000001' AND sale_id='b8000000-0000-4000-8000-000000000101') <> 1 THEN RAISE EXCEPTION 'M18 sequential item count mismatch'; END IF;
  IF (SELECT count(*) FROM public.stock_ledger WHERE pharmacy_id='b1000000-0000-4000-8000-000000000001' AND reference_id='b8000000-0000-4000-8000-000000000101') <> 1 THEN RAISE EXCEPTION 'M18 sequential ledger count mismatch'; END IF;
  IF (SELECT quantity FROM public.inventory_batches WHERE id='b6000000-0000-4000-8000-000000000101') <> 19 THEN RAISE EXCEPTION 'M18 sequential stock mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM public.sync_nonces WHERE nonce IN ('bc000000-0000-4000-8000-000000000103','bc000000-0000-4000-8000-000000000104','bc000000-0000-4000-8000-000000000105')) THEN RAISE EXCEPTION 'M18 losing nonce persisted'; END IF;
  IF EXISTS (SELECT 1 FROM public.sync_journal WHERE pharmacy_id='b1000000-0000-4000-8000-000000000001' AND client_op_id IN ('ba000000-0000-4000-8000-000000000102','ba000000-0000-4000-8000-000000000103')) THEN RAISE EXCEPTION 'M18 losing journal persisted'; END IF;
  RAISE NOTICE 'PASS M18-01/02/03/04/06 sequential invariants';
END $$;

TABLE gate_b_results;

COMMIT;
\echo 'GATE_B_SEQUENTIAL_PASS'
