-- PharmacyFlow post-sealed registration and tenant RLS (UNEXECUTED).
-- Apply only after M-1 through M-16 in an approved disposable environment.
-- Runtime behavior, function ownership, FORCE RLS, and Supabase Auth trigger
-- privileges require staging verification before this is used anywhere else.

-- Reuse the final M-2 bootstrap function. No second tenant bootstrap exists.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- At most one main branch per pharmacy. This supports M-7's deterministic
-- backfill and is safe for branch creation after the sealed chain.
CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_one_main_per_pharmacy
ON public.branches(pharmacy_id) WHERE is_main;

-- Branch access follows the approved single-default-branch model. Owners and
-- managers may administer branches, but non-management members only see/use
-- their default branch. SECURITY DEFINER helpers avoid RLS recursion.
CREATE OR REPLACE FUNCTION public.has_branch_access(
    p_pharmacy_id UUID,
    p_branch_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.pharmacy_members pm
        WHERE pm.user_id = auth.uid()
          AND pm.pharmacy_id = p_pharmacy_id
          AND pm.status = 'ACTIVE'
          AND (
              pm.default_branch_id = p_branch_id
              OR pm.role IN ('OWNER', 'MANAGER')
          )
    );
$$;

REVOKE ALL ON FUNCTION public.has_branch_access(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_branch_access(UUID, UUID) TO authenticated;

-- Foundation has no policies for these tables. The sealed chain forces RLS but
-- does not provide complete pharmacy/branch policy coverage.
DROP POLICY IF EXISTS rls_pharmacies_select_postsealed ON public.pharmacies;
CREATE POLICY rls_pharmacies_select_postsealed ON public.pharmacies
FOR SELECT USING (
    public.is_pharmacy_member(id) OR public.is_platform_admin('ADMIN')
);

DROP POLICY IF EXISTS rls_pharmacies_insert_postsealed ON public.pharmacies;
CREATE POLICY rls_pharmacies_insert_postsealed ON public.pharmacies
FOR INSERT WITH CHECK (FALSE);

DROP POLICY IF EXISTS rls_pharmacies_update_postsealed ON public.pharmacies;
CREATE POLICY rls_pharmacies_update_postsealed ON public.pharmacies
FOR UPDATE USING (
    owner_id = auth.uid() OR public.is_platform_admin('ADMIN')
)
WITH CHECK (
    owner_id = auth.uid() OR public.is_platform_admin('ADMIN')
);

DROP POLICY IF EXISTS rls_pharmacies_delete_postsealed ON public.pharmacies;
CREATE POLICY rls_pharmacies_delete_postsealed ON public.pharmacies
FOR DELETE USING (FALSE);

DROP POLICY IF EXISTS rls_branches_select_postsealed ON public.branches;
CREATE POLICY rls_branches_select_postsealed ON public.branches
FOR SELECT USING (
    public.has_branch_access(pharmacy_id, id) OR public.is_platform_admin('ADMIN')
);

DROP POLICY IF EXISTS rls_branches_insert_postsealed ON public.branches;
CREATE POLICY rls_branches_insert_postsealed ON public.branches
FOR INSERT WITH CHECK (
    public.has_pharmacy_role(pharmacy_id, 'OWNER')
    OR public.has_pharmacy_role(pharmacy_id, 'MANAGER')
);

DROP POLICY IF EXISTS rls_branches_update_postsealed ON public.branches;
CREATE POLICY rls_branches_update_postsealed ON public.branches
FOR UPDATE USING (
    public.has_pharmacy_role(pharmacy_id, 'OWNER')
    OR public.has_pharmacy_role(pharmacy_id, 'MANAGER')
)
WITH CHECK (
    public.has_pharmacy_role(pharmacy_id, 'OWNER')
    OR public.has_pharmacy_role(pharmacy_id, 'MANAGER')
);

DROP POLICY IF EXISTS rls_branches_delete_postsealed ON public.branches;
CREATE POLICY rls_branches_delete_postsealed ON public.branches
FOR DELETE USING (public.has_pharmacy_role(pharmacy_id, 'OWNER'));

-- Direct browser sale writes would bypass the unified commit transaction.
-- Retain SELECT policies; replace only client mutation permissions.
REVOKE INSERT, UPDATE, DELETE ON public.sales, public.sale_items FROM authenticated, anon;
DROP POLICY IF EXISTS rls_sales_insert ON public.sales;
DROP POLICY IF EXISTS rls_sale_items_insert ON public.sale_items;

-- Required staging checks:
-- * trigger owner can insert profile/pharmacy/branch/membership under FORCE RLS;
-- * direct Auth signup atomically rolls back on any bootstrap failure;
-- * helpers execute without recursion and do not bypass tenant isolation;
-- * grant changes do not block trusted post-sealed RPCs.
