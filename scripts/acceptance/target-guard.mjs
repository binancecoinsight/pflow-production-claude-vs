import { execFileSync } from 'node:child_process';

const required = (env, name) => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`ABORT: ${name} is required before external access.`);
  return value.trim();
};

export function parseAcceptanceTarget(env) {
  const targetId = required(env, 'PF_ACCEPTANCE_TARGET_ID');
  const expectedTargetId = required(env, 'PF_ACCEPTANCE_EXPECTED_TARGET_ID');
  if (targetId !== expectedTargetId) throw new Error('ABORT: acceptance target identity mismatch.');
  const dbContainer = required(env, 'PF_ACCEPTANCE_DB_CONTAINER');
  const edgeContainer = required(env, 'PF_ACCEPTANCE_EDGE_CONTAINER');
  const apiContainer = required(env, 'PF_ACCEPTANCE_API_CONTAINER');
  if (dbContainer !== `supabase_db_${targetId}` || edgeContainer !== `supabase_edge_runtime_${targetId}` || apiContainer !== `supabase_kong_${targetId}`) {
    throw new Error('ABORT: container identities do not derive from the exact authorized target.');
  }
  const dbPort = required(env, 'PF_ACCEPTANCE_DB_PORT');
  const expectedDbPort = required(env, 'PF_ACCEPTANCE_EXPECTED_DB_PORT');
  const apiUrl = new URL(required(env, 'PF_ACCEPTANCE_API_URL'));
  const expectedApiUrl = new URL(required(env, 'PF_ACCEPTANCE_EXPECTED_API_URL'));
  if (apiUrl.protocol !== 'http:' || apiUrl.hostname !== '127.0.0.1' || apiUrl.username || apiUrl.password || apiUrl.pathname !== '/' || apiUrl.search || apiUrl.hash) {
    throw new Error('ABORT: acceptance API must be an uncredentialed exact loopback HTTP origin.');
  }
  const apiPort = apiUrl.port;
  if (!/^\d{2,5}$/.test(dbPort) || !/^\d{2,5}$/.test(apiPort) || Number(dbPort) > 65535 || Number(apiPort) > 65535) throw new Error('ABORT: exact database and API ports are required.');
  if (dbPort !== expectedDbPort || apiUrl.origin !== expectedApiUrl.origin || expectedApiUrl.href !== `${expectedApiUrl.origin}/`) throw new Error('ABORT: acceptance endpoints differ from the explicitly authorized endpoints.');
  return { targetId, dbContainer, edgeContainer, apiContainer, dbPort, apiPort, apiUrl: apiUrl.origin };
}

const inspectJson = (exec, name, format) => JSON.parse(exec('docker', ['inspect', name, '--format', format], { encoding: 'utf8' }));

export function verifyAcceptanceTarget(target, exec = execFileSync) {
  for (const container of [target.dbContainer, target.edgeContainer, target.apiContainer]) {
    const labels = inspectJson(exec, container, '{{json .Config.Labels}}');
    if (labels['com.supabase.cli.project'] !== target.targetId) throw new Error(`ABORT: ${container} project label mismatch.`);
  }
  const dbPorts = inspectJson(exec, target.dbContainer, '{{json .NetworkSettings.Ports}}');
  const apiPorts = inspectJson(exec, target.apiContainer, '{{json .NetworkSettings.Ports}}');
  const exactBinding = (bindings, internalPort, expectedPort) => {
    const rows = bindings[internalPort];
    return Array.isArray(rows) && rows.length === 1 && rows[0].HostIp === '127.0.0.1' && rows[0].HostPort === expectedPort;
  };
  if (!exactBinding(dbPorts, '5432/tcp', target.dbPort)) throw new Error('ABORT: PostgreSQL is not bound to the exact authorized loopback endpoint.');
  if (!Object.values(apiPorts).some((rows) => Array.isArray(rows) && rows.length === 1 && rows[0].HostIp === '127.0.0.1' && rows[0].HostPort === target.apiPort)) {
    throw new Error('ABORT: Edge/API is not bound to the exact authorized loopback endpoint.');
  }
  return target;
}

export function loadAndVerifyAcceptanceTarget(env = process.env, exec = execFileSync) {
  return verifyAcceptanceTarget(parseAcceptanceTarget(env), exec);
}
