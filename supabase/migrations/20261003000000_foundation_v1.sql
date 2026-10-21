-- PharmacyFlow Foundation V1 (UNEXECUTED)
-- Clean-install prerequisite for sealed migrations M-1 through M-16.
-- This file intentionally remains outside supabase/migrations and must only be
-- applied after separate owner approval in a disposable environment.
-- Excluded migration-owned objects: M-1 profiles/bootstrap function; M-2
-- memberships/roles/staff.user_id; M-3 subscriptions; M-4 devices/nonces;
-- M-5 ledger; M-6 journal/audit; M-7 RLS/composite integrity; M-11 customers
-- lifecycle; M-12 tender/register; M-13 through M-16 inventory/staff features.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.pharmacies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN' CHECK (currency ~ '^[A-Z]{3}$'),
    subscription_plan VARCHAR(32) NOT NULL DEFAULT 'TRIAL',
    subscription_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_pharmacies_owner_id ON public.pharmacies(owner_id) WHERE owner_id IS NOT NULL;

CREATE TABLE public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    address TEXT,
    phone TEXT,
    is_main BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_branches_pharmacy_id ON public.branches(pharmacy_id);

CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    sku TEXT,
    barcode TEXT,
    category TEXT,
    description TEXT,
    unit VARCHAR(32) NOT NULL DEFAULT 'UNIT',
    selling_price BIGINT NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
    reorder_level INT NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX uq_products_pharmacy_sku_nonnull ON public.products(pharmacy_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_products_pharmacy_name ON public.products(pharmacy_id, name);
CREATE INDEX idx_products_pharmacy_barcode ON public.products(pharmacy_id, barcode) WHERE barcode IS NOT NULL;

CREATE TABLE public.inventory_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    batch_number TEXT NOT NULL CHECK (length(trim(batch_number)) > 0),
    quantity INT NOT NULL DEFAULT 0,
    cost_price BIGINT NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    selling_price BIGINT NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
    expiry_date DATE,
    received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_inventory_batches_pharmacy_product ON public.inventory_batches(pharmacy_id, product_id);
CREATE INDEX idx_inventory_batches_pharmacy_expiry ON public.inventory_batches(pharmacy_id, expiry_date);

CREATE TABLE public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    phone TEXT, email TEXT, address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_suppliers_pharmacy_name ON public.suppliers(pharmacy_id, name);

CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    phone TEXT, email TEXT, address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_customers_pharmacy_name ON public.customers(pharmacy_id, name);

CREATE TABLE public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    cashier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    customer_id UUID,
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN' CHECK (currency ~ '^[A-Z]{3}$'),
    subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
    discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
    tax BIGINT NOT NULL DEFAULT 0 CHECK (tax >= 0),
    total BIGINT NOT NULL CHECK (total >= 0),
    payment_method VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_sales_pharmacy_created_at ON public.sales(pharmacy_id, created_at DESC);
CREATE INDEX idx_sales_branch_created_at ON public.sales(branch_id, created_at DESC);

CREATE TABLE public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price BIGINT NOT NULL CHECK (unit_price >= 0),
    discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
    tax BIGINT NOT NULL DEFAULT 0 CHECK (tax >= 0),
    total BIGINT NOT NULL CHECK (total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX idx_sale_items_batch_id ON public.sale_items(batch_id);

CREATE TABLE public.purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    reference_number TEXT,
    total_cost BIGINT NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
    status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_purchases_pharmacy_purchased_at ON public.purchases(pharmacy_id, purchased_at DESC);
CREATE INDEX idx_purchases_supplier_id ON public.purchases(supplier_id) WHERE supplier_id IS NOT NULL;

CREATE TABLE public.purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0),
    total_cost BIGINT NOT NULL CHECK (total_cost >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_purchase_items_purchase_id ON public.purchase_items(purchase_id);

-- Inactive compatibility tables; no operational workflow is defined here.
CREATE TABLE public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE
);
CREATE TABLE public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE
);
CREATE TABLE public.sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE
);
CREATE INDEX idx_staff_pharmacy_id ON public.staff(pharmacy_id);
CREATE INDEX idx_expenses_pharmacy_id ON public.expenses(pharmacy_id);
CREATE INDEX idx_sync_queue_pharmacy_id ON public.sync_queue(pharmacy_id);

-- Required clean-install preflight before running sealed migrations:
-- exactly one main branch per pharmacy; internally consistent tenant references;
-- no pre-created M-1 through M-16 objects beyond these prerequisites.
