const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_LABEL = /^[A-Za-z0-9_ -]{1,128}$/;
const SAFE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]{1,190}$/;

const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;

function validateRoots(pharmacies, users) {
  if (!Array.isArray(pharmacies) || !Array.isArray(users) || pharmacies.length === 0 || users.length === 0) {
    throw new Error('Cleanup requires explicit pharmacy and user roots.');
  }
  const ids = new Set();
  for (const pharmacy of pharmacies) {
    if (!UUID.test(pharmacy.id) || !SAFE_LABEL.test(pharmacy.name)) throw new Error('Invalid pharmacy cleanup identity.');
    if (ids.has(pharmacy.id)) throw new Error('Duplicate cleanup identity.');
    ids.add(pharmacy.id);
  }
  for (const user of users) {
    if ((user.id !== null && !UUID.test(user.id)) || !SAFE_EMAIL.test(user.email) || !SAFE_LABEL.test(user.bootstrapName)) throw new Error('Invalid user cleanup identity.');
    const identity = user.id ?? `email:${user.email.toLowerCase()}`;
    if (ids.has(identity)) throw new Error('Duplicate cleanup identity.');
    ids.add(identity);
  }
}

export function buildGuardedEdgeCleanupSql({ pharmacies, users }) {
  validateRoots(pharmacies, users);
  const pharmacyValues = pharmacies.map((row) => `(${sqlLiteral(row.id)}::uuid,${sqlLiteral(row.name)})`).join(',');
  const userValues = users.map((row) => `(${row.id === null ? 'NULL::uuid' : `${sqlLiteral(row.id)}::uuid`},${sqlLiteral(row.email)},${sqlLiteral(row.bootstrapName)})`).join(',');
  return `
BEGIN;
CREATE TEMP TABLE pf_expected_pharmacies(id uuid PRIMARY KEY, expected_name text) ON COMMIT DROP;
CREATE TEMP TABLE pf_expected_users(expected_id uuid, expected_email text PRIMARY KEY, bootstrap_name text) ON COMMIT DROP;
INSERT INTO pf_expected_pharmacies VALUES ${pharmacyValues};
INSERT INTO pf_expected_users VALUES ${userValues};

DO $cleanup$
DECLARE bad text;
BEGIN
  SELECT p.id::text || ':' || p.name INTO bad
  FROM public.pharmacies p JOIN pf_expected_pharmacies e ON e.id=p.id
  WHERE p.name IS DISTINCT FROM e.expected_name LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'ABORT Edge cleanup: fixture pharmacy identity mismatch %', bad; END IF;

  SELECT COALESCE(u.id::text,'<missing>') || ':' || COALESCE(u.email,'<null>') INTO bad
  FROM pf_expected_users e LEFT JOIN auth.users u ON u.id=e.expected_id
  WHERE e.expected_id IS NOT NULL
    AND (u.id IS NULL OR lower(u.email) IS DISTINCT FROM lower(e.expected_email)) LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'ABORT Edge cleanup: fixture user identity mismatch %', bad; END IF;

  SELECT COALESCE(u.id::text,'<missing>') || ':' || e.expected_email INTO bad
  FROM pf_expected_users e LEFT JOIN auth.users u ON lower(u.email)=lower(e.expected_email)
  WHERE e.expected_id IS NOT NULL AND (u.id IS NULL OR u.id IS DISTINCT FROM e.expected_id) LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'ABORT Edge cleanup: fixture email reverse-identity mismatch %', bad; END IF;

  SELECT u.id::text || ':' || e.expected_email INTO bad
  FROM pf_expected_users e JOIN auth.users u ON lower(u.email)=lower(e.expected_email)
  WHERE e.expected_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.pharmacies p WHERE p.owner_id=u.id AND p.name=e.bootstrap_name
  ) LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'ABORT Edge cleanup: ambiguous Auth-create ownership unproven %', bad; END IF;

  SELECT p.id::text || ':' || p.name INTO bad
  FROM public.pharmacies p JOIN auth.users u ON u.id=p.owner_id
       JOIN pf_expected_users e ON lower(e.expected_email)=lower(u.email)
  WHERE NOT EXISTS (SELECT 1 FROM pf_expected_pharmacies x WHERE x.id=p.id)
    AND p.name IS DISTINCT FROM e.bootstrap_name LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'ABORT Edge cleanup: bootstrap pharmacy identity mismatch %', bad; END IF;
END $cleanup$;

CREATE TEMP TABLE pf_cleanup_pharmacies(id uuid PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE pf_cleanup_users(id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO pf_cleanup_users
SELECT u.id FROM auth.users u JOIN pf_expected_users e
  ON (e.expected_id IS NOT NULL AND u.id=e.expected_id)
  OR (e.expected_id IS NULL AND lower(e.expected_email)=lower(u.email));
INSERT INTO pf_cleanup_pharmacies SELECT id FROM pf_expected_pharmacies;
INSERT INTO pf_cleanup_pharmacies
SELECT p.id FROM public.pharmacies p JOIN pf_cleanup_users u ON u.id=p.owner_id
ON CONFLICT DO NOTHING;

SET LOCAL session_replication_role = replica;
DELETE FROM public.sale_return_line_allocations WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.return_items WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.stock_ledger WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.sale_returns WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.sync_journal WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.sync_nonces WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.audit_logs WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.offline_stock_deficits WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.late_cash_sale_exceptions WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.sale_items WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.sales WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.inventory_batches WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.products WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.devices WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.pharmacy_members WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies) OR user_id IN (SELECT id FROM pf_cleanup_users);
DELETE FROM public.branches WHERE pharmacy_id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.pharmacies WHERE id IN (SELECT id FROM pf_cleanup_pharmacies);
DELETE FROM public.user_profiles WHERE id IN (SELECT id FROM pf_cleanup_users);
DELETE FROM auth.users WHERE id IN (SELECT id FROM pf_cleanup_users);
SET LOCAL session_replication_role = origin;

DO $proof$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pharmacies WHERE id IN (SELECT id FROM pf_cleanup_pharmacies))
     OR EXISTS (SELECT 1 FROM public.pharmacies WHERE id IN (SELECT id FROM pf_expected_pharmacies))
     OR EXISTS (SELECT 1 FROM auth.users u JOIN pf_expected_users e ON e.expected_id IS NOT NULL AND u.id=e.expected_id)
     OR EXISTS (SELECT 1 FROM auth.users u JOIN pf_expected_users e ON lower(u.email)=lower(e.expected_email))
     OR EXISTS (SELECT 1 FROM public.pharmacy_members WHERE user_id IN (SELECT id FROM pf_cleanup_users))
     OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id IN (SELECT id FROM pf_cleanup_users))
     OR EXISTS (SELECT 1 FROM auth.users WHERE id IN (SELECT id FROM pf_cleanup_users)) THEN
    RAISE EXCEPTION 'ABORT Edge cleanup: fixture roots remain';
  END IF;
END $proof$;
SELECT json_build_object(
  'pharmacies',(SELECT count(*) FROM public.pharmacies WHERE id IN (SELECT id FROM pf_expected_pharmacies)),
  'expected_user_ids',(SELECT count(*) FROM auth.users u JOIN pf_expected_users e ON e.expected_id IS NOT NULL AND u.id=e.expected_id),
  'users',(SELECT count(*) FROM auth.users WHERE lower(email) IN (SELECT lower(expected_email) FROM pf_expected_users)),
  'profiles',(SELECT count(*) FROM public.user_profiles WHERE id IN (SELECT id FROM pf_cleanup_users)),
  'memberships',(SELECT count(*) FROM public.pharmacy_members WHERE user_id IN (SELECT id FROM pf_cleanup_users))
);
COMMIT;
`;
}

export function runGuardedEdgeCleanup(psql, roots) {
  if (typeof psql !== 'function') throw new Error('Cleanup requires an injected database executor.');
  const raw = psql(buildGuardedEdgeCleanupSql(roots));
  const proof = JSON.parse(raw);
  if (proof.pharmacies !== 0 || proof.expected_user_ids !== 0 || proof.users !== 0 || proof.profiles !== 0 || proof.memberships !== 0) {
    throw new Error('Edge cleanup zero-root proof failed.');
  }
  return proof;
}

export async function preserveFailureThroughCleanup(work, cleanup) {
  let workError = null;
  try {
    return await work();
  } catch (error) {
    workError = error;
    throw error;
  } finally {
    try {
      await cleanup();
    } catch (cleanupError) {
      if (workError) throw new AggregateError([workError, cleanupError], 'Edge scenario and guarded cleanup both failed.');
      throw cleanupError;
    }
  }
}
