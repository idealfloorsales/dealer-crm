const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const basicAuth = require('express-basic-auth'); 

const app = express();
const PORT = process.env.PORT || 3000; 
app.use(express.json({ limit: '50mb' })); 
app.use(cors());

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const authMiddleware = (req, res, next) => {
    if (!ADMIN_USER || !ADMIN_PASSWORD) return next();
    const user = basicAuth({ users: { [ADMIN_USER]: ADMIN_PASSWORD }, challenge: true, unauthorizedResponse: 'Доступ запрещен.' });
    user(req, res, next);
};

if (ADMIN_USER && ADMIN_PASSWORD) {
    app.use(express.static('public', { index: false }));
    app.get('/', authMiddleware, (req, res) => res.sendFile(__dirname + '/public/index.html'));
    app.get('/map.html', authMiddleware, (req, res) => res.sendFile(__dirname + '/public/map.html'));
    app.get('/sales.html', authMiddleware, (req, res) => res.sendFile(__dirname + '/public/sales.html'));
    app.get('/competitors.html', authMiddleware, (req, res) => res.sendFile(__dirname + '/public/competitors.html'));
    app.get('/products.html', authMiddleware, (req, res) => res.sendFile(__dirname + '/public/products.html'));
    app.get('/report.html', authMiddleware, (req, res) => res.sendFile(__dirname + '/public/report.html'));
    app.get('/knowledge.html', authMiddleware, (req, res) => res.sendFile(__dirname + '/public/knowledge.html'));
    app.use(express.static('public'));
} else { app.use(express.static('public')); }

const DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING;

// --- SCHEMAS ---
const productSchema = new mongoose.Schema({ sku: String, name: String });
const Product = mongoose.model('Product', productSchema);

const contactSchema = new mongoose.Schema({ name: String, position: String, contactInfo: String }, { _id: false }); 
const photoSchema = new mongoose.Schema({ description: String, photo_url: String, date: { type: Date, default: Date.now } }, { _id: false });
const additionalAddressSchema = new mongoose.Schema({ description: String, city: String, address: String }, { _id: false });
const visitSchema = new mongoose.Schema({ date: String, comment: String, isCompleted: { type: Boolean, default: false } }, { _id: false });
const posMaterialSchema = new mongoose.Schema({ name: String, quantity: Number }, { _id: false });
const competitorSchema = new mongoose.Schema({ brand: String, collection: String, price_opt: String, price_retail: String }, { _id: false });

const collectionItemSchema = new mongoose.Schema({ name: String, type: { type: String, default: 'std' } }, { _id: false });
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
const Knowledge = mongoose.model('Knowledge', new mongoose.Schema({ title: String, category: { type: String, default: 'other' }, link: String, content: String }, { timestamps: true }));

async function connectToDB() {
    if (!DB_CONNECTION_STRING) return console.error("No DB String");
    try { await mongoose.connect(DB_CONNECTION_STRING); console.log("DB Connected"); } catch (e) { console.error("DB Error:", e); }
}

function convertToClient(doc) {
    if(!doc) return null;
    const obj = doc.toObject ? doc.toObject() : doc;
    obj.id = obj._id; delete obj._id; delete obj.__v;
    if(obj.products) obj.products = obj.products.map(p => { if(p){p.id=p._id; delete p._id;} return p;});
    return obj;
}

// --- API ---
app.get('/api/dealers', async (req, res) => {
    try {
        const dealers = await Dealer.find({}).lean();
        res.json(dealers.map(d => ({
            id: d._id, 
            ...d, 
            photo_url: d.avatarUrl,
            has_photos: (d.photos && d.photos.length > 0),
            products_count: (d.products ? d.products.length : 0),
            has_pos: (d.pos_materials && d.pos_materials.length > 0)
        }))); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dealers/:id', async (req, res) => { try { const dealer = await Dealer.findById(req.params.id).populate('products'); res.json(convertToClient(dealer)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/dealers', async (req, res) => { try { const dealer = new Dealer(req.body); await dealer.save(); res.status(201).json(convertToClient(dealer)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put('/api/dealers/:id', async (req, res) => { try { await Dealer.findByIdAndUpdate(req.params.id, req.body); res.json({status:'ok'}); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/dealers/:id', async (req, res) => { try { await Dealer.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/dealers/:id/products', async (req, res) => { try { const dealer = await Dealer.findById(req.params.id).populate({path:'products',options:{sort:{'sku':1}}}); res.json(dealer.products.map(convertToClient)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put('/api/dealers/:id/products', async (req, res) => { try { await Dealer.findByIdAndUpdate(req.params.id, { products: req.body.productIds }); res.json({status:'ok'}); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/products', async (req, res) => { const search = new RegExp(req.query.search || '', 'i'); const products = await Product.find({$or:[{sku:search},{name:search}]}).sort({sku:1}).lean(); res.json(products.map(p=>{p.id=p._id; return p;})); });

app.get('/api/matrix', async (req, res) => {
    try {
        const posSkusToExclude = ["С600", "С800", "РФ-2", "РФС-1", "Н600", "Н800", "Табличка"];
        const allProducts = await Product.find({ sku: { $nin: posSkusToExclude } }, 'sku name').sort({ sku: 1 }).lean();
        const allDealers = await Dealer.find({}, 'name products pos_materials city status responsible').sort({ name: 1 }).lean();
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
        const { month, dealerId, from, to } = req.query;
        const filter = {};
        if (month) filter.month = month;
        if (dealerId) filter.dealerId = dealerId;
        if (from && to) filter.month = { $gte: from, $lte: to };
        if (Object.keys(filter).length === 0) return res.json([]);
        const sales = await Sales.find(filter).sort({ month: 1 }).lean();
        res.json(sales);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/sales', async (req, res) => {
    try {
        const { month, data } = req.body;
        const operations = data.map(item => ({ updateOne: { filter: { month: month, $or: [ { dealerId: item.dealerId }, { dealerName: item.dealerName, isCustom: true } ] }, update: { $set: item }, upsert: true } }));
        if (operations.length > 0) await Sales.bulkWrite(operations);
        res.json({ status: 'ok' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/competitors-ref', async (req, res) => { const list = await CompRef.find().sort({name: 1}); res.json(list.map(c => ({ id: c._id, ...c.toObject() }))); });
app.post('/api/competitors-ref', async (req, res) => { const c = new CompRef(req.body); await c.save(); res.json(c); });
app.put('/api/competitors-ref/:id', async (req, res) => { await CompRef.findByIdAndUpdate(req.params.id, req.body); res.json({status: 'ok'}); });
app.delete('/api/competitors-ref/:id', async (req, res) => { await CompRef.findByIdAndDelete(req.params.id); res.json({status: 'deleted'}); });

app.get('/api/knowledge', async (req, res) => { const arts = await Knowledge.find({title: new RegExp(req.query.search||'', 'i')}).sort({title:1}).lean(); res.json(arts.map(a=>{a.id=a._id; return a;})); });
app.get('/api/knowledge/:id', async (req, res) => { res.json(convertToClient(await Knowledge.findById(req.params.id))); });
app.post('/api/knowledge', async (req, res) => { const a = new Knowledge(req.body); await a.save(); res.json(convertToClient(a)); });
app.put('/api/knowledge/:id', async (req, res) => { const a = await Knowledge.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(a)); });
app.delete('/api/knowledge/:id', async (req, res) => { await Knowledge.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });

app.listen(PORT, () => { console.log(`Server port ${PORT}`); connectToDB(); });
