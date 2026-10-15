-- ==============================================================================
-- MIGRATION M-8: Cashier Self-Only Sales RLS Security Patch
-- ==============================================================================
-- Purpose:
-- Enforces PostgreSQL Row Level Security (RLS) on public.sales and public.sale_items
-- so that users with the CASHIER role are strictly restricted to inspecting only their
-- own transactions (where cashier_id = auth.uid()).
--
-- Authorized management roles (OWNER, MANAGER, PHARMACIST) retain full pharmacy-wide
-- sales visibility across all cashiers and branches within their active pharmacy.
--
-- Defense-in-depth:
-- This closes the database engine authorization gap where previously any active pharmacy
-- member could execute direct PostgREST SELECT queries to read sales from other cashiers.
-- ==============================================================================

-- 1. SECURITY DEFINER HELPER: Pharmacy-wide Sales Management Visibility
CREATE OR REPLACE FUNCTION public.has_pharmacy_sales_management_access(p_pharmacy_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.pharmacy_members
        WHERE user_id = auth.uid()
          AND pharmacy_id = p_pharmacy_id
          AND status = 'ACTIVE'
          AND role IN ('OWNER', 'MANAGER', 'PHARMACIST')
    );
$$;

-- Revoke all privileges from public/anon, grant EXECUTE only to authenticated role
REVOKE ALL ON FUNCTION public.has_pharmacy_sales_management_access(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_pharmacy_sales_management_access(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_pharmacy_sales_management_access(UUID) TO authenticated;

-- 2. COVERING INDEXES FOR RLS PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_sales_pharmacy_cashier 
ON public.sales(pharmacy_id, cashier_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_pharmacy_sale 
ON public.sale_items(pharmacy_id, sale_id);

-- 3. REPLACE SALES SELECT POLICY
-- Strict RLS: Cashiers can only SELECT their own sales (cashier_id = auth.uid()).
-- Management roles (OWNER, MANAGER, PHARMACIST) can SELECT all sales in the pharmacy.
DROP POLICY IF EXISTS rls_sales_select ON public.sales;

CREATE POLICY rls_sales_select
ON public.sales
FOR SELECT
USING (
    public.is_pharmacy_member(pharmacy_id)
    AND (
        public.has_pharmacy_sales_management_access(pharmacy_id)
        OR cashier_id = auth.uid()
    )
);

-- 4. REPLACE SALE_ITEMS SELECT POLICY
-- Strict RLS: Cashiers can only SELECT line items for sales where they were the cashier.
-- Management roles (OWNER, MANAGER, PHARMACIST) can SELECT all line items in the pharmacy.
DROP POLICY IF EXISTS rls_sale_items_select ON public.sale_items;

CREATE POLICY rls_sale_items_select
ON public.sale_items
FOR SELECT
USING (
    public.is_pharmacy_member(pharmacy_id)
    AND (
        public.has_pharmacy_sales_management_access(pharmacy_id)
        OR EXISTS (
            SELECT 1
            FROM public.sales s
            WHERE s.id = sale_items.sale_id
              AND s.pharmacy_id = sale_items.pharmacy_id
              AND s.cashier_id = auth.uid()
        )
    )
);
