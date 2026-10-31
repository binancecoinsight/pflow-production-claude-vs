\set ON_ERROR_STOP on
DO $$ BEGIN
 IF to_regclass('public.pharmacies') IS NOT NULL OR to_regprocedure('public.resolve_effective_entitlement_v3(uuid)') IS NOT NULL
   OR to_regclass('public.entitlement_committed_operations_v1') IS NOT NULL THEN
  RAISE EXCEPTION 'TARGET_NOT_EMPTY: migration application requires a disposable empty Supabase project';
 END IF;
END $$;
SELECT 'PF_PASS|empty-target';
