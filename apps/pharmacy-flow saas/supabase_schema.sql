-- PharmacyFlow Supabase Setup & Sync Script
-- This script contains the complete schema and RLS policies for setting up your Supabase project.

-- ==========================================
-- 0. CLEANUP EXISTING SCHEMA
-- ==========================================
-- Drop existing objects to ensure a clean slate for the UUID schema
DO $$ 
BEGIN
    DROP TABLE IF EXISTS public.sale_items CASCADE;
    DROP TABLE IF EXISTS public.sales CASCADE;
    DROP TABLE IF EXISTS public.products CASCADE;
    DROP TABLE IF EXISTS public.users CASCADE;
    DROP TABLE IF EXISTS public.roles CASCADE;
    DROP TABLE IF EXISTS public.branches CASCADE;
    DROP TABLE IF EXISTS public.pharmacies CASCADE;
    DROP TABLE IF EXISTS public.settings CASCADE;
EXCEPTION
    WHEN undefined_table THEN NULL;
END $$;

-- ==========================================
-- 1. EXTENSIONS & GLOBALS
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Global function to automatically update 'updated_at' columns during any row modification.
-- This is critical for the "only new changes are synced every 15 minutes" logic.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper to check if a user is an admin or store owner based on public.users.
-- Ensures that only authorized admin staff can initiate the sync process in Supabase.
CREATE OR REPLACE FUNCTION is_admin_or_owner()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Assuming auth.uid() maps to a UUID inside public.users
  SELECT role INTO user_role FROM public.users WHERE id = auth.uid() LIMIT 1;
  RETURN user_role IN ('admin', 'store owner', 'store_owner');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 2. TABLE DEFINITIONS (Using UUID data types)
-- ==========================================

CREATE TABLE public.pharmacies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    owner_id UUID NOT NULL,
    tier TEXT DEFAULT 'Personal',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE public.branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    location TEXT,
    phone TEXT,
    active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE public.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    permissions JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    username TEXT UNIQUE,
    password TEXT,
    pin TEXT,
    role TEXT NOT NULL DEFAULT 'cashier',
    active INTEGER DEFAULT 1,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE public.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    alias TEXT,
    category TEXT,
    subcategory TEXT,
    price REAL NOT NULL,
    wholesale_price REAL,
    cost REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 5,
    description TEXT,
    expiry_date TEXT,
    batch_number TEXT,
    model TEXT,
    manufacturer TEXT,
    type TEXT DEFAULT 'product',
    active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE public.sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    receipt_id TEXT UNIQUE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    customer_name TEXT,
    total_amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    account_id UUID,
    split_payments JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE public.sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    original_price REAL,
    serial_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ==========================================
-- 3. INDEXES
-- ==========================================
-- Using IF NOT EXISTS safely covers "already exists" errors

CREATE INDEX IF NOT EXISTS idx_branches_tenant ON public.branches(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON public.users(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON public.products(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_sales_tenant ON public.sales(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);

-- ==========================================
-- 4. TRIGGERS FOR DELTA SYNC
-- ==========================================
-- These triggers update 'updated_at' on every modification, enabling 15-minute sync cycles
-- to perfectly pick up only the changes via 'updated_at > last_sync_time'.

DROP TRIGGER IF EXISTS set_pharmacies_updated_at ON public.pharmacies;
CREATE TRIGGER set_pharmacies_updated_at BEFORE UPDATE ON public.pharmacies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_branches_updated_at ON public.branches;
CREATE TRIGGER set_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_roles_updated_at ON public.roles;
CREATE TRIGGER set_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_users_updated_at ON public.users;
CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_settings_updated_at ON public.settings;
CREATE TRIGGER set_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_products_updated_at ON public.products;
CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_sales_updated_at ON public.sales;
CREATE TRIGGER set_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_sale_items_updated_at ON public.sale_items;
CREATE TRIGGER set_sale_items_updated_at BEFORE UPDATE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ==========================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================
-- Security Implementation: As instructed, non-admin staff should ONLY log in locally.
-- This means Supabase (cloud) access is restricted solely to 'admin' or 'store owner' roles.
-- The local device syncs down via the Admin's token, validating the established architecture.

ALTER TABLE public.pharmacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Admins full access to pharmacies" ON public.pharmacies;
    DROP POLICY IF EXISTS "Admins full access to branches" ON public.branches;
    DROP POLICY IF EXISTS "Admins full access to roles" ON public.roles;
    DROP POLICY IF EXISTS "Admins full access to users" ON public.users;
    DROP POLICY IF EXISTS "Admins full access to settings" ON public.settings;
    DROP POLICY IF EXISTS "Admins full access to products" ON public.products;
    DROP POLICY IF EXISTS "Admins full access to sales" ON public.sales;
    DROP POLICY IF EXISTS "Admins full access to sale items" ON public.sale_items;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Admins and Store Owners have full sync access
CREATE POLICY "Admins full access to pharmacies" ON public.pharmacies
    FOR ALL USING (is_admin_or_owner());
CREATE POLICY "Bootstrap pharmacy" ON public.pharmacies
    FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Admins full access to branches" ON public.branches
    FOR ALL USING (is_admin_or_owner());
CREATE POLICY "Bootstrap branches" ON public.branches
    FOR INSERT WITH CHECK (pharmacy_id IN (SELECT id FROM public.pharmacies WHERE owner_id = auth.uid()));

CREATE POLICY "Admins full access to roles" ON public.roles
    FOR ALL USING (is_admin_or_owner());
CREATE POLICY "Read roles" ON public.roles
    FOR SELECT USING (true);
CREATE POLICY "Bootstrap roles" ON public.roles
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins full access to users" ON public.users
    FOR ALL USING (is_admin_or_owner());
CREATE POLICY "Bootstrap user" ON public.users
    FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "Admins full access to settings" ON public.settings
    FOR ALL USING (is_admin_or_owner());

CREATE POLICY "Admins full access to products" ON public.products
    FOR ALL USING (is_admin_or_owner());

CREATE POLICY "Admins full access to sales" ON public.sales
    FOR ALL USING (is_admin_or_owner());

CREATE POLICY "Admins full access to sale items" ON public.sale_items
    FOR ALL USING (is_admin_or_owner());
