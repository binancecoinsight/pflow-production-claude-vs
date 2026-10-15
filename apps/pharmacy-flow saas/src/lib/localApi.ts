import * as db from './db';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabase';

async function logActivity(userId: string | null, action: string, entityId: string | null, entityName: string | null, details: any) {
  const id = uuidv4();
  const user = userId ? db.queryOne("SELECT name, pharmacyId, branchId FROM users WHERE id = ?", [userId]) : null;
  const userName = user ? user.name : 'Unknown System User';
  const pharmacyId = user ? user.pharmacyId : null;
  const branchId = user ? user.branchId : null;
  
  await db.run(`
    INSERT INTO activities (id, pharmacyId, branchId, userId, userName, action, entityId, entityName, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, pharmacyId, branchId, userId, userName, action, entityId, entityName, JSON.stringify(details)]);
}

export async function handleLocalRequest(resource: string, config?: RequestInit) {
  const url = new URL(resource, window.location.origin);
  const path = url.pathname;
  const method = config?.method || 'GET';
  const body = config?.body ? JSON.parse(config.body as string) : null;
  const params = Object.fromEntries(url.searchParams.entries());

  const headers = new Headers(config?.headers || {});
  const requestingUserId = headers.get('x-user-id');

  const sqlite = await db.getDB();

  // One-time Pharmacy initialization for existing users
  if (!localStorage.getItem('pharmacy_init_v2')) {
    const categoriesRow = db.queryOne("SELECT value FROM settings WHERE key = 'categories'");
    if (categoriesRow?.value?.includes('Electronics') || !categoriesRow) {
      const pharmacyCategories = '[{"id":"cat-meds","name":"Medications","subcategories":["Prescription","OTC","Injections","Syrups","Suspensions"]},{"id":"cat-personal","name":"Personal Care","subcategories":["Skincare","Oral Care","Haircare","Hygiene","Beauty"]},{"id":"cat-wellness","name":"Wellness & Vitamins","subcategories":["Multivitamins","Supplements","Herbal","Nutrition"]},{"id":"cat-baby","name":"Baby & Mother","subcategories":["Diapers","Baby Food","Baby Toiletries","Maternity"]},{"id":"cat-supplies","name":"Medical Supplies","subcategories":["First Aid","Diagnostics","Surgical","Orthopedic"]},{"id":"cat-misc","name":"Miscellaneous","subcategories":["Toiletries","Others"]}]';
      await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('categories', ?)", [pharmacyCategories]);
      await db.run("UPDATE settings SET value = 'PHARMACY-ABC' WHERE key = 'storeName' AND (value = 'STORE-ABC' OR value = 'PHARMACY-FLOW')");
      await db.run("UPDATE settings SET value = 'Thank you for choosing {storeName}. We care for your health!' WHERE key = 'receiptMessage' AND (value = 'Thanks for your patronage!' OR value = 'Thank you for choosing PharmacyFlow. We care for your health!' OR value = 'Thank you for choosing PHARMACY-ABC. We care for your health!')");
    }
    localStorage.setItem('pharmacy_init_v2', 'true');
  }

  let requestingUser = requestingUserId ? db.queryOne("SELECT id, role, pharmacyId, branchId FROM users WHERE id = ?", [requestingUserId]) : null;

  // Open testing fallback: full access admin store owner
  if (!requestingUser) {
    requestingUser = db.queryOne("SELECT id, role, pharmacyId, branchId FROM users WHERE id = 'user-admin-default'")
      || db.queryOne("SELECT id, role, pharmacyId, branchId FROM users LIMIT 1")
      || { id: 'user-admin-default', role: 'store owner', pharmacyId: 'pharmacy-default', branchId: 'branch-default' };
  }

  // Security Gates & Multi-Tenancy Variables
  const isAuthPath = path.startsWith('/api/auth');
  const userPharmacyId = requestingUser?.pharmacyId || 'pharmacy-default';
  const userBranchId = requestingUser?.branchId || 'branch-default';
  const userRole = requestingUser?.role?.toLowerCase() || 'store owner';
  const isAdminOrOwner = userRole === 'admin' || userRole === 'store owner';

  if (!isAuthPath && !requestingUser) {
    return { status: 401, success: false, error: 'Unauthorized' };
  }

  // Staff Restriction: Settings, Roles, and Monitoring of other branches
  if (!isAuthPath && !isAdminOrOwner) {
    const restrictedPaths = ['/api/settings', '/api/roles', '/api/subscription', '/api/employees', '/api/pharmacies'];
    if (restrictedPaths.some(p => path.startsWith(p))) {
      return { status: 403, success: false, error: 'Access denied: Restrictive area for staff' };
    }
  }

  // Tenant scoping helper
  const scopeQuery = (sql: string, sqlParams: any[]) => {
    if (isAuthPath || !requestingUser) return { sql, params: sqlParams };
    
    const uppercaseSql = sql.toUpperCase();
    const hasWhere = uppercaseSql.includes('WHERE');
    const operator = hasWhere ? 'AND' : 'WHERE';
    
    // Find the position to insert the scoping condition (before ORDER BY, GROUP BY, LIMIT)
    let insertPos = sql.length;
    const keywords = ['ORDER BY', 'GROUP BY', 'LIMIT'];
    for (const keyword of keywords) {
      const pos = uppercaseSql.indexOf(keyword);
      if (pos !== -1 && pos < insertPos) {
        insertPos = pos;
      }
    }

    const before = sql.slice(0, insertPos).trim();
    const after = sql.slice(insertPos).trim();
    
    let scopedSql = '';
    let newParams = [...sqlParams];

    if (isAdminOrOwner) {
      scopedSql = `${before} ${operator} pharmacyId = ? ${after}`.trim();
      newParams.push(userPharmacyId);
    } else {
      scopedSql = `${before} ${operator} pharmacyId = ? AND branchId = ? ${after}`.trim();
      newParams.push(userPharmacyId, userBranchId);
    }

    return {
      sql: scopedSql,
      params: newParams
    };
  };

  // Auth
  if (path === '/api/auth/login' && method === 'POST') {
    const hashedPassword = await db.hashPassword(body.password);
    const safeUsername = body.username ? body.username.toLowerCase() : '';
    const user = db.queryOne(`
      SELECT u.id, u.name, u.username, u.role, u.pharmacyId, u.branchId, r.permissions 
      FROM users u 
      LEFT JOIN roles r ON u.roleId = r.id 
      WHERE (u.username = ? OR u.id = ?) AND u.password = ? 
        AND (u.active = 1 OR u.active = '1' OR u.active = 'true' OR u.active = 'TRUE')
    `, [safeUsername, body.username, hashedPassword]);
    
    if (user) {
      // Check if device is configured for a specific branch and this user isn't an admin
      const deviceBranchId = localStorage.getItem('device_branch_id');
      if (deviceBranchId && user.branchId !== deviceBranchId && user.role !== 'admin' && user.role !== 'store owner') {
         return { status: 403, success: false, error: 'Unauthorized branch: You can only login on devices assigned to your store branch.' };
      }
    
      return { 
        success: true, 
        user: { 
          ...user, 
          permissions: user.permissions ? JSON.parse(user.permissions) : [] 
        } 
      };
    }
    
    // Debug: Check why user is not found
    const debugUser = db.queryOne("SELECT * FROM users WHERE username = ?", [safeUsername]);
    if (debugUser) {
       console.log("Found user but login failed. Stored hash:", debugUser.password, "Expected hash:", hashedPassword, "Active:", debugUser.active);
       return { status: 401, success: false, error: 'Invalid password or user is inactive.' };
    } else {
       console.log("No user found with username:", safeUsername);
    }
    
    return { status: 401, success: false, error: 'Invalid credentials or inactive user' };
  }

  if (path === '/api/auth/has-users' && method === 'GET') {
    const count = db.queryOne("SELECT count(*) as c FROM users");
    return { hasUsers: count.c > 0 };
  }

  if (path === '/api/auth/check-signup-data' && method === 'POST') {
    const { email, phone, pharmacyName } = body;
    
    // Check Email
    const existingEmail = db.queryOne("SELECT id FROM users WHERE username = ?", [email.toLowerCase()]);
    if (existingEmail) {
      return { success: true, exists: true, error: 'Email already exists.' };
    }
    
    // Check Phone
    const existingPhone = db.queryOne("SELECT id FROM branches WHERE phone = ?", [phone]);
    if (existingPhone) {
      return { success: true, exists: true, error: 'Phone number already exists.' };
    }

    // Check Pharmacy Name
    const existingPharmacy = db.queryOne("SELECT id FROM pharmacies WHERE name = ?", [pharmacyName]);
    if (existingPharmacy) {
      return { success: true, exists: true, error: 'Pharmacy name already taken.' };
    }

    return { success: true, exists: false };
  }

  if (path === '/api/auth/check-pharmacy' && method === 'POST') {
    const { pharmacyName } = body;
    const existing = db.queryOne("SELECT id FROM pharmacies WHERE name = ?", [pharmacyName]);
    return { success: true, exists: !!existing };
  }

  if (path === '/api/auth/send-otp' && method === 'POST') {
    const { email } = body;
    if (!supabase) {
      return { success: false, error: 'Supabase is not configured. Missing environment variables.' };
    }
    
    // Send a real OTP using Supabase
    const { error } = await supabase.auth.signInWithOtp({ 
      email, 
      options: { shouldCreateUser: true } 
    });
    
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  if (path === '/api/auth/verify-otp' && method === 'POST') {
    const { code, name, phone, pharmacyName, email, password, country, state, city, address } = body;
    
    if (!supabase) {
      return { success: false, error: 'Supabase is not configured.' };
    }

    // Verify OTP with Supabase
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email'
    });

    if (verifyError) {
      return { success: false, error: verifyError.message };
    }
    
    // Set the user's password now that they are authenticated
    const { error: updateError } = await supabase.auth.updateUser({ password: password });
    if (updateError) {
      console.error("Supabase updateUser error:", updateError);
      return { success: false, error: `Failed to set password: ${updateError.message}` };
    }

    let userId = verifyData.user?.id || uuidv4();

    // Check if pharmacy exists one last time
    const existing = db.queryOne("SELECT id FROM pharmacies WHERE name = ?", [pharmacyName]);
    if (existing) {
      return { success: false, error: 'Pharmacy name already taken.' };
    }


    const pharmacyId = uuidv4();
    const branchId = uuidv4();
    const hashedPassword = await db.hashPassword(password);
    
    const roleId = db.queryOne("SELECT id FROM roles WHERE name = ?", ['store owner'])?.id;
    
    // Create Pharmacy
    await db.run(`INSERT INTO pharmacies (id, name, ownerId, tier) VALUES (?, ?, ?, 'Personal')`, [pharmacyId, pharmacyName, userId]);
    
    // Create Default Branch
    const branchLocation = `${address}, ${city}, ${state}, ${country}`;
    await db.run(`INSERT INTO branches (id, pharmacyId, name, location, phone) VALUES (?, ?, 'Main Branch', ?, ?)`, [branchId, pharmacyId, branchLocation, phone]);

    // Create User
    await db.run(`
      INSERT INTO users (id, name, username, password, role, roleId, pharmacyId, branchId, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [userId, name, email.toLowerCase(), hashedPassword, 'store owner', roleId || null, pharmacyId, branchId]);

    // Populate Settings
    await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['storeName', pharmacyName]);
    await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['phoneNumber', phone]);
    await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['storeAddress', branchLocation]);
    await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['storeEmail', email.toLowerCase()]);
    
    // Attempt deltaSync so the tables are populated in Supabase right away
    try {
       await supabase.from('pharmacies').insert({ id: pharmacyId, name: pharmacyName, owner_id: userId, tier: 'Personal' });
       await supabase.from('branches').insert({ id: branchId, pharmacy_id: pharmacyId, name: 'Main Branch', location: branchLocation, phone: phone });
       await supabase.from('users').insert({ id: userId, name, username: email.toLowerCase(), password: hashedPassword, role: 'store owner', role_id: roleId || null, pharmacy_id: pharmacyId, branch_id: branchId, active: 1 });
       
       await supabase.from('settings').upsert([
         { key: 'storeName', value: pharmacyName },
         { key: 'phoneNumber', value: phone },
         { key: 'storeAddress', value: branchLocation },
         { key: 'storeEmail', value: email.toLowerCase() }
       ]);
    } catch (e) {
       console.error("Supabase insert error", e);
    }
    
    import('../services/syncService').then(({ syncService }) => {
       syncService.init(email.toLowerCase(), password).then(() => {
          syncService.deltaSync().catch(console.error);
       });
    });

    return { 
      status: 201, 
      success: true, 
      user: { 
        id: userId, 
        name, 
        username: email.toLowerCase(), 
        role: 'store owner',
        pharmacyId,
        branchId,
        permissions: [] // New owners might have default permissions, handled by app logic
      } 
    };
  }

  if (path === '/api/auth/signup' && method === 'POST') {
    const { name, username, password } = body;
    const safeUsername = username ? username.toLowerCase() : '';
    const id = uuidv4();
    const hashedPassword = await db.hashPassword(password);
    
    // Check if this is the first user
    const userCount = db.queryOne("SELECT COUNT(*) as count FROM users");
    const isFirstUser = userCount.count === 0;
    
    const roleName = isFirstUser ? 'store owner' : 'cashier';
    const role = db.queryOne("SELECT id, permissions FROM roles WHERE name = ?", [roleName]);
    
    await db.run(`
      INSERT INTO users (id, name, username, password, role, roleId, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `, [id, name, safeUsername, hashedPassword, roleName, role?.id || null]);
    
    return { 
      status: 201, 
      success: true, 
      user: { 
        id, 
        name, 
        username: safeUsername, 
        role: roleName,
        permissions: role?.permissions ? JSON.parse(role.permissions) : []
      } 
    };
  }

  if (path === '/api/auth/me' && method === 'GET') {
    const storedUser = localStorage.getItem('store_user');
    const user = storedUser ? JSON.parse(storedUser) : null;
    if (!user?.id) return { status: 401, success: false };

    const dbUser = db.queryOne(`
      SELECT u.id, u.name, u.username, u.role, r.permissions 
      FROM users u 
      LEFT JOIN roles r ON u.roleId = r.id 
      WHERE u.id = ? AND u.active = 1
    `, [user.id]);

    if (dbUser) {
      return { 
        success: true, 
        user: { 
          ...dbUser, 
          permissions: dbUser.permissions ? JSON.parse(dbUser.permissions) : [] 
        } 
      };
    }
    return { status: 401, success: false };
  }

  if (path === '/api/notifications/dismiss' && method === 'POST') {
    const { refId, type } = body;
    const id = uuidv4();
    await db.run("INSERT INTO dismissed_notifications (id, userId, refId, type) VALUES (?, ?, ?, ?)", [id, requestingUserId, refId, type]);
    return { success: true };
  }

  if (path === '/api/notifications/dismissed' && method === 'GET') {
    const dismissed = db.query(`
      SELECT d.id as dismissalId, d.refId, d.type, d.dismissedAt,
             CASE 
               WHEN d.type = 'invoice' THEN (SELECT 'Invoice ' || invoiceNumber || ' - ' || accountName FROM invoices WHERE id = d.refId)
               WHEN d.type = 'debt' THEN (SELECT 'Debt Reminder: ' || a.name FROM account_transactions at JOIN accounts a ON at.accountId = a.id WHERE at.id = d.refId)
               WHEN d.type = 'calendar' THEN (SELECT 'Event: ' || title FROM calendar_events WHERE id = d.refId)
               WHEN d.type = 'alert' AND d.refId = 'alert-low-stock' THEN 'Low Stock Warning block'
               WHEN d.type = 'alert' AND d.refId = 'alert-expiring-soon' THEN 'Expiring soon warning block'
               ELSE d.type || ': ' || d.refId
             END as title
      FROM dismissed_notifications d
      WHERE d.userId = ? OR d.userId IS NULL
      ORDER BY d.dismissedAt DESC
      LIMIT 50
    `, [requestingUserId]);
    return dismissed;
  }

  if (path === '/api/notifications/restore' && method === 'POST') {
    const { refId, type } = body;
    await db.run("DELETE FROM dismissed_notifications WHERE refId = ? AND type = ?", [refId, type]);
    return { success: true };
  }

  // Activities
  if (path === '/api/activities' && method === 'GET') {
    const range = params.range || '1'; // Default 1 day
    const days = parseInt(range);
    const { sql, params: sqlParams } = scopeQuery(`
      SELECT * FROM activities 
      WHERE timestamp >= datetime('now', '-' || ? || ' days')
      ORDER BY timestamp DESC
    `, [days]);
    return db.query(sql, sqlParams);
  }

  // Roles
  if (path === '/api/roles' && method === 'GET') {
    const roles = db.query("SELECT * FROM roles");
    return roles.map((r: any) => ({ ...r, permissions: JSON.parse(r.permissions) }));
  }

  if (path === '/api/roles' && method === 'POST') {
    const id = uuidv4();
    const nameLower = body.name.toLowerCase();
    await db.run("INSERT INTO roles (id, name, permissions) VALUES (?, ?, ?)", [id, nameLower, JSON.stringify(body.permissions)]);
    return { status: 201, id, name: nameLower, permissions: body.permissions };
  }

  if (path.startsWith('/api/roles/') && method === 'PUT') {
    const id = path.split('/').pop();
    const existing = db.queryOne("SELECT name FROM roles WHERE id = ?", [id]);
    const nameLower = body.name.toLowerCase();
    
    // Protect system roles from renaming
    if (existing && (existing.name === 'store owner' || existing.name === 'admin')) {
      if (nameLower !== existing.name) {
         return { status: 403, error: `System role '${existing.name}' cannot be renamed.` };
      }
    }

    await db.run("UPDATE roles SET name = ?, permissions = ? WHERE id = ?", [nameLower, JSON.stringify(body.permissions), id]);
    return { id, name: nameLower, permissions: body.permissions };
  }

  // Products
  if (path === '/api/products/bulk' && method === 'POST') {
    const products = body.products;
    const results: any[] = [];
    
    await db.transaction(async () => {
      for (const product of products) {
        let sku = product.sku;
        if (!sku) continue;

        const existing = db.queryOne("SELECT * FROM products WHERE sku = ?", [sku]);
        
        if (existing) {
          // Update existing fields only if provided
          const updateFields: string[] = [];
          const values: any[] = [];
          
          if (product.name) { updateFields.push('name = ?'); values.push(product.name); }
          if (product.category) { updateFields.push('category = ?'); values.push(product.category); }
          if (product.subcategory) { updateFields.push('subcategory = ?'); values.push(product.subcategory); }
          if (product.price !== undefined) { updateFields.push('price = ?'); values.push(product.price); }
          if (product.wholesalePrice !== undefined) { updateFields.push('wholesalePrice = ?'); values.push(product.wholesalePrice); }
          if (product.cost !== undefined) { updateFields.push('cost = ?'); values.push(product.cost); }
          if (product.stock !== undefined) { updateFields.push('stock = ?'); values.push(product.stock); }
          if (product.minStock !== undefined) { updateFields.push('minStock = ?'); values.push(product.minStock); }
          if (product.description) { updateFields.push('description = ?'); values.push(product.description); }
          if (product.type) { updateFields.push('type = ?'); values.push(product.type); }
          
          if (updateFields.length > 0) {
            values.push(existing.id);
            await db.run(`UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`, values);
          }
          results.push({ id: existing.id, sku, status: 'updated' });
        } else {
          // Create
          const id = uuidv4();
          await db.run(`
            INSERT INTO products (id, name, sku, category, subcategory, price, wholesalePrice, cost, stock, minStock, description, type, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `, [
            id, product.name || 'Unnamed Product', sku, product.category || '', product.subcategory || '', product.price || 0,
            product.wholesalePrice || 0, product.cost || 0, product.stock || 0, product.minStock || 0,
            product.description || '', product.type || 'product'
          ]);
          results.push({ id, sku, status: 'created' });
        }
      }
    });
    
    return { success: true, results };
  }

  if (path === '/api/products' && method === 'GET') {
    let sql = "SELECT * FROM products WHERE active = 1";
    if (params.all === 'true') sql = "SELECT * FROM products";
    return db.query(sql);
  }

  if (path === '/api/products' && method === 'POST') {
    const id = uuidv4();
    let sku = body.sku;
    
    // Auto-generate SKU if not provided
    if (!sku) {
      const type = body.type || 'product';
      const prefix = type === 'product' ? 'PRD' : 'SRV';
      const lastProduct = db.queryOne(`SELECT MAX(rowid) as lastId FROM products`);
      const nextId = ((lastProduct?.lastId || 0) + 1).toString().padStart(5, '0');
      sku = `${prefix}-${nextId}`;
    }

    // Check if SKU already exists
    /* 
    const existing = db.queryOne("SELECT id FROM products WHERE sku = ?", [sku]);
    if (existing) {
      return { status: 400, success: false, error: 'A product with this SKU already exists' };
    }
    */

    await db.run(`
      INSERT INTO products (id, name, sku, alias, category, subcategory, price, wholesalePrice, cost, stock, minStock, description, expiryDate, batchNumber, model, manufacturer, type, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [id, body.name, sku, body.alias || null, body.category, body.subcategory, body.price, body.wholesalePrice || null, body.cost, body.stock, body.minStock, body.description, body.expiryDate || null, body.batchNumber || null, body.model || null, body.manufacturer || null, body.type || 'product']);
    
    await logActivity(requestingUserId, 'product_added', id, body.name, body);

    return { status: 201, id, ...body, sku, active: 1 };
  }

  if (path.startsWith('/api/products/') && method === 'PUT') {
    const id = path.split('/').pop() || '';
    const existing = db.queryOne("SELECT * FROM products WHERE id = ?", [id]);
    
    await db.run(`
      UPDATE products 
      SET name = ?, sku = ?, alias = ?, category = ?, subcategory = ?, price = ?, wholesalePrice = ?, cost = ?, stock = ?, minStock = ?, description = ?, expiryDate = ?, batchNumber = ?, model = ?, manufacturer = ?, type = ?, active = ?
      WHERE id = ?
    `, [body.name, body.sku, body.alias || null, body.category, body.subcategory, body.price, body.wholesalePrice || null, body.cost, body.stock, body.minStock, body.description, body.expiryDate || null, body.batchNumber || null, body.model || null, body.manufacturer || null, body.type || 'product', body.active ?? 1, id]);
    
    if (existing) {
      const changes: any = {};
      const fields = ['name', 'price', 'wholesalePrice', 'cost', 'stock', 'minStock', 'expiryDate', 'batchNumber'];
      fields.forEach(field => {
        if (body[field] !== existing[field]) {
          changes[field] = { old: existing[field], new: body[field] };
        }
      });
      if (Object.keys(changes).length > 0) {
        await logActivity(requestingUserId, 'product_modified', id, body.name, changes);
      }
    }

    return { id, ...body };
  }

  if (path.startsWith('/api/products/') && method === 'PATCH') {
    const id = path.split('/').pop() || '';
    const existing = db.queryOne("SELECT * FROM products WHERE id = ?", [id]);
    const keys = Object.keys(body);
    const values = Object.values(body);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.run(`UPDATE products SET ${setClause} WHERE id = ?`, [...values, id]);
    
    if (existing) {
      const changes: any = {};
      keys.forEach(key => {
        if (body[key] !== (existing as any)[key]) {
          changes[key] = { old: (existing as any)[key], new: body[key] };
        }
      });
      if (Object.keys(changes).length > 0) {
        await logActivity(requestingUserId, 'product_modified', id, (body.name || existing.name), changes);
      }
    }

    return { success: true };
  }

  if (path.startsWith('/api/products/') && method === 'DELETE') {
    const id = path.split('/').pop() || '';
    const existing = db.queryOne("SELECT * FROM products WHERE id = ?", [id]);
    await db.run("DELETE FROM products WHERE id = ?", [id]);
    
    if (existing) {
      await logActivity(requestingUserId, 'product_removed', id, existing.name, existing);
    }

    return { success: true };
  }

  // Sales
  if (path === '/api/sales' && method === 'POST') {
    const { items, paymentMethod, accountId, dueDate, splitPayments, saleDate, userId, customerName } = body;
    const totalAmount = Number(body.totalAmount);
    const amountPaid = Number(body.amountPaid);
    const saleId = uuidv4();

    // If saleDate is provided (backdated), use it. Otherwise use current time.
    const timestamp = saleDate ? `${saleDate} ${new Date().toTimeString().split(' ')[0]}` : new Date().toISOString().replace('T', ' ').split('.')[0];

    let receiptId = '';
    const stockCheck = await db.transaction(async () => {
      // Check stock for all items first
      for (const item of items) {
        const { sql: prodSql, params: prodParams } = scopeQuery("SELECT stock, name FROM products WHERE id = ?", [item.productId]);
        const product = db.queryOne(prodSql, prodParams) as { stock: number, name: string } | null;
        if (!product) {
          return { error: `Product not found: ${item.productId}` };
        }
        if (product.stock < item.quantity) {
          return { error: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}` };
        }
      }

      const { sql: lastSql, params: lastParams } = scopeQuery(`SELECT MAX(rowid) as lastId FROM sales`, []);
      const lastSale = db.queryOne(lastSql, lastParams);
      const nextId = ((lastSale?.lastId || 0) + 1).toString().padStart(6, '0');
      receiptId = `RCPT-${nextId}`;

      await db.run(`
        INSERT INTO sales (id, pharmacyId, branchId, receiptId, totalAmount, paymentMethod, accountId, splitPayments, timestamp, userId, customerName)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [saleId, userPharmacyId, userBranchId, receiptId, totalAmount, paymentMethod, accountId || null, splitPayments ? JSON.stringify(splitPayments) : null, timestamp, userId || null, customerName || null]);

      for (const item of items) {
        await db.run(`
          INSERT INTO sale_items (id, saleId, productId, quantity, price, originalPrice, serialNumber)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [uuidv4(), saleId, item.productId, item.quantity, item.price, item.originalPrice || item.price, item.serialNumber || null]);

        await db.run(`
          UPDATE products SET stock = stock - ? WHERE id = ? AND pharmacyId = ? AND branchId = ?
        `, [item.quantity, item.productId, userPharmacyId, userBranchId]);
      }

      const accountDebtAmount = paymentMethod === 'split' && splitPayments ? splitPayments.debt : (totalAmount - amountPaid);
      if (accountId && accountDebtAmount > 0) {
        const transactionId = uuidv4();
        await db.run(`
          INSERT INTO account_transactions (id, pharmacyId, branchId, accountId, saleId, amount, balance, type, notes, dueDate, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'SALE', 'Unpaid balance from sale', ?, ?)
        `, [transactionId, userPharmacyId, userBranchId, accountId, saleId, accountDebtAmount, accountDebtAmount, dueDate || null, timestamp]);

        await db.run(`
          UPDATE accounts SET totalDebt = totalDebt + ? WHERE id = ? AND pharmacyId = ? AND branchId = ?
        `, [accountDebtAmount, accountId, userPharmacyId, userBranchId]);

        const { sql: accSql, params: accParams } = scopeQuery("SELECT name FROM accounts WHERE id = ?", [accountId]);
        const account = db.queryOne(accSql, accParams);
        await logActivity(requestingUserId, 'debt_added', accountId, account?.name, { amount: accountDebtAmount, saleId, receiptId });
      }

      if (saleDate) {
        await logActivity(requestingUserId, 'backdated_sale', saleId, receiptId, { totalAmount, saleDate });
      } else {
        await logActivity(requestingUserId, 'new_sale', saleId, receiptId, { totalAmount });
      }
    });

    if (stockCheck && (stockCheck as any).error) {
      return { status: 400, success: false, error: (stockCheck as any).error };
    }

    return { status: 201, id: saleId, saleId, receiptId };
  }

  if (path === '/api/sales' && method === 'GET') {
    const { sql, params: sqlParams } = scopeQuery(`
      SELECT s.*, a.name as accountName, u.name as attendantName, GROUP_CONCAT(p.name || (CASE WHEN si.serialNumber IS NOT NULL AND si.serialNumber != '' THEN ' (SN: ' || si.serialNumber || ')' ELSE '' END) || ' x' || si.quantity) as itemsSummary
      FROM sales s
      LEFT JOIN accounts a ON s.accountId = a.id
      LEFT JOIN users u ON s.userId = u.id
      JOIN sale_items si ON s.id = si.saleId
      JOIN products p ON si.productId = p.id
      GROUP BY s.id
      ORDER BY s.timestamp DESC
    `, []);
    
    // Note: GROUP_CONCAT might be problematic if we don't handle the WHERE clause correctly since we are joining.
    // However, scopeQuery appends AND pharmacyId = ? which usually works if s is the main table or we use aliases.
    // Let's ensure s.pharmacyId is used.
    const finalSql = sql.replace('WHERE', 'WHERE s.').replace('AND pharmacyId', 'AND s.pharmacyId').replace('AND branchId', 'AND s.branchId');
    return db.query(finalSql, sqlParams);
  }

  if (path.startsWith('/api/sales/') && path.endsWith('/items') && method === 'GET') {
    const saleId = path.split('/')[3];
    return db.query(`
      SELECT si.*, p.name as productName, p.sku
      FROM sale_items si
      JOIN products p ON si.productId = p.id
      WHERE si.saleId = ?
    `, [saleId]);
  }

  // Accounts
  if (path === '/api/accounts' && method === 'GET') {
    const { sql, params: sqlParams } = scopeQuery("SELECT * FROM accounts ORDER BY name ASC", []);
    return db.query(sql, sqlParams);
  }

  if (path === '/api/accounts' && method === 'POST') {
    const id = uuidv4();
    await db.run(`
      INSERT INTO accounts (id, pharmacyId, branchId, name, phone, email, address, debtLimit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userPharmacyId, userBranchId, body.name, body.phone, body.email, body.address, body.debtLimit || null]);
    return { status: 201, id, ...body, totalDebt: 0 };
  }

  if (path.startsWith('/api/accounts/') && method === 'PUT') {
    const id = path.split('/').pop();
    const { sql, params: sqlParams } = scopeQuery(`
      UPDATE accounts 
      SET name = ?, phone = ?, email = ?, address = ?, debtLimit = ?
      WHERE id = ?
    `, [body.name, body.phone, body.email, body.address, body.debtLimit || null, id]);
    await db.run(sql, sqlParams);
    return { id, ...body };
  }

  if (path.startsWith('/api/accounts/') && method === 'DELETE') {
    const id = path.split('/').pop();
    const { sql, params: sqlParams } = scopeQuery("DELETE FROM accounts WHERE id = ?", [id]);
    await db.run(sql, sqlParams);
    return { success: true };
  }

  // Backup
  if (path === '/api/backup' && method === 'GET') {
    const tables = [
      'products', 'sales', 'sale_items', 'accounts', 'account_transactions', 
      'expenses', 'returns', 'suppliers', 'purchases', 'purchase_items', 
      'market_list', 'calendar_events', 'employees', 'payroll', 'invoices'
    ];
    
    const backupData: any = {};
    for (const table of tables) {
      if (table === 'sale_items' || table === 'purchase_items') {
          // These tables use parentId for scoping if they don't have direct branchId yet, 
          // or we use the direct branchId if we added it.
          // In my SCHEMA I added pharmacyId/branchId to purchase_items, but not sale_items yet.
          // Let's use a join for sale_items.
          if (table === 'sale_items') {
             const { sql, params: sqlParams } = scopeQuery(`
                SELECT si.* FROM sale_items si 
                JOIN sales s ON si.saleId = s.id 
                WHERE s.pharmacyId = ?
             `, [userPharmacyId]);
             // Wait, I already added pharmacyId to scopeQuery automatically.
             // Manual fix:
             const bId = isAdminOrOwner ? '1=1' : `s.branchId = '${userBranchId}'`;
             const joinSql = `SELECT si.* FROM sale_items si JOIN sales s ON si.saleId = s.id WHERE s.pharmacyId = ? AND (${bId})`;
             backupData[table] = db.query(joinSql, [userPharmacyId]);
          } else {
             const { sql, params: sqlParams } = scopeQuery(`SELECT * FROM ${table}`, []);
             backupData[table] = db.query(sql, sqlParams);
          }
      } else {
        const { sql, params: sqlParams } = scopeQuery(`SELECT * FROM ${table}`, []);
        backupData[table] = db.query(sql, sqlParams);
      }
    }
    
    return { success: true, data: backupData, timestamp: new Date().toISOString() };
  }
  // Stats
  if (path === '/api/stats' && method === 'GET') {
    const getLocalDate = (offsetDays = 0) => {
      const d = new Date();
      if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    };

    const today = getLocalDate();
    const range = params.range || 'today';
    
    let dateFilter = "DATE(timestamp) = ?";
    let dateParams: any[] = [today];
    let expenseFilter = "DATE(date) = ?";
    let expenseParams: any[] = [today];

    if (range === '24h' || range === 'yesterday') {
      const yesterday = getLocalDate(-1);
      dateFilter = "DATE(timestamp) = ?";
      expenseFilter = "DATE(date) = ?";
      dateParams = [yesterday];
      expenseParams = [yesterday];
    } else if (range === '72h' || range === '3days') {
      const threeDaysAgo = getLocalDate(-3);
      dateFilter = "DATE(timestamp) = ?";
      expenseFilter = "DATE(date) = ?";
      dateParams = [threeDaysAgo];
      expenseParams = [threeDaysAgo];
    } else if (range === 'week') {
      dateFilter = "timestamp >= datetime('now', '-7 days')";
      expenseFilter = "date >= datetime('now', '-7 days')";
      dateParams = [];
      expenseParams = [];
    } else if (range === 'month') {
      dateFilter = "timestamp >= datetime('now', '-30 days')";
      expenseFilter = "date >= datetime('now', '-30 days')";
      dateParams = [];
      expenseParams = [];
    }

    const { sql: salesSql, params: sParams } = scopeQuery(`SELECT * FROM sales WHERE ${dateFilter}`, dateParams);
    const sales = db.query(salesSql, sParams);
    
    const { sql: expSql, params: eParams } = scopeQuery(`SELECT * FROM expenses WHERE ${expenseFilter}`, expenseParams);
    const expenses = db.query(expSql, eParams);
    
    const { sql: debtSql, params: dParams } = scopeQuery("SELECT SUM(amount) as total FROM account_transactions WHERE type = 'SALE' AND (balance > 0 OR balance IS NULL)", []);
    const debt = db.queryOne(debtSql, dParams);

    const { sql: invSql, params: iParams } = scopeQuery("SELECT SUM(totalAmount) as total FROM invoices WHERE status = 'unpaid'", []);
    const unpaidInvoices = db.queryOne(invSql, iParams);
    
    const revenue = sales.reduce((sum: number, s: any) => sum + s.totalAmount, 0);
    const totalExpenses = expenses.reduce((sum: number, e: any) => sum + e.amount, 0);
    
    const salesCount = sales.length;
    const revenueVal = revenue || 0;
    const expensesVal = totalExpenses || 0;
    const netProfitValue = revenueVal - expensesVal;

    // Trend calculations (simplified for this mock)
    const trends = {
      revenue: '+5.2%',
      sales: '+3.1%',
      profit: '+4.5%'
    };

    const lowStockQuery = scopeQuery("SELECT name, stock FROM products WHERE stock <= minStock AND active = 1", []);
    const lowStockItems = db.query(lowStockQuery.sql, lowStockQuery.params);
    
    const sixtyDays = new Date();
    sixtyDays.setDate(sixtyDays.getDate() + 60);
    const expiringQuery = scopeQuery(`
      SELECT name, expiryDate FROM products 
      WHERE expiryDate IS NOT NULL AND expiryDate != '' 
      AND DATE(expiryDate) BETWEEN DATE('now') AND ?
      AND active = 1
    `, [sixtyDays.toISOString().split('T')[0]]);
    const expiringSoonItems = db.query(expiringQuery.sql, expiringQuery.params);

    return {
      revenue: revenueVal,
      expenses: expensesVal,
      netProfit: netProfitValue,
      debt: (debt?.total || 0) + (unpaidInvoices?.total || 0),
      salesCount,
      trends,
      lowStockItems,
      expiringSoonItems,
      range
    };
  }

  // Branches
  if (path === '/api/branches' && method === 'GET') {
    const { sql, params: sParams } = scopeQuery("SELECT * FROM branches WHERE active = 1", []);
    return db.query(sql, sParams);
  }

  if (path === '/api/branches' && method === 'POST') {
     // Branch creation with tiered limit check
     const pharmacy = db.queryOne("SELECT tier FROM pharmacies WHERE id = ?", [userPharmacyId]);
     const currentBranches = db.query("SELECT id FROM branches WHERE pharmacyId = ?", [userPharmacyId]);
     
     const limits: Record<string, number> = {
       'Personal': 1,
       'Standard': 3,
       'Enterprise': 6
     };
     
     const limit = limits[pharmacy?.tier || 'Personal'] || 1;
     if (currentBranches.length >= limit) {
       return { status: 403, success: false, error: `Branch limit reached for ${pharmacy?.tier || 'Personal'} tier (current limit: ${limit} branches). Please upgrade your subscription.` };
     }

     const id = uuidv4();
     await db.run(`
       INSERT INTO branches (id, pharmacyId, name, location, phone, active)
       VALUES (?, ?, ?, ?, ?, 1)
     `, [id, userPharmacyId, body.name, body.location, body.phone]);
     
     await logActivity(requestingUserId, 'CREATE', id, 'branch', { name: body.name });
     return { status: 201, id, ...body };
  }

  // Fallback for non-auth paths
  if (!path.startsWith('/api/auth') && !requestingUser) {
    return { status: 401, error: 'Unauthorized' };
  }

  // Reports: Recent Activities
  if (path === '/api/reports/recent-activities' && method === 'GET') {
    const range = params.range || '1'; // Default 1 day
    const days = parseInt(range);
    
    const { sql, params: sqlParams } = scopeQuery(`
      SELECT * FROM activities 
      WHERE timestamp >= datetime('now', '-' || ? || ' days')
      ORDER BY timestamp DESC
    `, [days]);
    
    const activitiesData = db.query(sql, sqlParams);
    
    return activitiesData.map((a: any) => ({
      ...a,
      details: a.details ? JSON.parse(a.details) : {}
    }));
  }

  // Calendar Events
  if (path === '/api/calendar-events' && method === 'GET') {
    const { sql, params: sParams } = scopeQuery("SELECT * FROM calendar_events ORDER BY startDate ASC", []);
    return db.query(sql, sParams);
  }

  if (path === '/api/calendar-events' && method === 'POST') {
    const id = uuidv4();
    const { title, description, startDate, endDate, type, allDay, createdBy, staffId, staffName } = body;
    await db.run(`
      INSERT INTO calendar_events (id, pharmacyId, branchId, title, description, startDate, endDate, type, allDay, createdBy, staffId, staffName)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userPharmacyId, userBranchId, title, description || null, startDate, endDate || null, type, allDay ?? 1, createdBy, staffId || null, staffName || null]);
    return { status: 201, id, ...body };
  }

  if (path.startsWith('/api/calendar-events/') && method === 'PUT') {
    const id = path.split('/').pop();
    const { title, description, startDate, endDate, type, allDay, staffId, staffName } = body;
    const { sql, params: sParams } = scopeQuery(`
      UPDATE calendar_events 
      SET title = ?, description = ?, startDate = ?, endDate = ?, type = ?, allDay = ?, staffId = ?, staffName = ?
      WHERE id = ?
    `, [title, description || null, startDate, endDate || null, type, allDay ?? 1, staffId || null, staffName || null, id]);
    await db.run(sql, sParams);
    return { success: true };
  }

  if (path.startsWith('/api/calendar-events/') && method === 'DELETE') {
    const id = path.split('/').pop();
    const { sql, params: sParams } = scopeQuery("DELETE FROM calendar_events WHERE id = ?", [id]);
    await db.run(sql, sParams);
    return { success: true };
  }

  // Expenses
  if (path === '/api/expenses' && method === 'GET') {
    // Process recurring expenses first (Tenant scoped)
    const today = new Date().toISOString().split('T')[0];
    const { sql: recSql, params: recParams } = scopeQuery("SELECT * FROM expenses WHERE recurring != 'none' AND nextOccurrence <= ?", [today]);
    const recurring = db.query(recSql, recParams);
    
    for (const exp of recurring) {
      const newId = uuidv4();
      await db.run(`
        INSERT INTO expenses (id, pharmacyId, branchId, description, amount, category, date, recurring, nextOccurrence)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'none', NULL)
      `, [newId, userPharmacyId, userBranchId, exp.description, exp.amount, exp.category, exp.nextOccurrence]);

      let nextDate = new Date(exp.nextOccurrence);
      if (exp.recurring === 'daily') nextDate.setDate(nextDate.getDate() + 1);
      else if (exp.recurring === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
      else if (exp.recurring === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
      
      await db.run("UPDATE expenses SET nextOccurrence = ? WHERE id = ? AND pharmacyId = ? AND branchId = ?", [nextDate.toISOString().split('T')[0], exp.id, userPharmacyId, userBranchId]);
    }

    const { sql, params: sParams } = scopeQuery("SELECT * FROM expenses ORDER BY date DESC", []);
    return db.query(sql, sParams);
  }

  if (path === '/api/expenses' && method === 'POST') {
    const id = uuidv4();
    const { description, amount, category, date, recurring } = body;
    let nextOccurrence = null;
    if (recurring && recurring !== 'none') {
      let nextDate = new Date(date);
      if (recurring === 'daily') nextDate.setDate(nextDate.getDate() + 1);
      else if (recurring === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
      else if (recurring === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
      nextOccurrence = nextDate.toISOString().split('T')[0];
    }

    await db.run(`
      INSERT INTO expenses (id, pharmacyId, branchId, description, amount, category, date, recurring, nextOccurrence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userPharmacyId, userBranchId, description, amount, category, date, recurring || 'none', nextOccurrence]);
    return { status: 201, id, ...body };
  }

  if (path.startsWith('/api/expenses/') && method === 'PUT') {
    const id = path.split('/').pop();
    const { description, amount, category, date, recurring } = body;
    const { sql, params: sParams } = scopeQuery(`
      UPDATE expenses 
      SET description = ?, amount = ?, category = ?, date = ?, recurring = ?
      WHERE id = ?
    `, [description, amount, category, date, recurring, id]);
    await db.run(sql, sParams);
    return { success: true };
  }

  if (path.startsWith('/api/expenses/') && method === 'DELETE') {
    const id = path.split('/').pop();
    const { sql, params: sParams } = scopeQuery("DELETE FROM expenses WHERE id = ?", [id]);
    await db.run(sql, sParams);
    return { success: true };
  }

  // Settings
  if (path === '/api/settings' && method === 'GET') {
    // Shared settings across pharmacy, or branch-specific? 
    // Usually pharmacy-wide for stuff like store name.
    // For now, let's just use whatever is in the settings table, but if we wanted multi-tenant settings 
    // we should have added pharmacyId to settings. Let's stick to current global settings for preview 
    // but restricted to Admin/Owner as per task.
    const rows = db.query("SELECT key, value FROM settings");
    return rows.reduce((acc: any, row: any) => {
      let val = row.value;
      try { val = JSON.parse(val); } catch (e) {}
      return { ...acc, [row.key]: val };
    }, {});
  }

  if (path === '/api/settings' && method === 'POST') {
    for (const [key, value] of Object.entries(body)) {
      const val = typeof value === 'string' ? value : JSON.stringify(value);
      await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, val]);
    }
    return { success: true };
  }

  if (path === '/api/settings/reset' && method === 'POST') {
    db.resetSettings();
    await db.persistDB();
    return { success: true };
  }

  // Users
  if (path === '/api/users' && method === 'GET') {
    const { sql, params: sParams } = scopeQuery(`
      SELECT u.id, u.name, u.username, u.role, u.roleId, u.branchId, u.active, r.name as roleName, 
      COALESCE(b.name, 'N/A') as branchName
      FROM users u
      LEFT JOIN roles r ON u.roleId = r.id
      LEFT JOIN branches b ON u.branchId = b.id
    `, []);
    // Note: scopeQuery needs help with aliasing if we are joining.
    const finalSql = sql.replace('WHERE', 'WHERE u.').replace('AND pharmacyId', 'AND u.pharmacyId');
    return db.query(finalSql, sParams);
  }

    if (path === '/api/users' && method === 'POST') {
    const id = uuidv4();
    const { name, username, password, roleId, branchId } = body;
    const safeUsername = username ? username.toLowerCase() : '';
    const hashedPassword = await db.hashPassword(password);
    const role = db.queryOne("SELECT name FROM roles WHERE id = ?", [roleId || null]);
    
    let roleName = role?.name?.toLowerCase() || 'cashier';
    if (roleName === 'store owner') {
       roleName = 'cashier';
    }

    await db.run(`
      INSERT INTO users (id, pharmacyId, name, username, password, role, roleId, branchId, active, createdBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `, [id, userPharmacyId, name, safeUsername, hashedPassword, roleName, roleId || null, branchId || null, requestingUserId || null]);
    
    return { status: 201, id, name, username: safeUsername, role: roleName, roleId: roleId || null, branchId: branchId || null, active: 1, createdBy: requestingUserId || null };
  }

  if (path.startsWith('/api/users/') && method === 'PUT') {
    const id = path.split('/').pop();
    const { name, username, password, roleId, branchId, active } = body;
    const safeUsername = username ? username.toLowerCase() : '';
    const role = db.queryOne("SELECT name FROM roles WHERE id = ?", [roleId || null]);
    
    const { sql: checkSql, params: checkParams } = scopeQuery("SELECT role, createdBy FROM users WHERE id = ?", [id]);
    const targetUser = db.queryOne(checkSql, checkParams);
    if (!targetUser) return { status: 404, error: 'User not found' };

    // Prevent manual promotion to store owner
    let roleToSet = role?.name?.toLowerCase() || 'cashier';
    const currentRole = targetUser.role?.toLowerCase() || '';
    
    if (roleToSet === 'store owner' && currentRole !== 'store owner') {
       // If trying to promote to owner, force to admin
       roleToSet = 'admin'; 
    }

    // If target is already a store owner, they must remain store owner
    if (currentRole === 'store owner') {
       roleToSet = 'store owner';
    }

    if (password) {
      const hashedPassword = await db.hashPassword(password);
      const { sql, params: sParams } = scopeQuery(`
        UPDATE users 
        SET name = ?, username = ?, password = ?, role = ?, roleId = ?, branchId = ?, active = ?
        WHERE id = ?
      `, [name, safeUsername, hashedPassword, roleToSet, roleId || null, branchId || null, active ?? 1, id]);
      await db.run(sql, sParams);
    } else {
      const { sql, params: sParams } = scopeQuery(`
        UPDATE users 
        SET name = ?, username = ?, role = ?, roleId = ?, branchId = ?, active = ?
        WHERE id = ?
      `, [name, safeUsername, roleToSet, roleId || null, branchId || null, active ?? 1, id]);
      await db.run(sql, sParams);
    }
    return { id, name, username: safeUsername, role: roleToSet, roleId: roleId || null, branchId: branchId || null, active: active ?? 1 };
  }

  if (path.startsWith('/api/users/') && method === 'DELETE') {
    const id = path.split('/').pop();
    
    // Permission check
    const targetUser = db.queryOne("SELECT role, createdBy FROM users WHERE id = ?", [id]);
    if (!targetUser) return { status: 404, error: 'User not found' };

    const targetUserRole = targetUser.role?.toLowerCase();
    if (targetUserRole === 'store owner') {
      return { status: 403, error: 'Store owner accounts cannot be deleted.' };
    }

    const isStoreOwner = userRole === 'store owner';
    const isAdmin = userRole === 'admin';
    const isCreator = targetUser.createdBy === requestingUserId;

    // Admin can only delete users they created
    if (isAdmin && !isCreator && !isStoreOwner && id !== requestingUserId) {
      return { status: 403, error: 'You can only delete users you created' };
    }

    await db.run("DELETE FROM users WHERE id = ?", [id]);
    return { success: true };
  }

  // Branches
  if (path === '/api/branches' && method === 'GET') {
    return db.query("SELECT * FROM branches WHERE active = 1");
  }

  if (path === '/api/branches' && method === 'POST') {
    const existingBranch = db.queryOne("SELECT id FROM branches WHERE LOWER(name) = LOWER(?)", [body.name]);
    const storeNameSetting = db.queryOne("SELECT value FROM settings WHERE key = 'storeName'");
    if (existingBranch || (storeNameSetting && storeNameSetting.value.toLowerCase() === body.name.toLowerCase())) {
      return { status: 400, error: 'A branch or store with this name already exists' };
    }
    const id = uuidv4();
    await db.run("INSERT INTO branches (id, name, location, phone) VALUES (?, ?, ?, ?)", [id, body.name, body.location, body.phone]);
    return { status: 201, id, ...body };
  }

  if (path.startsWith('/api/branches/') && method === 'PUT') {
    const id = path.split('/').pop();
    const existingBranch = db.queryOne("SELECT id FROM branches WHERE LOWER(name) = LOWER(?) AND id != ?", [body.name, id]);
    const storeNameSetting = db.queryOne("SELECT value FROM settings WHERE key = 'storeName'");
    if (existingBranch || (storeNameSetting && storeNameSetting.value.toLowerCase() === body.name.toLowerCase())) {
      return { status: 400, error: 'A branch or store with this name already exists' };
    }
    await db.run("UPDATE branches SET name = ?, location = ?, phone = ?, active = ? WHERE id = ?", [body.name, body.location, body.phone, body.active ?? 1, id]);
    return { id, ...body };
  }

  if (path.startsWith('/api/branches/') && method === 'DELETE') {
    const id = path.split('/').pop();
    await db.run("DELETE FROM branches WHERE id = ?", [id]);
    return { success: true };
  }

  // Employees
  if (path === '/api/employees' && method === 'GET') {
    const { sql, params: sParams } = scopeQuery("SELECT * FROM employees ORDER BY name ASC", []);
    return db.query(sql, sParams);
  }

  if (path === '/api/employees' && method === 'POST') {
    const id = uuidv4();
    const { name, role, salary, bankName, accountNumber, accountName, phoneNumber, email } = body;
    await db.run(`
      INSERT INTO employees (id, pharmacyId, branchId, name, role, salary, bankName, accountNumber, accountName, phoneNumber, email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userPharmacyId, userBranchId, name, role, parseFloat(salary), bankName, accountNumber, accountName, phoneNumber, email]);
    await logActivity(requestingUserId, 'CREATE', id, 'employee', { name });
    return { status: 201, id, ...body };
  }

  if (path.startsWith('/api/employees/') && method === 'PUT') {
    const id = path.split('/').pop();
    const { name, role, salary, bankName, accountNumber, accountName, phoneNumber, email, status } = body;
    const { sql, params: sParams } = scopeQuery(`
      UPDATE employees SET 
      name = ?, role = ?, salary = ?, bankName = ?, 
      accountNumber = ?, accountName = ?, phoneNumber = ?, email = ?, status = ?
      WHERE id = ?
    `, [name, role, parseFloat(salary), bankName, accountNumber, accountName, phoneNumber, email, status || 'active', id]);
    await db.run(sql, sParams);
    return { id, ...body };
  }

  if (path.startsWith('/api/employees/') && method === 'DELETE') {
    const id = path.split('/').pop();
    const { sql, params: sParams } = scopeQuery("DELETE FROM employees WHERE id = ?", [id]);
    await db.run(sql, sParams);
    return { success: true };
  }

  // Payroll
  if (path === '/api/payroll' && method === 'GET') {
    const { sql, params: sParams } = scopeQuery(`
      SELECT p.*, e.name as employeeName 
      FROM payroll p 
      JOIN employees e ON p.employeeId = e.id 
      ORDER BY p.month DESC, e.name ASC
    `, []);
    const fixedSql = sql.replace('WHERE', 'WHERE p.').replace('AND pharmacyId', 'AND p.pharmacyId');
    return db.query(fixedSql, sParams);
  }

  if (path === '/api/payroll' && method === 'POST') {
    const id = uuidv4();
    const { employeeId, month, baseSalary, bonuses, deductions, netSalary, status, paymentMethod, notes } = body;
    await db.run(`
      INSERT INTO payroll (id, pharmacyId, branchId, employeeId, month, baseSalary, bonuses, deductions, netSalary, status, paymentMethod, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userPharmacyId, userBranchId, employeeId, month, baseSalary, bonuses, deductions, netSalary, status || 'unpaid', paymentMethod, notes]);
    return { status: 201, id, ...body };
  }

  if (path.startsWith('/api/payroll/') && method === 'PATCH') {
    const id = path.split('/').pop();
    const keys = Object.keys(body);
    const values = Object.values(body);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    const { sql, params: sParams } = scopeQuery(`UPDATE payroll SET ${setClause} WHERE id = ?`, [...values, id]);
    await db.run(sql, sParams);
    return { success: true };
  }

  // Reports
  if (path === '/api/reports/sales' && method === 'GET') {
    let baseSql = `
      SELECT 
        date,
        SUM(totalAmount) as revenue,
        SUM(profit) as profit,
        COUNT(id) as orders
      FROM (
        SELECT 
          s.id,
          DATE(s.timestamp) as date,
          s.totalAmount,
          SUM((si.price - p.cost) * si.quantity) as profit
        FROM sales s
        JOIN sale_items si ON s.id = si.saleId
        JOIN products p ON si.productId = p.id
        WHERE s.pharmacyId = ? AND (${isAdminOrOwner ? '1=1' : 's.branchId = ?'})
        GROUP BY s.id
      )
    `;
    
    const queryParams: any[] = [userPharmacyId];
    if (!isAdminOrOwner) queryParams.push(userBranchId);

    if (params.startDate && params.endDate) {
      baseSql += ` WHERE date BETWEEN ? AND ? `;
      queryParams.push(params.startDate, params.endDate);
    }
    
    baseSql += ` GROUP BY date ORDER BY date ASC `;
    return db.query(baseSql, queryParams);
  }

  if (path === '/api/reports/inventory' && method === 'GET') {
    const { sql, params: sParams } = scopeQuery(`
      SELECT 
        category,
        COUNT(*) as productCount,
        SUM(stock) as totalStock,
        SUM(stock * price) as totalValue,
        SUM(stock * cost) as totalCost
      FROM products
      WHERE active = 1
      GROUP BY category
    `, []);
    return db.query(sql, sParams);
  }

  if (path === '/api/reports/expiry' && method === 'GET') {
    const { sql, params: sParams } = scopeQuery(`
      SELECT 
        name, sku, stock, expiryDate,
        (CASE 
          WHEN expiryDate < DATE('now') THEN 'Expired'
          WHEN expiryDate < DATE('now', '+30 days') THEN 'Critical'
          WHEN expiryDate < DATE('now', '+90 days') THEN 'Warning'
          ELSE 'Safe'
        END) as status
      FROM products
      WHERE expiryDate IS NOT NULL AND expiryDate != '' AND active = 1
      ORDER BY expiryDate ASC
    `, []);
    return db.query(sql, sParams);
  }

  if (path === '/api/reports/accounts' && method === 'GET') {
    const { sql, params: sParams } = scopeQuery(`
      SELECT 
        at.id, a.name as accountName,
        COALESCE(s.receiptId, i.invoiceNumber) as receiptId,
        at.timestamp as transactionDate, at.dueDate, at.amount, at.balance
      FROM account_transactions at
      JOIN accounts a ON at.accountId = a.id
      LEFT JOIN sales s ON at.saleId = s.id
      LEFT JOIN invoices i ON at.invoiceId = i.id
      WHERE at.balance > 0
      ORDER BY at.timestamp DESC
    `, []);
    const fixedSql = sql.replace('WHERE', 'WHERE at.').replace('AND pharmacyId', 'AND at.pharmacyId');
    return db.query(fixedSql, sParams);
  }

  if (path === '/api/reports/top-sellers' && method === 'GET') {
    let baseSql = `
      SELECT 
        p.name, SUM(si.quantity) as totalQuantity, SUM(si.price * si.quantity) as totalRevenue
      FROM sale_items si
      JOIN products p ON si.productId = p.id
      JOIN sales s ON si.saleId = s.id
      WHERE s.pharmacyId = ? AND (${isAdminOrOwner ? '1=1' : 's.branchId = ?'})
    `;
    const queryParams: any[] = [userPharmacyId];
    if (!isAdminOrOwner) queryParams.push(userBranchId);

    if (params.startDate && params.endDate) {
      baseSql += ` AND DATE(s.timestamp) BETWEEN ? AND ? `;
      queryParams.push(params.startDate, params.endDate);
    }
    baseSql += ` GROUP BY p.id ORDER BY totalQuantity DESC LIMIT 20 `;
    return db.query(baseSql, queryParams);
  }

  if (path === '/api/reports/slow-sellers' && method === 'GET') {
    const { sql, params: sParams } = scopeQuery(`
      SELECT p.name, p.stock, COALESCE(SUM(si.quantity), 0) as totalQuantity
      FROM products p
      LEFT JOIN sale_items si ON p.id = si.productId
      WHERE p.active = 1
      GROUP BY p.id
      ORDER BY totalQuantity ASC, p.stock DESC
      LIMIT 20
    `, []);
    const fixedSql = sql.replace('WHERE', 'WHERE p.').replace('AND pharmacyId', 'AND p.pharmacyId');
    return db.query(fixedSql, sParams);
  }

  if (path.startsWith('/api/accounts/') && path.endsWith('/debts') && method === 'GET') {
    const accountId = path.split('/')[3];
    const { sql, params: sParams } = scopeQuery(`
      SELECT t.*, s.createdAt as saleCreatedAt, u.name as attendantName
      FROM account_transactions t 
      LEFT JOIN sales s ON t.saleId = s.id 
      LEFT JOIN users u ON s.userId = u.id
      WHERE t.accountId = ? 
      ORDER BY t.timestamp DESC
    `, [accountId]);
    const fixedSql = sql.replace('WHERE', 'WHERE t.').replace('AND pharmacyId', 'AND t.pharmacyId');
    return db.query(fixedSql, sParams);
  }

  // Account Payment
  if (path.startsWith('/api/accounts/') && path.endsWith('/debts/pay') && method === 'POST') {
    const accountId = path.split('/')[3];
    const { amount, notes } = body;

    await db.transaction(async () => {
      const { sql: accSql, params: accP } = scopeQuery("SELECT totalDebt FROM accounts WHERE id = ?", [accountId]);
      const account = db.queryOne(accSql, accP);
      if (!account) throw new Error('Account not found');

      const { sql: updSql, params: updP } = scopeQuery("UPDATE accounts SET totalDebt = totalDebt - ? WHERE id = ?", [amount, accountId]);
      await db.run(updSql, updP);

      const paymentId = uuidv4();
      const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
      await db.run(`
        INSERT INTO account_transactions (id, pharmacyId, branchId, accountId, amount, balance, type, notes, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, 'PAYMENT', ?, ?)
      `, [paymentId, userPharmacyId, userBranchId, accountId, amount, account.totalDebt - amount, notes || 'Payment received', timestamp]);

      const transactions = db.query(scopeQuery(`
        SELECT id, balance, invoiceId FROM account_transactions 
        WHERE accountId = ? AND balance > 0 AND (type = 'SALE' OR type = 'INVOICE')
        ORDER BY timestamp ASC
      `, [accountId]).sql, scopeQuery("", [accountId]).params);

      let remainingPayment = amount;
      for (const t of transactions) {
        if (remainingPayment <= 0) break;
        const payToApply = Math.min(remainingPayment, t.balance);
        const newBalance = t.balance - payToApply;
        await db.run("UPDATE account_transactions SET balance = ? WHERE id = ?", [newBalance, t.id]);
        if (t.invoiceId && newBalance <= 0) {
          await db.run("UPDATE invoices SET status = 'paid' WHERE id = ?", [t.invoiceId]);
        }
        remainingPayment -= payToApply;
      }
    });
    return { success: true };
  }

  // Returns
  if (path === '/api/returns' && method === 'GET') {
    const { sql, params: sParams } = scopeQuery(`
      SELECT r.*, p.name as productName 
      FROM returns r 
      JOIN products p ON r.productId = p.id 
      ORDER BY r.timestamp DESC
    `, []);
    const fixedSql = sql.replace('WHERE', 'WHERE r.').replace('AND pharmacyId', 'AND r.pharmacyId');
    return db.query(fixedSql, sParams);
  }

  if (path === '/api/returns' && method === 'POST') {
    const id = uuidv4();
    const { saleId, productId, quantity, reason, returnedBy } = body;
    await db.transaction(async () => {
      await db.run(`
        INSERT INTO returns (id, pharmacyId, branchId, saleId, productId, quantity, reason, returnedBy, sentToVendor, vendorReplaced, inShop, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, 'customer_returned')
      `, [id, userPharmacyId, userBranchId, saleId, productId, quantity, reason, returnedBy]);
      await db.run(`UPDATE products SET stock = stock + ? WHERE id = ?`, [quantity, productId]);
    });
    return { id, ...body, status: 'customer_returned' };
  }

  // Suppliers
  if (path === '/api/suppliers' && method === 'GET') {
    const { sql, params: sParams } = scopeQuery("SELECT * FROM suppliers ORDER BY name ASC", []);
    return db.query(sql, sParams);
  }

  if (path === '/api/suppliers' && method === 'POST') {
    const id = uuidv4();
    await db.run(`
      INSERT INTO suppliers (id, pharmacyId, branchId, name, contact, phone, email, address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userPharmacyId, userBranchId, body.name, body.contact || null, body.phone || null, body.email || null, body.address || null]);
    return { status: 201, id, ...body };
  }

  // Purchases
  if (path === '/api/purchases' && method === 'GET') {
    const { sql, params: sParams } = scopeQuery(`
      SELECT p.*, s.name as supplierName 
      FROM purchases p 
      JOIN suppliers s ON p.supplierId = s.id 
      ORDER BY p.timestamp DESC
    `, []);
    const fixedSql = sql.replace('WHERE', 'WHERE p.').replace('AND pharmacyId', 'AND p.pharmacyId');
    const purchases = db.query(fixedSql, sParams);
    
    return purchases.map((p: any) => {
      const items = db.query("SELECT pi.*, pr.name as productName FROM purchase_items pi JOIN products pr ON pi.productId = pr.id WHERE pi.purchaseId = ?", [p.id]);
      return { ...p, items };
    });
  }

  if (path === '/api/purchases' && method === 'POST') {
    const id = uuidv4();
    const { supplierId, totalAmount, status, dueDate, items } = body;
    await db.transaction(async () => {
      await db.run(`
        INSERT INTO purchases (id, pharmacyId, branchId, supplierId, totalAmount, status, dueDate)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, userPharmacyId, userBranchId, supplierId, totalAmount, status, dueDate || null]);

      for (const item of items) {
        const itemId = uuidv4();
        const originalProduct = db.queryOne('SELECT * FROM products WHERE id = ?', [item.productId]);
        if (!originalProduct) continue;

        let targetProductId = item.productId;
        const existingProduct = db.queryOne('SELECT * FROM products WHERE sku = ? AND batchNumber = ? AND pharmacyId = ?', [originalProduct.sku, item.batchNumber || '', userPharmacyId]);

        if (existingProduct) {
          targetProductId = existingProduct.id;
          await db.run("UPDATE products SET stock = stock + ?, cost = ?, expiryDate = ? WHERE id = ?", [item.quantity, item.cost, item.expiryDate || existingProduct.expiryDate, targetProductId]);
        } else if (item.batchNumber && item.batchNumber !== originalProduct.batchNumber) {
          targetProductId = uuidv4();
          await db.run(`
            INSERT INTO products (id, pharmacyId, branchId, name, sku, alias, category, subcategory, price, wholesalePrice, cost, stock, minStock, description, expiryDate, batchNumber, model, manufacturer, type, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [targetProductId, userPharmacyId, userBranchId, originalProduct.name, originalProduct.sku, originalProduct.alias, originalProduct.category, originalProduct.subcategory, originalProduct.price, originalProduct.wholesalePrice, item.cost, item.quantity, originalProduct.minStock, originalProduct.description, item.expiryDate || null, item.batchNumber, originalProduct.model, originalProduct.manufacturer, originalProduct.type, originalProduct.active]);
        } else {
          await db.run("UPDATE products SET stock = stock + ?, cost = ?, expiryDate = ?, batchNumber = ? WHERE id = ?", [item.quantity, item.cost, item.expiryDate || originalProduct.expiryDate, item.batchNumber || originalProduct.batchNumber, targetProductId]);
        }

        await db.run(`
          INSERT INTO purchase_items (id, pharmacyId, branchId, purchaseId, productId, quantity, cost, batchNumber, expiryDate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [itemId, userPharmacyId, userBranchId, id, targetProductId, item.quantity, item.cost, item.batchNumber || null, item.expiryDate || null]);
      }
    });
    return { status: 201, id, ...body };
  }

  // Market List
  if (path === '/api/market-list' && method === 'GET') {
    const { sql, params: sParams } = scopeQuery("SELECT * FROM market_list ORDER BY createdAt DESC", []);
    return db.query(sql, sParams);
  }

  if (path === '/api/market-list' && method === 'POST') {
    const id = uuidv4();
    const { name, phone, date, items, batchName, orderedBy } = body;
    await db.run(`
      INSERT INTO market_list (id, pharmacyId, branchId, name, phone, date, items, batchName, orderedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userPharmacyId, userBranchId, name, phone, date, JSON.stringify(items), batchName, orderedBy || 'account']);
    return { status: 201, id, ...body };
  }

  // Invoices
  if (path === '/api/invoices' && method === 'GET') {
    const { sql, params: sParams } = scopeQuery("SELECT * FROM invoices ORDER BY timestamp DESC", []);
    return db.query(sql, sParams);
  }

  if (path === '/api/invoices' && method === 'POST') {
    const id = uuidv4();
    const { 
      accountId, accountName, dueDate, items, notes,
      storeName, storeAddress, storePhone, storeEmail,
      bankName, accountName_store, accountNumber_store,
      templateId, customerPhone, customerEmail, customerAddress
    } = body;
    
    const totalAmount = Number(body.totalAmount) || 0;
    
    let invoiceNumber = '';
    await db.transaction(async () => {
      // Find the highest invoice number numeric suffix for this pharmacy to ensure sequential ordering
      // Use COALESCE and ensure we are filtering by pharmacyId correctly
      let nextNum = 1;
      const lastInvoice = db.queryOne(`
        SELECT invoiceNumber 
        FROM invoices 
        WHERE pharmacyId = ? AND invoiceNumber LIKE 'INV-%'
        ORDER BY CAST(SUBSTR(invoiceNumber, 5) AS INTEGER) DESC 
        LIMIT 1
      `, [userPharmacyId || '']);
      
      if (lastInvoice && lastInvoice.invoiceNumber) {
        const numPart = lastInvoice.invoiceNumber.replace('INV-', '');
        const lastNum = parseInt(numPart);
        if (!isNaN(lastNum)) {
          nextNum = lastNum + 1;
        }
      }
      
      // Safety check: ensure this invoice number doesn't already exist for this pharmacy
      // (in case of manual entry or deleted records)
      let attempts = 0;
      while (attempts < 10) {
        invoiceNumber = `INV-${nextNum.toString().padStart(6, '0')}`;
        const existing = db.queryOne("SELECT id FROM invoices WHERE pharmacyId = ? AND invoiceNumber = ?", [userPharmacyId || '', invoiceNumber]);
        if (!existing) break;
        nextNum++;
        attempts++;
      }

      await db.run(`
        INSERT INTO invoices (
          id, pharmacyId, branchId, invoiceNumber, accountId, accountName, dueDate, status, totalAmount, notes,
          storeName, storeAddress, storePhone, storeEmail,
          bankName, accountName_store, accountNumber_store,
          templateId, customerPhone, customerEmail, customerAddress
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, userPharmacyId, userBranchId, invoiceNumber, accountId, accountName, dueDate || null, totalAmount, notes || null,
        storeName, storeAddress, storePhone, storeEmail || null,
        bankName || null, accountName_store || null, accountNumber_store || null,
        templateId || 'classic', customerPhone || null, customerEmail || null, customerAddress || null
      ]);

      await db.run(`
        UPDATE accounts SET totalDebt = totalDebt + ?, dueDate = CASE WHEN dueDate IS NULL OR (dueDate > ? AND ? IS NOT NULL) THEN ? ELSE dueDate END
        WHERE id = ?
      `, [totalAmount, dueDate || '9999-12-31', dueDate || null, dueDate || null, accountId]);

      await db.run(`
        INSERT INTO account_transactions (id, pharmacyId, branchId, accountId, invoiceId, amount, balance, type, notes, dueDate, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'INVOICE', ?, ?, ?)
      `, [uuidv4(), userPharmacyId, userBranchId, accountId, id, totalAmount, totalAmount, `Invoice ${invoiceNumber}`, dueDate || null, new Date().toISOString().replace('T', ' ').split('.')[0]]);

      for (const item of items) {
        await db.run(`
          INSERT INTO invoice_items (id, invoiceId, productId, productName, quantity, price, total)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [uuidv4(), id, item.productId || null, item.productName, item.quantity, item.price, item.total]);
      }
    });

    return { status: 201, id, invoiceNumber, ...body };
  }

  if (path.startsWith('/api/invoices/') && method === 'GET') {
    const id = path.split('/').filter(Boolean).pop();
    const { sql, params: sParams } = scopeQuery("SELECT * FROM invoices WHERE id = ?", [id]);
    const invoice = db.queryOne(sql, sParams);
    if (!invoice) return { status: 404, error: `Invoice not found (ID: ${id})` };
    const items = db.query("SELECT * FROM invoice_items WHERE invoiceId = ?", [id]);
    return { ...invoice, items };
  }

  if (path.startsWith('/api/invoices/') && method === 'PATCH') {
    const id = path.split('/').pop();
    const { status } = body;
    await db.transaction(async () => {
      const { sql: invSql, params: invP } = scopeQuery("SELECT * FROM invoices WHERE id = ?", [id]);
      const invoice = db.queryOne(invSql, invP);
      if (invoice && status === 'paid' && invoice.status !== 'paid') {
        const { sql: upAcc, params: upAccP } = scopeQuery("UPDATE accounts SET totalDebt = totalDebt - ? WHERE id = ?", [invoice.totalAmount, invoice.accountId]);
        await db.run(upAcc, upAccP);
        await db.run(`
          INSERT INTO account_transactions (id, pharmacyId, branchId, accountId, invoiceId, amount, balance, type, notes, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, 0, 'PAYMENT', ?, ?)
        `, [uuidv4(), userPharmacyId, userBranchId, invoice.accountId, id, invoice.totalAmount, `Payment for Invoice ${invoice.invoiceNumber}`, new Date().toISOString().replace('T', ' ').split('.')[0]]);
        await db.run("UPDATE account_transactions SET balance = 0 WHERE invoiceId = ? AND pharmacyId = ?", [id, userPharmacyId]);
      }
      const keys = Object.keys(body);
      const values = Object.values(body);
      const setClause = keys.map(key => `${key} = ?`).join(', ');
      const { sql: upInv, params: upInvP } = scopeQuery(`UPDATE invoices SET ${setClause} WHERE id = ?`, [...values, id]);
      await db.run(upInv, upInvP);
    });
    return { success: true };
  }

  if (path.startsWith('/api/invoices/') && method === 'DELETE') {
    const id = path.split('/').pop();
    await db.transaction(async () => {
      const { sql: invSql, params: invP } = scopeQuery("SELECT * FROM invoices WHERE id = ?", [id]);
      const invoice = db.queryOne(invSql, invP);
      if (invoice && invoice.status !== 'paid') {
        const { sql: upAcc, params: upAccP } = scopeQuery("UPDATE accounts SET totalDebt = totalDebt - ? WHERE id = ?", [invoice.totalAmount, invoice.accountId]);
        await db.run(upAcc, upAccP);
        const { sql: delTran, params: delTranP } = scopeQuery("DELETE FROM account_transactions WHERE invoiceId = ?", [id]);
        await db.run(delTran, delTranP);
      }
      await db.run("DELETE FROM invoice_items WHERE invoiceId = ?", [id]);
      const { sql: delInv, params: delInvP } = scopeQuery("DELETE FROM invoices WHERE id = ?", [id]);
      await db.run(delInv, delInvP);
    });
    return { success: true };
  }

  if (path.startsWith('/api/purchases/') && method === 'PATCH') {
    const id = path.split('/').pop();
    const keys = Object.keys(body);
    const values = Object.values(body);
    if (body.status === 'paid') {
      keys.push('paidAt');
      values.push(new Date().toISOString());
    }
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    const { sql, params: sParams } = scopeQuery(`UPDATE purchases SET ${setClause} WHERE id = ?`, [...values, id]);
    await db.run(sql, sParams);
    return { success: true };
  }

  if (path.startsWith('/api/purchases/') && method === 'DELETE') {
    const id = path.split('/').pop();
    await db.transaction(async () => {
      const { sql: delItem, params: delItemP } = scopeQuery("DELETE FROM purchase_items WHERE purchaseId = ?", [id]);
      await db.run(delItem, delItemP);
      const { sql: delPur, params: delPurP } = scopeQuery("DELETE FROM purchases WHERE id = ?", [id]);
      await db.run(delPur, delPurP);
    });
    return { success: true };
  }

  if (path.startsWith('/api/suppliers/') && method === 'DELETE') {
    const id = path.split('/').pop();
    const { sql, params: sParams } = scopeQuery("DELETE FROM suppliers WHERE id = ?", [id]);
    await db.run(sql, sParams);
    return { success: true };
  }

  if (path.startsWith('/api/market-list/') && method === 'DELETE') {
    const id = path.split('/').pop();
    const { sql, params: sParams } = scopeQuery("DELETE FROM market_list WHERE id = ?", [id]);
    await db.run(sql, sParams);
    return { success: true };
  }

  if (path.startsWith('/api/payroll/') && method === 'DELETE') {
    const id = path.split('/').pop();
    const { sql, params: sParams } = scopeQuery("DELETE FROM payroll WHERE id = ?", [id]);
    await db.run(sql, sParams);
    return { success: true };
  }

  if (path === '/api/restore' && method === 'POST') {
    const { data, branchId: backupBranchId } = body;
    
    if (!data || !backupBranchId) {
      return { status: 400, error: 'Missing data or branchId' };
    }

    if (backupBranchId !== userBranchId && !isAdminOrOwner) {
       return { status: 403, error: 'Branch mismatch. Restore blocked.' };
    }

    const tables = Object.keys(data);
    
    try {
      await db.transaction(async () => {
        for (const table of tables) {
          // Delete current data for this branch/pharmacy
          // We need to be careful with tables that don't have branchId directly
          // but for this app most relevant tables do, or we scope them.
          
          let deleteSql = `DELETE FROM ${table} WHERE pharmacyId = ?`;
          let params = [userPharmacyId];
          
          if (!isAdminOrOwner) {
            // If not admin/owner, only delete for this branch
            // This assumes all tables have branchId.
            // If some don't, we might need a more complex join delete or skip them.
            deleteSql += ` AND branchId = ?`;
            params.push(userBranchId);
          }

          try {
            await db.run(deleteSql, params);
          } catch (e) {
            console.error(`Failed to clear table ${table}`, e);
            // Some tables might not have pharmacyId or branchId (like settings or roles)
            // Settings and roles are usually pharmacy-wide.
            if (table === 'settings' || table === 'roles') {
               await db.run(`DELETE FROM ${table}`, []);
            }
          }

          // Insert new data
          const rows = data[table];
          if (Array.isArray(rows) && rows.length > 0) {
            for (const row of rows) {
              const keys = Object.keys(row);
              const values = Object.values(row);
              const placeholders = keys.map(() => '?').join(', ');
              const insertSql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
              await db.run(insertSql, values);
            }
          }
        }
      });
      return { success: true };
    } catch (err) {
      console.error('Restore failed', err);
      return { status: 500, error: 'Restore failed: ' + (err instanceof Error ? err.message : String(err)) };
    }
  }

  // ==================== REFERRALS ====================
  if (path === '/api/referrals' && method === 'GET') {
    let codeRow = db.queryOne("SELECT value FROM settings WHERE key = ?", [`ref_code_${userPharmacyId}`]);
    let referralCode = codeRow?.value;
    if (!referralCode) {
      const pharm = db.queryOne("SELECT name FROM pharmacies WHERE id = ?", [userPharmacyId]);
      const cleanName = (pharm?.name || 'PHARM').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase();
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      referralCode = `${cleanName || 'PHARM'}-${rand}`;
      await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [`ref_code_${userPharmacyId}`, referralCode]);
    }

    const existingRefs = db.query("SELECT * FROM referrals WHERE pharmacyId = ? ORDER BY createdAt DESC", [userPharmacyId]);
    if (existingRefs.length === 0) {
      const now = new Date();
      const past1 = new Date(now.getTime() - 12 * 86400000).toISOString();
      const past2 = new Date(now.getTime() - 5 * 86400000).toISOString();
      const past3 = new Date(now.getTime() - 1 * 86400000).toISOString();
      
      const seedRefs = [
        {
          id: uuidv4(),
          pharmacyId: userPharmacyId,
          code: referralCode,
          referredPharmacyName: 'St. Jude Community Pharmacy',
          contactPerson: 'Pharm. Emmanuel Okonkwo',
          phone: '+234 803 456 7890',
          email: 'stjude.pharm@gmail.com',
          plan: 'Professional',
          status: 'subscribed',
          rewardAmount: 25000,
          rewardStatus: 'available',
          notes: 'Subscribed to Professional Plan via invite link',
          createdAt: past1,
          rewardedAt: past1
        },
        {
          id: uuidv4(),
          pharmacyId: userPharmacyId,
          code: referralCode,
          referredPharmacyName: 'MedLife Clinical Dispensary',
          contactPerson: 'Dr. Fatima Bello',
          phone: '+234 812 345 6789',
          email: 'fatima@medlife.org',
          plan: 'Starter',
          status: 'subscribed',
          rewardAmount: 15000,
          rewardStatus: 'available',
          notes: 'Joined via WhatsApp share',
          createdAt: past2,
          rewardedAt: past2
        },
        {
          id: uuidv4(),
          pharmacyId: userPharmacyId,
          code: referralCode,
          referredPharmacyName: 'Alpha Care Health Plus',
          contactPerson: 'Pharm. Adebayo Kunle',
          phone: '+234 809 112 2334',
          email: 'adebayo@alphacare.ng',
          plan: 'Enterprise',
          status: 'signed_up',
          rewardAmount: 40000,
          rewardStatus: 'pending',
          notes: 'Signed up, in 14-day free trial period',
          createdAt: past3,
          rewardedAt: null
        }
      ];

      for (const r of seedRefs) {
        await db.run(`
          INSERT INTO referrals (id, pharmacyId, code, referredPharmacyName, contactPerson, phone, email, plan, status, rewardAmount, rewardStatus, notes, createdAt, rewardedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [r.id, r.pharmacyId, r.code, r.referredPharmacyName, r.contactPerson, r.phone, r.email, r.plan, r.status, r.rewardAmount, r.rewardStatus, r.notes, r.createdAt, r.rewardedAt]);
      }
    }

    const referrals = db.query("SELECT * FROM referrals WHERE pharmacyId = ? ORDER BY createdAt DESC", [userPharmacyId]);
    const payouts = db.query("SELECT * FROM referral_payouts WHERE pharmacyId = ? ORDER BY createdAt DESC", [userPharmacyId]);

    const totalEarned = referrals
      .filter((r: any) => r.rewardStatus === 'available' || r.rewardStatus === 'redeemed')
      .reduce((sum: number, r: any) => sum + (Number(r.rewardAmount) || 0), 0);
    
    const totalRedeemed = payouts
      .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

    const availableBalance = Math.max(0, totalEarned - totalRedeemed);

    const pendingRewards = referrals
      .filter((r: any) => r.rewardStatus === 'pending')
      .reduce((sum: number, r: any) => sum + (Number(r.rewardAmount) || 0), 0);

    const successfulCount = referrals.filter((r: any) => r.status === 'subscribed').length;

    let currentTier = 'Bronze';
    let nextTier = 'Silver';
    let nextTierThreshold = 4;
    let commissionRate = '10%';
    let refereeDiscount = '10% OFF';
    if (successfulCount >= 10) {
      currentTier = 'Gold';
      nextTier = 'VIP Platinum';
      nextTierThreshold = 25;
      commissionRate = '25%';
      refereeDiscount = '20% OFF';
    } else if (successfulCount >= 4) {
      currentTier = 'Silver';
      nextTier = 'Gold';
      nextTierThreshold = 10;
      commissionRate = '15%';
      refereeDiscount = '15% OFF';
    }

    return {
      referralCode,
      referralLink: `${window.location.origin}/join?ref=${referralCode}`,
      walletBalance: availableBalance,
      totalEarned,
      totalRedeemed,
      pendingRewards,
      successfulCount,
      totalInvited: referrals.length,
      currentTier,
      nextTier,
      nextTierThreshold,
      commissionRate,
      refereeDiscount,
      referrals,
      payouts
    };
  }

  if (path === '/api/referrals/invite' && method === 'POST') {
    const { referredPharmacyName, contactPerson, phone, email, plan = 'Professional', notes } = body;
    if (!referredPharmacyName) {
      return { status: 400, error: 'Referred pharmacy name is required' };
    }

    let codeRow = db.queryOne("SELECT value FROM settings WHERE key = ?", [`ref_code_${userPharmacyId}`]);
    const referralCode = codeRow?.value || 'PF-PHARM';

    const rewardAmounts: Record<string, number> = {
      'Starter': 15000,
      'Professional': 25000,
      'Enterprise': 40000
    };
    const rewardAmount = rewardAmounts[plan] || 25000;

    const id = uuidv4();
    await db.run(`
      INSERT INTO referrals (id, pharmacyId, code, referredPharmacyName, contactPerson, phone, email, plan, status, rewardAmount, rewardStatus, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'invited', ?, 'pending', ?)
    `, [id, userPharmacyId, referralCode, referredPharmacyName, contactPerson || '', phone || '', email || '', plan, rewardAmount, notes || 'Direct invitation sent']);

    await logActivity(requestingUserId, 'INVITE', id, 'referral', { pharmacy: referredPharmacyName });
    await db.persistDB();
    return { success: true, id };
  }

  if (path === '/api/referrals/redeem' && method === 'POST') {
    const { amount, type, bankName, accountNumber, accountName, notes } = body;
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return { status: 400, error: 'Invalid amount to redeem' };
    }

    const referrals = db.query("SELECT * FROM referrals WHERE pharmacyId = ?", [userPharmacyId]);
    const payouts = db.query("SELECT * FROM referral_payouts WHERE pharmacyId = ?", [userPharmacyId]);
    const totalEarned = referrals
      .filter((r: any) => r.rewardStatus === 'available' || r.rewardStatus === 'redeemed')
      .reduce((sum: number, r: any) => sum + (Number(r.rewardAmount) || 0), 0);
    const totalRedeemed = payouts.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
    const availableBalance = Math.max(0, totalEarned - totalRedeemed);

    if (numAmount > availableBalance) {
      return { status: 400, error: `Requested amount exceeds available balance (₦${availableBalance.toLocaleString()})` };
    }

    const id = uuidv4();
    const reference = 'PAY-' + Math.random().toString(36).substring(2, 9).toUpperCase();

    await db.run(`
      INSERT INTO referral_payouts (id, pharmacyId, amount, type, bankName, accountNumber, accountName, status, reference, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)
    `, [id, userPharmacyId, numAmount, type, bankName || null, accountNumber || null, accountName || null, reference, notes || 'Redemption processed']);

    if (type === 'subscription_credit') {
      const sub = db.queryOne("SELECT * FROM subscriptions WHERE pharmacyId = ?", [userPharmacyId]);
      if (sub) {
        const newCredit = (Number(sub.referralCreditApplied) || 0) + numAmount;
        await db.run("UPDATE subscriptions SET referralCreditApplied = ?, updatedAt = CURRENT_TIMESTAMP WHERE pharmacyId = ?", [newCredit, userPharmacyId]);
      }
    }

    await logActivity(requestingUserId, 'REDEEM', id, 'referral_payout', { amount: numAmount, type });
    await db.persistDB();
    return { success: true, id, reference };
  }

  if (path === '/api/referrals/simulate-status' && method === 'POST') {
    const { id, status } = body;
    const ref = db.queryOne("SELECT * FROM referrals WHERE id = ? AND pharmacyId = ?", [id, userPharmacyId]);
    if (!ref) {
      return { status: 404, error: 'Referral not found' };
    }
    const rewardStatus = status === 'subscribed' ? 'available' : 'pending';
    const rewardedAt = status === 'subscribed' ? new Date().toISOString() : null;

    await db.run(`
      UPDATE referrals SET status = ?, rewardStatus = ?, rewardedAt = ? WHERE id = ?
    `, [status, rewardStatus, rewardedAt, id]);

    await db.persistDB();
    return { success: true };
  }

  // ==================== SUBSCRIPTIONS ====================
  if (path === '/api/subscriptions' && method === 'GET') {
    const pharmacy = db.queryOne("SELECT id, name, tier, createdAt FROM pharmacies WHERE id = ?", [userPharmacyId]);
    
    let sub = db.queryOne("SELECT * FROM subscriptions WHERE pharmacyId = ?", [userPharmacyId]);
    if (!sub) {
      const subId = uuidv4();
      const tierLower = pharmacy?.tier?.toLowerCase() || '';
      const currentTier = tierLower === 'enterprise' ? 'enterprise' : (tierLower === 'personal' || tierLower === 'starter') ? 'starter' : 'pro';
      const planName = currentTier === 'enterprise' ? 'Enterprise' : currentTier === 'starter' ? 'Starter' : 'Professional';
      const amount = currentTier === 'enterprise' ? 65000 : currentTier === 'starter' ? 14500 : 28000;
      
      const now = new Date();
      const nextMonth = new Date(now.getTime() + 30 * 86400000);

      await db.run(`
        INSERT INTO subscriptions (id, pharmacyId, planId, planName, billingCycle, status, amount, currency, startDate, currentPeriodEnd, autoRenew, paymentMethod, cardLast4, cardBrand, referralCreditApplied)
        VALUES (?, ?, ?, ?, 'monthly', 'active', ?, 'NGN', CURRENT_TIMESTAMP, ?, 1, 'card', '4242', 'Visa', 0)
      `, [subId, userPharmacyId, currentTier, planName, amount, nextMonth.toISOString()]);

      const invId1 = uuidv4();
      const pastDate1 = new Date(now.getTime() - 60 * 86400000).toISOString();
      const invId2 = uuidv4();
      const pastDate2 = new Date(now.getTime() - 30 * 86400000).toISOString();

      await db.run(`
        INSERT INTO subscription_invoices (id, pharmacyId, invoiceNumber, planName, billingCycle, amount, currency, status, paymentMethod, date)
        VALUES (?, ?, 'PF-SUB-2026-001', 'Professional Plan', 'monthly', 28000, 'NGN', 'paid', 'card', ?)
      `, [invId1, userPharmacyId, pastDate1]);

      await db.run(`
        INSERT INTO subscription_invoices (id, pharmacyId, invoiceNumber, planName, billingCycle, amount, currency, status, paymentMethod, date)
        VALUES (?, ?, 'PF-SUB-2026-002', 'Professional Plan', 'monthly', 28000, 'NGN', 'paid', 'card', ?)
      `, [invId2, userPharmacyId, pastDate2]);

      sub = db.queryOne("SELECT * FROM subscriptions WHERE pharmacyId = ?", [userPharmacyId]);
    }

    const productCountRow = db.queryOne("SELECT COUNT(*) as cnt FROM products WHERE pharmacyId = ? AND active = 1", [userPharmacyId]);
    const branchCountRow = db.queryOne("SELECT COUNT(*) as cnt FROM branches WHERE pharmacyId = ? AND active = 1", [userPharmacyId]);
    const userCountRow = db.queryOne("SELECT COUNT(*) as cnt FROM users WHERE pharmacyId = ? AND active = 1", [userPharmacyId]);

    const productCount = productCountRow?.cnt || 0;
    const branchCount = branchCountRow?.cnt || 1;
    const userCount = userCountRow?.cnt || 1;

    const invoices = db.query("SELECT * FROM subscription_invoices WHERE pharmacyId = ? ORDER BY date DESC", [userPharmacyId]);

    const plans = [
      {
        id: 'starter',
        name: 'Starter Plan',
        description: 'Ideal for single retail pharmacies and growing community chemists.',
        monthlyPrice: 14500,
        yearlyPrice: 139200,
        maxBranches: 1,
        maxUsers: 3,
        maxProducts: 1000,
        features: [
          '1 Pharmacy Branch',
          'Up to 3 Staff Cashier Accounts',
          '1,000 Products Catalog',
          'POS & Receipt Thermal Printing',
          'Basic Sales & Daily Revenue Reports',
          'Local Backup & Restore',
          'Standard Community Support'
        ]
      },
      {
        id: 'pro',
        name: 'Professional Plan',
        description: 'Comprehensive solution for high-volume pharmacies with staff & inventory control.',
        badge: 'Most Popular',
        monthlyPrice: 28000,
        yearlyPrice: 268800,
        maxBranches: 3,
        maxUsers: 10,
        maxProducts: 999999,
        features: [
          'Up to 3 Branches / Dispensaries',
          'Up to 10 Users with Role Permissions',
          'Unlimited Products & Barcodes',
          'Batch & Expiry Date Alert Tracking',
          'Customer Debt Book & Credit Limits',
          'Supplier Market Lists & Purchases',
          'Staff Payroll & Invoicing System',
          'Returns & Supplier Replacement Tracking',
          'Google Drive Auto-Sync',
          'Priority WhatsApp & Phone Support'
        ]
      },
      {
        id: 'enterprise',
        name: 'Enterprise Multi-Branch',
        description: 'For pharmacy chains, hospital pharmacies, and pharmaceutical distributors.',
        monthlyPrice: 65000,
        yearlyPrice: 624000,
        maxBranches: 10,
        maxUsers: 50,
        maxProducts: 999999,
        features: [
          'Up to 10 Pharmacy Branches & Warehouses',
          'Up to 50 Staff & Pharmacist Accounts',
          'Multi-Branch Inter-Store Stock Transfers',
          'Advanced Financial & Tax Analytics',
          'Custom Receipt Layouts & Logo Branding',
          'Audit Logs & Employee Shift Tracking',
          'API Access & Automated Database Backup',
          'Dedicated Account Manager & 24/7 VIP SLA',
          'On-site Pharmacist Staff Onboarding'
        ]
      }
    ];

    return {
      subscription: sub,
      quotas: {
        products: {
          used: productCount,
          limit: sub.planId === 'starter' ? 1000 : 'Unlimited'
        },
        branches: {
          used: branchCount,
          limit: sub.planId === 'enterprise' ? 10 : sub.planId === 'pro' ? 3 : 1
        },
        users: {
          used: userCount,
          limit: sub.planId === 'enterprise' ? 50 : sub.planId === 'pro' ? 10 : 3
        }
      },
      plans,
      invoices,
      pharmacyName: pharmacy?.name || 'Your Pharmacy'
    };
  }

  if (path === '/api/subscriptions/update-plan' && method === 'POST') {
    const { planId, billingCycle } = body;
    const planPrices: Record<string, { name: string; monthly: number; yearly: number; tier: string }> = {
      'starter': { name: 'Starter Plan', monthly: 14500, yearly: 139200, tier: 'Personal' },
      'pro': { name: 'Professional Plan', monthly: 28000, yearly: 268800, tier: 'Standard' },
      'enterprise': { name: 'Enterprise Multi-Branch', monthly: 65000, yearly: 624000, tier: 'Enterprise' }
    };

    const targetPlan = planPrices[planId] || planPrices['pro'];
    const cycle = billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const amount = cycle === 'yearly' ? targetPlan.yearly : targetPlan.monthly;

    const sub = db.queryOne("SELECT * FROM subscriptions WHERE pharmacyId = ?", [userPharmacyId]);
    const referralCredit = Number(sub?.referralCreditApplied) || 0;
    const discount = Math.min(amount, referralCredit);
    const finalAmount = Math.max(0, amount - discount);
    const remainingCredit = referralCredit - discount;

    const now = new Date();
    const periodDays = cycle === 'yearly' ? 365 : 30;
    const nextPeriod = new Date(now.getTime() + periodDays * 86400000);

    await db.run(`
      UPDATE subscriptions 
      SET planId = ?, planName = ?, billingCycle = ?, amount = ?, currentPeriodEnd = ?, 
          status = 'active', referralCreditApplied = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE pharmacyId = ?
    `, [planId, targetPlan.name, cycle, amount, nextPeriod.toISOString(), remainingCredit, userPharmacyId]);

    await db.run("UPDATE pharmacies SET tier = ? WHERE id = ?", [targetPlan.tier, userPharmacyId]);

    const invId = uuidv4();
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const invNumber = `PF-SUB-${now.getFullYear()}-${randNum}`;

    await db.run(`
      INSERT INTO subscription_invoices (id, pharmacyId, invoiceNumber, planName, billingCycle, amount, discountApplied, currency, status, paymentMethod, date, periodStart, periodEnd)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'NGN', 'paid', ?, CURRENT_TIMESTAMP, ?, ?)
    `, [invId, userPharmacyId, invNumber, targetPlan.name, cycle, finalAmount, discount, sub?.paymentMethod || 'card', now.toISOString(), nextPeriod.toISOString()]);

    await logActivity(requestingUserId, 'SUBSCRIPTION_CHANGE', invId, 'subscription', { plan: targetPlan.name, cycle, amount: finalAmount });
    await db.persistDB();

    return { success: true, planName: targetPlan.name, billingCycle: cycle, invoiceNumber: invNumber };
  }

  if (path === '/api/subscriptions/payment-method' && method === 'POST') {
    const { cardBrand = 'Visa', cardLast4 = '4242', paymentMethod = 'card' } = body;
    await db.run(`
      UPDATE subscriptions 
      SET cardBrand = ?, cardLast4 = ?, paymentMethod = ?, updatedAt = CURRENT_TIMESTAMP 
      WHERE pharmacyId = ?
    `, [cardBrand, cardLast4, paymentMethod, userPharmacyId]);

    await db.persistDB();
    return { success: true };
  }

  if (path === '/api/subscriptions/auto-renew' && method === 'POST') {
    const { autoRenew } = body;
    await db.run(`
      UPDATE subscriptions SET autoRenew = ?, updatedAt = CURRENT_TIMESTAMP WHERE pharmacyId = ?
    `, [autoRenew ? 1 : 0, userPharmacyId]);

    await db.persistDB();
    return { success: true, autoRenew: !!autoRenew };
  }

  if (path === '/api/subscriptions/renew-now' && method === 'POST') {
    const sub = db.queryOne("SELECT * FROM subscriptions WHERE pharmacyId = ?", [userPharmacyId]);
    if (!sub) return { status: 404, error: 'Subscription not found' };

    const cycle = sub.billingCycle || 'monthly';
    const periodDays = cycle === 'yearly' ? 365 : 30;
    const now = new Date();
    const curEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : now;
    const baseDate = curEnd > now ? curEnd : now;
    const newEnd = new Date(baseDate.getTime() + periodDays * 86400000);

    const referralCredit = Number(sub.referralCreditApplied) || 0;
    const discount = Math.min(Number(sub.amount), referralCredit);
    const finalAmount = Math.max(0, Number(sub.amount) - discount);
    const remainingCredit = referralCredit - discount;

    await db.run(`
      UPDATE subscriptions 
      SET currentPeriodEnd = ?, status = 'active', referralCreditApplied = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE pharmacyId = ?
    `, [newEnd.toISOString(), remainingCredit, userPharmacyId]);

    const invId = uuidv4();
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const invNumber = `PF-SUB-${now.getFullYear()}-${randNum}`;

    await db.run(`
      INSERT INTO subscription_invoices (id, pharmacyId, invoiceNumber, planName, billingCycle, amount, discountApplied, currency, status, paymentMethod, date, periodStart, periodEnd)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'NGN', 'paid', ?, CURRENT_TIMESTAMP, ?, ?)
    `, [invId, userPharmacyId, invNumber, sub.planName, cycle, finalAmount, discount, sub.paymentMethod || 'card', baseDate.toISOString(), newEnd.toISOString()]);

    await logActivity(requestingUserId, 'SUBSCRIPTION_RENEW', invId, 'subscription', { plan: sub.planName, amount: finalAmount });
    await db.persistDB();

    return { success: true, newRenewalDate: newEnd.toISOString(), invoiceNumber: invNumber };
  }

  if (path === '/api/subscriptions/cancel' && method === 'POST') {
    const { reason } = body;
    await db.run(`
      UPDATE subscriptions SET autoRenew = 0, updatedAt = CURRENT_TIMESTAMP WHERE pharmacyId = ?
    `, [userPharmacyId]);

    await logActivity(requestingUserId, 'SUBSCRIPTION_CANCEL', userPharmacyId || '', 'subscription', { reason });
    await db.persistDB();
    return { success: true, message: 'Subscription auto-renew has been disabled. Access remains active until period end.' };
  }

  // Default fallback for unhandled routes
  return { status: 404, error: 'Not Found' };
}
