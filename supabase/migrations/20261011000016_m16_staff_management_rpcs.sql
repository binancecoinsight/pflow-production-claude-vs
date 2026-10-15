-- ============================================================================
-- MIGRATION M-16: STAFF ROSTER MANAGEMENT, RBAC & ONBOARDING (SEAT-HARDENED CANDIDATE)
-- Target: supabase/migrations/20261008000016_m16_staff_roster_rbac_onboarding.sql
-- Dependencies: Sealed migrations M-1 through M-15
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PRECONDITIONS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pharmacies') THEN
        RAISE EXCEPTION 'Precondition failed: public.pharmacies missing.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pharmacy_members') THEN
        RAISE EXCEPTION 'Precondition failed: public.pharmacy_members missing.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
        RAISE EXCEPTION 'Precondition failed: public.subscriptions missing.' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff_invitations') THEN
        RAISE EXCEPTION 'Precondition failed: public.staff_invitations already exists.' USING ERRCODE = '42P07';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. SCHEMA DDL: public.staff_invitations
-- Note: 'OWNER' role is strictly omitted from invitations (Ownership transfer is deferred)
-- ----------------------------------------------------------------------------
CREATE TABLE public.staff_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('MANAGER', 'PHARMACIST', 'CASHIER')),
    token_hash TEXT NOT NULL,
    invited_by UUID NOT NULL REFERENCES auth.users(id),
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    accepted_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_staff_invitations_email_normalized CHECK (email = lower(trim(email)) AND position('@' in email) >= 2)
);

-- General lookup index
CREATE INDEX idx_staff_invitations_lookup ON public.staff_invitations(pharmacy_id, email, status);
CREATE INDEX idx_staff_invitations_token ON public.staff_invitations(token_hash) WHERE status = 'PENDING';

-- Targeted Partial Functional Unique Index: Exactly one PENDING invitation per (pharmacy_id, normalized email).
-- Strictly enforces normalized email identity at the database level.
-- Historical ACCEPTED, REVOKED, or EXPIRED records do not block future invitations.
CREATE UNIQUE INDEX idx_staff_invitations_pending_email 
ON public.staff_invitations (pharmacy_id, lower(trim(email))) 
WHERE status = 'PENDING';

-- Enable & Force RLS on staff_invitations immediately
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invitations FORCE ROW LEVEL SECURITY;

-- Deny all direct client access (RPC-only access pattern prevents token_hash exposure)
REVOKE ALL ON public.staff_invitations FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. INVARIANT TRIGGERS
-- ----------------------------------------------------------------------------

-- Trigger A: Branch assigned to invitation must belong to the exact pharmacy
CREATE OR REPLACE FUNCTION public.check_staff_invitation_branch_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.branch_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.branches
            WHERE id = NEW.branch_id AND pharmacy_id = NEW.pharmacy_id
        ) THEN
            RAISE EXCEPTION 'Branch % does not belong to pharmacy %', NEW.branch_id, NEW.pharmacy_id
                USING ERRCODE = '23503';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_invitations_branch_tenant ON public.staff_invitations;
CREATE TRIGGER trg_staff_invitations_branch_tenant
BEFORE INSERT OR UPDATE OF branch_id, pharmacy_id ON public.staff_invitations
FOR EACH ROW EXECUTE FUNCTION public.check_staff_invitation_branch_tenant();

-- Trigger B: Prevent pharmacy_id mutation on existing pharmacy_members
CREATE OR REPLACE FUNCTION public.prevent_pharmacy_member_tenant_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.pharmacy_id IS DISTINCT FROM OLD.pharmacy_id THEN
        RAISE EXCEPTION 'pharmacy_id on pharmacy_members is immutable. Cross-tenant transfers must use secure invitation onboarding.'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_member_tenant_mutation ON public.pharmacy_members;
CREATE TRIGGER trg_prevent_member_tenant_mutation
BEFORE UPDATE OF pharmacy_id ON public.pharmacy_members
FOR EACH ROW EXECUTE FUNCTION public.prevent_pharmacy_member_tenant_mutation();

-- Trigger C: Pharmacy-row lock serialization on any active OWNER mutation or deletion
CREATE OR REPLACE FUNCTION public.lock_pharmacy_on_member_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (TG_OP = 'DELETE' AND OLD.role = 'OWNER' AND OLD.status = 'ACTIVE') OR
       (TG_OP = 'UPDATE' AND OLD.role = 'OWNER' AND OLD.status = 'ACTIVE' AND 
        (NEW.role <> 'OWNER' OR NEW.status <> 'ACTIVE')) THEN
        PERFORM id FROM public.pharmacies WHERE id = OLD.pharmacy_id FOR UPDATE;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_pharmacy_on_member_mutation ON public.pharmacy_members;
CREATE TRIGGER trg_lock_pharmacy_on_member_mutation
BEFORE UPDATE OR DELETE ON public.pharmacy_members
FOR EACH ROW EXECUTE FUNCTION public.lock_pharmacy_on_member_mutation();

-- Trigger D: Scoped Last Active Owner Statement-Level Triggers
CREATE OR REPLACE FUNCTION public.check_last_active_owner_statement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r_pharmacy RECORD;
BEGIN
    FOR r_pharmacy IN
        SELECT DISTINCT pharmacy_id FROM (
            SELECT pharmacy_id FROM old_members WHERE role = 'OWNER' AND status = 'ACTIVE'
        ) affected_pharmacies
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.pharmacy_members
            WHERE pharmacy_id = r_pharmacy.pharmacy_id
              AND role = 'OWNER'
              AND status = 'ACTIVE'
        ) THEN
            RAISE EXCEPTION 'Operation would leave pharmacy % without an active OWNER', r_pharmacy.pharmacy_id
                USING ERRCODE = '23514';
        END IF;
    END LOOP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_last_active_owner_update ON public.pharmacy_members;
CREATE TRIGGER trg_enforce_last_active_owner_update
AFTER UPDATE ON public.pharmacy_members
REFERENCING OLD TABLE AS old_members
FOR EACH STATEMENT EXECUTE FUNCTION public.check_last_active_owner_statement();

DROP TRIGGER IF EXISTS trg_enforce_last_active_owner_delete ON public.pharmacy_members;
CREATE TRIGGER trg_enforce_last_active_owner_delete
AFTER DELETE ON public.pharmacy_members
REFERENCING OLD TABLE AS old_members
FOR EACH STATEMENT EXECUTE FUNCTION public.check_last_active_owner_statement();

-- ----------------------------------------------------------------------------
-- 4. PRIVILEGED RPCS WITH CANONICAL LOCK HIERARCHY
-- ----------------------------------------------------------------------------

-- RPC 1: rpc_create_staff_invitation
CREATE OR REPLACE FUNCTION public.rpc_create_staff_invitation(
    p_pharmacy_id UUID,
    p_branch_id UUID,
    p_email TEXT,
    p_role VARCHAR(32)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role VARCHAR(32);
    v_norm_email TEXT;
    v_sub_status VARCHAR(24);
    v_sub_end TIMESTAMPTZ;
    v_max_seats INT;
    v_active_seats INT;
    v_pending_seats INT;
    v_invitation_id UUID;
    v_raw_token TEXT;
    v_token_hash TEXT;
    v_expires_at TIMESTAMPTZ := now() + INTERVAL '7 days';
    r_old_inv RECORD;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_email IS NULL OR trim(p_email) = '' OR position('@' in p_email) < 2 THEN
        RAISE EXCEPTION 'Invalid email address: %', p_email USING ERRCODE = '22023';
    END IF;
    v_norm_email := lower(trim(p_email));

    IF p_role = 'OWNER' THEN
        RAISE EXCEPTION 'Ownership transfer and owner invitations are deferred and prohibited' USING ERRCODE = '0A000';
    END IF;
    IF p_role NOT IN ('MANAGER', 'PHARMACIST', 'CASHIER') THEN
        RAISE EXCEPTION 'Invalid role: %', p_role USING ERRCODE = '22023';
    END IF;

    -- Canonical Lock Order: Level 1 -> public.pharmacies
    PERFORM id FROM public.pharmacies WHERE id = p_pharmacy_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pharmacy % not found', p_pharmacy_id USING ERRCODE = 'P0002';
    END IF;

    -- Verify caller active membership
    SELECT role INTO v_caller_role
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND user_id = v_caller_id AND status = 'ACTIVE';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller lacks active membership in pharmacy %', p_pharmacy_id USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'OWNER' THEN
        NULL;
    ELSIF v_caller_role = 'MANAGER' THEN
        IF p_role NOT IN ('PHARMACIST', 'CASHIER') THEN
            RAISE EXCEPTION 'MANAGER cannot invite role %', p_role USING ERRCODE = '42501';
        END IF;
    ELSE
        RAISE EXCEPTION 'Insufficient permissions to invite staff' USING ERRCODE = '42501';
    END IF;

    -- Canonical Lock Order: Level 2 -> public.branches (if specified)
    IF p_branch_id IS NOT NULL THEN
        PERFORM id FROM public.branches WHERE id = p_branch_id AND pharmacy_id = p_pharmacy_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Branch % does not belong to pharmacy %', p_branch_id, p_pharmacy_id USING ERRCODE = '23503';
        END IF;
    END IF;

    -- Authoritative Subscription & Seat Verification (M-3 Schema)
    -- Explicitly verify subscription eligibility:
    -- TRIAL and ACTIVE are eligible (provided current_period_end > now()).
    -- PAST_DUE, CANCELLED, EXPIRED, or missing subscription rows are strictly ineligible.
    SELECT s.status, s.current_period_end, sp.max_staff
    INTO v_sub_status, v_sub_end, v_max_seats
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.code = s.plan_code
    WHERE s.pharmacy_id = p_pharmacy_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pharmacy lacks a subscription. Invitations require an active subscription.'
            USING ERRCODE = '54000';
    ELSIF v_sub_status NOT IN ('TRIAL', 'ACTIVE') THEN
        RAISE EXCEPTION 'Subscription is ineligible (status: %). Staff invitations require TRIAL or ACTIVE status.'
            , v_sub_status USING ERRCODE = '54000';
    ELSIF v_sub_end IS NULL OR v_sub_end <= now() THEN
        RAISE EXCEPTION 'Subscription period is missing or expired (ended: %). Staff invitations require an active subscription.'
            , v_sub_end USING ERRCODE = '54000';
    ELSIF v_max_seats IS NULL OR v_max_seats < 1 THEN
        RAISE EXCEPTION 'Subscription plan seat quota is invalid (max_staff: %). Staff mutations blocked.'
            , v_max_seats USING ERRCODE = '54000';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.pharmacy_members pm
        JOIN auth.users u ON u.id = pm.user_id
        WHERE pm.pharmacy_id = p_pharmacy_id
          AND pm.status = 'ACTIVE'
          AND lower(trim(u.email)) = v_norm_email
    ) THEN
        RAISE EXCEPTION 'User % is already an active member of this pharmacy', v_norm_email
            USING ERRCODE = '23505';
    END IF;

    -- Canonical Lock Order: Level 3 -> public.staff_invitations (Revoke prior pending for this recipient)
    -- Under pharmacy lock, revoking prior pending invitations for the same recipient frees up their seat reservation
    -- so replacing an invitation at capacity succeeds idempotently without breaching the quota.
    FOR r_old_inv IN
        SELECT id FROM public.staff_invitations
        WHERE pharmacy_id = p_pharmacy_id AND email = v_norm_email AND status = 'PENDING'
        FOR UPDATE
    LOOP
        UPDATE public.staff_invitations
        SET status = 'REVOKED', updated_at = now()
        WHERE id = r_old_inv.id;
    END LOOP;

    SELECT COUNT(*) INTO v_active_seats
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND status = 'ACTIVE';

    SELECT COUNT(*) INTO v_pending_seats
    FROM public.staff_invitations
    WHERE pharmacy_id = p_pharmacy_id AND status = 'PENDING' AND expires_at > now();

    IF (v_active_seats + v_pending_seats + 1) > v_max_seats THEN
        RAISE EXCEPTION 'Pharmacy seat quota (%) exceeded. Current active: %, pending: %',
            v_max_seats, v_active_seats, v_pending_seats
            USING ERRCODE = '54000';
    END IF;

    v_raw_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(sha256(v_raw_token::bytea), 'hex');

    INSERT INTO public.staff_invitations (
        pharmacy_id, branch_id, email, role, token_hash, invited_by, status, expires_at
    ) VALUES (
        p_pharmacy_id, p_branch_id, v_norm_email, p_role, v_token_hash, v_caller_id, 'PENDING', v_expires_at
    )
    RETURNING id INTO v_invitation_id;

    RETURN jsonb_build_object(
        'invitation_id', v_invitation_id,
        'raw_token', v_raw_token,
        'expires_at', v_expires_at,
        'email', v_norm_email,
        'role', p_role
    );
END;
$$;

-- RPC 2: rpc_accept_staff_invitation
CREATE OR REPLACE FUNCTION public.rpc_accept_staff_invitation(
    p_invitation_id UUID,
    p_raw_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_email TEXT;
    v_email_confirmed TIMESTAMPTZ;
    v_computed_hash TEXT;
    v_pharmacy_id UUID;
    v_inv RECORD;
    v_existing_member RECORD;
    v_sub_status VARCHAR(24);
    v_sub_end TIMESTAMPTZ;
    v_max_seats INT;
    v_active_seats INT;
    v_pending_seats INT;
    v_member_id UUID;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT email, email_confirmed_at INTO v_caller_email, v_email_confirmed
    FROM auth.users
    WHERE id = v_caller_id;

    IF v_caller_email IS NULL OR trim(v_caller_email) = '' THEN
        RAISE EXCEPTION 'Authenticated user email is missing or empty' USING ERRCODE = '42501';
    END IF;
    IF v_email_confirmed IS NULL THEN
        RAISE EXCEPTION 'Authenticated email must be confirmed before accepting invitation'
            USING ERRCODE = '42501';
    END IF;

    IF p_raw_token IS NULL OR trim(p_raw_token) = '' THEN
        RAISE EXCEPTION 'Invalid invitation token' USING ERRCODE = '42501';
    END IF;

    v_computed_hash := encode(sha256(p_raw_token::bytea), 'hex');

    -- Non-locking lookup to determine target pharmacy for canonical locking
    SELECT pharmacy_id INTO v_pharmacy_id
    FROM public.staff_invitations
    WHERE id = p_invitation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation % not found', p_invitation_id USING ERRCODE = 'P0002';
    END IF;

    -- Canonical Lock Order: Level 1 -> public.pharmacies
    PERFORM id FROM public.pharmacies WHERE id = v_pharmacy_id FOR UPDATE;

    -- Canonical Lock Order: Level 3 -> public.staff_invitations
    SELECT * INTO v_inv
    FROM public.staff_invitations
    WHERE id = p_invitation_id
    FOR UPDATE;

    -- Recheck state under lock
    IF v_inv.status = 'ACCEPTED' THEN
        RAISE EXCEPTION 'Invitation already accepted' USING ERRCODE = '23505';
    END IF;
    IF v_inv.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Invitation is not pending (status: %)', v_inv.status USING ERRCODE = 'P0002';
    END IF;

    IF v_inv.expires_at <= now() THEN
        -- Persist expired status so subsequent queries and replays reflect EXPIRED state
        UPDATE public.staff_invitations
        SET status = 'EXPIRED', updated_at = now()
        WHERE id = v_inv.id;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invitation has expired',
            'error_code', '22023',
            'invitation_id', v_inv.id,
            'status', 'EXPIRED'
        );
    END IF;

    IF v_inv.token_hash <> v_computed_hash THEN
        RAISE EXCEPTION 'Invalid invitation token' USING ERRCODE = '42501';
    END IF;

    IF lower(trim(v_caller_email)) IS DISTINCT FROM v_inv.email THEN
        RAISE EXCEPTION 'Authenticated caller email does not match invitation recipient'
            USING ERRCODE = '42501';
    END IF;

    IF v_inv.role = 'OWNER' THEN
        RAISE EXCEPTION 'Ownership invitation acceptance is prohibited' USING ERRCODE = '0A000';
    END IF;

    -- Live Subscription & Seat Quota Verification (M-3 Schema)
    SELECT s.status, s.current_period_end, sp.max_staff
    INTO v_sub_status, v_sub_end, v_max_seats
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.code = s.plan_code
    WHERE s.pharmacy_id = v_inv.pharmacy_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pharmacy lacks a subscription. Invitation acceptance requires an active subscription.'
            USING ERRCODE = '54000';
    ELSIF v_sub_status NOT IN ('TRIAL', 'ACTIVE') THEN
        RAISE EXCEPTION 'Subscription is ineligible (status: %). Invitation acceptance requires TRIAL or ACTIVE status.'
            , v_sub_status USING ERRCODE = '54000';
    ELSIF v_sub_end IS NULL OR v_sub_end <= now() THEN
        RAISE EXCEPTION 'Subscription period is missing or expired (ended: %). Staff mutations require an active subscription.'
            , v_sub_end USING ERRCODE = '54000';
    ELSIF v_max_seats IS NULL OR v_max_seats < 1 THEN
        RAISE EXCEPTION 'Subscription plan seat quota is invalid (max_staff: %). Staff mutations blocked.'
            , v_max_seats USING ERRCODE = '54000';
    END IF;

    SELECT COUNT(*) INTO v_active_seats
    FROM public.pharmacy_members
    WHERE pharmacy_id = v_inv.pharmacy_id AND status = 'ACTIVE';

    -- Count other pending, unexpired invitations reserving seats (excluding this invitation being consumed)
    SELECT COUNT(*) INTO v_pending_seats
    FROM public.staff_invitations
    WHERE pharmacy_id = v_inv.pharmacy_id
      AND status = 'PENDING'
      AND expires_at > now()
      AND id <> v_inv.id;

    -- Canonical Lock Order: Level 4 -> public.pharmacy_members
    SELECT id, role, default_branch_id, status INTO v_existing_member
    FROM public.pharmacy_members
    WHERE pharmacy_id = v_inv.pharmacy_id AND user_id = v_caller_id
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing_member.role = 'OWNER' THEN
            RAISE EXCEPTION 'Cannot modify existing OWNER membership via invitation acceptance'
                USING ERRCODE = '42501';
        END IF;

        IF v_existing_member.status = 'SUSPENDED' THEN
            RAISE EXCEPTION 'Member is currently SUSPENDED. Reactivation must use rpc_reactivate_pharmacy_member.'
                USING ERRCODE = '42501';
        END IF;

        IF v_existing_member.status = 'ACTIVE' THEN
            IF v_existing_member.role = v_inv.role AND (v_existing_member.default_branch_id IS NOT DISTINCT FROM v_inv.branch_id) THEN
                v_member_id := v_existing_member.id;
            ELSE
                RAISE EXCEPTION 'Active member already exists with role % and branch %. Role changes must use rpc_change_member_role.',
                    v_existing_member.role, v_existing_member.default_branch_id
                    USING ERRCODE = '23505';
            END IF;
        ELSIF v_existing_member.status = 'INVITED' THEN
            IF (v_active_seats + v_pending_seats + 1) > v_max_seats THEN
                RAISE EXCEPTION 'Pharmacy seat quota (%) exceeded. Current active: %, other pending reservations: %',
                    v_max_seats, v_active_seats, v_pending_seats
                    USING ERRCODE = '54000';
            END IF;

            UPDATE public.pharmacy_members
            SET role = v_inv.role,
                default_branch_id = v_inv.branch_id,
                status = 'ACTIVE',
                updated_at = now()
            WHERE id = v_existing_member.id;
            v_member_id := v_existing_member.id;
        ELSE
            RAISE EXCEPTION 'Unsupported membership status %', v_existing_member.status
                USING ERRCODE = '42501';
        END IF;
    ELSE
        IF (v_active_seats + v_pending_seats + 1) > v_max_seats THEN
            RAISE EXCEPTION 'Pharmacy seat quota (%) exceeded. Current active: %, other pending reservations: %',
                v_max_seats, v_active_seats, v_pending_seats
                USING ERRCODE = '54000';
        END IF;

        INSERT INTO public.pharmacy_members (
            pharmacy_id, user_id, role, default_branch_id, status
        ) VALUES (
            v_inv.pharmacy_id, v_caller_id, v_inv.role, v_inv.branch_id, 'ACTIVE'
        )
        RETURNING id INTO v_member_id;
    END IF;

    UPDATE public.staff_invitations
    SET status = 'ACCEPTED',
        accepted_at = now(),
        accepted_by = v_caller_id,
        updated_at = now()
    WHERE id = v_inv.id;

    RETURN jsonb_build_object(
        'member_id', v_member_id,
        'pharmacy_id', v_inv.pharmacy_id,
        'role', v_inv.role,
        'status', 'ACTIVE'
    );
END;
$$;

-- RPC 3: rpc_revoke_staff_invitation
CREATE OR REPLACE FUNCTION public.rpc_revoke_staff_invitation(
    p_invitation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role VARCHAR(32);
    v_pharmacy_id UUID;
    v_inv RECORD;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT pharmacy_id INTO v_pharmacy_id FROM public.staff_invitations WHERE id = p_invitation_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
    END IF;

    -- Canonical Lock Order: Level 1 -> pharmacies
    PERFORM id FROM public.pharmacies WHERE id = v_pharmacy_id FOR UPDATE;

    SELECT role INTO v_caller_role
    FROM public.pharmacy_members
    WHERE pharmacy_id = v_pharmacy_id AND user_id = v_caller_id AND status = 'ACTIVE';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller lacks active membership in pharmacy %', v_pharmacy_id USING ERRCODE = '42501';
    END IF;

    -- Canonical Lock Order: Level 3 -> staff_invitations
    SELECT * INTO v_inv FROM public.staff_invitations WHERE id = p_invitation_id FOR UPDATE;

    IF v_caller_role = 'OWNER' THEN
        NULL;
    ELSIF v_caller_role = 'MANAGER' THEN
        IF v_inv.role NOT IN ('PHARMACIST', 'CASHIER') THEN
            RAISE EXCEPTION 'MANAGER cannot revoke invitation for role %', v_inv.role USING ERRCODE = '42501';
        END IF;
    ELSE
        RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
    END IF;

    IF v_inv.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Invitation is not in PENDING status' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.staff_invitations
    SET status = 'REVOKED', updated_at = now()
    WHERE id = p_invitation_id;
END;
$$;

-- RPC 4: rpc_change_member_role
CREATE OR REPLACE FUNCTION public.rpc_change_member_role(
    p_pharmacy_id UUID,
    p_target_user_id UUID,
    p_new_role VARCHAR(32)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role VARCHAR(32);
    v_target_role VARCHAR(32);
    v_target_member_id UUID;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_new_role = 'OWNER' THEN
        RAISE EXCEPTION 'Ownership promotion is deferred and prohibited' USING ERRCODE = '0A000';
    END IF;
    IF p_new_role NOT IN ('MANAGER', 'PHARMACIST', 'CASHIER') THEN
        RAISE EXCEPTION 'Invalid role: %', p_new_role USING ERRCODE = '22023';
    END IF;

    PERFORM id FROM public.pharmacies WHERE id = p_pharmacy_id FOR UPDATE;

    SELECT role INTO v_caller_role
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND user_id = v_caller_id AND status = 'ACTIVE';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller lacks active membership in pharmacy %', p_pharmacy_id USING ERRCODE = '42501';
    END IF;

    SELECT id, role INTO v_target_member_id, v_target_role
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND user_id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target member not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_role = 'OWNER' THEN
        NULL;
    ELSIF v_caller_role = 'MANAGER' THEN
        IF p_new_role IN ('OWNER', 'MANAGER') OR v_target_role IN ('OWNER', 'MANAGER') THEN
            RAISE EXCEPTION 'MANAGER cannot assign or modify OWNER or MANAGER roles' USING ERRCODE = '42501';
        END IF;
    ELSE
        RAISE EXCEPTION 'Insufficient permissions to change member role' USING ERRCODE = '42501';
    END IF;

    UPDATE public.pharmacy_members
    SET role = p_new_role, updated_at = now()
    WHERE id = v_target_member_id;
END;
$$;

-- RPC 5: rpc_reactivate_pharmacy_member
CREATE OR REPLACE FUNCTION public.rpc_reactivate_pharmacy_member(
    p_pharmacy_id UUID,
    p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role VARCHAR(32);
    v_target_member RECORD;
    v_sub_status VARCHAR(24);
    v_sub_end TIMESTAMPTZ;
    v_max_seats INT;
    v_active_seats INT;
    v_pending_seats INT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    PERFORM id FROM public.pharmacies WHERE id = p_pharmacy_id FOR UPDATE;

    SELECT role INTO v_caller_role
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND user_id = v_caller_id AND status = 'ACTIVE';

    IF NOT FOUND OR v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
        RAISE EXCEPTION 'Caller must be an active OWNER or MANAGER in pharmacy %', p_pharmacy_id USING ERRCODE = '42501';
    END IF;

    SELECT id, role, status INTO v_target_member
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND user_id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target member not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_role = 'MANAGER' AND v_target_member.role IN ('OWNER', 'MANAGER') THEN
        RAISE EXCEPTION 'MANAGER cannot reactivate OWNER or MANAGER' USING ERRCODE = '42501';
    END IF;

    IF v_target_member.status = 'ACTIVE' THEN
        RETURN;
    END IF;

    -- Live Subscription & Seat Quota Verification (M-3 Schema)
    SELECT s.status, s.current_period_end, sp.max_staff
    INTO v_sub_status, v_sub_end, v_max_seats
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.code = s.plan_code
    WHERE s.pharmacy_id = p_pharmacy_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pharmacy lacks a subscription. Reactivation requires an active subscription.'
            USING ERRCODE = '54000';
    ELSIF v_sub_status NOT IN ('TRIAL', 'ACTIVE') THEN
        RAISE EXCEPTION 'Subscription is ineligible (status: %). Reactivation requires TRIAL or ACTIVE status.'
            , v_sub_status USING ERRCODE = '54000';
    ELSIF v_sub_end IS NULL OR v_sub_end <= now() THEN
        RAISE EXCEPTION 'Subscription period is missing or expired (ended: %). Staff mutations require an active subscription.'
            , v_sub_end USING ERRCODE = '54000';
    ELSIF v_max_seats IS NULL OR v_max_seats < 1 THEN
        RAISE EXCEPTION 'Subscription plan seat quota is invalid (max_staff: %). Staff mutations blocked.'
            , v_max_seats USING ERRCODE = '54000';
    END IF;

    SELECT COUNT(*) INTO v_active_seats
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND status = 'ACTIVE';

    SELECT COUNT(*) INTO v_pending_seats
    FROM public.staff_invitations
    WHERE pharmacy_id = p_pharmacy_id AND status = 'PENDING' AND expires_at > now();

    IF (v_active_seats + v_pending_seats + 1) > v_max_seats THEN
        RAISE EXCEPTION 'Cannot reactivate member: Pharmacy seat quota (%) exceeded. Current active: %, pending: %',
            v_max_seats, v_active_seats, v_pending_seats
            USING ERRCODE = '54000';
    END IF;

    UPDATE public.pharmacy_members
    SET status = 'ACTIVE', updated_at = now()
    WHERE id = v_target_member.id;
END;
$$;

-- RPC 6: rpc_suspend_pharmacy_member
CREATE OR REPLACE FUNCTION public.rpc_suspend_pharmacy_member(
    p_pharmacy_id UUID,
    p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role VARCHAR(32);
    v_target_member RECORD;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    PERFORM id FROM public.pharmacies WHERE id = p_pharmacy_id FOR UPDATE;

    SELECT role INTO v_caller_role
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND user_id = v_caller_id AND status = 'ACTIVE';

    IF NOT FOUND OR v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
        RAISE EXCEPTION 'Caller must be an active OWNER or MANAGER in pharmacy %', p_pharmacy_id USING ERRCODE = '42501';
    END IF;

    SELECT id, role, status INTO v_target_member
    FROM public.pharmacy_members
    WHERE pharmacy_id = p_pharmacy_id AND user_id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target member not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_role = 'MANAGER' AND v_target_member.role IN ('OWNER', 'MANAGER') THEN
        RAISE EXCEPTION 'MANAGER cannot suspend OWNER or MANAGER' USING ERRCODE = '42501';
    END IF;

    UPDATE public.pharmacy_members
    SET status = 'SUSPENDED', updated_at = now()
    WHERE id = v_target_member.id;
END;
$$;

-- RPC 7: rpc_list_staff_invitations (Confidential Non-Secret Listing)
CREATE OR REPLACE FUNCTION public.rpc_list_staff_invitations(
    p_pharmacy_id UUID
)
RETURNS TABLE (
    id UUID,
    pharmacy_id UUID,
    branch_id UUID,
    email TEXT,
    role VARCHAR(32),
    invited_by UUID,
    status VARCHAR(16),
    expires_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role VARCHAR(32);
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT pm.role INTO v_caller_role
    FROM public.pharmacy_members pm
    WHERE pm.pharmacy_id = p_pharmacy_id AND pm.user_id = v_caller_id AND pm.status = 'ACTIVE';

    IF NOT FOUND OR v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
        RAISE EXCEPTION 'Caller must be an active OWNER or MANAGER in pharmacy %', p_pharmacy_id USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT 
        si.id,
        si.pharmacy_id,
        si.branch_id,
        si.email,
        si.role,
        si.invited_by,
        si.status,
        si.expires_at,
        si.accepted_at,
        si.created_at
    FROM public.staff_invitations si
    WHERE si.pharmacy_id = p_pharmacy_id
    ORDER BY si.created_at DESC;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. HARDENED PRIVILEGE ASSIGNMENTS & EXPLICIT REVOCATIONS
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.pharmacy_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pharmacy_members TO authenticated;

REVOKE ALL ON public.staff_invitations FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.rpc_create_staff_invitation(UUID, UUID, TEXT, VARCHAR) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_accept_staff_invitation(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_revoke_staff_invitation(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_change_member_role(UUID, UUID, VARCHAR) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_reactivate_pharmacy_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_suspend_pharmacy_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_list_staff_invitations(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_create_staff_invitation(UUID, UUID, TEXT, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_accept_staff_invitation(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_staff_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_change_member_role(UUID, UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reactivate_pharmacy_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_suspend_pharmacy_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_list_staff_invitations(UUID) TO authenticated;
