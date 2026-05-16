'use strict';

// ============================================================
//  TECHFLOW POS — Server complet + SSE Real-Time
//  Port: 5000 | Timezone: Madagascar (UTC+3)
// ============================================================

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt  = require('bcryptjs');
const session = require('express-session');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = 5000;

// ============================================================
//  MADAGASCAR TIMEZONE HELPERS
// ============================================================
function getMadagascarDateTime() {
    const now = new Date();
    const y  = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d  = String(now.getDate()).padStart(2, '0');
    const h  = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const s  = String(now.getSeconds()).padStart(2, '0');
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

function getMadagascarDate() {
    const now = new Date();
    const y  = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d  = String(now.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
}

// ============================================================
//  SSE — SERVER-SENT EVENTS
//  Les clients catalog.html se connectent ici pour recevoir
//  les mises à jour en temps réel.
// ============================================================
const sseClients = new Map();   // id → res
let   sseNextId  = 1;

/**
 * Envoie un événement SSE à tous les clients connectés.
 * @param {string} event  - 'product:update' | 'product:new' | 'product:delete'
 * @param {object} data   - Payload JSON
 */
function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [id, res] of sseClients) {
        try {
            res.write(payload);
        } catch {
            sseClients.delete(id);
        }
    }
}

// Keepalive — ping toutes les 25s pour éviter les timeouts Nginx / proxies
setInterval(() => {
    for (const [id, res] of sseClients) {
        try { res.write('event: ping\ndata: {}\n\n'); }
        catch { sseClients.delete(id); }
    }
}, 25_000);

// ============================================================
//  MIDDLEWARE
// ============================================================
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'orion_pos_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ─── Multer (upload images) ─────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'public/uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// ============================================================
//  DATABASE
// ============================================================
const db = new sqlite3.Database('./database.sqlite', err => {
    if (err) console.error('❌ Erreur connexion DB:', err);
    else     console.log('✅ Base de données connectée');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        username   TEXT    UNIQUE NOT NULL,
        password   TEXT    NOT NULL,
        role       TEXT    DEFAULT 'caissier',
        full_name  TEXT,
        created_at TEXT,
        is_default INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        name           TEXT    NOT NULL,
        category       TEXT,
        purchase_price REAL    DEFAULT 0,
        sale_price     REAL    NOT NULL,
        quantity       INTEGER DEFAULT 0,
        min_stock      INTEGER DEFAULT 5,
        image          TEXT,
        barcode        TEXT,
        created_at     TEXT,
        updated_at     TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS clients (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        phone      TEXT,
        email      TEXT,
        address    TEXT,
        created_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sales (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT UNIQUE NOT NULL,
        client_id      INTEGER,
        user_id        INTEGER,
        subtotal       REAL,
        discount_type  TEXT,
        discount_value REAL    DEFAULT 0,
        total          REAL,
        payment_method TEXT    DEFAULT 'cash',
        created_at     TEXT,
        FOREIGN KEY (client_id) REFERENCES clients(id),
        FOREIGN KEY (user_id)   REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sale_items (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id      INTEGER,
        product_id   INTEGER,
        product_name TEXT,
        quantity     INTEGER,
        unit_price   REAL,
        total        REAL,
        FOREIGN KEY (sale_id)    REFERENCES sales(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS stock_movements (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id    INTEGER,
        product_name  TEXT,
        movement_type TEXT,
        quantity      INTEGER,
        reason        TEXT,
        user_id       INTEGER,
        created_at    TEXT,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (user_id)    REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS expenses (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        description TEXT NOT NULL,
        amount      REAL NOT NULL,
        type        TEXT DEFAULT 'realized',
        category    TEXT,
        status      TEXT DEFAULT 'pending',
        created_at  TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS financial_goals (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        name           TEXT NOT NULL,
        target_amount  REAL NOT NULL,
        current_amount REAL DEFAULT 0,
        deadline       TEXT,
        status         TEXT DEFAULT 'active',
        created_at     TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS company_config (
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
        tax_rate       REAL DEFAULT 0
    )`);

    // Admin par défaut
    const defaultPassword = bcrypt.hashSync('admin_26', 10);
    const now = getMadagascarDateTime();
    db.run(`INSERT OR IGNORE INTO users (username, password, role, full_name, is_default, created_at)
            VALUES ('admin', ?, 'admin', 'Administrateur', 1, ?)`, [defaultPassword, now]);
    db.run(`INSERT OR IGNORE INTO company_config (id, name) VALUES (1, 'ORION POS')`);
});

// ─── Helper : lit un produit public et le broadcast ─────────
function broadcastProduct(event, productId) {
    db.get(
        `SELECT id, name, category, sale_price, quantity, min_stock, image, barcode
         FROM products WHERE id = ?`,
        [productId],
        (err, product) => {
            if (err || !product) return;
            broadcast(event, product);
        }
    );
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
//  catalog.html se connecte ici pour les mises à jour live
// ============================================================
app.get('/api/public/events', (req, res) => {
    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');  // Nginx : désactive le buffering
    res.flushHeaders();

    const id = sseNextId++;
    sseClients.set(id, res);

    // Confirme la connexion
    res.write('event: ping\ndata: {}\n\n');

    req.on('close', () => sseClients.delete(id));
});

// ============================================================
//  PUBLIC ROUTES (sans authentification)
// ============================================================

// Catalogue public — champs non-sensibles uniquement
app.get('/api/public/products', (req, res) => {
    db.all(
        `SELECT id, name, category, sale_price, quantity, min_stock, image, barcode
         FROM products ORDER BY name`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/api/public/categories', (req, res) => {
    db.all(
        `SELECT DISTINCT category FROM products
         WHERE category IS NOT NULL AND category != ''
         ORDER BY category`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json((rows || []).map(r => r.category));
        }
    );
});

// ============================================================
//  AUTH ROUTES
// ============================================================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ error: 'Identifiant et mot de passe requis' });

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err)  return res.status(500).json({ error: 'Erreur serveur' });
        if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });

        if (bcrypt.compareSync(password, user.password)) {
            req.session.user = {
                id: user.id, username: user.username,
                role: user.role, full_name: user.full_name
            };
            res.json({ success: true, user: req.session.user });
        } else {
            res.status(401).json({ error: 'Identifiants incorrects' });
        }
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/session', (req, res) => {
    if (req.session.user) return res.json({ user: req.session.user });
    res.status(401).json({ error: 'Non connecté' });
});

// ============================================================
//  USERS ROUTES
// ============================================================
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
    db.all(
        'SELECT id, username, role, full_name, created_at, is_default FROM users ORDER BY created_at DESC',
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
    const { username, password, role, full_name } = req.body;
    if (!username || !password)
        return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis" });

    const hash = bcrypt.hashSync(password, 10);
    const now  = getMadagascarDateTime();

    db.run(
        'INSERT INTO users (username, password, role, full_name, created_at) VALUES (?, ?, ?, ?, ?)',
        [username, hash, role || 'caissier', full_name, now],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE'))
                    return res.status(400).json({ error: "Ce nom d'utilisateur existe déjà" });
                return res.status(500).json({ error: err.message });
            }
            res.json({ id: this.lastID, success: true });
        }
    );
});

app.put('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
    const { username, password, role, full_name } = req.body;

    db.get('SELECT is_default FROM users WHERE id = ?', [req.params.id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (user && user.is_default === 1 && role !== 'admin')
            return res.status(403).json({ error: "Impossible de modifier le rôle de l'admin par défaut" });

        let query, params;
        if (password) {
            const hash = bcrypt.hashSync(password, 10);
            query  = 'UPDATE users SET username = ?, password = ?, role = ?, full_name = ? WHERE id = ?';
            params = [username, hash, role, full_name, req.params.id];
        } else {
            query  = 'UPDATE users SET username = ?, role = ?, full_name = ? WHERE id = ?';
            params = [username, role, full_name, req.params.id];
        }

        db.run(query, params, function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
    db.get('SELECT is_default FROM users WHERE id = ?', [req.params.id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (user && user.is_default === 1)
            return res.status(403).json({ error: "Impossible de supprimer l'admin par défaut" });

        db.run('DELETE FROM users WHERE id = ? AND is_default = 0', [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// ============================================================
//  PRODUCTS ROUTES
//  ⚡ broadcast() appelé après chaque modification
// ============================================================
app.get('/api/products', requireAuth, (req, res) => {
    const fields = req.session.user.role === 'admin'
        ? '*'
        : 'id, name, category, sale_price, quantity, min_stock, image, barcode';

    db.all(`SELECT ${fields} FROM products ORDER BY name`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/products/:id', requireAuth, (req, res) => {
    const fields = req.session.user.role === 'admin'
        ? '*'
        : 'id, name, category, sale_price, quantity, min_stock, image, barcode';

    db.get(`SELECT ${fields} FROM products WHERE id = ?`, [req.params.id], (err, row) => {
        if (err)  return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Produit non trouvé' });
        res.json(row);
    });
});

// ── POST /api/products — Création ───────────────────────────
app.post('/api/products', requireAuth, requireAdmin, upload.single('image'), (req, res) => {
    const { name, category, purchase_price, sale_price, quantity, min_stock, barcode } = req.body;

    if (!name || !sale_price)
        return res.status(400).json({ error: 'Nom et prix de vente requis' });

    const image = req.file ? '/uploads/' + req.file.filename : null;
    const now   = getMadagascarDateTime();

    db.run(
        `INSERT INTO products
            (name, category, purchase_price, sale_price, quantity, min_stock, image, barcode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, category || '', purchase_price || 0, sale_price,
         quantity || 0, min_stock || 5, image, barcode || '', now, now],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });

            const productId = this.lastID;

            // Mouvement stock initial
            if (quantity && parseInt(quantity) > 0) {
                db.run(
                    `INSERT INTO stock_movements
                        (product_id, product_name, movement_type, quantity, reason, user_id, created_at)
                     VALUES (?, ?, 'entry', ?, 'Stock initial', ?, ?)`,
                    [productId, name, parseInt(quantity), req.session.user.id, now]
                );
            }

            // ⚡ SSE — nouveau produit pour le catalog
            broadcastProduct('product:new', productId);

            res.json({ id: productId, success: true });
        }
    );
});

// ── PUT /api/products/:id — Modification ────────────────────
app.put('/api/products/:id', requireAuth, requireAdmin, upload.single('image'), (req, res) => {
    const { name, category, purchase_price, sale_price, quantity, min_stock, barcode } = req.body;
    const now = getMadagascarDateTime();

    db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, oldProduct) => {
        if (err)         return res.status(500).json({ error: err.message });
        if (!oldProduct) return res.status(404).json({ error: 'Produit non trouvé' });

        let image = oldProduct.image;
        if (req.file) image = '/uploads/' + req.file.filename;

        const newQty = parseInt(quantity) || 0;
        const oldQty = oldProduct.quantity || 0;

        db.run(
            `UPDATE products
             SET name = ?, category = ?, purchase_price = ?, sale_price = ?,
                 quantity = ?, min_stock = ?, image = ?, barcode = ?, updated_at = ?
             WHERE id = ?`,
            [name, category || '', purchase_price || 0, sale_price,
             newQty, min_stock || 5, image, barcode || '', now, req.params.id],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });

                // Mouvement stock si quantité changée
                if (newQty !== oldQty) {
                    const diff = newQty - oldQty;
                    const type = diff > 0 ? 'entry' : 'exit';
                    db.run(
                        `INSERT INTO stock_movements
                            (product_id, product_name, movement_type, quantity, reason, user_id, created_at)
                         VALUES (?, ?, ?, ?, 'Ajustement admin', ?, ?)`,
                        [req.params.id, name, type, Math.abs(diff), req.session.user.id, now]
                    );
                }

                // ⚡ SSE — mise à jour produit (stock, sary, anarana, vidiny)
                broadcastProduct('product:update', parseInt(req.params.id));

                res.json({ success: true });
            }
        );
    });
});

// ── DELETE /api/products/:id ─────────────────────────────────
app.delete('/api/products/:id', requireAuth, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);

    db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        // ⚡ SSE — produit supprimé
        broadcast('product:delete', { id });

        res.json({ success: true });
    });
});

// ── POST /api/products/:id/add-stock — Réapprovisionnement ──
app.post('/api/products/:id/add-stock', requireAuth, (req, res) => {
    const { quantity } = req.body;
    const now = getMadagascarDateTime();

    if (!quantity || parseInt(quantity) <= 0)
        return res.status(400).json({ error: 'Quantité invalide' });

    db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, product) => {
        if (err)      return res.status(500).json({ error: err.message });
        if (!product) return res.status(404).json({ error: 'Produit non trouvé' });

        const addQty    = parseInt(quantity);
        const newQty    = (product.quantity || 0) + addQty;

        db.run(
            'UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?',
            [newQty, now, req.params.id],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });

                db.run(
                    `INSERT INTO stock_movements
                        (product_id, product_name, movement_type, quantity, reason, user_id, created_at)
                     VALUES (?, ?, 'entry', ?, 'Réapprovisionnement', ?, ?)`,
                    [req.params.id, product.name, addQty, req.session.user.id, now]
                );

                // ⚡ SSE — stock mis à jour
                broadcastProduct('product:update', parseInt(req.params.id));

                res.json({ success: true, newQuantity: newQty });
            }
        );
    });
});

// ============================================================
//  CLIENTS ROUTES
// ============================================================
app.get('/api/clients', requireAuth, (req, res) => {
    db.all('SELECT * FROM clients ORDER BY name', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/clients/:id', requireAuth, (req, res) => {
    db.get('SELECT * FROM clients WHERE id = ?', [req.params.id], (err, client) => {
        if (err)     return res.status(500).json({ error: err.message });
        if (!client) return res.status(404).json({ error: 'Client non trouvé' });

        db.all(
            `SELECT s.*, GROUP_CONCAT(si.product_name || ' x' || si.quantity) as items
             FROM sales s
             LEFT JOIN sale_items si ON s.id = si.sale_id
             WHERE s.client_id = ?
             GROUP BY s.id ORDER BY s.created_at DESC`,
            [req.params.id],
            (err, sales) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ...client, sales: sales || [] });
            }
        );
    });
});

app.post('/api/clients', requireAuth, (req, res) => {
    const { name, phone, email, address } = req.body;
    if (!name) return res.status(400).json({ error: 'Le nom est requis' });

    const now = getMadagascarDateTime();
    db.run(
        'INSERT INTO clients (name, phone, email, address, created_at) VALUES (?, ?, ?, ?, ?)',
        [name, phone || '', email || '', address || '', now],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, success: true });
        }
    );
});

app.put('/api/clients/:id', requireAuth, (req, res) => {
    const { name, phone, email, address } = req.body;
    db.run(
        'UPDATE clients SET name = ?, phone = ?, email = ?, address = ? WHERE id = ?',
        [name, phone || '', email || '', address || '', req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.delete('/api/clients/:id', requireAuth, requireAdmin, (req, res) => {
    db.run('DELETE FROM clients WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ============================================================
//  SALES ROUTES
//  ⚡ broadcast() après chaque vente (stock baisse)
//     et après annulation (stock remonte)
// ============================================================
function generateInvoiceNumber() {
    const now = new Date();
    const mg  = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const y   = mg.getFullYear();
    const mo  = String(mg.getMonth() + 1).padStart(2, '0');
    const d   = String(mg.getDate()).padStart(2, '0');
    const h   = String(mg.getHours()).padStart(2, '0');
    const mi  = String(mg.getMinutes()).padStart(2, '0');
    const s   = String(mg.getSeconds()).padStart(2, '0');
    return `FAC-${y}${mo}${d}-${h}${mi}${s}`;
}

app.get('/api/sales', requireAuth, (req, res) => {
    const { period } = req.query;
    const today = getMadagascarDate();
    let filter = '';
    if (period === 'today') filter = `AND DATE(s.created_at) = '${today}'`;
    else if (period === 'week')  filter = `AND DATE(s.created_at) >= DATE('${today}', '-7 days')`;
    else if (period === 'month') filter = `AND DATE(s.created_at) >= DATE('${today}', '-30 days')`;

    db.all(
        `SELECT s.*, c.name as client_name, u.username as user_name, u.full_name as user_full_name
         FROM sales s
         LEFT JOIN clients c ON s.client_id = c.id
         LEFT JOIN users   u ON s.user_id   = u.id
         WHERE 1=1 ${filter}
         ORDER BY s.created_at DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/api/sales/:id', requireAuth, (req, res) => {
    db.get(
        `SELECT s.*, c.name as client_name, c.phone as client_phone,
                u.username as user_name, u.full_name as user_full_name
         FROM sales s
         LEFT JOIN clients c ON s.client_id = c.id
         LEFT JOIN users   u ON s.user_id   = u.id
         WHERE s.id = ?`,
        [req.params.id],
        (err, sale) => {
            if (err)   return res.status(500).json({ error: err.message });
            if (!sale) return res.status(404).json({ error: 'Vente non trouvée' });

            db.all('SELECT * FROM sale_items WHERE sale_id = ?', [req.params.id], (err, items) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ...sale, items: items || [] });
            });
        }
    );
});

app.post('/api/sales', requireAuth, (req, res) => {
    const { client_id, client_name, client_phone, items,
            subtotal, discount_type, discount_value, total, payment_method } = req.body;

    if (!items || items.length === 0)
        return res.status(400).json({ error: 'Le panier est vide' });

    const invoice_number = generateInvoiceNumber();
    const now            = getMadagascarDateTime();

    // Résout ou crée le client
    const processClient = (callback) => {
        if (client_id) {
            callback(client_id);
        } else if (client_name && client_name.trim()) {
            db.run(
                'INSERT INTO clients (name, phone, created_at) VALUES (?, ?, ?)',
                [client_name.trim(), client_phone || '', now],
                function(err) { callback(err ? null : this.lastID); }
            );
        } else {
            callback(null);
        }
    };

    processClient(finalClientId => {
        db.run(
            `INSERT INTO sales
                (invoice_number, client_id, user_id, subtotal, discount_type, discount_value, total, payment_method, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [invoice_number, finalClientId, req.session.user.id,
             subtotal, discount_type || 'percent', discount_value || 0,
             total, payment_method || 'cash', now],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });

                const saleId         = this.lastID;
                const affectedIds    = [];   // Produits dont le stock a changé

                items.forEach(item => {
                    db.run(
                        `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [saleId, item.id, item.name, item.quantity, item.price, item.quantity * item.price]
                    );
                    db.run(
                        'UPDATE products SET quantity = quantity - ?, updated_at = ? WHERE id = ?',
                        [item.quantity, now, item.id]
                    );
                    db.run(
                        `INSERT INTO stock_movements
                            (product_id, product_name, movement_type, quantity, reason, user_id, created_at)
                         VALUES (?, ?, 'exit', ?, ?, ?, ?)`,
                        [item.id, item.name, item.quantity, 'Vente ' + invoice_number, req.session.user.id, now]
                    );
                    affectedIds.push(item.id);
                });

                // ⚡ SSE — broadcast stock mis à jour pour chaque produit vendu
                // Léger délai pour laisser SQLite finaliser les UPDATE
                setTimeout(() => {
                    affectedIds.forEach(pid => broadcastProduct('product:update', pid));
                }, 120);

                res.json({ id: saleId, invoice_number, success: true });
            }
        );
    });
});

// Annulation vente — stock restauré + SSE
app.delete('/api/sales/:id', requireAuth, requireAdmin, (req, res) => {
    const now = getMadagascarDateTime();

    db.get('SELECT invoice_number FROM sales WHERE id = ?', [req.params.id], (err, sale) => {
        if (err)   return res.status(500).json({ error: err.message });
        if (!sale) return res.status(404).json({ error: 'Vente non trouvée' });

        db.all('SELECT * FROM sale_items WHERE sale_id = ?', [req.params.id], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });

            const affectedIds = [];

            items.forEach(item => {
                db.run(
                    'UPDATE products SET quantity = quantity + ?, updated_at = ? WHERE id = ?',
                    [item.quantity, now, item.product_id]
                );
                db.run(
                    `INSERT INTO stock_movements
                        (product_id, product_name, movement_type, quantity, reason, user_id, created_at)
                     VALUES (?, ?, 'entry', ?, ?, ?, ?)`,
                    [item.product_id, item.product_name, item.quantity,
                     'Annulation vente ' + sale.invoice_number, req.session.user.id, now]
                );
                affectedIds.push(item.product_id);
            });

            db.run('DELETE FROM sale_items WHERE sale_id = ?', [req.params.id]);
            db.run('DELETE FROM sales WHERE id = ?', [req.params.id], function(err) {
                if (err) return res.status(500).json({ error: err.message });

                // ⚡ SSE — stock restauré
                setTimeout(() => {
                    affectedIds.forEach(pid => broadcastProduct('product:update', pid));
                }, 120);

                res.json({ success: true });
            });
        });
    });
});

// ============================================================
//  STOCK MOVEMENTS ROUTES
//  ⚡ broadcast() après ajout/suppression manuel de mouvement
// ============================================================
app.get('/api/stock-movements', requireAuth, (req, res) => {
    const { period } = req.query;
    const today = getMadagascarDate();
    let filter = '';
    if (period === 'today') filter = `WHERE DATE(sm.created_at) = '${today}'`;
    else if (period === 'week')  filter = `WHERE DATE(sm.created_at) >= DATE('${today}', '-7 days')`;
    else if (period === 'month') filter = `WHERE DATE(sm.created_at) >= DATE('${today}', '-30 days')`;

    db.all(
        `SELECT sm.*, u.username as user_name, u.full_name as user_full_name
         FROM stock_movements sm
         LEFT JOIN users u ON sm.user_id = u.id
         ${filter}
         ORDER BY sm.created_at DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.post('/api/stock-movements', requireAuth, requireAdmin, (req, res) => {
    const { product_id, movement_type, quantity, reason } = req.body;
    const now = getMadagascarDateTime();

    if (!product_id || !movement_type || !quantity)
        return res.status(400).json({ error: 'Données manquantes' });

    db.get('SELECT * FROM products WHERE id = ?', [product_id], (err, product) => {
        if (err)      return res.status(500).json({ error: err.message });
        if (!product) return res.status(404).json({ error: 'Produit non trouvé' });

        const qty = parseInt(quantity);
        let newQty;
        if (movement_type === 'entry') {
            newQty = (product.quantity || 0) + qty;
        } else {
            newQty = (product.quantity || 0) - qty;
            if (newQty < 0) return res.status(400).json({ error: 'Stock insuffisant' });
        }

        db.run(
            'UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?',
            [newQty, now, product_id],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });

                db.run(
                    `INSERT INTO stock_movements
                        (product_id, product_name, movement_type, quantity, reason, user_id, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [product_id, product.name, movement_type, qty,
                     reason || 'Mouvement manuel', req.session.user.id, now],
                    function(err) {
                        if (err) return res.status(500).json({ error: err.message });

                        // ⚡ SSE
                        broadcastProduct('product:update', parseInt(product_id));

                        res.json({ id: this.lastID, success: true, newQuantity: newQty });
                    }
                );
            }
        );
    });
});

app.delete('/api/stock-movements/:id', requireAuth, requireAdmin, (req, res) => {
    const now = getMadagascarDateTime();

    db.get('SELECT * FROM stock_movements WHERE id = ?', [req.params.id], (err, movement) => {
        if (err)       return res.status(500).json({ error: err.message });
        if (!movement) return res.status(404).json({ error: 'Mouvement non trouvé' });

        db.get('SELECT * FROM products WHERE id = ?', [movement.product_id], (err, product) => {
            if (err) return res.status(500).json({ error: err.message });

            if (product) {
                const newQty = movement.movement_type === 'entry'
                    ? Math.max(0, (product.quantity || 0) - movement.quantity)
                    : (product.quantity || 0) + movement.quantity;

                db.run(
                    'UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?',
                    [newQty, now, movement.product_id]
                );
            }

            db.run('DELETE FROM stock_movements WHERE id = ?', [req.params.id], function(err) {
                if (err) return res.status(500).json({ error: err.message });

                // ⚡ SSE — stock restauré après suppression mouvement
                if (product) {
                    setTimeout(() => broadcastProduct('product:update', movement.product_id), 80);
                }

                res.json({ success: true });
            });
        });
    });
});

// ============================================================
//  DASHBOARD STATS
// ============================================================
app.get('/api/dashboard/stats', requireAuth, requireAdmin, (req, res) => {
    const stats = {};
    const today = getMadagascarDate();

    db.get(
        `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as revenue
         FROM sales WHERE DATE(created_at) = '${today}'`,
        [],
        (err, todayData) => {
            if (err) return res.status(500).json({ error: err.message });
            stats.todaySales   = todayData.count;
            stats.todayRevenue = todayData.revenue;

            db.get(
                `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as revenue
                 FROM sales WHERE DATE(created_at) >= DATE('${today}', '-30 days')`,
                [],
                (err, monthData) => {
                    if (err) return res.status(500).json({ error: err.message });
                    stats.monthSales   = monthData.count;
                    stats.monthRevenue = monthData.revenue;

                    db.get(
                        "SELECT COUNT(*) as count FROM products WHERE quantity <= min_stock AND (product_type IS NULL OR product_type != 'service')",
                        [],
                        (err, critical) => {
                            if (err) return res.status(500).json({ error: err.message });
                            stats.criticalStock = critical.count;

                            db.all(
                                `SELECT si.quantity, si.unit_price, p.purchase_price
                                 FROM sale_items si
                                 JOIN products p ON si.product_id = p.id
                                 JOIN sales    s ON si.sale_id    = s.id
                                 WHERE DATE(s.created_at) >= DATE('${today}', '-30 days')`,
                                [],
                                (err, saleItems) => {
                                    if (err) return res.status(500).json({ error: err.message });

                                    let profit = 0;
                                    (saleItems || []).forEach(i => {
                                        profit += (i.unit_price - (i.purchase_price || 0)) * i.quantity;
                                    });
                                    stats.monthProfit = profit;

                                    db.get(
                                        `SELECT COALESCE(SUM(amount), 0) as total
                                         FROM expenses
                                         WHERE status = 'validated'
                                           AND DATE(created_at) >= DATE('${today}', '-30 days')`,
                                        [],
                                        (err, expenses) => {
                                            if (err) return res.status(500).json({ error: err.message });
                                            stats.monthExpenses = expenses.total;
                                            stats.netProfit     = profit - expenses.total;
                                            res.json(stats);
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

app.get('/api/dashboard/chart', requireAuth, requireAdmin, (req, res) => {
    const { period } = req.query;
    const today = getMadagascarDate();
    const days  = period === 'week' ? 7 : 30;

    db.all(
        `SELECT DATE(created_at) as date, SUM(total) as revenue, COUNT(*) as sales
         FROM sales
         WHERE DATE(created_at) >= DATE('${today}', '-${days} days')
         GROUP BY DATE(created_at)
         ORDER BY date`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

app.get('/api/dashboard/top-products', requireAuth, (req, res) => {
    const today = getMadagascarDate();

    db.all(
        `SELECT si.product_name, SUM(si.quantity) as total_sold, SUM(si.total) as revenue
         FROM sale_items si
         JOIN sales s ON si.sale_id = s.id
         WHERE DATE(s.created_at) >= DATE('${today}', '-30 days')
         GROUP BY si.product_id
         ORDER BY total_sold DESC
         LIMIT 10`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

// ============================================================
//  INVENTORY STATS
// ============================================================
app.get('/api/inventory/stats', requireAuth, requireAdmin, (req, res) => {
    db.get(
        `SELECT
            COUNT(*)                                              as totalProducts,
            COALESCE(SUM(sale_price * quantity),    0)           as totalStockValue,
            COALESCE(SUM(purchase_price * quantity),0)           as totalPurchaseValue,
            COALESCE(SUM((sale_price - purchase_price) * quantity), 0) as totalPotentialProfit
         FROM products`,
        [],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(row);
        }
    );
});

// ============================================================
//  PROFITS ROUTES
// ============================================================
function buildProfitDateFilter(period, start_date, end_date, today, alias = 's') {
    if (start_date && end_date)
        return `WHERE DATE(${alias}.created_at) BETWEEN '${start_date}' AND '${end_date}'`;
    if (period === 'today')  return `WHERE DATE(${alias}.created_at) = '${today}'`;
    if (period === 'week')   return `WHERE DATE(${alias}.created_at) >= DATE('${today}', '-7 days')`;
    if (period === 'month')  return `WHERE DATE(${alias}.created_at) >= DATE('${today}', '-30 days')`;
    if (period === 'year')   return `WHERE DATE(${alias}.created_at) >= DATE('${today}', '-365 days')`;
    return ''; // 'all' = no filter
}

app.get('/api/profits/daily', requireAuth, requireAdmin, (req, res) => {
    const { period, start_date, end_date } = req.query;
    const today  = getMadagascarDate();
    const filter = buildProfitDateFilter(period || 'all', start_date, end_date, today);

    db.all(
        `SELECT DATE(s.created_at) as date, si.product_name, si.product_id,
                SUM(si.quantity) as total_quantity, SUM(si.total) as total_revenue,
                COALESCE(SUM(si.quantity * p.purchase_price), 0) as total_cost,
                SUM(si.total - (si.quantity * COALESCE(p.purchase_price, 0))) as total_profit
         FROM sale_items si
         JOIN sales    s ON si.sale_id    = s.id
         LEFT JOIN products p ON si.product_id = p.id
         ${filter}
         GROUP BY DATE(s.created_at), si.product_id, si.product_name
         ORDER BY date DESC, total_profit DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const grouped = {};
            rows.forEach(row => {
                if (!grouped[row.date]) {
                    grouped[row.date] = { date: row.date, products: [], totalRevenue: 0, totalCost: 0, totalProfit: 0 };
                }
                grouped[row.date].products.push(row);
                grouped[row.date].totalRevenue += row.total_revenue;
                grouped[row.date].totalCost    += row.total_cost;
                grouped[row.date].totalProfit  += row.total_profit;
            });
            res.json(Object.values(grouped));
        }
    );
});

app.get('/api/profits/summary', requireAuth, requireAdmin, (req, res) => {
    const { period, start_date, end_date } = req.query;
    const today = getMadagascarDate();
    let filter = '', groupBy = '';
    switch (period) {
        case 'today':
            filter  = `WHERE DATE(s.created_at) = '${today}'`;
            groupBy = `DATE(s.created_at)`; break;
        case 'week':
            filter  = `WHERE DATE(s.created_at) >= DATE('${today}', '-7 days')`;
            groupBy = `DATE(s.created_at)`; break;
        case 'month':
            filter  = `WHERE DATE(s.created_at) >= DATE('${today}', '-30 days')`;
            groupBy = `DATE(s.created_at)`; break;
        case 'year':
            filter  = `WHERE DATE(s.created_at) >= DATE('${today}', '-365 days')`;
            groupBy = `STRFTIME('%Y-%m', s.created_at)`; break;
        case 'custom':
            if (start_date && end_date) {
                filter  = `WHERE DATE(s.created_at) BETWEEN '${start_date}' AND '${end_date}'`;
            } else {
                filter = '';
            }
            groupBy = `DATE(s.created_at)`; break;
        case 'all':
        default:
            filter  = '';
            groupBy = `STRFTIME('%Y-%m', s.created_at)`;
    }

    db.all(
        `SELECT ${groupBy} as period, SUM(si.total) as total_revenue,
                COALESCE(SUM(si.quantity * p.purchase_price), 0) as total_cost,
                SUM(si.total - (si.quantity * COALESCE(p.purchase_price, 0))) as total_profit,
                COUNT(DISTINCT s.id) as total_sales
         FROM sale_items si
         JOIN sales    s ON si.sale_id    = s.id
         LEFT JOIN products p ON si.product_id = p.id
         ${filter}
         GROUP BY ${groupBy}
         ORDER BY period DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/api/profits/top-products', requireAuth, requireAdmin, (req, res) => {
    const { period } = req.query;
    const today  = getMadagascarDate();
    const filter = buildProfitDateFilter(period, null, null, today);

    db.all(
        `SELECT si.product_id, si.product_name, SUM(si.quantity) as total_quantity,
                SUM(si.total) as total_revenue,
                COALESCE(SUM(si.quantity * p.purchase_price), 0) as total_cost,
                SUM(si.total - (si.quantity * COALESCE(p.purchase_price, 0))) as total_profit,
                ROUND((SUM(si.total - (si.quantity * COALESCE(p.purchase_price, 0))) / SUM(si.total)) * 100, 2) as profit_margin
         FROM sale_items si
         JOIN sales    s ON si.sale_id    = s.id
         LEFT JOIN products p ON si.product_id = p.id
         ${filter}
         GROUP BY si.product_id, si.product_name
         ORDER BY total_profit DESC
         LIMIT 20`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/api/profits/pdf-data', requireAuth, requireAdmin, (req, res) => {
    const { period, start_date, end_date } = req.query;
    const today  = getMadagascarDate();
    const filter = buildProfitDateFilter(period, start_date, end_date, today);

    db.all(
        `SELECT DATE(s.created_at) as date, si.product_name, SUM(si.quantity) as quantity,
                SUM(si.total) as revenue,
                COALESCE(SUM(si.quantity * p.purchase_price), 0) as cost,
                SUM(si.total - (si.quantity * COALESCE(p.purchase_price, 0))) as profit
         FROM sale_items si
         JOIN sales    s ON si.sale_id    = s.id
         LEFT JOIN products p ON si.product_id = p.id
         ${filter}
         GROUP BY DATE(s.created_at), si.product_id, si.product_name
         ORDER BY date DESC, profit DESC`,
        [],
        (err, dailyData) => {
            if (err) return res.status(500).json({ error: err.message });

            db.all(
                `SELECT si.product_name, SUM(si.quantity) as total_quantity, SUM(si.total) as total_revenue,
                        COALESCE(SUM(si.quantity * p.purchase_price), 0) as total_cost,
                        SUM(si.total - (si.quantity * COALESCE(p.purchase_price, 0))) as total_profit,
                        ROUND((SUM(si.total - (si.quantity * COALESCE(p.purchase_price, 0))) / SUM(si.total)) * 100, 2) as profit_margin
                 FROM sale_items si
                 JOIN sales    s ON si.sale_id    = s.id
                 LEFT JOIN products p ON si.product_id = p.id
                 ${filter}
                 GROUP BY si.product_id, si.product_name
                 ORDER BY total_profit DESC
                 LIMIT 10`,
                [],
                (err, topProducts) => {
                    if (err) return res.status(500).json({ error: err.message });
                    let totalRevenue = 0, totalCost = 0, totalProfit = 0;
                    dailyData.forEach(i => {
                        totalRevenue += i.revenue || 0;
                        totalCost    += i.cost    || 0;
                        totalProfit  += i.profit  || 0;
                    });
                    res.json({
                        period,
                        date_range: { start: start_date || today, end: end_date || today },
                        summary: {
                            total_revenue: totalRevenue, total_cost: totalCost,
                            total_profit: totalProfit, total_sales: dailyData.length,
                            avg_margin: totalRevenue > 0
                                ? (totalProfit / totalRevenue * 100).toFixed(2) : 0
                        },
                        daily_profits: dailyData,
                        top_products:  topProducts,
                        generated_at:  getMadagascarDateTime()
                    });
                }
            );
        }
    );
});

app.get('/api/profits/pdf-full-data', requireAuth, requireAdmin, (req, res) => {
    const { period, start_date, end_date } = req.query;
    const today  = getMadagascarDate();
    const filter = buildProfitDateFilter(period, start_date, end_date, today);

    db.all(
        `SELECT DATE(s.created_at) as date, SUM(si.total) as total_revenue,
                COALESCE(SUM(si.quantity * p.purchase_price), 0) as total_cost,
                SUM(si.total - (si.quantity * COALESCE(p.purchase_price, 0))) as total_profit
         FROM sale_items si
         JOIN sales    s ON si.sale_id    = s.id
         LEFT JOIN products p ON si.product_id = p.id
         ${filter}
         GROUP BY DATE(s.created_at)
         ORDER BY date DESC`,
        [],
        (err, dailySummary) => {
            if (err) return res.status(500).json({ error: err.message });

            db.all(
                `SELECT DATE(s.created_at) as date, si.product_id, si.product_name,
                        SUM(si.quantity) as quantity, SUM(si.total) as revenue,
                        COALESCE(SUM(si.quantity * p.purchase_price), 0) as cost,
                        SUM(si.total - (si.quantity * COALESCE(p.purchase_price, 0))) as profit
                 FROM sale_items si
                 JOIN sales    s ON si.sale_id    = s.id
                 LEFT JOIN products p ON si.product_id = p.id
                 ${filter}
                 GROUP BY DATE(s.created_at), si.product_id, si.product_name
                 ORDER BY date DESC, profit DESC`,
                [],
                (err, productsByDay) => {
                    if (err) return res.status(500).json({ error: err.message });

                    db.all(
                        `SELECT si.product_id, si.product_name, SUM(si.quantity) as total_quantity,
                                SUM(si.total) as total_revenue,
                                COALESCE(SUM(si.quantity * p.purchase_price), 0) as total_cost,
                                SUM(si.total - (si.quantity * COALESCE(p.purchase_price, 0))) as total_profit,
                                ROUND((SUM(si.total - (si.quantity * COALESCE(p.purchase_price, 0))) / SUM(si.total)) * 100, 2) as profit_margin
                         FROM sale_items si
                         JOIN sales    s ON si.sale_id    = s.id
                         LEFT JOIN products p ON si.product_id = p.id
                         ${filter}
                         GROUP BY si.product_id, si.product_name
                         ORDER BY total_profit DESC
                         LIMIT 10`,
                        [],
                        (err, topProducts) => {
                            if (err) return res.status(500).json({ error: err.message });

                            const grouped = {};
                            dailySummary.forEach(day => {
                                grouped[day.date] = { date: day.date, totalRevenue: day.total_revenue, totalCost: day.total_cost, totalProfit: day.total_profit, products: [] };
                            });
                            productsByDay.forEach(p => {
                                if (grouped[p.date]) grouped[p.date].products.push(p);
                            });
                            const finalData = Object.values(grouped);
                            const totals = {
                                totalRevenue: finalData.reduce((s, d) => s + d.totalRevenue, 0),
                                totalCost:    finalData.reduce((s, d) => s + d.totalCost,    0),
                                totalProfit:  finalData.reduce((s, d) => s + d.totalProfit,  0)
                            };
                            totals.avgMargin = totals.totalRevenue > 0
                                ? (totals.totalProfit / totals.totalRevenue * 100).toFixed(2) : 0;

                            res.json({
                                period,
                                date_range:   { start: start_date || today, end: end_date || today },
                                summary:      totals,
                                daily_profits: finalData,
                                top_products:  topProducts,
                                generated_at:  getMadagascarDateTime()
                            });
                        }
                    );
                }
            );
        }
    );
});

app.get('/api/products/:id/profit-details', requireAuth, requireAdmin, (req, res) => {
    const today = getMadagascarDate();

    db.all(
        `SELECT DATE(s.created_at) as date,
                SUM(si.quantity) as quantity, SUM(si.total) as revenue,
                COALESCE(SUM(si.quantity * p.purchase_price), 0) as cost,
                SUM(si.total - (si.quantity * COALESCE(p.purchase_price, 0))) as profit
         FROM sale_items si
         JOIN sales    s ON si.sale_id    = s.id
         LEFT JOIN products p ON si.product_id = p.id
         WHERE si.product_id = ?
           AND DATE(s.created_at) >= DATE('${today}', '-30 days')
         GROUP BY DATE(s.created_at)
         ORDER BY date DESC`,
        [req.params.id],
        (err, history) => {
            if (err) return res.status(500).json({ error: err.message });
            const totalRevenue  = history.reduce((s, i) => s + i.revenue,  0);
            const totalCost     = history.reduce((s, i) => s + i.cost,     0);
            const totalProfit   = history.reduce((s, i) => s + i.profit,   0);
            const totalQuantity = history.reduce((s, i) => s + i.quantity, 0);
            res.json({
                total_revenue: totalRevenue, total_cost: totalCost,
                total_profit: totalProfit,   total_quantity: totalQuantity,
                avg_margin: totalRevenue > 0 ? totalProfit / totalRevenue * 100 : 0,
                history
            });
        }
    );
});

// ============================================================
//  TREASURY / EXPENSES
// ============================================================
app.get('/api/expenses', requireAuth, requireAdmin, (req, res) => {
    db.all('SELECT * FROM expenses ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/expenses', requireAuth, requireAdmin, (req, res) => {
    const { description, amount, type, category, status } = req.body;
    if (!description || !amount)
        return res.status(400).json({ error: 'Description et montant requis' });

    const now = getMadagascarDateTime();
    db.run(
        'INSERT INTO expenses (description, amount, type, category, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [description, amount, type || 'realized', category || '', status || 'pending', now],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, success: true });
        }
    );
});

app.put('/api/expenses/:id', requireAuth, requireAdmin, (req, res) => {
    const { description, amount, type, category, status } = req.body;
    db.run(
        'UPDATE expenses SET description = ?, amount = ?, type = ?, category = ?, status = ? WHERE id = ?',
        [description, amount, type, category, status, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.delete('/api/expenses/:id', requireAuth, requireAdmin, (req, res) => {
    db.run('DELETE FROM expenses WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ============================================================
//  FINANCIAL GOALS
// ============================================================
app.get('/api/financial-goals', requireAuth, requireAdmin, (req, res) => {
    db.all('SELECT * FROM financial_goals ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/financial-goals', requireAuth, requireAdmin, (req, res) => {
    const { name, target_amount, deadline } = req.body;
    if (!name || !target_amount)
        return res.status(400).json({ error: 'Nom et montant cible requis' });

    const now = getMadagascarDateTime();
    db.run(
        'INSERT INTO financial_goals (name, target_amount, deadline, created_at) VALUES (?, ?, ?, ?)',
        [name, target_amount, deadline || '', now],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, success: true });
        }
    );
});

app.put('/api/financial-goals/:id', requireAuth, requireAdmin, (req, res) => {
    const { name, target_amount, current_amount, deadline, status } = req.body;
    db.run(
        'UPDATE financial_goals SET name = ?, target_amount = ?, current_amount = ?, deadline = ?, status = ? WHERE id = ?',
        [name, target_amount, current_amount || 0, deadline, status || 'active', req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.delete('/api/financial-goals/:id', requireAuth, requireAdmin, (req, res) => {
    db.run('DELETE FROM financial_goals WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ============================================================
//  COMPANY CONFIG
// ============================================================
app.get('/api/config', requireAuth, (req, res) => {
    db.get('SELECT * FROM company_config WHERE id = 1', [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

app.put('/api/config', requireAuth, requireAdmin, upload.single('logo'), (req, res) => {
    const { name, address, phone, email, website, invoice_header, invoice_footer, currency, tax_rate } = req.body;

    db.get('SELECT logo FROM company_config WHERE id = 1', [], (err, current) => {
        let logo = current ? current.logo : null;
        if (req.file) logo = '/uploads/' + req.file.filename;

        db.run(
            `UPDATE company_config
             SET name = ?, logo = ?, address = ?, phone = ?, email = ?,
                 website = ?, invoice_header = ?, invoice_footer = ?, currency = ?, tax_rate = ?
             WHERE id = 1`,
            [name || 'ORION POS', logo, address || '', phone || '', email || '',
             website || '', invoice_header || '', invoice_footer || 'Misaotra tompoko!',
             currency || 'Ar', tax_rate || 0],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });
});

// ============================================================
//  CATEGORIES
// ============================================================
app.get('/api/categories', requireAuth, (req, res) => {
    db.all(
        `SELECT DISTINCT category FROM products
         WHERE category IS NOT NULL AND category != ''
         ORDER BY category`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json((rows || []).map(r => r.category));
        }
    );
});

// ============================================================
//  EXPORTS CSV
// ============================================================
app.get('/api/export/clients', requireAuth, (req, res) => {
    db.all('SELECT name, phone, email, address FROM clients ORDER BY name', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        let csv = '\ufeffNom,Téléphone,Email,Adresse\n';
        (rows || []).forEach(r => {
            csv += `"${r.name || ''}","${r.phone || ''}","${r.email || ''}","${r.address || ''}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=clients.csv');
        res.send(csv);
    });
});

app.get('/api/export/sales', requireAuth, (req, res) => {
    const { period } = req.query;
    const today = getMadagascarDate();
    let filter = '';
    if (period === 'today') filter = `WHERE DATE(s.created_at) = '${today}'`;
    else if (period === 'week')  filter = `WHERE DATE(s.created_at) >= DATE('${today}', '-7 days')`;
    else if (period === 'month') filter = `WHERE DATE(s.created_at) >= DATE('${today}', '-30 days')`;

    db.all(
        `SELECT s.invoice_number, s.created_at, c.name as client,
                s.subtotal, s.discount_value, s.total, u.full_name as vendeur
         FROM sales s
         LEFT JOIN clients c ON s.client_id = c.id
         LEFT JOIN users   u ON s.user_id   = u.id
         ${filter}
         ORDER BY s.created_at DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            let csv = '\ufeffNuméro Facture,Date,Client,Sous-total,Remise,Total,Vendeur\n';
            (rows || []).forEach(r => {
                csv += `"${r.invoice_number}","${r.created_at}","${r.client || 'Anonyme'}","${r.subtotal}","${r.discount_value}","${r.total}","${r.vendeur || ''}"\n`;
            });
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=ventes_${period || 'all'}.csv`);
            res.send(csv);
        }
    );
});

app.get('/api/export/stock-movements', requireAuth, (req, res) => {
    const { period } = req.query;
    const today = getMadagascarDate();
    let filter = '';
    if (period === 'today') filter = `WHERE DATE(sm.created_at) = '${today}'`;
    else if (period === 'month') filter = `WHERE DATE(sm.created_at) >= DATE('${today}', '-30 days')`;

    db.all(
        `SELECT sm.created_at, sm.product_name, sm.movement_type, sm.quantity, sm.reason, u.full_name as utilisateur
         FROM stock_movements sm
         LEFT JOIN users u ON sm.user_id = u.id
         ${filter}
         ORDER BY sm.created_at DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            let csv = '\ufeffDate,Produit,Type,Quantité,Raison,Utilisateur\n';
            (rows || []).forEach(r => {
                csv += `"${r.created_at}","${r.product_name}","${r.movement_type === 'entry' ? 'Entrée' : 'Sortie'}","${r.quantity}","${r.reason || ''}","${r.utilisateur || ''}"\n`;
            });
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=mouvements_stock_${period || 'all'}.csv`);
            res.send(csv);
        }
    );
});

app.get('/api/export/profits-products', requireAuth, requireAdmin, (req, res) => {
    const { period, start_date, end_date } = req.query;
    const today  = getMadagascarDate();
    const filter = buildProfitDateFilter(period, start_date, end_date, today);

    db.all(
        `SELECT si.product_name, SUM(si.quantity) as quantity, SUM(si.total) as revenue,
                COALESCE(SUM(si.quantity * p.purchase_price), 0) as cost,
                SUM(si.total - (si.quantity * COALESCE(p.purchase_price, 0))) as profit,
                ROUND((SUM(si.total - (si.quantity * COALESCE(p.purchase_price, 0))) / SUM(si.total)) * 100, 2) as margin,
                COUNT(DISTINCT DATE(s.created_at)) as days_sold
         FROM sale_items si
         JOIN sales    s ON si.sale_id    = s.id
         LEFT JOIN products p ON si.product_id = p.id
         ${filter}
         GROUP BY si.product_id, si.product_name
         ORDER BY profit DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            let csv = '\ufeffProduit,Quantité,Jours de vente,Revenus,Coûts,Profit,Marge(%)\n';
            (rows || []).forEach(r => {
                csv += `"${r.product_name}","${r.quantity}","${r.days_sold}","${r.revenue}","${r.cost}","${r.profit}","${r.margin}"\n`;
            });
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="profits_par_produit_${getMadagascarDate().replace(/-/g, '')}.csv"`);
            res.send(csv);
        }
    );
});

// ============================================================
//  START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log('');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('   ████████╗███████╗ ██████╗██╗  ██╗███████╗██╗      ██████╗  ██╗    ██╗');
    console.log('      ██╔══╝██╔════╝██╔════╝██║  ██║██╔════╝██║     ██╔═══██╗ ██║    ██║');
    console.log('      ██║   █████╗  ██║     ███████║█████╗  ██║     ██║   ██║ ██║ █╗ ██║');
    console.log('      ██║   ██╔══╝  ██║     ██╔══██║██╔══╝  ██║     ██║   ██║ ██║███╗██║');
    console.log('      ██║   ███████╗╚██████╗██║  ██║██║     ███████╗╚██████╔╝ ╚███╔███╔╝');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`   ✅  Serveur démarré sur http://localhost:${PORT}`);
    console.log(`   🌍  Timezone : Madagascar (UTC+3)`);
    console.log(`   🕐  Date/Heure : ${getMadagascarDateTime()}`);
    console.log(`   📡  SSE endpoint : /api/public/events`);
    console.log('');
});