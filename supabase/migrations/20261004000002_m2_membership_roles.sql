-- ============================================================================
-- MIGRATION M-2: PHARMACY MEMBERSHIP & ROLES (HARDENED RLS - NO RECURSION)
-- Target: supabase/migrations/20261004000002_m2_membership_roles.sql
-- Dependencies: M-1
-- ============================================================================

-- 1. PRECONDITIONS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
        RAISE EXCEPTION 'Precondition failed: public.user_profiles missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_admins') THEN
        RAISE EXCEPTION 'Precondition failed: public.platform_admins missing.';
    END IF;
END $$;

-- 2. OBJECTS CREATED: role_permissions table
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role VARCHAR(32) NOT NULL,
    permission VARCHAR(64) NOT NULL,
    PRIMARY KEY (role, permission)
);

-- Seed Explicit Permissions Matrix (37 approved permission pairs)
INSERT INTO public.role_permissions (role, permission) VALUES
    ('OWNER', 'inventory.read'), ('OWNER', 'inventory.write'), ('OWNER', 'inventory.adjust'),
    ('OWNER', 'sales.read'), ('OWNER', 'sales.create'), ('OWNER', 'sales.refund'),
    ('OWNER', 'purchases.manage'), ('OWNER', 'expenses.read'), ('OWNER', 'expenses.create'),
    ('OWNER', 'expenses.approve'), ('OWNER', 'staff.read'), ('OWNER', 'staff.manage'),
    ('OWNER', 'reports.read'), ('OWNER', 'reports.financial'), ('OWNER', 'settings.manage'),
    ('OWNER', 'device.enroll'), ('OWNER', 'device.block'), ('OWNER', 'subscription.read'),
    
    ('MANAGER', 'inventory.read'), ('MANAGER', 'inventory.write'), ('MANAGER', 'inventory.adjust'),
    ('MANAGER', 'sales.read'), ('MANAGER', 'sales.create'), ('MANAGER', 'sales.refund'),
    ('MANAGER', 'purchases.manage'), ('MANAGER', 'expenses.read'), ('MANAGER', 'expenses.create'),
    ('MANAGER', 'expenses.approve'), ('MANAGER', 'staff.read'), ('MANAGER', 'staff.manage'),
    ('MANAGER', 'reports.read'), ('MANAGER', 'settings.manage'), ('MANAGER', 'device.enroll'),
    ('MANAGER', 'device.block'),
    
    ('PHARMACIST', 'inventory.read'), ('PHARMACIST', 'inventory.write'),
    ('PHARMACIST', 'sales.read'), ('PHARMACIST', 'sales.create'),
    ('PHARMACIST', 'purchases.manage'), ('PHARMACIST', 'reports.read'),
    
    ('CASHIER', 'inventory.read'), ('CASHIER', 'sales.read'),
    ('CASHIER', 'sales.create'), ('CASHIER', 'expenses.create')
ON CONFLICT DO NOTHING;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_role_permissions_select ON public.role_permissions;
CREATE POLICY rls_role_permissions_select ON public.role_permissions FOR SELECT USING (TRUE);
REVOKE INSERT, UPDATE, DELETE ON public.role_permissions FROM authenticated, anon, public;

-- 3. OBJECTS CREATED: pharmacy_members
CREATE TABLE IF NOT EXISTS public.pharmacy_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'PHARMACIST', 'CASHIER')),
    default_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INVITED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_pharmacy_member_user UNIQUE (user_id, pharmacy_id)
);

CREATE INDEX IF NOT EXISTS idx_members_user_pharmacy 
ON public.pharmacy_members(user_id, pharmacy_id, status);

-- 4. CONTEXT FUNCTIONS (SECURITY DEFINER WITH FIXED search_path - ENABLES RECURSION-FREE RLS)
CREATE OR REPLACE FUNCTION public.is_pharmacy_member(p_pharmacy_id UUID)
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
    );
$$;

CREATE OR REPLACE FUNCTION public.has_pharmacy_role(p_pharmacy_id UUID, p_required_role VARCHAR)
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
          AND role = p_required_role
    );
$$;

CREATE OR REPLACE FUNCTION public.has_pharmacy_permission(p_pharmacy_id UUID, p_permission VARCHAR)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.pharmacy_members pm
        JOIN public.role_permissions rp ON pm.role = rp.role
        WHERE pm.user_id = auth.uid() 
          AND pm.pharmacy_id = p_pharmacy_id 
          AND pm.status = 'ACTIVE'
          AND rp.permission = p_permission
    );
$$;

CREATE OR REPLACE FUNCTION public.get_user_pharmacy_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT pharmacy_id
    FROM public.pharmacy_members
    WHERE user_id = auth.uid()
      AND status = 'ACTIVE';
$$;

GRANT EXECUTE ON FUNCTION public.is_pharmacy_member TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pharmacy_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pharmacy_permission TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_pharmacy_ids TO authenticated;

-- 5. RECURSION-FREE RLS POLICIES ON pharmacy_members
-- Policies use SECURITY DEFINER helper functions to eliminate self-referential subquery recursion
ALTER TABLE public.pharmacy_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_pharmacy_members_select ON public.pharmacy_members;
CREATE POLICY rls_pharmacy_members_select ON public.pharmacy_members
FOR SELECT USING (
    public.is_pharmacy_member(pharmacy_id) 
    OR public.is_platform_admin('ADMIN')
);

-- Only active OWNER of the specific pharmacy can insert memberships
DROP POLICY IF EXISTS rls_pharmacy_members_insert ON public.pharmacy_members;
CREATE POLICY rls_pharmacy_members_insert ON public.pharmacy_members
FOR INSERT WITH CHECK (
    public.has_pharmacy_role(pharmacy_id, 'OWNER')
);

-- Only active OWNER of the specific pharmacy can update memberships (anti-self-promotion shield)
DROP POLICY IF EXISTS rls_pharmacy_members_update ON public.pharmacy_members;
CREATE POLICY rls_pharmacy_members_update ON public.pharmacy_members
FOR UPDATE USING (
    public.has_pharmacy_role(pharmacy_id, 'OWNER')
);

-- Only active OWNER of the specific pharmacy can delete memberships
DROP POLICY IF EXISTS rls_pharmacy_members_delete ON public.pharmacy_members;
CREATE POLICY rls_pharmacy_members_delete ON public.pharmacy_members
FOR DELETE USING (
    public.has_pharmacy_role(pharmacy_id, 'OWNER')
);

REVOKE INSERT, UPDATE, DELETE ON public.pharmacy_members FROM anon;

-- 6. LINKAGE: Add user_id column to staff
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_user_link ON public.staff(user_id) WHERE user_id IS NOT NULL;

-- 7. DATA BACKFILL: Populate OWNER memberships for existing pharmacy owners
INSERT INTO public.pharmacy_members (user_id, pharmacy_id, role, default_branch_id, status)
SELECT 
    p.owner_id, 
    p.id, 
    'OWNER', 
    (SELECT b.id FROM public.branches b WHERE b.pharmacy_id = p.id AND b.is_main = TRUE LIMIT 1),
    'ACTIVE'
FROM public.pharmacies p
WHERE p.owner_id IS NOT NULL
ON CONFLICT (user_id, pharmacy_id) DO NOTHING;

-- 8. UPGRADE: handle_new_user to automatically bind OWNER membership
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pharmacy_id UUID;
    v_branch_id UUID;
    v_user_name TEXT;
    v_pharmacy_name TEXT;
BEGIN
    v_user_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email);
    v_pharmacy_name := COALESCE(NEW.raw_user_meta_data->>'pharmacy_name', 'My Pharmacy');

    -- 1. Create User Profile
    INSERT INTO public.user_profiles (id, full_name, phone_number)
    VALUES (NEW.id, v_user_name, NEW.raw_user_meta_data->>'phone')
    ON CONFLICT (id) DO UPDATE 
    SET full_name = EXCLUDED.full_name,
        updated_at = timezone('utc', now());

    -- 2. Create Pharmacy
    INSERT INTO public.pharmacies (name, owner_id, currency, subscription_plan, subscription_expires_at)
    VALUES (
        v_pharmacy_name, 
        NEW.id, 
        COALESCE(NEW.raw_user_meta_data->>'currency', 'NGN'),
        'TRIAL',
        timezone('utc', now()) + INTERVAL '14 days'
    )
    RETURNING id INTO v_pharmacy_id;

    -- 3. Create Default Main Branch
    INSERT INTO public.branches (pharmacy_id, name, is_main)
    VALUES (v_pharmacy_id, 'Main Branch', TRUE)
    RETURNING id INTO v_branch_id;

    -- 4. Create Owner Membership (Finalized Authorization Binding)
    INSERT INTO public.pharmacy_members (user_id, pharmacy_id, role, default_branch_id, status)
    VALUES (NEW.id, v_pharmacy_id, 'OWNER', v_branch_id, 'ACTIVE');

    RETURN NEW;
END;
$$;
