-- ============================================================================
-- MIGRATION M-3: BILLING & SUBSCRIPTIONS
-- Target: supabase/migrations/20261004000003_m3_billing_subscriptions.sql
-- Dependencies: M-1, M-2
-- ============================================================================

-- 1. PRECONDITIONS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pharmacy_members') THEN
        RAISE EXCEPTION 'Precondition failed: public.pharmacy_members missing.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscription_plans') THEN
        RAISE EXCEPTION 'Precondition failed: public.subscription_plans already exists.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
        RAISE EXCEPTION 'Precondition failed: public.subscriptions already exists.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
        RAISE EXCEPTION 'Precondition failed: public.payments already exists.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_events') THEN
        RAISE EXCEPTION 'Precondition failed: public.payment_events already exists.';
    END IF;
END $$;

-- 2. OBJECTS CREATED: subscription_plans
CREATE TABLE public.subscription_plans (
    code VARCHAR(32) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    max_branches INT NOT NULL DEFAULT 1,
    max_staff INT NOT NULL DEFAULT 3,
    monthly_price_ngn NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    monthly_price_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO public.subscription_plans (code, name, max_branches, max_staff) VALUES
    ('TRIAL', '14-Day Free Trial', 1, 3),
    ('STARTER', 'Starter Tier', 1, 5),
    ('PROFESSIONAL', 'Professional Tier', 3, 15),
    ('ENTERPRISE', 'Enterprise Tier', 10, 50)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_subscription_plans_select ON public.subscription_plans FOR SELECT USING (TRUE);
REVOKE INSERT, UPDATE, DELETE ON public.subscription_plans FROM authenticated, anon, public;

-- 3. OBJECTS CREATED: subscriptions
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    plan_code VARCHAR(32) NOT NULL REFERENCES public.subscription_plans(code),
    status VARCHAR(24) NOT NULL CHECK (status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED')),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    current_period_end TIMESTAMPTZ NOT NULL,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_pharmacy_subscription UNIQUE (pharmacy_id),
    CONSTRAINT uq_subscriptions_pharmacy_id UNIQUE (pharmacy_id, id)
);

CREATE INDEX idx_subscriptions_pharmacy ON public.subscriptions(pharmacy_id, status);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. OBJECTS CREATED: payments
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(4) NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES')),
    payment_method VARCHAR(32) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    provider_transaction_id TEXT NOT NULL,
    status VARCHAR(24) NOT NULL CHECK (status IN ('PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_provider_tx UNIQUE (provider, provider_transaction_id),
    CONSTRAINT fk_payments_subscription_comp FOREIGN KEY (pharmacy_id, subscription_id) 
        REFERENCES public.subscriptions(pharmacy_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_payments_pharmacy_sub ON public.payments(pharmacy_id, subscription_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 5. OBJECTS CREATED: payment_events (Webhook Idempotency)
CREATE TABLE public.payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(32) NOT NULL,
    event_id TEXT NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_payment_event UNIQUE (provider, event_id)
);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- 6. DATA BACKFILL: Approved Stakeholder Mapping
INSERT INTO public.subscriptions (
    pharmacy_id, plan_code, status, current_period_start, current_period_end
)
SELECT 
    p.id,
    -- Approved Plan Code Resolution
    CASE 
        WHEN upper(trim(p.subscription_plan)) = 'PRO_ANNUAL' THEN 'PROFESSIONAL'
        WHEN upper(trim(p.subscription_plan)) = 'BASIC' THEN 'STARTER'
        WHEN upper(trim(COALESCE(p.subscription_plan, ''))) IN ('TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE') 
            THEN upper(trim(p.subscription_plan))
        ELSE 'TRIAL'
    END AS plan_code,
    -- Approved Status Resolution
    CASE 
        WHEN p.subscription_expires_at IS NOT NULL AND p.subscription_expires_at > timezone('utc', now()) THEN 'ACTIVE'
        ELSE 'EXPIRED'
    END AS status,
    p.created_at AS current_period_start,
    -- Expiry Preservation
    COALESCE(p.subscription_expires_at, p.created_at + INTERVAL '14 days') AS current_period_end
FROM public.pharmacies p
ON CONFLICT (pharmacy_id) DO NOTHING;

-- 7. RLS POLICIES & PRIVILEGE LOCKDOWN
-- Subscriptions SELECT: tenant members can read their own pharmacy's subscription
CREATE POLICY rls_subscriptions_select ON public.subscriptions
FOR SELECT USING (
    public.is_pharmacy_member(pharmacy_id) OR public.is_platform_admin('ADMIN')
);

-- Payments SELECT: tenant members can read their own pharmacy's payments
CREATE POLICY rls_payments_select ON public.payments
FOR SELECT USING (
    public.is_pharmacy_member(pharmacy_id) OR public.is_platform_admin('ADMIN')
);

-- Payment Events SELECT: platform admins only
CREATE POLICY rls_payment_events_select ON public.payment_events
FOR SELECT USING (
    public.is_platform_admin('ADMIN')
);

-- Revoke mutation privileges from client roles
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated, anon, public;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated, anon, public;
REVOKE INSERT, UPDATE, DELETE ON public.payment_events FROM authenticated, anon, public;

-- 8. HELPER FUNCTION: is_subscription_active
CREATE OR REPLACE FUNCTION public.is_subscription_active(p_pharmacy_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.subscriptions
        WHERE pharmacy_id = p_pharmacy_id
          AND status IN ('ACTIVE', 'TRIAL')
          AND current_period_end > timezone('utc', now())
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_subscription_active TO authenticated;
