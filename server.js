// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// const basicAuth = require('express-basic-auth'); // Временно отключили

const app = express();
const PORT = process.env.PORT || 3000; 
app.use(express.json({ limit: '50mb' })); 
app.use(cors());

/* --- БЕЗОПАСНОСТЬ ВРЕМЕННО ОТКЛЮЧЕНА ---
if (process.env.ADMIN_USER && process.env.ADMIN_PASSWORD) {
    app.use(basicAuth({
        users: { [process.env.ADMIN_USER]: process.env.ADMIN_PASSWORD }, 
        challenge: true
    }));
}
*/

app.use(express.static('public'));

const DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING;

// --- МОДЕЛИ ---
const productSchema = new mongoose.Schema({ sku: String, name: String });
const Product = mongoose.model('Product', productSchema);

const contactSchema = new mongoose.Schema({ name: String, position: String, contactInfo: String }, { _id: false }); 
const photoSchema = new mongoose.Schema({ description: String, photo_url: String, date: { type: Date, default: Date.now } }, { _id: false });
const additionalAddressSchema = new mongoose.Schema({ description: String, city: String, address: String }, { _id: false });
const posMaterialSchema = new mongoose.Schema({ name: String, quantity: Number }, { _id: false });

const dealerSchema = new mongoose.Schema({
    dealer_id: String, name: String, price_type: String, city: String, address: String, 
    contacts: [contactSchema], bonuses: String, 
    photos: [photoSchema], // Фото храним, но в общий список не отдаем
    organization: String, delivery: String, website: String, instagram: String,
    additional_addresses: [additionalAddressSchema],
    pos_materials: [posMaterialSchema],
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
});
const Dealer = mongoose.model('Dealer', dealerSchema);

const knowledgeSchema = new mongoose.Schema({ title: String, content: String }, { timestamps: true }); 
const Knowledge = mongoose.model('Knowledge', knowledgeSchema);

async function connectToDB() {
    if (!DB_CONNECTION_STRING) return console.error("No DB String");
    try { await mongoose.connect(DB_CONNECTION_STRING); console.log("Connected DB"); } 
    catch (e) { console.error(e); }
}

function convertToClient(doc) {
    if(!doc) return null;
    const obj = doc.toObject ? doc.toObject() : doc;
    obj.id = obj._id; delete obj._id; delete obj.__v;
    if(obj.products) obj.products = obj.products.map(p => { if(p){p.id=p._id; delete p._id;} return p;});
    return obj;
}

// === API ===

// (ИЗМЕНЕНО) СПИСОК ДИЛЕРОВ - БЕЗ ФОТО
// Мы исключаем поле 'photos' (-photos), чтобы список был легким и грузился моментально
app.get('/api/dealers', async (req, res) => {
    try {
        const dealers = await Dealer.find({}, '-photos -products -contacts -additional_addresses -pos_materials').lean();
        // Мы берем только основные поля: ID, Имя, Город, Тип цен, Организация
        res.json(dealers.map(d => { 
            d.id = d._id; 
            d.photo_url = null; // В списке фото показывать не будем (для скорости)
            delete d._id; 
            return d; 
        }));
    } catch (e) { 
        console.error("Ошибка списка дилеров:", e);
        res.status(500).json({ error: e.message }); 
    }
});

// ДЕТАЛЬНЫЙ ПРОСМОТР (Здесь фото есть!)
app.get('/api/dealers/:id', async (req, res) => {
    try {
        const dealer = await Dealer.findById(req.params.id).populate('products');
        if (!dealer) return res.status(404).json({ message: "Дилер не найден" });
        res.json(convertToClient(dealer)); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dealers', async (req, res) => {
    try { const dealer = new Dealer(req.body); await dealer.save(); res.json(convertToClient(dealer)); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dealers/:id', async (req, res) => {
    try { await Dealer.findByIdAndUpdate(req.params.id, req.body); res.json({status:'ok'}); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/dealers/:id', async (req, res) => {
    try { await Dealer.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dealers/:id/products', async (req, res) => {
    try {
        const dealer = await Dealer.findById(req.params.id).populate({path:'products',options:{sort:{'sku':1}}});
        if (!dealer) return res.status(404).json({ message: "Дилер не найден" });
        res.json(dealer.products.map(convertToClient));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dealers/:id/products', async (req, res) => {
    try {
        await Dealer.findByIdAndUpdate(req.params.id, { products: req.body.productIds });
        res.json({status:'ok'});
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// (Остальные API для products, matrix, knowledge - без изменений, они работают)
// ... Вставьте их сюда из прошлого файла, или оставьте как есть, если вы копируете в существующий ...
// Для гарантии я продублирую API матрицы и товаров:

app.get('/api/products', async (req, res) => {
    const search = new RegExp(req.query.search || '', 'i'); 
    const products = await Product.find({$or:[{sku:search},{name:search}]}).sort({sku:1}).lean(); 
    res.json(products.map(p=>{p.id=p._id; return p;}));
});
app.post('/api/products', async (req, res) => { try { const p = new Product(req.body); await p.save(); res.json(convertToClient(p)); } catch(e) { res.status(409).json({error: 'Дубликат'}); } });
app.put('/api/products/:id', async (req, res) => { try { const p = await Product.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(p)); } catch(e) { res.status(409).json({error: 'Дубликат'}); } });
app.delete('/api/products/:id', async (req, res) => { await Product.findByIdAndDelete(req.params.id); await Dealer.updateMany({ products: req.params.id }, { $pull: { products: req.params.id } }); res.json({status:'deleted'}); });

app.get('/api/matrix', async (req, res) => {
    try {
        const allProducts = await Product.find({}, 'sku name').sort({ sku: 1 }).lean();
        const allDealers = await Dealer.find({}, 'name products').sort({ name: 1 }).lean();
        const map = new Map(); allDealers.forEach(d => map.set(d._id.toString(), new Set(d.products.map(String))));
        const matrix = allProducts.map(p => ({ sku: p.sku, name: p.name, dealers: allDealers.map(d => ({ has_product: map.get(d._id.toString()).has(p._id.toString()) })) }));
        res.json({ headers: allDealers.map(d => ({id:d._id, name:d.name})), matrix });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/products/:id/dealers', async (req, res) => {
    const dlrs = await Dealer.find({ products: req.params.id }, 'dealer_id name city').sort({name:1}).lean(); 
    res.json(dlrs.map(d=>{d.id=d._id; return d;}));
});

app.get('/api/knowledge', async (req, res) => { const arts = await Knowledge.find({title: new RegExp(req.query.search||'', 'i')}).sort({title:1}).lean(); res.json(arts.map(a=>{a.id=a._id; return a;})); });
app.get('/api/knowledge/:id', async (req, res) => { res.json(convertToClient(await Knowledge.findById(req.params.id))); });
app.post('/api/knowledge', async (req, res) => { const a = new Knowledge(req.body); await a.save(); res.json(convertToClient(a)); });
app.put('/api/knowledge/:id', async (req, res) => { const a = await Knowledge.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(a)); });
app.delete('/api/knowledge/:id', async (req, res) => { await Knowledge.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });

app.listen(PORT, () => { console.log(`Server started`); connectToDB(); });
