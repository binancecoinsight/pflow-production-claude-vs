\ir 00_guard.sql
BEGIN;
SELECT set_config('pf_i3a.authorization_id', :'pf_execution_authorization_id', true) AS ignored \gset
SELECT set_config('pf_i3a.fixture_digest', :'pf_fixture_digest', true) AS ignored \gset

DO $objects$
DECLARE runs regclass:=to_regclass('public.pf_i3a_fixture_runs');
 ownership regclass:=to_regclass('public.pf_i3a_fixture_objects');
 concurrency regclass:=to_regclass('public.pf_i3a_concurrency_evidence');
BEGIN
 IF runs IS NOT NULL AND obj_description(runs) IS DISTINCT FROM 'PharmacyFlow ACC-01 fixture-run registry v2' THEN
   RAISE EXCEPTION 'unknown existing fixture-run object; refusing adoption'; END IF;
 IF ownership IS NOT NULL AND obj_description(ownership) IS DISTINCT FROM 'PharmacyFlow ACC-01 exact fixture ownership v2' THEN
   RAISE EXCEPTION 'unknown existing fixture-ownership object; refusing adoption'; END IF;
 IF concurrency IS NOT NULL AND obj_description(concurrency) IS DISTINCT FROM 'PharmacyFlow ACC-01 coordinator-observed concurrency evidence v2' THEN
   RAISE EXCEPTION 'unknown existing concurrency object; refusing adoption'; END IF;
END $objects$;

CREATE TABLE IF NOT EXISTS public.pf_i3a_fixture_runs(
 run_id text PRIMARY KEY,target_id text NOT NULL,authorization_id text NOT NULL,fixture_digest text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK(fixture_digest~'^[0-9a-f]{64}$'));
COMMENT ON TABLE public.pf_i3a_fixture_runs IS 'PharmacyFlow ACC-01 fixture-run registry v2';
CREATE TABLE IF NOT EXISTS public.pf_i3a_fixture_objects(
 object_kind text NOT NULL,object_id text NOT NULL,run_id text NOT NULL REFERENCES public.pf_i3a_fixture_runs(run_id) ON DELETE RESTRICT,
 attributes_digest text NOT NULL CHECK(attributes_digest~'^[0-9a-f]{64}$'),PRIMARY KEY(object_kind,object_id));
COMMENT ON TABLE public.pf_i3a_fixture_objects IS 'PharmacyFlow ACC-01 exact fixture ownership v2';
CREATE TABLE IF NOT EXISTS public.pf_i3a_concurrency_evidence(
 run_id text NOT NULL,case_id text NOT NULL,session_name text NOT NULL CHECK(session_name IN('A','B')),
 authorization_id text NOT NULL,barrier_nonce uuid NOT NULL,backend_pid integer NOT NULL,application_name text NOT NULL,
 lock_classid oid NOT NULL,lock_objid oid NOT NULL,readiness_committed boolean NOT NULL DEFAULT false,released boolean NOT NULL DEFAULT false,
 entered_critical_at timestamptz,left_critical_at timestamptz,outcome text,authoritative_effect_count integer,
 coordinator_observed_at timestamptz,observed_blocker_pid integer,observed_waiter_pid integer,cancelled boolean NOT NULL DEFAULT false,
 rollback_verified boolean NOT NULL DEFAULT false,PRIMARY KEY(run_id,case_id,session_name));
COMMENT ON TABLE public.pf_i3a_concurrency_evidence IS 'PharmacyFlow ACC-01 coordinator-observed concurrency evidence v2';
REVOKE ALL ON public.pf_i3a_fixture_runs,public.pf_i3a_fixture_objects,public.pf_i3a_concurrency_evidence
 FROM PUBLIC,anon,authenticated,service_role,pharmacyflow_owner_gateway_executor,pharmacyflow_platform_admission_operator;

DO $shape$
BEGIN
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='pf_i3a_fixture_runs')<>5
  OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='pf_i3a_fixture_objects')<>4
  OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='pf_i3a_concurrency_evidence')<>20
  OR (SELECT string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='pf_i3a_fixture_runs')<>'run_id,target_id,authorization_id,fixture_digest,created_at'
  OR (SELECT string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='pf_i3a_fixture_objects')<>'object_kind,object_id,run_id,attributes_digest'
  OR (SELECT string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='pf_i3a_concurrency_evidence')<>'run_id,case_id,session_name,authorization_id,barrier_nonce,backend_pid,application_name,lock_classid,lock_objid,readiness_committed,released,entered_critical_at,left_critical_at,outcome,authoritative_effect_count,coordinator_observed_at,observed_blocker_pid,observed_waiter_pid,cancelled,rollback_verified'
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.pf_i3a_fixture_runs'::regclass AND contype='p')
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.pf_i3a_fixture_objects'::regclass AND contype='p')
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.pf_i3a_concurrency_evidence'::regclass AND contype='p') THEN
   RAISE EXCEPTION 'existing harness object shape mismatch; refusing adoption'; END IF;
END $shape$;

INSERT INTO public.pf_i3a_fixture_runs(run_id,target_id,authorization_id,fixture_digest)
VALUES('I3A-20261026-001','pharmacyflow-i3a-acceptance-20261026',current_setting('pf_i3a.authorization_id'),current_setting('pf_i3a.fixture_digest'))
ON CONFLICT(run_id) DO UPDATE SET run_id=EXCLUDED.run_id
WHERE pf_i3a_fixture_runs.target_id=EXCLUDED.target_id AND pf_i3a_fixture_runs.authorization_id=EXCLUDED.authorization_id
 AND pf_i3a_fixture_runs.fixture_digest=EXCLUDED.fixture_digest;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.pf_i3a_fixture_runs WHERE run_id='I3A-20261026-001'
   AND target_id='pharmacyflow-i3a-acceptance-20261026' AND authorization_id=current_setting('pf_i3a.authorization_id')
   AND fixture_digest=current_setting('pf_i3a.fixture_digest')) THEN RAISE EXCEPTION 'fixture run ownership mismatch'; END IF;
END $$;

DO $fixtures$
DECLARE k text; attrs text; existing record;
BEGIN
 FOREACH k IN ARRAY ARRAY['i3a-gateway-0001','i3a-gateway-0002'] LOOP
   attrs:=encode(digest(convert_to(CASE WHEN k='i3a-gateway-0001' THEN 'active=true|version=1|ELIGIBILITY_RESERVE,IDENTITY_ISSUE,IDENTITY_RECOVER' ELSE 'active=true|version=1|ELIGIBILITY_RESERVE' END,'UTF8'),'sha256'),'hex');
   SELECT * INTO existing FROM public.owner_gateway_authorities WHERE principal_id=k FOR UPDATE;
   IF FOUND AND NOT EXISTS(SELECT 1 FROM public.pf_i3a_fixture_objects WHERE object_kind='gateway-authority' AND object_id=k AND run_id='I3A-20261026-001' AND attributes_digest=attrs) THEN RAISE EXCEPTION 'unknown existing gateway identity %; refusing adoption',k; END IF;
   IF FOUND AND NOT (existing.active AND existing.credential_version=1 AND existing.capabilities=(CASE WHEN k='i3a-gateway-0001' THEN ARRAY['ELIGIBILITY_RESERVE','IDENTITY_ISSUE','IDENTITY_RECOVER'] ELSE ARRAY['ELIGIBILITY_RESERVE'] END)) THEN RAISE EXCEPTION 'gateway fixture attributes mismatch %',k; END IF;
   IF NOT FOUND THEN
    INSERT INTO public.owner_gateway_authorities VALUES(k,true,1,CASE WHEN k='i3a-gateway-0001' THEN ARRAY['ELIGIBILITY_RESERVE','IDENTITY_ISSUE','IDENTITY_RECOVER'] ELSE ARRAY['ELIGIBILITY_RESERVE'] END,timezone('utc',now()));
    INSERT INTO public.pf_i3a_fixture_objects VALUES('gateway-authority',k,'I3A-20261026-001',attrs);
   END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['i3a-operator-0001','i3a-operator-none-0001'] LOOP
   attrs:=encode(digest(convert_to(CASE WHEN k='i3a-operator-0001' THEN 'active=true|version=1|ADMISSION_APPROVE,ADMISSION_REPLACE,ADMISSION_REVOKE,ELIGIBILITY_REVOKE' ELSE 'active=true|version=1|' END,'UTF8'),'sha256'),'hex');
   SELECT * INTO existing FROM public.owner_operator_authorities WHERE principal_id=k FOR UPDATE;
   IF FOUND AND NOT EXISTS(SELECT 1 FROM public.pf_i3a_fixture_objects WHERE object_kind='operator-authority' AND object_id=k AND run_id='I3A-20261026-001' AND attributes_digest=attrs) THEN RAISE EXCEPTION 'unknown existing operator identity %; refusing adoption',k; END IF;
   IF FOUND AND NOT (existing.active AND existing.credential_version=1 AND existing.permissions=(CASE WHEN k='i3a-operator-0001' THEN ARRAY['ADMISSION_APPROVE','ADMISSION_REPLACE','ADMISSION_REVOKE','ELIGIBILITY_REVOKE'] ELSE ARRAY[]::text[] END)) THEN RAISE EXCEPTION 'operator fixture attributes mismatch %',k; END IF;
   IF NOT FOUND THEN
    INSERT INTO public.owner_operator_authorities VALUES(k,true,1,CASE WHEN k='i3a-operator-0001' THEN ARRAY['ADMISSION_APPROVE','ADMISSION_REPLACE','ADMISSION_REVOKE','ELIGIBILITY_REVOKE'] ELSE ARRAY[]::text[] END,timezone('utc',now()));
    INSERT INTO public.pf_i3a_fixture_objects VALUES('operator-authority',k,'I3A-20261026-001',attrs);
   END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.owner_gateway_authorities WHERE principal_id LIKE 'i3a-%' AND principal_id NOT IN('i3a-gateway-0001','i3a-gateway-0002'))
 OR EXISTS(SELECT 1 FROM public.owner_operator_authorities WHERE principal_id LIKE 'i3a-%' AND principal_id NOT IN('i3a-operator-0001','i3a-operator-none-0001')) THEN RAISE EXCEPTION 'unknown I3A-like identity exists'; END IF;
END $fixtures$;
COMMIT;
SELECT 'PF_I3A_RESULT=' || json_build_object('schema','pharmacyflow-i3a-process-v1','kind','10_fixture','payload',json_build_object('status','FIXTURE_COMMITTED'))::text;
