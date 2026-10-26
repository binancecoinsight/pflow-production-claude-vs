# PharmacyFlow-Dev read-only compatibility inspection

Status: **BLOCKED — ACCESS METHOD**  
Remote project reference: `lqzsfsmppoaibnzczmhf`

AUTH-03 permits only a demonstrably restricted metadata inspection. Local inspection found no delegated read-only Management API credential, restricted inspection role, or other access method whose permissions technically prevent writes and privileged function invocation. The available application examples use ordinary anon configuration, while service-role/admin access would be write-capable. Operating a write-capable credential with an intention to issue only reads does not satisfy AUTH-03. Therefore no remote request, credential lookup, CLI project binding or network connection was attempted.

To unblock, the owner must provide or identify a method whose enforced permissions can be inspected before use and are limited to the metadata actions below, bound to project `lqzsfsmppoaibnzczmhf`. The first permitted response must independently return that exact project identity. A service-role key, database owner URL, personal access token with project-write scope, or unrestricted CLI login is not an acceptable substitute.

The access method and credential source must be named without placing secrets in commands or evidence. No inspection should be retried until the restricted method exists.

Allowed proposed observations:

1. Read project identity and PostgreSQL version.
2. Read the migration ledger and compare ordered names/hashes with the reviewed local set.
3. Read definitions, owner, `proconfig`, grants and signatures for relevant auth, M-18, Refund V2 and status RPCs.
4. Read RLS enablement/policy metadata and function grants; do not bypass RLS or enumerate tenant records.
5. Read Edge Function names/versions/status only; do not invoke them.
6. Check whether required configuration keys are present using names/booleans only; never return secret values.
7. Record sanitized compatibility and recovery-readiness evidence.

Forbidden: SQL writes, migration repair/apply, financial RPC invocation, fixture insertion, configuration mutation, function deployment, logs containing tenant/customer/credential material, production access, or StoreFlow access.

Abort on project mismatch, write-capable-only access, unexpected source/migration divergence, inability to sanitize output, or a command whose read-only behavior cannot be established before execution.
