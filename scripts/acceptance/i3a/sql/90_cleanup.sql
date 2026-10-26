\ir 00_guard.sql
BEGIN;
SELECT set_config('pf_i3a.authorization_id', :'pf_execution_authorization_id', true) AS ignored \gset
SELECT set_config('pf_i3a.fixture_digest', :'pf_fixture_digest', true) AS ignored \gset
DO $ownership$
DECLARE gateway_attrs text;other_gateway_attrs text;operator_attrs text;none_operator_attrs text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.pf_i3a_fixture_runs WHERE run_id='I3A-20261026-001'
   AND target_id='pharmacyflow-i3a-acceptance-20261026' AND authorization_id=current_setting('pf_i3a.authorization_id')
   AND fixture_digest=current_setting('pf_i3a.fixture_digest') FOR UPDATE) THEN RAISE EXCEPTION 'fixture ownership mismatch; cleanup refused'; END IF;
 IF (SELECT count(*) FROM public.pf_i3a_fixture_objects WHERE run_id='I3A-20261026-001')<>4 THEN RAISE EXCEPTION 'exact four-object ownership proof required'; END IF;
 gateway_attrs:=encode(digest(convert_to('active=true|version=1|ELIGIBILITY_RESERVE,IDENTITY_ISSUE,IDENTITY_RECOVER','UTF8'),'sha256'),'hex');
 other_gateway_attrs:=encode(digest(convert_to('active=true|version=1|ELIGIBILITY_RESERVE','UTF8'),'sha256'),'hex');
 operator_attrs:=encode(digest(convert_to('active=true|version=1|ADMISSION_APPROVE,ADMISSION_REPLACE,ADMISSION_REVOKE,ELIGIBILITY_REVOKE','UTF8'),'sha256'),'hex');
 none_operator_attrs:=encode(digest(convert_to('active=true|version=1|','UTF8'),'sha256'),'hex');
 IF NOT EXISTS(SELECT 1 FROM public.pf_i3a_fixture_objects o JOIN public.owner_gateway_authorities a ON a.principal_id=o.object_id WHERE o.run_id='I3A-20261026-001' AND o.object_kind='gateway-authority' AND o.object_id='i3a-gateway-0001' AND o.attributes_digest=gateway_attrs AND a.active AND a.credential_version=1 AND a.capabilities=ARRAY['ELIGIBILITY_RESERVE','IDENTITY_ISSUE','IDENTITY_RECOVER'])
 OR NOT EXISTS(SELECT 1 FROM public.pf_i3a_fixture_objects o JOIN public.owner_gateway_authorities a ON a.principal_id=o.object_id WHERE o.run_id='I3A-20261026-001' AND o.object_kind='gateway-authority' AND o.object_id='i3a-gateway-0002' AND o.attributes_digest=other_gateway_attrs AND a.active AND a.credential_version=1 AND a.capabilities=ARRAY['ELIGIBILITY_RESERVE'])
 OR NOT EXISTS(SELECT 1 FROM public.pf_i3a_fixture_objects o JOIN public.owner_operator_authorities a ON a.principal_id=o.object_id WHERE o.run_id='I3A-20261026-001' AND o.object_kind='operator-authority' AND o.object_id='i3a-operator-0001' AND o.attributes_digest=operator_attrs AND a.active AND a.credential_version=1 AND a.permissions=ARRAY['ADMISSION_APPROVE','ADMISSION_REPLACE','ADMISSION_REVOKE','ELIGIBILITY_REVOKE'])
 OR NOT EXISTS(SELECT 1 FROM public.pf_i3a_fixture_objects o JOIN public.owner_operator_authorities a ON a.principal_id=o.object_id WHERE o.run_id='I3A-20261026-001' AND o.object_kind='operator-authority' AND o.object_id='i3a-operator-none-0001' AND o.attributes_digest=none_operator_attrs AND a.active AND a.credential_version=1 AND a.permissions=ARRAY[]::text[]) THEN RAISE EXCEPTION 'fixture attributes or ownership changed; cleanup refused'; END IF;
 IF EXISTS(SELECT 1 FROM public.owner_identity_issuance_attempts WHERE principal_id IN('i3a-gateway-0001','i3a-gateway-0002'))
 OR EXISTS(SELECT 1 FROM public.owner_security_operation_claims WHERE principal_id IN('i3a-gateway-0001','i3a-gateway-0002','i3a-operator-0001','i3a-operator-none-0001'))
 OR EXISTS(SELECT 1 FROM public.owner_security_operations WHERE principal_id IN('i3a-gateway-0001','i3a-gateway-0002','i3a-operator-0001','i3a-operator-none-0001'))
 OR EXISTS(SELECT 1 FROM public.owner_admission_decisions WHERE operator_id IN('i3a-operator-0001','i3a-operator-none-0001'))
 OR EXISTS(SELECT 1 FROM public.owner_eligibility_revocation_decisions WHERE operator_id IN('i3a-operator-0001','i3a-operator-none-0001'))
 OR EXISTS(SELECT 1 FROM public.owner_eligibility_requests WHERE request_id::text LIKE '30000000-0000-4000-8000-%')
 OR EXISTS(SELECT 1 FROM public.pf_i3a_concurrency_evidence WHERE run_id='I3A-20261026-001' AND (outcome IS NULL OR NOT rollback_verified))
 THEN RAISE EXCEPTION 'immutable evidence, pending attempt, claim, completed/business dependency or unresolved work exists; cleanup refused'; END IF;
END $ownership$;
DELETE FROM public.owner_gateway_authorities a USING public.pf_i3a_fixture_objects o
 WHERE o.run_id='I3A-20261026-001' AND o.object_kind='gateway-authority' AND o.object_id=a.principal_id;
DELETE FROM public.owner_operator_authorities a USING public.pf_i3a_fixture_objects o
 WHERE o.run_id='I3A-20261026-001' AND o.object_kind='operator-authority' AND o.object_id=a.principal_id;
DELETE FROM public.pf_i3a_concurrency_evidence WHERE run_id='I3A-20261026-001' AND rollback_verified;
DELETE FROM public.pf_i3a_fixture_objects WHERE run_id='I3A-20261026-001';
DELETE FROM public.pf_i3a_fixture_runs WHERE run_id='I3A-20261026-001';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.pf_i3a_fixture_objects WHERE run_id='I3A-20261026-001')
 OR EXISTS(SELECT 1 FROM public.pf_i3a_fixture_runs WHERE run_id='I3A-20261026-001') THEN RAISE EXCEPTION 'fixture cleanup zero proof failed'; END IF;
END $$;
COMMIT;
SELECT 'PF_I3A_RESULT=' || json_build_object('schema','pharmacyflow-i3a-process-v1','kind','90_cleanup','payload',json_build_object('status','CLEANUP_COMMITTED'))::text;
-- Shared harness tables, other runs, immutable business/security evidence, unresolved work and the
-- environment are preserved. Environment destruction requires distinct owner authorization.
