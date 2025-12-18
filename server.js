const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const basicAuth = require('express-basic-auth'); 

const app = express();
const PORT = process.env.PORT || 3000; 
app.use(express.json({ limit: '50mb' })); 
app.use(cors());

// USERS
const USERS = {
    'admin': process.env.ADMIN_PASSWORD || 'admin',
    'astana': process.env.ASTANA_PASSWORD || 'astana',
    'regions': process.env.REGIONS_PASSWORD || 'regions',
    'guest': process.env.GUEST_PASSWORD || 'guest'
};

// AUTH
const authMiddleware = (req, res, next) => {
    if (req.path === '/manifest.json' || req.path === '/sw.js' || req.path.endsWith('.png') || req.path.endsWith('.jpg') || req.path.endsWith('.jpeg') || req.path.endsWith('.ico') || req.path.endsWith('.gif')) {
        return next();
    }
    const user = basicAuth({ users: USERS, challenge: true, unauthorizedResponse: 'Доступ запрещен.' });
    user(req, res, next);
};
app.use(authMiddleware);

// STATIC
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

// --- SCHEMAS ---
const statusSchema = new mongoose.Schema({ 
    value: String, 
    label: String, 
    color: String, 
    isVisible: { type: Boolean, default: true }, 
    sortOrder: { type: Number, default: 0 } 
});
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
const compRefSchema = new mongoose.Schema({ name: String, country: String, supplier: String, warehouse: String, info: String, storage_days: String, stock_info: String, reserve_days: String, contacts: [compContactSchema], collections: [collectionItemSchema] });
const CompRef = mongoose.model('CompRef', compRefSchema);

// --- ОБНОВЛЕННАЯ СХЕМА ДИЛЕРА ---
const dealerSchema = new mongoose.Schema({ 
    dealer_id: String, 
    name: String, 
    price_type: String, 
    city: String, 
    address: String, 
    contacts: [contactSchema], 
    bonuses: String, 
    photos: [photoSchema], 
    
    // ИЗМЕНЕНИЯ ЗДЕСЬ:
    organizations: [String], // Было organization: String, стало массив
    contract: { isSigned: Boolean, date: String }, // Договор
    region_sector: String, // Сектор (Север/Юг...)
    
    delivery: String, 
    website: String, 
    instagram: String, 
    additional_addresses: [additionalAddressSchema], 
    pos_materials: [posMaterialSchema], 
    visits: [visitSchema], 
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], 
    latitude: Number, 
    longitude: Number, 
    status: { type: String, default: 'standard' }, 
    avatarUrl: String, 
    competitors: [competitorSchema], 
    responsible: String 
});
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
    } catch (e) { console.error(e); }
}

async function seedStatuses() {
    const count = await Status.countDocuments();
    if (count === 0) {
        console.log("Seeding default statuses...");
        await Status.insertMany([
            { value: 'active', label: 'Активный', color: '#198754', isVisible: true, sortOrder: 1 },
            { value: 'standard', label: 'Стандарт', color: '#ffc107', isVisible: true, sortOrder: 2 },
            { value: 'problem', label: 'Проблемный', color: '#dc3545', isVisible: true, sortOrder: 3 },
            { value: 'potential', label: 'Потенциальный', color: '#0d6efd', isVisible: true, sortOrder: 4 },
            { value: 'archive', label: 'Архив', color: '#6c757d', isVisible: false, sortOrder: 5 }
        ]);
    }
}

function convertToClient(doc) {
    if(!doc) return null; const obj = doc.toObject ? doc.toObject() : doc;
    obj.id = obj._id; delete obj._id; delete obj.__v;
    if(obj.products) obj.products = obj.products.map(p => { if(p){p.id=p._id; delete p._id;} return p;});
    
    // Совместимость: если есть старое поле organization, переносим его в массив
    if (obj.organization && (!obj.organizations || obj.organizations.length === 0)) {
        obj.organizations = [obj.organization];
    }
    return obj;
}
function getUserRole(req) { return req.auth ? req.auth.user : 'guest'; }
function canWrite(req) { return req.auth ? req.auth.user !== 'guest' : false; }
function getDealerFilter(req) {
    const role = getUserRole(req);
    if (role === 'admin' || role === 'guest') return {}; 
    if (role === 'astana') return { $or: [{ responsible: 'regional_astana' }, { city: { $regex: /астана/i } }, { city: { $regex: /astana/i } }] };
    if (role === 'regions') return { $or: [{ responsible: 'regional_regions' }, { city: { $not: { $regex: /астана/i } }, responsible: { $ne: 'regional_astana' } }] };
    return { _id: null }; 
}
const checkWrite = (req, res, next) => { if (canWrite(req)) next(); else res.status(403).json({error:'Read Only'}); };

// ROUTES
app.get('/api/auth/me', (req, res) => { res.json({ role: getUserRole(req) }); });

app.get('/api/statuses', async (req, res) => { const s = await Status.find().sort({sortOrder: 1}).lean(); res.json(s.map(convertToClient)); });
app.post('/api/statuses', checkWrite, async (req, res) => { try { const s = new Status(req.body); await s.save(); res.json(convertToClient(s)); } catch(e){ res.status(500).json({error:e.message}); } });
app.put('/api/statuses/:id', checkWrite, async (req, res) => { try { await Status.findByIdAndUpdate(req.params.id, req.body); res.json({status:'ok'}); } catch(e){ res.status(500).json({error:e.message}); } });
app.delete('/api/statuses/:id', checkWrite, async (req, res) => { await Status.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });

app.get('/api/dealers', async (req, res) => { try { const dealers = await Dealer.find(getDealerFilter(req)).lean(); res.json(dealers.map(d => ({ id: d._id, ...d, photo_url: d.avatarUrl }))); } catch (e) { res.status(500).json({ error: e.message }); } });
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
app.get('/api/matrix', async (req, res) => { try { const prods = await Product.find().sort({sku:1}).lean(); const dealers = await Dealer.find(getDealerFilter(req)).lean(); const map = new Map(); dealers.forEach(d => map.set(d._id.toString(), new Set(d.products.map(String)))); const posList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"]; const matrix = prods.map(p => ({ sku: p.sku, name: p.name, type: 'product', dealers: dealers.map(d => ({ value: map.get(d._id.toString()).has(p._id.toString()) ? 1 : 0, is_pos: false })) })); posList.forEach(pn => { matrix.push({ sku: "POS", name: pn, type: 'pos', dealers: dealers.map(d => ({ value: (d.pos_materials||[]).find(m=>m.name===pn)?.quantity||0, is_pos: true })) }); }); res.json({ headers: dealers.map(d=>({id:d._id,name:d.name,city:d.city})), matrix }); } catch (e) { res.status(500).json({error:e.message}); } });
app.get('/api/sales', async (req, res) => { const {month} = req.query; const s = await Sales.find(month ? {month} : {}).lean(); res.json(s); });
app.post('/api/sales', checkWrite, async (req, res) => { const ops = req.body.data.map(i => ({ updateOne: { filter: { month: req.body.month, $or: [{dealerId: i.dealerId}, {dealerName: i.dealerName, isCustom:true}] }, update: {$set: i}, upsert: true } })); await Sales.bulkWrite(ops); res.json({status:'ok'}); });
app.get('/api/competitors-ref', async (req, res) => { const l = await CompRef.find().sort({name:1}); res.json(l.map(convertToClient)); });
app.post('/api/competitors-ref', checkWrite, async (req, res) => { const c = new CompRef(req.body); await c.save(); res.json(c); });
app.put('/api/competitors-ref/:id', checkWrite, async (req, res) => { await CompRef.findByIdAndUpdate(req.params.id, req.body); res.json({status:'ok'}); });
app.delete('/api/competitors-ref/:id', checkWrite, async (req, res) => { await CompRef.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });
app.get('/api/knowledge', async (req, res) => { const l = await Knowledge.find().sort({title:1}); res.json(l.map(convertToClient)); });
app.get('/api/knowledge/:id', async (req, res) => { res.json(convertToClient(await Knowledge.findById(req.params.id))); });
app.post('/api/knowledge', checkWrite, async (req, res) => { const a = new Knowledge(req.body); await a.save(); res.json(convertToClient(a)); });
app.put('/api/knowledge/:id', checkWrite, async (req, res) => { const a = await Knowledge.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(a)); });
app.delete('/api/knowledge/:id', checkWrite, async (req, res) => { await Knowledge.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });

// --- TASKS API (Чтобы работал Дашборд) ---
app.get('/api/tasks', async (req, res) => {
    try {
        const data = await Dealer.find(getDealerFilter(req))
            .select('name visits status responsible') 
            .lean();
        res.json(data.map(d => ({
            id: d._id,
            name: d.name,
            status: d.status,
            visits: d.visits || [],
            responsible: d.responsible
        })));
    } catch (e) {
        res.status(500).json([]); 
    }
});

app.listen(PORT, () => { console.log(`Server port ${PORT}`); connectToDB(); });
