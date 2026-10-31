import { COMMANDS, COMMAND_PERMISSIONS, REQUIRED_RUNTIME, SCENARIOS, type ExecutionAuthorization, type Observation } from './contract';
const SHA=/^[0-9a-f]{64}$/; const NONEMPTY=/\S/;
const parseVersion=(value:string):number[]=>value.split('.').map(Number);
const compareVersion=(left:string,right:string):number=>{const a=parseVersion(left),b=parseVersion(right);for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]??0)-(b[i]??0);if(d)return d}return 0};
export function validatePreflight(raw:unknown, observation:Observation):ExecutionAuthorization {
  const fail=(reason:string):never=>{throw new Error(`PREFLIGHT_REJECTED:${reason}`)};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) fail('authorization missing');
  const a=raw as Partial<ExecutionAuthorization>;
  if(a.status!=='AUTHORIZED'||a.scope!=='PF_MVP_10_DISPOSABLE_ACCEPTANCE'||!NONEMPTY.test(a.authorizationId??'')) fail('explicit authorization invalid');
  if(!Number.isFinite(Date.parse(a.expiresAt??''))||Date.parse(a.expiresAt!)<=Date.parse(observation.now)) fail('authorization expired');
  if(!COMMANDS.includes(observation.command)||!a.allowedCommands?.includes(observation.command)) fail('command not authorized');
  if(!a.allowedScenarios||a.allowedScenarios.length!==SCENARIOS.length||SCENARIOS.some(s=>!a.allowedScenarios!.includes(s))) fail('complete scenario approval absent');
  const t=a.target; if(!t||!Number.isSafeInteger(t.port)||t.port<1||t.port>65535||!["disable","require","verify-full"].includes(t.sslMode)||!NONEMPTY.test(t.host)||!NONEMPTY.test(t.database)||!NONEMPTY.test(t.user)||!/^\d{6,30}$/.test(t.systemIdentifier)||!Number.isSafeInteger(t.databaseOid)||t.databaseOid<1||!NONEMPTY.test(t.marker)) fail('exact target identity incomplete');
  if(!a.psql||!NONEMPTY.test(a.psql.path)||!SHA.test(a.psql.sha256)||a.psql.sha256!==observation.psqlSha256) fail('psql identity mismatch');
  if(!a.powerShell||!NONEMPTY.test(a.powerShell.path)||!SHA.test(a.powerShell.sha256)||a.powerShell.sha256!==observation.powerShellSha256||a.powerShell.edition!=='Core'||observation.powerShellEdition!=='Core'||!/^\d+\.\d+\.\d+$/.test(observation.powerShellVersion)||compareVersion(observation.powerShellVersion,a.powerShell.minimumVersion)<0||compareVersion(observation.powerShellVersion,a.powerShell.maximumExclusiveVersion)>=0) fail('PowerShell runtime identity mismatch');
  if(!NONEMPTY.test(a.credentialFile??'')||!NONEMPTY.test(a.evidenceDirectory??'')||a.evidenceDirectory!==observation.evidenceDirectory) fail('credential/evidence destination incomplete');
  if(!NONEMPTY.test(a.packageManifest??'')||!SHA.test(a.packageManifestSha256??'')||a.packageManifestSha256!==observation.manifestSha256) fail('immutable manifest mismatch');
  if(observation.cancellationRequested) fail('cancellation requested');
  if(!a.permissions) fail('permissions absent'); const p=a.permissions!;
  if(p.environmentDestruction!==false) fail('destruction must remain separately unauthorized');
  for(const permission of COMMAND_PERMISSIONS[observation.command]) if(p[permission]!==true) fail(`${permission} permission absent`);
  const r=a.runtime;if(!r||r.supabaseCompatible!==true||!Number.isInteger(r.postgresMajor)||r.postgresMajor<15) fail('runtime compatibility approval absent');
  for(const [key,required] of Object.entries(REQUIRED_RUNTIME)) if(required.some(v=>!(r as unknown as Record<string,string[]>)[key]?.includes(v))) fail(`runtime ${key} incomplete`);
  return a as ExecutionAuthorization;
}
