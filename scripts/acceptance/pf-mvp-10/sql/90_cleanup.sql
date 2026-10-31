\set ON_ERROR_STOP on
SELECT set_config('pf.acceptance.authorization_id',:'pf_authorization_id',false),set_config('pf.acceptance.target_marker',:'pf_target_marker',false) \gset
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.pf_mvp10_acceptance_fixture_ownership)<>4 OR (SELECT count(*) FROM public.pf_mvp10_acceptance_fixture_ownership WHERE authorization_id=current_setting('pf.acceptance.authorization_id') AND target_marker=current_setting('pf.acceptance.target_marker') AND fixture_id IN('a2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001'))<>4 THEN RAISE EXCEPTION 'CLEANUP_OWNERSHIP_UNPROVEN';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='c2000000-0000-4000-8000-000000000001' AND email='pf-mvp10-concurrency@example.invalid') OR NOT EXISTS(SELECT 1 FROM public.pharmacies WHERE id='a2000000-0000-4000-8000-000000000001' AND owner_id='c2000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'CLEANUP_IDENTITY_MISMATCH';END IF;
 IF (SELECT count(*) FROM public.purchases WHERE pharmacy_id='a2000000-0000-4000-8000-000000000001')<>1 OR (SELECT count(*) FROM public.purchase_items WHERE pharmacy_id='a2000000-0000-4000-8000-000000000001')<>1 OR (SELECT count(*) FROM public.inventory_batches WHERE pharmacy_id='a2000000-0000-4000-8000-000000000001')<>1 OR (SELECT count(*) FROM public.stock_ledger WHERE pharmacy_id='a2000000-0000-4000-8000-000000000001')<>1 OR (SELECT count(*) FROM public.entitlement_committed_operations_v1 WHERE pharmacy_id='a2000000-0000-4000-8000-000000000001')<>1 THEN RAISE EXCEPTION 'CLEANUP_DEPENDENCY_MISMATCH';END IF;
END $$;
COMMIT;
SELECT 'PF_RESULT|cleanup|REFUSED|immutable-evidence-preserved';
