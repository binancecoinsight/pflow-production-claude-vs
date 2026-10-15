-- ============================================================================
-- MIGRATION M-11: TENANT-ISOLATED CUSTOMER MANAGEMENT & SALES INTEGRITY
-- Target: supabase/migrations/20261006000011_m11_customers_management.sql
-- Dependencies: M-1 through M-10
-- ============================================================================

-- 1. PRECONDITIONS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pharmacies') THEN
        RAISE EXCEPTION 'Precondition failed: public.pharmacies table missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales') THEN
        RAISE EXCEPTION 'Precondition failed: public.sales table missing.';
    END IF;
END $$;

-- 2. CREATE TABLE public.customers IF NOT EXISTS
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3. COMPOSITE UNIQUE CONSTRAINT FOR TENANT SAFETY
-- Required to enforce composite foreign-key referential integrity with (pharmacy_id, customer_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_customers_pharmacy_id' AND conrelid = 'public.customers'::regclass
    ) THEN
        ALTER TABLE public.customers ADD CONSTRAINT uq_customers_pharmacy_id UNIQUE (pharmacy_id, id);
    END IF;
END $$;

-- 4. PERFORMANCE & SEARCH INDEXES (TENANT-SCOPED)
CREATE INDEX IF NOT EXISTS idx_customers_pharmacy_name 
ON public.customers (pharmacy_id, name);

CREATE INDEX IF NOT EXISTS idx_customers_pharmacy_phone 
ON public.customers (pharmacy_id, phone);

CREATE INDEX IF NOT EXISTS idx_customers_pharmacy_status 
ON public.customers (pharmacy_id, status);

-- 5. COMPOSITE FOREIGN KEY ON public.sales
-- Strictly prevents a sale in Pharmacy A from referencing a customer in Pharmacy B.
-- Uses ON DELETE RESTRICT to guarantee financial/audit immutability: customers referenced
-- by historical sales CANNOT be deleted (they must be archived/deactivated via status).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_sales_customer_comp' AND conrelid = 'public.sales'::regclass
    ) THEN
        ALTER TABLE public.sales
        ADD CONSTRAINT fk_sales_customer_comp
        FOREIGN KEY (pharmacy_id, customer_id)
        REFERENCES public.customers(pharmacy_id, id)
        ON DELETE RESTRICT;
    END IF;
END $$;

-- Index on sales(pharmacy_id, customer_id) for high-performance customer transaction lookups
CREATE INDEX IF NOT EXISTS idx_sales_pharmacy_customer 
ON public.sales (pharmacy_id, customer_id);

-- 6. AUTOMATED updated_at TRIGGER
CREATE OR REPLACE FUNCTION public.trg_set_customers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.trg_set_customers_updated_at();

-- 7. FORCE ROW LEVEL SECURITY & POLICY HARDENING
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

-- Policy: SELECT
-- Only active members of the pharmacy can query its customers
DROP POLICY IF EXISTS rls_customers_select ON public.customers;
CREATE POLICY rls_customers_select ON public.customers 
FOR SELECT USING (public.is_pharmacy_member(pharmacy_id));

-- Policy: INSERT
-- Staff with 'sales.create' permission (Owner, Manager, Pharmacist, Cashier) can register customers
DROP POLICY IF EXISTS rls_customers_insert ON public.customers;
CREATE POLICY rls_customers_insert ON public.customers 
FOR INSERT WITH CHECK (public.has_pharmacy_permission(pharmacy_id, 'sales.create'));

-- Policy: UPDATE
-- Only management staff (Owner, Manager, Pharmacist) can update existing customer profiles
DROP POLICY IF EXISTS rls_customers_update ON public.customers;
CREATE POLICY rls_customers_update ON public.customers 
FOR UPDATE USING (public.has_pharmacy_sales_management_access(pharmacy_id));

-- Policy: DELETE
-- Only OWNER role can delete customer records
DROP POLICY IF EXISTS rls_customers_delete ON public.customers;
CREATE POLICY rls_customers_delete ON public.customers 
FOR DELETE USING (public.has_pharmacy_role(pharmacy_id, 'OWNER'));
