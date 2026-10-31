\set ON_ERROR_STOP on
CREATE TABLE IF NOT EXISTS public.pf_mvp10_acceptance_fixture_ownership(
 authorization_id TEXT NOT NULL,target_marker TEXT NOT NULL,fixture_kind TEXT NOT NULL,fixture_id UUID NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(authorization_id,target_marker,fixture_kind,fixture_id));
REVOKE ALL ON public.pf_mvp10_acceptance_fixture_ownership FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.pharmacies WHERE id='a2000000-0000-4000-8000-000000000001') OR EXISTS(SELECT 1 FROM auth.users WHERE id='c2000000-0000-4000-8000-000000000001' OR email='pf-mvp10-concurrency@example.invalid') OR EXISTS(SELECT 1 FROM public.branches WHERE id='b2000000-0000-4000-8000-000000000001') OR EXISTS(SELECT 1 FROM public.products WHERE id='d2000000-0000-4000-8000-000000000001') OR EXISTS(SELECT 1 FROM public.pf_mvp10_acceptance_fixture_ownership WHERE fixture_id IN('a2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001')) THEN RAISE EXCEPTION 'PREEXISTING_CONCURRENCY_FIXTURE_OR_OWNERSHIP';END IF;
END $$;
INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES('c2000000-0000-4000-8000-000000000001','authenticated','authenticated','pf-mvp10-concurrency@example.invalid',now(),now());
INSERT INTO public.pharmacies(id,name,owner_id) VALUES('a2000000-0000-4000-8000-000000000001','PF MVP10 Concurrency','c2000000-0000-4000-8000-000000000001');
INSERT INTO public.branches(id,pharmacy_id,name,is_main) VALUES('b2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Main',true);
INSERT INTO public.pharmacy_members(user_id,pharmacy_id,role,default_branch_id,status) VALUES('c2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','OWNER','b2000000-0000-4000-8000-000000000001','ACTIVE');
INSERT INTO public.subscriptions(pharmacy_id,plan_code,status,current_period_start,current_period_end) VALUES('a2000000-0000-4000-8000-000000000001','TRIAL','ACTIVE',now()-interval '1 day',now()+interval '1 day');
INSERT INTO public.products(id,pharmacy_id,name,selling_price) VALUES('d2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Concurrent',10);
INSERT INTO public.pf_mvp10_acceptance_fixture_ownership(authorization_id,target_marker,fixture_kind,fixture_id) VALUES
 (:'pf_authorization_id',:'pf_target_marker','pharmacy','a2000000-0000-4000-8000-000000000001'),
 (:'pf_authorization_id',:'pf_target_marker','user','c2000000-0000-4000-8000-000000000001'),
 (:'pf_authorization_id',:'pf_target_marker','branch','b2000000-0000-4000-8000-000000000001'),
 (:'pf_authorization_id',:'pf_target_marker','product','d2000000-0000-4000-8000-000000000001');
SELECT 'PF_PASS|concurrency-setup';
