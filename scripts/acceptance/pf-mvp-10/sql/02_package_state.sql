\set ON_ERROR_STOP on
DO $$ BEGIN
 IF to_regprocedure('public.resolve_effective_entitlement_v3(uuid)') IS NULL
  OR to_regprocedure('public.rpc_process_sale_return(uuid,uuid,uuid,jsonb,numeric,character varying,text,uuid)') IS NULL
  OR to_regprocedure('public.rpc_process_sale_return(uuid,uuid,uuid,jsonb,numeric,character varying,text,uuid,text)') IS NULL
  OR to_regprocedure('public.rpc_process_sale_return_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,jsonb,bigint,character varying,text)') IS NULL
  OR to_regprocedure('public.entitlement_intake_fingerprint_v2(uuid,jsonb,uuid,text)') IS NULL THEN
   RAISE EXCEPTION 'PACKAGE_STATE_UNVERIFIED: reviewed chain through 000039 is absent';
 END IF;
END $$;
SELECT 'PF_PASS|package-state|000039';
