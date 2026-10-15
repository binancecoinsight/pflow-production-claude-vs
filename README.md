# PharmacyFlow — Enterprise POS, Admin & Pharmacy Management Suite

PharmacyFlow is an offline-first multi-tenant pharmacy management system featuring cryptographic point-of-sale (POS) terminal enrollment, real-time inventory ledgering, automated batch expiry tracking, inter-branch stock transfers, multi-tender split checkout, customer credit & dispensing limits, cash drawer shift reconciliation, and hardened PostgreSQL Row Level Security (RLS).

---

## 📦 What's Inside This Package

This archive contains the complete, production-ready PharmacyFlow source code and migration history:

1. **Frontend & Administrative Client (`src/`)**
   - **Point of Sale (`src/components/pos/` & `src/lib/pos/`)**: Barcode lookup, multi-tender transactions (Cash, Card, Transfer, Credit), cart calculations, receipt generators, and offline queueing.
   - **Inventory Management (`src/components/inventory/` & `src/lib/inventory/`)**: Product catalog, batch/expiry tracking, stock intake, audit adjustments, and inter-branch stock transfers (draft, dispatch, transit, receive).
   - **Sales & Returns (`src/components/sales/` & `src/lib/sales/`)**: Complete transaction history, itemized receipts, customer credit tracking, and partial/full refund workflows with audit logging.
   - **Customer Directory (`src/components/customers/` & `src/lib/customers/`)**: Customer profiles, loyalty tiers, dispensing limits, allergies, and account balances.
   - **Supplier Management (`src/components/suppliers/` & `src/lib/suppliers/`)**: Vendor catalog, contact management, and purchasing records.
   - **Cash & Shift Reconciliation (`src/components/cash/` & `src/lib/cash/`)**: Cash drawer sessions, opening float, mid-shift drops, pay-ins/pay-outs, blind counts, and variance resolution.
   - **Analytics & Reports (`src/components/reports/` & `src/lib/reports/`)**: Revenue analytics, gross margin breakdown, product velocity, inventory valuation (FIFO/weighted average), and cashier audit logs.
   - **Cryptographic POS Devices (`src/components/devices/` & `src/lib/crypto/`)**: Device keypair generation (Ed25519/ECDSA), challenge-response pairing, and cryptographic terminal authentication.
   - **Offline Sync Engine (`src/lib/offline/`)**: IndexedDB offline transaction store, exponential backoff dispatcher, idempotent replay, and conflict reconciliation.
   - **Multi-Tenant Context & RBAC (`src/contexts/AuthContext.tsx` & `src/types/auth.ts`)**: Tenant switching, hierarchical role authority (`OWNER`, `MANAGER`, `PHARMACIST`, `CASHIER`), and granular database permissions.

2. **Database Migrations (`supabase/migrations/`)**
   The complete sequence of 16 sealed PostgreSQL migrations:
   - `20261004000001_m1_identity_security.sql`: Core schema, auth hooks, profiles, and initial security policies.
   - `20261004000002_m2_membership_roles.sql`: Pharmacies, branches, memberships, and role permissions.
   - `20261004000003_m3_billing_subscriptions.sql`: Subscription plans, seat/staff limits, and tenant billing state.
   - `20261004000004_m4_devices_crypto.sql`: POS device registration, cryptographic public keys, and enrollment tokens.
   - `20261004000005_m5_inventory_ledger.sql`: Product catalog, batches, serial numbers, and double-entry stock ledger.
   - `20261004000006_m6_sync_audit.sql`: Offline sync queue, audit event logging, and transaction idempotency keys.
   - `20261004000007_m7_final_security.sql`: Security hardening, RLS policy consolidation, and role verification triggers.
   - `20261005000008_m8_cashier_sales_rls.sql`: Sales, sale items, and cashier checkout policies.
   - `20261005000009_m9_returns_refunds.sql`: Return items, refund processing, and inventory reversal triggers.
   - `20261005000010_m10_offline_return_sync.sql`: Offline refund conflict resolution and verification RPCs.
   - `20261006000011_m11_customers_management.sql`: Customer accounts, loyalty tracking, and credit ledger.
   - `20261006000012_m12_tender_integrity.sql`: Payment split reconciliation and multi-tender integrity rules.
   - `20261006000013_m13_inventory_receiving.sql`: Purchase orders, stock intake verification, and supplier invoice ledgering.
   - `20261007000014_m14_inventory_adjustments.sql`: Stock discrepancy adjustments, spoilage write-offs, and cycle counts.
   - `20261007000015_m15_stock_transfers.sql`: Inter-branch dispatch, transit tracking, and intake confirmation.
   - `20261011000016_m16_staff_management_rpcs.sql`: High-integrity staff invitations, quota enforcement, role management, and suspension RPCs.

3. **Edge Functions (`supabase/functions/`)**
   - `sync-push-sale`: Secure ingestion and validation of offline sales batches.
   - `sync-push-return`: Ingestion and ledger reversal for offline returns.

4. **Configuration & Toolchain**
   - `.env.example`: Sanitized environment template for Supabase credentials.
   - `vite.config.ts`, `tsconfig.json`, `package.json`: Modern Vite + React 19 + TypeScript + Tailwind CSS build pipeline.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js 18+ or 20+
- npm or bun or pnpm
- Supabase account (or local Supabase CLI)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` and fill in your Supabase Project URL and Anon Key:
```ini
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
```

### 3. Deploy Database Migrations
#### Option A: Using the Supabase CLI (Recommended)
```bash
# Link to your Supabase project
supabase link --project-ref your-project-ref

# Push all migrations (M-1 through M-16) in order
supabase db push
```

#### Option B: Using the Supabase SQL Editor
Run the migration files in numerical order (`20261004000001_...` to `20261011000016_...`) in your Supabase SQL Editor.

### 4. Start Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:3000`.

---

## 🔒 Security Architecture
- **Row Level Security (RLS)**: Enforced on 100% of tables. No direct access across pharmacy tenants.
- **Role Permissions**: Evaluated against PostgreSQL `role_permissions` and `pharmacy_members`.
- **Cryptographic POS Verification**: Devices sign sync payloads with private keys; backend validates against enrolled public key.
- **Seat Quota Enforcement**: Staff invitations enforce subscription plan seat quotas via database RPC transactions.

---

## 📄 License
Proprietary — All rights reserved.
