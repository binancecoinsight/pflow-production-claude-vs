\set ON_ERROR_STOP on
SELECT set_config('pf.acceptance.worker_one_pid',:'pf_worker_one_pid',false),set_config('pf.acceptance.worker_two_pid',:'pf_worker_two_pid',false) \gset
DO $$ DECLARE purchases BIGINT;items BIGINT;ledger BIGINT;evidence BIGINT;BEGIN
 IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid IN(current_setting('pf.acceptance.worker_one_pid')::INT,current_setting('pf.acceptance.worker_two_pid')::INT)) THEN RAISE EXCEPTION 'ABORTED_WORKER_STILL_PRESENT';END IF;
 SELECT count(*) INTO purchases FROM public.purchases WHERE pharmacy_id='a2000000-0000-4000-8000-000000000001';SELECT count(*) INTO items FROM public.purchase_items WHERE pharmacy_id='a2000000-0000-4000-8000-000000000001';SELECT count(*) INTO ledger FROM public.stock_ledger WHERE pharmacy_id='a2000000-0000-4000-8000-000000000001';SELECT count(*) INTO evidence FROM public.entitlement_committed_operations_v1 WHERE pharmacy_id='a2000000-0000-4000-8000-000000000001';
 IF NOT ((purchases=0 AND items=0 AND ledger=0 AND evidence=0) OR (purchases=1 AND items=1 AND ledger=1 AND evidence=1)) THEN RAISE EXCEPTION 'ABORT_ROLLBACK_STATE_INCOHERENT';END IF;
END $$;
SELECT 'PF_PASS|concurrency-abort-workers-stopped-state-coherent';
