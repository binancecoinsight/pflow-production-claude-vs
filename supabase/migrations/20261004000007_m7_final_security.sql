-- ============================================================================
-- MIGRATION M-7: FINAL TENANT INTEGRITY, RLS HARDENING & SECURITY CLOSURE
-- Target: supabase/migrations/20261004000007_m7_final_security.sql
-- Dependencies: M-1 through M-6
-- ============================================================================

-- 1. PRECONDITIONS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sync_journal') THEN
        RAISE EXCEPTION 'Precondition failed: public.sync_journal missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
        RAISE EXCEPTION 'Precondition failed: public.audit_logs missing.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sale_returns') THEN
        RAISE EXCEPTION 'Precondition failed: public.sale_returns already exists.';
    END IF;
END $$;

-- 2. SCHEMA NORMALIZATION & DENORMALIZATION FOR COMPOSITE INTEGRITY
-- A. inventory_batches: add branch_id and backfill deterministically from main branch
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS branch_id UUID;

DO $$
DECLARE
    v_ambiguous_count INT;
BEGIN
    SELECT count(*) INTO v_ambiguous_count
    FROM (
        SELECT ib.pharmacy_id
        FROM public.inventory_batches ib
        LEFT JOIN public.branches b ON ib.pharmacy_id = b.pharmacy_id AND b.is_main = TRUE
        WHERE ib.branch_id IS NULL
        GROUP BY ib.pharmacy_id
        HAVING count(b.id) != 1
    ) sub;

    IF v_ambiguous_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_FAILED: % pharmacies have ambiguous or missing main branches for batch assignment.', v_ambiguous_count;
    END IF;
END $$;

UPDATE public.inventory_batches ib
SET branch_id = b.id
FROM public.branches b
WHERE ib.pharmacy_id = b.pharmacy_id 
  AND b.is_main = TRUE 
  AND ib.branch_id IS NULL;

ALTER TABLE public.inventory_batches ALTER COLUMN branch_id SET NOT NULL;

-- B. sale_items: add pharmacy_id and backfill from parent sales
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS pharmacy_id UUID;

UPDATE public.sale_items si
SET pharmacy_id = s.pharmacy_id
FROM public.sales s
WHERE si.sale_id = s.id AND si.pharmacy_id IS NULL;

ALTER TABLE public.sale_items ALTER COLUMN pharmacy_id SET NOT NULL;

-- C. purchase_items: add pharmacy_id and backfill from parent purchases
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS pharmacy_id UUID;

UPDATE public.purchase_items pi
SET pharmacy_id = p.pharmacy_id
FROM public.purchases p
WHERE pi.purchase_id = p.id AND pi.pharmacy_id IS NULL;

ALTER TABLE public.purchase_items ALTER COLUMN pharmacy_id SET NOT NULL;

-- D. purchases: add branch_id if missing and backfill from main branch
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE public.purchases p
SET branch_id = b.id
FROM public.branches b
WHERE p.pharmacy_id = b.pharmacy_id AND b.is_main = TRUE AND p.branch_id IS NULL;

-- 3. PARENT COMPOSITE UNIQUE CONSTRAINTS
ALTER TABLE public.branches ADD CONSTRAINT uq_branches_pharmacy_id UNIQUE (pharmacy_id, id);
ALTER TABLE public.products ADD CONSTRAINT uq_products_pharmacy_id UNIQUE (pharmacy_id, id);
ALTER TABLE public.sales ADD CONSTRAINT uq_sales_pharmacy_id UNIQUE (pharmacy_id, id);
ALTER TABLE public.purchases ADD CONSTRAINT uq_purchases_pharmacy_id UNIQUE (pharmacy_id, id);
ALTER TABLE public.devices ADD CONSTRAINT uq_devices_pharmacy_id UNIQUE (pharmacy_id, id);
ALTER TABLE public.inventory_batches ADD CONSTRAINT uq_batches_pharmacy_prod_id UNIQUE (pharmacy_id, product_id, id);

-- 4. RETURNS SYSTEM CREATION
CREATE TABLE public.sale_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL,
    original_sale_id UUID NOT NULL,
    refund_amount NUMERIC(12,2) NOT NULL CHECK (refund_amount >= 0),
    refund_payment_method VARCHAR(32) NOT NULL,
    reason TEXT NOT NULL,
    authorized_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_sale_returns_pharmacy_id UNIQUE (pharmacy_id, id)
);

CREATE TABLE public.return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    return_id UUID NOT NULL,
    product_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    restock_to_inventory BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 5. ATOMIC PREFLIGHT VALIDATION GATES (ABORT IF COUNT > 0)
DO $$
DECLARE
    v_count INT;
BEGIN
    -- Preflight 1: inventory_batches -> branches
    SELECT count(*) INTO v_count
    FROM public.inventory_batches ib
    LEFT JOIN public.branches b ON ib.pharmacy_id = b.pharmacy_id AND ib.branch_id = b.id
    WHERE b.id IS NULL;
    IF v_count > 0 THEN RAISE EXCEPTION 'Preflight failed: % batches with invalid branch reference.', v_count; END IF;

    -- Preflight 2: inventory_batches -> products
    SELECT count(*) INTO v_count
    FROM public.inventory_batches ib
    LEFT JOIN public.products p ON ib.pharmacy_id = p.pharmacy_id AND ib.product_id = p.id
    WHERE p.id IS NULL;
    IF v_count > 0 THEN RAISE EXCEPTION 'Preflight failed: % batches with invalid product reference.', v_count; END IF;

    -- Preflight 3: devices -> branches
    SELECT count(*) INTO v_count
    FROM public.devices d
    LEFT JOIN public.branches b ON d.pharmacy_id = b.pharmacy_id AND d.branch_id = b.id
    WHERE b.id IS NULL;
    IF v_count > 0 THEN RAISE EXCEPTION 'Preflight failed: % devices with invalid branch reference.', v_count; END IF;

    -- Preflight 4: pharmacy_members -> branches
    SELECT count(*) INTO v_count
    FROM public.pharmacy_members pm
    LEFT JOIN public.branches b ON pm.pharmacy_id = b.pharmacy_id AND pm.default_branch_id = b.id
    WHERE pm.default_branch_id IS NOT NULL AND b.id IS NULL;
    IF v_count > 0 THEN RAISE EXCEPTION 'Preflight failed: % members with invalid default branch reference.', v_count; END IF;

    -- Preflight 5: sale_items -> sales
    SELECT count(*) INTO v_count
    FROM public.sale_items si
    LEFT JOIN public.sales s ON si.pharmacy_id = s.pharmacy_id AND si.sale_id = s.id
    WHERE s.id IS NULL;
    IF v_count > 0 THEN RAISE EXCEPTION 'Preflight failed: % sale_items with invalid sale reference.', v_count; END IF;

    -- Preflight 6: sale_items -> inventory_batches
    SELECT count(*) INTO v_count
    FROM public.sale_items si
    LEFT JOIN public.inventory_batches ib ON si.pharmacy_id = ib.pharmacy_id AND si.product_id = ib.product_id AND si.batch_id = ib.id
    WHERE ib.id IS NULL;
    IF v_count > 0 THEN RAISE EXCEPTION 'Preflight failed: % sale_items with invalid batch reference.', v_count; END IF;

    -- Preflight 7: purchase_items -> purchases
    SELECT count(*) INTO v_count
    FROM public.purchase_items pi
    LEFT JOIN public.purchases p ON pi.pharmacy_id = p.pharmacy_id AND pi.purchase_id = p.id
    WHERE p.id IS NULL;
    IF v_count > 0 THEN RAISE EXCEPTION 'Preflight failed: % purchase_items with invalid purchase reference.', v_count; END IF;

    -- Preflight 8: purchase_items -> products
    SELECT count(*) INTO v_count
    FROM public.purchase_items pi
    LEFT JOIN public.products pr ON pi.pharmacy_id = pr.pharmacy_id AND pi.product_id = pr.id
    WHERE pr.id IS NULL;
    IF v_count > 0 THEN RAISE EXCEPTION 'Preflight failed: % purchase_items with invalid product reference.', v_count; END IF;
END $$;

-- 6. APPLY ALL 14 COMPOSITE FOREIGN KEYS
ALTER TABLE public.inventory_batches
ADD CONSTRAINT fk_batches_branch_comp
FOREIGN KEY (pharmacy_id, branch_id) REFERENCES public.branches(pharmacy_id, id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_batches
ADD CONSTRAINT fk_batches_product_comp
FOREIGN KEY (pharmacy_id, product_id) REFERENCES public.products(pharmacy_id, id) ON DELETE RESTRICT;

ALTER TABLE public.devices
ADD CONSTRAINT fk_devices_branch_comp
FOREIGN KEY (pharmacy_id, branch_id) REFERENCES public.branches(pharmacy_id, id) ON DELETE RESTRICT;

ALTER TABLE public.pharmacy_members
ADD CONSTRAINT fk_members_branch_comp
FOREIGN KEY (pharmacy_id, default_branch_id) REFERENCES public.branches(pharmacy_id, id) ON DELETE SET NULL;

ALTER TABLE public.sale_items
ADD CONSTRAINT fk_sale_items_sale_comp
FOREIGN KEY (pharmacy_id, sale_id) REFERENCES public.sales(pharmacy_id, id) ON DELETE RESTRICT;

ALTER TABLE public.sale_items
ADD CONSTRAINT fk_sale_items_batch_comp
FOREIGN KEY (pharmacy_id, product_id, batch_id) 
REFERENCES public.inventory_batches(pharmacy_id, product_id, id) ON DELETE RESTRICT;

ALTER TABLE public.purchase_items
ADD CONSTRAINT fk_purchase_items_purch_comp
FOREIGN KEY (pharmacy_id, purchase_id) REFERENCES public.purchases(pharmacy_id, id) ON DELETE CASCADE;

ALTER TABLE public.purchase_items
ADD CONSTRAINT fk_purchase_items_prod_comp
FOREIGN KEY (pharmacy_id, product_id) REFERENCES public.products(pharmacy_id, id) ON DELETE RESTRICT;

ALTER TABLE public.purchases
ADD CONSTRAINT fk_purchases_branch_comp
FOREIGN KEY (pharmacy_id, branch_id) REFERENCES public.branches(pharmacy_id, id) ON DELETE RESTRICT;

ALTER TABLE public.sale_returns
ADD CONSTRAINT fk_returns_branch_comp
FOREIGN KEY (pharmacy_id, branch_id) REFERENCES public.branches(pharmacy_id, id) ON DELETE RESTRICT;

ALTER TABLE public.sale_returns
ADD CONSTRAINT fk_returns_sale_comp
FOREIGN KEY (pharmacy_id, original_sale_id) REFERENCES public.sales(pharmacy_id, id) ON DELETE RESTRICT;

ALTER TABLE public.return_items
ADD CONSTRAINT fk_return_items_return_comp
FOREIGN KEY (pharmacy_id, return_id) REFERENCES public.sale_returns(pharmacy_id, id) ON DELETE CASCADE;

ALTER TABLE public.return_items
ADD CONSTRAINT fk_return_items_batch_comp
FOREIGN KEY (pharmacy_id, product_id, batch_id) 
REFERENCES public.inventory_batches(pharmacy_id, product_id, id) ON DELETE RESTRICT;

-- 7. SALES IMMUTABILITY TRIGGERS
CREATE OR REPLACE FUNCTION public.trg_prevent_sales_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABLE_LOG: Completed sales cannot be updated or deleted. Issue a refund/return instead.'
        USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sales_immutability ON public.sales;
CREATE TRIGGER trg_guard_sales_immutability
BEFORE UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_sales_mutation();

DROP TRIGGER IF EXISTS trg_guard_sale_items_immutability ON public.sale_items;
CREATE TRIGGER trg_guard_sale_items_immutability
BEFORE UPDATE OR DELETE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_sales_mutation();

-- 8. FORCE ROW LEVEL SECURITY & POLICY HARDENING ON ALL TENANT TABLES
-- Force RLS on all 13 baseline tables + returns
ALTER TABLE public.pharmacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_returns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items FORCE ROW LEVEL SECURITY;

-- Products Policies
DROP POLICY IF EXISTS rls_products_select ON public.products;
CREATE POLICY rls_products_select ON public.products FOR SELECT USING (public.is_pharmacy_member(pharmacy_id));
DROP POLICY IF EXISTS rls_products_insert ON public.products;
CREATE POLICY rls_products_insert ON public.products FOR INSERT WITH CHECK (public.has_pharmacy_permission(pharmacy_id, 'inventory.write'));
DROP POLICY IF EXISTS rls_products_update ON public.products;
CREATE POLICY rls_products_update ON public.products FOR UPDATE USING (public.has_pharmacy_permission(pharmacy_id, 'inventory.write'));
DROP POLICY IF EXISTS rls_products_delete ON public.products;
CREATE POLICY rls_products_delete ON public.products FOR DELETE USING (public.has_pharmacy_role(pharmacy_id, 'OWNER'));

-- Inventory Batches Policies
DROP POLICY IF EXISTS rls_batches_select ON public.inventory_batches;
CREATE POLICY rls_batches_select ON public.inventory_batches FOR SELECT USING (public.is_pharmacy_member(pharmacy_id));
DROP POLICY IF EXISTS rls_batches_insert ON public.inventory_batches;
CREATE POLICY rls_batches_insert ON public.inventory_batches FOR INSERT WITH CHECK (public.has_pharmacy_permission(pharmacy_id, 'inventory.write'));
DROP POLICY IF EXISTS rls_batches_update ON public.inventory_batches;
CREATE POLICY rls_batches_update ON public.inventory_batches FOR UPDATE USING (public.has_pharmacy_permission(pharmacy_id, 'inventory.adjust'));
DROP POLICY IF EXISTS rls_batches_delete ON public.inventory_batches;
CREATE POLICY rls_batches_delete ON public.inventory_batches FOR DELETE USING (FALSE);

-- Customers Policies
DROP POLICY IF EXISTS rls_customers_select ON public.customers;
CREATE POLICY rls_customers_select ON public.customers FOR SELECT USING (public.is_pharmacy_member(pharmacy_id));
DROP POLICY IF EXISTS rls_customers_insert ON public.customers;
CREATE POLICY rls_customers_insert ON public.customers FOR INSERT WITH CHECK (public.has_pharmacy_permission(pharmacy_id, 'sales.create'));
DROP POLICY IF EXISTS rls_customers_update ON public.customers;
CREATE POLICY rls_customers_update ON public.customers FOR UPDATE USING (public.has_pharmacy_permission(pharmacy_id, 'sales.create'));
DROP POLICY IF EXISTS rls_customers_delete ON public.customers;
CREATE POLICY rls_customers_delete ON public.customers FOR DELETE USING (public.has_pharmacy_role(pharmacy_id, 'OWNER'));

-- Suppliers Policies
DROP POLICY IF EXISTS rls_suppliers_select ON public.suppliers;
CREATE POLICY rls_suppliers_select ON public.suppliers FOR SELECT USING (public.is_pharmacy_member(pharmacy_id));
DROP POLICY IF EXISTS rls_suppliers_insert ON public.suppliers;
CREATE POLICY rls_suppliers_insert ON public.suppliers FOR INSERT WITH CHECK (public.has_pharmacy_permission(pharmacy_id, 'purchases.manage'));
DROP POLICY IF EXISTS rls_suppliers_update ON public.suppliers;
CREATE POLICY rls_suppliers_update ON public.suppliers FOR UPDATE USING (public.has_pharmacy_permission(pharmacy_id, 'purchases.manage'));
DROP POLICY IF EXISTS rls_suppliers_delete ON public.suppliers;
CREATE POLICY rls_suppliers_delete ON public.suppliers FOR DELETE USING (public.has_pharmacy_role(pharmacy_id, 'OWNER'));

-- Staff Policies
DROP POLICY IF EXISTS rls_staff_select ON public.staff;
CREATE POLICY rls_staff_select ON public.staff FOR SELECT USING (public.has_pharmacy_permission(pharmacy_id, 'staff.read'));
DROP POLICY IF EXISTS rls_staff_insert ON public.staff;
CREATE POLICY rls_staff_insert ON public.staff FOR INSERT WITH CHECK (public.has_pharmacy_permission(pharmacy_id, 'staff.manage'));
DROP POLICY IF EXISTS rls_staff_update ON public.staff;
CREATE POLICY rls_staff_update ON public.staff FOR UPDATE USING (public.has_pharmacy_permission(pharmacy_id, 'staff.manage'));
DROP POLICY IF EXISTS rls_staff_delete ON public.staff;
CREATE POLICY rls_staff_delete ON public.staff FOR DELETE USING (public.has_pharmacy_role(pharmacy_id, 'OWNER'));

-- Sales Policies
DROP POLICY IF EXISTS rls_sales_select ON public.sales;
CREATE POLICY rls_sales_select ON public.sales FOR SELECT USING (public.is_pharmacy_member(pharmacy_id));
DROP POLICY IF EXISTS rls_sales_insert ON public.sales;
CREATE POLICY rls_sales_insert ON public.sales FOR INSERT WITH CHECK (public.has_pharmacy_permission(pharmacy_id, 'sales.create'));
DROP POLICY IF EXISTS rls_sales_update ON public.sales;
CREATE POLICY rls_sales_update ON public.sales FOR UPDATE USING (FALSE);
DROP POLICY IF EXISTS rls_sales_delete ON public.sales;
CREATE POLICY rls_sales_delete ON public.sales FOR DELETE USING (FALSE);

-- Sale Items Policies
DROP POLICY IF EXISTS rls_sale_items_select ON public.sale_items;
CREATE POLICY rls_sale_items_select ON public.sale_items FOR SELECT USING (public.is_pharmacy_member(pharmacy_id));
DROP POLICY IF EXISTS rls_sale_items_insert ON public.sale_items;
CREATE POLICY rls_sale_items_insert ON public.sale_items FOR INSERT WITH CHECK (public.has_pharmacy_permission(pharmacy_id, 'sales.create'));
DROP POLICY IF EXISTS rls_sale_items_update ON public.sale_items;
CREATE POLICY rls_sale_items_update ON public.sale_items FOR UPDATE USING (FALSE);
DROP POLICY IF EXISTS rls_sale_items_delete ON public.sale_items;
CREATE POLICY rls_sale_items_delete ON public.sale_items FOR DELETE USING (FALSE);

-- Purchases Policies
DROP POLICY IF EXISTS rls_purchases_select ON public.purchases;
CREATE POLICY rls_purchases_select ON public.purchases FOR SELECT USING (public.is_pharmacy_member(pharmacy_id));
DROP POLICY IF EXISTS rls_purchases_insert ON public.purchases;
CREATE POLICY rls_purchases_insert ON public.purchases FOR INSERT WITH CHECK (public.has_pharmacy_permission(pharmacy_id, 'purchases.manage'));
DROP POLICY IF EXISTS rls_purchases_update ON public.purchases;
CREATE POLICY rls_purchases_update ON public.purchases FOR UPDATE USING (public.has_pharmacy_permission(pharmacy_id, 'purchases.manage'));
DROP POLICY IF EXISTS rls_purchases_delete ON public.purchases;
CREATE POLICY rls_purchases_delete ON public.purchases FOR DELETE USING (public.has_pharmacy_role(pharmacy_id, 'OWNER'));

-- Purchase Items Policies
DROP POLICY IF EXISTS rls_purchase_items_select ON public.purchase_items;
CREATE POLICY rls_purchase_items_select ON public.purchase_items FOR SELECT USING (public.is_pharmacy_member(pharmacy_id));
DROP POLICY IF EXISTS rls_purchase_items_insert ON public.purchase_items;
CREATE POLICY rls_purchase_items_insert ON public.purchase_items FOR INSERT WITH CHECK (public.has_pharmacy_permission(pharmacy_id, 'purchases.manage'));
DROP POLICY IF EXISTS rls_purchase_items_update ON public.purchase_items;
CREATE POLICY rls_purchase_items_update ON public.purchase_items FOR UPDATE USING (public.has_pharmacy_permission(pharmacy_id, 'purchases.manage'));
DROP POLICY IF EXISTS rls_purchase_items_delete ON public.purchase_items;
CREATE POLICY rls_purchase_items_delete ON public.purchase_items FOR DELETE USING (FALSE);

-- Expenses Policies
DROP POLICY IF EXISTS rls_expenses_select ON public.expenses;
CREATE POLICY rls_expenses_select ON public.expenses FOR SELECT USING (public.has_pharmacy_permission(pharmacy_id, 'expenses.read'));
DROP POLICY IF EXISTS rls_expenses_insert ON public.expenses;
CREATE POLICY rls_expenses_insert ON public.expenses FOR INSERT WITH CHECK (public.has_pharmacy_permission(pharmacy_id, 'expenses.create'));
DROP POLICY IF EXISTS rls_expenses_update ON public.expenses;
CREATE POLICY rls_expenses_update ON public.expenses FOR UPDATE USING (public.has_pharmacy_permission(pharmacy_id, 'expenses.approve'));
DROP POLICY IF EXISTS rls_expenses_delete ON public.expenses;
CREATE POLICY rls_expenses_delete ON public.expenses FOR DELETE USING (public.has_pharmacy_role(pharmacy_id, 'OWNER'));

-- Legacy sync_queue Policies (Preserving frontend background worker compatibility)
DROP POLICY IF EXISTS rls_sync_queue_select ON public.sync_queue;
CREATE POLICY rls_sync_queue_select ON public.sync_queue 
FOR SELECT USING (public.has_pharmacy_role(pharmacy_id, 'OWNER') OR public.has_pharmacy_role(pharmacy_id, 'MANAGER'));
DROP POLICY IF EXISTS rls_sync_queue_insert ON public.sync_queue;
CREATE POLICY rls_sync_queue_insert ON public.sync_queue 
FOR INSERT WITH CHECK (public.is_pharmacy_member(pharmacy_id));
DROP POLICY IF EXISTS rls_sync_queue_update ON public.sync_queue;
CREATE POLICY rls_sync_queue_update ON public.sync_queue FOR UPDATE USING (FALSE);
DROP POLICY IF EXISTS rls_sync_queue_delete ON public.sync_queue;
CREATE POLICY rls_sync_queue_delete ON public.sync_queue FOR DELETE USING (FALSE);

-- Sale Returns Policies
DROP POLICY IF EXISTS rls_sale_returns_select ON public.sale_returns;
CREATE POLICY rls_sale_returns_select ON public.sale_returns FOR SELECT USING (public.is_pharmacy_member(pharmacy_id));
DROP POLICY IF EXISTS rls_sale_returns_insert ON public.sale_returns;
CREATE POLICY rls_sale_returns_insert ON public.sale_returns 
FOR INSERT WITH CHECK (
    public.is_pharmacy_member(pharmacy_id) 
    AND public.has_pharmacy_permission(pharmacy_id, 'sales.refund')
    AND authorized_by = auth.uid()
);
DROP POLICY IF EXISTS rls_sale_returns_update ON public.sale_returns;
CREATE POLICY rls_sale_returns_update ON public.sale_returns FOR UPDATE USING (FALSE);
DROP POLICY IF EXISTS rls_sale_returns_delete ON public.sale_returns;
CREATE POLICY rls_sale_returns_delete ON public.sale_returns FOR DELETE USING (FALSE);

-- Return Items Policies
DROP POLICY IF EXISTS rls_return_items_select ON public.return_items;
CREATE POLICY rls_return_items_select ON public.return_items FOR SELECT USING (public.is_pharmacy_member(pharmacy_id));
DROP POLICY IF EXISTS rls_return_items_insert ON public.return_items;
CREATE POLICY rls_return_items_insert ON public.return_items 
FOR INSERT WITH CHECK (
    public.is_pharmacy_member(pharmacy_id) 
    AND public.has_pharmacy_permission(pharmacy_id, 'sales.refund')
);
DROP POLICY IF EXISTS rls_return_items_update ON public.return_items;
CREATE POLICY rls_return_items_update ON public.return_items FOR UPDATE USING (FALSE);
DROP POLICY IF EXISTS rls_return_items_delete ON public.return_items;
CREATE POLICY rls_return_items_delete ON public.return_items FOR DELETE USING (FALSE);
