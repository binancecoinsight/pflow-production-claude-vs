\set ON_ERROR_STOP on
SET statement_timeout = '15s';
SET lock_timeout = '3s';
SET idle_in_transaction_session_timeout = '15s';
SELECT (:'pf_target_id'='pharmacyflow-i3a-acceptance-20261026'
  AND :'pf_target_marker'='pharmacyflow-i3a-acceptance-20261026'
  AND :'pf_run_id'='I3A-20261026-001'
  AND :'pf_execution_authorization_id'<>''
  AND :'pf_fixture_digest'~'^[0-9a-f]{64}$'
  AND :'pf_environment_destruction'='false'
  AND current_database()='postgres'
  AND inet_server_addr()::text='127.0.0.1'
  AND inet_server_port()=57322
  AND session_user='postgres'
  AND current_setting('pharmacyflow.acceptance_target_id',true)=:'pf_target_marker'
  AND (SELECT system_identifier::text FROM pg_control_system())=:'pf_system_identifier'
  AND (SELECT oid::text FROM pg_database WHERE datname=current_database())=:'pf_database_oid') AS pf_i3a_guard_ok \gset
\if :pf_i3a_guard_ok
\else
  \echo 'ABORT: pinned endpoint or authoritative target identity proof mismatch'
  \quit 20
\endif

