const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// const basicAuth = require('express-basic-auth'); 
const fs = require('fs'); 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000; 
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_KEY_123'; 

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
        res.send(data.replace(/{{VER}}/g, APP_VERSION));
    });
};

// --- MODELS ---

// 1. User
const User = mongoose.model('User', {
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'regional_astana', 'regional_regions', 'office', 'guest'], default: 'guest' }
});

// 2. Dealer
const Dealer = mongoose.model('Dealer', {
    dealer_id: String,
    name: String,
    organizations: [String],
    price_type: String,
    city: String,
    address: String,
    contacts: [{ name: String, position: String, contactInfo: String }],
    additional_addresses: [{ description: String, city: String, address: String }],
    status: { type: String, default: 'standard' },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    pos_materials: [{ name: String, quantity: Number }],
    visits: [{ date: String, comment: String, isCompleted: Boolean }],
    competitors: [{ brand: String, collection: String, price_opt: String, price_retail: String }],
    contract: { isSigned: Boolean, date: String }, 
    delivery: String,
    website: String,
    instagram: String,
    latitude: String, 
    longitude: String,
    bonuses: String,
    responsible: String,
    region_sector: String,
    photos: [{ photo_url: String }],
    avatarUrl: String,
    createdAt: { type: Date, default: Date.now },
    hasPersonalPlan: { type: Boolean, default: false }
});

// 3. Product (НОВАЯ СХЕМА С ХАРАКТЕРИСТИКАМИ)
const Product = mongoose.model('Product', {
    sku: String,
    name: String,
    is_liquid: { type: Boolean, default: true },
    excel_alias: String,
    stock_qty: Number,
    characteristics: {
        class: String,
        thickness: String,
        bevel: String,
        size: String,
        package_area: String,
        package_qty: String,
        weight: String
    }
});

// 4. Competitor Ref
const CompetitorRef = mongoose.model('CompetitorRef', {
    name: String,
    collections: [mongoose.Schema.Types.Mixed] 
});

// 5. Status
const Status = mongoose.model('Status', {
    value: String,
    label: String,
    color: String,
    isVisible: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
});

// 6. SalesPlan
const SalesPlan = mongoose.model('SalesPlan', {
    dealerId: String, 
    month: String, 
    plan: Number,
    fact: Number
});

// 7. Knowledge Base
const Knowledge = mongoose.model('Knowledge', {
    title: String,
    content: String, 
    category: String,
    createdAt: { type: Date, default: Date.now }
});

// --- MIDDLEWARE: AUTH CHECK ---
const checkAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });
        req.user = user;
        next();
    });
};

const checkWrite = (req, res, next) => {
    if (req.user && (req.user.role === 'guest')) {
        return res.status(403).json({ message: 'Read Only' });
    }
    next();
};

const getDealerFilter = (req) => {
    const role = req.user.role;
    if (role === 'regional_astana') return { responsible: 'regional_astana' };
    if (role === 'regional_regions') return { responsible: 'regional_regions' };
    if (role === 'office') return { responsible: 'office' };
    return {}; 
};

// --- ROUTES: PAGES ---
app.use(express.static('public'));
app.get('/', (req, res) => servePage(res, 'index.html'));
app.get('/login.html', (req, res) => servePage(res, 'login.html'));
app.get('/dealer.html', (req, res) => servePage(res, 'dealer.html'));
app.get('/map.html', (req, res) => servePage(res, 'map.html'));
app.get('/products.html', (req, res) => servePage(res, 'products.html'));
app.get('/sales.html', (req, res) => servePage(res, 'sales.html'));
app.get('/competitors.html', (req, res) => servePage(res, 'competitors.html'));
app.get('/report.html', (req, res) => servePage(res, 'report.html'));
app.get('/knowledge.html', (req, res) => servePage(res, 'knowledge.html'));

// --- ROUTES: API AUTH ---
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ message: 'Wrong password' });

    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { username: user.username, role: user.role } });
});

app.get('/api/auth/me', checkAuth, async (req, res) => {
    const user = await User.findById(req.user.id).select('-passwordHash');
    res.json({ user });
});

// --- ROUTES: API DATA ---
app.use('/api/*', checkAuth); 

// Dealers
app.get('/api/dealers', async (req, res) => {
    const filter = getDealerFilter(req);
    const dealers = await Dealer.find(filter).populate('products').sort({ name: 1 });
    res.json(dealers);
});

app.get('/api/dealers/:id', async (req, res) => {
    const d = await Dealer.findById(req.params.id).populate('products');
    if (!d) return res.status(404).json({ message: 'Not found' });
    res.json(d);
});

app.post('/api/dealers', checkWrite, async (req, res) => {
    try {
        const newDealer = new Dealer(req.body);
        await newDealer.save();
        res.json(newDealer);
    } catch (e) { res.status(500).send(e.message); }
});

app.put('/api/dealers/:id', checkWrite, async (req, res) => {
    try {
        await Dealer.findByIdAndUpdate(req.params.id, req.body);
        res.json({ status: 'updated' });
    } catch (e) { res.status(500).send(e.message); }
});

app.put('/api/dealers/:id/products', checkWrite, async (req, res) => {
    try {
        const { productIds } = req.body;
        const dealer = await Dealer.findById(req.params.id);
        if(!dealer) return res.status(404).send('Not found');
        dealer.products = productIds; 
        await dealer.save();
        res.json({ status: 'ok' });
    } catch(e) { res.status(500).send(e.message); }
});

// Products
app.get('/api/products', async (req, res) => {
    const products = await Product.find().sort({ name: 1 });
    res.json(products);
});

app.post('/api/products', checkWrite, async (req, res) => {
    try {
        // Проверка дублей SKU (только при создании)
        if(req.body.sku) {
            const exist = await Product.findOne({ sku: req.body.sku });
            if(exist) return res.status(400).send('SKU exists');
        }
        const p = new Product(req.body);
        await p.save();
        res.json(p);
    } catch (e) { res.status(500).send(e.message); }
});

app.put('/api/products/:id', checkWrite, async (req, res) => {
    try {
        await Product.findByIdAndUpdate(req.params.id, req.body);
        res.json({ status: 'updated' });
    } catch (e) { res.status(500).send(e.message); }
});

app.delete('/api/products/:id', checkWrite, async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ status: 'deleted' });
    } catch (e) { res.status(500).send(e.message); }
});

// Other refs
app.get('/api/statuses', async (req, res) => {
    let list = await Status.find().sort({ sortOrder: 1 });
    if(list.length === 0) { // Default seed
        await Status.insertMany([
            { value: 'active', label: 'Активный', color: '#198754', sortOrder: 1 },
            { value: 'potential', label: 'Потенциал', color: '#0d6efd', sortOrder: 2 },
            { value: 'standard', label: 'Стандарт', color: '#6c757d', sortOrder: 3 },
            { value: 'problem', label: 'Проблемный', color: '#dc3545', sortOrder: 4 },
            { value: 'archive', label: 'Архив', color: '#000000', sortOrder: 99, isVisible: false }
        ]);
        list = await Status.find();
    }
    res.json(list);
});
app.post('/api/statuses', checkWrite, async (req, res) => { const s = new Status(req.body); await s.save(); res.json(s); });
app.put('/api/statuses/:id', checkWrite, async (req, res) => { await Status.findByIdAndUpdate(req.params.id, req.body); res.json({status:'ok'}); });
app.delete('/api/statuses/:id', checkWrite, async (req, res) => { await Status.findByIdAndDelete(req.params.id); res.json({status:'ok'}); });

// Sales
app.get('/api/sales', async (req, res) => {
    const { month } = req.query; 
    const filter = getDealerFilter(req);
    // Find dealers first
    const dealers = await Dealer.find(filter).select('_id');
    const dealerIds = dealers.map(d => d._id.toString());
    
    const query = { dealerId: { $in: dealerIds } };
    if (month) query.month = month;
    
    const plans = await SalesPlan.find(query);
    res.json(plans);
});

app.post('/api/sales', checkWrite, async (req, res) => {
    const { dealerId, month, plan, fact } = req.body;
    let entry = await SalesPlan.findOne({ dealerId, month });
    if (entry) {
        if(plan !== undefined) entry.plan = plan;
        if(fact !== undefined) entry.fact = fact;
        await entry.save();
    } else {
        entry = new SalesPlan({ dealerId, month, plan: plan||0, fact: fact||0 });
        await entry.save();
    }
    res.json(entry);
});

// Competitors Ref
app.get('/api/competitors-ref', async (req, res) => { const l = await CompetitorRef.find().sort({name:1}); res.json(l); });
app.post('/api/competitors-ref', checkWrite, async (req, res) => { const c = new CompetitorRef(req.body); await c.save(); res.json(c); });
app.put('/api/competitors-ref/:id', checkWrite, async (req, res) => { await CompetitorRef.findByIdAndUpdate(req.params.id, req.body); res.json({status:'ok'}); });
app.delete('/api/competitors-ref/:id', checkWrite, async (req, res) => { await CompetitorRef.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });

// Knowledge
const convertToClient = (doc) => { if(!doc) return null; return { id: doc._id, title: doc.title, content: doc.content, category: doc.category, date: doc.createdAt }; };
app.get('/api/knowledge', async (req, res) => { const l = await Knowledge.find().sort({title:1}); res.json(l.map(convertToClient)); });
app.get('/api/knowledge/:id', async (req, res) => { res.json(convertToClient(await Knowledge.findById(req.params.id))); });
app.post('/api/knowledge', checkWrite, async (req, res) => { const a = new Knowledge(req.body); await a.save(); res.json(convertToClient(a)); });
app.put('/api/knowledge/:id', checkWrite, async (req, res) => { const a = await Knowledge.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(a)); });
app.delete('/api/knowledge/:id', checkWrite, async (req, res) => { await Knowledge.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });

// Tasks (Combined logic)
app.get('/api/tasks', async (req, res) => { 
    try { 
        const data = await Dealer.find(getDealerFilter(req)).select('name visits status responsible').lean(); 
        const tasks = data.map(d => ({ 
            id: d._id, 
            name: d.name, 
            status: d.status, 
            visits: d.visits 
        })); 
        res.json(tasks); 
    } catch(e) { res.status(500).send(e.message); } 
});

// --- СТАРТ СЕРВЕРА (НАДЕЖНЫЙ) ---
const start = async () => {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dealer_db';
        
        // Подключение к БД
        await mongoose.connect(uri);
        console.log('MongoDB Connected');

        // Запуск сервера ТОЛЬКО после подключения к БД
        app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
    } catch (error) {
        console.error('ERROR: Database connection failed:', error.message);
        process.exit(1);
    }
};

start();
