\set ON_ERROR_STOP on
SET statement_timeout = '5s';
SET lock_timeout = '1s';
SELECT 'PF_I3A_RESULT=' || json_build_object(
  'schema','pharmacyflow-i3a-process-v1','kind','target-proof','payload',json_build_object(
    'marker',current_setting('pharmacyflow.acceptance_target_id',true),
    'database',current_database(),
    'database_oid',(SELECT oid FROM pg_database WHERE datname=current_database()),
    'server_addr',inet_server_addr()::text,
    'server_port',inet_server_port(),
    'system_identifier',(SELECT system_identifier::text FROM pg_control_system()),
    'session_user',session_user
  ))::text;
