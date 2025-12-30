const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const basicAuth = require('express-basic-auth'); 
const fs = require('fs'); 
// --- НОВЫЕ БИБЛИОТЕКИ БЕЗОПАСНОСТИ ---
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000; 
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_KEY_123'; // Секретный ключ для подписи токенов

app.use(express.json({ limit: '50mb' })); 
app.use(cors());

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
        res.send(html);
    });
};

// ==========================================
// НОВАЯ СИСТЕМА ПОЛЬЗОВАТЕЛЕЙ (RBAC)
// ==========================================

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true }, // Логин
    password: { type: String, required: true },               // Хеш пароля
    fullName: String,                                         // Имя (Иван Иванов)
    
    // ГЛАВНЫЙ РУБИЛЬНИК
    isBlocked: { type: Boolean, default: false },             // Если true - вход запрещен сразу

    // ГЕОГРАФИЯ (Чьи данные видит?)
    // 'all' = всё, 'astana' = Астана, 'region_north' = Север и т.д.
    scope: { type: String, default: 'all' }, 

    // ТОЧЕЧНЫЕ ПРАВА (ГАЛОЧКИ)
    permissions: {
        // Просмотр разделов
        can_view_map: { type: Boolean, default: true },
        can_view_dealers: { type: Boolean, default: true },
        can_view_sales: { type: Boolean, default: true },
        can_view_competitors: { type: Boolean, default: true },
        can_view_report: { type: Boolean, default: true },
        
        // Редактирование
        can_edit_dealer: { type: Boolean, default: false },   // Править карточку
        can_delete_dealer: { type: Boolean, default: false }, // Удалять дилера (ОПАСНО!)
        can_edit_sales: { type: Boolean, default: false },    // Ставить план/факт
        
        // Админка
        can_manage_users: { type: Boolean, default: false },  // Создавать/удалять сотрудников
        is_admin: { type: Boolean, default: false }           // Супер-админ (всё можно)
    }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// --- СОЗДАНИЕ ПЕРВОГО АДМИНА (SEED) ---
async function seedUsers() {
    const count = await User.countDocuments();
    if (count === 0) {
        console.log('Создание первого администратора...');
        // Пароль по умолчанию: admin123 (Обязательно смените!)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('admin123', salt);
        
        await User.create({
            username: 'admin',
            password: hashedPassword,
            fullName: 'Главный Администратор',
            scope: 'all',
            permissions: {
                is_admin: true,
                can_manage_users: true,
                can_view_map: true, can_view_dealers: true, can_view_sales: true,
                can_edit_dealer: true, can_delete_dealer: true, can_edit_sales: true
            }
        });
        console.log('Администратор создан: логин "admin", пароль "admin123"');
    }
}

// --- API ВХОДА (LOGIN) ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // 1. Ищем пользователя
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: 'Неверный логин или пароль' });

        // 2. Проверяем блокировку
        if (user.isBlocked) return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });

        // 3. Сверяем пароль
        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ error: 'Неверный логин или пароль' });

        // 4. Выдаем токен (действует 7 дней)
        const token = jwt.sign(
            { id: user._id, role: user.scope }, // Что зашито в токен
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Отдаем токен и права клиенту
        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                fullName: user.fullName,
                scope: user.scope,
                permissions: user.permissions
            }
        });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// СТАРАЯ АВТОРИЗАЦИЯ (ВРЕМЕННО ОСТАВЛЯЕМ)
// ==========================================
// Мы пока не удаляем Basic Auth, чтобы сайт не сломался прямо сейчас.
// В следующих шагах мы заменим её на проверку Токена.
const USERS_OLD = {
    'admin': process.env.ADMIN_PASSWORD || 'admin',
    'astana': process.env.ASTANA_PASSWORD || 'astana',
    'regions': process.env.REGIONS_PASSWORD || 'regions',
    'guest': process.env.GUEST_PASSWORD || 'guest'
};

const authMiddleware = (req, res, next) => {
    // Пропускаем путь логина без пароля!
    if (req.path === '/api/auth/login') return next();

    if (req.path === '/manifest.json' || req.path === '/sw.js' || req.path.endsWith('.png') || req.path.endsWith('.jpg') || req.path.endsWith('.jpeg') || req.path.endsWith('.ico') || req.path.endsWith('.gif')) {
        return next();
    }
    const user = basicAuth({ users: USERS_OLD, challenge: true, unauthorizedResponse: 'Доступ запрещен.' });
    user(req, res, next);
};
app.use(authMiddleware);

// --- STATIC ROUTES (через servePage) ---
app.get('/sw.js', (req, res) => {
    const filePath = __dirname + '/public/sw.js';
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error');
        const js = data.replace(/{{VER}}/g, APP_VERSION);
        res.set('Content-Type', 'application/javascript');
        res.send(js);
    });
});

app.get('/', (req, res) => servePage(res, 'index.html'));
app.get('/map.html', (req, res) => servePage(res, 'map.html'));
app.get('/sales.html', (req, res) => servePage(res, 'sales.html'));
app.get('/competitors.html', (req, res) => servePage(res, 'competitors.html'));
app.get('/products.html', (req, res) => servePage(res, 'products.html'));
app.get('/report.html', (req, res) => servePage(res, 'report.html'));
app.get('/knowledge.html', (req, res) => servePage(res, 'knowledge.html'));
app.get('/dealer.html', (req, res) => servePage(res, 'dealer.html'));

app.use(express.static('public'));

const DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING;

// --- СТАРЫЕ СХЕМЫ (БЕЗ ИЗМЕНЕНИЙ) ---
const statusSchema = new mongoose.Schema({ value: String, label: String, color: String, isVisible: { type: Boolean, default: true }, sortOrder: { type: Number, default: 0 } });
const Status = mongoose.model('Status', statusSchema);
const productSchema = new mongoose.Schema({ sku: String, name: String });
const Product = mongoose.model('Product', productSchema);
const contactSchema = new mongoose.Schema({ name: String, position: String, contactInfo: String }, { _id: false }); 
const photoSchema = new mongoose.Schema({ description: String, photo_url: String, date: { type: Date, default: Date.now } }, { _id: false });
const additionalAddressSchema = new mongoose.Schema({ description: String, city: String, address: String }, { _id: false });
const visitSchema = new mongoose.Schema({ date: String, comment: String, isCompleted: { type: Boolean, default: false } }, { _id: false });
const posMaterialSchema = new mongoose.Schema({ name: String, quantity: Number }, { _id: false });
const competitorSchema = new mongoose.Schema({ brand: String, collection: String, price_opt: String, price_retail: String }, { _id: false });
const collectionItemSchema = new mongoose.Schema({ name: String, type: { type: String, default: 'standard' } }, { _id: false });
const compContactSchema = new mongoose.Schema({ name: String, position: String, phone: String }, { _id: false });
const compRefSchema = new mongoose.Schema({ name: String, country: String, supplier: String, warehouse: String, website: String, instagram: String, info: String, storage_days: String, stock_info: String, reserve_days: String, contacts: [compContactSchema], collections: [collectionItemSchema] });
const CompRef = mongoose.model('CompRef', compRefSchema);
const dealerSchema = new mongoose.Schema({ dealer_id: String, name: String, price_type: String, city: String, address: String, contacts: [contactSchema], bonuses: String, photos: [photoSchema], organizations: [String], contract: { isSigned: Boolean, date: String }, region_sector: String, hasPersonalPlan: { type: Boolean, default: false }, delivery: String, website: String, instagram: String, additional_addresses: [additionalAddressSchema], pos_materials: [posMaterialSchema], visits: [visitSchema], products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], latitude: Number, longitude: Number, status: { type: String, default: 'standard' }, avatarUrl: String, competitors: [competitorSchema], responsible: String });
const Dealer = mongoose.model('Dealer', dealerSchema);
const salesSchema = new mongoose.Schema({ month: String, group: String, dealerId: String, dealerName: String, plan: Number, fact: Number, isCustom: { type: Boolean, default: false } });
const Sales = mongoose.model('Sales', salesSchema);
const Knowledge = mongoose.model('Knowledge', new mongoose.Schema({ title: String, content: String }, { timestamps: true }));

async function connectToDB() {
    if (!DB_CONNECTION_STRING) return console.error("No DB String");
    try { 
        await mongoose.connect(DB_CONNECTION_STRING); 
        console.log('MongoDB Connected'); 
        await seedStatuses();
        await seedUsers(); // <--- Создаем Админа при старте
    } catch (e) { console.error(e); }
}

async function seedStatuses() { const count = await Status.countDocuments(); if (count === 0) { await Status.insertMany([{ value: 'active', label: 'Активный', color: '#198754', isVisible: true, sortOrder: 1 }, { value: 'standard', label: 'Стандарт', color: '#ffc107', isVisible: true, sortOrder: 2 }, { value: 'problem', label: 'Проблемный', color: '#dc3545', isVisible: true, sortOrder: 3 }, { value: 'potential', label: 'Потенциальный', color: '#0d6efd', isVisible: true, sortOrder: 4 }, { value: 'archive', label: 'Архив', color: '#6c757d', isVisible: false, sortOrder: 5 }]); } }

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
function convertToClient(doc) { if(!doc) return null; const obj = doc.toObject ? doc.toObject() : doc; obj.id = obj._id; delete obj._id; delete obj.__v; delete obj.password; if(obj.products) obj.products = obj.products.map(p => { if(p){p.id=p._id; delete p._id;} return p;}); return obj; }
// Временно оставляем старые функции для совместимости, пока не перепишем API
function getUserRole(req) { return req.auth ? req.auth.user : 'guest'; }
function canWrite(req) { return req.auth ? req.auth.user !== 'guest' : false; }
function getDealerFilter(req) { const role = getUserRole(req); if (role === 'admin' || role === 'guest') return {}; if (role === 'astana') return { $or: [{ responsible: 'regional_astana' }, { city: { $regex: /астана/i } }, { city: { $regex: /astana/i } }] }; if (role === 'regions') return { $or: [{ responsible: 'regional_regions' }, { city: { $not: { $regex: /астана/i } }, responsible: { $ne: 'regional_astana' } }] }; return { _id: null }; }
const checkWrite = (req, res, next) => { if (canWrite(req)) next(); else res.status(403).json({error:'Read Only'}); };

app.get('/api/auth/me', (req, res) => { res.json({ role: getUserRole(req) }); });

// --- API (ОСТАЛИСЬ БЕЗ ИЗМЕНЕНИЙ) ---
app.get('/api/statuses', async (req, res) => { const s = await Status.find().sort({sortOrder: 1}).lean(); res.json(s.map(convertToClient)); });
app.post('/api/statuses', checkWrite, async (req, res) => { try { const s = new Status(req.body); await s.save(); res.json(convertToClient(s)); } catch(e){ res.status(500).json({error:e.message}); } });
app.put('/api/statuses/:id', checkWrite, async (req, res) => { try { await Status.findByIdAndUpdate(req.params.id, req.body); res.json({status:'ok'}); } catch(e){ res.status(500).json({error:e.message}); } });
app.delete('/api/statuses/:id', checkWrite, async (req, res) => { await Status.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });
app.get('/api/dealers', async (req, res) => { try { let filter = getDealerFilter(req); if (req.query.scope === 'all') { filter = {}; } const dealers = await Dealer.find(filter).select('-photos -visits -products').lean(); res.json(dealers.map(d => ({ id: d._id, ...d, photo_url: d.avatarUrl }))); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/dealers/:id', async (req, res) => { try { const d = await Dealer.findOne({ _id: req.params.id, ...getDealerFilter(req) }).populate('products'); res.json(convertToClient(d)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/dealers', checkWrite, async (req, res) => { try { const role = getUserRole(req); if (role === 'astana') req.body.responsible = 'regional_astana'; if (role === 'regions') req.body.responsible = 'regional_regions'; const d = new Dealer(req.body); await d.save(); res.status(201).json(convertToClient(d)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put('/api/dealers/:id', checkWrite, async (req, res) => { try { await Dealer.findOneAndUpdate({ _id: req.params.id, ...getDealerFilter(req) }, req.body); res.json({status:'ok'}); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/dealers/:id', checkWrite, async (req, res) => { try { await Dealer.findOneAndDelete({ _id: req.params.id, ...getDealerFilter(req) }); res.json({status:'deleted'}); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/dealers/:id/products', async (req, res) => { const d = await Dealer.findById(req.params.id).populate('products'); res.json(d.products.map(convertToClient)); });
app.put('/api/dealers/:id/products', async (req, res) => { await Dealer.findByIdAndUpdate(req.params.id, { products: req.body.productIds }); res.json({status:'ok'}); });
app.get('/api/products', async (req, res) => { const s = new RegExp(req.query.search||'', 'i'); const p = await Product.find({$or:[{sku:s},{name:s}]}).sort({sku:1}).lean(); res.json(p.map(x=>{x.id=x._id;return x;})); });
app.post('/api/products', checkWrite, async (req, res) => { const p = new Product(req.body); await p.save(); res.json(convertToClient(p)); });
app.put('/api/products/:id', checkWrite, async (req, res) => { const p = await Product.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(p)); });
app.delete('/api/products/:id', checkWrite, async (req, res) => { await Product.findByIdAndDelete(req.params.id); res.json({}); });
app.post('/api/admin/import-catalog', async (req, res) => { if(getUserRole(req) !== 'admin') return res.status(403).json({error:'Admin only'}); res.json({status: 'ok'}); });
app.get('/api/matrix', async (req, res) => { try { const prods = await Product.find().sort({sku:1}).lean(); const dealers = await Dealer.find(getDealerFilter(req)).lean(); const map = new Map(); dealers.forEach(d => map.set(d._id.toString(), new Set(d.products.map(String)))); const posList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"]; const matrix = prods.map(p => ({ sku: p.sku, name: p.name, type: 'product', dealers: dealers.map(d => ({ value: map.get(d._id.toString()).has(p._id.toString()) ? 1 : 0, is_pos: false })) })); posList.forEach(pn => { matrix.push({ sku: "POS", name: pn, type: 'pos', dealers: dealers.map(d => ({ value: (d.pos_materials||[]).find(m=>m.name===pn)?.quantity||0, is_pos: true })) }); }); res.json({ headers: dealers.map(d=>({id:d._id, name:d.name, city:d.city, responsible:d.responsible})), matrix }); } catch (e) { res.status(500).json({error:e.message}); } });
app.get('/api/sales', async (req, res) => { const {month} = req.query; const s = await Sales.find(month ? {month} : {}).lean(); res.json(s); });
app.post('/api/sales', checkWrite, async (req, res) => { const ops = req.body.data.map(i => ({ updateOne: { filter: { month: req.body.month, $or: [{dealerId: i.dealerId}, {dealerName: i.dealerName, isCustom:true}] }, update: {$set: i}, upsert: true } })); await Sales.bulkWrite(ops); res.json({status:'ok'}); });
app.get('/api/competitors-ref', async (req, res) => { const l = await CompRef.find().sort({name:1}); res.json(l.map(convertToClient)); });
app.post('/api/competitors-ref', checkWrite, async (req, res) => { const c = new CompRef(req.body); await c.save(); res.json(convertToClient(c)); });
app.put('/api/competitors-ref/:id', checkWrite, async (req, res) => { await CompRef.findByIdAndUpdate(req.params.id, req.body); res.json({status:'ok'}); });
app.delete('/api/competitors-ref/:id', checkWrite, async (req, res) => { await CompRef.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });
app.get('/api/knowledge', async (req, res) => { const l = await Knowledge.find().sort({title:1}); res.json(l.map(convertToClient)); });
app.get('/api/knowledge/:id', async (req, res) => { res.json(convertToClient(await Knowledge.findById(req.params.id))); });
app.post('/api/knowledge', checkWrite, async (req, res) => { const a = new Knowledge(req.body); await a.save(); res.json(convertToClient(a)); });
app.put('/api/knowledge/:id', checkWrite, async (req, res) => { const a = await Knowledge.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(a)); });
app.delete('/api/knowledge/:id', checkWrite, async (req, res) => { await Knowledge.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });
app.get('/api/tasks', async (req, res) => { try { const data = await Dealer.find(getDealerFilter(req)).select('name visits status responsible').lean(); res.json(data.map(d => ({ id: d._id, name: d.name, status: d.status, visits: d.visits || [], responsible: d.responsible }))); } catch (e) { res.status(500).json([]); } });

app.listen(PORT, () => { console.log(`Server port ${PORT}`); connectToDB(); });
