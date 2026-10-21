-- Compatibility bridge for Foundation V1 before sealed M-11 customer management.
-- M-11 uses CREATE TABLE IF NOT EXISTS, so it cannot add these fields when
-- Foundation V1 has already created public.customers.

ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.customers'::regclass
          AND conname = 'chk_customers_status'
    ) THEN
        ALTER TABLE public.customers
            ADD CONSTRAINT chk_customers_status
            CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'));
    END IF;
END $$;
