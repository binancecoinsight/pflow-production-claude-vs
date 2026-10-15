-- ============================================================================
-- MIGRATION M-4: DEVICES & CRYPTOGRAPHY (HARDENED TRUST BOUNDARY)
-- Target: supabase/migrations/20261004000004_m4_devices_crypto.sql
-- Dependencies: M-1, M-2, M-3
-- ============================================================================

-- 1. PRECONDITIONS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
        RAISE EXCEPTION 'Precondition failed: public.subscriptions missing.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'devices') THEN
        RAISE EXCEPTION 'Precondition failed: public.devices already exists.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sync_nonces') THEN
        RAISE EXCEPTION 'Precondition failed: public.sync_nonces already exists.';
    END IF;
END $$;

-- 2. OBJECTS CREATED: devices table (Hardware KeyStore P-256 Storage)
CREATE TABLE public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    registered_by UUID NOT NULL REFERENCES auth.users(id),
    device_name VARCHAR(64) NOT NULL,
    platform VARCHAR(32) NOT NULL CHECK (platform IN ('ANDROID', 'WINDOWS', 'WEB', 'IOS')),
    is_hardware_keystore BOOLEAN NOT NULL DEFAULT FALSE,
    public_key_pem TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED', 'DECOMMISSIONED')),
    last_seen_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_device_public_key UNIQUE (pharmacy_id, public_key_pem)
);

CREATE INDEX idx_devices_pharmacy_branch ON public.devices(pharmacy_id, branch_id, status);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- 3. RLS ON devices
CREATE POLICY rls_devices_select ON public.devices
FOR SELECT USING (
    public.is_pharmacy_member(pharmacy_id) OR public.is_platform_admin('ADMIN')
);

CREATE POLICY rls_devices_insert ON public.devices
FOR INSERT WITH CHECK (
    public.has_pharmacy_permission(pharmacy_id, 'device.enroll')
    AND registered_by = auth.uid()
);

CREATE POLICY rls_devices_update ON public.devices
FOR UPDATE USING (
    public.has_pharmacy_permission(pharmacy_id, 'device.block')
    OR public.has_pharmacy_permission(pharmacy_id, 'device.enroll')
);

CREATE POLICY rls_devices_delete ON public.devices
FOR DELETE USING (
    public.has_pharmacy_role(pharmacy_id, 'OWNER')
);

REVOKE INSERT, UPDATE, DELETE ON public.devices FROM anon;

-- 4. OBJECTS CREATED: sync_nonces (Atomic Replay Protection)
CREATE TABLE public.sync_nonces (
    nonce UUID PRIMARY KEY,
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_sync_nonces_timestamp ON public.sync_nonces(created_at);

ALTER TABLE public.sync_nonces ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_sync_nonces_select ON public.sync_nonces
FOR SELECT USING (
    public.is_platform_admin('ADMIN')
);

REVOKE INSERT, UPDATE, DELETE ON public.sync_nonces FROM authenticated, anon, public;

-- 5. FUNCTION: consume_sync_nonce (Hardened with Device Validation)
CREATE OR REPLACE FUNCTION public.consume_sync_nonce(
    p_nonce UUID,
    p_pharmacy_id UUID,
    p_device_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_device_status VARCHAR;
BEGIN
    -- 1. Validate that device exists, belongs to the pharmacy, and is ACTIVE
    SELECT status INTO v_device_status
    FROM public.devices
    WHERE id = p_device_id AND pharmacy_id = p_pharmacy_id;

    IF v_device_status IS NULL OR v_device_status != 'ACTIVE' THEN
        RETURN FALSE;
    END IF;

    -- 2. Attempt atomic insertion of the nonce
    INSERT INTO public.sync_nonces (nonce, pharmacy_id, device_id, created_at)
    VALUES (p_nonce, p_pharmacy_id, p_device_id, timezone('utc', now()))
    ON CONFLICT (nonce) DO NOTHING;

    -- Returns TRUE if inserted (valid first presentation), FALSE if replay
    RETURN FOUND;
END;
$$;

-- 6. STRICT PRIVILEGE BOUNDARY: Revoke client EXECUTE; grant strictly to trusted server role
REVOKE ALL ON FUNCTION public.consume_sync_nonce(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_sync_nonce(UUID, UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.consume_sync_nonce(UUID, UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_sync_nonce(UUID, UUID, UUID) TO service_role;
