-- PharmacyFlow Refund V2 M-21: PostgreSQL-valid requested-item locking.
-- M-20 remains sealed.  This preserves its complete function contract and only
-- moves DISTINCT into a nested relation, outside the SELECT ... FOR UPDATE.
DO $$
DECLARE
    v_signature REGPROCEDURE := 'public.rpc_process_sale_return_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,jsonb,bigint,character varying,text)'::REGPROCEDURE;
    v_definition TEXT;
    v_old TEXT := 'JOIN (SELECT DISTINCT (value->>''sale_item_id'')::UUID AS sale_item_id FROM jsonb_array_elements(p_items)) r';
    v_new TEXT := 'JOIN (SELECT DISTINCT sale_item_id FROM (SELECT (value->>''sale_item_id'')::UUID AS sale_item_id FROM jsonb_array_elements(p_items)) requested_ids) r';
BEGIN
    SELECT pg_get_functiondef(v_signature) INTO v_definition;
    IF position(v_old IN v_definition) = 0 THEN
        RAISE EXCEPTION 'M-21 precondition failed: expected M-20 locking fragment is absent';
    END IF;
    v_definition := replace(v_definition, v_old, v_new);
    -- pg_get_functiondef returns CREATE OR REPLACE FUNCTION with the existing
    -- signature, return type, SECURITY DEFINER, and fixed search_path intact.
    EXECUTE v_definition;
END;
$$;

ALTER FUNCTION public.rpc_process_sale_return_v2(UUID, UUID, UUID, UUID, UUID, UUID, TEXT, UUID, JSONB, BIGINT, VARCHAR, TEXT)
OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_process_sale_return_v2(UUID, UUID, UUID, UUID, UUID, UUID, TEXT, UUID, JSONB, BIGINT, VARCHAR, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_process_sale_return_v2(UUID, UUID, UUID, UUID, UUID, UUID, TEXT, UUID, JSONB, BIGINT, VARCHAR, TEXT)
TO service_role;
