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
    role: { type: String, enum: ['manager', 'guest', 'marketing', 'workshop'], default: 'manager' },
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
        can_view_workshop: { type: Boolean, default: false },
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
        can_manage_workshop: { type: Boolean, default: false },
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
        can_view_workshop: true,
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
        can_manage_workshop: true,
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
app.get('/workshop.html', (req, res) => servePage(res, 'workshop.html'));
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

// ==========================================
// ЦЕХ: материалы, рецептуры, производство и движения
// ==========================================
const workshopMaterialSchema = new mongoose.Schema({
    code: String,
    name: { type: String, required: true },
    category: { type: String, default: 'consumable' },
    unit: { type: String, default: 'шт' },
    purchaseUnit: String,
    purchaseUnitSize: { type: Number, default: 1 },
    stockQty: { type: Number, default: 0 },
    minQty: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    note: String
}, { timestamps: true });
const WorkshopMaterial = mongoose.model('WorkshopMaterial', workshopMaterialSchema);

const workshopRecipeMaterialSchema = new mongoose.Schema({
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopMaterial' },
    qty: { type: Number, default: 0 },
    mode: { type: String, enum: ['strict', 'estimate'], default: 'strict' }
}, { _id: false });

const workshopRecipeComponentSchema = new mongoose.Schema({
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopRecipe' },
    qty: { type: Number, default: 0 }
}, { _id: false });

const workshopRecipeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    outputType: { type: String, enum: ['sample', 'stand', 'sign', 'other'], default: 'sample' },
    sku: String,
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    sideA: String,
    sideB: String,
    planksPerUnit: { type: Number, default: 0 },
    packQtyOverride: { type: Number, default: 0 },
    stockQty: { type: Number, default: 0 },
    minStockQty: { type: Number, default: 0 },
    matrixPosName: String,
    materials: [workshopRecipeMaterialSchema],
    components: [workshopRecipeComponentSchema],
    active: { type: Boolean, default: true },
    note: String
}, { timestamps: true });
const WorkshopRecipe = mongoose.model('WorkshopRecipe', workshopRecipeSchema);

const workshopLaminateStockSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', unique: true, index: true },
    planksQty: { type: Number, default: 0 }
}, { timestamps: true });
const WorkshopLaminateStock = mongoose.model('WorkshopLaminateStock', workshopLaminateStockSchema);

const workshopMovementSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    type: { type: String, required: true },
    entityType: { type: String, enum: ['laminate', 'material', 'finished'], required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopMaterial' },
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopRecipe' },
    dealer: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer' },
    direction: { type: String, enum: ['in', 'out', 'neutral'], default: 'neutral' },
    qty: { type: Number, default: 0 },
    unit: String,
    serviceMemoNumber: String,
    note: String,
    meta: mongoose.Schema.Types.Mixed,
    createdBy: { id: String, name: String }
}, { timestamps: true });
const WorkshopMovement = mongoose.model('WorkshopMovement', workshopMovementSchema);

const workshopOperationSchema = new mongoose.Schema({
    type: String,
    qty: Number,
    note: String
}, { _id: false });

const workshopProductionSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopRecipe' },
    memo: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopMemo' },
    memoLineId: String,
    serviceMemoNumber: String,
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    acceptedPacks: { type: Number, default: 0 },
    acceptedLoosePlanks: { type: Number, default: 0 },
    packQty: { type: Number, default: 0 },
    totalAcceptedPlanks: { type: Number, default: 0 },
    outputQty: { type: Number, default: 0 },
    standardPlanksPerUnit: { type: Number, default: 0 },
    actualPlanksPerUnit: { type: Number, default: 0 },
    customNormReason: String,
    consumedPlanks: { type: Number, default: 0 },
    scrapPlanks: { type: Number, default: 0 },
    operations: [workshopOperationSchema],
    note: String,
    createdBy: { id: String, name: String }
}, { timestamps: true });
const WorkshopProduction = mongoose.model('WorkshopProduction', workshopProductionSchema);

const workshopMemoLineSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopRecipe' },
    requestedPacks: { type: Number, default: 0 },
    plannedOutputQty: { type: Number, default: 0 },
    plannedRemainderPlanks: { type: Number, default: 0 },
    packQty: { type: Number, default: 0 },
    planksPerUnit: { type: Number, default: 0 },
    actualProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    deliveredPacks: { type: Number, default: 0 },
    checked: { type: Boolean, default: false },
    isMatch: { type: Boolean, default: false },
    discrepancyReason: String
});

const workshopMemoSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true, trim: true },
    date: { type: Date, default: Date.now },
    status: { type: String, enum: ['created', 'mismatch', 'accepted', 'cancelled'], default: 'created' },
    lines: [workshopMemoLineSchema],
    note: String,
    signedBy: String,
    createdBy: { id: String, name: String },
    acceptedAt: Date,
    acceptedBy: { id: String, name: String },
    postedAt: Date,
    receiptAttempts: [mongoose.Schema.Types.Mixed]
}, { timestamps: true });
const WorkshopMemo = mongoose.model('WorkshopMemo', workshopMemoSchema);

const workshopDealerAssetSchema = new mongoose.Schema({
    dealer: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer', index: true },
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopRecipe', index: true },
    qty: { type: Number, default: 0 }
}, { timestamps: true });
workshopDealerAssetSchema.index({ dealer: 1, recipe: 1 }, { unique: true });
const WorkshopDealerAsset = mongoose.model('WorkshopDealerAsset', workshopDealerAssetSchema);

const workshopStocktakeLineSchema = new mongoose.Schema({
    entityType: String,
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopMaterial' },
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopRecipe' },
    systemQty: Number,
    actualQty: Number,
    delta: Number,
    note: String
}, { _id: false });

const workshopStocktakeSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    lines: [workshopStocktakeLineSchema],
    note: String,
    createdBy: { id: String, name: String }
}, { timestamps: true });
const WorkshopStocktake = mongoose.model('WorkshopStocktake', workshopStocktakeSchema);

function workshopNumber(value) {
    const n = Number(String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/)?.[0]);
    return Number.isFinite(n) ? n : 0;
}

function workshopPackQty(product, override = 0) {
    const direct = workshopNumber(override);
    if (direct > 0) return direct;
    return Math.max(0, Math.round(workshopNumber(product?.characteristics?.package_qty)));
}

function workshopUser(req) {
    return {
        id: req.user?.id || '',
        name: req.user?.fullName || req.user?.username || 'Сотрудник'
    };
}

async function workshopChangeLaminate(productId, delta) {
    const stock = await WorkshopLaminateStock.findOneAndUpdate(
        { product: productId },
        { $inc: { planksQty: delta } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (stock.planksQty < -0.0001) {
        await WorkshopLaminateStock.updateOne({ _id: stock._id }, { $inc: { planksQty: -delta } });
        throw new Error('Недостаточно ламината в остатках цеха');
    }
    if (stock.planksQty < 0) {
        stock.planksQty = 0;
        await stock.save();
    }
    return stock;
}

async function workshopChangeMaterial(materialId, delta) {
    const item = await WorkshopMaterial.findByIdAndUpdate(materialId, { $inc: { stockQty: delta } }, { new: true });
    if (!item) throw new Error('Материал не найден');
    if (item.stockQty < -0.0001) {
        await WorkshopMaterial.updateOne({ _id: item._id }, { $inc: { stockQty: -delta } });
        throw new Error(`Недостаточно материала «${item.name}»`);
    }
    if (item.stockQty < 0) {
        item.stockQty = 0;
        await item.save();
    }
    return item;
}

async function workshopChangeRecipe(recipeId, delta) {
    const item = await WorkshopRecipe.findByIdAndUpdate(recipeId, { $inc: { stockQty: delta } }, { new: true });
    if (!item) throw new Error('Изделие не найдено');
    if (item.stockQty < -0.0001) {
        await WorkshopRecipe.updateOne({ _id: item._id }, { $inc: { stockQty: -delta } });
        throw new Error(`Недостаточно готовых изделий «${item.name}»`);
    }
    if (item.stockQty < 0) {
        item.stockQty = 0;
        await item.save();
    }
    return item;
}


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

const dealerSchema = new mongoose.Schema({ dealer_id: String, name: String, price_type: String, city: String, address: String, contacts: [contactSchema], bonuses: String, photos: [photoSchema], organizations: [String], requisites: dealerRequisitesSchema, legal_entities: [dealerLegalEntitySchema], contract: { isSigned: Boolean, date: String, number: String }, region_sector: String, hasPersonalPlan: { type: Boolean, default: false }, delivery: String, website: String, instagram: String, additional_addresses: [additionalAddressSchema], pos_materials: [posMaterialSchema], visits: [visitSchema], products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], latitude: Number, longitude: Number, status: { type: String, default: 'standard' }, avatarUrl: String, competitors: [competitorSchema], responsible: String, responsibleUserId: String, responsibleAssignmentSource: String }, { timestamps: true });
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
        await seedWorkshopMaterials();
        await seedWorkshopRecipes(); 
    } catch (e) { console.error(e); }
}

async function seedWorkshopMaterials() {
    const defaults = [
        { code: 'PLYWOOD-SHEET', name: 'Фанера для расчесок', category: 'raw_sheet', unit: 'лист', purchaseUnit: 'лист', purchaseUnitSize: 1, note: '1 лист = 2 расчески из фанеры' },
        { code: 'LDSP-SHEET', name: 'ЛДСП для задних стенок', category: 'raw_sheet', unit: 'лист', purchaseUnit: 'лист', purchaseUnitSize: 1, note: 'Норма раскроя: 600 мм — 4 стенки/лист; 800 мм — 3 стенки/лист' },
        { code: 'ACRYLIC-SIGN', name: 'Табличка из оргстекла (полиграфия)', category: 'stand_component', unit: 'шт', purchaseUnit: 'шт', purchaseUnitSize: 1 },
        { code: 'STICKER-600', name: 'Наклейка 600 мм', category: 'stand_component', unit: 'шт', purchaseUnit: 'шт', purchaseUnitSize: 1 },
        { code: 'STICKER-800', name: 'Наклейка 800 мм', category: 'stand_component', unit: 'шт', purchaseUnit: 'шт', purchaseUnitSize: 1 },
        { code: 'FILM', name: 'Плёнка для стендов', category: 'consumable', unit: 'м', purchaseUnit: 'рулон', purchaseUnitSize: 1 },
        { code: 'EDGE', name: 'Кромка для стенок', category: 'consumable', unit: 'м', purchaseUnit: 'бухта', purchaseUnitSize: 200, note: '1 бухта = 200 м. Расход учитывать ориентировочно: возможен брак.' },
        { code: 'EDGE-GLUE', name: 'Клей для кромки', category: 'consumable', unit: 'мешок', purchaseUnit: 'мешок', purchaseUnitSize: 1 },
        { code: 'CUTTER', name: 'Фреза', category: 'tool', unit: 'шт', purchaseUnit: 'шт', purchaseUnitSize: 1 }
    ];
    for (const item of defaults) {
        await WorkshopMaterial.updateOne(
            { code: item.code },
            {
                $set: {
                    name: item.name,
                    category: item.category,
                    unit: item.unit,
                    purchaseUnit: item.purchaseUnit || item.unit,
                    purchaseUnitSize: item.purchaseUnitSize || 1,
                    note: item.note || ''
                },
                $setOnInsert: { stockQty: 0, minQty: 0, active: true }
            },
            { upsert: true }
        );
    }
}

async function seedWorkshopRecipes() {
    const arabica = await Product.findOne({
        name: /Арабика/i,
        sku: /702/i
    }).lean();
    if (arabica) {
        const exists = await WorkshopRecipe.findOne({ product: arabica._id, outputType: 'sample' }).lean();
        if (!exists) {
            await WorkshopRecipe.create({
                name: `Планшет ${arabica.sku || ''} ${arabica.name || 'Дуб Арабика'}`.trim(),
                outputType: 'sample',
                sku: `SAMPLE-${arabica.sku || '702'}`,
                product: arabica._id,
                sideA: 'Палубная укладка',
                sideB: 'Ёлочка',
                planksPerUnit: 24,
                stockQty: 0,
                active: true,
                note: 'Норма: 24 планки на двухсторонний планшет. 4 упаковки по 30 планок = 5 планшетов без отхода.'
            });
        }
    }

    const materialList = await WorkshopMaterial.find({
        code: { $in: ['PLYWOOD-SHEET','LDSP-SHEET','ACRYLIC-SIGN','STICKER-600','STICKER-800','EDGE'] }
    }).lean();
    const materialByCode = new Map(materialList.map(item => [item.code, item]));

    const fixedRecipes = [
        {
            sku: 'POS-COMB-PLY',
            name: 'Расческа из фанеры',
            outputType: 'other',
            matrixPosName: 'РФ-2 - Расческа из фанеры',
            materials: [{ code:'PLYWOOD-SHEET', qty:0.5, mode:'strict' }],
            note: '1 лист фанеры = 2 расчески'
        },
        {
            sku: 'POS-ACRYLIC',
            name: 'Табличка из оргстекла',
            outputType: 'sign',
            matrixPosName: 'Табличка - Табличка орг.стекло',
            materials: [{ code:'ACRYLIC-SIGN', qty:1, mode:'strict' }],
            note: 'Оргстекло заказывается готовыми штуками в полиграфии'
        },
        {
            sku: 'POS-BACK-600',
            name: 'Стенка 600 мм',
            outputType: 'other',
            matrixPosName: 'С600 - 600мм задняя стенка',
            materials: [
                { code:'LDSP-SHEET', qty:0.25, mode:'strict' },
                { code:'EDGE', qty:0, mode:'estimate' }
            ],
            note: '1 лист ЛДСП = 4 стенки 600 мм. Кромка — ориентировочный расход.'
        },
        {
            sku: 'POS-BACK-800',
            name: 'Стенка 800 мм',
            outputType: 'other',
            matrixPosName: 'С800 - 800мм задняя стенка',
            materials: [
                { code:'LDSP-SHEET', qty:1/3, mode:'strict' },
                { code:'EDGE', qty:0, mode:'estimate' }
            ],
            note: '1 лист ЛДСП = 3 стенки 800 мм. Кромка — ориентировочный расход.'
        },
        {
            sku: 'POS-STICKER-600',
            name: 'Наклейка 600 мм',
            outputType: 'other',
            matrixPosName: 'Н600 - 600мм наклейка',
            materials: [{ code:'STICKER-600', qty:1, mode:'strict' }]
        },
        {
            sku: 'POS-STICKER-800',
            name: 'Наклейка 800 мм',
            outputType: 'other',
            matrixPosName: 'Н800 - 800мм наклейка',
            materials: [{ code:'STICKER-800', qty:1, mode:'strict' }]
        }
    ];

    for (const def of fixedRecipes) {
        const materials = def.materials
            .map(line => {
                const material = materialByCode.get(line.code);
                return material ? { material: material._id, qty: line.qty, mode: line.mode } : null;
            })
            .filter(Boolean);

        await WorkshopRecipe.updateOne(
            { sku: def.sku },
            {
                $set: {
                    name: def.name,
                    outputType: def.outputType,
                    matrixPosName: def.matrixPosName,
                    materials,
                    note: def.note || '',
                    active: true
                },
                $setOnInsert: {
                    stockQty: 0,
                    minStockQty: 0,
                    planksPerUnit: 0,
                    packQtyOverride: 0
                }
            },
            { upsert: true }
        );
    }
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
    if (scope === 'astana') return { responsible: 'regional_astana' };
    if (scope === 'regions') return { responsible: 'regional_regions' };
    return {};
}

function getDealerFilter(req) {
    if (!req.user) return { _id: null };
    if (isGlobalViewer(req)) return {};

    const scope = getUserScope(req);
    if (scope === 'all') return {};

    // Принадлежность дилера определяется только полем "Ответственный"
    // в карточке дилера. Город и сектор не участвуют.
    if (scope === 'astana' || scope === 'regions') {
        return getLegacyScopeFilter(scope);
    }

    return { _id: null };
}

async function cleanupAmbiguousLegacyOwnership() {
    // Старые версии CRM автоматически назначали единственному менеджеру
    // всех дилеров Астаны/регионов. Такое назначение нельзя считать ответственным.
    // Оставляем только назначения, которые были явно подтверждены пользователем.
    const ambiguousFilter = {
        responsibleUserId: { $nin: [null, ''] },
        responsible: { $in: ['regional_astana', 'regional_regions'] },
        $or: [
            { responsibleAssignmentSource: { $exists: false } },
            { responsibleAssignmentSource: null },
            { responsibleAssignmentSource: '' }
        ]
    };

    const result = await Dealer.updateMany(
        ambiguousFilter,
        {
            $unset: { responsibleUserId: '' },
            $set: { responsibleAssignmentSource: 'needs_review' }
        }
    );

    if (result.modifiedCount) {
        console.log(`Dealer ownership cleanup: ${result.modifiedCount} ambiguous assignments reset`);
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
app.get('/api/dealers/:id', requirePermission('can_view_dealers'), async (req, res) => {
    try {
        let query = Dealer.findOne({ _id: req.params.id, ...getDealerFilter(req) });
        if (req.query.view === 'profile') {
            query = query.select('-photos').populate('products', 'sku name');
        } else {
            query = query.populate('products');
        }
        const d = await query.lean();
        if (!d) return res.status(404).json({ error: 'Дилер не найден' });
        if (req.query.view === 'profile') res.set('Cache-Control', 'private, max-age=30');
        res.json(convertToClient(d));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/dealers/:id/photos', requirePermission('can_view_dealers'), async (req, res) => {
    try {
        const d = await Dealer.findOne({ _id: req.params.id, ...getDealerFilter(req) }).select('photos').lean();
        if (!d) return res.status(404).json({ error: 'Дилер не найден' });
        res.set('Cache-Control', 'private, max-age=60');
        res.json(Array.isArray(d.photos) ? d.photos : []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/dealers', requirePermission('can_create_dealer'), async (req, res) => { try {
    const scope = getUserScope(req);
    if (req.user.role === 'manager' && !isGlobalViewer(req)) {
        req.body.responsibleUserId = '';
        req.body.responsibleAssignmentSource = '';
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
            req.body.responsibleUserId = '';
            req.body.responsibleAssignmentSource = '';
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
app.patch('/api/dealers/:id', requirePermission('can_edit_dealer'), async (req, res) => {
    try {
        const payload = { ...req.body };
        if (req.user.role === 'manager' && !isGlobalViewer(req)) {
            payload.responsibleUserId = '';
            payload.responsibleAssignmentSource = '';
            if (req.user.scope === 'astana') payload.responsible = 'regional_astana';
            if (req.user.scope === 'regions') payload.responsible = 'regional_regions';
        }

        const updated = await Dealer.findOneAndUpdate(
            { _id: req.params.id, ...getDealerFilter(req) },
            { $set: payload },
            { new: true }
        ).lean();

        if (!updated) return res.status(404).json({ error: 'Дилер не найден' });
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.delete('/api/dealers/:id', requirePermission('can_delete_dealer'), async (req, res) => { try { await Dealer.findOneAndDelete({ _id: req.params.id, ...getDealerFilter(req) }); res.json({status:'deleted'}); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/dealers/:id/products', requireAnyPermission('can_view_dealers', 'can_view_products'), async (req, res) => { const d = await Dealer.findOne({ _id: req.params.id, ...getDealerFilter(req) }).populate('products'); if (!d) return res.status(404).json({ error: 'Дилер не найден' }); res.json(d.products.map(convertToClient)); });
app.put('/api/dealers/:id/products', requirePermission('can_edit_matrix'), async (req, res) => { const d = await Dealer.findOneAndUpdate({ _id: req.params.id, ...getDealerFilter(req) }, { products: req.body.productIds }); if (!d) return res.status(404).json({ error: 'Дилер не найден' }); res.json({status:'ok'}); });
app.get('/api/products/count', requireAnyPermission('can_view_products', 'can_view_report', 'can_view_reclamations', 'can_view_dealers'), async (req, res) => {
    try {
        const count = await Product.countDocuments({});
        res.json({ count });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/products', requireAnyPermission('can_view_products', 'can_view_report', 'can_view_reclamations', 'can_view_dealers'), async (req, res) => { const s = new RegExp(req.query.search||'', 'i'); const p = await Product.find({$or:[{sku:s},{name:s}]}).sort({sku:1}).lean(); res.json(p.map(x=>{x.id=x._id;return x;})); });
app.post('/api/products', requirePermission('can_manage_products'), async (req, res) => { const p = new Product(req.body); await p.save(); res.json(convertToClient(p)); });
app.put('/api/products/:id', requirePermission('can_manage_products'), async (req, res) => { const p = await Product.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(p)); });
app.delete('/api/products/:id', requirePermission('can_manage_products'), async (req, res) => { await Product.findByIdAndDelete(req.params.id); res.json({}); });
app.post('/api/admin/import-catalog', requirePermission('can_manage_products'), async (req, res) => { res.json({status: 'ok'}); });
app.get('/api/matrix', requireAnyPermission('can_view_products', 'can_view_report'), async (req, res) => {
    try {
        const [prods, dealers] = await Promise.all([
            Product.find().select('sku name').sort({sku:1}).lean(),
            Dealer.find(getDealerFilter(req)).select('_id name city responsible products pos_materials').lean()
        ]);
        const dealerIds = dealers.map(d => d._id);
        const assets = dealerIds.length
            ? await WorkshopDealerAsset.find({ dealer: { $in: dealerIds }, qty: { $gt: 0 } })
                .populate('recipe', 'product outputType')
                .lean()
            : [];

        const productMap = new Map();
        dealers.forEach(d => productMap.set(d._id.toString(), new Set((d.products||[]).map(String))));

        const sampleMap = new Map();
        assets.forEach(asset => {
            const productId = asset.recipe?.outputType === 'sample' ? asset.recipe?.product : null;
            if (!productId) return;
            const key = `${asset.dealer}|${productId}`;
            sampleMap.set(key, (sampleMap.get(key) || 0) + (Number(asset.qty) || 0));
        });

        const posList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"];
        const matrix = prods.map(p => ({
            sku: p.sku,
            name: p.name,
            type: 'product',
            dealers: dealers.map(d => ({
                value: productMap.get(d._id.toString()).has(p._id.toString()) ? 1 : 0,
                sample_qty: sampleMap.get(`${d._id}|${p._id}`) || 0,
                is_pos: false
            }))
        }));

        posList.forEach(pn => {
            matrix.push({
                sku: "POS",
                name: pn,
                type: 'pos',
                dealers: dealers.map(d => ({
                    value: (d.pos_materials||[]).find(m=>m.name===pn)?.quantity||0,
                    is_pos: true
                }))
            });
        });
        res.json({
            headers: dealers.map(d=>({id:d._id, name:d.name, city:d.city, responsible:d.responsible})),
            matrix
        });
    } catch (e) {
        res.status(500).json({error:e.message});
    }
});

app.get('/api/sales', requirePermission('can_view_sales'), async (req, res) => {
    try {
        const { month, months, dealerId } = req.query;
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
                            // Факт менеджера считается исключительно по дилерам,
                            // где он выбран ответственным.
                            { isCustom: { $ne: true }, dealerId: { $in: dealerIds } },
                            // План берём из сводки его зоны на странице Продажи.
                            { isCustom: { $ne: true }, dealerId: zonePlanId }
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

        if (dealerId) {
            const requestedDealerId = String(dealerId);
            const requestedPlanId = `PLAN_vip_${requestedDealerId}`;
            filter = {
                $and: [
                    filter,
                    { dealerId: { $in: [requestedDealerId, requestedPlanId] } }
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


// ==========================================
// ЦЕХ API
// ==========================================
async function syncWorkshopPosToDealer(dealerId, recipeId) {
    const recipe = await WorkshopRecipe.findById(recipeId).select('matrixPosName').lean();
    const posName = String(recipe?.matrixPosName || '').trim();
    if (!posName) return;

    const recipes = await WorkshopRecipe.find({ matrixPosName: posName }).select('_id').lean();
    const recipeIds = recipes.map(item => item._id);
    const assets = await WorkshopDealerAsset.find({ dealer: dealerId, recipe: { $in: recipeIds } }).lean();
    const qty = assets.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

    const dealer = await Dealer.findById(dealerId);
    if (!dealer) return;
    dealer.pos_materials = Array.isArray(dealer.pos_materials) ? dealer.pos_materials : [];
    const index = dealer.pos_materials.findIndex(item => item.name === posName);
    if (qty > 0) {
        if (index >= 0) dealer.pos_materials[index].quantity = qty;
        else dealer.pos_materials.push({ name: posName, quantity: qty });
    } else if (index >= 0) {
        dealer.pos_materials.splice(index, 1);
    }
    await dealer.save();
}

app.get('/api/workshop/bootstrap', requirePermission('can_view_workshop'), async (req, res) => {
    try {
        const [products, dealers, materials, recipes, laminateStocks, assets, productions, movements, memos] = await Promise.all([
            Product.find().select('sku name is_liquid characteristics.package_qty characteristics.size characteristics.class characteristics.thickness').sort({ sku: 1 }).lean(),
            Dealer.find(getDealerFilter(req)).select('_id dealer_id name city status').sort({ name: 1 }).lean(),
            WorkshopMaterial.find({ active: { $ne: false } }).sort({ category: 1, name: 1 }).lean(),
            WorkshopRecipe.find({ active: { $ne: false } })
                .populate('product', 'sku name is_liquid characteristics.package_qty')
                .populate('materials.material', 'code name unit purchaseUnit purchaseUnitSize stockQty')
                .populate('components.recipe', 'name outputType stockQty')
                .sort({ outputType: 1, name: 1 }).lean(),
            WorkshopLaminateStock.find().populate('product', 'sku name is_liquid characteristics.package_qty').lean(),
            WorkshopDealerAsset.find({ qty: { $gt: 0 } })
                .populate('dealer', 'dealer_id name city')
                .populate({ path: 'recipe', populate: { path: 'product', select: 'sku name is_liquid' } })
                .sort({ updatedAt: -1 }).lean(),
            WorkshopProduction.find()
                .populate('recipe', 'name outputType')
                .populate('product', 'sku name')
                .sort({ date: -1, createdAt: -1 }).limit(30).lean(),
            WorkshopMovement.find()
                .populate('product', 'sku name')
                .populate('material', 'code name unit')
                .populate('recipe', 'name outputType')
                .populate('dealer', 'dealer_id name city')
                .sort({ date: -1, createdAt: -1 }).limit(60).lean(),
            WorkshopMemo.find()
                .populate('lines.product', 'sku name is_liquid characteristics.package_qty')
                .populate('lines.actualProduct', 'sku name is_liquid characteristics.package_qty')
                .populate('lines.recipe', 'name outputType planksPerUnit')
                .sort({ date: -1, createdAt: -1 }).limit(80).lean()
        ]);

        const memoIds = memos.map(item => item._id);
        const producedByMemoLine = memoIds.length ? await WorkshopProduction.aggregate([
            { $match: { memo: { $in: memoIds }, memoLineId: { $nin: [null, ''] } } },
            { $group: { _id: '$memoLineId', qty: { $sum: '$outputQty' } } }
        ]) : [];
        const producedMap = new Map(producedByMemoLine.map(item => [String(item._id), Number(item.qty) || 0]));
        memos.forEach(memo => {
            (memo.lines || []).forEach(line => {
                line.producedQty = producedMap.get(String(line._id)) || 0;
            });
        });

        const today = new Date();
        today.setHours(0,0,0,0);
        const todayRows = await WorkshopProduction.find({ date: { $gte: today } }).select('outputQty').lean();
        const todayProduction = todayRows.reduce((sum, item) => sum + (Number(item.outputQty) || 0), 0);
        const finishedStock = recipes.reduce((sum, item) => sum + (Number(item.stockQty) || 0), 0);
        const lowMaterials = materials.filter(item => Number(item.minQty) > 0 && Number(item.stockQty) <= Number(item.minQty)).length;
        const laminatePlanks = laminateStocks.reduce((sum, item) => sum + (Number(item.planksQty) || 0), 0);
        const openMemos = memos.filter(item => item.status === 'created' || item.status === 'mismatch').length;

        res.json({
            products: products.map(convertToClient),
            dealers: dealers.map(convertToClient),
            materials: materials.map(convertToClient),
            recipes: recipes.map(convertToClient),
            laminateStocks: laminateStocks.map(convertToClient),
            dealerAssets: assets.map(convertToClient),
            productions: productions.map(convertToClient),
            movements: movements.map(convertToClient),
            memos: memos.map(convertToClient),
            stats: { todayProduction, finishedStock, lowMaterials, laminatePlanks, openMemos }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/workshop/movements', requirePermission('can_view_workshop'), async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 150));
        const filter = {};
        if (req.query.type) filter.type = req.query.type;
        const list = await WorkshopMovement.find(filter)
            .populate('product', 'sku name')
            .populate('material', 'code name unit')
            .populate('recipe', 'name outputType')
            .populate('dealer', 'dealer_id name city')
            .sort({ date: -1, createdAt: -1 }).limit(limit).lean();
        res.json(list.map(convertToClient));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/workshop/materials', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const item = new WorkshopMaterial({
            code: String(req.body.code || '').trim(),
            name: String(req.body.name || '').trim(),
            category: req.body.category || 'consumable',
            unit: req.body.unit || 'шт',
            purchaseUnit: String(req.body.purchaseUnit || req.body.unit || 'шт').trim(),
            purchaseUnitSize: Math.max(0.0001, workshopNumber(req.body.purchaseUnitSize) || 1),
            stockQty: Math.max(0, workshopNumber(req.body.stockQty)),
            minQty: Math.max(0, workshopNumber(req.body.minQty)),
            active: req.body.active !== false,
            note: String(req.body.note || '').trim()
        });
        if (!item.name) return res.status(400).json({ error: 'Укажите название материала' });
        await item.save();
        res.status(201).json(convertToClient(item));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/workshop/materials/:id', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const payload = {
            code: String(req.body.code || '').trim(),
            name: String(req.body.name || '').trim(),
            category: req.body.category || 'consumable',
            unit: req.body.unit || 'шт',
            purchaseUnit: String(req.body.purchaseUnit || req.body.unit || 'шт').trim(),
            purchaseUnitSize: Math.max(0.0001, workshopNumber(req.body.purchaseUnitSize) || 1),
            minQty: Math.max(0, workshopNumber(req.body.minQty)),
            active: req.body.active !== false,
            note: String(req.body.note || '').trim()
        };
        const item = await WorkshopMaterial.findByIdAndUpdate(req.params.id, payload, { new: true });
        if (!item) return res.status(404).json({ error: 'Материал не найден' });
        res.json(convertToClient(item));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/workshop/material-movement', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const materialId = req.body.materialId;
        const qty = Math.abs(workshopNumber(req.body.qty));
        const direction = req.body.direction === 'out' ? 'out' : 'in';
        if (!materialId || qty <= 0) return res.status(400).json({ error: 'Укажите материал и количество' });

        const delta = direction === 'out' ? -qty : qty;
        const material = await workshopChangeMaterial(materialId, delta);
        const movement = await WorkshopMovement.create({
            date: req.body.date || new Date(),
            type: req.body.type || (direction === 'out' ? 'material_issue' : 'material_receipt'),
            entityType: 'material',
            material: materialId,
            direction,
            qty,
            unit: material.unit || 'шт',
            serviceMemoNumber: String(req.body.serviceMemoNumber || '').trim(),
            note: String(req.body.note || '').trim(),
            createdBy: workshopUser(req)
        });
        res.status(201).json({ material: convertToClient(material), movement: convertToClient(movement) });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/workshop/recipes', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const recipe = new WorkshopRecipe({
            name: String(req.body.name || '').trim(),
            outputType: req.body.outputType || 'sample',
            sku: String(req.body.sku || '').trim(),
            product: req.body.productId || null,
            sideA: String(req.body.sideA || '').trim(),
            sideB: String(req.body.sideB || '').trim(),
            planksPerUnit: Math.max(0, workshopNumber(req.body.planksPerUnit)),
            packQtyOverride: Math.max(0, workshopNumber(req.body.packQtyOverride)),
            matrixPosName: String(req.body.matrixPosName || '').trim(),
            minStockQty: Math.max(0, workshopNumber(req.body.minStockQty)),
            materials: Array.isArray(req.body.materials) ? req.body.materials.map(item => ({
                material: item.materialId,
                qty: Math.max(0, workshopNumber(item.qty)),
                mode: item.mode === 'estimate' ? 'estimate' : 'strict'
            })).filter(item => item.material && item.qty >= 0) : [],
            components: Array.isArray(req.body.components) ? req.body.components.map(item => ({
                recipe: item.recipeId,
                qty: Math.max(0, workshopNumber(item.qty))
            })).filter(item => item.recipe && item.qty > 0) : [],
            active: req.body.active !== false,
            note: String(req.body.note || '').trim()
        });
        if (!recipe.name) return res.status(400).json({ error: 'Укажите название изделия' });
        await recipe.save();
        res.status(201).json(convertToClient(recipe));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/workshop/recipes/:id', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const payload = {
            name: String(req.body.name || '').trim(),
            outputType: req.body.outputType || 'sample',
            sku: String(req.body.sku || '').trim(),
            product: req.body.productId || null,
            sideA: String(req.body.sideA || '').trim(),
            sideB: String(req.body.sideB || '').trim(),
            planksPerUnit: Math.max(0, workshopNumber(req.body.planksPerUnit)),
            packQtyOverride: Math.max(0, workshopNumber(req.body.packQtyOverride)),
            matrixPosName: String(req.body.matrixPosName || '').trim(),
            minStockQty: Math.max(0, workshopNumber(req.body.minStockQty)),
            materials: Array.isArray(req.body.materials) ? req.body.materials.map(item => ({
                material: item.materialId,
                qty: Math.max(0, workshopNumber(item.qty)),
                mode: item.mode === 'estimate' ? 'estimate' : 'strict'
            })).filter(item => item.material && item.qty >= 0) : [],
            components: Array.isArray(req.body.components) ? req.body.components.map(item => ({
                recipe: item.recipeId,
                qty: Math.max(0, workshopNumber(item.qty))
            })).filter(item => item.recipe && item.qty > 0) : [],
            active: req.body.active !== false,
            note: String(req.body.note || '').trim()
        };
        const recipe = await WorkshopRecipe.findByIdAndUpdate(req.params.id, payload, { new: true });
        if (!recipe) return res.status(404).json({ error: 'Рецептура не найдена' });
        res.json(convertToClient(recipe));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/workshop/memos', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const number = String(req.body.number || '').trim();
        const inputLines = Array.isArray(req.body.lines) ? req.body.lines : [];
        if (!number) return res.status(400).json({ error: 'Укажите номер служебной записки' });
        if (!inputLines.length) return res.status(400).json({ error: 'Добавьте хотя бы одну позицию' });

        const lines = [];
        const seenProducts = new Set();
        for (const input of inputLines) {
            const requestedPacks = Math.max(0, Math.floor(workshopNumber(input.requestedPacks)));
            if (!input.productId || requestedPacks <= 0) continue;

            const product = await Product.findById(input.productId).lean();
            if (!product) continue;
            const productKey = String(product._id);
            if (seenProducts.has(productKey)) {
                return res.status(400).json({ error: `Позиция «${product.sku || product.name}» добавлена в служебку дважды` });
            }
            seenProducts.add(productKey);

            let recipe = null;
            if (input.recipeId) {
                recipe = await WorkshopRecipe.findOne({
                    _id: input.recipeId,
                    product: product._id,
                    active: { $ne: false }
                }).lean();
                if (!recipe) {
                    return res.status(400).json({ error: `Выбранная рецептура не подходит для «${product.sku || product.name}»` });
                }
            } else {
                const recipes = await WorkshopRecipe.find({
                    product: product._id,
                    active: { $ne: false },
                    planksPerUnit: { $gt: 0 }
                }).lean();
                recipe = recipes.find(item => item.outputType === 'sample')
                    || recipes.find(item => item.outputType === 'stand')
                    || recipes[0]
                    || null;
            }

            if (!recipe) {
                return res.status(400).json({ error: `Для «${product.sku || product.name}» не настроена рецептура производства` });
            }

            const packQty = workshopPackQty(product, recipe.packQtyOverride);
            if (packQty <= 0) {
                return res.status(400).json({ error: `У «${product.sku || product.name}» не заполнено количество планок в упаковке` });
            }
            const planksPerUnit = Math.max(0, workshopNumber(recipe.planksPerUnit));
            if (planksPerUnit <= 0) {
                return res.status(400).json({ error: `В рецептуре «${recipe.name}» не заполнена норма планок на изделие` });
            }

            const totalPlanks = requestedPacks * packQty;
            const plannedOutputQty = Math.floor(totalPlanks / planksPerUnit);
            const plannedRemainderPlanks = totalPlanks - plannedOutputQty * planksPerUnit;

            lines.push({
                product: product._id,
                recipe: recipe._id,
                requestedPacks,
                plannedOutputQty,
                plannedRemainderPlanks,
                packQty,
                planksPerUnit,
                actualProduct: product._id,
                deliveredPacks: 0,
                checked: false,
                isMatch: false,
                discrepancyReason: ''
            });
        }

        if (!lines.length) return res.status(400).json({ error: 'Нет корректных позиций для служебной записки' });

        const memo = await WorkshopMemo.create({
            number,
            date: req.body.date || new Date(),
            lines,
            note: String(req.body.note || '').trim(),
            signedBy: String(req.body.signedBy || req.user?.fullName || req.user?.username || '').trim(),
            createdBy: workshopUser(req)
        });

        const populated = await WorkshopMemo.findById(memo._id)
            .populate('lines.product', 'sku name is_liquid characteristics.package_qty')
            .populate('lines.recipe', 'name outputType planksPerUnit')
            .lean();
        res.status(201).json(convertToClient(populated));
    } catch (e) {
        if (e && e.code === 11000) return res.status(400).json({ error: 'Служебная записка с таким номером уже существует' });
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/workshop/memos/:id/receive', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const memo = await WorkshopMemo.findById(req.params.id);
        if (!memo) return res.status(404).json({ error: 'Служебная записка не найдена' });
        if (memo.status === 'accepted' && memo.postedAt) {
            return res.status(400).json({ error: 'Эта служебная записка уже принята и оприходована' });
        }

        const submitted = Array.isArray(req.body.lines) ? req.body.lines : [];
        if (!submitted.length) return res.status(400).json({ error: 'Нет строк для сверки' });

        const attemptLines = [];
        let allMatch = true;

        for (const line of memo.lines) {
            const row = submitted.find(item => String(item.lineId || '') === String(line._id));
            const actualProductId = row?.actualProductId || line.product;
            const deliveredPacks = Math.max(0, Math.floor(workshopNumber(row?.deliveredPacks)));
            const checked = Boolean(row?.checked);
            const sameProduct = String(actualProductId || '') === String(line.product || '');
            const sameQty = deliveredPacks === Number(line.requestedPacks || 0);
            const isMatch = checked && sameProduct && sameQty;

            line.actualProduct = actualProductId || line.product;
            line.deliveredPacks = deliveredPacks;
            line.checked = checked;
            line.isMatch = isMatch;
            line.discrepancyReason = String(row?.discrepancyReason || '').trim();

            if (!isMatch) allMatch = false;
            attemptLines.push({
                lineId: String(line._id),
                expectedProductId: String(line.product || ''),
                actualProductId: String(line.actualProduct || ''),
                requestedPacks: Number(line.requestedPacks || 0),
                deliveredPacks,
                checked,
                isMatch,
                discrepancyReason: line.discrepancyReason
            });
        }

        memo.receiptAttempts.push({
            date: req.body.date || new Date(),
            status: allMatch ? 'accepted' : 'mismatch',
            lines: attemptLines,
            note: String(req.body.note || '').trim(),
            createdBy: workshopUser(req)
        });

        if (!allMatch) {
            memo.status = 'mismatch';
            await memo.save();
            const populated = await WorkshopMemo.findById(memo._id)
                .populate('lines.product', 'sku name is_liquid characteristics.package_qty')
                .populate('lines.actualProduct', 'sku name is_liquid characteristics.package_qty')
                .populate('lines.recipe', 'name outputType planksPerUnit')
                .lean();
            return res.status(200).json({
                accepted: false,
                status: 'mismatch',
                message: 'Есть расхождения. Упаковки пока не оприходованы — требуется обмен/повторная сверка.',
                memo: convertToClient(populated)
            });
        }

        if (!memo.postedAt) {
            for (const line of memo.lines) {
                const product = await Product.findById(line.product).lean();
                if (!product) throw new Error('Одна из позиций служебки больше не найдена в каталоге');
                const packQty = Number(line.packQty) > 0 ? Number(line.packQty) : workshopPackQty(product);
                const planksQty = Number(line.requestedPacks || 0) * packQty;
                await workshopChangeLaminate(line.product, planksQty);
                await WorkshopMovement.create({
                    date: req.body.date || new Date(),
                    type: 'laminate_receipt',
                    entityType: 'laminate',
                    product: line.product,
                    direction: 'in',
                    qty: planksQty,
                    unit: 'планка',
                    serviceMemoNumber: memo.number,
                    note: String(req.body.note || '').trim(),
                    meta: {
                        memoId: String(memo._id),
                        memoLineId: String(line._id),
                        requestedPacks: Number(line.requestedPacks || 0),
                        deliveredPacks: Number(line.deliveredPacks || 0),
                        packQty,
                        plannedOutputQty: Number(line.plannedOutputQty || 0)
                    },
                    createdBy: workshopUser(req)
                });
            }
            memo.postedAt = new Date();
        }

        memo.status = 'accepted';
        memo.acceptedAt = new Date();
        memo.acceptedBy = workshopUser(req);
        await memo.save();

        const populated = await WorkshopMemo.findById(memo._id)
            .populate('lines.product', 'sku name is_liquid characteristics.package_qty')
            .populate('lines.actualProduct', 'sku name is_liquid characteristics.package_qty')
            .populate('lines.recipe', 'name outputType planksPerUnit')
            .lean();

        res.json({
            accepted: true,
            status: 'accepted',
            message: 'Все позиции совпали. Упаковки оприходованы в цех.',
            memo: convertToClient(populated)
        });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/workshop/laminate-receipt', requirePermission('can_manage_workshop'), async (req, res) => {
    return res.status(400).json({
        error: 'Одиночный приход отключен. Ламинат принимается только целыми упаковками по многострочной служебной записке.'
    });
});

app.post('/api/workshop/production', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const recipe = await WorkshopRecipe.findById(req.body.recipeId)
            .populate('product')
            .populate('materials.material')
            .populate('components.recipe');
        if (!recipe) return res.status(404).json({ error: 'Рецептура не найдена' });

        let sourceMemo = null;
        let sourceMemoLine = null;
        if (req.body.memoId) {
            sourceMemo = await WorkshopMemo.findById(req.body.memoId).lean();
            if (!sourceMemo || sourceMemo.status !== 'accepted') {
                return res.status(400).json({ error: 'Можно привязать производство только к принятой служебной записке' });
            }
            sourceMemoLine = (sourceMemo.lines || []).find(line => String(line._id) === String(req.body.memoLineId || ''));
            if (!sourceMemoLine) return res.status(400).json({ error: 'Строка служебной записки не найдена' });
            if (recipe.product && String(sourceMemoLine.product) !== String(recipe.product._id)) {
                return res.status(400).json({ error: 'Ламинат рецептуры не совпадает с выбранной строкой служебки' });
            }
        }

        const outputQty = Math.max(0, workshopNumber(req.body.outputQty));
        const scrapPlanks = Math.max(0, workshopNumber(req.body.scrapPlanks));
        const acceptedPacks = Math.max(0, workshopNumber(req.body.acceptedPacks));
        const acceptedLoosePlanks = Math.max(0, workshopNumber(req.body.acceptedLoosePlanks));
        if (outputQty <= 0) return res.status(400).json({ error: 'Укажите количество изготовленных изделий' });

        const packQty = workshopPackQty(recipe.product, recipe.packQtyOverride);
        const standardPlanksPerUnit = Math.max(0, workshopNumber(recipe.planksPerUnit));
        const requestedActualNorm = Math.max(0, workshopNumber(req.body.actualPlanksPerUnit));
        const actualPlanksPerUnit = requestedActualNorm > 0 ? requestedActualNorm : standardPlanksPerUnit;
        const customNormReason = String(req.body.customNormReason || '').trim();
        if (requestedActualNorm > 0 && Math.abs(requestedActualNorm - standardPlanksPerUnit) > 0.0001 && !customNormReason) {
            return res.status(400).json({ error: 'При изменении стандартной нормы укажите причину (например, индивидуальный образец)' });
        }
        const usedForOutput = actualPlanksPerUnit * outputQty;
        const consumedPlanks = usedForOutput + scrapPlanks;
        const acceptedTotal = acceptedPacks * packQty + acceptedLoosePlanks;

        if (consumedPlanks > 0) {
            if (!recipe.product) return res.status(400).json({ error: 'Для этой рецептуры не выбран ламинат' });
            const stock = await WorkshopLaminateStock.findOne({ product: recipe.product._id }).lean();
            if ((Number(stock?.planksQty) || 0) < consumedPlanks) {
                return res.status(400).json({ error: 'Недостаточно планок ламината в остатках цеха' });
            }
        }

        for (const line of recipe.materials || []) {
            if (line.mode === 'estimate') continue;
            const need = (Number(line.qty) || 0) * outputQty;
            if (need > 0 && (Number(line.material?.stockQty) || 0) < need) {
                return res.status(400).json({ error: `Недостаточно материала «${line.material?.name || 'материал'}»` });
            }
        }

        for (const line of recipe.components || []) {
            const need = (Number(line.qty) || 0) * outputQty;
            if (need > 0 && (Number(line.recipe?.stockQty) || 0) < need) {
                return res.status(400).json({ error: `Недостаточно готовых компонентов «${line.recipe?.name || 'компонент'}»` });
            }
        }

        if (consumedPlanks > 0) {
            await workshopChangeLaminate(recipe.product._id, -consumedPlanks);
            await WorkshopMovement.create({
                date: req.body.date || new Date(), type: 'production_laminate',
                entityType: 'laminate', product: recipe.product._id, direction: 'out',
                qty: consumedPlanks, unit: 'планка', note: String(req.body.note || '').trim(),
                serviceMemoNumber: sourceMemo?.number || '',
                meta: { recipeId: recipe._id, outputQty, scrapPlanks, standardPlanksPerUnit, actualPlanksPerUnit, customNormReason, memoId: sourceMemo?._id || null, memoLineId: sourceMemoLine?._id || null }, createdBy: workshopUser(req)
            });
        }

        for (const line of recipe.materials || []) {
            const need = (Number(line.qty) || 0) * outputQty;
            if (line.mode === 'estimate') {
                if (need > 0) {
                    await WorkshopMovement.create({
                        date: req.body.date || new Date(), type: 'production_material_estimate',
                        entityType: 'material', material: line.material._id, direction: 'neutral',
                        qty: need, unit: line.material.unit || 'шт',
                        note: 'Расчетный расход; фактический остаток автоматически не уменьшается',
                        meta: { recipeId: recipe._id, outputQty, estimate: true }, createdBy: workshopUser(req)
                    });
                }
                continue;
            }
            if (need <= 0) continue;
            await workshopChangeMaterial(line.material._id, -need);
            await WorkshopMovement.create({
                date: req.body.date || new Date(), type: 'production_material',
                entityType: 'material', material: line.material._id, direction: 'out',
                qty: need, unit: line.material.unit || 'шт',
                meta: { recipeId: recipe._id, outputQty }, createdBy: workshopUser(req)
            });
        }

        for (const line of recipe.components || []) {
            const need = (Number(line.qty) || 0) * outputQty;
            if (need <= 0) continue;
            await workshopChangeRecipe(line.recipe._id, -need);
            await WorkshopMovement.create({
                date: req.body.date || new Date(), type: 'production_component',
                entityType: 'finished', recipe: line.recipe._id, direction: 'out',
                qty: need, unit: 'шт', meta: { recipeId: recipe._id, outputQty },
                createdBy: workshopUser(req)
            });
        }

        const resultStock = await workshopChangeRecipe(recipe._id, outputQty);
        await WorkshopMovement.create({
            date: req.body.date || new Date(), type: 'production_output',
            entityType: 'finished', recipe: recipe._id, direction: 'in',
            qty: outputQty, unit: 'шт', note: String(req.body.note || '').trim(),
            serviceMemoNumber: sourceMemo?.number || '',
            meta: { acceptedPacks, acceptedLoosePlanks, acceptedTotal, packQty, consumedPlanks, scrapPlanks, memoId: sourceMemo?._id || null, memoLineId: sourceMemoLine?._id || null },
            createdBy: workshopUser(req)
        });

        const production = await WorkshopProduction.create({
            date: req.body.date || new Date(),
            recipe: recipe._id,
            product: recipe.product?._id || null,
            memo: sourceMemo?._id || null,
            memoLineId: sourceMemoLine?._id ? String(sourceMemoLine._id) : '',
            serviceMemoNumber: sourceMemo?.number || '',
            acceptedPacks,
            acceptedLoosePlanks,
            packQty,
            totalAcceptedPlanks: acceptedTotal,
            outputQty,
            standardPlanksPerUnit,
            actualPlanksPerUnit,
            customNormReason,
            consumedPlanks,
            scrapPlanks,
            operations: Array.isArray(req.body.operations)
                ? req.body.operations.map(item => ({
                    type: String(item.type || '').trim(),
                    qty: Math.max(0, workshopNumber(item.qty)),
                    note: String(item.note || '').trim()
                })).filter(item => item.type)
                : [],
            note: String(req.body.note || '').trim(),
            createdBy: workshopUser(req)
        });

        res.status(201).json({ production: convertToClient(production), stock: convertToClient(resultStock) });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/workshop/writeoff', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const entityType = req.body.entityType;
        const qty = Math.abs(workshopNumber(req.body.qty));
        const serviceMemoNumber = String(req.body.serviceMemoNumber || '').trim();
        if (qty <= 0) return res.status(400).json({ error: 'Укажите количество списания' });
        if (!serviceMemoNumber) return res.status(400).json({ error: 'Для списания укажите номер служебной записки' });

        let movementData = {
            date: req.body.date || new Date(), type: 'writeoff', entityType,
            direction: 'out', qty, serviceMemoNumber,
            note: String(req.body.note || '').trim(), createdBy: workshopUser(req)
        };

        if (entityType === 'laminate') {
            await workshopChangeLaminate(req.body.productId, -qty);
            movementData.product = req.body.productId;
            movementData.unit = 'планка';
        } else if (entityType === 'material') {
            const material = await workshopChangeMaterial(req.body.materialId, -qty);
            movementData.material = req.body.materialId;
            movementData.unit = material.unit || 'шт';
        } else if (entityType === 'finished') {
            await workshopChangeRecipe(req.body.recipeId, -qty);
            movementData.recipe = req.body.recipeId;
            movementData.unit = 'шт';
        } else {
            return res.status(400).json({ error: 'Неизвестный тип списания' });
        }

        const movement = await WorkshopMovement.create(movementData);
        res.status(201).json(convertToClient(movement));
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/workshop/dealer-movement', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const dealerId = req.body.dealerId;
        const recipeId = req.body.recipeId;
        const action = req.body.action || 'issue';
        const qty = Math.abs(workshopNumber(req.body.qty));
        if (!dealerId || !recipeId || qty <= 0) return res.status(400).json({ error: 'Выберите дилера, изделие и количество' });

        const [dealer, recipe] = await Promise.all([
            Dealer.findById(dealerId).select('_id name'),
            WorkshopRecipe.findById(recipeId)
        ]);
        if (!dealer) return res.status(404).json({ error: 'Дилер не найден' });
        if (!recipe) return res.status(404).json({ error: 'Изделие не найдено' });

        let asset = await WorkshopDealerAsset.findOne({ dealer: dealerId, recipe: recipeId });
        if (!asset) asset = new WorkshopDealerAsset({ dealer: dealerId, recipe: recipeId, qty: 0 });

        const condition = req.body.returnCondition || 'defect';
        let issued = 0;
        let returned = 0;

        if (action === 'issue') {
            if (Number(recipe.stockQty) < qty) return res.status(400).json({ error: 'Недостаточно готовых изделий в цехе' });
            await workshopChangeRecipe(recipeId, -qty);
            asset.qty += qty;
            issued = qty;
        } else if (action === 'return') {
            if (Number(asset.qty) < qty) return res.status(400).json({ error: 'У дилера числится меньше изделий' });
            asset.qty -= qty;
            returned = qty;
            if (condition === 'reusable') await workshopChangeRecipe(recipeId, qty);
        } else if (action === 'replacement') {
            const returnQty = Math.abs(workshopNumber(req.body.returnQty || qty));
            const issueQty = Math.abs(workshopNumber(req.body.issueQty || qty));
            if (Number(asset.qty) < returnQty) return res.status(400).json({ error: 'У дилера числится меньше изделий для возврата' });
            if (Number(recipe.stockQty) < issueQty) return res.status(400).json({ error: 'Недостаточно изделий для замены' });
            asset.qty = Number(asset.qty) - returnQty + issueQty;
            await workshopChangeRecipe(recipeId, -issueQty);
            if (condition === 'reusable') await workshopChangeRecipe(recipeId, returnQty);
            returned = returnQty;
            issued = issueQty;
        } else {
            return res.status(400).json({ error: 'Неизвестная операция с дилером' });
        }

        asset.qty = Math.max(0, Number(asset.qty) || 0);
        await asset.save();

        const movement = await WorkshopMovement.create({
            date: req.body.date || new Date(),
            type: `dealer_${action}`,
            entityType: 'finished',
            recipe: recipeId,
            dealer: dealerId,
            direction: action === 'return' ? 'in' : action === 'issue' ? 'out' : 'neutral',
            qty,
            unit: 'шт',
            note: String(req.body.note || '').trim(),
            meta: { issued, returned, returnCondition: condition, reason: String(req.body.reason || '').trim() },
            createdBy: workshopUser(req)
        });

        await syncWorkshopPosToDealer(dealerId, recipeId);
        res.status(201).json({ asset: convertToClient(asset), movement: convertToClient(movement) });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.get('/api/workshop/dealers/:dealerId/assets', requireAnyPermission('can_view_workshop', 'can_view_dealers'), async (req, res) => {
    try {
        const assets = await WorkshopDealerAsset.find({ dealer: req.params.dealerId, qty: { $gt: 0 } })
            .populate({ path: 'recipe', populate: { path: 'product', select: 'sku name is_liquid' } })
            .sort({ updatedAt: -1 }).lean();
        res.json(assets.map(convertToClient));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/workshop/stocktake', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const inputLines = Array.isArray(req.body.lines) ? req.body.lines : [];
        if (!inputLines.length) return res.status(400).json({ error: 'Добавьте позиции инвентаризации' });
        const savedLines = [];

        for (const line of inputLines) {
            const actualQty = Math.max(0, workshopNumber(line.actualQty));
            let systemQty = 0;
            let delta = 0;
            let movement = null;

            if (line.entityType === 'laminate' && line.productId) {
                const current = await WorkshopLaminateStock.findOne({ product: line.productId }).lean();
                systemQty = Number(current?.planksQty) || 0;
                delta = actualQty - systemQty;
                if (Math.abs(delta) > 0.0001) {
                    await workshopChangeLaminate(line.productId, delta);
                    movement = { entityType:'laminate', product:line.productId, unit:'планка' };
                }
                savedLines.push({ entityType:'laminate', product:line.productId, systemQty, actualQty, delta, note:line.note || '' });
            } else if (line.entityType === 'material' && line.materialId) {
                const current = await WorkshopMaterial.findById(line.materialId).lean();
                if (!current) continue;
                systemQty = Number(current.stockQty) || 0;
                delta = actualQty - systemQty;
                if (Math.abs(delta) > 0.0001) {
                    await workshopChangeMaterial(line.materialId, delta);
                    movement = { entityType:'material', material:line.materialId, unit:current.unit || 'шт' };
                }
                savedLines.push({ entityType:'material', material:line.materialId, systemQty, actualQty, delta, note:line.note || '' });
            } else if (line.entityType === 'finished' && line.recipeId) {
                const current = await WorkshopRecipe.findById(line.recipeId).lean();
                if (!current) continue;
                systemQty = Number(current.stockQty) || 0;
                delta = actualQty - systemQty;
                if (Math.abs(delta) > 0.0001) {
                    await workshopChangeRecipe(line.recipeId, delta);
                    movement = { entityType:'finished', recipe:line.recipeId, unit:'шт' };
                }
                savedLines.push({ entityType:'finished', recipe:line.recipeId, systemQty, actualQty, delta, note:line.note || '' });
            }

            if (movement && Math.abs(delta) > 0.0001) {
                await WorkshopMovement.create({
                    date: req.body.date || new Date(),
                    type: 'stocktake_adjustment',
                    ...movement,
                    direction: delta > 0 ? 'in' : 'out',
                    qty: Math.abs(delta),
                    note: line.note || '',
                    meta: { systemQty, actualQty, delta },
                    createdBy: workshopUser(req)
                });
            }
        }

        const stocktake = await WorkshopStocktake.create({
            date: req.body.date || new Date(),
            lines: savedLines,
            note: String(req.body.note || '').trim(),
            createdBy: workshopUser(req)
        });
        res.status(201).json(convertToClient(stocktake));
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

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
