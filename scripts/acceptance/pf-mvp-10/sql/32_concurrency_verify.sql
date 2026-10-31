\set ON_ERROR_STOP on
SELECT set_config('pf.acceptance.worker_one_pid',:'pf_worker_one_pid',false),set_config('pf.acceptance.worker_two_pid',:'pf_worker_two_pid',false) \gset
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=current_setting('pf.acceptance.worker_two_pid')::INT AND wait_event_type='Lock') OR NOT (current_setting('pf.acceptance.worker_one_pid')::INT=ANY(pg_blocking_pids(current_setting('pf.acceptance.worker_two_pid')::INT))) THEN RAISE EXCEPTION 'PRODUCTION_LOCK_OVERLAP_NOT_PROVEN';END IF;
END $$;
SELECT 'PF_EVENT|1|coordinator|BLOCKER|waiting='||:'pf_worker_two_pid'||';blocking='||:'pf_worker_one_pid';
