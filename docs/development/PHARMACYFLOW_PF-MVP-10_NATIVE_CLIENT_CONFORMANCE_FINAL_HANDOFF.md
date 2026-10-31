# PF-MVP-10 Native-Client Conformance and Final Execution-Gate Handoff

Date: 2026-10-31  
Checkpoint: PF-SUP-2026-10-31-03  
Disposition: complete local correction and rehearsal; protected execution not run; independent review required

## Final local closure

Native `psql` diagnostic prefixes are normalized before notice or event validation. The parser accepts only `psql:<source>:<positive line>: NOTICE: <payload>` where `<source>` resolves to the exact SQL path supplied by the approved `-f` argument and the line is within that file. Greedy source parsing supports Windows drive letters and paths containing spaces. The normalized prefix is discarded; retained evidence never contains the source path or raw diagnostic.

Malformed prefixes, unrelated source files, zero/out-of-range lines, context lines, unknown notices and secret-bearing content reject. Nonzero exits retain only fixed failure dispositions. Cancellation prevents the process adapter call.

The notice allowlist now matches PostgreSQL’s actual migration forms: `extension "pgcrypto" already exists`, relation already exists, column of relation already exists, policy/trigger for relation missing, and constraint of relation missing—all with `skipping`. These forms are validated and discarded. There is no blanket `NOTICE` bypass.

Normal command dispatch consumes a source-faithful prefixed migration notice using the delivered inventory. The actual concurrency coordinator consumes a source-faithful prefixed worker terminal notice. The native-client matrix additionally covers paths with spaces, malformed context, unrelated paths, unknown/secret notices, nonzero exit, cancellation and cleanup refusal.

## Exact local checks

| Check | Result |
|---|---|
| package static assertions | `53 passed` |
| emitter/consumer static conformance | `36 passed` |
| TypeScript preflight/orchestration | passed |
| production bridge/process/transcript | `15 passed` |
| native-client prefix/transcript | `6 passed` |
| whole-command surface | `16 passed` |
| actual concurrency coordinator | `4 passed` |
| PowerShell syntax | `9 files clean` |
| C# bridge | compiled |
| SQL lexical structure | `14 files clean` |
| focused/root TypeScript no-emit | passed |

Execution inventory SHA-256: `59338f5aee6d759ccb580c18e2e111f463c7f82cc5468b46473f3d20886e43ca`.

All previously closed local findings remain corrected: exact inventory/preflight alignment, structured dispatch without `$LASTEXITCODE`, bounded process behavior, strict diagnostic retention, one runtime frame, singular SQL success frames, M-13 concurrency conflict semantics, Refund V2 nonce separation, immutable cleanup refusal and complete worker accounting.

## Final protected gate

Representative native-client transcripts establish local emitter/consumer conformance only. PostgreSQL parsing/application, migration execution, database/RPC/RLS/role behavior, real concurrency and production acceptance remain **NOT RUN**.

After independent review, protected execution still requires a separate owner instruction naming the disposable target and marker, PowerShell and `psql` paths/hashes, credential-file delivery, evidence destination, authorization expiry, scenarios, commands and permissions. AUTH-02, direct-table enforcement and environment destruction remain separate gates.
