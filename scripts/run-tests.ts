import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const suites = [
  'src/lib/auth/onboarding.test.ts',
  'supabase/contracts/owner_onboarding_v1.test.ts',
  'supabase/functions/staff-invitation-bootstrap/index.test.ts',
  'src/lib/subscription/lifecycle.test.ts',
  'src/lib/subscription/capabilityBoundary.test.ts',
  'scripts/acceptance/target-guard.test.mjs',
  'scripts/acceptance/capability-wiring.test.mjs',
  'src/lib/crypto/crypto.test.ts',
  'src/lib/offline/offline.test.ts',
  'src/lib/offline/returnSync.test.ts',
  'src/lib/offline/phase5d11_final_verification.test.ts',
  'src/lib/offline/phaseB.test.ts',
  'src/lib/sales/sales.test.ts',
  'src/lib/sales/refundV2.test.ts',
  'src/lib/cash/reconciliation.test.ts',
  'src/lib/inventory/catalog.test.ts',
  'src/lib/inventory/inventory.test.ts',
  'src/lib/inventory/sync.test.ts',
  'src/lib/inventory/stockAdjustment.test.ts',
  'src/lib/inventory/stockIntake.test.ts',
  'src/lib/inventory/stockTransfer.test.ts',
  'src/lib/devices/devices.test.ts',
  'src/lib/pos/pos.test.ts',
  'src/lib/reports/reports.test.ts',
  'src/lib/suppliers/suppliers.test.ts',
  'src/components/customers/customers.test.ts',
  'src/components/devices/devicesUi.test.ts',
  'src/components/inventory/inventoryUi.test.ts',
  'src/components/inventory/stockTransferUi.test.ts',
  'src/components/pos/posUi.test.ts',
  'src/components/reports/reportsUi.test.ts',
  'src/components/sales/receipts.test.ts',
  'src/components/sales/returns.test.ts',
  'src/components/sales/salesUi.test.ts',
  'src/components/suppliers/suppliersUi.test.ts',
  'supabase/functions/sync-push-sale/index.test.ts',
  'supabase/functions/sync-push-return/index.test.ts',
  'supabase/contracts/pharmacyflow_postsealed_contract.test.ts',
  'supabase/migrations/m8_security.test.ts'
];

const criticalSuites = new Set([
  'src/lib/sales/sales.test.ts',
  'src/lib/sales/refundV2.test.ts',
  'src/lib/offline/offline.test.ts',
  'src/lib/offline/returnSync.test.ts',
  'src/lib/offline/phaseB.test.ts',
  'src/lib/cash/reconciliation.test.ts',
  'src/components/sales/returns.test.ts',
  'src/components/sales/receipts.test.ts',
  'supabase/functions/sync-push-sale/index.test.ts',
  'supabase/functions/sync-push-return/index.test.ts',
  'supabase/contracts/pharmacyflow_postsealed_contract.test.ts'
]);

const selectedSuites = process.argv.includes('--critical')
  ? suites.filter((suite) => criticalSuites.has(suite))
  : suites;
let failed = 0;

for (const suite of selectedSuites) {
  console.log(`\n=== ${suite} ===`);
  const result = spawnSync(process.execPath, [
    '--loader',
    './scripts/typescript-loader.mjs',
    suite
  ], {
    cwd: root,
    env: process.env,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    failed += 1;
    console.error(`FAILED: ${suite}`);
  }
}

console.log(`\nTest suites: ${selectedSuites.length - failed} passed, ${failed} failed, ${selectedSuites.length} total.`);
process.exitCode = failed === 0 ? 0 : 1;
