-- ============================================================================
-- MIGRATION M-1: IDENTITY & SECURITY
-- Target: supabase/migrations/20261004000001_m1_identity_security.sql
-- ============================================================================

-- 1. PRECONDITIONS: Verify auth.users exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
        RAISE EXCEPTION 'Precondition failed: auth.users table missing.';
    END IF;
END $$;

-- 2. OBJECTS CREATED: user_profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    phone_number TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Backfill user_profiles from existing auth.users metadata
INSERT INTO public.user_profiles (id, full_name, phone_number)
SELECT 
    id, 
    COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email),
    raw_user_meta_data->>'phone'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 3. OBJECTS CREATED: platform_admins
CREATE TABLE IF NOT EXISTS public.platform_admins (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    platform_role VARCHAR(32) NOT NULL CHECK (platform_role IN ('SUPER_ADMIN', 'ADMIN', 'SUPPORT')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    notes TEXT
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- 4. FUNCTION: is_platform_admin helper
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_required_role VARCHAR DEFAULT 'SUPPORT')
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.platform_admins
        WHERE user_id = auth.uid()
          AND is_active = TRUE
          AND (
              platform_role = 'SUPER_ADMIN' OR
              (p_required_role = 'ADMIN' AND platform_role IN ('SUPER_ADMIN', 'ADMIN')) OR
              (p_required_role = 'SUPPORT' AND platform_role IN ('SUPER_ADMIN', 'ADMIN', 'SUPPORT'))
          )
    );
END;
$$;

-- RLS: Platform Admins can only view administrative roster
DROP POLICY IF EXISTS rls_platform_admins_select ON public.platform_admins;
CREATE POLICY rls_platform_admins_select ON public.platform_admins
FOR SELECT USING (
    user_id = auth.uid() OR public.is_platform_admin('ADMIN')
);

REVOKE ALL ON public.platform_admins FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.platform_admins FROM authenticated;

-- 5. HARDENING: Re-create handle_new_user with locked search_path & preserved baseline signup
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

    -- 2. Preserve Baseline Pharmacy Creation
    INSERT INTO public.pharmacies (name, owner_id, currency, subscription_plan, subscription_expires_at)
    VALUES (
        v_pharmacy_name, 
        NEW.id, 
        COALESCE(NEW.raw_user_meta_data->>'currency', 'NGN'),
        'TRIAL',
        timezone('utc', now()) + INTERVAL '14 days'
    )
    RETURNING id INTO v_pharmacy_id;

    -- 3. Preserve Baseline Default Branch Creation
    INSERT INTO public.branches (pharmacy_id, name, is_main)
    VALUES (v_pharmacy_id, 'Main Branch', TRUE)
    RETURNING id INTO v_branch_id;

    RETURN NEW;
END;
$$;
