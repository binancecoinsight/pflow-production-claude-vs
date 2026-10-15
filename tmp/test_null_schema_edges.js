const { Client } = require('/tmp/node_modules/pg');
const crypto = require('crypto');
const dbConfig = { host: '/tmp', user: 'postgres', database: 'pharmacyflow_test' };

async function run() {
    console.log("================================================================================");
    console.log("SCHEMA NOT-NULL INVARIANTS & INVALID SEAT LIMIT (max_staff = 0) EDGE CASES");
    console.log("================================================================================");
    const client = new Client(dbConfig);
    await client.connect();

    async function setAuth(c, uid) {
        await c.query("SET ROLE authenticated;");
        await c.query("SELECT set_config('request.jwt.claim.sub', $1, false);", [uid]);
    }
    async function resetAuth(c) {
        await c.query("SELECT set_config('request.jwt.claim.sub', '', false);");
        await c.query("RESET ROLE;");
    }

    const runId = crypto.randomBytes(3).toString('hex');
    const pharmZeroSeats = crypto.randomUUID();
    const uOwner = crypto.randomUUID();
    const uInvitee = crypto.randomUUID();
    const uSuspended = crypto.randomUUID();

    // 1. Proof that M-3 enforces NOT NULL on current_period_end and max_staff
    let nullPeriodErr = null;
    try {
        await client.query(
            "INSERT INTO public.subscriptions (pharmacy_id, plan_code, status, current_period_start, current_period_end) VALUES ($1, 'STARTER', 'ACTIVE', now(), NULL);",
            [crypto.randomUUID()]
        );
    } catch (e) {
        nullPeriodErr = e;
    }
    console.log("[SCHEMA INVARIANT 1] Inserting NULL current_period_end rejected by M-3 NOT NULL constraint: " + (nullPeriodErr && nullPeriodErr.code === '23502') + " (" + nullPeriodErr?.message + ")");

    let nullMaxStaffErr = null;
    try {
        await client.query(
            "INSERT INTO public.subscription_plans (code, name, max_staff) VALUES ($1, 'Null Staff Plan', NULL);",
            ['PLAN_NULL_' + runId]
        );
    } catch (e) {
        nullMaxStaffErr = e;
    }
    console.log("[SCHEMA INVARIANT 2] Inserting NULL max_staff rejected by M-3 NOT NULL constraint: " + (nullMaxStaffErr && nullMaxStaffErr.code === '23502') + " (" + nullMaxStaffErr?.message + ")");

    // 2. Setup a plan with max_staff = 0 (which is permitted by M-3 schema DDL)
    await client.query(
        "INSERT INTO auth.users (id, email, email_confirmed_at) VALUES " +
        "('" + uOwner + "', 'owner_zero_" + runId + "@test.com', now()), " +
        "('" + uInvitee + "', 'invitee_zero_" + runId + "@test.com', now()), " +
        "('" + uSuspended + "', 'susp_zero_" + runId + "@test.com', now()); " +
        "INSERT INTO public.subscription_plans (code, name, max_staff) VALUES ('PLAN_ZERO_" + runId + "', 'Plan Zero Seats', 0); " +
        "INSERT INTO public.pharmacies (id, name, owner_id) VALUES ('" + pharmZeroSeats + "', 'Pharm Zero Seats', '" + uOwner + "'); " +
        "INSERT INTO public.pharmacy_members (pharmacy_id, user_id, role, status) VALUES ('" + pharmZeroSeats + "', '" + uOwner + "', 'OWNER', 'ACTIVE'), ('" + pharmZeroSeats + "', '" + uSuspended + "', 'CASHIER', 'SUSPENDED'); " +
        "INSERT INTO public.subscriptions (pharmacy_id, plan_code, status, current_period_start, current_period_end) VALUES ('" + pharmZeroSeats + "', 'PLAN_ZERO_" + runId + "', 'ACTIVE', now() - interval '1 day', now() + interval '30 days');"
    );

    // 3. Test rpc_create_staff_invitation with max_staff = 0
    await setAuth(client, uOwner);
    let createErr = null;
    try {
        await client.query("SELECT public.rpc_create_staff_invitation($1, NULL, $2, 'PHARMACIST');", [pharmZeroSeats, 'newinv_' + runId + '@test.com']);
    } catch (e) {
        createErr = e;
    }
    await resetAuth(client);
    console.log("[EDGE CASE 1] rpc_create_staff_invitation on plan with max_staff = 0:");
    console.log("   Rejected with 54000: " + (createErr && createErr.code === '54000') + " (" + createErr?.message + ")");

    // 4. Test rpc_accept_staff_invitation with max_staff = 0
    const rawTok = 'tok_' + crypto.randomBytes(16).toString('hex');
    const tokHash = crypto.createHash('sha256').update(rawTok).digest('hex');
    const invRes = await client.query("INSERT INTO public.staff_invitations (pharmacy_id, email, role, token_hash, invited_by, status, expires_at) VALUES ('" + pharmZeroSeats + "', 'invitee_zero_" + runId + "@test.com', 'PHARMACIST', '" + tokHash + "', '" + uOwner + "', 'PENDING', now() + interval '7 days') RETURNING id;");

    await setAuth(client, uInvitee);
    let acceptErr = null;
    try {
        await client.query("SELECT public.rpc_accept_staff_invitation($1, $2);", [invRes.rows[0].id, rawTok]);
    } catch (e) {
        acceptErr = e;
    }
    await resetAuth(client);
    console.log("[EDGE CASE 2] rpc_accept_staff_invitation on plan with max_staff = 0:");
    console.log("   Rejected with 54000: " + (acceptErr && acceptErr.code === '54000') + " (" + acceptErr?.message + ")");

    // 5. Test rpc_reactivate_pharmacy_member with max_staff = 0
    await setAuth(client, uOwner);
    let reactErr = null;
    try {
        await client.query("SELECT public.rpc_reactivate_pharmacy_member($1, $2);", [pharmZeroSeats, uSuspended]);
    } catch (e) {
        reactErr = e;
    }
    await resetAuth(client);
    console.log("[EDGE CASE 3] rpc_reactivate_pharmacy_member on plan with max_staff = 0:");
    console.log("   Rejected with 54000: " + (reactErr && reactErr.code === '54000') + " (" + reactErr?.message + ")");

    await client.end();
}
run().catch(console.error);
