export const COMMANDS = ['runtime-preflight','apply-migrations','acceptance-assertions','concurrency','fixture-cleanup'] as const;
export type Command = typeof COMMANDS[number];
export const SCENARIOS = ['acl-overloads','operator-provenance','tenant-branch','entitlement-decisions','canonical-retries','financial-inventory','expired-replay','evidence-rollback','bounded-concurrency'] as const;
export type Scenario = typeof SCENARIOS[number];
export interface TargetIdentity { host:string; port:number; database:string; user:string; sslMode:'disable'|'require'|'verify-full'; systemIdentifier:string; databaseOid:number; marker:string }
export interface ToolIdentity { path:string; sha256:string }
export interface PowerShellIdentity extends ToolIdentity { edition:'Core'; minimumVersion:string; maximumExclusiveVersion:string }
export interface ExecutionAuthorization {
  authorizationId:string; status:'AUTHORIZED'; scope:'PF_MVP_10_DISPOSABLE_ACCEPTANCE'; expiresAt:string;
  target:TargetIdentity; psql:ToolIdentity; powerShell:PowerShellIdentity; credentialFile:string;
  evidenceDirectory:string; packageManifest:string; packageManifestSha256:string;
  allowedCommands:Command[]; allowedScenarios:Scenario[];
  permissions:{migrationApply:boolean;fixtureWrite:boolean;concurrency:boolean;fixtureCleanup:boolean;environmentDestruction:false};
  runtime:{postgresMajor:number;supabaseCompatible:true;requiredSchemas:string[];requiredRoles:string[];requiredExtensions:string[];requiredAuthFunctions:string[]};
}
export interface Observation { now:string; command:Command; manifestSha256:string; psqlSha256:string; powerShellSha256:string; powerShellEdition:string; powerShellVersion:string; evidenceDirectory:string; cancellationRequested:boolean }
export const COMMAND_PERMISSIONS:Readonly<Record<Command,readonly (keyof ExecutionAuthorization['permissions'])[]>>=Object.freeze({
  'runtime-preflight':[], 'apply-migrations':['migrationApply'], 'acceptance-assertions':['fixtureWrite'],
  concurrency:['fixtureWrite','concurrency'], 'fixture-cleanup':['fixtureCleanup'],
});
export const REQUIRED_RUNTIME = Object.freeze({
  requiredSchemas:['public','auth','extensions'], requiredRoles:['anon','authenticated','service_role'],
  requiredExtensions:['pgcrypto'], requiredAuthFunctions:['auth.uid()','auth.jwt()'],
});
