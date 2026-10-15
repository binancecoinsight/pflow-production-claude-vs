import initSqlJs from 'sql.js';
import { v4 as uuidv4 } from 'uuid';

let dbInstance: any = null;
let SQL: any = null;

const DB_NAME = 'store_db';
const STORE_NAME = 'sqlite_file';

async function openIDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('PharmacyFlowDB', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadFromIndexedDB(): Promise<Uint8Array | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const transaction = idb.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(DB_NAME);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function saveToIndexedDB(data: Uint8Array) {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const transaction = idb.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(data, DB_NAME);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    branchId TEXT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    alias TEXT,
    category TEXT,
    subcategory TEXT,
    price REAL NOT NULL,
    wholesalePrice REAL,
    cost REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    minStock INTEGER NOT NULL DEFAULT 5,
    description TEXT,
    expiryDate TEXT,
    batchNumber TEXT,
    model TEXT,
    manufacturer TEXT,
    type TEXT DEFAULT 'product',
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    branchId TEXT,
    receiptId TEXT UNIQUE,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    totalAmount REAL NOT NULL,
    paymentMethod TEXT NOT NULL,
    accountId TEXT,
    splitPayments TEXT,
    userId TEXT,
    customerName TEXT
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY,
    saleId TEXT NOT NULL,
    productId TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    originalPrice REAL,
    serialNumber TEXT,
    FOREIGN KEY (saleId) REFERENCES sales(id),
    FOREIGN KEY (productId) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    branchId TEXT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    totalDebt REAL NOT NULL DEFAULT 0,
    debtLimit REAL,
    dueDate TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS account_transactions (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    branchId TEXT,
    accountId TEXT NOT NULL,
    saleId TEXT,
    invoiceId TEXT,
    amount REAL NOT NULL,
    balance REAL,
    type TEXT NOT NULL,
    notes TEXT,
    dueDate TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accountId) REFERENCES accounts(id),
    FOREIGN KEY (saleId) REFERENCES sales(id),
    FOREIGN KEY (invoiceId) REFERENCES invoices(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    name TEXT NOT NULL,
    username TEXT UNIQUE,
    password TEXT,
    pin TEXT,
    role TEXT NOT NULL DEFAULT 'cashier',
    roleId TEXT,
    branchId TEXT,
    active INTEGER DEFAULT 1,
    createdBy TEXT
  );

  CREATE TABLE IF NOT EXISTS pharmacies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ownerId TEXT NOT NULL,
    tier TEXT DEFAULT 'Personal',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT NOT NULL,
    name TEXT NOT NULL,
    location TEXT,
    phone TEXT,
    active INTEGER DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    permissions TEXT NOT NULL -- JSON array of strings
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    branchId TEXT,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL,
    recurring TEXT DEFAULT 'none', -- 'none', 'daily', 'weekly', 'monthly'
    nextOccurrence TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS returns (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    branchId TEXT,
    saleId TEXT NOT NULL,
    productId TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    returnedBy TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    sentToVendor INTEGER DEFAULT 0,
    sentToVendorDate TEXT,
    vendorReplaced INTEGER DEFAULT 0,
    vendorReplaceDate TEXT,
    inShop INTEGER DEFAULT 1,
    returnedToStoreDate TEXT,
    status TEXT DEFAULT 'customer_returned',
    FOREIGN KEY (saleId) REFERENCES sales(id),
    FOREIGN KEY (productId) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    name TEXT NOT NULL,
    contact TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    branchId TEXT,
    supplierId TEXT NOT NULL,
    totalAmount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'paid', -- 'paid', 'unpaid'
    dueDate TEXT,
    paidAt DATETIME,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplierId) REFERENCES suppliers(id)
  );

  CREATE TABLE IF NOT EXISTS purchase_items (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    branchId TEXT,
    purchaseId TEXT NOT NULL,
    productId TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    cost REAL NOT NULL,
    batchNumber TEXT,
    expiryDate TEXT,
    FOREIGN KEY (purchaseId) REFERENCES purchases(id),
    FOREIGN KEY (productId) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS market_list (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    branchId TEXT,
    name TEXT NOT NULL,
    phone TEXT,
    date TEXT NOT NULL,
    items TEXT NOT NULL, -- JSON array of items
    status TEXT DEFAULT 'pending', -- 'pending', 'ordered', 'received'
    batchName TEXT,
    orderedBy TEXT DEFAULT 'account', -- 'account' or 'shop'
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    branchId TEXT,
    title TEXT NOT NULL,
    description TEXT,
    startDate TEXT NOT NULL,
    endDate TEXT,
    type TEXT NOT NULL, -- 'holiday', 'leave', 'duty', 'other'
    allDay INTEGER DEFAULT 1,
    staffId TEXT,
    staffName TEXT,
    createdBy TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    branchId TEXT,
    name TEXT NOT NULL,
    role TEXT,
    salary REAL NOT NULL DEFAULT 0,
    bankName TEXT,
    accountNumber TEXT,
    accountName TEXT,
    phoneNumber TEXT,
    email TEXT,
    status TEXT DEFAULT 'active',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payroll (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    branchId TEXT,
    employeeId TEXT NOT NULL,
    month TEXT NOT NULL,
    baseSalary REAL NOT NULL,
    bonuses REAL DEFAULT 0,
    deductions REAL DEFAULT 0,
    netSalary REAL NOT NULL,
    status TEXT DEFAULT 'unpaid',
    paymentDate TEXT,
    paymentMethod TEXT,
    notes TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employeeId) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    branchId TEXT,
    invoiceNumber TEXT NOT NULL,
    accountId TEXT NOT NULL,
    accountName TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    dueDate TEXT,
    status TEXT DEFAULT 'unpaid',
    totalAmount REAL NOT NULL,
    notes TEXT,
    storeName TEXT,
    storeAddress TEXT,
    storePhone TEXT,
    storeEmail TEXT,
    bankName TEXT,
    accountName_store TEXT,
    accountNumber_store TEXT,
    templateId TEXT,
    customerPhone TEXT,
    customerEmail TEXT,
    customerAddress TEXT,
    FOREIGN KEY (accountId) REFERENCES accounts(id),
    UNIQUE(pharmacyId, invoiceNumber)
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id TEXT PRIMARY KEY,
    invoiceId TEXT NOT NULL,
    productId TEXT,
    productName TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL,
    FOREIGN KEY (invoiceId) REFERENCES invoices(id),
    FOREIGN KEY (productId) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS dismissed_notifications (
    id TEXT PRIMARY KEY,
    userId TEXT,
    refId TEXT NOT NULL,
    type TEXT NOT NULL,
    dismissedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT,
    branchId TEXT,
    userId TEXT,
    userName TEXT,
    action TEXT NOT NULL,
    entityId TEXT,
    entityName TEXT,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT NOT NULL,
    code TEXT NOT NULL,
    referredPharmacyName TEXT NOT NULL,
    contactPerson TEXT,
    phone TEXT,
    email TEXT,
    plan TEXT DEFAULT 'Professional',
    status TEXT DEFAULT 'pending',
    rewardAmount REAL DEFAULT 0,
    rewardStatus TEXT DEFAULT 'pending',
    notes TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    rewardedAt DATETIME
  );

  CREATE TABLE IF NOT EXISTS referral_payouts (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    bankName TEXT,
    accountNumber TEXT,
    accountName TEXT,
    status TEXT DEFAULT 'completed',
    reference TEXT,
    notes TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT NOT NULL UNIQUE,
    planId TEXT NOT NULL DEFAULT 'pro',
    planName TEXT NOT NULL DEFAULT 'Professional',
    billingCycle TEXT NOT NULL DEFAULT 'monthly',
    status TEXT NOT NULL DEFAULT 'active',
    amount REAL NOT NULL DEFAULT 28000,
    currency TEXT DEFAULT 'NGN',
    startDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    currentPeriodEnd DATETIME,
    autoRenew INTEGER DEFAULT 1,
    paymentMethod TEXT DEFAULT 'card',
    cardLast4 TEXT DEFAULT '4242',
    cardBrand TEXT DEFAULT 'Visa',
    referralCreditApplied REAL DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscription_invoices (
    id TEXT PRIMARY KEY,
    pharmacyId TEXT NOT NULL,
    invoiceNumber TEXT NOT NULL,
    planName TEXT NOT NULL,
    billingCycle TEXT NOT NULL,
    amount REAL NOT NULL,
    discountApplied REAL DEFAULT 0,
    currency TEXT DEFAULT 'NGN',
    status TEXT DEFAULT 'paid',
    paymentMethod TEXT DEFAULT 'card',
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    periodStart DATETIME,
    periodEnd DATETIME
  );
`;

function seedData(db: any) {
  // Roles - Use fixed IDs for default roles to avoid duplicates
  const storeOwnerRoleId = 'role-store-owner-default';
  const adminRoleId = 'role-admin-default';
  const cashierRoleId = 'role-cashier-default';
  
  db.run("INSERT OR IGNORE INTO roles (id, name, permissions) VALUES (?, 'store owner', ?)", [
    storeOwnerRoleId,
    JSON.stringify(['dashboard', 'inventory', 'sales', 'accounts', 'history', 'reports', 'expenses', 'purchases', 'market-list', 'calendar', 'users', 'settings', 'payroll', 'invoices', 'tutorials', 'referrals', 'subscriptions'])
  ]);

  db.run("INSERT OR IGNORE INTO roles (id, name, permissions) VALUES (?, 'admin', ?)", [
    adminRoleId,
    JSON.stringify(['dashboard', 'inventory', 'sales', 'accounts', 'history', 'reports', 'expenses', 'purchases', 'market-list', 'calendar', 'users', 'settings', 'payroll', 'invoices', 'tutorials', 'referrals', 'subscriptions'])
  ]);
  
  db.run("INSERT OR IGNORE INTO roles (id, name, permissions) VALUES (?, 'cashier', ?)", [
    cashierRoleId,
    JSON.stringify(['sales', 'accounts', 'history', 'tutorials'])
  ]);

  // Settings
  const defaultSettings = [
    ['currency', 'NGN'],
    ['currencySymbol', '₦'],
    ['storeName', 'PHARMACY-ABC'],
    ['phoneNumber', '0800-PHARMA'],
    ['storeAddress', '123 Health Ave, Wellness City'],
    ['storeEmail', 'contact@pharmacyflow.com'],
    ['receiptMessage', 'Thank you for choosing PHARMACY-ABC. We care for your health!'],
    ['categories', '[{"id":"cat-meds","name":"Medications","subcategories":["Prescription","OTC","Injections","Syrups","Suspensions"]},{"id":"cat-personal","name":"Personal Care","subcategories":["Skincare","Oral Care","Haircare","Hygiene","Beauty"]},{"id":"cat-wellness","name":"Wellness & Vitamins","subcategories":["Multivitamins","Supplements","Herbal","Nutrition"]},{"id":"cat-baby","name":"Baby & Mother","subcategories":["Diapers","Baby Food","Baby Toiletries","Maternity"]},{"id":"cat-supplies","name":"Medical Supplies","subcategories":["First Aid","Diagnostics","Surgical","Orthopedic"]},{"id":"cat-misc","name":"Miscellaneous","subcategories":["Toiletries","Others"]}]'],
    ['printMethod', 'deeplink'],
    ['paperSize', 'thermal'],
    ['printBehavior', 'ask'],
    ['printAccountName', 'true'],
    ['includeCustomerName', 'true'],
    ['debtLimitType', 'unlimited'],
    ['debtLimitAmount', '0'],
    ['allowSplitPayments', 'false'],
    ['allowBackdatedSales', 'false']
  ];

  for (const [key, value] of defaultSettings) {
    db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  }

  // Default Pharmacy, Branch, and Store Owner for open testing & full access
  db.run("INSERT OR IGNORE INTO pharmacies (id, name, ownerId, tier) VALUES ('pharmacy-default', 'PHARMACY-ABC', 'user-admin-default', 'Enterprise')");
  db.run("INSERT OR IGNORE INTO branches (id, pharmacyId, name, location, phone, active) VALUES ('branch-default', 'pharmacy-default', 'Main Branch', '123 Health Ave, Wellness City', '0800-PHARMA', 1)");
  db.run("INSERT OR IGNORE INTO users (id, pharmacyId, name, username, password, role, roleId, branchId, active) VALUES ('user-admin-default', 'pharmacy-default', 'Admin Pharmacist', 'admin', 'admin123', 'store owner', 'role-store-owner-default', 'branch-default', 1)");
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('setupCompleted', 'true')");
}

async function runMigrations(db: any): Promise<boolean> {
  let changesMade = false;

  // Migration: migrate sale_items to use TEXT id instead of INTEGER AUTOINCREMENT
  try {
    const saleItemsQuery = db.exec("PRAGMA table_info(sale_items)");
    if (saleItemsQuery.length > 0) {
      const idCol = saleItemsQuery[0].values.find((col: any) => col[1] === 'id');
      if (idCol && idCol[2] === 'INTEGER') {
        db.run("CREATE TABLE sale_items_new_uuid AS SELECT * FROM sale_items WHERE 0;");
        db.run("DROP TABLE sale_items_new_uuid;");
        db.run(`
          CREATE TABLE sale_items_new_uuid (
            id TEXT PRIMARY KEY,
            saleId TEXT NOT NULL,
            productId TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            originalPrice REAL,
            serialNumber TEXT,
            FOREIGN KEY (saleId) REFERENCES sales(id),
            FOREIGN KEY (productId) REFERENCES products(id)
          );
        `);
        // We'll generate a uuid for existing integer ids.
        const res = db.exec("SELECT * FROM sale_items");
        if (res.length > 0) {
           const rows = res[0].values;
           const cols = res[0].columns;
           for (const row of rows) {
             const rowObj: any = {};
             cols.forEach((col: string, i: number) => rowObj[col] = row[i]);
             rowObj.id = uuidv4();
             
             db.run(
               "INSERT INTO sale_items_new_uuid (id, saleId, productId, quantity, price, originalPrice, serialNumber) VALUES (?, ?, ?, ?, ?, ?, ?)", 
               [rowObj.id, rowObj.saleId, rowObj.productId, rowObj.quantity, rowObj.price, rowObj.originalPrice || null, rowObj.serialNumber || null]
             );
           }
        }
        db.run("DROP TABLE sale_items;");
        db.run("ALTER TABLE sale_items_new_uuid RENAME TO sale_items;");
        changesMade = true;
      }
    }
  } catch (e) { console.error("Error migrating sale items:", e); }

  // Migration: Rename customers to accounts if it exists
  try {
    db.run("ALTER TABLE customers RENAME TO accounts;");
    changesMade = true;
  } catch (e) {}

  // Migration: Rename debt_transactions to account_transactions if it exists
  try {
    db.run("ALTER TABLE debt_transactions RENAME TO account_transactions;");
    changesMade = true;
  } catch (e) {}

  // Migration: Rename customerId to accountId in account_transactions if it exists
  try {
    db.run("ALTER TABLE account_transactions RENAME COLUMN customerId TO accountId;");
    changesMade = true;
  } catch (e) {}

  // Migration: Rename customerId to accountId in sales if it exists
  try {
    db.run("ALTER TABLE sales RENAME COLUMN customerId TO accountId;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add serialNumber column to sale_items if it doesn't exist
  try {
    db.run("ALTER TABLE sale_items ADD COLUMN serialNumber TEXT;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add originalPrice column to sale_items if it doesn't exist
  try {
    db.run("ALTER TABLE sale_items ADD COLUMN originalPrice REAL;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add type column to products if it doesn't exist
  try {
    db.run("ALTER TABLE products ADD COLUMN type TEXT DEFAULT 'product';");
    changesMade = true;
  } catch (e) {}

  // Migration: Add expenses table if it doesn't exist
  const expensesExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'");
  if (!expensesExists.step()) {
    db.run(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        recurring TEXT DEFAULT 'none',
        nextOccurrence TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    changesMade = true;
  }
  expensesExists.free();

  // Migration: Add wholesalePrice column to products if it doesn't exist
  try {
    db.run("ALTER TABLE products ADD COLUMN wholesalePrice REAL;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add returns table if it doesn't exist
  const returnsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='returns'");
  if (!returnsExists.step()) {
    db.run(`
      CREATE TABLE IF NOT EXISTS returns (
        id TEXT PRIMARY KEY,
        saleId TEXT NOT NULL,
        productId TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        reason TEXT NOT NULL,
        returnedBy TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        sentToVendor INTEGER DEFAULT 0,
        sentToVendorDate TEXT,
        vendorReplaced INTEGER DEFAULT 0,
        vendorReplaceDate TEXT,
        inShop INTEGER DEFAULT 1,
        returnedToStoreDate TEXT,
        status TEXT DEFAULT 'customer_returned'
      );
    `);
    changesMade = true;
  }
  returnsExists.free();

  // Migration: Add new columns to returns if they don't exist
  const returnColumns = ['sentToVendor', 'sentToVendorDate', 'vendorReplaced', 'vendorReplaceDate', 'inShop', 'returnedToStoreDate', 'status'];
  for (const col of returnColumns) {
    try {
      if (col === 'status') {
        db.run(`ALTER TABLE returns ADD COLUMN ${col} TEXT DEFAULT 'customer_returned';`);
      } else if (col.includes('Date')) {
        db.run(`ALTER TABLE returns ADD COLUMN ${col} TEXT;`);
      } else {
        db.run(`ALTER TABLE returns ADD COLUMN ${col} INTEGER DEFAULT ${col === 'inShop' ? 1 : 0};`);
      }
      changesMade = true;
    } catch (e) {}
  }

  // Migration: Add suppliers table if it doesn't exist
  const suppliersExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='suppliers'");
  if (!suppliersExists.step()) {
    db.run(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    changesMade = true;
  }
  suppliersExists.free();

  // Migration: Add purchases table if it doesn't exist
  const purchasesExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='purchases'");
  if (!purchasesExists.step()) {
    db.run(`
      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        supplierId TEXT NOT NULL,
        totalAmount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'paid',
        dueDate TEXT,
        paidAt DATETIME,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    changesMade = true;
  }
  purchasesExists.free();

  // Migration: Add paidAt column to purchases if it doesn't exist
  try {
    db.run("ALTER TABLE purchases ADD COLUMN paidAt DATETIME;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add purchase_items table if it doesn't exist
  const purchaseItemsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='purchase_items'");
  if (!purchaseItemsExists.step()) {
    db.run(`
      CREATE TABLE IF NOT EXISTS purchase_items (
        id TEXT PRIMARY KEY,
        purchaseId TEXT NOT NULL,
        productId TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        cost REAL NOT NULL
      );
    `);
    changesMade = true;
  }
  purchaseItemsExists.free();

  // Migration: Add market_list table if it doesn't exist
  const marketListExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='market_list'");
  if (!marketListExists.step()) {
    db.run(`
      CREATE TABLE IF NOT EXISTS market_list (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        date TEXT NOT NULL,
        items TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        batchName TEXT,
        orderedBy TEXT DEFAULT 'account',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    changesMade = true;
  }
  marketListExists.free();

  // Migration: Add batchName column to market_list if it doesn't exist
  try {
    db.run("ALTER TABLE market_list ADD COLUMN batchName TEXT;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add orderedBy column to market_list if it doesn't exist
  try {
    db.run("ALTER TABLE market_list ADD COLUMN orderedBy TEXT DEFAULT 'account';");
    changesMade = true;
  } catch (e) {}

  // Migration: Add batchNumber and expiryDate to purchase_items if they don't exist
  try {
    db.run("ALTER TABLE purchase_items ADD COLUMN batchNumber TEXT;");
    changesMade = true;
  } catch (e) {}
  try {
    db.run("ALTER TABLE purchase_items ADD COLUMN expiryDate TEXT;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add splitPayments column to sales if it doesn't exist
  try {
    db.run("ALTER TABLE sales ADD COLUMN splitPayments TEXT;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add userId column to sales if it doesn't exist
  try {
    db.run("ALTER TABLE sales ADD COLUMN userId TEXT;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add customerName column to sales if it doesn't exist
  try {
    db.run("ALTER TABLE sales ADD COLUMN customerName TEXT;");
    changesMade = true;
  } catch (e) {}
  
  // Migration: Add createdAt column to sales if it doesn't exist
  try {
    db.run("ALTER TABLE sales ADD COLUMN createdAt DATETIME DEFAULT CURRENT_TIMESTAMP;");
    // For existing sales, set createdAt to timestamp
    db.run("UPDATE sales SET createdAt = timestamp WHERE createdAt IS NULL;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add calendar_events table if it doesn't exist
  const calendarExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='calendar_events'");
  if (!calendarExists.step()) {
    db.run(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        startDate TEXT NOT NULL,
        endDate TEXT,
        type TEXT NOT NULL,
        allDay INTEGER DEFAULT 1,
        staffId TEXT,
        staffName TEXT,
        createdBy TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    changesMade = true;
  }
  calendarExists.free();

  // Migration: Add staffId and staffName columns to calendar_events if they don't exist
  try {
    db.run("ALTER TABLE calendar_events ADD COLUMN staffId TEXT;");
    changesMade = true;
  } catch (e) {}
  try {
    db.run("ALTER TABLE calendar_events ADD COLUMN staffName TEXT;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add employees table if it doesn't exist
  const employeesExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employees'");
  if (!employeesExists.step()) {
    db.run(`
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT,
        salary REAL NOT NULL DEFAULT 0,
        bankName TEXT,
        accountNumber TEXT,
        accountName TEXT,
        phoneNumber TEXT,
        email TEXT,
        status TEXT DEFAULT 'active',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    changesMade = true;
  }
  employeesExists.free();

  // Migration: Add payroll table if it doesn't exist
  const payrollExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payroll'");
  if (!payrollExists.step()) {
    db.run(`
      CREATE TABLE IF NOT EXISTS payroll (
        id TEXT PRIMARY KEY,
        employeeId TEXT NOT NULL,
        month TEXT NOT NULL,
        baseSalary REAL NOT NULL,
        bonuses REAL DEFAULT 0,
        deductions REAL DEFAULT 0,
        netSalary REAL NOT NULL,
        status TEXT DEFAULT 'unpaid',
        paymentDate TEXT,
        paymentMethod TEXT,
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employeeId) REFERENCES employees(id)
      );
    `);
    changesMade = true;
  }
  payrollExists.free();

  // Migration: Add payroll permission to admin role if missing
  try {
    const stmt = db.prepare("SELECT permissions FROM roles WHERE name = 'admin'");
    if (stmt.step()) {
      const row = stmt.getAsObject();
      if (row.permissions) {
        const permissions = JSON.parse(row.permissions as string);
        if (!permissions.includes('payroll')) {
          permissions.push('payroll');
          db.run("UPDATE roles SET permissions = ? WHERE name = 'admin'", [JSON.stringify(permissions)]);
          changesMade = true;
        }
      }
    }
    stmt.free();
  } catch (e) {
    console.error('Migration failed: Add payroll permission to admin role', e);
  }

  // Migration: Add debtLimit column to accounts if it doesn't exist
  try {
    db.run("ALTER TABLE accounts ADD COLUMN debtLimit REAL;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add invoices table if it doesn't exist
  const invoicesExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invoices'");
  if (!invoicesExists.step()) {
    db.run(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoiceNumber TEXT UNIQUE NOT NULL,
        accountId TEXT NOT NULL,
        accountName TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        dueDate TEXT,
        status TEXT DEFAULT 'unpaid',
        totalAmount REAL NOT NULL,
        notes TEXT,
        storeName TEXT,
        storeAddress TEXT,
        storePhone TEXT,
        storeEmail TEXT,
        bankName TEXT,
        accountName_store TEXT,
        accountNumber_store TEXT,
        FOREIGN KEY (accountId) REFERENCES accounts(id)
      );
    `);
    changesMade = true;
  }
  invoicesExists.free();

  // Migration: Fix invoices unique constraint (make it unique per pharmacy)
  try {
    const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='invoices'");
    let hasGlobalUnique = false;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      if (row.sql && typeof row.sql === 'string') {
        // If it contains "invoiceNumber TEXT UNIQUE" it's the old schema
        hasGlobalUnique = row.sql.includes('invoiceNumber TEXT UNIQUE') || !row.sql.includes('UNIQUE(pharmacyId, invoiceNumber)');
      }
    }
    stmt.free();

    if (hasGlobalUnique) {
      db.run("DROP TABLE IF EXISTS invoices_new;");
      db.run(`
        CREATE TABLE invoices_new (
          id TEXT PRIMARY KEY,
          pharmacyId TEXT,
          branchId TEXT,
          invoiceNumber TEXT NOT NULL,
          accountId TEXT NOT NULL,
          accountName TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          dueDate TEXT,
          status TEXT DEFAULT 'unpaid',
          totalAmount REAL NOT NULL,
          notes TEXT,
          storeName TEXT,
          storeAddress TEXT,
          storePhone TEXT,
          storeEmail TEXT,
          bankName TEXT,
          accountName_store TEXT,
          accountNumber_store TEXT,
          templateId TEXT,
          customerPhone TEXT,
          customerEmail TEXT,
          customerAddress TEXT,
          FOREIGN KEY (accountId) REFERENCES accounts(id),
          UNIQUE(pharmacyId, invoiceNumber)
        );
      `);
      db.run("INSERT OR IGNORE INTO invoices_new SELECT *, NULL, NULL, NULL, NULL FROM invoices;");
      db.run("DROP TABLE invoices;");
      db.run("ALTER TABLE invoices_new RENAME TO invoices;");
      changesMade = true;
    }
  } catch (e) {
    console.error('Migration failed: Fix invoices unique constraint', e);
  }

  // Migration: Add missing columns to invoices if they don't exist
  const invoiceColumnsToMigrate = ['templateId', 'customerPhone', 'customerEmail', 'customerAddress'];
  for (const col of invoiceColumnsToMigrate) {
    try {
      db.run(`ALTER TABLE invoices ADD COLUMN ${col} TEXT;`);
      changesMade = true;
    } catch (e) {}
  }

  // Migration: Add invoice_items table if it doesn't exist
  const invoiceItemsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_items'");
  if (!invoiceItemsExists.step()) {
    db.run(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id TEXT PRIMARY KEY,
        invoiceId TEXT NOT NULL,
        productId TEXT,
        productName TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        total REAL NOT NULL,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id),
        FOREIGN KEY (productId) REFERENCES products(id)
      );
    `);
    changesMade = true;
  }
  invoiceItemsExists.free();

  // Migration: Add invoices permission to admin role if missing
  try {
    const stmt = db.prepare("SELECT permissions FROM roles WHERE name = 'admin'");
    if (stmt.step()) {
      const row = stmt.getAsObject();
      if (row.permissions) {
        const permissions = JSON.parse(row.permissions as string);
        if (!permissions.includes('invoices')) {
          permissions.push('invoices');
          db.run("UPDATE roles SET permissions = ? WHERE name = 'admin'", [JSON.stringify(permissions)]);
          changesMade = true;
        }
      }
    }
    stmt.free();
  } catch (e) {
    console.error('Migration failed: Add invoices permission to admin role', e);
  }

  // Migration: Add tutorials permission to roles if missing
  try {
    const stmt = db.prepare("SELECT id, name, permissions FROM roles");
    const roles = [];
    while (stmt.step()) {
      roles.push(stmt.getAsObject());
    }
    stmt.free();
    
    for (const role of roles) {
      if (role.permissions) {
        const permissions = JSON.parse(role.permissions as string);
        let updated = false;
        if (!permissions.includes('tutorials')) {
          permissions.push('tutorials');
          updated = true;
        }
        if ((role.name === 'admin' || role.name === 'store owner') && !permissions.includes('referrals')) {
          permissions.push('referrals');
          updated = true;
        }
        if ((role.name === 'admin' || role.name === 'store owner') && !permissions.includes('subscriptions')) {
          permissions.push('subscriptions');
          updated = true;
        }
        if (updated) {
          db.run("UPDATE roles SET permissions = ? WHERE id = ?", [JSON.stringify(permissions), role.id]);
          changesMade = true;
        }
      }
    }
  } catch (e) {
    console.error('Migration failed: Add tutorials/referrals/subscriptions permission to roles', e);
  }

  // Migration: Add referrals, referral_payouts, subscriptions, subscription_invoices tables
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS referrals (
        id TEXT PRIMARY KEY,
        pharmacyId TEXT NOT NULL,
        code TEXT NOT NULL,
        referredPharmacyName TEXT NOT NULL,
        contactPerson TEXT,
        phone TEXT,
        email TEXT,
        plan TEXT DEFAULT 'Professional',
        status TEXT DEFAULT 'pending',
        rewardAmount REAL DEFAULT 0,
        rewardStatus TEXT DEFAULT 'pending',
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        rewardedAt DATETIME
      );

      CREATE TABLE IF NOT EXISTS referral_payouts (
        id TEXT PRIMARY KEY,
        pharmacyId TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        bankName TEXT,
        accountNumber TEXT,
        accountName TEXT,
        status TEXT DEFAULT 'completed',
        reference TEXT,
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        pharmacyId TEXT NOT NULL UNIQUE,
        planId TEXT NOT NULL DEFAULT 'pro',
        planName TEXT NOT NULL DEFAULT 'Professional',
        billingCycle TEXT NOT NULL DEFAULT 'monthly',
        status TEXT NOT NULL DEFAULT 'active',
        amount REAL NOT NULL DEFAULT 28000,
        currency TEXT DEFAULT 'NGN',
        startDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        currentPeriodEnd DATETIME,
        autoRenew INTEGER DEFAULT 1,
        paymentMethod TEXT DEFAULT 'card',
        cardLast4 TEXT DEFAULT '4242',
        cardBrand TEXT DEFAULT 'Visa',
        referralCreditApplied REAL DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS subscription_invoices (
        id TEXT PRIMARY KEY,
        pharmacyId TEXT NOT NULL,
        invoiceNumber TEXT NOT NULL,
        planName TEXT NOT NULL,
        billingCycle TEXT NOT NULL,
        amount REAL NOT NULL,
        discountApplied REAL DEFAULT 0,
        currency TEXT DEFAULT 'NGN',
        status TEXT DEFAULT 'paid',
        paymentMethod TEXT DEFAULT 'card',
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        periodStart DATETIME,
        periodEnd DATETIME
      );
    `);
    changesMade = true;
  } catch (e) {
    console.error('Migration failed: create referrals/subscriptions tables', e);
  }

  // Migration: Ensure default pharmacy, branch, and admin user exist for open testing access
  try {
    db.run("INSERT OR IGNORE INTO pharmacies (id, name, ownerId, tier) VALUES ('pharmacy-default', 'PHARMACY-ABC', 'user-admin-default', 'Enterprise')");
    db.run("INSERT OR IGNORE INTO branches (id, pharmacyId, name, location, phone, active) VALUES ('branch-default', 'pharmacy-default', 'Main Branch', '123 Health Ave, Wellness City', '0800-PHARMA', 1)");
    db.run("INSERT OR IGNORE INTO users (id, pharmacyId, name, username, password, role, roleId, branchId, active) VALUES ('user-admin-default', 'pharmacy-default', 'Admin Pharmacist', 'admin', 'admin123', 'store owner', 'role-store-owner-default', 'branch-default', 1)");
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('setupCompleted', 'true')");
    changesMade = true;
  } catch (e) {
    console.error('Migration failed: create default admin records', e);
  }

  // Migration: Hash existing plain-text passwords
  try {
    const stmt = db.prepare("SELECT id, password FROM users");
    const users = [];
    while (stmt.step()) {
      users.push(stmt.getAsObject());
    }
    stmt.free();
    
    for (const u of users) {
      // If password is not 64 chars (SHA-256 hex), it's likely plain text
      if (u.password && u.password.length !== 64) {
        // We can't use await here because runMigrations is async but db.run is sync
        // Wait, runMigrations IS async. But we need a sync way to hash or we do it outside.
        // Actually, we can make this part of the migration logic.
        // But crypto.subtle is async.
        // Let's use a simple synchronous hash or just skip this and let users reset.
        // Actually, I'll just do it in getDB after initialization.
      }
    }
  } catch (e) {}

  // Migration: Add batchNumber column to products if it doesn't exist
  try {
    db.run("ALTER TABLE products ADD COLUMN batchNumber TEXT;");
    changesMade = true;
  } catch (e) {}

  // Migration: Remove UNIQUE constraint from SKU in products table
  // SQLite doesn't support ALTER TABLE DROP CONSTRAINT, so we recreate the table
  try {
    const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'");
    let hasUniqueSku = false;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      if (row.sql && typeof row.sql === 'string') {
        hasUniqueSku = row.sql.includes('UNIQUE');
      }
    }
    stmt.free();
    
    if (hasUniqueSku) {
      db.run("DROP TABLE IF EXISTS products_new;");
      db.run("CREATE TABLE products_new AS SELECT * FROM products;");
      db.run("DROP TABLE products;");
      db.run(`
        CREATE TABLE products (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          sku TEXT NOT NULL,
          alias TEXT,
          category TEXT,
          subcategory TEXT,
          price REAL NOT NULL,
          wholesalePrice REAL,
          cost REAL NOT NULL,
          stock INTEGER NOT NULL DEFAULT 0,
          minStock INTEGER NOT NULL DEFAULT 5,
          description TEXT,
          expiryDate TEXT,
          batchNumber TEXT,
          model TEXT,
          manufacturer TEXT,
          type TEXT DEFAULT 'product',
          active INTEGER DEFAULT 1
        );
      `);
      db.run("INSERT INTO products (id, name, sku, alias, category, subcategory, price, wholesalePrice, cost, stock, minStock, description, expiryDate, batchNumber, model, manufacturer, type, active) SELECT id, name, sku, alias, category, subcategory, price, wholesalePrice, cost, stock, minStock, description, expiryDate, batchNumber, model, manufacturer, type, active FROM products_new;");
      db.run("DROP TABLE products_new;");
      changesMade = true;
    }
  } catch (e) {
    console.error('Migration failed: Remove UNIQUE constraint from SKU', e);
  }

  // Migration: Add branchId column to users if it doesn't exist
  try {
    db.run("ALTER TABLE users ADD COLUMN branchId TEXT;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add roleId column to users if it doesn't exist
  try {
    db.run("ALTER TABLE users ADD COLUMN roleId TEXT;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add createdBy column to users if it doesn't exist
  try {
    db.run("ALTER TABLE users ADD COLUMN createdBy TEXT;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add pin column to users if it doesn't exist
  try {
    db.run("ALTER TABLE users ADD COLUMN pin TEXT;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add location column to branches if it doesn't exist
  try {
    db.run("ALTER TABLE branches ADD COLUMN location TEXT;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add phone column to branches if it doesn't exist
  try {
    db.run("ALTER TABLE branches ADD COLUMN phone TEXT;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add active column to branches if it doesn't exist
  try {
    db.run("ALTER TABLE branches ADD COLUMN active INTEGER DEFAULT 1;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add createdAt column to branches if it doesn't exist
  try {
    db.run("ALTER TABLE branches ADD COLUMN createdAt DATETIME DEFAULT CURRENT_TIMESTAMP;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add branches table if it doesn't exist
  const branchesExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='branches'");
  if (!branchesExists.step()) {
    db.run(`
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT,
        phone TEXT,
        active INTEGER DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    changesMade = true;
  }
  branchesExists.free();

  // Migration: Add dueDate column to accounts if it doesn't exist
  try {
    db.run("ALTER TABLE accounts ADD COLUMN dueDate TEXT;");
    changesMade = true;
  } catch (e) {}

  // Migration: Add activities table if it doesn't exist
  const activitiesExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='activities'");
  if (!activitiesExists.step()) {
    db.run(`
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        userId TEXT,
        userName TEXT,
        action TEXT NOT NULL,
        entityId TEXT,
        entityName TEXT,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    changesMade = true;
  }
  activitiesExists.free();

  // Migration: Add multi-tenant columns to all relevant tables
  const tablesWithPharmacyId = [
    'products', 'sales', 'accounts', 'account_transactions', 'users', 
    'branches', 'expenses', 'returns', 'suppliers', 'purchases', 
    'purchase_items', 'market_list', 'calendar_events', 'employees', 
    'payroll', 'invoices', 'activities'
  ];
  const tablesWithBranchId = [
    'products', 'sales', 'accounts', 'account_transactions', 
    'expenses', 'returns', 'purchases', 'purchase_items', 
    'market_list', 'calendar_events', 'employees', 'payroll', 
    'invoices', 'activities'
  ];

  for (const table of tablesWithPharmacyId) {
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN pharmacyId TEXT;`);
      changesMade = true;
    } catch (e) {}
  }

  for (const table of tablesWithBranchId) {
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN branchId TEXT;`);
      changesMade = true;
    } catch (e) {}
  }

  // Migration: Add pharmacies table if it doesn't exist
  const pharmaciesTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pharmacies'");
  if (!pharmaciesTableExists.step()) {
    db.run(`
      CREATE TABLE IF NOT EXISTS pharmacies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ownerId TEXT NOT NULL,
        tier TEXT DEFAULT 'Personal',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    changesMade = true;
  }
  pharmaciesTableExists.free();

  // Migration: Ensure branches table has pharmacyId
  try {
    db.run("ALTER TABLE branches ADD COLUMN pharmacyId TEXT;");
    changesMade = true;
  } catch (e) {}

  return changesMade;
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function migratePasswords(db: any) {
  const stmt = db.prepare("SELECT id, password FROM users");
  const users = [];
  while (stmt.step()) {
    users.push(stmt.getAsObject());
  }
  stmt.free();
  
  for (const u of users) {
    // If password is not 64 chars (SHA-256 hex), it's likely plain text
    if (u.password && u.password.length !== 64) {
      const hashed = await hashPassword(u.password);
      db.run("UPDATE users SET password = ? WHERE id = ?", [hashed, u.id]);
    }
  }
}

async function initSQL() {
  if (SQL) return SQL;
  const wasmUrl = 'https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/sql-wasm.wasm';
  const wasmRes = await fetch(wasmUrl);
  const wasmBinary = await wasmRes.arrayBuffer();
  
  SQL = await initSqlJs({
    wasmBinary
  });
  return SQL;
}

export async function getDB() {
  if (dbInstance) return dbInstance;

  await initSQL();

  const savedData = await loadFromIndexedDB();
  if (savedData && savedData.length > 0) {
    dbInstance = new SQL.Database(savedData);
    await runMigrations(dbInstance);
    seedData(dbInstance); // Ensure admin user exists even if loading from backup
    await migratePasswords(dbInstance);
    await persistDB();
  } else {
    dbInstance = new SQL.Database();
    dbInstance.run(SCHEMA);
    seedData(dbInstance);
    await migratePasswords(dbInstance);
    await persistDB();
  }

  return dbInstance;
}

export function resetSettings() {
  if (!dbInstance) throw new Error('Database not initialized. Call getDB() first.');
  
  const defaultSettings = [
    ['currency', 'NGN'],
    ['currencySymbol', '₦'],
    ['storeName', 'PHARMACY-ABC'],
    ['phoneNumber', '0800-PHARMA'],
    ['storeAddress', '123 Health Ave, Wellness City'],
    ['storeEmail', 'contact@pharmacyflow.com'],
    ['receiptMessage', 'Thank you for choosing PHARMACY-ABC. We care for your health!'],
    ['categories', '[{"id":"cat-meds","name":"Medications","subcategories":["Prescription","OTC","Injections","Syrups","Suspensions"]},{"id":"cat-personal","name":"Personal Care","subcategories":["Skincare","Oral Care","Haircare","Hygiene","Beauty"]},{"id":"cat-wellness","name":"Wellness & Vitamins","subcategories":["Multivitamins","Supplements","Herbal","Nutrition"]},{"id":"cat-baby","name":"Baby & Mother","subcategories":["Diapers","Baby Food","Baby Toiletries","Maternity"]},{"id":"cat-supplies","name":"Medical Supplies","subcategories":["First Aid","Diagnostics","Surgical","Orthopedic"]},{"id":"cat-misc","name":"Miscellaneous","subcategories":["Toiletries","Others"]}]'],
    ['lowStockAlerts', 'true'],
    ['lowStockThreshold', '5'],
    ['printMethod', 'deeplink'],
    ['paperSize', 'thermal'],
    ['printBehavior', 'ask'],
    ['soundVolume', '50'],
    ['autoBackupEnabled', 'false'],
    ['backupMethod', 'local'],
    ['backupInterval', 'daily'],
    ['backupTime', '00:00'],
    ['backupPath', './backups'],
    ['taxType', 'none'],
    ['taxValue', '0'],
    ['scannerType', 'camera'],
    ['priceType', 'fixed'],
    ['printAccountName', 'true'],
    ['includeCustomerName', 'true'],
    ['debtLimitType', 'unlimited'],
    ['debtLimitAmount', '0'],
    ['allowSplitPayments', 'false'],
    ['allowPendingSales', 'true'],
    ['allowBackdatedSales', 'false'],
    ['bankName', ''],
    ['accountName', ''],
    ['accountNumber', ''],
    ['receiptCopies', '1'],
    ['printLogoOnReceipt', 'true'],
    ['printStoreAccountOnReceipt', 'true']
  ];

  transaction(() => {
    dbInstance.run("DELETE FROM settings");
    for (const [key, value] of defaultSettings) {
      dbInstance.run("INSERT INTO settings (key, value) VALUES (?, ?)", [key, value]);
    }
  });
}

export async function persistDB() {
  if (!dbInstance) return;
  const data = dbInstance.export();
  await saveToIndexedDB(data);
}

export async function importDB(data: Uint8Array) {
  await initSQL();
  
  const tempDB = new SQL.Database(data);
  const migrationsPerformed = await runMigrations(tempDB);
  
  dbInstance = tempDB;
  await persistDB();
  
  return {
    db: dbInstance,
    migrationsPerformed
  };
}

export function query(sql: string, params: any[] = []) {
  if (!dbInstance) throw new Error('Database not initialized. Call getDB() first.');
  const stmt = dbInstance.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export function queryOne(sql: string, params: any[] = []) {
  if (!dbInstance) throw new Error('Database not initialized. Call getDB() first.');
  const results = query(sql, params);
  return results.length > 0 ? results[0] : null;
}

let inTransaction = false;

export async function run(sql: string, params: any[] = []) {
  if (!dbInstance) throw new Error('Database not initialized. Call getDB() first.');
  dbInstance.run(sql, params);
  if (!inTransaction) {
    await persistDB();
  }
}

export async function transaction<T>(fn: () => T | Promise<T>): Promise<T> {
  if (!dbInstance) throw new Error('Database not initialized. Call getDB() first.');
  
  if (inTransaction) {
    return await fn();
  }

  dbInstance.run("BEGIN TRANSACTION");
  inTransaction = true;
  try {
    const result = await fn();
    dbInstance.run("COMMIT");
    inTransaction = false;
    await persistDB();
    return result;
  } catch (e) {
    inTransaction = false;
    try {
      dbInstance.run("ROLLBACK");
    } catch (rollbackError) {
      console.error('Failed to rollback transaction:', rollbackError);
    }
    throw e;
  }
}
