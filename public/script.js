// server.js
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
    app.use(express.static('public'));
} else { app.use(express.static('public')); }

const DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING;

// --- СПИСОК ТОВАРОВ (72 шт.) ---
const productsToImport = [
    { sku: "CD-507", name: "Дуб Беленый" }, { sku: "CD-508", name: "Дуб Пепельный" },
    { sku: "8EH34-701", name: "Дуб Снежный" }, { sku: "8EH34-702", name: "Дуб Арабика" },
    { sku: "8EH34-703", name: "Дуб Мокко" }, { sku: "8EH34-704", name: "Дуб Капучино" },
    { sku: "8EH34-705", name: "Дуб Голд" }, { sku: "8EH34-706", name: "Орех Кедровый" },
    { sku: "8EH34-707", name: "Дуб Натур" }, { sku: "8EH34-708", name: "Дуб Робуста" },
    { sku: "8EH34-709", name: "Дуб Паркетный" }, { sku: "8EH34-710", name: "Дуб Блэквуд" },
    { sku: "8EH34-711", name: "Дуб Миндаль" }, { sku: "8EH34-712", name: "Дуб Эмбер" },
    { sku: "8EH34-713", name: "дуб Бурбон" }, { sku: "8EH34-714", name: "Дуб Твин" },
    { sku: "8EH34-715", name: "Дуб Флорвуд" }, { sku: "8EH34-716", name: "Дуб Лайт" },
    { sku: "8EH34-717", name: "Дуб Натур светлый" }, { sku: "8EH34-718", name: "Дуб Хайвуд" },
    { sku: "8EH34-719", name: "Дуб Стоун" }, { sku: "8EH34-720", name: "Дуб Крафтовый" },
    { sku: "FP-41", name: "Paris Белый" }, { sku: "FP-42", name: "Paris Серый" },
    { sku: "FP-43", name: "Paris Натур" }, { sku: "FP-44", name: "Paris Рустик" },
    { sku: "FP-45", name: "Версаль Светлый" }, { sku: "FP-46", name: "Версаль Капучино" },
    { sku: "MC-101", name: "Орех Испанский" }, { sku: "MC-102", name: "Орех Венгерский" },
    { sku: "MC-103", name: "Дуб Австрийский" }, { sku: "MC-104", name: "Клен Канадский" },
    { sku: "MC-105", name: "Сандал Португальский" }, { sku: "HP-31", name: "Дуб Лоредо светлый" },
    { sku: "HP-32", name: "Дуб Родос темный" }, { sku: "HP-96", name: "Дуб Алор натуральный" },
    { sku: "HP-91", name: "Дуб Браун" }, { sku: "HP-92", name: "Дуб Латте" },
    { sku: "HP-93", name: "Дуб Эльбрус" }, { sku: "HP-94", name: "Дуб Аланда" },
    { sku: "HP-95", name: "Дуб Сантана" }, { sku: "HP-97", name: "Дуб Айленд" },
    { sku: "RWN-31", name: "Дуб Эверест" }, { sku: "RWN-32", name: "Дуб Альпийский" },
    { sku: "RWN-33", name: "Дуб Сахара" }, { sku: "RWN-36", name: "Кедр Гималайкий" },
    { sku: "RWN-37", name: "Дуб Ниагара" }, { sku: "RWN-39", name: "Дуб Сибирский" },
    { sku: "RWЕ-41", name: "Дуб Жемчужный" }, { sku: "RWE-44", name: "Орех Классик" },
    { sku: "RWZ-03", name: "Дуб Винтаж" }, { sku: "RWZ-05", name: "Дуб Меланж" }, { sku: "RWZ-06", name: "Дуб Магнат" },
    { sku: "AS-81", name: "Дуб Карибский" }, { sku: "AS-82", name: "Дуб Средиземноморский" },
    { sku: "AS-83", name: "Дуб Саргасс" }, { sku: "AS-84", name: "Дуб Песчаный" },
    { sku: "AS-85", name: "Дуб Атлантик" }, { sku: "RPL-1", name: "Дуб Сицилия" },
    { sku: "RPL-2", name: "Дуб Сицилия темный" }, { sku: "RPL-4", name: "Дуб Сицилия серый" },
    { sku: "RPL-6", name: "Дуб Бризе" }, { sku: "RPL-15", name: "Дуб Фламенко" },
    { sku: "RPL-20", name: "Дуб Милан" }, { sku: "RPL-21", name: "Дуб Флоренция" },
    { sku: "RPL-22", name: "Дуб Неаполь" }, { sku: "RPL-23", name: "Дуб Монарх" },
    { sku: "RPL-24", name: "Дуб Эмперадор" }, { sku: "RPL-25", name: "Дуб Авангард" },
    { sku: "RPL-28", name: "Дуб Венеция" }
];

const productSchema = new mongoose.Schema({ sku: String, name: String });
const Product = mongoose.model('Product', productSchema);
const contactSchema = new mongoose.Schema({ name: String, position: String, contactInfo: String }, { _id: false }); 
const photoSchema = new mongoose.Schema({ description: String, photo_url: String, date: { type: Date, default: Date.now } }, { _id: false });
const additionalAddressSchema = new mongoose.Schema({ description: String, city: String, address: String }, { _id: false });
const visitSchema = new mongoose.Schema({ date: String, comment: String, isCompleted: { type: Boolean, default: false } }, { _id: false });
const posMaterialSchema = new mongoose.Schema({ name: String, quantity: Number }, { _id: false });

const dealerSchema = new mongoose.Schema({
    dealer_id: String, name: String, price_type: String, city: String, address: String, 
    contacts: [contactSchema], bonuses: String, photos: [photoSchema], organization: String,
    delivery: String, website: String, instagram: String,
    additional_addresses: [additionalAddressSchema], 
    pos_materials: [posMaterialSchema], 
    visits: [visitSchema],
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    latitude: Number, longitude: Number,
    status: { type: String, default: 'standard' },
    avatarUrl: String
});
const Dealer = mongoose.model('Dealer', dealerSchema);
const knowledgeSchema = new mongoose.Schema({ title: String, content: String }, { timestamps: true }); 
const Knowledge = mongoose.model('Knowledge', knowledgeSchema);

async function hardcodedImportProducts() {
    try {
        const operations = productsToImport.map(p => ({ updateOne: { filter: { sku: p.sku }, update: { $set: p }, upsert: true } }));
        await Product.bulkWrite(operations);
        console.log("Каталог (только ламинат) обновлен.");
    } catch (e) { console.warn(e.message); }
}

async function connectToDB() {
    if (!DB_CONNECTION_STRING) return console.error("No DB String");
    try { await mongoose.connect(DB_CONNECTION_STRING); await hardcodedImportProducts(); } catch (e) { console.error(e); }
}

function convertToClient(doc) {
    if(!doc) return null;
    const obj = doc.toObject ? doc.toObject() : doc;
    obj.id = obj._id; delete obj._id; delete obj.__v;
    if(obj.products) obj.products = obj.products.map(p => { if(p){p.id=p._id; delete p._id;} return p;});
    return obj;
}

// API
app.get('/api/dealers', async (req, res) => {
    try {
        const dealers = await Dealer.find({}, 'dealer_id name city price_type organization products pos_materials visits latitude longitude status avatarUrl').lean();
        res.json(dealers.map(d => ({
            id: d._id, dealer_id: d.dealer_id, name: d.name, city: d.city, price_type: d.price_type, organization: d.organization,
            photo_url: d.avatarUrl,
            has_photos: (d.photos && d.photos.length > 0),
            products_count: (d.products ? d.products.length : 0),
            has_pos: (d.pos_materials && d.pos_materials.length > 0), 
            visits: d.visits, latitude: d.latitude, longitude: d.longitude,
            status: d.status || 'standard'
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
app.post('/api/products', async (req, res) => { try { const p = new Product(req.body); await p.save(); res.json(convertToClient(p)); } catch(e){res.status(409).json({});} });
app.put('/api/products/:id', async (req, res) => { try { const p = await Product.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(p)); } catch(e){res.status(409).json({});} });
app.delete('/api/products/:id', async (req, res) => { await Product.findByIdAndDelete(req.params.id); await Dealer.updateMany({ products: req.params.id }, { $pull: { products: req.params.id } }); res.json({}); });

// --- (ИЗМЕНЕНО) API Матрицы ---
app.get('/api/matrix', async (req, res) => {
    try {
        const allProducts = await Product.find({}, 'sku name').sort({ sku: 1 }).lean();
        // (ИЗМЕНЕНО) Получаем Город и Статус
        const allDealers = await Dealer.find({}, 'name products city status').sort({ name: 1 }).lean();
        
        const map = new Map(); 
        allDealers.forEach(d => map.set(d._id.toString(), new Set(d.products.map(String))));
        
        const matrix = allProducts.map(p => ({
            sku: p.sku, name: p.name,
            dealers: allDealers.map(d => ({ has_product: map.get(d._id.toString()).has(p._id.toString()) }))
        }));
        
        // (ИЗМЕНЕНО) Отправляем полные данные в заголовках
        const headers = allDealers.map(d => ({
            id: d._id, 
            name: d.name,
            city: d.city || '',
            status: d.status || 'standard'
        }));
        
        res.json({ headers: headers, matrix });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/products/:id/dealers', async (req, res) => { const dlrs = await Dealer.find({ products: req.params.id }, 'dealer_id name city').sort({name:1}).lean(); res.json(dlrs.map(d=>{d.id=d._id; return d;})); });
app.get('/api/knowledge', async (req, res) => { const arts = await Knowledge.find({title: new RegExp(req.query.search||'', 'i')}).sort({title:1}).lean(); res.json(arts.map(a=>{a.id=a._id; return a;})); });
app.get('/api/knowledge/:id', async (req, res) => { res.json(convertToClient(await Knowledge.findById(req.params.id))); });
app.post('/api/knowledge', async (req, res) => { const a = new Knowledge(req.body); await a.save(); res.json(convertToClient(a)); });
app.put('/api/knowledge/:id', async (req, res) => { const a = await Knowledge.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(a)); });
app.delete('/api/knowledge/:id', async (req, res) => { await Knowledge.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });

app.listen(PORT, () => { console.log(`Server port ${PORT}`); connectToDB(); });
