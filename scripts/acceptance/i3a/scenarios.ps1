Set-StrictMode -Version Latest

function New-I3aRpcSessionSql([string]$CaseId,[string]$Session,[string]$BarrierNonce,[string]$AuthorizationId,[string]$LockKeySql,[string]$Action,[string]$Outcome,[string]$EffectCountSql) {
  $hold = if($Session -ceq 'A'){ 'PERFORM pg_sleep(5);' } else { '' }
  $template=@'
SET statement_timeout='20s'; SET lock_timeout='8s'; SET idle_in_transaction_session_timeout='20s';
INSERT INTO public.pf_i3a_concurrency_evidence(run_id,case_id,session_name,authorization_id,barrier_nonce,backend_pid,application_name,lock_classid,lock_objid,readiness_committed)
SELECT 'I3A-20261026-001','__CASE__','__SESSION__','__AUTH__','__NONCE__',pg_backend_pid(),current_setting('application_name'),
 ((__LOCKKEY__)>>32)::int::oid,((__LOCKKEY__)::int)::oid,true;
DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '8 seconds'; BEGIN
 LOOP EXIT WHEN EXISTS(SELECT 1 FROM public.pf_i3a_concurrency_evidence WHERE run_id='I3A-20261026-001' AND case_id='__CASE__' AND session_name='__SESSION__' AND released);
  IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'PF_BARRIER_TIMEOUT'; END IF; PERFORM pg_sleep(0.05); END LOOP;
END $wait$;
UPDATE public.pf_i3a_concurrency_evidence SET entered_critical_at=clock_timestamp() WHERE run_id='I3A-20261026-001' AND case_id='__CASE__' AND session_name='__SESSION__';
BEGIN;
__ACTION__
DO $hold$ BEGIN __HOLD__ END $hold$;
COMMIT;
UPDATE public.pf_i3a_concurrency_evidence SET left_critical_at=clock_timestamp(),outcome='__OUTCOME__',authoritative_effect_count=(__COUNT__)
WHERE run_id='I3A-20261026-001' AND case_id='__CASE__' AND session_name='__SESSION__';
SELECT 'PF_I3A_RESULT='||json_build_object('schema','pharmacyflow-i3a-process-v1','kind','concurrency-session','payload',
 json_build_object('case','__CASE__','session','__SESSION__','outcome','__OUTCOME__','effect_count',(__COUNT__)))::text;
'@
  return $template.Replace('__CASE__',$CaseId).Replace('__SESSION__',$Session).Replace('__AUTH__',$AuthorizationId.Replace("'","''")).Replace('__NONCE__',$BarrierNonce).Replace('__LOCKKEY__',$LockKeySql).Replace('__ACTION__',$Action).Replace('__HOLD__',$hold).Replace('__OUTCOME__',$Outcome).Replace('__COUNT__',$EffectCountSql)
}

function Get-I3aScenario([string]$CaseId,[string]$BarrierNonce,[string]$AuthorizationId) {
  $gatewayClaims="PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_owner_gateway_executor','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','GATEWAY','sub','i3a-gateway-0001','pharmacyflow_credential_version','1')::text,true);"
  $operatorClaims="PERFORM set_config('request.jwt.claims',jsonb_build_object('role','pharmacyflow_platform_admission_operator','aud','pharmacyflow-owner-i3','pharmacyflow_principal_class','PLATFORM_OPERATOR','sub','i3a-operator-0001','pharmacyflow_credential_version','1')::text,true);"
  switch($CaseId){
    'OPERATION_COLLISION_PENDING_FIRST' {
      $op='20000000-0000-4000-8000-000000000401';$request='30000000-0000-4000-8000-000000000401';$provider='50000000-0000-4000-8000-000000000401';$decision='40000000-0000-4000-8000-000000000491';$ctx='10000000-0000-4000-8000-000000000001';$email='owner.i3a.001@example.invalid';$k='c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf';$intent=('b'*64)
      $setup="BEGIN; INSERT INTO public.owner_security_operations(contract_version,operation_id,action,principal_class,principal_id,credential_version,applicant_key,pharmacy_context_id,command_fingerprint,result_identity,canonical_result) VALUES('owner-gateway-operator-v1','20000000-0000-4000-8000-000000000491','ADMISSION_APPROVE','PLATFORM_OPERATOR','i3a-operator-0001',1,'$k','$ctx',repeat('a',64),'$decision','{`"state`":`"ACTIVE`"}'); INSERT INTO public.owner_admission_decisions(decision_id,operation_id,action,operator_id,applicant_email_digest,pharmacy_context_id,reason_code,resulting_state) VALUES('$decision','20000000-0000-4000-8000-000000000491','APPROVE','i3a-operator-0001','$k','$ctx','CONCURRENCY_SETUP','ACTIVE'); INSERT INTO public.owner_eligibility_admissions(normalized_email_digest,policy_version,evidence_id,is_active,pharmacy_context_id,current_decision_id) VALUES('$k','closed-manual-v1','$decision',true,'$ctx','$decision'); INSERT INTO public.owner_eligibility_requests(contract_version,owner_contract_version,request_id,provider_operation_id,normalized_email_digest,intended_input_fingerprint,admission_evidence_id,state,canonical_issuer_response,pharmacy_context_id,admission_decision_id) VALUES('owner-eligibility-issuer-v1','owner-onboarding-v1','$request','$provider','$k','$intent','$decision','RESERVED','{`"state`":`"RESERVED`",`"subject_id`":null}','$ctx','$decision'); COMMIT;"
      $fp="public.private_i3_command_fingerprint_v1(ARRAY['owner-gateway-operator-v1','IDENTITY_ISSUE','i3a-gateway-0001','$k','$ctx','$op','$request','$request','$provider','$intent','$email','Owner I3A'])"
      $a="DO `$rpc`$ BEGIN $gatewayClaims PERFORM public.rpc_gateway_begin_owner_identity_v3('$op','$request','$k','$ctx','$request','$provider','$intent','$email','Owner I3A',$fp); END `$rpc`$;"
      $admissionFp="public.private_i3_command_fingerprint_v1(ARRAY['owner-gateway-operator-v1','ADMISSION_APPROVE','i3a-operator-0001','$k','$ctx','$op','APPROVE','40000000-0000-4000-8000-000000000401','$email','COLLISION',NULL])"
      $b="DO `$rpc`$ BEGIN $operatorClaims BEGIN PERFORM public.rpc_platform_owner_admission_decide_v2('$op','APPROVE','40000000-0000-4000-8000-000000000401','$email','$ctx','COLLISION',NULL,$admissionFp); RAISE EXCEPTION 'collision accepted'; EXCEPTION WHEN SQLSTATE 'PI033' THEN NULL; END; END `$rpc`$;"
      $count="(SELECT count(*) FROM public.owner_identity_issuance_attempts WHERE operation_id='$op' AND state='PROVIDER_PENDING')";$key="hashtextextended('$op'::text,2)"
      return [pscustomobject]@{ExecutionClassification='RPC_PRODUCTION_LOCK';SetupSql=$setup;LockKeySql=$key;ExpectedOutcomes=@('PENDING_APPLIED','OPERATION_CONFLICT');ExpectedEffectCount=1;A=(New-I3aRpcSessionSql $CaseId 'A' $BarrierNonce $AuthorizationId $key $a 'PENDING_APPLIED' $count);B=(New-I3aRpcSessionSql $CaseId 'B' $BarrierNonce $AuthorizationId $key $b 'OPERATION_CONFLICT' $count);FinalCountSql=$count;RollbackProofSql="SELECT NOT EXISTS(SELECT 1 FROM public.owner_identity_issuance_attempts WHERE operation_id='$op')"}
    }
    'OPERATION_COLLISION_COMPLETED_FIRST' {
      $op='20000000-0000-4000-8000-000000000402';$ctx='10000000-0000-4000-8000-000000000002';$email='collision.completed@example.invalid';$k="encode(digest(convert_to('$email','UTF8'),'sha256'),'hex')";$key="hashtextextended('$op'::text,2)"
      $admissionFp="public.private_i3_command_fingerprint_v1(ARRAY['owner-gateway-operator-v1','ADMISSION_APPROVE','i3a-operator-0001',$k,'$ctx','$op','APPROVE','40000000-0000-4000-8000-000000000402','$email','COLLISION',NULL])"
      $a="DO `$rpc`$ BEGIN $operatorClaims PERFORM public.rpc_platform_owner_admission_decide_v2('$op','APPROVE','40000000-0000-4000-8000-000000000402','$email','$ctx','COLLISION',NULL,$admissionFp); END `$rpc`$;"
      $issueFp="public.private_i3_command_fingerprint_v1(ARRAY['owner-gateway-operator-v1','IDENTITY_ISSUE','i3a-gateway-0001',$k,'$ctx','$op','30000000-0000-4000-8000-000000000402','30000000-0000-4000-8000-000000000402','50000000-0000-4000-8000-000000000402',repeat('b',64),'$email','Owner I3A'])"
      $b="DO `$rpc`$ BEGIN $gatewayClaims BEGIN PERFORM public.rpc_gateway_begin_owner_identity_v3('$op','30000000-0000-4000-8000-000000000402',$k,'$ctx','30000000-0000-4000-8000-000000000402','50000000-0000-4000-8000-000000000402',repeat('b',64),'$email','Owner I3A',$issueFp); RAISE EXCEPTION 'collision accepted'; EXCEPTION WHEN SQLSTATE 'PI033' THEN NULL; END; END `$rpc`$;"
      $count="(SELECT count(*) FROM public.owner_security_operations WHERE operation_id='$op' AND action='ADMISSION_APPROVE')"
      return [pscustomobject]@{ExecutionClassification='RPC_PRODUCTION_LOCK';SetupSql='';LockKeySql=$key;ExpectedOutcomes=@('COMPLETED_APPLIED','OPERATION_CONFLICT');ExpectedEffectCount=1;A=(New-I3aRpcSessionSql $CaseId 'A' $BarrierNonce $AuthorizationId $key $a 'COMPLETED_APPLIED' $count);B=(New-I3aRpcSessionSql $CaseId 'B' $BarrierNonce $AuthorizationId $key $b 'OPERATION_CONFLICT' $count);FinalCountSql=$count;RollbackProofSql="SELECT NOT EXISTS(SELECT 1 FROM public.owner_security_operations WHERE operation_id='$op')"}
    }
    'RESERVATION_REVOCATION' {
      throw 'BLOCKED: a deterministic production-lock reservation/revocation fixture requires an additional committed fixture lifecycle review; no direct-row substitute is accepted.'
    }
    'DURABLE_PENDING_RECOVERY' {
      throw 'NOT IMPLEMENTED: rpc_gateway_recover_owner_identity_v3 does not acquire an observable application lock; sequential boundary coverage only.'
    }
    'CONSUMPTION_REVOCATION' {
      throw 'BLOCKED: genuine consumption requires confirmed Auth identity and trusted metadata; direct state mutation is prohibited.'
    }
    default { throw 'ABORT: unknown concurrency case.' }
  }
}
