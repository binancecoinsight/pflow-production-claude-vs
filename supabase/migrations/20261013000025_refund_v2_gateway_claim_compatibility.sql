-- Refund V2 trusted-gateway compatibility for PostgREST JSON JWT claims.
-- Preserve the installed M-20..M-24 function body and replace only its gateway test.
DO $$
DECLARE
  sig regprocedure := 'public.rpc_process_sale_return_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,jsonb,bigint,character varying,text)'::regprocedure;
  def text;
  old_gate text := E'current_setting(''request.jwt.claim.role'', true) IS DISTINCT FROM ''service_role''';
  new_gate text := E'auth.role() IS DISTINCT FROM ''service_role''';
BEGIN
  SELECT pg_get_functiondef(sig) INTO def;
  IF position(old_gate IN def) = 0 THEN
    RAISE EXCEPTION 'M-25 precondition failed: legacy Refund V2 gateway check absent';
  END IF;
  IF position(new_gate IN def) <> 0 THEN
    RAISE EXCEPTION 'M-25 precondition failed: compatible Refund V2 gateway check already present';
  END IF;
  EXECUTE replace(def, old_gate, new_gate);
END $$;

ALTER FUNCTION public.rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) TO service_role;
