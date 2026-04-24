// ============ TECHFLOW POS - APPLICATION PRINCIPALE ============

// Configuration API
const API = {
    baseUrl: '',
    
    async request(endpoint, options = {}) {
        const config = {
            headers: { 'Content-Type': 'application/json' },
            ...options
        };
        
        try {
            const response = await fetch(this.baseUrl + endpoint, config);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Erreur serveur');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },
    
    get(endpoint) { return this.request(endpoint); },
    
    post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    
    put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },
    
    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    },
    
    async upload(endpoint, formData) {
        const response = await fetch(this.baseUrl + endpoint, {
            method: 'POST',
            body: formData
        });
        return response.json();
    },
    
    async uploadPut(endpoint, formData) {
        const response = await fetch(this.baseUrl + endpoint, {
            method: 'PUT',
            body: formData
        });
        return response.json();
    }
};

// ============ UTILITIES ============
const Utils = {
    // Format currency in Ariary
    formatCurrency(amount, currency = 'Ar') {
        if (amount === null || amount === undefined) amount = 0;
        // Use space as thousand separator (e.g. 1 250 000 Ar)
        const n = Math.round(amount);
        const formatted = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
        return formatted + ' ' + currency;
    },
    
    // Format date - SANS conversion timezone
    formatDate(dateString) {
        if (!dateString) return '-';
        
        // Si c'est déjà au format "YYYY-MM-DD HH:MM:SS"
        if (typeof dateString === 'string' && dateString.includes('-')) {
            const parts = dateString.split(' ')[0].split('-');
            if (parts.length === 3) {
                return `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
        }
        
        // Fallback
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        
        return `${day}/${month}/${year}`;
    },
    
    // Format date and time - SANS conversion timezone
    formatDateTime(dateString) {
        if (!dateString) return '-';
        
        // Si c'est au format "YYYY-MM-DD HH:MM:SS"
        if (typeof dateString === 'string' && dateString.includes('-')) {
            const parts = dateString.split(' ');
            const dateParts = parts[0].split('-');
            const timeParts = parts[1] ? parts[1].split(':') : ['00', '00'];
            
            if (dateParts.length === 3) {
                return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]} ${timeParts[0]}:${timeParts[1]}`;
            }
        }
        
        // Fallback
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    },
    
    // Get current date/time for display
    getCurrentDateTime() {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    },
    
    getInitials(name) {
        if (!name) return '??';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    },
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    escapeQuotes(text) {
        if (!text) return '';
        return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }
};

// ============ TOAST NOTIFICATIONS ============
const Toast = {
    container: null,
    
    init() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        this.container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;';
        document.body.appendChild(this.container);
    },
    
    show(message, type = 'success', duration = 3000) {
        if (!this.container) this.init();
        
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle'
        };
        
        const colors = {
            success: '#22c55e',
            error: '#ef4444',
            warning: '#f59e0b'
        };
        
        const toast = document.createElement('div');
        toast.style.cssText = `
            background: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.15);
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 12px;
            animation: slideIn 0.3s ease;
            border-left: 4px solid ${colors[type]};
            min-width: 280px;
        `;
        toast.innerHTML = `
            <i class="${icons[type]}" style="font-size:20px;color:${colors[type]}"></i>
            <span style="font-size:14px;color:#374151;">${message}</span>
        `;
        
        this.container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },
    
    success(message) { this.show(message, 'success'); },
    error(message) { this.show(message, 'error'); },
    warning(message) { this.show(message, 'warning'); }
};

// Add animation styles
const animStyles = document.createElement('style');
animStyles.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(animStyles);

// ============ MODAL MANAGER ============
const Modal = {
    show(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    },
    
    hide(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    },
    
    hideAll() {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
    }
};

// ============ AUTH MANAGER ============
const Auth = {
    user: null,
    
    async checkSession() {
        try {
            const data = await API.get('/api/session');
            this.user = data.user;
            return true;
        } catch {
            return false;
        }
    },
    
    async login(username, password) {
        const data = await API.post('/api/login', { username, password });
        this.user = data.user;
        return data;
    },
    
    async logout() {
        await API.post('/api/logout');
        this.user = null;
        window.location.href = '/login.html';
    },
    
    isAdmin() {
        return this.user && this.user.role === 'admin';
    },
    
    getUser() {
        return this.user;
    }
};

// ============ PDF INVOICE GENERATOR ============
const InvoicePDF = {
    async generate(sale, config, download = true) {
        // Create invoice HTML
        const invoiceHTML = this.createInvoiceHTML(sale, config);
        
        // Create a hidden iframe for printing/PDF
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;left:-9999px;width:80mm;height:auto;';
        document.body.appendChild(iframe);
        
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(invoiceHTML);
        doc.close();
        
        // Wait for content to load
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (download) {
            // Trigger print dialog (user can save as PDF)
            iframe.contentWindow.print();
            
            // Save to print history
            this.saveToPrintHistory(sale.id);
        }
        
        // Remove iframe after delay
        setTimeout(() => iframe.remove(), 2000);
        
        return invoiceHTML;
    },
    
    createInvoiceHTML(sale, config) {
        const items = sale.items || [];
        
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Facture ${sale.invoice_number}</title>
    <style>
        @page {
            size: 80mm auto;
            margin: 0;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Courier New', 'Lucida Console', monospace;
            font-size: 12px;
            line-height: 1.4;
            width: 80mm;
            padding: 8mm 5mm;
            background: white;
            color: #000;
        }
        
        .invoice-header {
            text-align: center;
            padding-bottom: 8px;
            border-bottom: 2px dashed #000;
            margin-bottom: 8px;
        }
        
        .invoice-header img {
            max-width: 45mm;
            max-height: 18mm;
            margin-bottom: 5px;
        }
        
        .company-name {
            font-size: 18px;
            font-weight: bold;
            margin: 5px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .company-info {
            font-size: 11px;
            color: #333;
            margin: 2px 0;
        }
        
        .invoice-title {
            text-align: center;
            font-size: 14px;
            font-weight: bold;
            margin: 10px 0;
            padding: 5px;
            background: #000;
            color: #fff;
            letter-spacing: 2px;
        }
        
        .invoice-info {
            margin-bottom: 10px;
            font-size: 11px;
        }
        
        .invoice-info p {
            margin: 3px 0;
        }
        
        .invoice-info strong {
            display: inline-block;
            width: 70px;
        }
        
        .items-header {
            display: flex;
            justify-content: space-between;
            font-weight: bold;
            font-size: 11px;
            padding: 5px 0;
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            margin-bottom: 5px;
        }
        
        .items-list {
            margin-bottom: 10px;
        }
        
        .item {
            padding: 4px 0;
            border-bottom: 1px dotted #ccc;
        }
        
        .item-name {
            font-size: 11px;
            font-weight: 500;
        }
        
        .item-details {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #555;
            margin-top: 2px;
        }
        
        .totals {
            border-top: 2px dashed #000;
            padding-top: 8px;
            margin-top: 8px;
        }
        
        .total-row {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            margin: 4px 0;
        }
        
        .total-row.grand-total {
            font-size: 16px;
            font-weight: bold;
            border-top: 2px solid #000;
            border-bottom: 2px solid #000;
            padding: 8px 0;
            margin-top: 8px;
        }
        
        .payment-info {
            text-align: center;
            margin: 12px 0;
            padding: 8px;
            background: #f5f5f5;
            border-radius: 4px;
            font-size: 11px;
        }
        
        .invoice-footer {
            text-align: center;
            margin-top: 15px;
            padding-top: 10px;
            border-top: 2px dashed #000;
            font-size: 11px;
        }
        
        .footer-message {
            font-weight: bold;
            margin-bottom: 5px;
        }
        
        .footer-note {
            font-size: 10px;
            color: #666;
            margin-top: 8px;
        }
        
        .barcode {
            text-align: center;
            margin-top: 10px;
            font-family: 'Libre Barcode 39', cursive;
            font-size: 28px;
        }
        
        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="invoice-header">
        ${config.logo ? `<img src="${config.logo}" alt="Logo">` : ''}
        <div class="company-name">${config.name || 'ORION POS'}</div>
        ${config.address ? `<div class="company-info">${config.address}</div>` : ''}
        ${config.phone ? `<div class="company-info">Tél: ${config.phone}</div>` : ''}
        ${config.email ? `<div class="company-info">${config.email}</div>` : ''}
        ${config.invoice_header ? `<div class="company-info">${config.invoice_header}</div>` : ''}
    </div>
    
    <div class="invoice-title">FACTURE</div>
    
    <div class="invoice-info">
        <p><strong>N°:</strong> ${sale.invoice_number}</p>
        <p><strong>Date:</strong> ${Utils.formatDateTime(sale.created_at)}</p>
        <p><strong>Client:</strong> ${sale.client_name || 'Client comptoir'}</p>
        ${sale.client_phone ? `<p><strong>Tél:</strong> ${sale.client_phone}</p>` : ''}
        <p><strong>Vendeur:</strong> ${sale.user_name || 'N/A'}</p>
    </div>
    
    <div class="items-header">
        <span>Article</span>
        <span>Total</span>
    </div>
    
    <div class="items-list">
        ${items.map(item => `
            <div class="item">
                <div class="item-name">${item.product_name}</div>
                <div class="item-details">
                    <span>${item.quantity} x ${Utils.formatCurrency(item.unit_price)}</span>
                    <span><strong>${Utils.formatCurrency(item.total)}</strong></span>
                </div>
            </div>
        `).join('')}
    </div>
    
    <div class="totals">
        <div class="total-row">
            <span>Sous-total:</span>
            <span>${Utils.formatCurrency(sale.subtotal)}</span>
        </div>
        ${sale.discount_value > 0 ? `
        <div class="total-row">
            <span>Remise:</span>
            <span>- ${Utils.formatCurrency(sale.discount_value)}</span>
        </div>
        ` : ''}
        <div class="total-row grand-total">
            <span>TOTAL À PAYER:</span>
            <span>${Utils.formatCurrency(sale.total)}</span>
        </div>
    </div>
    
    <div class="payment-info">
        Mode de paiement: ${this.getPaymentMethodLabel(sale.payment_method)}
    </div>
    
    <div class="invoice-footer">
        <div class="footer-message">${config.invoice_footer || 'Merci pour votre achat !'}</div>
        <div class="footer-note">
            Conservez ce reçu pour tout reclamation ou retour.<br>
        </div>
    </div>
</body>
</html>
        `;
    },

        getPaymentMethodLabel(method) {
        const labels = {
            'cash': 'ESPÈCES',
            'mvola': 'MVOLA',
            'airtel_money': 'AIRTEL MONEY',
            'orange_money': 'ORANGE MONEY'
        };
        return labels[method] || method.toUpperCase();
        },
        
    saveToPrintHistory(saleId) {
        let history = JSON.parse(localStorage.getItem('printHistory') || '[]');
        history.unshift({
            saleId,
            printedAt: new Date().toISOString(),
            printedBy: Auth.getUser()?.username
        });
        // Keep only last 100 entries
        history = history.slice(0, 100);
        localStorage.setItem('printHistory', JSON.stringify(history));
    },
    
    getPrintHistory() {
        return JSON.parse(localStorage.getItem('printHistory') || '[]');
    }
};

// ============ POS CART ============
const Cart = {
    items: [],
    discountType: 'percent',
    discountValue: 0,
    
    add(product) {
        const isSvc = product.product_type === 'service';
        const existing = this.items.find(item => item.id === product.id);

        if (existing) {
            if (isSvc || existing.quantity < product.quantity) {
                existing.quantity++;
            } else {
                Toast.warning('Stock insuffisant');
                return;
            }
        } else {
            if (isSvc || product.quantity > 0) {
                this.items.push({
                    id:           product.id,
                    name:         product.name,
                    price:        product.sale_price,
                    quantity:     1,
                    maxStock:     isSvc ? 999999 : product.quantity,
                    image:        product.image,
                    product_type: product.product_type || 'product'
                });
            } else {
                Toast.warning('Produit en rupture de stock');
                return;
            }
        }

        this.render();
        Toast.success(isSvc ? `${product.name} ajouté` : 'Produit ajouté');
    },
    
    updateQuantity(productId, change) {
        const item = this.items.find(i => i.id === productId);
        if (item) {
            const isSvc = item.product_type === 'service';
            const newQty = item.quantity + change;
            if (newQty <= 0) {
                this.remove(productId);
                return;
            } else if (isSvc || newQty <= item.maxStock) {
                item.quantity = newQty;
            } else {
                Toast.warning('Stock insuffisant');
            }
        }
        this.render();
    },
    
    remove(productId) {
        this.items = this.items.filter(i => i.id !== productId);
        this.render();
    },
    
    clear() {
        this.items = [];
        this.discountValue = 0;
        this.render();
    },
    
    getSubtotal() {
        return this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    },
    
    getDiscount() {
        const subtotal = this.getSubtotal();
        if (this.discountType === 'percent') {
            return subtotal * (this.discountValue / 100);
        }
        return Math.min(this.discountValue, subtotal);
    },
    
    getTotal() {
        return this.getSubtotal() - this.getDiscount();
    },
    
    setDiscount(type, value) {
        this.discountType = type;
        this.discountValue = parseFloat(value) || 0;
        this.render();
    },
    
    render() {
        const cartItems = document.getElementById('cartItems');
        const cartSummary = document.getElementById('cartSummary');
        
        if (!cartItems) return;
        
        if (this.items.length === 0) {
            cartItems.innerHTML = `
                <div class="pos-cart-empty">
                    <i class="fas fa-shopping-cart"></i>
                    <p>Panier vide</p>
                    <small>Cliquez sur un produit pour l'ajouter</small>
                </div>
            `;
        } else {
            cartItems.innerHTML = this.items.map(item => {
                const isSvc = item.product_type === 'service';
                const iconClass = isSvc ? 'fa-concierge-bell' : 'fa-box';
                const svcBadge = isSvc ? '<span style="font-size:9px;background:rgba(168,85,247,0.2);color:#c084fc;padding:1px 5px;border-radius:4px;margin-left:4px;font-weight:700;">SVC</span>' : '';
                const borderStyle = isSvc ? 'border-left:2px solid rgba(168,85,247,0.5);' : '';
                return `
                <div class="pos-cart-item" style="${borderStyle}">
                    <div class="pos-cart-item-image" style="${isSvc ? 'background:rgba(124,58,237,0.1);' : ''}">
                        ${item.image ? `<img src="${item.image}" alt="">` : `<i class="fas ${iconClass}" style="${isSvc ? 'color:#a78bfa;' : ''}"></i>`}
                    </div>
                    <div class="pos-cart-item-info">
                        <div class="pos-cart-item-name">${item.name}${svcBadge}</div>
                        <div class="pos-cart-item-price">${Utils.formatCurrency(item.price)}</div>
                    </div>
                    <div class="pos-cart-item-qty">
                        <button onclick="Cart.updateQuantity(${item.id}, -1)"><i class="fas fa-minus"></i></button>
                        <span>${item.quantity}</span>
                        <button onclick="Cart.updateQuantity(${item.id}, 1)"><i class="fas fa-plus"></i></button>
                    </div>
                    <div class="pos-cart-item-total" style="font-weight:700;">${Utils.formatCurrency(item.price * item.quantity)}</div>
                    <div class="pos-cart-item-remove" onclick="Cart.remove(${item.id})"><i class="fas fa-times"></i></div>
                </div>`;
            }).join('');
        }
        
        if (cartSummary) {
            const subtotal = this.getSubtotal();
            const discount = this.getDiscount();
            const total = this.getTotal();
            
            document.getElementById('cartSubtotal').textContent = Utils.formatCurrency(subtotal);
            document.getElementById('cartDiscount').textContent = '- ' + Utils.formatCurrency(discount);
            document.getElementById('cartTotal').textContent = Utils.formatCurrency(total);
        }
        
        const cartCount = document.getElementById('cartCount');
        if (cartCount) {
            const count = this.items.reduce((sum, i) => sum + i.quantity, 0);
            cartCount.textContent = count;
            cartCount.style.display = count > 0 ? 'inline' : 'none';
        }
    }
};

// ============ PRODUCTS MANAGER ============
const Products = {
    list: [],
    categories: [],
    currentCategory: 'all',
    searchQuery: '',
    
    async load() {
        try {
            this.list = await API.get('/api/products');
            this.categories = await API.get('/api/categories');
            this.renderCategories();
            this.render();
        } catch (error) {
            Toast.error('Erreur lors du chargement des produits');
        }
    },
    
    filter() {
        let filtered = this.list;
        
        if (this.currentCategory !== 'all') {
            filtered = filtered.filter(p => p.category === this.currentCategory);
        }
        
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(p => 
                p.name.toLowerCase().includes(query) ||
                (p.barcode && p.barcode.includes(query))
            );
        }
        
        return filtered;
    },
    
    render() {
        const grid = document.getElementById('productsGrid');
        if (!grid) return;
        
        const filtered = this.filter();
        
        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:40px;color:#64748b;">
                    <i class="fas fa-box-open" style="font-size:48px;margin-bottom:15px;opacity:0.5;"></i>
                    <p>Aucun produit trouvé</p>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = filtered.map(product => {
            let stockClass = '';
            let stockText = `Stock: ${product.quantity}`;
            
            if (product.quantity <= 0) {
                stockClass = 'out';
                stockText = 'Rupture';
            } else if (product.quantity <= (product.min_stock || 5)) {
                stockClass = 'low';
            }
            
            return `
                <div class="pos-product-card ${product.quantity <= 0 ? 'out-of-stock' : ''}" 
                     onclick="Cart.add(${JSON.stringify(product).replace(/"/g, '&quot;')})">
                    <div class="pos-product-image">
                        ${product.image ? `<img src="${product.image}" alt="">` : '<i class="fas fa-box"></i>'}
                    </div>
                    <div class="pos-product-name" title="${product.name}">${product.name}</div>
                    <div class="pos-product-price">${Utils.formatCurrency(product.sale_price)}</div>
                    <div class="pos-product-stock ${stockClass}">${stockText}</div>
                    <button class="pos-product-restock" onclick="event.stopPropagation(); Inventory.quickAddStock(${product.id}, '${product.name.replace(/'/g, "\\'")}')">
                        <i class="fas fa-plus"></i> Stock
                    </button>
                </div>
            `;
        }).join('');
    },
    
    renderCategories() {
        const container = document.getElementById('categoriesContainer');
        if (!container) return;
        
        container.innerHTML = `
            <button class="pos-category ${this.currentCategory === 'all' ? 'active' : ''}" 
                    onclick="Products.setCategory('all')">
                <i class="fas fa-th"></i> Tous
            </button>
            ${this.categories.map(cat => `
                <button class="pos-category ${this.currentCategory === cat ? 'active' : ''}"
                        onclick="Products.setCategory('${cat}')">${cat}</button>
            `).join('')}
        `;
    },
    
    setCategory(category) {
        this.currentCategory = category;
        this.renderCategories();
        this.render();
    },
    
    search(query) {
        this.searchQuery = query;
        this.render();
    }
};

// ============ INVENTORY MANAGER ============
const Inventory = {
    products: [],
    movements: [],
    
    async load() {
        try {
            this.products = await API.get('/api/products');
            this.render();
            this.loadStats();
        } catch (error) {
            Toast.error('Erreur lors du chargement');
        }
    },
    
    async loadStats() {
        if (!Auth.isAdmin()) return;
        
        try {
            const stats = await API.get('/api/inventory/stats');
            
            if (document.getElementById('totalStockValue')) {
                document.getElementById('totalStockValue').textContent = Utils.formatCurrency(stats.totalStockValue);
            }
            if (document.getElementById('totalPurchaseValue')) {
                document.getElementById('totalPurchaseValue').textContent = Utils.formatCurrency(stats.totalPurchaseValue);
            }
            if (document.getElementById('totalPotentialProfit')) {
                document.getElementById('totalPotentialProfit').textContent = Utils.formatCurrency(stats.totalPotentialProfit);
            }
            if (document.getElementById('totalProducts')) {
                document.getElementById('totalProducts').textContent = stats.totalProducts;
            }
        } catch (error) {
            console.error('Stats error:', error);
        }
    },
    
    render() {
        const tbody = document.getElementById('inventoryTableBody');
        if (!tbody) return;
        
        const isAdmin = Auth.isAdmin();
        
        tbody.innerHTML = this.products.map(product => {
            let stockClass = 'in-stock';
            let stockText = 'En stock';
            
            if (product.quantity <= 0) {
                stockClass = 'out-of-stock';
                stockText = 'Rupture';
            } else if (product.quantity <= (product.min_stock || 5)) {
                stockClass = 'low-stock';
                stockText = 'Stock faible';
            }
            
            return `
                <tr>
                    <td>
                        <div class="product-cell">
                            ${product.image 
                                ? `<img src="${product.image}" alt="">` 
                                : '<div class="product-placeholder"><i class="fas fa-box"></i></div>'}
                            <div>
                                <strong>${product.name}</strong>
                                <br><small class="text-muted">${product.category || 'Sans catégorie'}</small>
                            </div>
                        </div>
                    </td>
                    <td>${product.barcode || '-'}</td>
                    ${isAdmin ? `<td class="text-right">${Utils.formatCurrency(product.purchase_price || 0)}</td>` : ''}
                    <td class="text-right">${Utils.formatCurrency(product.sale_price)}</td>
                    <td class="text-center"><strong>${product.quantity}</strong></td>
                    <td><span class="stock-badge ${stockClass}">${stockText}</span></td>
                    ${isAdmin ? `<td class="text-right">${Utils.formatCurrency((product.sale_price - (product.purchase_price || 0)) * product.quantity)}</td>` : ''}
                    <td class="actions-cell">
                        <button class="btn btn-sm btn-success" onclick="Inventory.quickAddStock(${product.id}, '${product.name.replace(/'/g, "\\'")}', ${product.quantity})" title="Réapprovisionner">
                            <i class="fas fa-plus"></i>
                        </button>
                        ${isAdmin ? `
                        <button class="btn btn-sm btn-primary" onclick="Inventory.edit(${product.id})" title="Modifier">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="Inventory.delete(${product.id})" title="Supprimer">
                            <i class="fas fa-trash"></i>
                        </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    },
    
    showAddModal() {
        document.getElementById('productForm').reset();
        document.getElementById('productId').value = '';
        document.getElementById('productModalTitle').textContent = 'Nouveau Produit';
        document.getElementById('imagePreview').innerHTML = '';
        Modal.show('productModal');
        document.getElementById('productName').focus();
    },
    
    async edit(id) {
        try {
            const product = await API.get(`/api/products/${id}`);
            
            document.getElementById('productId').value = product.id;
            document.getElementById('productName').value = product.name;
            document.getElementById('productCategory').value = product.category || '';
            document.getElementById('productPurchasePrice').value = product.purchase_price || 0;
            document.getElementById('productSalePrice').value = product.sale_price;
            document.getElementById('productQuantity').value = product.quantity;
            document.getElementById('productMinStock').value = product.min_stock || 5;
            document.getElementById('productBarcode').value = product.barcode || '';
            
            document.getElementById('productModalTitle').textContent = 'Modifier Produit';
            
            if (product.image) {
                document.getElementById('imagePreview').innerHTML = `<img src="${product.image}" style="max-width:100px;border-radius:8px;">`;
            } else {
                document.getElementById('imagePreview').innerHTML = '';
            }
            
            Modal.show('productModal');
        } catch (error) {
            Toast.error('Erreur lors du chargement');
        }
    },
    
    async save() {
        const form = document.getElementById('productForm');
        const formData = new FormData(form);
        const id = document.getElementById('productId').value;
        
        try {
            if (id) {
                await API.uploadPut(`/api/products/${id}`, formData);
                Toast.success('Produit modifié avec succès');
                Modal.hide('productModal');
            } else {
                await API.upload('/api/products', formData);
                Toast.success('Produit ajouté avec succès');
                
                // Keep modal open for rapid entry
                form.reset();
                document.getElementById('productId').value = '';
                document.getElementById('imagePreview').innerHTML = '';
                document.getElementById('productName').focus();
            }
            
            this.load();
            if (typeof Products !== 'undefined') {
                Products.load();
            }
        } catch (error) {
            Toast.error(error.message);
        }
    },
    
    async delete(id) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) return;
        
        try {
            await API.delete(`/api/products/${id}`);
            Toast.success('Produit supprimé');
            this.load();
        } catch (error) {
            Toast.error(error.message);
        }
    },
    
    quickAddStock(id, name, currentStock = 0) {
        document.getElementById('quickAddProductId').value = id;
        document.getElementById('quickAddProductName').textContent = name;
        document.getElementById('quickAddCurrentStock').textContent = currentStock;
        document.getElementById('quickAddQuantity').value = '';
        Modal.show('quickAddModal');
        document.getElementById('quickAddQuantity').focus();
    },
    
    async saveQuickAdd() {
        const id = document.getElementById('quickAddProductId').value;
        const quantity = parseInt(document.getElementById('quickAddQuantity').value);
        
        if (!quantity || quantity <= 0) {
            Toast.error('Veuillez entrer une quantité valide');
            return;
        }
        
        try {
            await API.post(`/api/products/${id}/add-stock`, { quantity });
            Toast.success(`${quantity} unité(s) ajoutée(s) au stock`);
            Modal.hide('quickAddModal');
            this.load();
            if (typeof Products !== 'undefined') {
                Products.load();
            }
        } catch (error) {
            Toast.error(error.message);
        }
    },
    
    async loadMovements(period = 'all') {
        try {
            let url = '/api/stock-movements';
            if (period !== 'all') {
                url += `?period=${period}`;
            }
            this.movements = await API.get(url);
            this.renderMovements();
        } catch (error) {
            Toast.error('Erreur lors du chargement');
        }
    },
    
    renderMovements() {
        const tbody = document.getElementById('movementsTableBody');
        if (!tbody) return;
        
        if (this.movements.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Aucun mouvement</td></tr>';
            return;
        }
        
        tbody.innerHTML = this.movements.map(m => `
            <tr>
                <td>${Utils.formatDateTime(m.created_at)}</td>
                <td><strong>${m.product_name}</strong></td>
                <td>
                    <span class="badge ${m.movement_type === 'entry' ? 'badge-success' : 'badge-danger'}">
                        <i class="fas fa-${m.movement_type === 'entry' ? 'arrow-down' : 'arrow-up'}"></i>
                        ${m.movement_type === 'entry' ? 'Entrée' : 'Sortie'}
                    </span>
                </td>
                <td class="text-center"><strong>${m.movement_type === 'entry' ? '+' : '-'}${m.quantity}</strong></td>
                <td>${m.reason || '-'}</td>
                <td>
                    <span class="user-badge">
                        <i class="fas fa-user"></i> ${m.user_name || 'Système'}
                    </span>
                </td>
            </tr>
        `).join('');
    },
    
    search(query) {
        const filtered = this.products.filter(p => 
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            (p.barcode && p.barcode.includes(query)) ||
            (p.category && p.category.toLowerCase().includes(query.toLowerCase()))
        );
        
        const temp = this.products;
        this.products = filtered;
        this.render();
        this.products = temp;
    }
};

// ============ SALES MANAGER ============
const Sales = {
    list: [],
    
    async load(period = 'all') {
        try {
            let url = '/api/sales';
            if (period !== 'all') {
                url += `?period=${period}`;
            }
            this.list = await API.get(url);
            this.render();
        } catch (error) {
            Toast.error('Erreur lors du chargement');
        }
    },
    
    render() {
        const tbody = document.getElementById('salesTableBody');
        if (!tbody) return;
        
        if (this.list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Aucune vente</td></tr>';
            return;
        }
        
        tbody.innerHTML = this.list.map(sale => `
            <tr>
                <td><strong>${sale.invoice_number}</strong></td>
                <td>${Utils.formatDateTime(sale.created_at)}</td>
                <td>${sale.client_name || '<span class="text-muted">Client comptoir</span>'}</td>
                <td>${sale.user_name}</td>
                <td class="text-right"><strong>${Utils.formatCurrency(sale.total)}</strong></td>
                <td><span class="badge badge-success"><i class="fas fa-check"></i> Payée</span></td>
                <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" onclick="Sales.view(${sale.id})" title="Voir">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="Sales.printInvoice(${sale.id})" title="Imprimer PDF">
                        <i class="fas fa-file-pdf"></i>
                    </button>
                    ${Auth.isAdmin() ? `
                    <button class="btn btn-sm btn-danger" onclick="Sales.delete(${sale.id})" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    },
    
    async view(id) {
        try {
            const sale = await API.get(`/api/sales/${id}`);
            
            let html = `
                <div class="sale-detail">
                    <div class="sale-header">
                        <div>
                            <h4 style="margin:0;color:#4f46e5;">${sale.invoice_number}</h4>
                            <small class="text-muted">${Utils.formatDateTime(sale.created_at)}</small>
                        </div>
                        <span class="badge badge-success">Payée</span>
                    </div>
                    
                    <div class="sale-info">
                        <p><i class="fas fa-user"></i> <strong>Client:</strong> ${sale.client_name || 'Client comptoir'}</p>
                        ${sale.client_phone ? `<p><i class="fas fa-phone"></i> <strong>Tél:</strong> ${sale.client_phone}</p>` : ''}
                        <p><i class="fas fa-user-tie"></i> <strong>Vendeur:</strong> ${sale.user_name}</p>
                    </div>
                    
                    <div class="sale-items">
                        <table>
                            <thead>
                                <tr>
                                    <th>Produit</th>
                                    <th class="text-center">Qté</th>
                                    <th class="text-right">P.U</th>
                                    <th class="text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sale.items.map(item => `
                                    <tr>
                                        <td>${item.product_name}</td>
                                        <td class="text-center">${item.quantity}</td>
                                        <td class="text-right">${Utils.formatCurrency(item.unit_price)}</td>
                                        <td class="text-right"><strong>${Utils.formatCurrency(item.total)}</strong></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="sale-totals">
                        <div class="total-row">
                            <span>Sous-total:</span>
                            <span>${Utils.formatCurrency(sale.subtotal)}</span>
                        </div>
                        ${sale.discount_value > 0 ? `
                        <div class="total-row discount">
                            <span>Remise:</span>
                            <span>- ${Utils.formatCurrency(sale.discount_value)}</span>
                        </div>
                        ` : ''}
                        <div class="total-row grand-total">
                            <span>TOTAL:</span>
                            <span>${Utils.formatCurrency(sale.total)}</span>
                        </div>
                    </div>
                </div>
            `;
            
            document.getElementById('saleDetailContent').innerHTML = html;
            document.getElementById('printSaleBtn').onclick = () => Sales.printInvoice(sale.id);
            Modal.show('saleDetailModal');
        } catch (error) {
            Toast.error('Erreur lors du chargement');
        }
    },
    
    async printInvoice(id) {
        try {
            Toast.show('Génération du PDF...', 'success', 2000);
            
            const sale = await API.get(`/api/sales/${id}`);
            const config = await API.get('/api/config');
            
            await InvoicePDF.generate(sale, config, true);
            
        } catch (error) {
            Toast.error('Erreur lors de la génération');
        }
    },
    
    async delete(id) {
        if (!confirm('Supprimer cette vente ? Le stock sera restauré.')) return;
        
        try {
            await API.delete(`/api/sales/${id}`);
            Toast.success('Vente supprimée');
            this.load();
        } catch (error) {
            Toast.error(error.message);
        }
    },
    
    async checkout() {
    if (Cart.items.length === 0) {
        Toast.error('Le panier est vide');
        return;
    }
    
    const clientName = document.getElementById('clientName')?.value || '';
    const clientPhone = document.getElementById('clientPhone')?.value || '';
    
    // Vérifier le mode de paiement sélectionné
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value;
    
    if (!paymentMethod) {
        Toast.error('Veuillez sélectionner un mode de paiement');
        return;
    }
    
    const saleData = {
        client_name: clientName,
        client_phone: clientPhone,
        items: Cart.items,
        subtotal: Cart.getSubtotal(),
        discount_type: Cart.discountType,
        discount_value: Cart.getDiscount(),
        total: Cart.getTotal(),
        payment_method: paymentMethod
    };
    
    try {
        const result = await API.post('/api/sales', saleData);
        Toast.success('Vente enregistrée avec succès !');
        
        // Generate and download PDF
        const sale = await API.get(`/api/sales/${result.id}`);
        const config = await API.get('/api/config');
        await InvoicePDF.generate(sale, config, true);
        
        // Clear cart
        Cart.clear();
        document.getElementById('clientName').value = '';
        document.getElementById('clientPhone').value = '';
        document.getElementById('discountValue').value = '';
        
        // Reload products
        Products.load();
        
    } catch (error) {
        Toast.error(error.message);
    }
    },
    
    showPrintHistory() {
        const history = InvoicePDF.getPrintHistory();
        
        let html = `
            <div class="table-container" style="max-height:400px;overflow-y:auto;">
                <table>
                    <thead>
                        <tr>
                            <th>Date d'impression</th>
                            <th>N° Vente</th>
                            <th>Imprimé par</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        if (history.length === 0) {
            html += '<tr><td colspan="4" class="text-center text-muted">Aucun historique</td></tr>';
        } else {
            history.forEach(h => {
                html += `
                    <tr>
                        <td>${Utils.formatDateTime(h.printedAt)}</td>
                        <td>${h.saleId}</td>
                        <td>${h.printedBy || 'N/A'}</td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="Sales.printInvoice(${h.saleId})">
                                <i class="fas fa-redo"></i> Réimprimer
                            </button>
                        </td>
                    </tr>
                `;
            });
        }
        
        html += '</tbody></table></div>';
        
        document.getElementById('printHistoryContent').innerHTML = html;
        Modal.show('printHistoryModal');
    },
    
    export(period) {
        window.location.href = `/api/export/sales?period=${period}`;
    }
};

// ============ CLIENTS MANAGER ============
const Clients = {
    list: [],
    
    async load() {
        try {
            this.list = await API.get('/api/clients');
            this.render();
        } catch (error) {
            Toast.error('Erreur lors du chargement');
        }
    },
    
    render() {
        const container = document.getElementById('clientsGrid');
        if (!container) return;
        
        if (this.list.length === 0) {
            container.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:40px;color:#64748b;">
                    <i class="fas fa-users" style="font-size:48px;margin-bottom:15px;opacity:0.5;"></i>
                    <p>Aucun client enregistré</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.list.map(client => `
            <div class="card client-card" onclick="Clients.view(${client.id})">
                <div class="card-body" style="display:flex;gap:15px;align-items:center;">
                    <div class="client-avatar">${Utils.getInitials(client.name)}</div>
                    <div class="client-info" style="flex:1;">
                        <h4 style="margin:0;font-size:15px;">${client.name}</h4>
                        <p style="margin:3px 0 0;color:#64748b;font-size:13px;">
                            <i class="fas fa-phone"></i> ${client.phone || 'Pas de téléphone'}
                        </p>
                    </div>
                    <i class="fas fa-chevron-right" style="color:#cbd5e1;"></i>
                </div>
            </div>
        `).join('');
    },
    
    showAddModal() {
        document.getElementById('clientForm').reset();
        document.getElementById('clientId').value = '';
        document.getElementById('clientModalTitle').textContent = 'Nouveau Client';
        Modal.show('clientModal');
    },
    
    async view(id) {
        try {
            const client = await API.get(`/api/clients/${id}`);
            
            document.getElementById('clientId').value = client.id;
            
            let salesHtml = '<p class="text-muted text-center">Aucun achat enregistré</p>';
            if (client.sales && client.sales.length > 0) {
                salesHtml = `
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Facture</th>
                                    <th>Date</th>
                                    <th>Total</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${client.sales.map(sale => `
                                    <tr>
                                        <td><strong>${sale.invoice_number}</strong></td>
                                        <td>${Utils.formatDateTime(sale.created_at)}</td>
                                        <td>${Utils.formatCurrency(sale.total)}</td>
                                        <td>
                                            <button class="btn btn-sm btn-primary" onclick="Sales.printInvoice(${sale.id})">
                                                <i class="fas fa-file-pdf"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
            
            const totalSpent = client.sales ? client.sales.reduce((sum, s) => sum + s.total, 0) : 0;
            
            document.getElementById('clientDetailContent').innerHTML = `
                <div class="client-profile">
                    <div class="client-avatar-large">${Utils.getInitials(client.name)}</div>
                    <h3>${client.name}</h3>
                    <p class="text-muted">Client depuis ${Utils.formatDate(client.created_at)}</p>
                </div>
                
                <div class="client-stats">
                    <div class="stat">
                        <span class="stat-value">${client.sales ? client.sales.length : 0}</span>
                        <span class="stat-label">Achats</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${Utils.formatCurrency(totalSpent)}</span>
                        <span class="stat-label">Total dépensé</span>
                    </div>
                </div>
                
                <div class="client-details">
                    <p><i class="fas fa-phone"></i> ${client.phone || 'Non renseigné'}</p>
                    <p><i class="fas fa-envelope"></i> ${client.email || 'Non renseigné'}</p>
                    <p><i class="fas fa-map-marker-alt"></i> ${client.address || 'Non renseignée'}</p>
                </div>
                
                <h4 style="margin:20px 0 10px;"><i class="fas fa-history"></i> Historique des achats</h4>
                ${salesHtml}
            `;
            
            document.getElementById('editClientBtn').onclick = () => {
                Modal.hide('clientDetailModal');
                Clients.edit(id);
            };
            
            Modal.show('clientDetailModal');
        } catch (error) {
            Toast.error('Erreur lors du chargement');
        }
    },
    
    async edit(id) {
        try {
            const client = await API.get(`/api/clients/${id}`);
            
            document.getElementById('clientId').value = client.id;
            document.getElementById('clientNameInput').value = client.name;
            document.getElementById('clientPhoneInput').value = client.phone || '';
            document.getElementById('clientEmail').value = client.email || '';
            document.getElementById('clientAddress').value = client.address || '';
            
            document.getElementById('clientModalTitle').textContent = 'Modifier Client';
            Modal.show('clientModal');
        } catch (error) {
            Toast.error('Erreur lors du chargement');
        }
    },
    
    async save() {
        const id = document.getElementById('clientId').value;
        const data = {
            name: document.getElementById('clientNameInput').value,
            phone: document.getElementById('clientPhoneInput').value,
            email: document.getElementById('clientEmail').value,
            address: document.getElementById('clientAddress').value
        };
        
        if (!data.name.trim()) {
            Toast.error('Le nom est requis');
            return;
        }
        
        try {
            if (id) {
                await API.put(`/api/clients/${id}`, data);
                Toast.success('Client modifié');
            } else {
                await API.post('/api/clients', data);
                Toast.success('Client ajouté');
            }
            
            Modal.hide('clientModal');
            this.load();
        } catch (error) {
            Toast.error(error.message);
        }
    },
    
    async delete(id) {
        if (!confirm('Supprimer ce client ?')) return;
        
        try {
            await API.delete(`/api/clients/${id}`);
            Toast.success('Client supprimé');
            Modal.hide('clientDetailModal');
            this.load();
        } catch (error) {
            Toast.error(error.message);
        }
    },
    
    export() {
        window.location.href = '/api/export/clients';
    },
    
    search(query) {
        if (!query.trim()) {
            this.render();
            return;
        }
        
        const filtered = this.list.filter(c => 
            c.name.toLowerCase().includes(query.toLowerCase()) ||
            (c.phone && c.phone.includes(query))
        );
        
        const temp = this.list;
        this.list = filtered;
        this.render();
        this.list = temp;
    }
};

// ============ USERS MANAGER ============
const Users = {
    list: [],
    
    async load() {
        try {
            this.list = await API.get('/api/users');
            this.render();
        } catch (error) {
            Toast.error('Erreur lors du chargement');
        }
    },
    
    render() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = this.list.map(user => `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div class="user-avatar-small">${Utils.getInitials(user.full_name || user.username)}</div>
                        <div>
                            <strong>${user.full_name || user.username}</strong>
                            <br><small class="text-muted">@${user.username}</small>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge ${user.role === 'admin' ? 'badge-info' : 'badge-secondary'}">
                        <i class="fas fa-${user.role === 'admin' ? 'shield-alt' : 'user'}"></i>
                        ${user.role === 'admin' ? 'Administrateur' : 'Caissier'}
                    </span>
                </td>
                <td>${Utils.formatDate(user.created_at)}</td>
                <td>
                    ${!user.is_default ? `
                        <button class="btn btn-sm btn-primary" onclick="Users.edit(${user.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="Users.delete(${user.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : '<span class="badge badge-secondary"><i class="fas fa-lock"></i> Système</span>'}
                </td>
            </tr>
        `).join('');
    },
    
    showAddModal() {
        document.getElementById('userForm').reset();
        document.getElementById('userId').value = '';
        document.getElementById('userModalTitle').textContent = 'Nouvel Utilisateur';
        document.getElementById('passwordHint').style.display = 'none';
        document.getElementById('userPassword').required = true;
        Modal.show('userModal');
    },
    
    async edit(id) {
        const user = this.list.find(u => u.id === id);
        if (!user) return;
        
        document.getElementById('userId').value = user.id;
        document.getElementById('userUsername').value = user.username;
        document.getElementById('userPassword').value = '';
        document.getElementById('userFullName').value = user.full_name || '';
        document.getElementById('userRole').value = user.role;
        
        document.getElementById('userModalTitle').textContent = 'Modifier Utilisateur';
        document.getElementById('passwordHint').style.display = 'block';
        document.getElementById('userPassword').required = false;
        
        Modal.show('userModal');
    },
    
    async save() {
        const id = document.getElementById('userId').value;
        const data = {
            username: document.getElementById('userUsername').value,
            password: document.getElementById('userPassword').value,
            full_name: document.getElementById('userFullName').value,
            role: document.getElementById('userRole').value
        };
        
        if (!id && !data.password) {
            Toast.error('Le mot de passe est requis');
            return;
        }
        
        try {
            if (id) {
                await API.put(`/api/users/${id}`, data);
                Toast.success('Utilisateur modifié');
            } else {
                await API.post('/api/users', data);
                Toast.success('Utilisateur créé');
            }
            
            Modal.hide('userModal');
            this.load();
        } catch (error) {
            Toast.error(error.message);
        }
    },
    
    async delete(id) {
        if (!confirm('Supprimer cet utilisateur ?')) return;
        
        try {
            await API.delete(`/api/users/${id}`);
            Toast.success('Utilisateur supprimé');
            this.load();
        } catch (error) {
            Toast.error(error.message);
        }
    }
};

// ============ DASHBOARD ============
const Dashboard = {
    async load() {
        try {
            const stats = await API.get('/api/dashboard/stats');
            const topProducts = await API.get('/api/dashboard/top-products');
            
            document.getElementById('todaySales').textContent = stats.todaySales;
            document.getElementById('todayRevenue').textContent = Utils.formatCurrency(stats.todayRevenue);
            document.getElementById('monthProfit').textContent = Utils.formatCurrency(stats.monthProfit);
            document.getElementById('criticalStock').textContent = stats.criticalStock;
            
            const topList = document.getElementById('topProductsList');
            if (topList) {
                if (topProducts.length > 0) {
                    topList.innerHTML = topProducts.map((p, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${p.product_name}</td>
                            <td class="text-center">${p.total_sold}</td>
                            <td class="text-right">${Utils.formatCurrency(p.revenue)}</td>
                        </tr>
                    `).join('');
                } else {
                    topList.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Aucune vente ce mois</td></tr>';
                }
            }
            
            this.loadChart();
            
        } catch (error) {
            console.error('Dashboard error:', error);
        }
    },
    
    async loadChart(period = 'week') {
        try {
            const chartData = await API.get(`/api/dashboard/chart?period=${period}`);
            const ctx = document.getElementById('salesChart');
            if (!ctx) return;
            
            const canvas = ctx.getContext('2d');
            const width = ctx.width;
            const height = ctx.height;
            
            canvas.clearRect(0, 0, width, height);
            
            if (chartData.length === 0) {
                canvas.fillStyle = '#64748b';
                canvas.font = '14px Inter, sans-serif';
                canvas.textAlign = 'center';
                canvas.fillText('Pas de données pour cette période', width / 2, height / 2);
                return;
            }
            
            const maxRevenue = Math.max(...chartData.map(d => d.revenue)) || 1;
            const padding = 50;
            const chartWidth = width - padding * 2;
            const chartHeight = height - padding * 2;
            const barWidth = Math.min(chartWidth / chartData.length - 15, 40);
            const gap = (chartWidth - barWidth * chartData.length) / (chartData.length + 1);
            
            chartData.forEach((data, i) => {
                const barHeight = (data.revenue / maxRevenue) * chartHeight;
                const x = padding + gap + i * (barWidth + gap);
                const y = height - padding - barHeight;
                
                // Bar gradient
                const gradient = canvas.createLinearGradient(x, y, x, height - padding);
                gradient.addColorStop(0, '#4f46e5');
                gradient.addColorStop(1, '#818cf8');
                
                canvas.fillStyle = gradient;
                canvas.beginPath();
                canvas.roundRect(x, y, barWidth, barHeight, 4);
                canvas.fill();
                
                // Label
                canvas.fillStyle = '#64748b';
                canvas.font = '11px Inter, sans-serif';
                canvas.textAlign = 'center';
                const dateLabel = data.date.slice(5).replace('-', '/');
                canvas.fillText(dateLabel, x + barWidth / 2, height - 15);
                
                // Value on top
                canvas.fillStyle = '#374151';
                canvas.font = '10px Inter, sans-serif';
                if (barHeight > 30) {
                    canvas.fillText(Utils.formatCurrency(data.revenue).replace(' Ar', ''), x + barWidth / 2, y - 5);
                }
            });
            
        } catch (error) {
            console.error('Chart error:', error);
        }
    }
};

// ============ TREASURY ============
const Treasury = {
    expenses: [],
    goals: [],
    
    async load() {
        try {
            const [stats, expenses, goals] = await Promise.all([
                API.get('/api/dashboard/stats'),
                API.get('/api/expenses'),
                API.get('/api/financial-goals')
            ]);
            
            this.expenses = expenses;
            this.goals = goals;
            
            document.getElementById('totalProfit').textContent = Utils.formatCurrency(stats.monthProfit);
            document.getElementById('totalExpenses').textContent = Utils.formatCurrency(stats.monthExpenses);
            document.getElementById('netProfit').textContent = Utils.formatCurrency(stats.netProfit);
            
            const completedGoals = goals.filter(g => g.status === 'completed').length;
            if (document.getElementById('goalsCompleted')) {
                document.getElementById('goalsCompleted').textContent = completedGoals + '/' + goals.length;
            }
            
            this.renderExpenses();
            this.renderGoals();
            
        } catch (error) {
            Toast.error('Erreur lors du chargement');
        }
    },
    
    renderExpenses() {
        const tbody = document.getElementById('expensesTableBody');
        if (!tbody) return;
        
        if (this.expenses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Aucune dépense</td></tr>';
            return;
        }
        
        tbody.innerHTML = this.expenses.map(expense => `
            <tr>
                <td>${Utils.formatDate(expense.created_at)}</td>
                <td><strong>${expense.description}</strong></td>
                <td>${expense.category || '-'}</td>
                <td class="text-right">${Utils.formatCurrency(expense.amount)}</td>
                <td>
                    <span class="badge ${expense.type === 'planned' ? 'badge-warning' : 'badge-info'}">
                        ${expense.type === 'planned' ? 'Prévue' : 'Réalisée'}
                    </span>
                </td>
                <td>
                    <span class="badge ${expense.status === 'validated' ? 'badge-success' : 'badge-secondary'}">
                        ${expense.status === 'validated' ? 'Validée' : 'En attente'}
                    </span>
                </td>
                <td>
                    ${expense.status !== 'validated' ? `
                        <button class="btn btn-sm btn-success" onclick="Treasury.validateExpense(${expense.id})" title="Valider">
                            <i class="fas fa-check"></i>
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-danger" onclick="Treasury.deleteExpense(${expense.id})" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    },
    
    renderGoals() {
        const container = document.getElementById('goalsContainer');
        if (!container) return;
        
        if (this.goals.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">Aucun objectif défini</p>';
            return;
        }
        
        container.innerHTML = this.goals.map(goal => {
            const percent = Math.min((goal.current_amount / goal.target_amount) * 100, 100);
            const isCompleted = percent >= 100;
            
            return `
                <div class="goal-card ${isCompleted ? 'completed' : ''}">
                    <div class="goal-header">
                        <h4>${goal.name}</h4>
                        <span class="badge ${isCompleted ? 'badge-success' : 'badge-info'}">
                            ${isCompleted ? '<i class="fas fa-check"></i> Atteint' : 'En cours'}
                        </span>
                    </div>
                    <div class="goal-progress">
                        <div class="goal-progress-bar" style="width: ${percent}%"></div>
                    </div>
                    <div class="goal-info">
                        <span>${Utils.formatCurrency(goal.current_amount)} / ${Utils.formatCurrency(goal.target_amount)}</span>
                        <span><strong>${percent.toFixed(0)}%</strong></span>
                    </div>
                    ${goal.deadline ? `<div class="goal-deadline"><i class="fas fa-calendar"></i> Échéance: ${Utils.formatDate(goal.deadline)}</div>` : ''}
                </div>
            `;
        }).join('');
    },
    
    showExpenseModal() {
        document.getElementById('expenseForm').reset();
        Modal.show('expenseModal');
    },
    
    async saveExpense() {
        const data = {
            description: document.getElementById('expenseDescription').value,
            amount: parseFloat(document.getElementById('expenseAmount').value),
            type: document.getElementById('expenseType').value,
            category: document.getElementById('expenseCategory').value,
            status: 'pending'
        };
        
        if (!data.description || !data.amount) {
            Toast.error('Veuillez remplir tous les champs requis');
            return;
        }
        
        try {
            await API.post('/api/expenses', data);
            Toast.success('Dépense ajoutée');
            Modal.hide('expenseModal');
            this.load();
        } catch (error) {
            Toast.error(error.message);
        }
    },
    
    async validateExpense(id) {
        try {
            const expense = this.expenses.find(e => e.id === id);
            await API.put(`/api/expenses/${id}`, { ...expense, status: 'validated' });
            Toast.success('Dépense validée');
            this.load();
        } catch (error) {
            Toast.error(error.message);
        }
    },
    
    async deleteExpense(id) {
        if (!confirm('Supprimer cette dépense ?')) return;
        
        try {
            await API.delete(`/api/expenses/${id}`);
            Toast.success('Dépense supprimée');
            this.load();
        } catch (error) {
            Toast.error(error.message);
        }
    },
    
    showGoalModal() {
        document.getElementById('goalForm').reset();
        Modal.show('goalModal');
    },
    
    async saveGoal() {
        const data = {
            name: document.getElementById('goalName').value,
            target_amount: parseFloat(document.getElementById('goalTarget').value),
            deadline: document.getElementById('goalDeadline').value
        };
        
        if (!data.name || !data.target_amount) {
            Toast.error('Veuillez remplir tous les champs requis');
            return;
        }
        
        try {
            await API.post('/api/financial-goals', data);
            Toast.success('Objectif ajouté');
            Modal.hide('goalModal');
            this.load();
        } catch (error) {
            Toast.error(error.message);
        }
    }
};

// ============ CONFIG ============
const Config = {
    async load() {
        try {
            const config = await API.get('/api/config');
            
            document.getElementById('companyName').value = config.name || '';
            document.getElementById('companyAddress').value = config.address || '';
            document.getElementById('companyPhone').value = config.phone || '';
            document.getElementById('companyEmail').value = config.email || '';
            document.getElementById('companyWebsite').value = config.website || '';
            document.getElementById('invoiceHeader').value = config.invoice_header || '';
            document.getElementById('invoiceFooter').value = config.invoice_footer || '';
            document.getElementById('currency').value = config.currency || 'Ar';
            document.getElementById('taxRate').value = config.tax_rate || 0;
            
            if (config.logo) {
                document.getElementById('logoPreview').innerHTML = `<img src="${config.logo}" style="max-width:150px;border-radius:8px;">`;
            }
            
        } catch (error) {
            Toast.error('Erreur lors du chargement');
        }
    },
    
    async save() {
        const form = document.getElementById('configForm');
        const formData = new FormData(form);
        
        try {
            await API.uploadPut('/api/config', formData);
            Toast.success('Configuration enregistrée');
        } catch (error) {
            Toast.error(error.message);
        }
    }
};

// ============ STOCK MOVEMENTS ============
const StockMovements = {
    movements: [],
    
    async load(period = 'all') {
        try {
            let url = '/api/stock-movements';
            if (period && period !== 'all') {
                url += `?period=${period}`;
            }
            this.movements = await API.get(url);
            this.render();
        } catch (error) {
            Toast.error('Erreur lors du chargement des mouvements');
            console.error(error);
        }
    },
    
    render() {
        const tbody = document.getElementById('movementsTableBody');
        if (!tbody) return;
        
        if (!this.movements || this.movements.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted" style="padding:40px;">
                        <i class="fas fa-exchange-alt fa-2x" style="opacity:0.3;"></i>
                        <p class="mt-2">Aucun mouvement de stock enregistré</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        const isAdmin = Auth.isAdmin();
        
        tbody.innerHTML = this.movements.map(m => `
            <tr>
                <td>${Utils.formatDateTime(m.created_at)}</td>
                <td><strong>${Utils.escapeHtml(m.product_name)}</strong></td>
                <td>
                    <span class="badge ${m.movement_type === 'entry' ? 'badge-success' : 'badge-danger'}">
                        <i class="fas fa-${m.movement_type === 'entry' ? 'arrow-down' : 'arrow-up'}"></i>
                        ${m.movement_type === 'entry' ? 'Entrée' : 'Sortie'}
                    </span>
                </td>
                <td><strong>${m.quantity}</strong></td>
                <td>${Utils.escapeHtml(m.reason) || '-'}</td>
                <td>
                    <span class="badge badge-secondary">
                        <i class="fas fa-user"></i>
                        ${Utils.escapeHtml(m.user_full_name || m.user_name || 'Système')}
                    </span>
                </td>
                ${isAdmin ? `
                <td>
                    <button class="btn btn-sm btn-danger" onclick="StockMovements.delete(${m.id})" title="Supprimer et restaurer stock">
                        <i class="fas fa-undo"></i>
                    </button>
                </td>
                ` : '<td></td>'}
            </tr>
        `).join('');
    },
    
    // ADMIN ONLY - Delete movement and restore stock
    async delete(id) {
        if (!Auth.isAdmin()) {
            Toast.error('Action réservée aux administrateurs');
            return;
        }
        
        if (!confirm('Supprimer ce mouvement et restaurer le stock?\nCette action est irréversible.')) return;
        
        try {
            await API.delete(`/api/stock-movements/${id}`);
            Toast.success('Mouvement supprimé, stock restauré');
            this.load();
            
            // Reload inventory if on that page
            if (typeof Inventory !== 'undefined' && Inventory.load) {
                Inventory.load();
            }
        } catch (error) {
            Toast.error(error.message || 'Erreur lors de la suppression');
        }
    },
    
    // ADMIN ONLY - Add manual movement
    showAddModal() {
        if (!Auth.isAdmin()) {
            Toast.error('Action réservée aux administrateurs');
            return;
        }
        
        const modal = document.getElementById('addMovementModal');
        if (modal) {
            document.getElementById('movementForm')?.reset();
            Modal.show('addMovementModal');
        }
    },
    
    async saveManual() {
        if (!Auth.isAdmin()) {
            Toast.error('Action réservée aux administrateurs');
            return;
        }
        
        const data = {
            product_id: document.getElementById('movementProductId').value,
            movement_type: document.getElementById('movementType').value,
            quantity: parseInt(document.getElementById('movementQuantity').value),
            reason: document.getElementById('movementReason').value
        };
        
        if (!data.product_id || !data.quantity) {
            Toast.error('Veuillez remplir tous les champs obligatoires');
            return;
        }
        
        try {
            await API.post('/api/stock-movements', data);
            Toast.success('Mouvement enregistré');
            Modal.hide('addMovementModal');
            this.load();
            
            if (typeof Inventory !== 'undefined' && Inventory.load) {
                Inventory.load();
            }
        } catch (error) {
            Toast.error(error.message || 'Erreur lors de l\'enregistrement');
        }
    },
    
    export(period) {
        window.location.href = `/api/export/stock-movements?period=${period || 'all'}`;
        Toast.success('Export en cours de téléchargement...');
    }
};

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
    Toast.init();
    
    if (window.location.pathname.includes('login.html')) {
        return;
    }
    
    const isAuthenticated = await Auth.checkSession();
    if (!isAuthenticated) {
        window.location.href = '/login.html';
        return;
    }
    
    updateUIForRole();
    initCurrentPage();
});

function updateUIForRole() {
    const user = Auth.getUser();
    if (!user) return;

    const userAvatar = document.querySelector('.user-avatar');
    const userDetails = document.querySelector('.user-details');

    if (userAvatar) {
        userAvatar.textContent = Utils.getInitials(user.full_name || user.username);
    }
    if (userDetails) {
        userDetails.innerHTML = `
            <h4>${user.full_name || user.username}</h4>
            <span>${user.role === 'admin' ? 'Administrateur' : 'Caissier'}</span>
        `;
    }

    if (user.role === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => { el.style.display = ''; });
        document.querySelectorAll('.caissier-only').forEach(el => { el.style.display = 'none'; });
    } else {
        document.querySelectorAll('.admin-only').forEach(el => { el.style.display = 'none'; });
        document.querySelectorAll('.caissier-only').forEach(el => { el.style.display = ''; });
    }
}

function initCurrentPage() {
    const path = window.location.pathname;
    
    if (path.includes('index.html') || path === '/') {
        if (Auth.isAdmin()) {
            Dashboard.load();
        } else {
            window.location.href = '/pos.html';
        }
    } else if (path.includes('pos.html')) {
        Products.load();
        Cart.render();
        
        const searchInput = document.getElementById('productSearch');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce((e) => {
                Products.search(e.target.value);
            }, 300));
        }
        
        const discountType = document.getElementById('discountType');
        const discountValue = document.getElementById('discountValue');
        
        if (discountType && discountValue) {
            const updateDiscount = () => {
                Cart.setDiscount(discountType.value, discountValue.value);
            };
            
            discountType.addEventListener('change', updateDiscount);
            discountValue.addEventListener('input', updateDiscount);
        }
        
    } else if (path.includes('inventory.html')) {
        Inventory.load();
    } else if (path.includes('sales.html')) {
        Sales.load();
    } else if (path.includes('clients.html')) {
        Clients.load();
    } else if (path.includes('users.html')) {
        Users.load();
    } else if (path.includes('treasury.html')) {
        Treasury.load();
    } else if (path.includes('config.html')) {
        Config.load();
    }
}

// Global event handlers
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        Modal.hideAll();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        Modal.hideAll();
    }
});

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
    Toast.init();
    
    if (window.location.pathname.includes('login.html')) {
        return;
    }
    
    const isAuthenticated = await Auth.checkSession();
    if (!isAuthenticated) {
        window.location.href = '/login.html';
        return;
    }
    
    updateUIForRole();
    initCurrentPage();

    // Log current time for debugging
    console.log('🕐 Heure actuelle (Madagascar UTC+3):', Utils.getCurrentDateTime());
});

function updateUIForRole() {
    const user = Auth.getUser();
    if (!user) return;

    const userAvatar = document.querySelector('.user-avatar');
    const userDetails = document.querySelector('.user-details');

    if (userAvatar) {
        userAvatar.textContent = Utils.getInitials(user.full_name || user.username);
    }
    if (userDetails) {
        userDetails.innerHTML = `
            <h4>${user.full_name || user.username}</h4>
            <span>${user.role === 'admin' ? 'Administrateur' : 'Caissier'}</span>
        `;
    }

    if (user.role === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => { el.style.display = ''; });
        document.querySelectorAll('.caissier-only').forEach(el => { el.style.display = 'none'; });
    } else {
        document.querySelectorAll('.admin-only').forEach(el => { el.style.display = 'none'; });
        document.querySelectorAll('.caissier-only').forEach(el => { el.style.display = ''; });
    }
}

function initCurrentPage() {
    const path = window.location.pathname;
    
    if (path.includes('index.html') || path === '/') {
        if (Auth.isAdmin()) {
            Dashboard.load();
        } else {
            window.location.href = '/pos.html';
        }
    } else if (path.includes('pos.html')) {
        Products.load();
        Cart.render();
        
        const searchInput = document.getElementById('productSearch');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce((e) => {
                Products.search(e.target.value);
            }, 300));
        }
        
        const discountType = document.getElementById('discountType');
        const discountValue = document.getElementById('discountValue');
        
        if (discountType && discountValue) {
            const updateDiscount = () => {
                Cart.setDiscount(discountType.value, discountValue.value);
            };
            
            discountType.addEventListener('change', updateDiscount);
            discountValue.addEventListener('input', updateDiscount);
        }
        
    } else if (path.includes('inventory.html')) {
        Inventory.load();
    } else if (path.includes('sales.html')) {
        Sales.load();
    } else if (path.includes('clients.html')) {
        Clients.load();
    } else if (path.includes('users.html')) {
        Users.load();
    } else if (path.includes('treasury.html')) {
        Treasury.load();
    } else if (path.includes('config.html')) {
        Config.load();
    }
}

// Global event handlers
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        Modal.hideAll();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        Modal.hideAll();
    }
});