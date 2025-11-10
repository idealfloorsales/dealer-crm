// server.js
const express = require('express');
const mongoose = require('mongoose'); // (НОВОЕ) Используем Mongoose
const cors = require('cors');

const app = express();
const PORT = 3000;
app.use(express.json({ limit: '25mb' })); 
app.use(cors());
app.use(express.static('public'));

// (НОВОЕ) Строка подключения (будет взята из Render)
const DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING;

// "Вшитый" список 51 товара (правильный)
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

// --- (НОВОЕ) Модели Базы Данных (Схемы) ---
const productSchema = new mongoose.Schema({
    sku: { type: String, required: true, unique: true },
    name: { type: String, required: true }
});
const Product = mongoose.model('Product', productSchema);

const dealerSchema = new mongoose.Schema({
    dealer_id: String,
    name: String,
    price_type: String,
    city: String,
    address: String,
    contacts: String,
    bonuses: String,
    photo_url: String,
    organization: String,
    // (НОВОЕ) Связь "Многие-ко-Многим"
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
});
const Dealer = mongoose.model('Dealer', dealerSchema);

// --- (НОВАЯ ФУНКЦИЯ) "Вшитый" импорт для MongoDB ---
async function hardcodedImportProducts() {
    try {
        const count = await Product.countDocuments();
        if (count === 0) {
            console.log(`Таблица 'products' пуста. Начинаю "вшитый" импорт...`);
            // insertMany - намного быстрее и надежнее
            await Product.insertMany(productsToImport, { ordered: false });
            const newCount = await Product.countDocuments();
            console.log(`Импорт завершен. В таблицу 'products' загружено ${newCount} товаров.`);
        } else {
            console.log("Таблица 'products' уже содержит данные. Импорт пропущен.");
        }
    } catch (error) {
        console.warn(`Ошибка при импорте: ${error.message}`);
    }
}

// --- (НОВОЕ) Подключение к MongoDB ---
async function connectToDB() {
    if (!DB_CONNECTION_STRING) {
        console.error("Критическая ошибка: Строка подключения 'DB_CONNECTION_STRING' не найдена.");
        console.error("Пожалуйста, добавьте ее в Переменные Окружения (Environment Variables) на Render.");
        return;
    }
    try {
        await mongoose.connect(DB_CONNECTION_STRING);
        console.log("Подключено к базе данных MongoDB Atlas!");
        // Запускаем импорт только после успешного подключения
        await hardcodedImportProducts();
    } catch (error) {
        console.error("Ошибка подключения к MongoDB:", error.message);
    }
}


// === (ПЕРЕПИСАННЫЕ) API ===

// API для Дилеров
app.get('/api/dealers', async (req, res) => {
    try {
        const dealers = await Dealer.find({}, 'dealer_id name city photo_url price_type organization');
        res.json(dealers);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dealers/:id', async (req, res) => {
    try {
        const dealer = await Dealer.findById(req.params.id);
        if (!dealer) return res.status(404).json({ message: "Дилер не найден" });
        res.json(dealer);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dealers', async (req, res) => {
    try {
        const dealer = new Dealer(req.body);
        await dealer.save();
        res.status(201).json(dealer); // Отправляем обратно созданный объект с _id
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

// API для СВЯЗИ Дилеров и Товаров
app.get('/api/dealers/:id/products', async (req, res) => {
    try {
        // Находим дилера и "заполняем" (populate) массив 'products'
        const dealer = await Dealer.findById(req.params.id).populate('products');
        if (!dealer) return res.status(404).json({ message: "Дилер не найден" });
        res.json(dealer.products); // Возвращаем только массив товаров
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dealers/:id/products', async (req, res) => {
    try {
        const dealerId = req.params.id;
        const productIds = req.body.productIds || []; // Ожидаем массив ID
        // Просто обновляем массив 'products' у дилера
        await Dealer.findByIdAndUpdate(dealerId, { products: productIds });
        res.status(200).json({ message: "success" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// API для Товаров
app.get('/api/products', async (req, res) => {
    try {
        const searchTerm = req.query.search || '';
        const searchRegex = new RegExp(searchTerm, 'i'); // 'i' = нечувствительный к регистру
        const products = await Product.find({
            $or: [ // ИЛИ
                { sku: { $regex: searchRegex } },
                { name: { $regex: searchRegex } }
            ]
        }).sort({ name: 1 }); // Сортировка по имени
        res.json(products);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', async (req, res) => {
    try {
        const product = new Product(req.body);
        await product.save();
        res.status(201).json(product);
    } catch (e) {
        if (e.code === 11000) { // Ошибка дубликата
             return res.status(409).json({ "error": "Товар с таким Артикулом (SKU) уже существует" });
        }
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!product) return res.status(404).json({ error: "Товар не найден" });
        res.json({ message: "success", id: product._id, sku: product.sku, name: product.name });
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
        // 1. Находим товар
        const product = await Product.findByIdAndDelete(productId);
        if (!product) return res.status(404).json({ error: "Товар не найден" });
        
        // 2. (НОВОЕ) Удаляем этот товар из всех дилеров, у которых он был
        await Dealer.updateMany(
            { products: productId },
            { $pull: { products: productId } }
        );
        
        res.json({ message: "deleted" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// API для Отчета
app.get('/api/products/:id/dealers', async (req, res) => {
    try {
        // Находим всех дилеров, у которых в массиве 'products'
        // есть ID этого товара
        const dealers = await Dealer.find(
            { products: req.params.id },
            'dealer_id name city' // Возвращаем только эти поля
        ).sort({ name: 1 });
        res.json(dealers);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Запускаем сервер ---
app.listen(PORT, () => {
    console.log(`Сервер запущен и слушает порт ${PORT}`);
    console.log(`Откройте http://localhost:${PORT} в вашем браузере`);
    // Подключаемся к БД ПОСЛЕ запуска сервера
    connectToDB();
});