// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// УБРАЛИ: const basicAuth ...

const app = express();
const PORT = process.env.PORT || 3000; 
app.use(express.json({ limit: '50mb' })); 
app.use(cors());

// --- БЕЗОПАСНОСТЬ УБРАНА (ЧТОБЫ ЗАРАБОТАЛО) ---
// app.use(basicAuth(...));
// ----------------------------------------------

app.use(express.static('public'));

const DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING;

// "Вшитый" список 74 товаров
const productsToImport = [
    { sku: "CD-507", name: "Дуб Беленый" },
    { sku: "CD-508", name: "Дуб Пепельный" },
    { sku: "CD-509", name: "Дуб Северный" },
    { sku: "CD-510", name: "Дуб Сафари" },
    { sku: "8EH34-701", name: "Дуб Снежный" },
    { sku: "8EH34-702", name: "Дуб Арабика" },
    { sku: "8EH34-703", name: "Дуб Мокко" },
    { sku: "8EH34-704", name: "Дуб Капучино" },
    { sku: "8EH34-705", name: "Дуб Голд" },
    { sku: "8EH34-706", name: "Орех Кедровый" },
    { sku: "8EH34-707", name: "Дуб Натур" },
    { sku: "8EH34-708", name: "Дуб Робуста" },
    { sku: "8EH34-709", name: "Дуб Паркетный" },
    { sku: "8EH34-710", name: "Дуб Блэквуд" },
    { sku: "8EH34-711", name: "Дуб Миндаль" },
    { sku: "8EH34-712", name: "Дуб Эмбер" },
    { sku: "8EH34-713", name: "дуб Бурбон" },
    { sku: "8EH34-714", name: "Дуб Твин" },
    { sku: "8EH34-715", name: "Дуб Флорвуд" },
    { sku: "8EH34-716", name: "Дуб Лайт" },
    { sku: "8EH34-717", name: "Дуб Натур светлый" },
    { sku: "8EH34-718", name: "Дуб Хайвуд" },
    { sku: "8EH34-719", name: "Дуб Стоун" },
    { sku: "8EH34-720", name: "Дуб Крафтовый" },
    { sku: "FP-41", name: "Paris Белый" },
    { sku: "FP-42", name: "Paris Серый" },
    { sku: "FP-43", name: "Paris Натур" },
    { sku: "FP-44", name: "Paris Рустик" },
    { sku: "FP-45", name: "Версаль Светлый" },
    { sku: "FP-46", name: "Версаль Капучино" },
    { sku: "MC-101", name: "Орех Испанский" },
    { sku: "MC-102", name: "Орех Венгерский" },
    { sku: "MC-103", name: "Дуб Австрийский" },
    { sku: "MC-104", name: "Клен Канадский" },
    { sku: "MC-105", name: "Сандал Португальский" },
    { sku: "HP-31", name: "Дуб Лоредо светлый" },
    { sku: "HP-32", name: "Дуб Родос темный" },
    { sku: "HP-96", name: "Дуб Алор натуральный" },
    { sku: "HP-91", name: "Дуб Браун" },
    { sku: "HP-92", name: "Дуб Латте" },
    { sku: "HP-93", name: "Дуб Эльбрус" },
    { sku: "HP-94", name: "Дуб Аланда" },
    { sku: "HP-95", name: "Дуб Сантана" },
    { sku: "HP-97", name: "Дуб Айленд" },
    { sku: "RWN-31", name: "Дуб Эверест" },
    { sku: "RWN-32", name: "Дуб Альпийский" },
    { sku: "RWN-33", name: "Дуб Сахара" },
    { sku: "RWN-36", name: "Кедр Гималайкий" },
    { sku: "RWN-37", name: "Дуб Ниагара" },
    { sku: "RWN-39", name: "Дуб Сибирский" },
    { sku: "RWЕ-41", name: "Дуб Жемчужный" }, 
    { sku: "RWE-44", name: "Орех Классик" },
    { sku: "AS-81", name: "Дуб Карибский" },
    { sku: "AS-82", name: "Дуб Средиземноморский" },
    { sku: "AS-83", name: "Дуб Саргасс" },
    { sku: "AS-84", name: "Дуб Песчаный" },
    { sku: "AS-85", name: "Дуб Атлантик" },
    { sku: "RPL-1", name: "Дуб Сицилия" },
    { sku: "RPL-2", name: "Дуб Сицилия темный" },
    { sku: "RPL-4", name: "Дуб Сицилия серый" },
    { sku: "RPL-6", name: "Дуб Бризе" },
    { sku: "RPL-15", name: "Дуб Фламенко" },
    { sku: "RPL-20", name: "Дуб Милан" },
    { sku: "RPL-21", name: "Дуб Флоренция" },
    { sku: "RPL-22", name: "Дуб Неаполь" },
    { sku: "RPL-23", name: "Дуб Монарх" },
    { sku: "RPL-24", name: "Дуб Эмперадор" },
    { sku: "RPL-25", name: "Дуб Авангард" },
    { sku: "RPL-28", name: "Дуб Венеция" },
    { sku: "РФС-1", name: "Расческа их фанеры старая" },
    { sku: "РФ-2", name: "Расческа из фанеры" },
    { sku: "С800", name: "800мм задняя стенка" },
    { sku: "С600", name: "600мм задняя стенка" },
    { sku: "Табличка", name: "Табличка орг.стекло" },
    { sku: "Н800", name: "800мм наклейка" },
    { sku: "Н600", name: "600мм наклейка" }
];

// --- Схемы MONGODB ---
const productSchema = new mongoose.Schema({
    sku: { type: String, required: true, unique: true },
    name: { type: String, required: true }
});
const Product = mongoose.model('Product', productSchema);

const contactSchema = new mongoose.Schema({
    name: String,
    position: String,
    contactInfo: String
}, { _id: false }); 

const photoSchema = new mongoose.Schema({
    description: String,
    photo_url: String
}, { _id: false });

const additionalAddressSchema = new mongoose.Schema({
    description: String,
    city: String,
    address: String
}, { _id: false });

const posMaterialSchema = new mongoose.Schema({
    name: String,
    quantity: Number
}, { _id: false });

const dealerSchema = new mongoose.Schema({
    dealer_id: String,
    name: String,
    price_type: String,
    city: String, 
    address: String, 
    contacts: [contactSchema], 
    bonuses: String,
    photos: [photoSchema], 
    organization: String,
    delivery: String, 
    website: String,
    instagram: String,
    additional_addresses: [additionalAddressSchema],
    pos_materials: [posMaterialSchema],
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
});
const Dealer = mongoose.model('Dealer', dealerSchema);

const knowledgeSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: String
}, { timestamps: true }); 
const Knowledge = mongoose.model('Knowledge', knowledgeSchema);

// --- Синхронизация товаров ---
async function hardcodedImportProducts() {
    try {
        const dbProducts = await Product.find().lean();
        const dbSkus = new Set(dbProducts.map(p => p.sku));
        const codeSkus = new Set(productsToImport.map(p => p.sku));

        const skusToDelete = [...dbSkus].filter(sku => !codeSkus.has(sku));
        if (skusToDelete.length > 0) {
            console.log(`Удаляю ${skusToDelete.length} устаревших товаров...`);
            await Product.deleteMany({ sku: { $in: skusToDelete } });
        }

        const productsToAdd = productsToImport.filter(p => !dbSkus.has(p.sku));
        if (productsToAdd.length > 0) {
            console.log(`Добавляю ${productsToAdd.length} новых товаров...`);
            await Product.insertMany(productsToAdd, { ordered: false }).catch(e => {
                if (e.code !== 11000) console.warn("Ошибка при добавлении:", e.message);
            });
        }
        
        const finalCount = await Product.countDocuments();
        console.log(`Каталог готов. Товаров: ${finalCount}`);
    } catch (error) {
           console.warn(`Ошибка: ${error.message}`);
    }
}

// --- ПОДКЛЮЧЕНИЕ ---
async function connectToDB() {
    if (!DB_CONNECTION_STRING) {
        console.error("Ошибка: DB_CONNECTION_STRING не найдена.");
        return;
    }
    try {
        await mongoose.connect(DB_CONNECTION_STRING);
        console.log("Подключено к MongoDB Atlas!");
        await hardcodedImportProducts();
    } catch (error) {
        console.error("Ошибка подключения к MongoDB:", error.message);
    }
}

// --- Хелпер ---
function convertToClient(mongoDoc) {
    if (!mongoDoc) return null;
    const obj = mongoDoc.toObject ? mongoDoc.toObject() : mongoDoc;
    obj.id = obj._id;
    delete obj._id; 
    delete obj.__v; 
    if (obj.products && Array.isArray(obj.products)) {
        obj.products = obj.products.map(p => {
            if (p) { p.id = p._id; delete p._id; delete p.__v; }
            return p;
        });
    }
    return obj;
}

// === API ROUTES ===

app.get('/api/dealers', async (req, res) => {
    try {
        const dealers = await Dealer.find({}, 'dealer_id name city photos price_type organization').lean();
        const clientDealers = dealers.map(d => {
            d.id = d._id;
            if (d.photos && d.photos.length > 0) d.photo_url = d.photos[0].photo_url; 
            delete d.photos; delete d._id;
            return d;
        }); 
        res.json(clientDealers);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dealers/:id', async (req, res) => {
    try {
        const dealer = await Dealer.findById(req.params.id).populate('products');
        if (!dealer) return res.status(404).json({ message: "Дилер не найден" });
        res.json(convertToClient(dealer)); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dealers', async (req, res) => {
    try {
        const dealer = new Dealer(req.body); 
        await dealer.save();
        res.status(201).json(convertToClient(dealer)); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dealers/:id', async (req, res) => {
    try {
        const dealer = await Dealer.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!dealer) return res.status(404).json({ message: "Дилер не найден" });
        res.json({ message: "success" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/dealers/:id', async (req, res) => {
    try {
        const dealer = await Dealer.findByIdAndDelete(req.params.id);
        if (!dealer) return res.status(404).json({ message: "Дилер не найден" });
        res.json({ message: "deleted" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dealers/:id/products', async (req, res) => {
    try {
        const dealer = await Dealer.findById(req.params.id).populate({
            path: 'products',
            options: { sort: { 'sku': 1 } } 
        });
        if (!dealer) return res.status(404).json({ message: "Дилер не найден" });
        const productsWithId = dealer.products.map(p => convertToClient(p));
        res.json(productsWithId);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dealers/:id/products', async (req, res) => {
    try {
        const dealerId = req.params.id;
        const productIds = req.body.productIds || []; 
        await Dealer.findByIdAndUpdate(dealerId, { products: productIds });
        res.status(200).json({ message: "success" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/products', async (req, res) => {
    try {
        const searchTerm = req.query.search || '';
        const searchRegex = new RegExp(searchTerm, 'i'); 
        const products = await Product.find({
            $or: [ { sku: { $regex: searchRegex } }, { name: { $regex: searchRegex } } ]
        }).sort({ sku: 1 }).lean(); 
        products.forEach(p => { p.id = p._id; }); 
        res.json(products);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', async (req, res) => {
    try {
        const product = new Product(req.body);
        await product.save();
        res.status(201).json(convertToClient(product)); 
    } catch (e) {
        if (e.code === 11000) return res.status(409).json({ "error": "Дубликат SKU" });
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!product) return res.status(404).json({ error: "Товар не найден" });
        res.json(convertToClient(product)); 
    } catch (e) {
        if (e.code === 11000) return res.status(409).json({ "error": "Дубликат SKU" });
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findByIdAndDelete(productId);
        if (!product) return res.status(404).json({ error: "Товар не найден" });
        await Dealer.updateMany({ products: productId }, { $pull: { products: productId } });
        res.json({ message: "deleted" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/matrix', async (req, res) => {
    try {
        const allProducts = await Product.find({}, 'sku name').sort({ sku: 1 }).lean();
        const allDealers = await Dealer.find({}, 'name products').sort({ name: 1 }).lean();
        
        const dealerProductMap = new Map();
        allDealers.forEach(dealer => {
            const productSet = new Set(dealer.products.map(pId => pId.toString()));
            dealerProductMap.set(dealer._id.toString(), productSet);
        });

        const matrix = [];
        allProducts.forEach(product => {
            const productRow = {
                product_id: product._id,
                sku: product.sku,
                name: product.name,
                dealers: [] 
            };
            allDealers.forEach(dealer => {
                const productSet = dealerProductMap.get(dealer._id.toString());
                productRow.dealers.push({
                    dealer_id: dealer._id,
                    name: dealer.name,
                    has_product: productSet.has(product._id.toString())
                });
            });
            matrix.push(productRow);
        });
        const headers = allDealers.map(d => ({ id: d._id, name: d.name }));
        res.json({ headers, matrix });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/products/:id/dealers', async (req, res) => {
    try {
        const dealers = await Dealer.find({ products: req.params.id }, 'dealer_id name city').sort({ name: 1 }).lean(); 
        dealers.forEach(d => { d.id = d._id; }); 
        res.json(dealers);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/knowledge', async (req, res) => {
    try {
        const searchTerm = req.query.search || '';
        const searchRegex = new RegExp(searchTerm, 'i');
        const articles = await Knowledge.find({ title: { $regex: searchRegex } }, 'title createdAt').sort({ title: 1 }).lean();
        articles.forEach(a => { a.id = a._id; });
        res.json(articles);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/knowledge/:id', async (req, res) => {
    try {
        const article = await Knowledge.findById(req.params.id);
        if (!article) return res.status(404).json({ message: "Статья не найдена" });
        res.json(convertToClient(article));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/knowledge', async (req, res) => {
    try {
        const article = new Knowledge(req.body);
        await article.save();
        res.status(201).json(convertToClient(article));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/knowledge/:id', async (req, res) => {
    try {
        const article = await Knowledge.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!article) return res.status(404).json({ error: "Статья не найдена" });
        res.json(convertToClient(article));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/knowledge/:id', async (req, res) => {
    try {
        const article = await Knowledge.findByIdAndDelete(req.params.id);
        if (!article) return res.status(404).json({ error: "Статья не найдена" });
        res.json({ message: "deleted" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// START
app.listen(PORT, () => {
    console.log(`Сервер запущен и слушает порт ${PORT}`);
    connectToDB();
});
