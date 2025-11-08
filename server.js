// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path'); // (НОВОЕ) Подключаем 'path'

const app = express();
const PORT = 3000;
app.use(express.json({ limit: '25mb' })); 
app.use(cors());
app.use(express.static('public'));

// (ИЗМЕНЕНО) Указываем путь к базе данных
// process.env.DATA_DIR - это папка, которую нам даст Render
// Если ее нет (на localhost), используется текущая папка '.'
const dbPath = path.resolve(process.env.DATA_DIR || '.', 'dealers.db');
console.log(`Путь к базе данных: ${dbPath}`);

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

// --- Подключение к Базе Данных (ИЗМЕНЕНО) ---
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Ошибка при подключении к БД:", err.message);
    } else {
        console.log('Подключено к базе данных SQLite.');
        db.run("PRAGMA foreign_keys = ON;"); 

        // Принудительная очистка таблиц при каждом запуске
        // (Мы оставим это, чтобы при каждом "перезапуске" на Render база очищалась)
        // (Если вы хотите, чтобы данные СОХРАНЯЛИСЬ между перезапусками, 
        //  мы УБЕРЕМ этот блок, но только ПОСЛЕ первого успешного запуска)
        console.log("Принудительная очистка старых таблиц...");
        db.serialize(() => {
            db.run(`DROP TABLE IF EXISTS dealer_products_link`);
            db.run(`DROP TABLE IF EXISTS products`);
            db.run(`DROP TABLE IF EXISTS dealers`);

            console.log("Очистка завершена. Создание новых таблиц...");

            db.run(`CREATE TABLE IF NOT EXISTS dealers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dealer_id TEXT, name TEXT, price_type TEXT, city TEXT,
                address TEXT, contacts TEXT, bonuses TEXT, photo_url TEXT,
                organization TEXT
            )`, (err) => {
                if (err) console.error("Ошибка при создании таблицы 'dealers':", err.message);
            });

            db.run(`CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sku TEXT UNIQUE,
                name TEXT
            )`, (err) => {
                if (err) {
                    console.error("Ошибка при создании таблицы 'products':", err.message);
                } else {
                    hardcodedImportProducts();
                }
            });
            
            db.run(`CREATE TABLE IF NOT EXISTS dealer_products_link (
                dealer_id INTEGER,
                product_id INTEGER,
                FOREIGN KEY(dealer_id) REFERENCES dealers(id) ON DELETE CASCADE,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
                PRIMARY KEY (dealer_id, product_id)
            )`, (err) => {
                 if (err) console.error("Ошибка при создании таблицы 'dealer_products_link':", err.message);
            });
        });
    }
});

// --- "Вшитый" импорт ---
function hardcodedImportProducts() {
    console.log(`Начинаю "вшитый" импорт...`);
    const sql = `INSERT INTO products (sku, name) VALUES (?, ?)`;
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        productsToImport.forEach(product => {
            db.run(sql, [product.sku, product.name], (err) => {
                if (err && !err.message.includes('UNIQUE constraint failed')) {
                    console.warn(`Ошибка при импорте SKU ${product.sku}: ${err.message}`);
                }
            });
        });
        db.run("COMMIT", (err) => {
            if(!err) {
                console.log('Импорт завершен.');
                db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
                    if(row) console.log(`В таблицу 'products' загружено ${row.count} товаров.`);
                });
            } else {
                 console.error("Ошибка при COMMIT транзакции:", err.message);
            }
        });
    });
}


// === API для Дилеров ===
app.get('/api/dealers', (req, res) => {
    const sql = "SELECT id, dealer_id, name, city, photo_url, price_type, organization FROM dealers";
    db.all(sql, [], (err, rows) => {
        if (err) res.status(500).json({ "error": err.message });
        else res.json(rows);
    });
});
app.get('/api/dealers/:id', (req, res) => {
    db.get("SELECT * FROM dealers WHERE id = ?", [req.params.id], (err, row) => {
        if (err) res.status(500).json({ "error": err.message });
        else if (row) res.json(row);
        else res.status(404).json({ "message": "Дилер не найден" });
    });
});
app.post('/api/dealers', (req, res) => {
    const data = req.body;
    const sql = `INSERT INTO dealers (dealer_id, name, price_type, city, address, contacts, bonuses, photo_url, organization)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
        data.dealer_id, data.name, data.price_type, data.city,
        data.address, data.contacts, data.bonuses, data.photo_url, data.organization
    ];
    db.run(sql, params, function (err) {
        if (err) res.status(500).json({ "error": err.message });
        else res.status(201).json({ "id": this.lastID, ...data });
    });
});
app.put('/api/dealers/:id', (req, res) => {
    const data = req.body;
    const sql = `UPDATE dealers SET
        dealer_id = ?, name = ?, price_type = ?, city = ?, address = ?,
        contacts = ?, bonuses = ?, photo_url = ?, organization = ?
        WHERE id = ?`;
    const params = [
        data.dealer_id, data.name, data.price_type, data.city,
        data.address, data.contacts, data.bonuses, data.photo_url,
        data.organization, req.params.id
    ];
    db.run(sql, params, function (err) {
        if (err) res.status(500).json({ "error": err.message });
        else res.json({ "message": "success", "changes": this.changes });
    });
});
app.delete('/api/dealers/:id', (req, res) => {
    db.run("DELETE FROM dealers WHERE id = ?", [req.params.id], function (err) {
        if (err) res.status(500).json({ "error": err.message });
        else res.json({ "message": "deleted", "changes": this.changes });
    });
});

// === API для СВЯЗИ Дилеров и Товаров ===
app.get('/api/dealers/:id/products', (req, res) => {
    const sql = `SELECT p.id, p.sku, p.name 
                 FROM products p
                 JOIN dealer_products_link l ON p.id = l.product_id
                 WHERE l.dealer_id = ?`;
    db.all(sql, [req.params.id], (err, rows) => {
        if (err) res.status(500).json({ "error": err.message });
        else res.json(rows);
    });
});
app.put('/api/dealers/:id/products', (req, res) => {
    const dealerId = req.params.id;
    const productIds = req.body.productIds || []; 
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("DELETE FROM dealer_products_link WHERE dealer_id = ?", [dealerId]);
        const sql = `INSERT INTO dealer_products_link (dealer_id, product_id) VALUES (?, ?)`;
        productIds.forEach(productId => {
            db.run(sql, [dealerId, productId], (err) => {
                if (err) console.warn(`Ошибка при вставке связи: ${err.message}`);
            });
        });
        db.run("COMMIT", (err) => {
            if(err) res.status(500).json({ "error": err.message });
            else res.status(200).json({ "message": "success" });
        });
    });
});

// === API для Товаров ===
app.get('/api/products', (req, res) => {
    const searchTerm = req.query.search || ''; 
    const sql = `SELECT * FROM products 
                 WHERE sku LIKE ? OR name LIKE ?
                 ORDER BY name ASC`;
    const params = [`%${searchTerm}%`, `%${searchTerm}%`];
    db.all(sql, params, (err, rows) => {
        if (err) res.status(500).json({ "error": err.message });
        else res.json(rows);
    });
});
app.post('/api/products', (req, res) => {
    const { sku, name } = req.body;
    if (!sku || !name) {
        return res.status(400).json({ "error": "Необходим Артикул (SKU) и Название" });
    }
    const sql = `INSERT INTO products (sku, name) VALUES (?, ?)`;
    db.run(sql, [sku, name], function (err) {
        if (err) {
             if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ "error": "Товар с таким Артикулом (SKU) уже существует" });
             }
             res.status(500).json({ "error": err.message });
        } else {
             res.status(201).json({ "id": this.lastID, sku, name });
        }
    });
});
app.put('/api/products/:id', (req, res) => {
    const { sku, name } = req.body;
    const id = req.params.id;
    if (!sku || !name) {
        return res.status(400).json({ "error": "Необходим Артикул (SKU) и Название" });
    }
    const sql = `UPDATE products SET sku = ?, name = ? WHERE id = ?`;
    db.run(sql, [sku, name, id], function (err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ "error": "Товар с таким Артикулом (SKU) уже существует" });
            }
            res.status(500).json({ "error": err.message });
        } else if (this.changes === 0) {
            res.status(404).json({ "error": "Товар не найден" });
        } else {
            res.json({ message: "success", id, sku, name });
        }
    });
});
app.delete('/api/products/:id', (req, res) => {
    const id = req.params.id;
    const sql = `DELETE FROM products WHERE id = ?`;
    db.run(sql, [id], function (err) {
        if (err) {
            res.status(500).json({ "error": err.message });
        } else if (this.changes === 0) {
            res.status(404).json({ "error": "Товар не найден" });
        } else {
            res.json({ "message": "deleted", "changes": this.changes });
        }
    });
});

// === API для Отчета ===
app.get('/api/products/:id/dealers', (req, res) => {
    const productId = req.params.id;
    const sql = `SELECT d.id, d.dealer_id, d.name, d.city
                 FROM dealers d
                 JOIN dealer_products_link l ON d.id = l.dealer_id
                 WHERE l.product_id = ?
                 ORDER BY d.name ASC`;
    db.all(sql, [productId], (err, rows) => {
        if (err) res.status(500).json({ "error": err.message });
        else res.json(rows);
    });
});


// --- Запускаем сервер ---
app.listen(PORT, () => {
    console.log(`Сервер запущен и слушает порт ${PORT}`);
    console.log(`Откройте http://localhost:${PORT} в вашем браузере`);
});