const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs'); 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000; 
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
if (!process.env.JWT_SECRET) console.warn('JWT_SECRET is not configured: sessions will reset after server restart.'); 

app.use(express.json({ limit: '50mb' })); 
app.use(cors());
app.use(compression());

// --- АВТО-ВЕРСИЯ КЭША ---
const APP_VERSION = Date.now(); 

// --- ОТКЛЮЧЕНИЕ КЭША ДЛЯ API ---
const nocache = (req, res, next) => {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next();
};
app.use('/api', nocache);

// Функция отдачи страниц
const servePage = (res, fileName) => {
    const filePath = __dirname + '/public/' + fileName;
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) { console.error(err); return res.status(500).send('Server Error'); }
        const html = data.replace(/{{VER}}/g, APP_VERSION);
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(html);
    });
};

// ==========================================
// МОДЕЛЬ ПОЛЬЗОВАТЕЛЯ
// ==========================================
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    fullName: String,
    isBlocked: { type: Boolean, default: false },
    role: { type: String, enum: ['manager', 'guest', 'marketing'], default: 'manager' },
    scope: { type: String, enum: ['all', 'astana', 'regions'], default: 'all' },
    permissions: {
        can_view_dealers: { type: Boolean, default: true },
        can_view_map: { type: Boolean, default: true },
        can_view_products: { type: Boolean, default: true },
        can_view_report: { type: Boolean, default: true },
        can_view_sales: { type: Boolean, default: true },
        can_view_competitors: { type: Boolean, default: true },
        can_view_knowledge: { type: Boolean, default: true },
        can_view_dashboard: { type: Boolean, default: true },
        can_view_reclamations: { type: Boolean, default: true },
        can_create_dealer: { type: Boolean, default: false },
        can_edit_dealer: { type: Boolean, default: false },
        can_delete_dealer: { type: Boolean, default: false },
        can_manage_visits: { type: Boolean, default: false },
        can_edit_matrix: { type: Boolean, default: false },
        can_edit_sales_fact: { type: Boolean, default: false },
        can_edit_sales_plan: { type: Boolean, default: false },
        can_manage_products: { type: Boolean, default: false },
        can_manage_competitors: { type: Boolean, default: false },
        can_manage_knowledge: { type: Boolean, default: false },
        can_manage_reclamations: { type: Boolean, default: false },
        can_export_base: { type: Boolean, default: false },
        can_export_prices: { type: Boolean, default: false },
        can_manage_users: { type: Boolean, default: false },
        is_admin: { type: Boolean, default: false }
    }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

// --- ФУНКЦИЯ СОЗДАНИЯ АДМИНА ---
async function seedUsers() {
    const admin = await User.findOne({ username: 'admin' });
    const adminPermissions = {
        is_admin: true,
        can_manage_users: true,
        can_view_dealers: true,
        can_view_map: true,
        can_view_products: true,
        can_view_report: true,
        can_view_sales: true,
        can_view_competitors: true,
        can_view_knowledge: true,
        can_view_dashboard: true,
        can_view_reclamations: true,
        can_create_dealer: true,
        can_edit_dealer: true,
        can_delete_dealer: true,
        can_manage_visits: true,
        can_edit_matrix: true,
        can_edit_sales_fact: true,
        can_edit_sales_plan: true,
        can_manage_products: true,
        can_manage_competitors: true,
        can_manage_knowledge: true,
        can_manage_reclamations: true,
        can_export_base: true,
        can_export_prices: true
    };

    if (!admin) {
        console.log('Создание первого администратора...');
        const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;
        if (!initialAdminPassword) {
            console.warn('Admin user is missing. Set INITIAL_ADMIN_PASSWORD to create the first administrator.');
            return;
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(initialAdminPassword, salt);
        await User.create({
            username: 'admin',
            password: hashedPassword,
            fullName: 'Главный Администратор',
            role: 'manager',
            scope: 'all',
            permissions: adminPermissions
        });
        console.log('Администратор создан из INITIAL_ADMIN_PASSWORD.');
    } else {
        admin.permissions = adminPermissions;
        admin.role = 'manager';
        admin.scope = 'all';
        if (admin.isBlocked === undefined) admin.isBlocked = false;
        await admin.save();
        console.log('Права администратора принудительно обновлены.');
    }
}

// ==========================================
// НОВАЯ ЗАЩИТА (JWT MIDDLEWARE)
// ==========================================
const authMiddleware = (req, res, next) => {
    if (req.method === 'OPTIONS') return next(); 
    if (req.path === '/api/auth/login' || !req.path.startsWith('/api')) return next();

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

    jwt.verify(token, JWT_SECRET, async (err, tokenUser) => {
        if (err) return res.status(403).json({ error: 'Токен недействителен' });
        try {
            const dbUser = await User.findById(tokenUser.id).lean();
            if (!dbUser || dbUser.isBlocked) {
                return res.status(403).json({ error: 'Доступ заблокирован' });
            }
            req.user = {
                id: dbUser._id.toString(),
                username: dbUser.username,
                fullName: dbUser.fullName,
                role: dbUser.role || 'manager',
                scope: dbUser.scope || 'all',
                permissions: dbUser.permissions || {}
            };
            next();
        } catch (e) {
            return res.status(500).json({ error: 'Ошибка проверки доступа' });
        }
    });
};
app.use(authMiddleware);

// --- API ВХОДА ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: 'Неверный логин' });
        if (user.isBlocked) return res.status(403).json({ error: 'Аккаунт заблокирован' });

        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ error: 'Неверный пароль' });

        const token = jwt.sign(
            { id: user._id, role: user.role || 'manager', scope: user.scope || 'all' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user._id, username: user.username, fullName: user.fullName,
                role: user.role || 'manager', scope: user.scope || 'all',
                permissions: user.permissions || {}
            }
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// API УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ
function hasPermission(req, permission) {
    return Boolean(
        req.user &&
        req.user.permissions &&
        (req.user.permissions.is_admin || req.user.permissions[permission])
    );
}

const requirePermission = (permission) => (req, res, next) => {
    if (!hasPermission(req, permission)) {
        return res.status(403).json({ error: 'Недостаточно прав', permission });
    }
    next();
};

const requireAnyPermission = (...permissions) => (req, res, next) => {
    if (req.user && req.user.permissions && req.user.permissions.is_admin) return next();
    if (!permissions.some(permission => hasPermission(req, permission))) {
        return res.status(403).json({ error: 'Недостаточно прав', permissions });
    }
    next();
};

const requireAdmin = requirePermission('can_manage_users');

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const { username, password, fullName, role, scope, permissions } = req.body;
        if (!username || !String(username).trim()) return res.status(400).json({ error: 'Укажите логин' });
        if (!password || String(password).length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
        const normalizedUsername = String(username).trim().toLowerCase();
        const exists = await User.findOne({ username: normalizedUsername });
        if (exists) return res.status(400).json({ error: 'Логин уже занят' });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const normalizedRole = role || 'manager';
        const normalizedScope = normalizedRole === 'marketing' ? 'all' : scope;
        const newUser = new User({ username: normalizedUsername, password: hashedPassword, fullName, role: normalizedRole, scope: normalizedScope, permissions });
        await newUser.save();
        res.json({ status: 'ok' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const { username, fullName, role, scope, permissions, isBlocked, password } = req.body;
        const normalizedRole = role || 'manager';
        const normalizedScope = normalizedRole === 'marketing' ? 'all' : scope;
        const updateData = { fullName, role: normalizedRole, scope: normalizedScope, permissions, isBlocked };

        if (username && String(username).trim()) {
            const normalizedUsername = String(username).trim().toLowerCase();
            const duplicate = await User.exists({ username: normalizedUsername, _id: { $ne: req.params.id } });
            if (duplicate) return res.status(400).json({ error: 'Логин уже занят' });
            updateData.username = normalizedUsername;
        }

        if (password && password.trim() !== "") {
            if (password.length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }
        await User.findByIdAndUpdate(req.params.id, updateData);
        res.json({ status: 'ok' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        if (req.params.id === req.user.id) return res.status(400).json({ error: 'Нельзя удалить самого себя' });
        await User.findByIdAndDelete(req.params.id);
        res.json({ status: 'deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- СТАТИКА ---
app.get('/sw.js', (req, res) => {
    const filePath = __dirname + '/public/sw.js';
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error');
        const js = data.replace(/{{VER}}/g, APP_VERSION);
        res.set('Content-Type', 'application/javascript');
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(js);
    });
});
app.get('/', (req, res) => servePage(res, 'index.html'));
app.get('/index.html', (req, res) => servePage(res, 'index.html'));
app.get('/login.html', (req, res) => servePage(res, 'login.html'));
app.get('/map.html', (req, res) => servePage(res, 'map.html'));
app.get('/sales.html', (req, res) => servePage(res, 'sales.html'));
app.get('/competitors.html', (req, res) => servePage(res, 'competitors.html'));
app.get('/products.html', (req, res) => servePage(res, 'products.html'));
app.get('/report.html', (req, res) => servePage(res, 'report.html'));
app.get('/knowledge.html', (req, res) => servePage(res, 'knowledge.html'));
app.get('/reclamations.html', (req, res) => servePage(res, 'reclamations.html'));
app.get('/dealer.html', (req, res) => servePage(res, 'dealer.html'));
app.get('/users.html', (req, res) => servePage(res, 'users.html'));
app.use(express.static('public'));

const DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING;

// --- СХЕМЫ ---
const statusSchema = new mongoose.Schema({ value: String, label: String, color: String, isVisible: { type: Boolean, default: true }, sortOrder: { type: Number, default: 0 } });
const Status = mongoose.model('Status', statusSchema);

const productSchema = new mongoose.Schema({
    sku: String, name: String, is_liquid: { type: Boolean, default: true }, excel_alias: String, stock_qty: Number,
    characteristics: { class: String, thickness: String, bevel: String, size: String, package_area: String, package_qty: String, weight: String }
});
const Product = mongoose.model('Product', productSchema);

// --- НОВАЯ СХЕМА СЕКТОРОВ (КАСТОМНЫЕ) ---
const sectorSchema = new mongoose.Schema({ 
    name: String, 
    type: String // 'astana' (для DIY, Салонов) или 'region' (Север, Юг)
});
const Sector = mongoose.model('Sector', sectorSchema);

// --- ЗАПОЛНЕНИЕ СЕКТОРОВ ---
async function seedSectors() {
    const count = await Sector.countDocuments();
    if (count === 0) {
        console.log('Seeding sectors...');
        await Sector.insertMany([
            { name: 'DIY', type: 'astana' },
            { name: 'Салоны', type: 'astana' },
            { name: 'Рынки', type: 'astana' },
            { name: 'Объектные', type: 'astana' },
            { name: 'Север', type: 'region' },
            { name: 'Юг', type: 'region' },
            { name: 'Запад', type: 'region' },
            { name: 'Восток', type: 'region' },
            { name: 'Центр', type: 'region' }
        ]);
    }
}

const contactSchema = new mongoose.Schema({ name: String, position: String, contactInfo: String }, { _id: false }); 
const photoSchema = new mongoose.Schema({ description: String, photo_url: String, date: { type: Date, default: Date.now } }, { _id: false });
const additionalAddressSchema = new mongoose.Schema({ description: String, city: String, address: String }, { _id: false });
const visitSchema = new mongoose.Schema({ date: String, comment: String, isCompleted: { type: Boolean, default: false } }, { _id: false });
const posMaterialSchema = new mongoose.Schema({ name: String, quantity: Number }, { _id: false });
const dealerRequisitesSchema = new mongoose.Schema({
    organizationName: String,
    director: String,
    legalAddress: String,
    bin: String,
    iik: String,
    bank: String,
    bik: String,
    kbe: String,
    email: String
}, { _id: false });
const dealerLegalEntitySchema = new mongoose.Schema({
    type: { type: String, default: 'ТОО' },
    organizationName: String,
    director: String,
    legalAddress: String,
    bin: String,
    iik: String,
    bank: String,
    bik: String,
    kbe: String,
    email: String
}, { _id: false });
const competitorSchema = new mongoose.Schema({ brand: String, collection: String, price_opt: String, price_retail: String }, { _id: false });
const collectionItemSchema = new mongoose.Schema({ name: String, type: { type: String, default: 'standard' } }, { _id: false });
const compContactSchema = new mongoose.Schema({ name: String, position: String, phone: String }, { _id: false });

const compRefSchema = new mongoose.Schema({ 
    name: String, country: String, supplier: String, warehouse: String, 
    addresses: [additionalAddressSchema], logoUrl: String, 
    website: String, instagram: String, info: String, 
    storage_days: String, stock_info: String, reserve_days: String, 
    contacts: [compContactSchema], collections: [collectionItemSchema] 
});
const CompRef = mongoose.model('CompRef', compRefSchema);

const dealerSchema = new mongoose.Schema({ dealer_id: String, name: String, price_type: String, city: String, address: String, contacts: [contactSchema], bonuses: String, photos: [photoSchema], organizations: [String], requisites: dealerRequisitesSchema, legal_entities: [dealerLegalEntitySchema], contract: { isSigned: Boolean, date: String, number: String }, region_sector: String, hasPersonalPlan: { type: Boolean, default: false }, delivery: String, website: String, instagram: String, additional_addresses: [additionalAddressSchema], pos_materials: [posMaterialSchema], visits: [visitSchema], products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], latitude: Number, longitude: Number, status: { type: String, default: 'standard' }, avatarUrl: String, competitors: [competitorSchema], responsible: String, responsibleUserId: String });
const Dealer = mongoose.model('Dealer', dealerSchema);

const salesSchema = new mongoose.Schema({ month: String, group: String, dealerId: String, dealerName: String, plan: Number, fact: Number, isCustom: { type: Boolean, default: false }, ownerUserId: String 
}, { timestamps: true }); 
const Sales = mongoose.model('Sales', salesSchema);

const Knowledge = mongoose.model('Knowledge', new mongoose.Schema({ title: String, content: String }, { timestamps: true }));

async function connectToDB() {
    if (!DB_CONNECTION_STRING) return console.error("No DB String");
    try { 
        await mongoose.connect(DB_CONNECTION_STRING); 
        console.log('MongoDB Connected'); 
        await seedStatuses(); 
        await seedUsers(); 
        await seedSectors();
        await migrateLegacyDealerOwnership(); 
    } catch (e) { console.error(e); }
}

async function seedStatuses() { const count = await Status.countDocuments(); if (count === 0) { await Status.insertMany([{ value: 'active', label: 'Активный', color: '#198754', isVisible: true, sortOrder: 1 }, { value: 'standard', label: 'Стандарт', color: '#ffc107', isVisible: true, sortOrder: 2 }, { value: 'problem', label: 'Проблемный', color: '#dc3545', isVisible: true, sortOrder: 3 }, { value: 'potential', label: 'Потенциальный', color: '#0d6efd', isVisible: true, sortOrder: 4 }, { value: 'archive', label: 'Архив', color: '#6c757d', isVisible: false, sortOrder: 5 }]); } }
function convertToClient(doc) { if(!doc) return null; const obj = doc.toObject ? doc.toObject() : doc; obj.id = obj._id; delete obj._id; delete obj.__v; delete obj.password; if(obj.products) obj.products = obj.products.map(p => { if(p){p.id=p._id; delete p._id;} return p;}); if (obj.organization && (!obj.organizations || obj.organizations.length === 0)) { obj.organizations = [obj.organization]; } if (!Array.isArray(obj.legal_entities) || obj.legal_entities.length === 0) { const req = obj.requisites || {}; const orgs = Array.isArray(obj.organizations) ? obj.organizations.filter(Boolean) : []; const primaryName = req.organizationName || orgs[0] || obj.organization || ''; if (primaryName || Object.values(req).some(Boolean)) { obj.legal_entities = [{ type: /^ИП\b/i.test(primaryName) ? 'ИП' : (/^(ЧС|ФЛ|Физ)/i.test(primaryName) ? 'Частное лицо' : 'ТОО'), organizationName: primaryName, director: req.director || '', legalAddress: req.legalAddress || obj.address || '', bin: req.bin || '', iik: req.iik || '', bank: req.bank || '', bik: req.bik || '', kbe: req.kbe || '', email: req.email || '' }, ...orgs.slice(1).map(name => ({ type: /^ИП\b/i.test(name) ? 'ИП' : (/^(ЧС|ФЛ|Физ)/i.test(name) ? 'Частное лицо' : 'ТОО'), organizationName: name }))]; } else { obj.legal_entities = []; } } return obj; }

function getUserRole(req) { return req.user ? req.user.role : 'guest'; }
function getUserScope(req) { return req.user ? req.user.scope : 'none'; }
function isGlobalViewer(req) {
    return Boolean(
        req.user &&
        (
            req.user.role === 'marketing' ||
            (req.user.permissions && req.user.permissions.is_admin)
        )
    );
}
function getLegacyScopeFilter(scope) {
    if (scope === 'astana') {
        return {
            $or: [
                { responsible: 'regional_astana' },
                { city: { $regex: /астана/i } },
                { city: { $regex: /astana/i } }
            ]
        };
    }
    if (scope === 'regions') {
        return {
            $or: [
                { responsible: 'regional_regions' },
                {
                    $and: [
                        { city: { $not: { $regex: /астана/i } } },
                        { city: { $not: { $regex: /astana/i } } },
                        { responsible: { $ne: 'regional_astana' } }
                    ]
                }
            ]
        };
    }
    return {};
}

function getDealerFilter(req) {
    if (!req.user) return { _id: null };
    if (isGlobalViewer(req)) return {};

    if (req.user.role === 'manager') {
        return { responsibleUserId: String(req.user.id) };
    }

    const scope = getUserScope(req);
    if (scope === 'all') return {};
    if (scope === 'astana' || scope === 'regions') return getLegacyScopeFilter(scope);
    return { _id: null };
}

async function migrateLegacyDealerOwnership() {
    const missingOwner = {
        $or: [
            { responsibleUserId: { $exists: false } },
            { responsibleUserId: null },
            { responsibleUserId: '' }
        ]
    };

    for (const scope of ['astana', 'regions']) {
        const managers = await User.find({
            role: 'manager',
            scope,
            isBlocked: { $ne: true },
            'permissions.is_admin': { $ne: true }
        }).select('_id fullName username').lean();

        // Автоматически переносим старых дилеров только когда в зоне ровно один менеджер.
        // Если менеджеров несколько, дилеры остаются неназначенными и видны админу/маркетингу
        // до ручного выбора конкретного ответственного в карточке.
        if (managers.length !== 1) continue;

        const managerId = String(managers[0]._id);
        await Dealer.updateMany(
            { $and: [missingOwner, getLegacyScopeFilter(scope)] },
            { $set: { responsibleUserId: managerId } }
        );

        // Для старых месяцев, где в зоне был только один менеджер,
        // переносим зональный план в его персональный план один раз.
        const legacyPlanId = scope === 'astana' ? 'PLAN_astana_all' : 'PLAN_regions_all';
        const managerPlanId = `PLAN_manager_${managerId}`;
        const legacyPlans = await Sales.find({ dealerId: legacyPlanId }).lean();
        for (const legacy of legacyPlans) {
            await Sales.updateOne(
                { month: legacy.month, dealerId: managerPlanId },
                {
                    $setOnInsert: {
                        month: legacy.month,
                        group: 'PLAN',
                        dealerId: managerPlanId,
                        dealerName: `Plan manager ${managerId}`,
                        isCustom: false,
                        plan: Number(legacy.plan) || 0,
                        fact: 0
                    }
                },
                { upsert: true }
            );
        }
    }
}

app.get('/api/auth/me', (req, res) => { res.json({ user: req.user }); });

// --- API ROUTES ---

app.get('/api/managers', requireAnyPermission('can_view_dealers', 'can_view_sales', 'can_edit_dealer'), async (req, res) => {
    try {
        const managers = await User.find({
            role: 'manager',
            isBlocked: { $ne: true },
            'permissions.is_admin': { $ne: true }
        })
            .select('_id username fullName scope')
            .sort({ fullName: 1, username: 1 })
            .lean();

        res.json(managers.map(user => ({
            id: String(user._id),
            username: user.username,
            fullName: user.fullName || user.username,
            scope: user.scope || 'all'
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/statuses', requireAnyPermission('can_view_dealers', 'can_view_map'), async (req, res) => { const s = await Status.find().sort({sortOrder: 1}).lean(); res.json(s.map(convertToClient)); });
app.post('/api/statuses', requirePermission('can_edit_dealer'), async (req, res) => { try { const s = new Status(req.body); await s.save(); res.json(convertToClient(s)); } catch(e){ res.status(500).json({error:e.message}); } });
app.put('/api/statuses/:id', requirePermission('can_edit_dealer'), async (req, res) => { try { await Status.findByIdAndUpdate(req.params.id, req.body); res.json({status:'ok'}); } catch(e){ res.status(500).json({error:e.message}); } });
app.delete('/api/statuses/:id', requirePermission('can_edit_dealer'), async (req, res) => { await Status.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });

// --- API СЕКТОРОВ ---
app.get('/api/sectors', requireAnyPermission('can_view_dealers', 'can_view_sales'), async (req, res) => { const list = await Sector.find().sort({name:1}); res.json(list.map(convertToClient)); });
app.post('/api/sectors', requirePermission('can_edit_dealer'), async (req, res) => { const s = new Sector(req.body); await s.save(); res.json(convertToClient(s)); });
app.delete('/api/sectors/:id', requirePermission('can_edit_dealer'), async (req, res) => { await Sector.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });

app.get('/api/dealers', requireAnyPermission('can_view_dealers', 'can_view_map', 'can_view_sales', 'can_view_competitors', 'can_view_reclamations'), async (req, res) => { try { let filter = getDealerFilter(req); if (req.query.scope === 'all' && req.user.permissions && req.user.permissions.is_admin) { filter = {}; } if (req.query.context === 'sales' && hasPermission(req, 'can_view_sales')) { filter = {}; } let query = Dealer.find(filter); if (req.query.view === 'map') query = query.select('_id name city address contacts latitude longitude status responsible responsibleUserId'); else query = query.select('-photos -visits -products -avatarUrl'); const dealers = await query.lean(); res.json(dealers.map(d => ({ id: d._id, ...d }))); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/dealers/:id/avatar', requirePermission('can_view_dealers'), async (req, res) => {
    try {
        const d = await Dealer.findOne({ _id: req.params.id, ...getDealerFilter(req) }).select('avatarUrl').lean();
        if (!d) return res.status(404).json({ error: 'Дилер не найден' });
        res.set('Cache-Control', 'private, max-age=900');
        res.json({ avatarUrl: d.avatarUrl || '' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/dealers/:id', requirePermission('can_view_dealers'), async (req, res) => { try { const d = await Dealer.findOne({ _id: req.params.id, ...getDealerFilter(req) }).populate('products'); res.json(convertToClient(d)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/dealers', requirePermission('can_create_dealer'), async (req, res) => { try {
    const scope = getUserScope(req);
    if (req.user.role === 'manager' && !isGlobalViewer(req)) {
        req.body.responsibleUserId = String(req.user.id);
        if (scope === 'astana') req.body.responsible = 'regional_astana';
        if (scope === 'regions') req.body.responsible = 'regional_regions';
    }
    const d = new Dealer(req.body);
    await d.save();
    res.status(201).json(convertToClient(d));
} catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/dealers/:id/visits', requirePermission('can_manage_visits'), async (req, res) => {
    try {
        const dealer = await Dealer.findOne({ _id: req.params.id, ...getDealerFilter(req) });
        if (!dealer) return res.status(404).json({ error: 'Дилер не найден' });

        const visit = {
            date: req.body.date || new Date().toISOString().slice(0, 10),
            comment: String(req.body.comment || '').trim(),
            isCompleted: req.body.isCompleted !== false
        };
        if (!visit.comment) return res.status(400).json({ error: 'Комментарий визита обязателен' });

        dealer.visits = dealer.visits || [];
        dealer.visits.push(visit);
        await dealer.save();

        res.status(201).json({ status: 'ok', visit });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dealers/:id/visits/:index', requirePermission('can_manage_visits'), async (req, res) => {
    try {
        const dealer = await Dealer.findOne({ _id: req.params.id, ...getDealerFilter(req) });
        if (!dealer) return res.status(404).json({ error: 'Дилер не найден' });

        const index = Number(req.params.index);
        if (!Number.isInteger(index) || index < 0 || !dealer.visits || !dealer.visits[index]) {
            return res.status(404).json({ error: 'Визит не найден' });
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'isCompleted')) {
            dealer.visits[index].isCompleted = Boolean(req.body.isCompleted);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'comment')) {
            dealer.visits[index].comment = String(req.body.comment || '').trim();
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'date')) {
            dealer.visits[index].date = String(req.body.date || '');
        }

        await dealer.save();
        res.json({ status: 'ok', visit: dealer.visits[index] });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dealers/:id', requirePermission('can_edit_dealer'), async (req, res) => {
    try {
        if (req.user.role === 'manager' && !isGlobalViewer(req)) {
            req.body.responsibleUserId = String(req.user.id);
            if (req.user.scope === 'astana') req.body.responsible = 'regional_astana';
            if (req.user.scope === 'regions') req.body.responsible = 'regional_regions';
        }

        const updated = await Dealer.findOneAndUpdate(
            { _id: req.params.id, ...getDealerFilter(req) },
            req.body,
            { new: true }
        );
        if (!updated) return res.status(404).json({ error: 'Дилер не найден' });
        res.json({status:'ok'});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.delete('/api/dealers/:id', requirePermission('can_delete_dealer'), async (req, res) => { try { await Dealer.findOneAndDelete({ _id: req.params.id, ...getDealerFilter(req) }); res.json({status:'deleted'}); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/dealers/:id/products', requireAnyPermission('can_view_dealers', 'can_view_products'), async (req, res) => { const d = await Dealer.findOne({ _id: req.params.id, ...getDealerFilter(req) }).populate('products'); if (!d) return res.status(404).json({ error: 'Дилер не найден' }); res.json(d.products.map(convertToClient)); });
app.put('/api/dealers/:id/products', requirePermission('can_edit_matrix'), async (req, res) => { const d = await Dealer.findOneAndUpdate({ _id: req.params.id, ...getDealerFilter(req) }, { products: req.body.productIds }); if (!d) return res.status(404).json({ error: 'Дилер не найден' }); res.json({status:'ok'}); });
app.get('/api/products', requireAnyPermission('can_view_products', 'can_view_report', 'can_view_reclamations', 'can_view_dealers'), async (req, res) => { const s = new RegExp(req.query.search||'', 'i'); const p = await Product.find({$or:[{sku:s},{name:s}]}).sort({sku:1}).lean(); res.json(p.map(x=>{x.id=x._id;return x;})); });
app.post('/api/products', requirePermission('can_manage_products'), async (req, res) => { const p = new Product(req.body); await p.save(); res.json(convertToClient(p)); });
app.put('/api/products/:id', requirePermission('can_manage_products'), async (req, res) => { const p = await Product.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(p)); });
app.delete('/api/products/:id', requirePermission('can_manage_products'), async (req, res) => { await Product.findByIdAndDelete(req.params.id); res.json({}); });
app.post('/api/admin/import-catalog', requirePermission('can_manage_products'), async (req, res) => { res.json({status: 'ok'}); });
app.get('/api/matrix', requireAnyPermission('can_view_products', 'can_view_report'), async (req, res) => { try { const [prods, dealers] = await Promise.all([ Product.find().select('sku name').sort({sku:1}).lean(), Dealer.find(getDealerFilter(req)).select('_id name city responsible products pos_materials').lean() ]); const map = new Map(); dealers.forEach(d => map.set(d._id.toString(), new Set((d.products||[]).map(String)))); const posList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"]; const matrix = prods.map(p => ({ sku: p.sku, name: p.name, type: 'product', dealers: dealers.map(d => ({ value: map.get(d._id.toString()).has(p._id.toString()) ? 1 : 0, is_pos: false })) })); posList.forEach(pn => { matrix.push({ sku: "POS", name: pn, type: 'pos', dealers: dealers.map(d => ({ value: (d.pos_materials||[]).find(m=>m.name===pn)?.quantity||0, is_pos: true })) }); }); res.json({ headers: dealers.map(d=>({id:d._id, name:d.name, city:d.city, responsible:d.responsible})), matrix }); } catch (e) { res.status(500).json({error:e.message}); } });

app.get('/api/sales', requirePermission('can_view_sales'), async (req, res) => {
    try {
        const { month, months } = req.query;
        let filter = month ? { month } : {};
        if (!month && months) {
            const count = Math.max(1, Math.min(24, Number(months) || 6));
            const now = new Date();
            now.setUTCDate(1);
            now.setUTCMonth(now.getUTCMonth() - (count - 1));
            const minMonth = now.toISOString().slice(0, 7);
            filter = { month: { $gte: minMonth } };
        }
        const scope = getUserScope(req);
        const companySalesView = req.query.context === 'sales' && hasPermission(req, 'can_view_sales');

        if (!companySalesView && !isGlobalViewer(req) && req.user.role === 'manager') {
            const dealers = await Dealer.find(getDealerFilter(req)).select('_id').lean();
            const dealerIds = dealers.map(d => String(d._id));
            const personalPlanIds = dealerIds.map(id => `PLAN_vip_${id}`);
            const managerPlanId = `PLAN_manager_${req.user.id}`;
            const zonePlanId = scope === 'astana'
                ? 'PLAN_astana_all'
                : scope === 'regions'
                    ? 'PLAN_regions_all'
                    : 'PLAN_total_all';

            filter = {
                $and: [
                    filter,
                    {
                        $or: [
                            { isCustom: { $ne: true }, dealerId: { $in: dealerIds } },
                            { isCustom: { $ne: true }, dealerId: { $in: personalPlanIds } },
                            { isCustom: { $ne: true }, dealerId: { $in: [managerPlanId, zonePlanId] } },
                            { isCustom: true, ownerUserId: String(req.user.id) }
                        ]
                    }
                ]
            };
        } else if (!companySalesView && !isGlobalViewer(req) && scope !== 'all') {
            const dealers = await Dealer.find(getDealerFilter(req)).select('_id').lean();
            const dealerIds = dealers.map(d => String(d._id));
            const personalPlanIds = dealerIds.map(id => `PLAN_vip_${id}`);

            const sectorType = scope === 'astana' ? 'astana' : 'region';
            const sectors = await Sector.find({ type: sectorType }).select('name').lean();
            const slug = name => String(name || '').trim().replace(/\s+/g, '_').toLowerCase();
            const groupKeys = scope === 'astana'
                ? [...sectors.map(s => `astana_${slug(s.name)}`), 'regional_astana']
                : [...sectors.map(s => `sector_${slug(s.name)}`), 'regional_regions'];

            const groupPlanIds = groupKeys.map(key => `PLAN_${key}`);
            groupPlanIds.push(scope === 'astana' ? 'PLAN_astana_all' : 'PLAN_regions_all');
            const allowedPlanIds = [...personalPlanIds, ...groupPlanIds];

            filter = {
                $and: [
                    filter,
                    {
                        $or: [
                            { isCustom: { $ne: true }, dealerId: { $in: dealerIds } },
                            { isCustom: { $ne: true }, dealerId: { $in: allowedPlanIds } },
                            { isCustom: true, group: { $in: groupKeys } }
                        ]
                    }
                ]
            };
        }

        const s = await Sales.find(filter).lean();
        res.json(s);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== ИСПРАВЛЕННЫЙ БЛОК: СОХРАНЕНИЕ, АГРЕГАЦИЯ И УДАЛЕНИЕ =====
app.post('/api/sales', async (req, res) => {
    const canFact = hasPermission(req, 'can_edit_sales_fact');
    const canPlan = hasPermission(req, 'can_edit_sales_plan');
    if (!canFact && !canPlan) {
        return res.status(403).json({ error: 'Недостаточно прав для изменения продаж' });
    }

    const now = new Date();
    const scope = req.user ? req.user.scope : 'none';
    const companySalesView = req.query.context === 'sales' && hasPermission(req, 'can_view_sales');
    const managerRestricted = Boolean(req.user && req.user.role === 'manager' && !isGlobalViewer(req) && !companySalesView);
    let managerDealerIds = null;
    if (managerRestricted) {
        const dealers = await Dealer.find(getDealerFilter(req)).select('_id').lean();
        managerDealerIds = new Set(dealers.map(d => String(d._id)));
    }

    // 1. Агрегируем дубликаты из присланных данных (если ввели несколько с одинаковым именем)
    const aggregatedData = {};
    (Array.isArray(req.body.data) ? req.body.data : []).forEach(i => {
        const row = { ...i };

        if (managerRestricted) {
            const dealerId = String(row.dealerId || '');
            if (row.isCustom) {
                row.ownerUserId = String(req.user.id);
            } else if (dealerId.startsWith('PLAN_manager_')) {
                if (dealerId !== `PLAN_manager_${req.user.id}`) return;
            } else if (dealerId.startsWith('PLAN_vip_')) {
                const ownedDealerId = dealerId.replace('PLAN_vip_', '');
                if (!managerDealerIds.has(ownedDealerId)) return;
            } else if (dealerId.startsWith('PLAN_')) {
                return;
            } else if (!managerDealerIds.has(dealerId)) {
                return;
            }
        }
        if (!canFact) delete row.fact;
        if (!canPlan) delete row.plan;

        const key = row.isCustom ? `custom_${row.group}_${row.dealerName}` : `dealer_${row.dealerId}`;
        if (!aggregatedData[key]) {
            aggregatedData[key] = row;
        } else {
            if (canFact) aggregatedData[key].fact = (Number(aggregatedData[key].fact) || 0) + (Number(row.fact) || 0);
            if (canPlan) aggregatedData[key].plan = (Number(aggregatedData[key].plan) || 0) + (Number(row.plan) || 0);
        }
    });

    // 2. Обновляем/Добавляем записи
    const ops = Object.values(aggregatedData).map(i => {
        const filter = { month: req.body.month };
        if (i.isCustom) {
            filter.isCustom = true;
            filter.dealerName = i.dealerName;
            if (i.group) filter.group = i.group; 
        } else {
            filter.dealerId = i.dealerId;
        }

        return {
            updateOne: { 
                filter: filter, 
                update: { $set: { ...i, updatedAt: now } }, 
                upsert: true 
            } 
        };
    }); 
    
    if (ops.length > 0) {
        await Sales.bulkWrite(ops); 
    }

    // 3. Умное удаление (Очистка разовых продаж)
    // Определяем, к каким группам имеет доступ текущий пользователь
    let groupFilter = {};
    if (managerRestricted) {
        groupFilter = { ownerUserId: String(req.user.id) };
    } else if (!companySalesView && scope === 'astana') {
        const sectors = await Sector.find({ type: 'astana' });
        groupFilter = { group: { $in: sectors.map(s => s.name) } };
    } else if (!companySalesView && scope === 'regions') {
        const sectors = await Sector.find({ type: 'region' });
        groupFilter = { group: { $in: sectors.map(s => s.name) } };
    }
    // Если admin или all, groupFilter остается пустым (имеет доступ ко всем)

    // Ищем все разовые продажи за этот месяц в базе (в рамках доступа пользователя)
    const dbCustomSales = await Sales.find({ 
        month: req.body.month, 
        isCustom: true, 
        ...groupFilter 
    });

    const idsToDelete = [];
    const incomingArray = Object.values(aggregatedData);

    if (canFact) dbCustomSales.forEach(dbSale => {
        // Проверяем, осталась ли эта продажа в присланных данных
        const existsInIncoming = incomingArray.some(
            i => i.isCustom && i.group === dbSale.group && i.dealerName === dbSale.dealerName
        );
        
        // Если в присланных данных её больше нет — помечаем на удаление
        if (!existsInIncoming) {
            idsToDelete.push(dbSale._id);
        }
    });

    // Удаляем всё лишнее
    if (canFact && idsToDelete.length > 0) {
        await Sales.deleteMany({ _id: { $in: idsToDelete } });
    }

    res.json({status:'ok'}); 
});
// ===================================================================

app.get('/api/competitors-ref', requirePermission('can_view_competitors'), async (req, res) => { const l = await CompRef.find().sort({name:1}); res.json(l.map(convertToClient)); });
app.post('/api/competitors-ref', requirePermission('can_manage_competitors'), async (req, res) => { const c = new CompRef(req.body); await c.save(); res.json(convertToClient(c)); });
app.put('/api/competitors-ref/:id', requirePermission('can_manage_competitors'), async (req, res) => { await CompRef.findByIdAndUpdate(req.params.id, req.body); res.json({status:'ok'}); });
app.delete('/api/competitors-ref/:id', requirePermission('can_manage_competitors'), async (req, res) => { await CompRef.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });
app.get('/api/knowledge', requirePermission('can_view_knowledge'), async (req, res) => { const l = await Knowledge.find().sort({title:1}); res.json(l.map(convertToClient)); });
app.get('/api/knowledge/:id', requirePermission('can_view_knowledge'), async (req, res) => { res.json(convertToClient(await Knowledge.findById(req.params.id))); });
app.post('/api/knowledge', requirePermission('can_manage_knowledge'), async (req, res) => { const a = new Knowledge(req.body); await a.save(); res.json(convertToClient(a)); });
app.put('/api/knowledge/:id', requirePermission('can_manage_knowledge'), async (req, res) => { const a = await Knowledge.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(a)); });
app.delete('/api/knowledge/:id', requirePermission('can_manage_knowledge'), async (req, res) => { await Knowledge.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });
app.get('/api/tasks', requirePermission('can_view_dashboard'), async (req, res) => { try { const data = await Dealer.find(getDealerFilter(req)).select('name visits status responsible').lean(); res.json(data.map(d => ({ id: d._id, name: d.name, status: d.status, visits: d.visits || [], responsible: d.responsible }))); } catch (e) { res.status(500).json([]); } });

async function getScopedDealerIds(req) {
    if (isGlobalViewer(req)) return null;
    const dealers = await Dealer.find(getDealerFilter(req)).select('_id').lean();
    return dealers.map(d => String(d._id));
}

// ==========================================
// РЕКВИЗИТЫ И РЕКЛАМАЦИИ
// ==========================================
const reclamationSchema = new mongoose.Schema({
    dealerId: String,
    dealerName: String,
    date: String,
    productName: String,
    invoiceNumber: String,
    purchaseDate: String,
    clientName: String,
    clientPhone: String,
    address: String,
    floor: String,
    houseType: String,
    totalArea: String,
    purchasedVolume: String,
    batchNumbers: [String],
    baseType: String,
    underlayment: String,
    warmFloor: String,
    installer: String,
    
    // --- НОВЫЕ ТЕХНИЧЕСКИЕ ПОЛЯ ---
    acclimatization: String, 
    storageMethod: String,
    dryingTime: String,
    floorFlatness: String,
// --- НОВЫЕ ПОЛЯ ---
    defectMoment: String,       // Момент выявления
    compensationAmount: Number, // Сумма компенсации
    internalNotes: String,
    
    description: String,
    clientDemand: String,
    resolution: String,
    photos: [{ photo_url: String }]
}, { timestamps: true });
const Reclamation = mongoose.model('Reclamation', reclamationSchema);

app.get('/api/reclamations/dashboard', requirePermission('can_view_reclamations'), async (req, res) => {
    try {
        const dealerIds = await getScopedDealerIds(req);
        const query = {
            $or: [
                { resolution: { $exists: false } },
                { resolution: null },
                { resolution: '' }
            ]
        };
        if (dealerIds) query.dealerId = { $in: dealerIds };

        const list = await Reclamation.find(query)
            .select('dealerId dealerName resolution createdAt date')
            .sort({ createdAt: -1 })
            .lean();
        res.json(list.map(convertToClient));
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/reclamations', requirePermission('can_view_reclamations'), async (req, res) => {
    try {
        const dealerIds = await getScopedDealerIds(req);
        const pipeline = [];
        if (dealerIds) pipeline.push({ $match: { dealerId: { $in: dealerIds } } });
        pipeline.push(
            { $sort: { createdAt: -1 } },
            { $project: {
                dealerId: 1,
                dealerName: 1,
                date: 1,
                productName: 1,
                purchasedVolume: 1,
                description: 1,
                clientDemand: 1,
                resolution: 1,
                createdAt: 1,
                updatedAt: 1,
                photoCount: { $size: { $ifNull: ['$photos', []] } }
            } }
        );
        const list = await Reclamation.aggregate(pipeline);
        res.json(list.map(item => ({ ...item, id: String(item._id), _id: undefined })));
    } catch(e) { res.status(500).json({error: e.message}); }
});
app.get('/api/reclamations/:id', requirePermission('can_view_reclamations'), async (req, res) => {
    try {
        const dealerIds = await getScopedDealerIds(req);
        const query = { _id: req.params.id };
        if (dealerIds) query.dealerId = { $in: dealerIds };
        const item = await Reclamation.findOne(query).lean();
        if (!item) return res.status(404).json({ error: 'Рекламация не найдена' });
        res.json(convertToClient(item));
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/reclamations', requirePermission('can_manage_reclamations'), async (req, res) => {
    try { 
        const r = new Reclamation(req.body); 
        await r.save(); 
        res.json(convertToClient(r)); 
    } catch(e) { res.status(500).json({error: e.message}); }
});
app.put('/api/reclamations/:id', requirePermission('can_manage_reclamations'), async (req, res) => {
    try { 
        const r = await Reclamation.findByIdAndUpdate(req.params.id, req.body, { new: true }); 
        res.json(convertToClient(r)); 
    } catch(e) { res.status(500).json({error: e.message}); }
});
app.delete('/api/reclamations/:id', requirePermission('can_manage_reclamations'), async (req, res) => {
    try { 
        await Reclamation.findByIdAndDelete(req.params.id); 
        res.json({status: 'deleted'}); 
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.listen(PORT, () => { console.log(`Server port ${PORT}`); connectToDB(); });
