// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000; 
app.use(express.json({ limit: '50mb' })); 
app.use(cors());
app.use(express.static('public'));

const DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING;

const productsToImport = [
    { sku: "CD-504", name: "Дуб Молочный" },
    { sku: "CD-505", name: "Дуб Рустик" },
    { sku: "CD-506", name: "Дуб Серый" },
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
    { sku: "RWN-36", name: "Кедр Гималайкий" }
];

// --- Модели Базы Данных (Схемы) ---
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
    // (НОВЫЕ ПОЛЯ)
    website: String,
    instagram: String,
    
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
});
const Dealer = mongoose.model('Dealer', dealerSchema);

// --- "Вшитый" импорт для MongoDB ---
async function hardcodedImportProducts() {
    try {
        const count = await Product.countDocuments();
        if (count === 0) { 
            console.log(`Таблица 'products' пуста. Начинаю "вшитый" импорт...`);
            await Product.insertMany(productsToImport, { ordered: false });
            const newCount = await Product.countDocuments();
            console.log(`Импорт завершен. В таблицу 'products' загружено ${newCount} товаров.`);
        } else {
            console.log("Таблица 'products' уже содержит данные. Импорт пропущен.");
        }
    } catch (error) {
        if (error.code !== 11000) { 
           console.warn(`Ошибка при импорте: ${error.message}`);
        } else {
           console.log("Таблица 'products' уже содержит данные. Импорт пропущен.");
        }
    }
}

// --- Подключение к MongoDB ---
async function connectToDB() {
    if (!DB_CONNECTION_STRING) {
        console.error("Критическая ошибка: Строка подключения 'DB_CONNECTION_STRING' не найдена.");
        return;
    }
    try {
        await mongoose.connect(DB_CONNECTION_STRING);
        console.log("Подключено к базе данных MongoDB Atlas!");
        await hardcodedImportProducts();
    } catch (error) {
        console.error("Ошибка подключения к MongoDB:", error.message);
    }
}

// --- Преобразователь Объектов (Добавляет 'id') ---
function convertToClient(mongoDoc) {
    if (!mongoDoc) return null;
    const obj = mongoDoc.toObject ? mongoDoc.toObject() : mongoDoc;
    obj.id = obj._id;
    delete obj._id; 
    delete obj.__v; 
    
    if (obj.products && Array.isArray(obj.products)) {
        obj.products = obj.products.map(p => {
            if (p) { 
                p.id = p._id;
                delete p._id;
                delete p.__v;
            }
            return p;
        });
    }
    return obj;
}

// === API для Дилеров ===
app.get('/api/dealers', async (req, res) => {
    try {
        const dealers = await Dealer.find({}, 'dealer_id name city photos price_type organization')
                                    .lean();
        
        const clientDealers = dealers.map(d => {
            d.id = d._id;
            if (d.photos && d.photos.length > 0) {
                d.photo_url = d.photos[0].photo_url; 
            }
            delete d.photos; 
            delete d._id;
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
        // (ИЗМЕНЕНО) 'website' и 'instagram' теперь в req.body
        const dealer = new Dealer(req.body); 
        await dealer.save();
        res.status(201).json(convertToClient(dealer)); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dealers/:id', async (req, res) => {
    try {
        // (ИЗМЕНЕНО) 'website' и 'instagram' теперь в req.body
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

// === API для СВЯЗИ Дилеров и Товаров ===
app.get('/api/dealers/:id/products', async (req, res) => {
    try {
        const dealer = await Dealer.findById(req.params.id).populate('products');
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

// === API для Товаров ===
app.get('/api/products', async (req, res) => {
    try {
        const searchTerm = req.query.search || '';
        const searchRegex = new RegExp(searchTerm, 'i'); 
        const products = await Product.find({
            $or: [ 
                { sku: { $regex: searchRegex } },
                { name: { $regex: searchRegex } }
            ]
        }).sort({ name: 1 }).lean(); 
        
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
        if (e.code === 11000) { 
             return res.status(409).json({ "error": "Товар с таким Артикулом (SKU) уже существует" });
        }
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!product) return res.status(404).json({ error: "Товар не найден" });
        res.json(convertToClient(product)); 
    } catch (e) {
        if (e.code === 11000) {
            return res.status(409).json({ "error": "Товар с таким Артикулом (SKU) уже существует" });
        }
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findByIdAndDelete(productId);
        if (!product) return res.status(404).json({ error: "Товар не найден" });
        
        await Dealer.updateMany(
            { products: productId },
            { $pull: { products: productId } }
        );
        
        res.json({ message: "deleted" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// === API для Отчета ===
app.get('/api/products/:id/dealers', async (req, res) => {
    try {
        const dealers = await Dealer.find(
            { products: req.params.id },
            'dealer_id name city' 
        ).sort({ name: 1 }).lean(); 
        
        dealers.forEach(d => { d.id = d._id; }); 
        res.json(dealers);
        
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Запускаем сервер ---
app.listen(PORT, () => {
    console.log(`Сервер запущен и слушает порт ${PORT}`);
    connectToDB();
});
