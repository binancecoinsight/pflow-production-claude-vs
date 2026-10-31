-- Internal committed fixture for RESERVATION_REVOCATION_RESERVATION_FIRST.
-- The active admission is created only through the production admission RPC.
BEGIN;
DO $fixture$
DECLARE
 email_ constant text := 'owner.i3a.reservation-first@example.invalid';
 applicant_ constant text := 'eb9ee3407ab728705bee110c0abb73bac0e66280aa04d14798e6c9f692cfde32';
 context_ constant uuid := '10000000-0000-4000-8000-000000000001';
 approval_operation_ constant uuid := '20000000-0000-4000-8000-000000000510';
 approval_decision_ constant uuid := '40000000-0000-4000-8000-000000000510';
 result_ jsonb;
 fingerprint_ text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.owner_eligibility_admissions WHERE normalized_email_digest=applicant_)
 OR EXISTS(SELECT 1 FROM public.owner_security_operations WHERE operation_id IN(
   approval_operation_,'20000000-0000-4000-8000-000000000511','20000000-0000-4000-8000-000000000512'))
 OR EXISTS(SELECT 1 FROM public.owner_admission_decisions WHERE decision_id IN(
   approval_decision_,'40000000-0000-4000-8000-000000000512'))
 OR EXISTS(SELECT 1 FROM public.owner_eligibility_requests WHERE request_id='30000000-0000-4000-8000-000000000511') THEN
  RAISE EXCEPTION 'reservation-first fixture identifiers already exist; refusing adoption';
 END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object(
  'role','pharmacyflow_platform_admission_operator','aud','pharmacyflow-owner-i3',
  'pharmacyflow_principal_class','PLATFORM_OPERATOR','sub','i3a-operator-0001',
  'pharmacyflow_credential_version','1')::text,true);
 fingerprint_:=public.private_i3_command_fingerprint_v1(ARRAY[
  'owner-gateway-operator-v1','ADMISSION_APPROVE','i3a-operator-0001',applicant_,context_::text,
  approval_operation_::text,'APPROVE',approval_decision_::text,email_,'CONCURRENCY_FIXTURE',NULL]);
 result_:=public.rpc_platform_owner_admission_decide_v2(
  approval_operation_,'APPROVE',approval_decision_,email_,context_,'CONCURRENCY_FIXTURE',NULL,fingerprint_);
 IF result_->>'action'<>'APPROVE' OR result_->>'state'<>'ACTIVE'
 OR NOT EXISTS(SELECT 1 FROM public.owner_eligibility_admissions
  WHERE normalized_email_digest=applicant_ AND is_active AND pharmacy_context_id=context_
   AND current_decision_id=approval_decision_ AND evidence_id=approval_decision_::text)
 OR NOT EXISTS(SELECT 1 FROM public.owner_security_operations
  WHERE operation_id=approval_operation_ AND action='ADMISSION_APPROVE' AND result_identity=approval_decision_::text) THEN
  RAISE EXCEPTION 'reservation-first committed fixture validation failed';
 END IF;
END $fixture$;
COMMIT;
