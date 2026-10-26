# Phase B real-browser and lifecycle runbook

Status: **UNEXECUTED / OWNER AUTHORIZATION REQUIRED**. This runbook requires a named empty browser profile, the reviewed real application components and an owner-approved disposable PharmacyFlow target. It must not be run against a normal browser profile or production/shared service.

## Harness boundary

Exercise the rendered production `PosView`, `CartPanel` and `ProductSearch`. Delay or complete their real network adapter calls at the browser transport boundary. Do not invoke `CheckoutAsyncBoundary` directly and do not count fake IndexedDB or helper assertions as browser evidence.

Record exact browser build, viewport, application URL/source hash, target ID, profile path, service worker/extension state and DevTools/automation version. Capture a trace, console log, accessibility snapshot, network log and IndexedDB export for every case.

## Profile preparation

1. Resolve the owner-approved empty profile path and prove it is not a normal user profile.
2. Launch the approved browser with that exact profile and no extensions. Do not use an existing profile.
3. Confirm application target identity before authentication or fixture mutation.
4. Disable cache only if prescribed for the whole run; record the choice. Do not clear unrelated storage.
5. Import/create only the fixed fixture graph in `FIXTURES.json`.

After the owner supplies the exact executable, profile and application URL, the launch command is:

```powershell
$browserExe = (Resolve-Path -LiteralPath $env:PF_ACCEPTANCE_BROWSER_EXE).Path
$profile = [IO.Path]::GetFullPath($env:PF_ACCEPTANCE_BROWSER_PROFILE)
$appUrl = $env:PF_ACCEPTANCE_APP_URL
if (-not $browserExe -or -not $profile -or -not $appUrl) { throw 'ABORT: browser identity/profile/URL missing' }
Start-Process -FilePath $browserExe -ArgumentList @("--user-data-dir=$profile", '--disable-extensions', '--no-first-run', $appUrl)
```

This launch is part of the later `REAL-BROWSER` run and is not authorized by the preparation package. If automation is used, it must attach to this isolated instance, preserve a trace, and drive DOM/accessibility interactions on the rendered components.

## D-series: IndexedDB upgrade and contention

### D-01 v3 to v4 additive upgrade

Seed a byte-recorded v3 PharmacyFlow database in the isolated profile with representative queue, transaction and key records. Export bytes and record counts. Open the reviewed app once to trigger v4. Assert all old stores/keys/values are byte-equivalent, `checkout_drafts` is additive, and no transaction is transmitted merely by upgrading.

### D-02 simultaneous fresh initialization

Open two tabs at a synchronization barrier with the same tenant/branch/cashier/device scope. Assert both converge on the same persisted checkout/revision-1 snapshot, neither overwrites later cart content, and retries are bounded. Repeat after remount and after retiring the checkout; retirement must produce one explicit replacement identity.

### D-03 interrupted initial persistence

Instrument the real IndexedDB transaction so its write request reports success and the transaction then aborts before commit. Assert no active snapshot is claimed, a visible initialization failure/retry state appears, no unbounded retry occurs, and explicit retry converges on the persisted winner.

### D-04 freeze/retirement races

Race clear versus finalize and acknowledgement versus new checkout, including the current revision. Assert cancelled/acknowledged/missing/replaced ownership cannot freeze or resurrect; existing frozen transaction and queue records remain byte-equivalent.

### D-05 lease contention and post-request abort

Release two tabs to acquire the same dispatch lease. Force one lease transaction to abort after its request succeeds. Assert its promise rejects predictably, it transmits zero requests, at most one committed owner dispatches, and attempts/tokens remain consistent.

## E-series: restart and recovery

### E-01 valid recovery

Freeze Customer A's sale, terminate/remount before the UI observes completion, then choose the explicit recovery flow. Assert original operation/sale/checkout/item IDs, canonical bytes, customer, payment, tender and client creation time are restored. Receipt projection must use those frozen values.

### E-02 corrupt evidence matrix

On separate copies: corrupt both payload copies identically while retaining stale hashes; corrupt one copy; replace both stored hashes with a stale matching value; remove the transaction; remove the queue record; mismatch identities. Each must fail closed without rewriting bytes, hashes or IDs.

### E-03 response loss

Allow server commit, suppress the response, then remount. Assert status reconciliation proves committed evidence before local resolution and no resend occurs before authoritative evidence. Record network counts and the status-v2 row.

## F-series: real UI completion boundaries

For every delayed request, start it while Checkout A is active, capture its request ID and then change identity/scope or unmount before releasing the response. A pass requires both no stale DOM state and no stale durable mutation.

### F-01 delayed customer creation and lookup

Select/create Customer A, delay completion, acknowledge/replace checkout, start Customer B, then release A. Repeat across branch change, cashier change and unmount. Assert A never populates B, pending indicators clear only for the owning request, and recovery of A retains A's frozen customer.

### F-02 delayed barcode and product search

Delay barcode resolution and product-search results from A. Replace checkout, change scope and unmount in separate repetitions. Assert no result list, cart line, duplicate-selection control or error from A appears in B.

### F-03 duplicate selection

Trigger the duplicate-product selection path, hold the selection completion, then replace checkout/scope/unmount. Assert no quantity or selected-batch mutation reaches the later checkout.

### F-04 consecutive customers and receipts

Complete Customer A with a distinctive payment method/tender/time, acknowledge, then complete Customer B with different values. Assert identity and customer/payment/tender/search/pending state reset. Render both receipts from sale readers and assert each uses its own frozen customer, payment, tender and client creation time.

### F-05 branch/cashier transition

Leave unresolved durable work, change branch and then cashier. Assert the old scope detaches, presents explicit recovery only in its original scope, the new scope initializes independently, and all old-scope delayed completions are rejected.

## Evidence and aborts

For each case capture event timestamps, checkout/scope/generation IDs, adapter start/completion/disposition, DOM/accessibility state, queue/draft/transaction records and network transmission counts. Abort on stale state application, silent recovery, duplicate transmission, cross-scope mutation, receipt substitution, historical-record mutation, unbounded retry, or any need to use an unapproved profile/target.

Export evidence before cleanup. Close every test tab. Delete only the exact resolved isolated profile directory after separate cleanup authorization and path verification; otherwise leave it intact and mark cleanup pending.
