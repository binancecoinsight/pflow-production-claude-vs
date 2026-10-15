# PharmacyFlow Full Suite & Migration Package Export

Provide an automated, high-integrity direct download package delivering the complete PharmacyFlow SaaS client, admin interface, configuration templates, and all Supabase database migrations (M-1 through M-16) as a single downloadable ZIP archive.

> [!IMPORTANT]
> **Confirmed User Decisions (Phase 1 Clarification):**
> - **Delivery Mechanism**: Direct browser download link only, accessible without intrusive navigation redesign.
> - **Archive Scope**: Full application source code, all 16 SQL migration files, integration tests, and build configurations.
> - **Configuration Template**: Standard sanitized `.env.example` with clear parameter descriptions and zero credentials.

---

### 1. Overview & Core Concept

- **What It Does**: Packages the entire PharmacyFlow multi-tenant pharmacy management system—including POS terminal enrollment, inventory ledger, billing & subscription modules, customer management, cash drawer reconciliation, staff management RPCs, and SQL schema migrations (M-1 through M-16)—into an organized, production-grade `.zip` archive.
- **Target Audience / Persona**: Lead engineers, system architects, and DevOps evaluators requiring an offline copy of the entire codebase and historical migrations for external hosting, local development, or forensic audit.
- **Key Value**: Instant, zero-friction export of all application assets and immutable SQL migration contracts in a single operation.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Direct Download Trigger**: The user clicks a clean, subtle direct download link or navigation badge ("Download Project Bundle (.zip)") rendered cleanly in the application header or utility menu.
  2. **Streaming & Progress Feedback**: When triggered, the system packages the source files, migration folder, and templates into `pharmacyflow-full-suite.zip` and initiates the browser file download immediately via `Content-Disposition: attachment`.
  3. **Completion & Inspection**: The browser saves the ZIP archive containing an organized directory structure ready for `npm install` and Supabase migration replay.
- **Visual Identity & Theme**:
  - *Aesthetic*: Minimal, utilitarian, and cohesive with PharmacyFlow's existing slate-and-teal clinical palette.
  - *Typography*: Plus Jakarta Sans for interface labels, tabular numbers for byte counts and file sizes.
  - *Anti-Slop Discipline*: No floating neon pills, no fake telemetry badges, and no multi-step modal hurdles; a single honest, accessible download action.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Server-Side vs. Client-Side Archive Generation**
  - *Chosen Approach*: Server-side endpoint `/api/export-archive` (using Node.js `archiver` or `adm-zip`) paired with a direct browser anchor `<a href="/api/export-archive" download>`.
  - *Why*: Direct file-system streaming ensures 100% fidelity to the actual disk contents (including hidden files like `.env.example`, `.gitignore`, and SQL migrations) without memory bottlenecks or client-side fetch timeouts.
  - *Alternatives Considered*: Pure in-browser JSZip generation was rejected because it requires fetching dozens of individual source files over HTTP before assembling them.

- **Decision 2: Migration Preservation & Integrity**
  - *Chosen Approach*: Include all sealed migrations (`20261004000001_m1_identity_security.sql` through `20261011000016_m16_staff_management_rpcs.sql`) and `m8_security.test.ts` verbatim under `supabase/migrations/`.
  - *Why*: Ensures the downloaded archive matches the exact audited database evolution state.

- **Decision 3: Sanitized Configuration**
  - *Chosen Approach*: Package `.env.example` with environment documentation and guidance for Supabase URL, anon key, and service role key variables.
  - *Why*: Complies with strict security standards while providing turnkey local setup instructions.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│                   PharmacyFlow UI                      │
│   (Direct Download Link: "Download Full Bundle .zip")  │
└───────────────────────────┬────────────────────────────┘
                            │ GET /api/export-archive
                            ▼
┌────────────────────────────────────────────────────────┐
│              Archive Export API Endpoint               │
│          (Node.js Express / Vite Dev Service)          │
└───────────────────────────┬────────────────────────────┘
                            │ Collects & Streams
                            ▼
┌────────────────────────────────────────────────────────┐
│              ZIP Archive Inclusions:                   │
│  ├─ /src (SaaS UI, POS, Inventory, Admin, Contexts)    │
│  ├─ /supabase (Migrations M-1..M-16, Security Tests)   │
│  ├─ /package.json, tsconfig.json, vite.config.ts       │
│  ├─ /index.html, metadata.json, .gitignore             │
│  └─ /.env.example (Sanitized Config Template)          │
└────────────────────────────────────────────────────────┘
```

- **Archive Directory Layout**:
  - `src/` — React application components, state contexts, types, and utilities.
  - `supabase/migrations/` — All 16 SQL migration files (M-1 to M-16) and test scripts.
  - `supabase/functions/` — Edge functions and backend helpers.
  - `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html` — Toolchain and dependency manifests.
  - `.env.example` — Sanitized configuration template with deployment instructions.
  - `README.md` — Quick-start guide detailing prerequisites, `npm install`, and Supabase migration commands.

- **Component & State Flow**:
  - Direct download URL handler triggers streaming response with `Content-Type: application/zip`.
  - Content stream writes directly to the client with `Content-Disposition: attachment; filename="pharmacyflow-full-suite.zip"`.
  - Zero modification to existing business logic or database tables.
