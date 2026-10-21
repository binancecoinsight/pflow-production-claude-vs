-- M-22: move Refund V2 item validation/deduplication outside the row-lock query.
DO $$
DECLARE
  sig regprocedure := 'public.rpc_process_sale_return_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,jsonb,bigint,character varying,text)'::regprocedure;
  def text; old_block text; new_block text;
BEGIN
  SELECT pg_get_functiondef(sig) INTO def;
  old_block := E'    PERFORM 1 FROM public.sale_items si\n    JOIN (SELECT DISTINCT sale_item_id FROM (SELECT (value->>''sale_item_id'')::UUID AS sale_item_id FROM jsonb_array_elements(p_items)) requested_ids) r\n      ON r.sale_item_id = si.id\n    WHERE si.pharmacy_id = p_pharmacy_id AND si.sale_id = p_sale_id\n    ORDER BY si.id FOR UPDATE;';
  new_block := E'    v_item_ids := ARRAY[]::UUID[];\n    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP\n        IF jsonb_typeof(v_item) <> ''object'' OR NULLIF(v_item->>''sale_item_id'', '''') IS NULL\n           OR (v_item->>''sale_item_id'') !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$''\n           OR (v_item->>''quantity'') !~ ''^[1-9][0-9]*$'' THEN\n            RAISE EXCEPTION ''INVALID_REFUND_ITEM'' USING ERRCODE = ''22023'';\n        END IF;\n        v_item_ids := array_append(v_item_ids, (v_item->>''sale_item_id'')::UUID);\n    END LOOP;\n    IF cardinality(v_item_ids) <> (SELECT count(DISTINCT item_id) FROM unnest(v_item_ids) AS item_id) THEN\n        RAISE EXCEPTION ''DUPLICATE_SALE_ITEM'' USING ERRCODE = ''22023'';\n    END IF;\n    SELECT array_agg(item_id ORDER BY item_id) INTO v_item_ids FROM unnest(v_item_ids) AS item_id;\n    PERFORM si.id FROM public.sale_items si\n    WHERE si.id = ANY(v_item_ids) AND si.pharmacy_id = p_pharmacy_id AND si.sale_id = p_sale_id\n    ORDER BY si.id FOR UPDATE OF si;\n    GET DIAGNOSTICS v_locked_item_count = ROW_COUNT;\n    IF v_locked_item_count <> cardinality(v_item_ids) THEN\n        RAISE EXCEPTION ''ITEM_NOT_IN_SALE'' USING ERRCODE = ''23503'';\n    END IF;';
  IF position(old_block IN def)=0 THEN RAISE EXCEPTION 'M-22 precondition failed: M-21 lock block absent'; END IF;
  def := replace(def, E'    v_item JSONB;\n', E'    v_item JSONB;\n    v_item_ids UUID[];\n    v_locked_item_count INT;\n');
  def := replace(def, old_block, new_block);
  EXECUTE def;
END $$;
ALTER FUNCTION public.rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) TO service_role;
