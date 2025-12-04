const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const basicAuth = require('express-basic-auth'); 

const app = express();
const PORT = process.env.PORT || 3000; 
app.use(express.json({ limit: '50mb' })); 
app.use(cors());

// --- НАСТРОЙКА ПОЛЬЗОВАТЕЛЕЙ И ПРАВ ---
const USERS = {
    'admin': process.env.ADMIN_PASSWORD || 'admin',       // Все права
    'astana': process.env.ASTANA_PASSWORD || 'astana',    // Только Астана
    'regions': process.env.REGIONS_PASSWORD || 'regions', // Только Регионы
    'guest': process.env.GUEST_PASSWORD || 'guest'        // Только чтение
};

const authMiddleware = basicAuth({
    users: USERS,
    challenge: true,
    unauthorizedResponse: 'Доступ запрещен. Проверьте логин/пароль.'
});

// Применяем авторизацию ко всем маршрутам (и статике, и API)
app.use(authMiddleware);

// Раздача статики (Фронтенд)
app.use(express.static('public', { index: false }));
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));
app.get('/map.html', (req, res) => res.sendFile(__dirname + '/public/map.html'));
app.get('/sales.html', (req, res) => res.sendFile(__dirname + '/public/sales.html'));
app.get('/competitors.html', (req, res) => res.sendFile(__dirname + '/public/competitors.html'));
app.get('/products.html', (req, res) => res.sendFile(__dirname + '/public/products.html'));
app.get('/report.html', (req, res) => res.sendFile(__dirname + '/public/report.html'));
app.get('/knowledge.html', (req, res) => res.sendFile(__dirname + '/public/knowledge.html'));
app.get('/dealer.html', (req, res) => res.sendFile(__dirname + '/public/dealer.html'));
app.use(express.static('public'));

const DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING;

// --- SCHEMAS (ОСТАЛИСЬ ТЕ ЖЕ) ---
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
const compRefSchema = new mongoose.Schema({
    name: String, country: String, supplier: String, warehouse: String, info: String,
    storage_days: String, stock_info: String, reserve_days: String,
    contacts: [compContactSchema], collections: [collectionItemSchema]
});
const CompRef = mongoose.model('CompRef', compRefSchema);

const dealerSchema = new mongoose.Schema({
    dealer_id: String, name: String, price_type: String, city: String, address: String, 
    contacts: [contactSchema], bonuses: String, photos: [photoSchema], organization: String,
    delivery: String, website: String, instagram: String,
    additional_addresses: [additionalAddressSchema], pos_materials: [posMaterialSchema], visits: [visitSchema],
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    latitude: Number, longitude: Number, status: { type: String, default: 'standard' },
    avatarUrl: String, competitors: [competitorSchema], responsible: String
});
const Dealer = mongoose.model('Dealer', dealerSchema);

const salesSchema = new mongoose.Schema({
    month: String, group: String, dealerId: String, dealerName: String, 
    plan: Number, fact: Number, isCustom: { type: Boolean, default: false }
});
const Sales = mongoose.model('Sales', salesSchema);

const Knowledge = mongoose.model('Knowledge', new mongoose.Schema({ title: String, content: String }, { timestamps: true }));

async function connectToDB() {
    if (!DB_CONNECTION_STRING) return console.error("No DB String");
    try { await mongoose.connect(DB_CONNECTION_STRING); console.log('MongoDB Connected'); } catch (e) { console.error(e); }
}

function convertToClient(doc) {
    if(!doc) return null;
    const obj = doc.toObject ? doc.toObject() : doc;
    obj.id = obj._id; delete obj._id; delete obj.__v;
    if(obj.products) obj.products = obj.products.map(p => { if(p){p.id=p._id; delete p._id;} return p;});
    return obj;
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ПРАВ ---
// Узнаем роль пользователя из запроса
function getUserRole(req) {
    return req.auth ? req.auth.user : 'guest';
}

// Проверка прав на запись (POST/PUT/DELETE)
function canWrite(req) {
    const role = getUserRole(req);
    return role !== 'guest'; // Гость не может писать
}

// Фильтр для поиска дилеров
function getDealerFilter(req) {
    const role = getUserRole(req);
    if (role === 'admin' || role === 'guest') return {}; // Видят всех
    if (role === 'astana') return { responsible: 'regional_astana' }; // Только Астана
    if (role === 'regions') return { responsible: 'regional_regions' }; // Только Регионы
    return { _id: null }; // Если роль неизвестна - ничего не показываем
}

// --- API ---

// Узнать "Кто я?" (для фронтенда)
app.get('/api/auth/me', (req, res) => {
    res.json({ role: getUserRole(req) });
});

// DEALERS
app.get('/api/dealers', async (req, res) => {
    try {
        const filter = getDealerFilter(req);
        const dealers = await Dealer.find(filter).lean();
        res.json(dealers.map(d => ({
            id: d._id, ...d, 
            photo_url: d.avatarUrl,
            products_count: (d.products ? d.products.length : 0)
        }))); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dealers/:id', async (req, res) => { 
    try { 
        // При получении одного дилера тоже проверяем права (чтобы регионы не подсматривали по ID)
        const filter = { _id: req.params.id, ...getDealerFilter(req) };
        const dealer = await Dealer.findOne(filter).populate('products'); 
        if(!dealer) return res.status(404).json({error: "Не найдено или нет доступа"});
        res.json(convertToClient(dealer)); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

app.post('/api/dealers', async (req, res) => { 
    if (!canWrite(req)) return res.status(403).json({ error: 'Только чтение' });
    try { 
        const role = getUserRole(req);
        // Если создает регионал, принудительно ставим его ответственным
        if (role === 'astana') req.body.responsible = 'regional_astana';
        if (role === 'regions') req.body.responsible = 'regional_regions';
        
        const dealer = new Dealer(req.body); 
        await dealer.save(); 
        res.status(201).json(convertToClient(dealer)); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

app.put('/api/dealers/:id', async (req, res) => { 
    if (!canWrite(req)) return res.status(403).json({ error: 'Только чтение' });
    try { 
        const filter = { _id: req.params.id, ...getDealerFilter(req) }; // Проверяем, что редактируем своего
        const updated = await Dealer.findOneAndUpdate(filter, req.body); 
        if(!updated) return res.status(404).json({error: "Не найдено или нет прав"});
        res.json({status:'ok'}); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

app.delete('/api/dealers/:id', async (req, res) => { 
    if (!canWrite(req)) return res.status(403).json({ error: 'Только чтение' });
    try { 
        const filter = { _id: req.params.id, ...getDealerFilter(req) };
        const deleted = await Dealer.findOneAndDelete(filter); 
        if(!deleted) return res.status(404).json({error: "Не найдено или нет прав"});
        res.json({status:'deleted'}); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

// PRODUCTS & OTHERS
// Для простоты остальные справочники (товары, конкуренты) видны всем, 
// но редактировать может только не-гость.
const checkWrite = (req, res, next) => { if (canWrite(req)) next(); else res.status(403).json({error:'Read Only'}); };

app.get('/api/products', async (req, res) => { const search = new RegExp(req.query.search || '', 'i'); const products = await Product.find({$or:[{sku:search},{name:search}]}).sort({sku:1}).lean(); res.json(products.map(p=>{p.id=p._id; return p;})); });
app.post('/api/products', checkWrite, async (req, res) => { try { const p = new Product(req.body); await p.save(); res.json(convertToClient(p)); } catch(e){res.status(409).json({});} });
app.put('/api/products/:id', checkWrite, async (req, res) => { try { const p = await Product.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(p)); } catch(e){res.status(409).json({});} });
app.delete('/api/products/:id', checkWrite, async (req, res) => { await Product.findByIdAndDelete(req.params.id); await Dealer.updateMany({ products: req.params.id }, { $pull: { products: req.params.id } }); res.json({}); });
app.get('/api/products/:id/dealers', async (req, res) => { const dlrs = await Dealer.find({ products: req.params.id, ...getDealerFilter(req) }, 'dealer_id name city').sort({name:1}).lean(); res.json(dlrs.map(d=>{d.id=d._id; return d;})); });

// Admin Import (Только админ)
app.post('/api/admin/import-catalog', async (req, res) => {
    if(getUserRole(req) !== 'admin') return res.status(403).json({error:'Admin only'});
    // ... (код импорта, если он нужен)
    res.json({status: 'ok', message: 'Catalog imported'});
});

// Matrix
app.get('/api/matrix', async (req, res) => {
    try {
        const allProducts = await Product.find({}, 'sku name').sort({ sku: 1 }).lean();
        const dealerFilter = getDealerFilter(req);
        const allDealers = await Dealer.find(dealerFilter, 'name products pos_materials city status responsible').sort({ name: 1 }).lean();
        
        const map = new Map(); 
        allDealers.forEach(d => map.set(d._id.toString(), new Set(d.products.map(String))));
        
        const posMaterialsList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"];
        
        const matrix = allProducts.map(p => ({ sku: p.sku, name: p.name, type: 'product', dealers: allDealers.map(d => ({ value: map.get(d._id.toString()).has(p._id.toString()) ? 1 : 0, is_pos: false })) }));
        posMaterialsList.forEach(posName => {
            matrix.push({ sku: "POS", name: posName, type: 'pos', dealers: allDealers.map(d => { const found = (d.pos_materials || []).find(pm => pm.name === posName); return { value: found ? found.quantity : 0, is_pos: true }; }) });
        });
        
        const headers = allDealers.map(d => ({ id: d._id, name: d.name, city: d.city || '', status: d.status || 'standard', responsible: d.responsible || '' }));
        res.json({ headers: headers, matrix });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sales', async (req, res) => {
    try {
        const { month, dealerId } = req.query;
        const filter = {};
        if (month) filter.month = month;
        if (dealerId) filter.dealerId = dealerId;
        const sales = await Sales.find(filter).sort({ month: -1 }).lean();
        res.json(sales);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/sales', checkWrite, async (req, res) => {
    try {
        const { month, data } = req.body;
        const operations = data.map(item => ({ updateOne: { filter: { month: month, $or: [ { dealerId: item.dealerId }, { dealerName: item.dealerName, isCustom: true } ] }, update: { $set: item }, upsert: true } }));
        if (operations.length > 0) await Sales.bulkWrite(operations);
        res.json({ status: 'ok' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/competitors-ref', async (req, res) => { const list = await CompRef.find().sort({name: 1}); res.json(list.map(c => ({ id: c._id, ...c.toObject() }))); });
app.post('/api/competitors-ref', checkWrite, async (req, res) => { const c = new CompRef(req.body); await c.save(); res.json(c); });
app.put('/api/competitors-ref/:id', checkWrite, async (req, res) => { await CompRef.findByIdAndUpdate(req.params.id, req.body); res.json({status: 'ok'}); });
app.delete('/api/competitors-ref/:id', checkWrite, async (req, res) => { await CompRef.findByIdAndDelete(req.params.id); res.json({status: 'deleted'}); });

app.get('/api/knowledge', async (req, res) => { const arts = await Knowledge.find({title: new RegExp(req.query.search||'', 'i')}).sort({title:1}).lean(); res.json(arts.map(a=>{a.id=a._id; return a;})); });
app.get('/api/knowledge/:id', async (req, res) => { res.json(convertToClient(await Knowledge.findById(req.params.id))); });
app.post('/api/knowledge', checkWrite, async (req, res) => { const a = new Knowledge(req.body); await a.save(); res.json(convertToClient(a)); });
app.put('/api/knowledge/:id', checkWrite, async (req, res) => { const a = await Knowledge.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(a)); });
app.delete('/api/knowledge/:id', checkWrite, async (req, res) => { await Knowledge.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });

app.listen(PORT, () => { console.log(`Server port ${PORT}`); connectToDB(); });

