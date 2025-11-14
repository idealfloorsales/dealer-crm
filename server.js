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
    app.get('/map.html', authMiddleware, (req, res) => res.sendFile(__dirname + '/public/map.html')); // Защищаем карту
    app.use(express.static('public'));
} else { app.use(express.static('public')); }

const DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING;

// (Ваш список товаров 79 шт. остается здесь, я его свернул для краткости)
const productsToImport = [
    { sku: "CD-507", name: "Дуб Беленый" },
    // ... ВЕСЬ ВАШ СПИСОК ТОВАРОВ ...
    { sku: "Н600", name: "600мм наклейка" }
];

const productSchema = new mongoose.Schema({ sku: String, name: String });
const Product = mongoose.model('Product', productSchema);
const contactSchema = new mongoose.Schema({ name: String, position: String, contactInfo: String }, { _id: false }); 
const photoSchema = new mongoose.Schema({ description: String, photo_url: String, date: { type: Date, default: Date.now } }, { _id: false });
const additionalAddressSchema = new mongoose.Schema({ description: String, city: String, address: String }, { _id: false });
const posMaterialSchema = new mongoose.Schema({ name: String, quantity: Number }, { _id: false });
const visitSchema = new mongoose.Schema({ date: String, comment: String }, { _id: false });

const dealerSchema = new mongoose.Schema({
    dealer_id: String, name: String, price_type: String, city: String, address: String, 
    // (НОВЫЕ ПОЛЯ) Координаты
    latitude: Number, longitude: Number,
    contacts: [contactSchema], bonuses: String, photos: [photoSchema], organization: String,
    delivery: String, website: String, instagram: String,
    additional_addresses: [additionalAddressSchema], pos_materials: [posMaterialSchema], visits: [visitSchema],
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
});
const Dealer = mongoose.model('Dealer', dealerSchema);
const knowledgeSchema = new mongoose.Schema({ title: String, content: String }, { timestamps: true }); 
const Knowledge = mongoose.model('Knowledge', knowledgeSchema);

async function hardcodedImportProducts() {
    try {
        const count = await Product.countDocuments();
        if(count < 50) { // Простая проверка
             const operations = productsToImport.map(p => ({ updateOne: { filter: { sku: p.sku }, update: { $set: p }, upsert: true } }));
             await Product.bulkWrite(operations);
        }
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
        // Добавляем latitude и longitude в легкий список (для общей карты)
        const dealers = await Dealer.find({}, 'dealer_id name city photos price_type organization products pos_materials latitude longitude').lean();
        res.json(dealers.map(d => ({
            id: d._id, dealer_id: d.dealer_id, name: d.name, city: d.city, price_type: d.price_type, organization: d.organization,
            photo_url: (d.photos && d.photos.length > 0) ? d.photos[0].photo_url : null,
            has_photos: (d.photos && d.photos.length > 0),
            products_count: (d.products ? d.products.length : 0),
            has_pos: (d.pos_materials && d.pos_materials.length > 0),
            latitude: d.latitude, longitude: d.longitude // Отдаем координаты
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

app.get('/api/matrix', async (req, res) => { try { const prods = await Product.find({}, 'sku name').sort({sku:1}).lean(); const dlrs = await Dealer.find({}, 'name products').sort({name:1}).lean(); const map = new Map(); dlrs.forEach(d => map.set(d._id.toString(), new Set(d.products.map(String)))); const matrix = prods.map(p => ({ sku: p.sku, name: p.name, dealers: dlrs.map(d => ({ has_product: map.get(d._id.toString()).has(p._id.toString()) })) })); res.json({ headers: dlrs.map(d => ({id:d._id, name:d.name})), matrix }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/products/:id/dealers', async (req, res) => { const dlrs = await Dealer.find({ products: req.params.id }, 'dealer_id name city').sort({name:1}).lean(); res.json(dlrs.map(d=>{d.id=d._id; return d;})); });

app.get('/api/knowledge', async (req, res) => { const arts = await Knowledge.find({title: new RegExp(req.query.search||'', 'i')}).sort({title:1}).lean(); res.json(arts.map(a=>{a.id=a._id; return a;})); });
app.get('/api/knowledge/:id', async (req, res) => { res.json(convertToClient(await Knowledge.findById(req.params.id))); });
app.post('/api/knowledge', async (req, res) => { const a = new Knowledge(req.body); await a.save(); res.json(convertToClient(a)); });
app.put('/api/knowledge/:id', async (req, res) => { const a = await Knowledge.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(a)); });
app.delete('/api/knowledge/:id', async (req, res) => { await Knowledge.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });

app.listen(PORT, () => { console.log(`Server port ${PORT}`); connectToDB(); });
