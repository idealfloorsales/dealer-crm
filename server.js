const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://admin:admin123@cluster0.mongodb.net/crm?retryWrites=true&w=majority')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error(err));

// --- SCHEMAS (Упрощенные для примера, у вас могут быть свои) ---
const DealerSchema = new mongoose.Schema({
    dealer_id: String,
    name: String,
    city: String,
    address: String,
    status: String,
    responsible: String,
    latitude: String,
    longitude: String,
    price_type: String,
    organization: String,
    delivery: String,
    website: String,
    instagram: String,
    bonuses: String,
    contacts: Array,
    pos_materials: Array,
    visits: Array,
    products: Array,
    competitors: Array,
    photos: Array,
    photo_url: String,
    updatedAt: { type: Date, default: Date.now }
});
const Dealer = mongoose.model('Dealer', DealerSchema);

const StatusSchema = new mongoose.Schema({
    label: String,
    value: String,
    color: String,
    isVisible: Boolean,
    sortOrder: Number
});
const Status = mongoose.model('Status', StatusSchema);

// --- API ROUTES ---

// 1. DEALERS LIST (Optimized)
app.get('/api/dealers', async (req, res) => {
    try {
        // Исключаем тяжелые поля для списка
        const dealers = await Dealer.find().select('-history -photos').sort({ updatedAt: -1 });
        // Преобразуем для фронта
        const result = dealers.map(d => ({
            id: d._id,
            dealer_id: d.dealer_id,
            name: d.name,
            city: d.city,
            status: d.status,
            price_type: d.price_type,
            responsible: d.responsible,
            latitude: d.latitude,
            longitude: d.longitude,
            photo_url: d.photo_url,
            contacts: d.contacts,
            instagram: d.instagram
        }));
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. DEALER DETAIL
app.get('/api/dealers/:id', async (req, res) => {
    try {
        const dealer = await Dealer.findById(req.params.id);
        if (!dealer) return res.status(404).json({ error: 'Not found' });
        res.json({ ...dealer.toObject(), id: dealer._id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. CREATE DEALER
app.post('/api/dealers', async (req, res) => {
    try {
        const dealer = new Dealer(req.body);
        await dealer.save();
        res.json({ ...dealer.toObject(), id: dealer._id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. UPDATE DEALER
app.put('/api/dealers/:id', async (req, res) => {
    try {
        const dealer = await Dealer.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(dealer);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. UPDATE PRODUCTS
app.put('/api/dealers/:id/products', async (req, res) => {
    try {
        const { productIds } = req.body; // Expect array of IDs
        // Тут логика сохранения товаров (упрощенно)
        await Dealer.findByIdAndUpdate(req.params.id, { products: productIds.map(id => ({ id })) });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 6. TASKS (DASHBOARD) - CRITICAL FIX
app.get('/api/tasks', async (req, res) => {
    try {
        const data = await Dealer.find()
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
        console.error("Tasks API Error:", e);
        res.status(500).json([]);
    }
});

// 7. STATUSES
app.get('/api/statuses', async (req, res) => {
    const s = await Status.find().sort({ sortOrder: 1 });
    res.json(s.map(x => ({ ...x.toObject(), id: x._id })));
});
app.post('/api/statuses', async (req, res) => {
    const s = new Status(req.body);
    await s.save();
    res.json(s);
});
app.put('/api/statuses/:id', async (req, res) => {
    await Status.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true });
});
app.delete('/api/statuses/:id', async (req, res) => {
    await Status.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// 8. SALES (MOCK or REAL)
app.get('/api/sales', (req, res) => {
    // Если у вас есть модель Sale, используйте её. Если нет, верните пустой массив пока.
    // Sale.find({ month: req.query.month })...
    res.json([]); 
});

// 9. AUTH MOCK
app.get('/api/auth/me', (req, res) => {
    res.json({ role: 'admin', name: 'User' });
});

// Serve Frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
