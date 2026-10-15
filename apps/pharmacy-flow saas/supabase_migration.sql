-- =======================================================================================
-- SUPABASE MULTI-TENANT MIGRATION SCRIPT
-- Objective: Migrate Pharmacy Flow to a Multi-Tenant SaaS Architecture
-- Features: Tenant Isolation, Tiered Branch Limits, Row Level Security (RLS)
-- =======================================================================================

-- 1. ENUMS FOR TIERS
CREATE TYPE subscription_tier AS ENUM ('Personal', 'Standard', 'Enterprise');

-- 2. TENANT TABLE (Pharmacies)
CREATE TABLE pharmacies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL, -- References auth.users(id) in Supabase
    name TEXT NOT NULL,
    tier subscription_tier DEFAULT 'Personal' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE pharmacies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own pharmacies" 
    ON pharmacies FOR SELECT 
    USING (auth.uid() = owner_id);

-- 3. BRANCHES TABLE
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_main BOOLEAN DEFAULT FALSE,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pharmacy users can view branches" 
    ON branches FOR SELECT 
    USING (pharmacy_id IN (SELECT id FROM pharmacies WHERE owner_id = auth.uid()));

-- 4. BRANCH LIMIT CHECK FUNCTION
-- Subscription tiers: 'Personal' (1 total, 0 extra), 'Standard' (3 total, 2 extra), 'Enterprise' (6 total, 5 extra)
CREATE OR REPLACE FUNCTION check_branch_limit()
RETURNS TRIGGER AS $$
DECLARE
    current_tier subscription_tier;
    branch_count INTEGER;
    max_branches INTEGER;
BEGIN
    -- Get the tier of the pharmacy
    SELECT tier INTO current_tier FROM pharmacies WHERE id = NEW.pharmacy_id;
    
    -- Determine max branches based on tier
    IF current_tier = 'Personal' THEN
        max_branches := 1;
    ELSIF current_tier = 'Standard' THEN
        max_branches := 3;
    ELSIF current_tier = 'Enterprise' THEN
        max_branches := 6;
    ELSE
        max_branches := 1;
    END IF;

    -- Count existing branches for this pharmacy
    SELECT COUNT(*) INTO branch_count FROM branches WHERE pharmacy_id = NEW.pharmacy_id;

    -- Block insertion if limit is reached
    IF branch_count >= max_branches THEN
        RAISE EXCEPTION 'Branch creation limit reached for % tier. Maximum allowed is %.', current_tier, max_branches;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. BRANCH LIMIT TRIGGER
CREATE TRIGGER enforce_branch_limit
    BEFORE INSERT ON branches
    FOR EACH ROW
    EXECUTE FUNCTION check_branch_limit();


-- 6. TRANSACTIONAL TABLES (Tenant & Branch Isolated)

-- Products / Inventory
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT,
    price DECIMAL(10,2) NOT NULL,
    cost DECIMAL(10,2) NOT NULL,
    stock INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers / Accounts
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    total_debt DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sales
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sale Items
CREATE TABLE sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for all transactional tables to isolate tenants
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

-- Dynamic RLS Policies (Ensuring a user only accesses their pharmacy's data)
CREATE POLICY "Tenant isolation for products" ON products 
    FOR ALL USING (pharmacy_id IN (SELECT id FROM pharmacies WHERE owner_id = auth.uid()));

CREATE POLICY "Tenant isolation for customers" ON customers 
    FOR ALL USING (pharmacy_id IN (SELECT id FROM pharmacies WHERE owner_id = auth.uid()));

CREATE POLICY "Tenant isolation for sales" ON sales 
    FOR ALL USING (pharmacy_id IN (SELECT id FROM pharmacies WHERE owner_id = auth.uid()));

CREATE POLICY "Tenant isolation for sale_items" ON sale_items 
    FOR ALL USING (sale_id IN (SELECT id FROM sales WHERE pharmacy_id IN (SELECT id FROM pharmacies WHERE owner_id = auth.uid())));

-- 7. INDEXES FOR PERFORMANCE
CREATE INDEX idx_products_tenant ON products(pharmacy_id, branch_id);
CREATE INDEX idx_customers_tenant ON customers(pharmacy_id, branch_id);
CREATE INDEX idx_sales_tenant ON sales(pharmacy_id, branch_id);
