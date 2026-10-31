\ir 00_guard.sql
BEGIN;
DO $authority$
DECLARE a record;
BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_owner_gateway_executor','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','GATEWAY','sub','i3a-gateway-0001','pharmacyflow_credential_version','1')::text,true);
 SELECT * INTO a FROM public.private_i3_require_gateway_v1('IDENTITY_ISSUE');
 IF a.principal_id<>'i3a-gateway-0001' OR a.credential_version<>1 THEN RAISE EXCEPTION 'AUTHORITY_CURRENT_VERSION_ACTION active mismatch'; END IF;
 SELECT * INTO a FROM public.private_i3_require_gateway_scope_v1('IDENTITY_ISSUE','c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf','10000000-0000-4000-8000-000000000001');
 IF a.principal_id<>'i3a-gateway-0001' THEN RAISE EXCEPTION 'SCOPE_CURRENT_APPLICANT_CONTEXT mismatch'; END IF;
 BEGIN PERFORM public.private_i3_require_gateway_scope_v1('IDENTITY_ISSUE',repeat('f',64),'10000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'missing applicant scope accepted'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;
 BEGIN PERFORM public.private_i3_require_gateway_scope_v1('IDENTITY_ISSUE','c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf','10000000-0000-4000-8000-000000000002'); RAISE EXCEPTION 'wrong context scope accepted'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;
 UPDATE public.owner_gateway_authority_scopes SET active=false WHERE principal_id='i3a-gateway-0001' AND capability='IDENTITY_ISSUE' AND applicant_key='c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf' AND pharmacy_context_id='10000000-0000-4000-8000-000000000001';
 BEGIN PERFORM public.private_i3_require_gateway_scope_v1('IDENTITY_ISSUE','c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf','10000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'inactive scope accepted'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;
 UPDATE public.owner_gateway_authority_scopes SET active=true WHERE principal_id='i3a-gateway-0001' AND capability='IDENTITY_ISSUE' AND applicant_key='c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf' AND pharmacy_context_id='10000000-0000-4000-8000-000000000001';
 UPDATE public.owner_gateway_authorities SET capabilities=ARRAY['ELIGIBILITY_RESERVE','IDENTITY_ISSUE'] WHERE principal_id='i3a-gateway-0001';
 BEGIN PERFORM public.private_i3_require_gateway_scope_v1('IDENTITY_RECOVER','c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf','10000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'wrong capability accepted'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;
 UPDATE public.owner_gateway_authorities SET capabilities=ARRAY['ELIGIBILITY_RESERVE','IDENTITY_ISSUE','IDENTITY_RECOVER'] WHERE principal_id='i3a-gateway-0001';
 BEGIN PERFORM public.private_i3_require_gateway_v1('UNKNOWN'); RAISE EXCEPTION 'unknown gateway action accepted'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_owner_gateway_executor','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','GATEWAY','sub','i3a-gateway-0001','pharmacyflow_credential_version','2')::text,true);
 BEGIN PERFORM public.private_i3_require_gateway_v1('IDENTITY_ISSUE'); RAISE EXCEPTION 'stale/rotated gateway accepted'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;
 UPDATE public.owner_gateway_authorities SET active=false WHERE principal_id='i3a-gateway-0001';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_owner_gateway_executor','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','GATEWAY','sub','i3a-gateway-0001','pharmacyflow_credential_version','1')::text,true);
 BEGIN PERFORM public.private_i3_require_gateway_v1('IDENTITY_RECOVER'); RAISE EXCEPTION 'revoked gateway recovery accepted'; EXCEPTION WHEN SQLSTATE 'PI031' THEN NULL; END;
 UPDATE public.owner_gateway_authorities SET active=true WHERE principal_id='i3a-gateway-0001';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_platform_admission_operator','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','PLATFORM_OPERATOR','sub','i3a-operator-none-0001','pharmacyflow_credential_version','1')::text,true);
 BEGIN PERFORM public.private_i3_require_operator_v1('ADMISSION_APPROVE'); RAISE EXCEPTION 'underprivileged operator accepted'; EXCEPTION WHEN SQLSTATE 'PI032' THEN NULL; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_platform_admission_operator','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','PLATFORM_OPERATOR','sub','i3a-operator-0001','pharmacyflow_credential_version','1')::text,true);
 SELECT * INTO a FROM public.private_i3_require_operator_v1('ELIGIBILITY_REVOKE');
 IF a.principal_id<>'i3a-operator-0001' THEN RAISE EXCEPTION 'operator exact action mismatch'; END IF;
END $authority$;
ROLLBACK;
SELECT 'PF_I3A_RESULT=' || json_build_object('schema','pharmacyflow-i3a-process-v1','kind','22_authority_assertions','payload',json_build_object('authority','PASS_SIMULATED_DATABASE_CLAIMS','scope_default','DENY','scope_dimensions','PASS'))::text;
-- set_config(request.jwt.claims) exercises database claim interpretation only. It is not JWT
-- signature, issuer, Auth service, session-revocation or real identity-provider acceptance.
