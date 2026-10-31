\set ON_ERROR_STOP on
DO $$ DECLARE s TEXT; role_name TEXT; BEGIN
 FOREACH s IN ARRAY ARRAY[
  'public.rpc_process_sale_return(uuid,uuid,uuid,jsonb,numeric,character varying,text,uuid)',
  'public.rpc_process_sale_return(uuid,uuid,uuid,jsonb,numeric,character varying,text,uuid,text)',
  'public.rpc_process_sale_return_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,jsonb,bigint,character varying,text)',
  'public.rpc_commit_sale_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb)',
  'public.rpc_ingest_sale_stock_movement(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,text)',
  'public.rpc_receive_inventory_stock(uuid,uuid,jsonb,uuid,text,text,uuid)',
  'public.rpc_adjust_inventory_stock(uuid,uuid,uuid,uuid,character varying,integer,character varying,uuid,text)',
  'public.rpc_dispatch_stock_transfer(uuid,uuid,uuid,jsonb,uuid,text)',
  'public.rpc_receive_stock_transfer(uuid,uuid,uuid,text)',
  'public.rpc_create_staff_invitation(uuid,uuid,text,character varying)',
  'public.rpc_accept_staff_invitation(uuid,text)',
  'public.rpc_revoke_staff_invitation(uuid)',
  'public.rpc_change_member_role(uuid,uuid,character varying)',
  'public.rpc_reactivate_pharmacy_member(uuid,uuid)',
  'public.rpc_suspend_pharmacy_member(uuid,uuid)']
 LOOP IF to_regprocedure(s) IS NULL THEN RAISE EXCEPTION 'PUBLIC_SIGNATURE_MISSING:%',s; END IF; END LOOP;
 FOREACH s IN ARRAY ARRAY[
  'public.rpc_process_sale_return_m9_entitlement_base(uuid,uuid,uuid,jsonb,numeric,character varying,text,uuid)',
  'public.rpc_process_sale_return_entitlement_base(uuid,uuid,uuid,jsonb,numeric,character varying,text,uuid,text)',
  'public.rpc_process_sale_return_v2_entitlement_base(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,jsonb,bigint,character varying,text)',
  'public.rpc_commit_sale_v1_entitlement_base(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb)',
  'public.rpc_receive_inventory_stock_entitlement_base(uuid,uuid,jsonb,uuid,text,text,uuid)',
  'public.rpc_adjust_inventory_stock_entitlement_base(uuid,uuid,uuid,uuid,character varying,integer,character varying,uuid,text)',
  'public.rpc_dispatch_stock_transfer_entitlement_base(uuid,uuid,uuid,jsonb,uuid,text)',
  'public.rpc_receive_stock_transfer_entitlement_base(uuid,uuid,uuid,text)',
  'public.rpc_create_staff_invitation_entitlement_base(uuid,uuid,text,character varying)',
  'public.rpc_accept_staff_invitation_entitlement_base(uuid,text)',
  'public.rpc_revoke_staff_invitation_entitlement_base(uuid)',
  'public.rpc_change_member_role_entitlement_base(uuid,uuid,character varying)',
  'public.rpc_reactivate_pharmacy_member_entitlement_base(uuid,uuid)',
  'public.rpc_suspend_pharmacy_member_entitlement_base(uuid,uuid)',
  'public.assert_entitlement_operation_v5(uuid,uuid,uuid,uuid,text,uuid,text,boolean,boolean)',
  'public.record_committed_entitlement_operation_v4(uuid,uuid,text,uuid,uuid,uuid,text,uuid,timestamp with time zone)',
  'public.resolve_effective_entitlement_v3(uuid)',
  'public.entitlement_intake_fingerprint_v2(uuid,jsonb,uuid,text)']
 LOOP IF to_regprocedure(s) IS NULL THEN RAISE EXCEPTION 'PRIVATE_SIGNATURE_MISSING:%',s;END IF;FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP IF has_function_privilege(role_name,s,'EXECUTE') THEN RAISE EXCEPTION 'PRIVATE_HELPER_EXECUTABLE:%:%',role_name,s;END IF;END LOOP;END LOOP;
 IF has_function_privilege('anon','public.rpc_commit_sale_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.rpc_commit_sale_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'PRIVATE_GATEWAY_GRANT_DRIFT'; END IF;
 IF NOT has_function_privilege('service_role','public.rpc_commit_sale_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'SERVICE_GATEWAY_GRANT_MISSING'; END IF;
 IF NOT has_function_privilege('authenticated','public.rpc_process_sale_return(uuid,uuid,uuid,jsonb,numeric,character varying,text,uuid)','EXECUTE') OR NOT has_function_privilege('authenticated','public.rpc_process_sale_return(uuid,uuid,uuid,jsonb,numeric,character varying,text,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'LEGACY_REFUND_GRANT_MISSING'; END IF;
 FOREACH s IN ARRAY ARRAY['public.rpc_receive_inventory_stock(uuid,uuid,jsonb,uuid,text,text,uuid)','public.rpc_adjust_inventory_stock(uuid,uuid,uuid,uuid,character varying,integer,character varying,uuid,text)','public.rpc_dispatch_stock_transfer(uuid,uuid,uuid,jsonb,uuid,text)','public.rpc_receive_stock_transfer(uuid,uuid,uuid,text)'] LOOP IF NOT has_function_privilege('authenticated',s,'EXECUTE') OR has_function_privilege('anon',s,'EXECUTE') THEN RAISE EXCEPTION 'INVENTORY_GRANT_DRIFT:%',s;END IF;END LOOP;
 FOREACH s IN ARRAY ARRAY['public.rpc_create_staff_invitation(uuid,uuid,text,character varying)','public.rpc_accept_staff_invitation(uuid,text)','public.rpc_revoke_staff_invitation(uuid)','public.rpc_change_member_role(uuid,uuid,character varying)','public.rpc_reactivate_pharmacy_member(uuid,uuid)','public.rpc_suspend_pharmacy_member(uuid,uuid)'] LOOP IF NOT has_function_privilege('authenticated',s,'EXECUTE') OR has_function_privilege('anon',s,'EXECUTE') THEN RAISE EXCEPTION 'STAFF_GRANT_DRIFT:%',s;END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE '%entitlement_base' AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('service_role',p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'PRIVATE_BASE_EXECUTABLE'; END IF;
 IF pg_get_functiondef('public.rpc_get_effective_entitlement_v2(uuid)'::regprocedure) NOT LIKE '%resolve_effective_entitlement_v3%' OR pg_get_functiondef('public.entitlement_mutations_allowed_for_operator_v1(uuid)'::regprocedure) NOT LIKE '%resolve_effective_entitlement_v3%' THEN RAISE EXCEPTION 'READ_GUARD_RESOLVER_DIVERGENCE'; END IF;
END $$;
SELECT 'PF_PASS|acl-overloads-and-private-bases';
