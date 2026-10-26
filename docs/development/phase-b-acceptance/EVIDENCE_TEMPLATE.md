# Phase B acceptance evidence

Run ID:  
Checkpoint: PF-SUP-2026-10-23-03  
UTC start/end:  
Operator/reviewer:  
Authorization reference and exact allowed gates:  

## Identity and versions

- Target ID/project/database/server address (sanitized):
- Proof target is disposable PharmacyFlow-only:
- Branch/HEAD:
- Source-manifest verification output:
- Migration names/checksums and function hashes:
- OS/PowerShell/Git/Node/npm:
- PostgreSQL/PostgREST/Supabase CLI/Edge runtime:
- Browser name/build/profile path (sanitized):
- Dependency-lock verification:

## Fixture materialization

- Fixture definition hash:
- Reviewed materialization SQL path/hash:
- Pre-existing collision query/result:
- Commit required? Why:
- Before counts/checksums:
- Materialization command, exit code, UTC timestamps:

## Case result

Repeat this section for every case ID.

- Case ID / evidence class (`STATIC`, `SYNTHETIC`, `REAL-DB`, `REAL-BROWSER`):
- Exact command or browser action:
- Inputs/actor/tenant/branch/checkout/op/hash (no secrets):
- Expected assertions:
- Actual raw-result artifact:
- SQLSTATE/constraint/HTTP status where applicable:
- Before/after rows or IndexedDB records:
- Network request/transmission count:
- Concurrency backend PIDs/barrier/timeline:
- Visible DOM/accessibility state and screenshot/trace:
- PASS / FAIL / AMBIGUOUS:
- Reviewer note:

## Gate finding table

| Gate/case | Evidence class | Result | Artifact hashes | Independent reviewer |
|---|---|---|---|---|
| A status-v2 | | | | |
| B M-18 | | | | |
| C Refund V2 | | | | |
| D IndexedDB/contention | | | | |
| E restart/recovery | | | | |
| F customer/receipt/scope | | | | |

## Abort/event log

Record every unexpected state, retry and operator intervention. An abort is not converted to a pass by rerunning without preserving the first evidence.

## Cleanup proof

- Cleanup SQL/script hash and identity guards:
- Cleanup command/exit code/timestamps:
- Fixture rows remaining by table:
- Non-fixture before/after counts/checksums:
- Browser evidence exported before profile deletion:
- Resolved isolated profile path and deletion authorization:
- Services/processes started and stopped:
- Cleanup PASS / FAIL:

## Final disposition

- Phase B accepted / not accepted / blocked:
- Open gates:
- Deployment remains unauthorized: YES / NO (must be YES for this package)
- Operator signature/date:
- Independent reviewer signature/date:
