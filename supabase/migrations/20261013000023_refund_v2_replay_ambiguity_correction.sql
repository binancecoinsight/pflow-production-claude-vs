-- M-23: qualify sync_journal replay columns that collide with RPC OUT names.
DO $$
DECLARE
  sig regprocedure := 'public.rpc_process_sale_return_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,jsonb,bigint,character varying,text)'::regprocedure;
  def text;
  old_query text := E'        SELECT payload_hash, record_id, response_payload\n        INTO v_existing_hash, v_existing_return, v_existing_response\n        FROM public.sync_journal\n        WHERE pharmacy_id = p_pharmacy_id AND client_op_id = p_client_op_id\n        FOR UPDATE;';
  new_query text := E'        SELECT sj.payload_hash, sj.record_id, sj.response_payload\n        INTO v_existing_hash, v_existing_return, v_existing_response\n        FROM public.sync_journal sj\n        WHERE sj.pharmacy_id = p_pharmacy_id AND sj.client_op_id = p_client_op_id\n        FOR UPDATE OF sj;';
BEGIN
  SELECT pg_get_functiondef(sig) INTO def;
  IF position(old_query IN def)=0 THEN RAISE EXCEPTION 'M-23 precondition failed: replay query absent'; END IF;
  EXECUTE replace(def, old_query, new_query);
END $$;
ALTER FUNCTION public.rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) TO service_role;
