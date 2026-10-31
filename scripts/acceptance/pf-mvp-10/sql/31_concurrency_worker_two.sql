\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub','c2000000-0000-4000-8000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true) \gset
SELECT 'PF_EVENT|1|worker-two|READY|backend='||pg_backend_pid();
DO $$ DECLARE caught BOOLEAN:=FALSE;BEGIN
 BEGIN PERFORM * FROM public.rpc_receive_inventory_stock('a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('product_id','d2000000-0000-4000-8000-000000000001','batch_number','CONCURRENT','expiry_date','2028-01-01','quantity',5,'cost_price',1,'selling_price',10)),NULL,'CONCURRENT',NULL,'e2000000-0000-4000-8000-000000000001');EXCEPTION WHEN unique_violation THEN caught:=TRUE;END;
 IF NOT caught THEN RAISE EXCEPTION 'EXPECTED_M13_CONCURRENT_IDEMPOTENCY_CONFLICT';END IF;
 RAISE NOTICE 'PF_EVENT|1|worker-two|TERMINAL|status=CONFLICT;sqlstate=23505';
END $$;
COMMIT;
