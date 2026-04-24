'use strict';

// ============================================================
//  TECHFLOW POS — Server complet + SSE Real-Time
//  Port: process.env.PORT | Timezone: Madagascar (UTC+3)
//  Database: Supabase (PostgreSQL) | Storage: Supabase Bucket
// ============================================================

const express     = require('express');
const bcrypt      = require('bcryptjs');
const session     = require('express-session');
const pgSession   = require('connect-pg-simple')(session);
const multer      = require('multer');
const path        = require('path');
const { Pool }    = require('pg');
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const PORT = process.env.PORT || 5000;

// ============================================================
//  SUPABASE CLIENT (Storage)
// ============================================================
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);
const BUCKET = process.env.SUPABASE_BUCKET || 'uploads';

// ============================================================
//  POSTGRESQL POOL
// ============================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('✅ PostgreSQL connecté'))
    .catch(err => console.error('❌ Erreur connexion DB:', err));

// Helper query
const query = (text, params) => pool.query(text, params);

// ============================================================
//  MADAGASCAR TIMEZONE HELPERS
// ============================================================
function getMadagascarDateTime() {
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
    return now.toISOString().replace('T', ' ').substring(0, 19);
}

function getMadagascarDate() {
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
    return now.toISOString().substring(0, 10);
}

// ============================================================
//  SSE — SERVER-SENT EVENTS
// ============================================================
const sseClients = new Map();
let   sseNextId  = 1;

function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [id, res] of sseClients) {
        try { res.write(payload); }
        catch { sseClients.delete(id); }
    }
}

setInterval(() => {
    for (const [id, res] of sseClients) {
        try { res.write('event: ping\ndata: {}\n\n'); }
        catch { sseClients.delete(id); }
    }
}, 25_000);

// ============================================================
//  INIT DATABASE (tables PostgreSQL)
// ============================================================
async function initDatabase() {
    await query(`
        CREATE TABLE IF NOT EXISTS session (
            sid    VARCHAR      NOT NULL COLLATE "default",
            sess   JSON         NOT NULL,
            expire TIMESTAMP(6) NOT NULL,
            CONSTRAINT "session_pkey" PRIMARY KEY (sid)
        )
    `);
    await query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire)`);

    await query(`
        CREATE TABLE IF NOT EXISTS users (
            id         SERIAL PRIMARY KEY,
            username   TEXT UNIQUE NOT NULL,
            password   TEXT NOT NULL,
            role       TEXT DEFAULT 'caissier',
            full_name  TEXT,
            created_at TEXT,
            is_default INTEGER DEFAULT 0
        )
    `);
    await query(`
        CREATE TABLE IF NOT EXISTS products (
            id             SERIAL PRIMARY KEY,
            name           TEXT NOT NULL,
            category       TEXT,
            purchase_price NUMERIC DEFAULT 0,
            sale_price     NUMERIC NOT NULL,
            quantity       INTEGER DEFAULT 0,
            min_stock      INTEGER DEFAULT 5,
            image          TEXT,
            barcode        TEXT,
            product_type   TEXT DEFAULT 'product',
            created_at     TEXT,
            updated_at     TEXT
        )
    `);
    // Add product_type column if upgrading from old schema
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'product'`).catch(()=>{});
    await query(`
        CREATE TABLE IF NOT EXISTS clients (
            id         SERIAL PRIMARY KEY,
            name       TEXT NOT NULL,
            phone      TEXT,
            email      TEXT,
            address    TEXT,
            created_at TEXT
        )
    `);
    await query(`
        CREATE TABLE IF NOT EXISTS sales (
            id             SERIAL PRIMARY KEY,
            invoice_number TEXT UNIQUE NOT NULL,
            client_id      INTEGER REFERENCES clients(id),
            user_id        INTEGER REFERENCES users(id),
            subtotal       NUMERIC,
            discount_type  TEXT,
            discount_value NUMERIC DEFAULT 0,
            total          NUMERIC,
            payment_method TEXT DEFAULT 'cash',
            created_at     TEXT
        )
    `);
    await query(`
        CREATE TABLE IF NOT EXISTS sale_items (
            id           SERIAL PRIMARY KEY,
            sale_id      INTEGER REFERENCES sales(id),
            product_id   INTEGER REFERENCES products(id),
            product_name TEXT,
            quantity     INTEGER,
            unit_price   NUMERIC,
            total        NUMERIC
        )
    `);
    await query(`
        CREATE TABLE IF NOT EXISTS stock_movements (
            id            SERIAL PRIMARY KEY,
            product_id    INTEGER REFERENCES products(id),
            product_name  TEXT,
            movement_type TEXT,
            quantity      INTEGER,
            reason        TEXT,
            user_id       INTEGER REFERENCES users(id),
            created_at    TEXT
        )
    `);
    await query(`
        CREATE TABLE IF NOT EXISTS expenses (
            id          SERIAL PRIMARY KEY,
            description TEXT NOT NULL,
            amount      NUMERIC NOT NULL,
            type        TEXT DEFAULT 'realized',
            category    TEXT,
            status      TEXT DEFAULT 'pending',
            created_at  TEXT
        )
    `);
    await query(`
        CREATE TABLE IF NOT EXISTS financial_goals (
            id             SERIAL PRIMARY KEY,
            name           TEXT NOT NULL,
            target_amount  NUMERIC NOT NULL,
            current_amount NUMERIC DEFAULT 0,
            deadline       TEXT,
            status         TEXT DEFAULT 'active',
            created_at     TEXT
        )
    `);
    await query(`
        CREATE TABLE IF NOT EXISTS company_config (
            id             INTEGER PRIMARY KEY,
            name           TEXT DEFAULT 'ORION POS',
            logo           TEXT,
            address        TEXT,
            phone          TEXT,
            email          TEXT,
            website        TEXT,
            invoice_header TEXT,
            invoice_footer TEXT DEFAULT 'Misaotra tompoko!',
            currency       TEXT DEFAULT 'Ar',
            tax_rate       NUMERIC DEFAULT 0
        )
    `);

    // Admin par défaut
    const defaultPassword = bcrypt.hashSync('admin_26', 10);
    const now = getMadagascarDateTime();
    await query(
        `INSERT INTO users (username, password, role, full_name, is_default, created_at)
         VALUES ('admin', $1, 'admin', 'Administrateur', 1, $2)
         ON CONFLICT (username) DO NOTHING`,
        [defaultPassword, now]
    );
    await query(`INSERT INTO company_config (id, name) VALUES (1, 'ORION POS') ON CONFLICT (id) DO NOTHING`);

    console.log('✅ Base de données initialisée');
}

// ============================================================
//  MIDDLEWARE
// ============================================================
// Trust le proxy Render pour que les cookies secure fonctionnent en HTTPS
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    store: new pgSession({ pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET || 'techflow_secret_fallback',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ─── Multer memory (RAM puis upload Supabase) ────────────────
const upload = multer({ storage: multer.memoryStorage() });

async function uploadToSupabase(file) {
    const ext      = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(filename, file.buffer, { contentType: file.mimetype });
    if (error) throw new Error('Upload Supabase échoué: ' + error.message);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    return data.publicUrl;
}

// ============================================================
//  BROADCAST HELPER
// ============================================================
async function broadcastProduct(event, productId) {
    try {
        const { rows } = await query(
            `SELECT id, name, category, sale_price, quantity, min_stock, image, barcode
             FROM products WHERE id = $1`, [productId]
        );
        if (rows[0]) broadcast(event, rows[0]);
    } catch (e) { /* silencieux */ }
}

// ============================================================
//  AUTH MIDDLEWARE
// ============================================================
const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) return next();
    res.status(401).json({ error: 'Non autorisé' });
};
const requireAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') return next();
    res.status(403).json({ error: 'Accès réservé aux administrateurs' });
};

// ============================================================
//  SSE ENDPOINT PUBLIC
// ============================================================
app.get('/api/public/events', (req, res) => {
    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const id = sseNextId++;
    sseClients.set(id, res);
    res.write('event: ping\ndata: {}\n\n');
    req.on('close', () => sseClients.delete(id));
});

// ============================================================
//  PUBLIC ROUTES
// ============================================================
app.get('/api/public/products', async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT id, name, category, sale_price, quantity, min_stock, image, barcode, product_type
             FROM products ORDER BY name`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/public/categories', async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' ORDER BY category`
        );
        res.json(rows.map(r => r.category));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  AUTH ROUTES
// ============================================================
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
    try {
        const { rows } = await query('SELECT * FROM users WHERE username = $1', [username]);
        const user = rows[0];
        if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
        if (bcrypt.compareSync(password, user.password)) {
            req.session.user = { id: user.id, username: user.username, role: user.role, full_name: user.full_name };
            req.session.save(err => {
                if (err) return res.status(500).json({ error: 'Erreur sauvegarde session' });
                res.json({ success: true, user: req.session.user });
            });
        } else {
            res.status(401).json({ error: 'Identifiants incorrects' });
        }
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.get('/api/session', (req, res) => {
    if (req.session.user) return res.json({ user: req.session.user });
    res.status(401).json({ error: 'Non connecté' });
});

// ============================================================
//  USERS ROUTES
// ============================================================
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { rows } = await query('SELECT id, username, role, full_name, created_at, is_default FROM users ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
    const { username, password, role, full_name } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis" });
    try {
        const hash = bcrypt.hashSync(password, 10);
        const now  = getMadagascarDateTime();
        const { rows } = await query(
            'INSERT INTO users (username, password, role, full_name, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id',
            [username, hash, role || 'caissier', full_name, now]
        );
        res.json({ id: rows[0].id, success: true });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: "Ce nom d'utilisateur existe déjà" });
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    const { username, password, role, full_name } = req.body;
    try {
        const { rows } = await query('SELECT is_default FROM users WHERE id = $1', [req.params.id]);
        if (rows[0] && rows[0].is_default === 1 && role !== 'admin')
            return res.status(403).json({ error: "Impossible de modifier le rôle de l'admin par défaut" });
        if (password) {
            const hash = bcrypt.hashSync(password, 10);
            await query('UPDATE users SET username=$1, password=$2, role=$3, full_name=$4 WHERE id=$5', [username, hash, role, full_name, req.params.id]);
        } else {
            await query('UPDATE users SET username=$1, role=$2, full_name=$3 WHERE id=$4', [username, role, full_name, req.params.id]);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { rows } = await query('SELECT is_default FROM users WHERE id = $1', [req.params.id]);
        if (rows[0] && rows[0].is_default === 1) return res.status(403).json({ error: "Impossible de supprimer l'admin par défaut" });
        await query('DELETE FROM users WHERE id = $1 AND is_default = 0', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  PRODUCTS ROUTES
// ============================================================
app.get('/api/products', requireAuth, async (req, res) => {
    const fields = req.session.user.role === 'admin' ? '*' : 'id, name, category, sale_price, quantity, min_stock, image, barcode, product_type';
    try {
        const { rows } = await query(`SELECT ${fields} FROM products ORDER BY name`);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products/:id', requireAuth, async (req, res) => {
    const fields = req.session.user.role === 'admin' ? '*' : 'id, name, category, sale_price, quantity, min_stock, image, barcode, product_type';
    try {
        const { rows } = await query(`SELECT ${fields} FROM products WHERE id = $1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Produit non trouvé' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/products', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
    const { name, category, purchase_price, sale_price, quantity, min_stock, barcode, product_type } = req.body;
    if (!name || !sale_price) return res.status(400).json({ error: 'Nom et prix de vente requis' });
    const isService = product_type === 'service';
    try {
        let imageUrl = null;
        if (req.file) imageUrl = await uploadToSupabase(req.file);
        const now = getMadagascarDateTime();
        const { rows } = await query(
            `INSERT INTO products (name, category, purchase_price, sale_price, quantity, min_stock, image, barcode, product_type, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [name, category || '', purchase_price || 0, sale_price,
             isService ? 0 : (quantity || 0), isService ? 0 : (min_stock || 5),
             imageUrl, barcode || '', isService ? 'service' : 'product', now, now]
        );
        const productId = rows[0].id;
        if (!isService && quantity && parseInt(quantity) > 0) {
            await query(
                `INSERT INTO stock_movements (product_id, product_name, movement_type, quantity, reason, user_id, created_at)
                 VALUES ($1,$2,'entry',$3,'Stock initial',$4,$5)`,
                [productId, name, parseInt(quantity), req.session.user.id, now]
            );
        }
        broadcastProduct('product:new', productId);
        res.json({ id: productId, success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/products/:id', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
    const { name, category, purchase_price, sale_price, quantity, min_stock, barcode, product_type } = req.body;
    const now = getMadagascarDateTime();
    try {
        const { rows: old } = await query('SELECT * FROM products WHERE id = $1', [req.params.id]);
        if (!old[0]) return res.status(404).json({ error: 'Produit non trouvé' });
        let imageUrl = old[0].image;
        if (req.file) imageUrl = await uploadToSupabase(req.file);
        const isService = (product_type || old[0].product_type) === 'service';
        const newQty = isService ? 0 : (parseInt(quantity) || 0);
        const oldQty = old[0].quantity || 0;
        await query(
            `UPDATE products SET name=$1, category=$2, purchase_price=$3, sale_price=$4,
             quantity=$5, min_stock=$6, image=$7, barcode=$8, product_type=$9, updated_at=$10 WHERE id=$11`,
            [name, category || '', purchase_price || 0, sale_price,
             newQty, isService ? 0 : (min_stock || 5), imageUrl, barcode || '',
             isService ? 'service' : 'product', now, req.params.id]
        );
        if (!isService && newQty !== oldQty) {
            const diff = newQty - oldQty;
            await query(
                `INSERT INTO stock_movements (product_id, product_name, movement_type, quantity, reason, user_id, created_at)
                 VALUES ($1,$2,$3,$4,'Ajustement admin',$5,$6)`,
                [req.params.id, name, diff > 0 ? 'entry' : 'exit', Math.abs(diff), req.session.user.id, now]
            );
        }
        broadcastProduct('product:update', parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/products/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        await query('DELETE FROM products WHERE id = $1', [id]);
        broadcast('product:delete', { id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/products/:id/add-stock', requireAuth, async (req, res) => {
    const { quantity } = req.body;
    const now = getMadagascarDateTime();
    if (!quantity || parseInt(quantity) <= 0) return res.status(400).json({ error: 'Quantité invalide' });
    try {
        const { rows } = await query('SELECT * FROM products WHERE id = $1', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Produit non trouvé' });
        const addQty = parseInt(quantity);
        const newQty = (rows[0].quantity || 0) + addQty;
        await query('UPDATE products SET quantity=$1, updated_at=$2 WHERE id=$3', [newQty, now, req.params.id]);
        await query(
            `INSERT INTO stock_movements (product_id, product_name, movement_type, quantity, reason, user_id, created_at)
             VALUES ($1,$2,'entry',$3,'Réapprovisionnement',$4,$5)`,
            [req.params.id, rows[0].name, addQty, req.session.user.id, now]
        );
        broadcastProduct('product:update', parseInt(req.params.id));
        res.json({ success: true, newQuantity: newQty });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  CLIENTS ROUTES
// ============================================================
app.get('/api/clients', requireAuth, async (req, res) => {
    try {
        const { rows } = await query('SELECT * FROM clients ORDER BY name');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/clients/:id', requireAuth, async (req, res) => {
    try {
        const { rows } = await query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Client non trouvé' });
        const { rows: sales } = await query(
            `SELECT s.*, STRING_AGG(si.product_name || ' x' || si.quantity, ', ') as items
             FROM sales s LEFT JOIN sale_items si ON s.id = si.sale_id
             WHERE s.client_id = $1 GROUP BY s.id ORDER BY s.created_at DESC`,
            [req.params.id]
        );
        res.json({ ...rows[0], sales: sales || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clients', requireAuth, async (req, res) => {
    const { name, phone, email, address } = req.body;
    if (!name) return res.status(400).json({ error: 'Le nom est requis' });
    try {
        const now = getMadagascarDateTime();
        const { rows } = await query(
            'INSERT INTO clients (name, phone, email, address, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id',
            [name, phone || '', email || '', address || '', now]
        );
        res.json({ id: rows[0].id, success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/clients/:id', requireAuth, async (req, res) => {
    const { name, phone, email, address } = req.body;
    try {
        await query('UPDATE clients SET name=$1, phone=$2, email=$3, address=$4 WHERE id=$5',
            [name, phone || '', email || '', address || '', req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/clients/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query('DELETE FROM clients WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  SALES ROUTES
// ============================================================
function generateInvoiceNumber() {
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const y=now.getFullYear(), mo=String(now.getMonth()+1).padStart(2,'0'), d=String(now.getDate()).padStart(2,'0');
    const h=String(now.getHours()).padStart(2,'0'), mi=String(now.getMinutes()).padStart(2,'0'), s=String(now.getSeconds()).padStart(2,'0');
    return `FAC-${y}${mo}${d}-${h}${mi}${s}`;
}

app.get('/api/sales', requireAuth, async (req, res) => {
    const { period } = req.query;
    const today = getMadagascarDate();
    let filter = '';
    if (period === 'today') filter = `AND DATE(s.created_at) = '${today}'`;
    else if (period === 'week')  filter = `AND s.created_at >= (CURRENT_DATE - INTERVAL '7 days')::TEXT`;
    else if (period === 'month') filter = `AND s.created_at >= (CURRENT_DATE - INTERVAL '30 days')::TEXT`;
    try {
        const { rows } = await query(
            `SELECT s.*, c.name as client_name, u.username as user_name, u.full_name as user_full_name
             FROM sales s LEFT JOIN clients c ON s.client_id=c.id LEFT JOIN users u ON s.user_id=u.id
             WHERE 1=1 ${filter} ORDER BY s.created_at DESC`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sales/:id', requireAuth, async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT s.*, c.name as client_name, c.phone as client_phone, u.username as user_name, u.full_name as user_full_name
             FROM sales s LEFT JOIN clients c ON s.client_id=c.id LEFT JOIN users u ON s.user_id=u.id WHERE s.id=$1`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Vente non trouvée' });
        const { rows: items } = await query('SELECT * FROM sale_items WHERE sale_id = $1', [req.params.id]);
        res.json({ ...rows[0], items: items || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sales', requireAuth, async (req, res) => {
    const { client_id, client_name, client_phone, items, subtotal, discount_type, discount_value, total, payment_method } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Le panier est vide' });
    const invoice_number = generateInvoiceNumber();
    const now = getMadagascarDateTime();
    try {
        let finalClientId = null;
        if (client_id) {
            finalClientId = client_id;
        } else if (client_name && client_name.trim()) {
            const { rows } = await query('INSERT INTO clients (name, phone, created_at) VALUES ($1,$2,$3) RETURNING id',
                [client_name.trim(), client_phone || '', now]);
            finalClientId = rows[0].id;
        }
        const { rows: saleRows } = await query(
            `INSERT INTO sales (invoice_number, client_id, user_id, subtotal, discount_type, discount_value, total, payment_method, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [invoice_number, finalClientId, req.session.user.id, subtotal, discount_type || 'percent', discount_value || 0, total, payment_method || 'cash', now]
        );
        const saleId = saleRows[0].id;
        const affectedIds = [];
        for (const item of items) {
            await query(`INSERT INTO sale_items (sale_id,product_id,product_name,quantity,unit_price,total) VALUES ($1,$2,$3,$4,$5,$6)`,
                [saleId, item.id, item.name, item.quantity, item.price, item.quantity * item.price]);
            // Ne pas décrémenter le stock pour les services
            if (item.product_type !== 'service') {
                await query('UPDATE products SET quantity=quantity-$1, updated_at=$2 WHERE id=$3', [item.quantity, now, item.id]);
                await query(`INSERT INTO stock_movements (product_id,product_name,movement_type,quantity,reason,user_id,created_at) VALUES ($1,$2,'exit',$3,$4,$5,$6)`,
                    [item.id, item.name, item.quantity, 'Vente ' + invoice_number, req.session.user.id, now]);
                affectedIds.push(item.id);
            }
        }
        setTimeout(() => { affectedIds.forEach(pid => broadcastProduct('product:update', pid)); }, 120);
        res.json({ id: saleId, invoice_number, success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/sales/:id', requireAuth, requireAdmin, async (req, res) => {
    const now = getMadagascarDateTime();
    try {
        const { rows } = await query('SELECT invoice_number FROM sales WHERE id=$1', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Vente non trouvée' });
        const { rows: items } = await query('SELECT * FROM sale_items WHERE sale_id=$1', [req.params.id]);
        const affectedIds = [];
        for (const item of items) {
            // Restaurer stock seulement pour les produits (pas les services)
            const { rows: ptype } = await query('SELECT product_type FROM products WHERE id=$1', [item.product_id]);
            if (!ptype[0] || ptype[0].product_type !== 'service') {
                await query('UPDATE products SET quantity=quantity+$1, updated_at=$2 WHERE id=$3', [item.quantity, now, item.product_id]);
                await query(`INSERT INTO stock_movements (product_id,product_name,movement_type,quantity,reason,user_id,created_at) VALUES ($1,$2,'entry',$3,$4,$5,$6)`,
                    [item.product_id, item.product_name, item.quantity, 'Annulation vente ' + rows[0].invoice_number, req.session.user.id, now]);
                affectedIds.push(item.product_id);
            }
        }
        await query('DELETE FROM sale_items WHERE sale_id=$1', [req.params.id]);
        await query('DELETE FROM sales WHERE id=$1', [req.params.id]);
        setTimeout(() => { affectedIds.forEach(pid => broadcastProduct('product:update', pid)); }, 120);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  STOCK MOVEMENTS
// ============================================================
app.get('/api/stock-movements', requireAuth, async (req, res) => {
    const { period } = req.query;
    const today = getMadagascarDate();
    let filter = '';
    if (period === 'today') filter = `WHERE DATE(sm.created_at) = '${today}'`;
    else if (period === 'week')  filter = `WHERE sm.created_at >= (CURRENT_DATE - INTERVAL '7 days')::TEXT`;
    else if (period === 'month') filter = `WHERE sm.created_at >= (CURRENT_DATE - INTERVAL '30 days')::TEXT`;
    try {
        const { rows } = await query(
            `SELECT sm.*, u.username as user_name, u.full_name as user_full_name
             FROM stock_movements sm LEFT JOIN users u ON sm.user_id=u.id ${filter} ORDER BY sm.created_at DESC`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stock-movements', requireAuth, requireAdmin, async (req, res) => {
    const { product_id, movement_type, quantity, reason } = req.body;
    const now = getMadagascarDateTime();
    if (!product_id || !movement_type || !quantity) return res.status(400).json({ error: 'Données manquantes' });
    try {
        const { rows } = await query('SELECT * FROM products WHERE id=$1', [product_id]);
        if (!rows[0]) return res.status(404).json({ error: 'Produit non trouvé' });
        const qty = parseInt(quantity);
        let newQty;
        if (movement_type === 'entry') { newQty = (rows[0].quantity || 0) + qty; }
        else { newQty = (rows[0].quantity || 0) - qty; if (newQty < 0) return res.status(400).json({ error: 'Stock insuffisant' }); }
        await query('UPDATE products SET quantity=$1, updated_at=$2 WHERE id=$3', [newQty, now, product_id]);
        const { rows: mvt } = await query(
            `INSERT INTO stock_movements (product_id,product_name,movement_type,quantity,reason,user_id,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [product_id, rows[0].name, movement_type, qty, reason || 'Mouvement manuel', req.session.user.id, now]
        );
        broadcastProduct('product:update', parseInt(product_id));
        res.json({ id: mvt[0].id, success: true, newQuantity: newQty });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/stock-movements/:id', requireAuth, requireAdmin, async (req, res) => {
    const now = getMadagascarDateTime();
    try {
        const { rows } = await query('SELECT * FROM stock_movements WHERE id=$1', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Mouvement non trouvé' });
        const movement = rows[0];
        const { rows: prod } = await query('SELECT * FROM products WHERE id=$1', [movement.product_id]);
        if (prod[0]) {
            const newQty = movement.movement_type === 'entry'
                ? Math.max(0, (prod[0].quantity || 0) - movement.quantity)
                : (prod[0].quantity || 0) + movement.quantity;
            await query('UPDATE products SET quantity=$1, updated_at=$2 WHERE id=$3', [newQty, now, movement.product_id]);
        }
        await query('DELETE FROM stock_movements WHERE id=$1', [req.params.id]);
        if (prod[0]) setTimeout(() => broadcastProduct('product:update', movement.product_id), 80);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  DASHBOARD STATS
// ============================================================
app.get('/api/dashboard/stats', requireAuth, requireAdmin, async (req, res) => {
    const today = getMadagascarDate();
    try {
        const { rows: td } = await query(`SELECT COUNT(*) as count, COALESCE(SUM(total),0) as revenue FROM sales WHERE DATE(created_at)=$1`, [today]);
        const { rows: mo } = await query(`SELECT COUNT(*) as count, COALESCE(SUM(total),0) as revenue FROM sales WHERE created_at>=(CURRENT_DATE-INTERVAL '30 days')::TEXT`);
        const { rows: cr } = await query("SELECT COUNT(*) as count FROM products WHERE quantity<=min_stock AND (product_type IS NULL OR product_type != 'service')");
        const { rows: si } = await query(`SELECT si.quantity,si.unit_price,p.purchase_price FROM sale_items si JOIN products p ON si.product_id=p.id JOIN sales s ON si.sale_id=s.id WHERE s.created_at>=(CURRENT_DATE-INTERVAL '30 days')::TEXT`);
        const { rows: ex } = await query(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE status='validated' AND created_at>=(CURRENT_DATE-INTERVAL '30 days')::TEXT`);
        let profit = 0;
        si.forEach(i => { profit += (parseFloat(i.unit_price) - parseFloat(i.purchase_price || 0)) * i.quantity; });
        res.json({
            todaySales: parseInt(td[0].count), todayRevenue: parseFloat(td[0].revenue),
            monthSales: parseInt(mo[0].count), monthRevenue: parseFloat(mo[0].revenue),
            criticalStock: parseInt(cr[0].count), monthProfit: profit,
            monthExpenses: parseFloat(ex[0].total), netProfit: profit - parseFloat(ex[0].total)
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard/chart', requireAuth, requireAdmin, async (req, res) => {
    const { period } = req.query;
    const days = period === 'week' ? 7 : 30;
    try {
        const { rows } = await query(
            `SELECT DATE(created_at) as date, SUM(total) as revenue, COUNT(*) as sales
             FROM sales WHERE created_at>=(CURRENT_DATE-INTERVAL '${days} days')::TEXT
             GROUP BY DATE(created_at) ORDER BY date`
        );
        res.json(rows || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard/top-products', requireAuth, async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT si.product_name, SUM(si.quantity) as total_sold, SUM(si.total) as revenue
             FROM sale_items si JOIN sales s ON si.sale_id=s.id
             WHERE s.created_at>=(CURRENT_DATE-INTERVAL '30 days')::TEXT
             GROUP BY si.product_id,si.product_name ORDER BY total_sold DESC LIMIT 10`
        );
        res.json(rows || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  INVENTORY STATS
// ============================================================
app.get('/api/inventory/stats', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT COUNT(*) as totalProducts,
                    COALESCE(SUM(sale_price*quantity),0) as totalStockValue,
                    COALESCE(SUM(purchase_price*quantity),0) as totalPurchaseValue,
                    COALESCE(SUM((sale_price-purchase_price)*quantity),0) as totalPotentialProfit
             FROM products`
        );
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  PROFITS ROUTES
// ============================================================
function buildProfitFilter(period, start_date, end_date, today, alias = 's') {
    if (start_date && end_date) return `WHERE DATE(${alias}.created_at) BETWEEN '${start_date}' AND '${end_date}'`;
    if (period === 'week')  return `WHERE ${alias}.created_at>=(CURRENT_DATE-INTERVAL '7 days')::TEXT`;
    if (period === 'month') return `WHERE ${alias}.created_at>=(CURRENT_DATE-INTERVAL '30 days')::TEXT`;
    return `WHERE DATE(${alias}.created_at)='${today}'`;
}

app.get('/api/profits/daily', requireAuth, requireAdmin, async (req, res) => {
    const { start_date, end_date } = req.query;
    const filter = buildProfitFilter(null, start_date, end_date, getMadagascarDate());
    try {
        const { rows } = await query(
            `SELECT DATE(s.created_at) as date, si.product_name, si.product_id,
                    SUM(si.quantity) as total_quantity, SUM(si.total) as total_revenue,
                    COALESCE(SUM(si.quantity*p.purchase_price),0) as total_cost,
                    SUM(si.total-(si.quantity*COALESCE(p.purchase_price,0))) as total_profit
             FROM sale_items si JOIN sales s ON si.sale_id=s.id LEFT JOIN products p ON si.product_id=p.id
             ${filter} GROUP BY DATE(s.created_at),si.product_id,si.product_name ORDER BY date DESC,total_profit DESC`
        );
        const grouped = {};
        rows.forEach(row => {
            if (!grouped[row.date]) grouped[row.date] = { date: row.date, products: [], totalRevenue: 0, totalCost: 0, totalProfit: 0 };
            grouped[row.date].products.push(row);
            grouped[row.date].totalRevenue += parseFloat(row.total_revenue);
            grouped[row.date].totalCost    += parseFloat(row.total_cost);
            grouped[row.date].totalProfit  += parseFloat(row.total_profit);
        });
        res.json(Object.values(grouped));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/profits/summary', requireAuth, requireAdmin, async (req, res) => {
    const { period } = req.query;
    let filter = '', groupBy = '';
    switch (period) {
        case 'weekly':  filter=`WHERE s.created_at>=(CURRENT_DATE-INTERVAL '7 days')::TEXT`;  groupBy=`TO_CHAR(s.created_at::DATE,'IYYY-IW')`; break;
        case 'monthly': filter=`WHERE s.created_at>=(CURRENT_DATE-INTERVAL '30 days')::TEXT`; groupBy=`TO_CHAR(s.created_at::DATE,'YYYY-MM')`; break;
        default:        filter=`WHERE s.created_at>=(CURRENT_DATE-INTERVAL '30 days')::TEXT`; groupBy=`DATE(s.created_at)`;
    }
    try {
        const { rows } = await query(
            `SELECT ${groupBy} as period, SUM(si.total) as total_revenue,
                    COALESCE(SUM(si.quantity*p.purchase_price),0) as total_cost,
                    SUM(si.total-(si.quantity*COALESCE(p.purchase_price,0))) as total_profit,
                    COUNT(DISTINCT s.id) as total_sales
             FROM sale_items si JOIN sales s ON si.sale_id=s.id LEFT JOIN products p ON si.product_id=p.id
             ${filter} GROUP BY ${groupBy} ORDER BY period DESC`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/profits/top-products', requireAuth, requireAdmin, async (req, res) => {
    const { period } = req.query;
    const filter = buildProfitFilter(period, null, null, getMadagascarDate());
    try {
        const { rows } = await query(
            `SELECT si.product_id, si.product_name, SUM(si.quantity) as total_quantity,
                    SUM(si.total) as total_revenue,
                    COALESCE(SUM(si.quantity*p.purchase_price),0) as total_cost,
                    SUM(si.total-(si.quantity*COALESCE(p.purchase_price,0))) as total_profit,
                    ROUND((SUM(si.total-(si.quantity*COALESCE(p.purchase_price,0)))/NULLIF(SUM(si.total),0))*100,2) as profit_margin
             FROM sale_items si JOIN sales s ON si.sale_id=s.id LEFT JOIN products p ON si.product_id=p.id
             ${filter} GROUP BY si.product_id,si.product_name ORDER BY total_profit DESC LIMIT 20`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/profits/pdf-data', requireAuth, requireAdmin, async (req, res) => {
    const { period, start_date, end_date } = req.query;
    const today = getMadagascarDate();
    const filter = buildProfitFilter(period, start_date, end_date, today);
    try {
        const { rows: dailyData } = await query(
            `SELECT DATE(s.created_at) as date, si.product_name, SUM(si.quantity) as quantity,
                    SUM(si.total) as revenue, COALESCE(SUM(si.quantity*p.purchase_price),0) as cost,
                    SUM(si.total-(si.quantity*COALESCE(p.purchase_price,0))) as profit
             FROM sale_items si JOIN sales s ON si.sale_id=s.id LEFT JOIN products p ON si.product_id=p.id
             ${filter} GROUP BY DATE(s.created_at),si.product_id,si.product_name ORDER BY date DESC,profit DESC`
        );
        const { rows: topProducts } = await query(
            `SELECT si.product_name, SUM(si.quantity) as total_quantity, SUM(si.total) as total_revenue,
                    COALESCE(SUM(si.quantity*p.purchase_price),0) as total_cost,
                    SUM(si.total-(si.quantity*COALESCE(p.purchase_price,0))) as total_profit,
                    ROUND((SUM(si.total-(si.quantity*COALESCE(p.purchase_price,0)))/NULLIF(SUM(si.total),0))*100,2) as profit_margin
             FROM sale_items si JOIN sales s ON si.sale_id=s.id LEFT JOIN products p ON si.product_id=p.id
             ${filter} GROUP BY si.product_id,si.product_name ORDER BY total_profit DESC LIMIT 10`
        );
        let totalRevenue=0, totalCost=0, totalProfit=0;
        dailyData.forEach(i => { totalRevenue+=parseFloat(i.revenue||0); totalCost+=parseFloat(i.cost||0); totalProfit+=parseFloat(i.profit||0); });
        res.json({ period, date_range:{start:start_date||today,end:end_date||today},
            summary:{total_revenue:totalRevenue,total_cost:totalCost,total_profit:totalProfit,total_sales:dailyData.length,avg_margin:totalRevenue>0?(totalProfit/totalRevenue*100).toFixed(2):0},
            daily_profits:dailyData, top_products:topProducts, generated_at:getMadagascarDateTime() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/profits/pdf-full-data', requireAuth, requireAdmin, async (req, res) => {
    const { period, start_date, end_date } = req.query;
    const today = getMadagascarDate();
    const filter = buildProfitFilter(period, start_date, end_date, today);
    try {
        const { rows: dailySummary } = await query(
            `SELECT DATE(s.created_at) as date, SUM(si.total) as total_revenue,
                    COALESCE(SUM(si.quantity*p.purchase_price),0) as total_cost,
                    SUM(si.total-(si.quantity*COALESCE(p.purchase_price,0))) as total_profit
             FROM sale_items si JOIN sales s ON si.sale_id=s.id LEFT JOIN products p ON si.product_id=p.id
             ${filter} GROUP BY DATE(s.created_at) ORDER BY date DESC`
        );
        const { rows: productsByDay } = await query(
            `SELECT DATE(s.created_at) as date, si.product_id, si.product_name,
                    SUM(si.quantity) as quantity, SUM(si.total) as revenue,
                    COALESCE(SUM(si.quantity*p.purchase_price),0) as cost,
                    SUM(si.total-(si.quantity*COALESCE(p.purchase_price,0))) as profit
             FROM sale_items si JOIN sales s ON si.sale_id=s.id LEFT JOIN products p ON si.product_id=p.id
             ${filter} GROUP BY DATE(s.created_at),si.product_id,si.product_name ORDER BY date DESC,profit DESC`
        );
        const { rows: topProducts } = await query(
            `SELECT si.product_id, si.product_name, SUM(si.quantity) as total_quantity,
                    SUM(si.total) as total_revenue, COALESCE(SUM(si.quantity*p.purchase_price),0) as total_cost,
                    SUM(si.total-(si.quantity*COALESCE(p.purchase_price,0))) as total_profit,
                    ROUND((SUM(si.total-(si.quantity*COALESCE(p.purchase_price,0)))/NULLIF(SUM(si.total),0))*100,2) as profit_margin
             FROM sale_items si JOIN sales s ON si.sale_id=s.id LEFT JOIN products p ON si.product_id=p.id
             ${filter} GROUP BY si.product_id,si.product_name ORDER BY total_profit DESC LIMIT 10`
        );
        const grouped = {};
        dailySummary.forEach(day => { grouped[day.date]={date:day.date,totalRevenue:parseFloat(day.total_revenue),totalCost:parseFloat(day.total_cost),totalProfit:parseFloat(day.total_profit),products:[]}; });
        productsByDay.forEach(p => { if(grouped[p.date]) grouped[p.date].products.push(p); });
        const finalData = Object.values(grouped);
        const totals = { totalRevenue:finalData.reduce((s,d)=>s+d.totalRevenue,0), totalCost:finalData.reduce((s,d)=>s+d.totalCost,0), totalProfit:finalData.reduce((s,d)=>s+d.totalProfit,0) };
        totals.avgMargin = totals.totalRevenue>0?(totals.totalProfit/totals.totalRevenue*100).toFixed(2):0;
        res.json({ period, date_range:{start:start_date||today,end:end_date||today}, summary:totals, daily_profits:finalData, top_products:topProducts, generated_at:getMadagascarDateTime() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products/:id/profit-details', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT DATE(s.created_at) as date, SUM(si.quantity) as quantity, SUM(si.total) as revenue,
                    COALESCE(SUM(si.quantity*p.purchase_price),0) as cost,
                    SUM(si.total-(si.quantity*COALESCE(p.purchase_price,0))) as profit
             FROM sale_items si JOIN sales s ON si.sale_id=s.id LEFT JOIN products p ON si.product_id=p.id
             WHERE si.product_id=$1 AND s.created_at>=(CURRENT_DATE-INTERVAL '30 days')::TEXT
             GROUP BY DATE(s.created_at) ORDER BY date DESC`, [req.params.id]
        );
        const totalRevenue=rows.reduce((s,i)=>s+parseFloat(i.revenue),0);
        const totalCost=rows.reduce((s,i)=>s+parseFloat(i.cost),0);
        const totalProfit=rows.reduce((s,i)=>s+parseFloat(i.profit),0);
        const totalQuantity=rows.reduce((s,i)=>s+parseInt(i.quantity),0);
        res.json({ total_revenue:totalRevenue, total_cost:totalCost, total_profit:totalProfit, total_quantity:totalQuantity, avg_margin:totalRevenue>0?totalProfit/totalRevenue*100:0, history:rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  TREASURY / EXPENSES
// ============================================================
app.get('/api/expenses', requireAuth, requireAdmin, async (req, res) => {
    try { const { rows } = await query('SELECT * FROM expenses ORDER BY created_at DESC'); res.json(rows); }
    catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/expenses', requireAuth, requireAdmin, async (req, res) => {
    const { description, amount, type, category, status } = req.body;
    if (!description || !amount) return res.status(400).json({ error: 'Description et montant requis' });
    try {
        const now = getMadagascarDateTime();
        const { rows } = await query('INSERT INTO expenses (description,amount,type,category,status,created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
            [description, amount, type || 'realized', category || '', status || 'pending', now]);
        res.json({ id: rows[0].id, success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/expenses/:id', requireAuth, requireAdmin, async (req, res) => {
    const { description, amount, type, category, status } = req.body;
    try { await query('UPDATE expenses SET description=$1,amount=$2,type=$3,category=$4,status=$5 WHERE id=$6', [description,amount,type,category,status,req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/expenses/:id', requireAuth, requireAdmin, async (req, res) => {
    try { await query('DELETE FROM expenses WHERE id=$1', [req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  FINANCIAL GOALS
// ============================================================
app.get('/api/financial-goals', requireAuth, requireAdmin, async (req, res) => {
    try { const { rows } = await query('SELECT * FROM financial_goals ORDER BY created_at DESC'); res.json(rows); }
    catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/financial-goals', requireAuth, requireAdmin, async (req, res) => {
    const { name, target_amount, deadline } = req.body;
    if (!name || !target_amount) return res.status(400).json({ error: 'Nom et montant cible requis' });
    try {
        const now = getMadagascarDateTime();
        const { rows } = await query('INSERT INTO financial_goals (name,target_amount,deadline,created_at) VALUES ($1,$2,$3,$4) RETURNING id', [name,target_amount,deadline||'',now]);
        res.json({ id: rows[0].id, success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/financial-goals/:id', requireAuth, requireAdmin, async (req, res) => {
    const { name, target_amount, current_amount, deadline, status } = req.body;
    try { await query('UPDATE financial_goals SET name=$1,target_amount=$2,current_amount=$3,deadline=$4,status=$5 WHERE id=$6', [name,target_amount,current_amount||0,deadline,status||'active',req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/financial-goals/:id', requireAuth, requireAdmin, async (req, res) => {
    try { await query('DELETE FROM financial_goals WHERE id=$1', [req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  COMPANY CONFIG
// ============================================================
app.get('/api/config', requireAuth, async (req, res) => {
    try { const { rows } = await query('SELECT * FROM company_config WHERE id=1'); res.json(rows[0] || {}); }
    catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/config', requireAuth, requireAdmin, upload.single('logo'), async (req, res) => {
    const { name, address, phone, email, website, invoice_header, invoice_footer, currency, tax_rate } = req.body;
    try {
        const { rows: current } = await query('SELECT logo FROM company_config WHERE id=1');
        let logo = current[0] ? current[0].logo : null;
        if (req.file) logo = await uploadToSupabase(req.file);
        await query(`UPDATE company_config SET name=$1,logo=$2,address=$3,phone=$4,email=$5,website=$6,invoice_header=$7,invoice_footer=$8,currency=$9,tax_rate=$10 WHERE id=1`,
            [name||'ORION POS',logo,address||'',phone||'',email||'',website||'',invoice_header||'',invoice_footer||'Misaotra tompoko!',currency||'Ar',tax_rate||0]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  CATEGORIES
// ============================================================
app.get('/api/categories', requireAuth, async (req, res) => {
    try {
        const { rows } = await query(`SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category!='' ORDER BY category`);
        res.json(rows.map(r => r.category));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  EXPORTS CSV
// ============================================================
app.get('/api/export/clients', requireAuth, async (req, res) => {
    try {
        const { rows } = await query('SELECT name,phone,email,address FROM clients ORDER BY name');
        let csv = '\ufeffNom,Téléphone,Email,Adresse\n';
        rows.forEach(r => { csv += `"${r.name||''}","${r.phone||''}","${r.email||''}","${r.address||''}"\n`; });
        res.setHeader('Content-Type','text/csv; charset=utf-8');
        res.setHeader('Content-Disposition','attachment; filename=clients.csv');
        res.send(csv);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/export/sales', requireAuth, async (req, res) => {
    const { period } = req.query;
    const today = getMadagascarDate();
    let filter = '';
    if (period==='today') filter=`WHERE DATE(s.created_at)='${today}'`;
    else if (period==='week')  filter=`WHERE s.created_at>=(CURRENT_DATE-INTERVAL '7 days')::TEXT`;
    else if (period==='month') filter=`WHERE s.created_at>=(CURRENT_DATE-INTERVAL '30 days')::TEXT`;
    try {
        const { rows } = await query(`SELECT s.invoice_number,s.created_at,c.name as client,s.subtotal,s.discount_value,s.total,u.full_name as vendeur FROM sales s LEFT JOIN clients c ON s.client_id=c.id LEFT JOIN users u ON s.user_id=u.id ${filter} ORDER BY s.created_at DESC`);
        let csv = '\ufeffNuméro Facture,Date,Client,Sous-total,Remise,Total,Vendeur\n';
        rows.forEach(r => { csv += `"${r.invoice_number}","${r.created_at}","${r.client||'Anonyme'}","${r.subtotal}","${r.discount_value}","${r.total}","${r.vendeur||''}"\n`; });
        res.setHeader('Content-Type','text/csv; charset=utf-8');
        res.setHeader('Content-Disposition',`attachment; filename=ventes_${period||'all'}.csv`);
        res.send(csv);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/export/stock-movements', requireAuth, async (req, res) => {
    const { period } = req.query;
    const today = getMadagascarDate();
    let filter = '';
    if (period==='today') filter=`WHERE DATE(sm.created_at)='${today}'`;
    else if (period==='month') filter=`WHERE sm.created_at>=(CURRENT_DATE-INTERVAL '30 days')::TEXT`;
    try {
        const { rows } = await query(`SELECT sm.created_at,sm.product_name,sm.movement_type,sm.quantity,sm.reason,u.full_name as utilisateur FROM stock_movements sm LEFT JOIN users u ON sm.user_id=u.id ${filter} ORDER BY sm.created_at DESC`);
        let csv = '\ufeffDate,Produit,Type,Quantité,Raison,Utilisateur\n';
        rows.forEach(r => { csv += `"${r.created_at}","${r.product_name}","${r.movement_type==='entry'?'Entrée':'Sortie'}","${r.quantity}","${r.reason||''}","${r.utilisateur||''}"\n`; });
        res.setHeader('Content-Type','text/csv; charset=utf-8');
        res.setHeader('Content-Disposition',`attachment; filename=mouvements_stock_${period||'all'}.csv`);
        res.send(csv);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/export/profits-products', requireAuth, requireAdmin, async (req, res) => {
    const { period, start_date, end_date } = req.query;
    const filter = buildProfitFilter(period, start_date, end_date, getMadagascarDate());
    try {
        const { rows } = await query(
            `SELECT si.product_name, SUM(si.quantity) as quantity, SUM(si.total) as revenue,
                    COALESCE(SUM(si.quantity*p.purchase_price),0) as cost,
                    SUM(si.total-(si.quantity*COALESCE(p.purchase_price,0))) as profit,
                    ROUND((SUM(si.total-(si.quantity*COALESCE(p.purchase_price,0)))/NULLIF(SUM(si.total),0))*100,2) as margin,
                    COUNT(DISTINCT DATE(s.created_at)) as days_sold
             FROM sale_items si JOIN sales s ON si.sale_id=s.id LEFT JOIN products p ON si.product_id=p.id
             ${filter} GROUP BY si.product_id,si.product_name ORDER BY profit DESC`
        );
        let csv = '\ufeffProduit,Quantité,Jours de vente,Revenus,Coûts,Profit,Marge(%)\n';
        rows.forEach(r => { csv += `"${r.product_name}","${r.quantity}","${r.days_sold}","${r.revenue}","${r.cost}","${r.profit}","${r.margin}"\n`; });
        res.setHeader('Content-Type','text/csv; charset=utf-8');
        res.setHeader('Content-Disposition',`attachment; filename="profits_par_produit_${getMadagascarDate().replace(/-/g,'')}.csv"`);
        res.send(csv);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  START SERVER
// ============================================================
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log('');
        console.log('════════════════════════════════════════════════════════════════');
        console.log('   TECHFLOW POS — Production Build (Render + Supabase)');
        console.log('════════════════════════════════════════════════════════════════');
        console.log('');
        console.log(`   ✅  Serveur démarré sur le port ${PORT}`);
        console.log(`   🌍  Timezone : Madagascar (UTC+3)`);
        console.log(`   🕐  Date/Heure : ${getMadagascarDateTime()}`);
        console.log(`   🗄️   Database : Supabase PostgreSQL`);
        console.log(`   🖼️   Storage  : Supabase Bucket (${BUCKET})`);
        console.log(`   📡  SSE endpoint : /api/public/events`);
        console.log('');
    });
}).catch(err => {
    console.error('❌ Erreur initialisation DB:', err);
    process.exit(1);
});
