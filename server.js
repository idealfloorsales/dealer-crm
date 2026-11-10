const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs'); 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

// Render terminates TLS and forwards the real client address through X-Forwarded-For.
// Trust exactly one proxy hop so express-rate-limit can safely resolve req.ip.
app.set('trust proxy', 1);

let appReady = false;
let shuttingDown = false;
let serverInstance = null;
let dbReconnectTimer = null;
let dbConnectInFlight = null; 
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
if (!process.env.JWT_SECRET) console.warn('JWT_SECRET is not configured: sessions will reset after server restart.'); 

const APP_ORIGIN = String(process.env.APP_ORIGIN || 'https://dealer-crm.onrender.com').replace(/\/+$/, '');
const ALLOWED_ORIGINS = new Set([
    APP_ORIGIN,
    process.env.RENDER_EXTERNAL_URL,
    process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : ''
].filter(Boolean).map(value => String(value).replace(/\/+$/, '')));

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '50mb' }));
app.use(cors({
    origin(origin, callback) {
        if (!origin || ALLOWED_ORIGINS.has(String(origin).replace(/\/+$/, ''))) return callback(null, true);
        return callback(null, false);
    },
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'],
    maxAge: 86400
}));
app.use(compression());

function healthPayload() {
    const dbState = mongoose.connection.readyState;
    return {
        ok: appReady && dbState === 1 && !shuttingDown,
        ready: appReady,
        shuttingDown,
        db: dbState === 1 ? 'connected'
            : dbState === 2 ? 'connecting'
            : dbState === 3 ? 'disconnecting'
            : 'disconnected',
        uptimeSec: Math.round(process.uptime()),
        version: process.env.RENDER_GIT_COMMIT || process.env.RENDER_SERVICE_ID || 'local'
    };
}

// Liveness: process is responding. Useful for external monitoring.
app.get('/healthz', (req, res) => {
    const payload = healthPayload();
    res.status(payload.ok ? 200 : 503).json(payload);
});

// Readiness: only 200 after MongoDB connection + startup migrations/seeds are complete.
app.get('/readyz', (req, res) => {
    const payload = healthPayload();
    res.status(payload.ok ? 200 : 503).json(payload);
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Слишком много неудачных попыток входа. Попробуйте позже.' }
});
app.use('/api/auth/login', loginLimiter);

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
        let html = data.replace(/{{VER}}/g, APP_VERSION);
        if (data.includes('permissions.js')) {
            html = html.replace('</body>', `<script src="/employee-presence.js?v=${APP_VERSION}"></script></body>`);
        }
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(html);
    });
};

// ==========================================
// МОДЕЛЬ ПОЛЬЗОВАТЕЛЯ
// ==========================================
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    fullName: String,
    lastName: String,
    firstName: String,
    middleName: String,
    phone: String,
    email: String,
    position: String,
    department: String,
    officeCity: String,
    hireDate: String,
    employmentStatus: { type:String, enum:['working','vacation','away','dismissed'], default:'working' },
    avatarUrl: String,
    lastLoginAt: Date,
    lastSeenAt: Date,
    isBlocked: { type: Boolean, default: false },
    role: { type: String, enum: ['admin', 'manager', 'guest', 'marketing', 'workshop'], default: 'manager' },
    scope: { type: String, enum: ['all', 'astana', 'regions'], default: 'all' },
    permissions: {
        can_view_dealers: { type: Boolean, default: true },
        can_view_map: { type: Boolean, default: true },
        can_view_products: { type: Boolean, default: true },
        can_view_report: { type: Boolean, default: true },
        can_view_sales: { type: Boolean, default: true },
        can_view_competitors: { type: Boolean, default: true },
        can_view_knowledge: { type: Boolean, default: true },
        can_view_dashboard: { type: Boolean, default: true },
        can_view_reclamations: { type: Boolean, default: true },
        can_view_workshop: { type: Boolean, default: false },
        can_view_pricing: { type: Boolean, default: false },
        can_create_dealer: { type: Boolean, default: false },
        can_edit_dealer: { type: Boolean, default: false },
        can_delete_dealer: { type: Boolean, default: false },
        can_manage_visits: { type: Boolean, default: false },
        can_edit_matrix: { type: Boolean, default: false },
        can_edit_sales_fact: { type: Boolean, default: false },
        can_edit_sales_plan: { type: Boolean, default: false },
        can_manage_products: { type: Boolean, default: false },
        can_manage_competitors: { type: Boolean, default: false },
        can_manage_knowledge: { type: Boolean, default: false },
        can_manage_reclamations: { type: Boolean, default: false },
        can_manage_workshop: { type: Boolean, default: false },
        can_manage_pricing: { type: Boolean, default: false },
        can_export_base: { type: Boolean, default: false },
        can_export_prices: { type: Boolean, default: false },
        can_manage_users: { type: Boolean, default: false },
        is_admin: { type: Boolean, default: false }
    }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);
const { employeePresence } = require('./server/employee-presence');
const { coverageOf, latestActivity, salesForCoverage } = require('./server/employee-profile-stats');

// ==========================================
// ЕДИНЫЙ ЖУРНАЛ ДЕЙСТВИЙ CRM
// ==========================================
const auditLogSchema = new mongoose.Schema({
    actor: { id: String, username: String, name: String, role: String },
    module: { type: String, index: true },
    action: { type: String, index: true },
    method: String,
    path: String,
    entityType: String,
    entityId: String,
    entityLabel: String,
    summary: String,
    success: { type: Boolean, default: true },
    statusCode: Number,
    requestData: mongoose.Schema.Types.Mixed,
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    changes: [mongoose.Schema.Types.Mixed],
    meta: mongoose.Schema.Types.Mixed
}, { timestamps: true });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ 'actor.id': 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// --- ФУНКЦИЯ СОЗДАНИЯ АДМИНА ---
async function seedUsers() {
    const admin = await User.findOne({ username: 'admin' });
    const adminPermissions = {
        is_admin: true,
        can_manage_users: true,
        can_view_dealers: true,
        can_view_map: true,
        can_view_products: true,
        can_view_report: true,
        can_view_sales: true,
        can_view_competitors: true,
        can_view_knowledge: true,
        can_view_dashboard: true,
        can_view_reclamations: true,
        can_view_workshop: true,
        can_view_pricing: true,
        can_create_dealer: true,
        can_edit_dealer: true,
        can_delete_dealer: true,
        can_manage_visits: true,
        can_edit_matrix: true,
        can_edit_sales_fact: true,
        can_edit_sales_plan: true,
        can_manage_products: true,
        can_manage_competitors: true,
        can_manage_knowledge: true,
        can_manage_reclamations: true,
        can_manage_workshop: true,
        can_manage_pricing: true,
        can_export_base: true,
        can_export_prices: true
    };

    if (!admin) {
        console.log('Создание первого администратора...');
        const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;
        if (!initialAdminPassword) {
            console.warn('Admin user is missing. Set INITIAL_ADMIN_PASSWORD to create the first administrator.');
            return;
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(initialAdminPassword, salt);
        await User.create({
            username: 'admin',
            password: hashedPassword,
            fullName: 'Главный Администратор',
            role: 'admin',
            scope: 'all',
            permissions: adminPermissions
        });
        console.log('Администратор создан из INITIAL_ADMIN_PASSWORD.');
    } else {
        admin.permissions = adminPermissions;
        admin.role = 'admin';
        admin.scope = 'all';
        if (admin.isBlocked === undefined) admin.isBlocked = false;
        await admin.save();
        console.log('Права администратора принудительно обновлены.');
    }

    // Least privilege: только явная роль admin сохраняет административные права.
    // Старые менеджеры с ошибочно выставленными флагами автоматически очищаются.
    await User.updateMany(
        { role:{ $ne:'admin' }, username:{ $ne:'admin' } },
        { $set:{ 'permissions.is_admin':false, 'permissions.can_manage_users':false } }
    );
}

// ==========================================
// НОВАЯ ЗАЩИТА (JWT MIDDLEWARE)
// ==========================================
const authMiddleware = (req, res, next) => {
    if (req.method === 'OPTIONS') return next(); 
    if (req.path === '/api/auth/login' || req.path === '/api/public/telegram' || req.path.startsWith('/api/public/price-share/') || req.path.startsWith('/api/public/offers/') || !req.path.startsWith('/api')) return next();

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

    jwt.verify(token, JWT_SECRET, async (err, tokenUser) => {
        if (err) return res.status(403).json({ error: 'Токен недействителен' });
        try {
            const dbUser = await User.findById(tokenUser.id).lean();
            if (!dbUser || dbUser.isBlocked) {
                return res.status(403).json({ error: 'Доступ заблокирован' });
            }
            const normalizedRole = dbUser.permissions?.is_admin === true ? 'admin' : (dbUser.role || 'manager');
            const normalizedPermissions = { ...(dbUser.permissions || {}) };
            if (normalizedRole !== 'admin') {
                normalizedPermissions.is_admin = false;
                normalizedPermissions.can_manage_users = false;
            }
            req.user = {
                id: dbUser._id.toString(),
                username: dbUser.username,
                fullName: dbUser.fullName,
                lastName: dbUser.lastName || '',
                firstName: dbUser.firstName || '',
                middleName: dbUser.middleName || '',
                phone: dbUser.phone || '',
                email: dbUser.email || '',
                position: dbUser.position || '',
                role: normalizedRole,
                scope: dbUser.scope || 'all',
                permissions: normalizedPermissions
            };
            next();
        } catch (e) {
            return res.status(500).json({ error: 'Ошибка проверки доступа' });
        }
    });
};
const AUDIT_MUTATION_METHODS = new Set(['POST','PUT','PATCH','DELETE']);
const AUDIT_SECRET_KEY = /(password|token|authorization|secret|jwt|cookie)/i;
const AUDIT_FILE_KEY = /(photo|photos|image|images|avatar|media|video|file|files|attachment|attachments|base64|documentData)/i;

function auditSanitize(value, key = '', depth = 0) {
    if (AUDIT_SECRET_KEY.test(key)) return '[скрыто]';
    if (AUDIT_FILE_KEY.test(key)) {
        if (Array.isArray(value)) return '[файлов: ' + value.length + ']';
        return value ? '[файл]' : value;
    }
    if (value === null || value === undefined) return value;
    if (depth > 5) return '[…]';
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return '[buffer: ' + value.length + ' bytes]';
    if (typeof value === 'string') return value.length > 700 ? value.slice(0,700) + '…' : value;
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) {
        const max = 50;
        const list = value.slice(0,max).map(item => auditSanitize(item,key,depth+1));
        if (value.length > max) list.push('[… ещё ' + (value.length-max) + ']');
        return list;
    }
    const out = {};
    Object.entries(value).forEach(([childKey, childValue]) => {
        if (childKey === '__v') return;
        out[childKey] = auditSanitize(childValue, childKey, depth + 1);
    });
    return out;
}

function auditComparable(value) {
    try { return JSON.stringify(value); } catch (_) { return String(value); }
}

function auditDiff(before, after, prefix = '', changes = [], depth = 0) {
    if (changes.length >= 80) return changes;
    if (depth > 4) {
        if (auditComparable(before) !== auditComparable(after)) changes.push({ field: prefix || 'данные', before, after });
        return changes;
    }
    const beforeObj = before && typeof before === 'object' && !Array.isArray(before);
    const afterObj = after && typeof after === 'object' && !Array.isArray(after);
    if (beforeObj && afterObj) {
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
        keys.forEach(key => {
            if (['_id','id','createdAt','updatedAt'].includes(key)) return;
            auditDiff(before[key], after[key], prefix ? prefix + '.' + key : key, changes, depth + 1);
        });
        return changes;
    }
    if (auditComparable(before) !== auditComparable(after)) changes.push({ field: prefix || 'данные', before, after });
    return changes;
}

function auditRouteMeta(req) {
    const path = req.path || '';
    let module = 'system';
    let entityType = 'record';
    if (path.startsWith('/api/admin/users')) { module='users'; entityType='user'; }
    else if (path.startsWith('/api/dealers') && path.includes('/products')) { module='matrix'; entityType='dealer'; }
    else if (path.startsWith('/api/dealers') && path.includes('/visits')) { module='visits'; entityType='dealer'; }
    else if (path.startsWith('/api/dealers')) { module='dealers'; entityType='dealer'; }
    else if (path.startsWith('/api/products') || path.startsWith('/api/admin/import-catalog')) { module='products'; entityType='product'; }
    else if (path.startsWith('/api/sales')) { module='sales'; entityType='sales'; }
    else if (path.startsWith('/api/competitors-ref')) { module='competitors'; entityType='competitor'; }
    else if (path.startsWith('/api/knowledge')) { module='knowledge'; entityType='article'; }
    else if (path.startsWith('/api/reclamations')) { module='reclamations'; entityType='reclamation'; }
    else if (path.startsWith('/api/workshop')) { module='workshop'; entityType='workshop'; }
    else if (path.startsWith('/api/price-control')) { module='pricing'; entityType='price_control'; }
    else if (path.startsWith('/api/pricing')) { module='pricing'; entityType='pricing'; }
    else if (path.startsWith('/api/exports')) { module='exports'; entityType='export'; }
    else if (path.startsWith('/api/statuses') || path.startsWith('/api/sectors')) { module='settings'; entityType=path.startsWith('/api/statuses')?'status':'sector'; }
    let action = req.method === 'DELETE' ? 'delete' : ((req.method === 'PUT' || req.method === 'PATCH') ? 'update' : 'create');
    if (path === '/api/sales' || path.startsWith('/api/exports') || path === '/api/workshop/print-log' || path === '/api/workshop/correction' || /\/visits(?:\/|$)/.test(path) || /\/receive$/.test(path) || /\/material-movement$/.test(path) || /\/production$/.test(path) || /\/writeoff$/.test(path) || /\/dealer-movement$/.test(path) || /\/opening-balance$/.test(path) || /\/stocktake$/.test(path) || path === '/api/admin/import-catalog') action='execute';
    return { module, entityType, action };
}

function auditModelDescriptor(req, responseBody = null) {
    const path = req.path || '';
    let m;
    if ((m=path.match(/^\/api\/admin\/users\/([^/]+)$/))) return {model:User,id:m[1],entityType:'user'};
    if ((m=path.match(/^\/api\/statuses\/([^/]+)$/))) return {model:Status,id:m[1],entityType:'status'};
    if ((m=path.match(/^\/api\/sectors\/([^/]+)$/))) return {model:Sector,id:m[1],entityType:'sector'};
    if ((m=path.match(/^\/api\/dealers\/([^/]+)/))) return {model:Dealer,id:m[1],entityType:'dealer'};
    if ((m=path.match(/^\/api\/pricing\/conditions\/([^/]+)$/))) return {model:PricingCondition,id:m[1],entityType:'pricing'};
    if ((m=path.match(/^\/api\/products\/([^/]+)$/))) return {model:Product,id:m[1],entityType:'product'};
    if ((m=path.match(/^\/api\/competitors-ref\/([^/]+)$/))) return {model:CompRef,id:m[1],entityType:'competitor'};
    if ((m=path.match(/^\/api\/knowledge\/([^/]+)$/))) return {model:Knowledge,id:m[1],entityType:'article'};
    if ((m=path.match(/^\/api\/reclamations\/([^/]+)$/))) return {model:Reclamation,id:m[1],entityType:'reclamation'};
    if ((m=path.match(/^\/api\/workshop\/materials\/([^/]+)$/))) return {model:WorkshopMaterial,id:m[1],entityType:'workshop_material'};
    if ((m=path.match(/^\/api\/workshop\/recipes\/([^/]+)$/))) return {model:WorkshopRecipe,id:m[1],entityType:'workshop_recipe'};
    if ((m=path.match(/^\/api\/workshop\/memos\/([^/]+)(?:\/receive)?$/))) return {model:WorkshopMemo,id:m[1],entityType:'workshop_memo'};
    if ((m=path.match(/^\/api\/workshop\/productions\/([^/]+)$/))) return {model:WorkshopProduction,id:m[1],entityType:'workshop_production'};
    const responseId = responseBody && (responseBody.id || responseBody._id);
    if (!responseId) return null;
    if (path === '/api/dealers') return {model:Dealer,id:responseId,entityType:'dealer'};
    if (path === '/api/statuses') return {model:Status,id:responseId,entityType:'status'};
    if (path === '/api/sectors') return {model:Sector,id:responseId,entityType:'sector'};
    if (path === '/api/products') return {model:Product,id:responseId,entityType:'product'};
    if (path === '/api/competitors-ref') return {model:CompRef,id:responseId,entityType:'competitor'};
    if (path === '/api/knowledge') return {model:Knowledge,id:responseId,entityType:'article'};
    if (path === '/api/reclamations') return {model:Reclamation,id:responseId,entityType:'reclamation'};
    if (path === '/api/pricing/conditions') return {model:PricingCondition,id:responseId,entityType:'pricing'};
    if (path === '/api/workshop/materials') return {model:WorkshopMaterial,id:responseId,entityType:'workshop_material'};
    if (path === '/api/workshop/recipes') return {model:WorkshopRecipe,id:responseId,entityType:'workshop_recipe'};
    if (path === '/api/workshop/memos') return {model:WorkshopMemo,id:responseId,entityType:'workshop_memo'};
    if (path === '/api/workshop/production') return {model:WorkshopProduction,id:responseId,entityType:'workshop_production'};
    return null;
}

async function auditLoadSnapshot(req, responseBody = null) {
    try {
        const d = auditModelDescriptor(req,responseBody);
        if (d?.model && d.id) {
            const query = d.model.findById(d.id);
            if (d.model === User) query.select('-password');
            const doc = await query.lean();
            return doc ? auditSanitize(doc) : null;
        }
        if (req.path === '/api/admin/users' && req.method === 'POST' && req.body?.username) {
            const doc = await User.findOne({ username: String(req.body.username).trim().toLowerCase() }).select('-password').lean();
            return doc ? auditSanitize(doc) : null;
        }
        return null;
    } catch (_) { return null; }
}

function auditEntityLabel(before, after, requestData) {
    const src = after || before || requestData || {};
    return String(src.name || src.dealerName || src.productName || src.title || src.username || src.number || src.sku || src.code || src.dealer_id || '').trim();
}

function auditSummary(req, route, label) {
    const path=req.path || '';
    const suffix=label ? ' «'+label+'»' : '';
    if (path === '/api/dealers' && req.method === 'POST' && req.body && req.body._cloneSourceId) {
        const source=String(req.body._cloneSourceLabel || req.body._cloneSourceDealerId || '').trim();
        return 'Продублировал дилера' + suffix + (source ? ' из «'+source+'»' : '');
    }
    if (path.includes('/visits')) return (req.method==='POST'?'Добавил визит дилеру':'Изменил визит дилера') + suffix;
    if (path.includes('/dealers/') && path.endsWith('/products')) return 'Изменил выставленность дилера' + suffix;
    if (path === '/api/sales') return 'Сохранил продажи' + (req.body?.month ? ' за '+req.body.month : '');
    if (path.endsWith('/receive')) return 'Принял упаковки в цех' + suffix;
    if (path.endsWith('/material-movement')) return 'Провёл движение материала в цехе';
    if (path.endsWith('/production')) return 'Записал производство в цехе';
    if (path.endsWith('/writeoff')) return 'Провёл списание в цехе';
    if (path.endsWith('/dealer-movement')) return 'Провёл выдачу / возврат по дилеру';
    if (path.endsWith('/opening-balance')) return 'Зафиксировал стартовые остатки цеха';
    if (path.endsWith('/stocktake')) return 'Провёл инвентаризацию цеха';
    if (path === '/api/workshop/correction') {
        const count=Array.isArray(req.body?.lines)?req.body.lines.length:0;
        const reason=String(req.body?.reason||'').trim();
        return 'Исправил остаток цеха' + (count>1?' · '+count+' позиции':'') + (reason?' · '+reason:'');
    }
    if (path === '/api/workshop/print-log') {
        const title=String(req.body?.title||req.body?.type||'документ').trim();
        return 'Распечатал документ цеха · '+title;
    }
    if (path === '/api/admin/import-catalog') return 'Импортировал товарную матрицу';
    if (path === '/api/exports/log') {
        const type=String(req.body?.type||'');
        const rows=Math.max(0,Number(req.body?.rowCount)||0);
        const scope=String(req.body?.scope||'');
        const scopeLabel=scope==='all'?'вся доступная база':(scope==='working'?'все рабочие дилеры':'текущая выборка');
        return type==='prices'
            ? 'Выгрузил цены конкурентов в Excel · '+rows+' строк · '+scopeLabel
            : 'Выгрузил базу дилеров в Excel · '+rows+' строк · '+scopeLabel;
    }
    const nouns={users:'сотрудника',dealers:'дилера',products:'товар',competitors:'конкурента',knowledge:'статью',reclamations:'рекламацию',pricing:'ценовое условие',exports:'выгрузку',settings:'настройку',workshop:'запись цеха',matrix:'выставленность',sales:'продажи'};
    const verbs={create:'Добавил',update:'Изменил',delete:'Удалил',execute:'Выполнил действие с'};
    return (verbs[route.action] || 'Изменил') + ' ' + (nouns[route.module] || 'запись') + suffix;
}

function auditCompactRequest(req) {
    const body=req.body || {};
    if (req.path === '/api/sales') return auditSanitize({month:body.month,rows:Array.isArray(body.data)?body.data.length:0,data:Array.isArray(body.data)?body.data.slice(0,25):[]});
    return auditSanitize(body);
}

async function auditMutationMiddleware(req,res,next) {
    if (!req.path.startsWith('/api') || !AUDIT_MUTATION_METHODS.has(req.method)) return next();
    if (req.path === '/api/auth/login' || req.path === '/api/auth/presence' || req.path === '/api/public/telegram' || req.path.startsWith('/api/telegram') || req.path.startsWith('/api/audit')) return next();
    const requestData=auditCompactRequest(req);
    const before=await auditLoadSnapshot(req);
    let responseBody=null;
    const originalJson=res.json.bind(res);
    res.json=(body)=>{responseBody=body;return originalJson(body);};
    res.on('finish',()=>{
        setImmediate(async()=>{
            try {
                const route=auditRouteMeta(req);
                const success=res.statusCode>=200 && res.statusCode<400;
                const after=success && req.method!=='DELETE' ? await auditLoadSnapshot(req,responseBody) : null;
                const label=auditEntityLabel(before,after,requestData);
                const descriptor=auditModelDescriptor(req,responseBody);
                await AuditLog.create({
                    actor:{id:String(req.user?.id||''),username:String(req.user?.username||''),name:String(req.user?.fullName||req.user?.username||'Пользователь'),role:String(req.user?.role||'')},
                    module:route.module,action:route.action,method:req.method,path:req.originalUrl||req.path,
                    entityType:descriptor?.entityType||route.entityType,entityId:String(descriptor?.id||after?._id||after?.id||responseBody?.id||responseBody?._id||req.params?.id||''),entityLabel:label,
                    summary:auditSummary(req,route,label),success,statusCode:res.statusCode,requestData,before,after,
                    changes:before&&after?auditDiff(before,after):[],
                    meta:{ip:String(req.headers['x-forwarded-for']||req.ip||'').split(',')[0].trim(),userAgent:auditSanitize(String(req.headers['user-agent']||''),'userAgent')}
                });
            } catch(error) { console.error('Audit log write failed:',error.message); }
        });
    });
    next();
}

app.use(authMiddleware);
app.use(auditMutationMiddleware);

// --- API ВХОДА ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: 'Неверный логин' });
        if (user.isBlocked) return res.status(403).json({ error: 'Аккаунт заблокирован' });

        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ error: 'Неверный пароль' });

        const token = jwt.sign(
            { id: user._id, role: user.role || 'manager', scope: user.scope || 'all' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        user.lastLoginAt = new Date();
        user.lastSeenAt = user.lastLoginAt;
        await user.save();

        res.json({
            token,
            user: {
                id: user._id, username: user.username, fullName: user.fullName,
                lastName: user.lastName || '', firstName: user.firstName || '', middleName: user.middleName || '',
                phone: user.phone || '', email: user.email || '', position: user.position || '',
                role: user.permissions?.is_admin === true ? 'admin' : (user.role || 'manager'), scope: user.scope || 'all',
                permissions: user.permissions?.is_admin === true
                    ? (user.permissions || {})
                    : { ...(user.permissions || {}), is_admin:false, can_manage_users:false }
            }
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', async (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            username: req.user.username,
            fullName: req.user.fullName,
            lastName: req.user.lastName || '',
            firstName: req.user.firstName || '',
            middleName: req.user.middleName || '',
            phone: req.user.phone || '',
            email: req.user.email || '',
            position: req.user.position || '',
            role: req.user.role || 'manager',
            scope: req.user.scope || 'all',
            permissions: req.user.permissions || {}
        }
    });
});

app.post('/api/auth/presence', async (req,res) => {
    try {
        const now = new Date();
        await User.updateOne({ _id:req.user.id, $or:[{lastSeenAt:{$lt:new Date(now.getTime()-30000)}},{lastSeenAt:{$exists:false}},{lastSeenAt:null}] }, {$max:{lastSeenAt:now}}, {timestamps:false});
        res.json({ok:true});
    } catch (_) { res.status(503).json({error:'Не удалось обновить статус присутствия'}); }
});
// API УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ
function isAdminUser(req) {
    return Boolean(req.user && req.user.role === 'admin' && req.user.permissions?.is_admin === true);
}

function hasPermission(req, permission) {
    if (!req.user || !req.user.permissions) return false;
    if (permission === 'can_manage_users') return isAdminUser(req);
    return Boolean(isAdminUser(req) || req.user.permissions[permission]);
}

const requirePermission = (permission) => (req, res, next) => {
    if (!hasPermission(req, permission)) {
        return res.status(403).json({ error: 'Недостаточно прав', permission });
    }
    next();
};

const requireAnyPermission = (...permissions) => (req, res, next) => {
    if (isAdminUser(req)) return next();
    if (!permissions.some(permission => hasPermission(req, permission))) {
        return res.status(403).json({ error: 'Недостаточно прав', permissions });
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!isAdminUser(req)) return res.status(403).json({ error:'Доступ только для администратора' });
    next();
};
const requireIsAdmin = requireAdmin;

async function employeeStatusWithHistory(user) {
    const presence=employeePresence(user);
    const action=await AuditLog.findOne({'actor.id':String(user._id)}).sort({createdAt:-1}).select('createdAt').lean();
    return {...presence,lastSeenAt:latestActivity(user,action?.createdAt)};
}
app.get('/api/admin/users/presence', requireAdmin, async (req,res) => {
    try {
        const users=await User.find().select('_id lastSeenAt lastLoginAt isBlocked').lean();
        res.json(await Promise.all(users.map(async user=>({id:String(user._id),...await employeeStatusWithHistory(user)}))));
    } catch (_) {res.status(503).json({error:'Не удалось обновить статусы сотрудников'});}
});
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(await Promise.all(users.map(async user=>({...user.toObject(),...await employeeStatusWithHistory(user.toObject())}))));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

function almatyMonthKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone:'Asia/Almaty',
        year:'numeric',
        month:'2-digit'
    }).formatToParts(date);
    const year = parts.find(part => part.type === 'year')?.value || String(date.getUTCFullYear());
    const month = parts.find(part => part.type === 'month')?.value || String(date.getUTCMonth()+1).padStart(2,'0');
    return year + '-' + month;
}

app.get('/api/admin/users/:id/profile-stats', requireAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password').lean();
        if (!user) return res.status(404).json({ error:'Сотрудник не найден' });

        const userId = String(user._id);
        const month = almatyMonthKey();
        const monthStart = new Date(month + '-01T00:00:00+05:00');
        const nextMonth = new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)-5*60*60*1000);
        const since7d = new Date(Date.now() - 7*24*60*60*1000);

        const coverage = coverageOf(user);
        const dealerFilter = coverage.filter;

        const [dealers, salesRows, recentActions, actions7d, offersThisMonth] = await Promise.all([
            Dealer.find(dealerFilter)
                .select('_id dealer_id name city status visits createdAt responsible')
                .sort({ name:1 })
                .lean(),
            Sales.find({ month }).lean(),
            AuditLog.find({ 'actor.id':userId }).sort({ createdAt:-1 }).limit(12).lean(),
            AuditLog.countDocuments({ 'actor.id':userId, createdAt:{ $gte:since7d } }),
            CommercialOffer.countDocuments({
                'createdBy.id':userId,
                createdAt:{ $gte:monthStart, $lt:nextMonth }
            })
        ]);

        const isPotential = dealer => /^(potential|prospect|потенц)/i.test(String(dealer?.status || ''));
        const currentMonthVisits = dealers.reduce((sum,dealer) => {
            const visits = Array.isArray(dealer.visits) ? dealer.visits : [];
            return sum + visits.filter(visit =>
                visit?.isCompleted === true &&
                String(visit?.date || '').startsWith(month)
            ).length;
        },0);


        const potential = dealers.filter(isPotential);
        const working = dealers.filter(dealer => !isPotential(dealer) && !/^(archive|архив)/i.test(String(dealer.status||'')));
        const sales = salesForCoverage(salesRows,working,coverage.scope);

        res.json({
            month,
            coverage:{scope:coverage.scope,label:coverage.label},
            employee:{
                id:userId,
                fullName:user.fullName || '',
                lastLoginAt:user.lastLoginAt || null,
                ...employeePresence(user),
                lastSeenAt:latestActivity(user,recentActions[0]?.createdAt)
            },
            dealers:{
                total:dealers.length,
                working:working.length,
                potential:potential.length,
                recent:[...working,...potential].map(dealer => ({
                    id:String(dealer._id),
                    dealerId:dealer.dealer_id || '',
                    name:dealer.name || '',
                    city:dealer.city || '',
                    status:dealer.status || ''
                }))
            },
            sales,
            visits:{
                completedThisMonth:currentMonthVisits
            },
            offers:{
                createdThisMonth:offersThisMonth
            },
            activity:{
                lastActionAt:recentActions[0]?.createdAt || null,
                actions7d,
                recent:recentActions.map(item => ({
                    id:String(item._id),
                    module:item.module || '',
                    action:item.action || '',
                    summary:item.summary || '',
                    success:item.success !== false,
                    createdAt:item.createdAt
                }))
            }
        });
    } catch (e) {
        res.status(500).json({ error:e.message });
    }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const { username, password, fullName, lastName, firstName, middleName, phone, email, position, department, officeCity, hireDate, employmentStatus, avatarUrl, role, scope, permissions, isBlocked } = req.body;
        if (!username || !String(username).trim()) return res.status(400).json({ error: 'Укажите логин' });
        if (!password || String(password).length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
        const normalizedUsername = String(username).trim().toLowerCase();
        const exists = await User.findOne({ username: normalizedUsername });
        if (exists) return res.status(400).json({ error: 'Логин уже занят' });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const requestedRole = ['admin','manager','guest','marketing','workshop'].includes(String(role || '')) ? String(role) : 'manager';
        const normalizedRole = requestedRole;
        const normalizedPermissions = { ...(permissions || {}) };
        normalizedPermissions.is_admin = normalizedRole === 'admin';
        normalizedPermissions.can_manage_users = normalizedRole === 'admin';
        const normalizedScope = (normalizedRole === 'marketing' || normalizedRole === 'workshop' || normalizedRole === 'admin') ? 'all' : scope;
        const normalizedEmploymentStatus = ['working','vacation','away','dismissed'].includes(String(employmentStatus || '')) ? String(employmentStatus) : 'working';
        const normalizedLastName = String(lastName || '').trim();
        const normalizedFirstName = String(firstName || '').trim();
        const normalizedMiddleName = String(middleName || '').trim();
        const normalizedFullName = [normalizedLastName, normalizedFirstName, normalizedMiddleName].filter(Boolean).join(' ') || String(fullName || '').trim();
        const newUser = new User({
            username: normalizedUsername,
            password: hashedPassword,
            fullName:normalizedFullName,
            lastName:normalizedLastName,
            firstName:normalizedFirstName,
            middleName:normalizedMiddleName,
            phone:String(phone || '').trim(),
            email:String(email || '').trim(),
            position:String(position || '').trim(),
            department:String(department || '').trim(),
            officeCity:String(officeCity || '').trim(),
            hireDate:String(hireDate || '').trim(),
            employmentStatus:normalizedEmploymentStatus,
            avatarUrl:String(avatarUrl || '').trim(),
            role:normalizedRole,
            scope:normalizedScope,
            permissions:normalizedPermissions,
            isBlocked:normalizedEmploymentStatus === 'dismissed' ? true : Boolean(isBlocked)
        });
        await newUser.save();
        res.json({ status: 'ok' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const { username, fullName, lastName, firstName, middleName, phone, email, position, department, officeCity, hireDate, employmentStatus, avatarUrl, role, scope, permissions, isBlocked, password } = req.body;
        const requestedRole = ['admin','manager','guest','marketing','workshop'].includes(String(role || '')) ? String(role) : 'manager';
        const normalizedRole = requestedRole;
        const normalizedPermissions = { ...(permissions || {}) };
        normalizedPermissions.is_admin = normalizedRole === 'admin';
        normalizedPermissions.can_manage_users = normalizedRole === 'admin';
        const normalizedScope = (normalizedRole === 'marketing' || normalizedRole === 'workshop' || normalizedRole === 'admin') ? 'all' : scope;
        const normalizedEmploymentStatus = ['working','vacation','away','dismissed'].includes(String(employmentStatus || '')) ? String(employmentStatus) : 'working';
        const normalizedLastName = String(lastName || '').trim();
        const normalizedFirstName = String(firstName || '').trim();
        const normalizedMiddleName = String(middleName || '').trim();
        const normalizedFullName = [normalizedLastName, normalizedFirstName, normalizedMiddleName].filter(Boolean).join(' ') || String(fullName || '').trim();
        const updateData = {
            fullName:normalizedFullName,
            lastName:normalizedLastName,
            firstName:normalizedFirstName,
            middleName:normalizedMiddleName,
            phone:String(phone || '').trim(),
            email:String(email || '').trim(),
            position:String(position || '').trim(),
            department:String(department || '').trim(),
            officeCity:String(officeCity || '').trim(),
            hireDate:String(hireDate || '').trim(),
            employmentStatus:normalizedEmploymentStatus,
            avatarUrl:String(avatarUrl || '').trim(),
            role:normalizedRole,
            scope:normalizedScope,
            permissions:normalizedPermissions,
            isBlocked:normalizedEmploymentStatus === 'dismissed' ? true : Boolean(isBlocked)
        };

        if (username && String(username).trim()) {
            const normalizedUsername = String(username).trim().toLowerCase();
            const duplicate = await User.exists({ username: normalizedUsername, _id: { $ne: req.params.id } });
            if (duplicate) return res.status(400).json({ error: 'Логин уже занят' });
            updateData.username = normalizedUsername;
        }

        if (password && password.trim() !== "") {
            if (password.length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }
        await User.findByIdAndUpdate(req.params.id, updateData);
        res.json({ status: 'ok' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        if (req.params.id === req.user.id) return res.status(400).json({ error: 'Нельзя удалить самого себя' });
        await User.findByIdAndDelete(req.params.id);
        res.json({ status: 'deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

function auditRegex(value) {
    return String(value || '').replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}
app.get('/api/audit', requireAdmin, async (req, res) => {
    try {
        const page=Math.max(1,Number(req.query.page)||1);
        const limit=Math.max(10,Math.min(200,Number(req.query.limit)||50));
        const filter={};
        if (req.query.module && req.query.module!=='all') filter.module=String(req.query.module);
        if (req.query.action && req.query.action!=='all') filter.action=String(req.query.action);
        if (req.query.actorId) filter['actor.id']=String(req.query.actorId);
        if (req.query.success==='true') filter.success=true;
        if (req.query.success==='false') filter.success=false;
        if (req.query.from || req.query.to) {
            filter.createdAt={};
            if (req.query.from) filter.createdAt.$gte=new Date(String(req.query.from)+'T00:00:00+05:00');
            if (req.query.to) filter.createdAt.$lte=new Date(String(req.query.to)+'T23:59:59.999+05:00');
        }
        const q=String(req.query.q||'').trim();
        if (q) {
            const regex=new RegExp(auditRegex(q),'i');
            filter.$or=[{summary:regex},{entityLabel:regex},{'actor.name':regex},{'actor.username':regex},{path:regex}];
        }
        const since24h=new Date(Date.now()-24*60*60*1000);
        const [items,total,actors,modules,last24h,failed24h]=await Promise.all([
            AuditLog.find(filter).sort({createdAt:-1}).skip((page-1)*limit).limit(limit).lean(),
            AuditLog.countDocuments(filter),
            AuditLog.aggregate([{ $match:{'actor.id':{$ne:''}} },{ $group:{_id:'$actor.id',name:{$last:'$actor.name'},username:{$last:'$actor.username'}} },{ $sort:{name:1} }]),
            AuditLog.distinct('module'),
            AuditLog.countDocuments({createdAt:{$gte:since24h}}),
            AuditLog.countDocuments({createdAt:{$gte:since24h},success:false})
        ]);
        res.json({
            items:items.map(convertToClient),total,page,limit,pages:Math.max(1,Math.ceil(total/limit)),
            filters:{actors:actors.map(item=>({id:String(item._id||''),name:item.name||item.username||'Пользователь'})),modules:modules.filter(Boolean).sort()},
            stats:{last24h,failed24h}
        });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/audit/entity/:entityType/:entityId', requireAdmin, async (req, res) => {
    try {
        const items=await AuditLog.find({entityType:String(req.params.entityType||''),entityId:String(req.params.entityId||'')}).sort({createdAt:-1}).limit(100).lean();
        res.json(items.map(convertToClient));
    } catch(e) { res.status(500).json({error:e.message}); }
});

// --- СТАТИКА ---
app.get('/sw.js', (req, res) => {
    const filePath = __dirname + '/public/sw.js';
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error');
        const js = data.replace(/{{VER}}/g, APP_VERSION);
        res.set('Content-Type', 'application/javascript');
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(js);
    });
});
app.get('/', (req, res) => servePage(res, 'index.html'));
app.get('/index.html', (req, res) => servePage(res, 'index.html'));
app.get('/login.html', (req, res) => servePage(res, 'login.html'));
app.get('/map.html', (req, res) => servePage(res, 'map.html'));
app.get('/sales.html', (req, res) => servePage(res, 'sales.html'));
app.get('/competitors.html', (req, res) => servePage(res, 'competitors.html'));
app.get('/products.html', (req, res) => servePage(res, 'products.html'));
app.get('/report.html', (req, res) => servePage(res, 'report.html'));
app.get('/knowledge.html', (req, res) => servePage(res, 'knowledge.html'));
app.get('/reclamations.html', (req, res) => servePage(res, 'reclamations.html'));
app.get('/dealer.html', (req, res) => servePage(res, 'dealer.html'));
app.get('/users.html', (req, res) => servePage(res, 'users.html'));
app.get('/audit.html', (req, res) => servePage(res, 'audit.html'));
app.get('/workshop.html', (req, res) => servePage(res, 'workshop.html'));
app.get('/pricing.html', (req, res) => servePage(res, 'pricing.html'));
app.get('/price/:token', (req, res) => servePage(res, 'shared-price.html'));
app.get('/offer/:token', (req, res) => servePage(res, 'shared-offer.html'));
app.use(express.static('public'));

const DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING;
let IDEAL_DRIVE_PHOTOS = {};
try {
    IDEAL_DRIVE_PHOTOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'drive-photo-map.json'), 'utf8'));
} catch (e) {
    console.warn('Drive photo map is unavailable:', e.message);
}

// --- СХЕМЫ ---
const statusSchema = new mongoose.Schema({ value: String, label: String, color: String, isVisible: { type: Boolean, default: true }, sortOrder: { type: Number, default: 0 } });
const Status = mongoose.model('Status', statusSchema);

const productSchema = new mongoose.Schema({
    sku: String,
    name: String,
    product_type: { type: String, enum: ['laminate', 'equipment'], default: 'laminate' },
    collection: String,
    is_liquid: { type: Boolean, default: true },
    excel_alias: String,
    photo_id: String,
    stock_qty: Number,
    characteristics: { class: String, thickness: String, bevel: String, size: String, package_area: String, package_qty: String, weight: String }
});

const Product = mongoose.model('Product', productSchema);

async function cleanupDealerEquipmentProducts() {
    const equipmentIds = await Product.find({ product_type:'equipment' }).distinct('_id');
    if (!equipmentIds.length) return;
    const result = await Dealer.updateMany(
        { products:{ $in:equipmentIds } },
        { $pull:{ products:{ $in:equipmentIds } } }
    );
    if (result.modifiedCount) {
        console.log('Dealer product assignments cleaned from equipment:', result.modifiedCount);
    }
}

function normalizeProductPhotoSku(value) {
    let sku = String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[–—−]/g,'-')
        .replace(/[\s_./\\]+/g,'')
        .replace(/[АВЕКМНОРСТХ]/g, ch => ({
            'А':'A','В':'B','Е':'E','К':'K','М':'M','Н':'H','О':'O','Р':'P','С':'C','Т':'T','Х':'X'
        }[ch] || ch));

    const rules = [
        [/^8?EH(?:34)?-?(\d{3})$/, m => 'EH-' + m[1]],
        [/^8?MC(?:33|34)?-?(\d{3})$/, m => 'MC-' + m[1]],
        [/^8?HP(?:33|34)?-?(\d{2})$/, m => 'HP-' + m[1]],
        [/^8?FP(?:33|34)?-?(\d{2})$/, m => 'FP-' + m[1]],
        [/^8?AS(?:33|34)?-?(\d{2})$/, m => 'AS-' + m[1]],
        [/^8?RPL(?:33|34)?-?0?(\d{1,2})$/, m => 'RPL-' + Number(m[1])],
        [/^8?RWN(?:33|34)?-?(\d{2})$/, m => 'RWN-' + m[1]],
        [/^8?RWE(?:33|34)?-?(\d{2})$/, m => 'RWE-' + m[1]],
        [/^8?RWZ(?:33|34)?-?(\d{2})$/, m => 'RWZ-' + m[1]]
    ];
    for (const [pattern, formatter] of rules) {
        const match = sku.match(pattern);
        if (match) return formatter(match);
    }
    return sku.replace(/-/g,'');
}

async function migrateLegacyProductPhotos() {
    const legacyEntries = Object.entries(IDEAL_DRIVE_PHOTOS || {});
    if (!legacyEntries.length) return;

    const photoByCanonicalSku = new Map();
    for (const [sku, photoId] of legacyEntries) {
        const canonical = normalizeProductPhotoSku(sku);
        if (canonical && photoId) photoByCanonicalSku.set(canonical, String(photoId).trim());
    }

    const products = await Product.find({})
        .select('_id sku photo_id')
        .lean();

    const operations = [];
    const unmatched = [];
    for (const product of products) {
        if (String(product.photo_id || '').trim()) continue;
        const canonical = normalizeProductPhotoSku(product.sku);
        const photoId = photoByCanonicalSku.get(canonical);
        if (!photoId) {
            if (canonical) unmatched.push(String(product.sku || ''));
            continue;
        }
        operations.push({
            updateOne:{
                filter:{ _id:product._id, $or:[{photo_id:{$exists:false}},{photo_id:null},{photo_id:''}] },
                update:{ $set:{ photo_id:photoId } }
            }
        });
    }

    if (operations.length) {
        const result = await Product.bulkWrite(operations, { ordered:false });
        if (result.modifiedCount) console.log('Product photos migrated:', result.modifiedCount);
    }
    if (unmatched.length) {
        console.log('Products without mapped photo:', unmatched.length, unmatched.slice(0,25).join(', '));
    }
}

const stockImportMetaSchema = new mongoose.Schema({
    key: { type:String, unique:true, index:true, default:'free_stock' },
    importedAt: Date,
    importedBy: { id:String, name:String },
    source: String,
    fileName: String,
    matched: { type:Number, default:0 },
    updated: { type:Number, default:0 }
}, { timestamps:true });
const StockImportMeta = mongoose.model('StockImportMeta', stockImportMetaSchema);
const gmailStockSync = require('./server/gmail-stock').createGmailStockSync({
    Product, StockImportMeta, AuditLog, connection:mongoose.connection,
    ready:() => appReady && !shuttingDown
});

// ==========================================
// ЦЕХ: материалы, рецептуры, производство и движения
// ==========================================
const workshopMaterialSchema = new mongoose.Schema({
    code: String,
    name: { type: String, required: true },
    category: { type: String, default: 'consumable' },
    unit: { type: String, default: 'шт' },
    purchaseUnit: String,
    purchaseUnitSize: { type: Number, default: 1 },
    stockQty: { type: Number, default: 0 },
    minQty: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    note: String
}, { timestamps: true });
const WorkshopMaterial = mongoose.model('WorkshopMaterial', workshopMaterialSchema);

const workshopRecipeMaterialSchema = new mongoose.Schema({
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopMaterial' },
    qty: { type: Number, default: 0 },
    mode: { type: String, enum: ['strict', 'estimate'], default: 'strict' }
}, { _id: false });

const workshopRecipeComponentSchema = new mongoose.Schema({
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopRecipe' },
    qty: { type: Number, default: 0 }
}, { _id: false });

const workshopRecipeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    outputType: { type: String, enum: ['sample', 'stand', 'sign', 'other'], default: 'sample' },
    sku: String,
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    sideA: String,
    sideB: String,
    planksPerUnit: { type: Number, default: 0 },
    packQtyOverride: { type: Number, default: 0 },
    stockQty: { type: Number, default: 0 },
    minStockQty: { type: Number, default: 0 },
    matrixPosName: String,
    materials: [workshopRecipeMaterialSchema],
    components: [workshopRecipeComponentSchema],
    active: { type: Boolean, default: true },
    note: String
}, { timestamps: true });
const WorkshopRecipe = mongoose.model('WorkshopRecipe', workshopRecipeSchema);

const workshopLaminateStockSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', unique: true, index: true },
    planksQty: { type: Number, default: 0 }
}, { timestamps: true });
const WorkshopLaminateStock = mongoose.model('WorkshopLaminateStock', workshopLaminateStockSchema);

const workshopMovementSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    type: { type: String, required: true },
    entityType: { type: String, enum: ['laminate', 'material', 'finished'], required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopMaterial' },
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopRecipe' },
    dealer: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer' },
    direction: { type: String, enum: ['in', 'out', 'neutral'], default: 'neutral' },
    qty: { type: Number, default: 0 },
    unit: String,
    serviceMemoNumber: String,
    note: String,
    meta: mongoose.Schema.Types.Mixed,
    createdBy: { id: String, name: String }
}, { timestamps: true });
const WorkshopMovement = mongoose.model('WorkshopMovement', workshopMovementSchema);

const workshopOperationSchema = new mongoose.Schema({
    type: String,
    qty: Number,
    note: String
}, { _id: false });

const workshopProductionSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopRecipe' },
    memo: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopMemo' },
    memoLineId: String,
    serviceMemoNumber: String,
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    acceptedPacks: { type: Number, default: 0 },
    acceptedLoosePlanks: { type: Number, default: 0 },
    packQty: { type: Number, default: 0 },
    totalAcceptedPlanks: { type: Number, default: 0 },
    outputQty: { type: Number, default: 0 },
    standardPlanksPerUnit: { type: Number, default: 0 },
    actualPlanksPerUnit: { type: Number, default: 0 },
    customNormReason: String,
    customOrderName: String,
    customDimensions: String,
    consumedPlanks: { type: Number, default: 0 },
    scrapPlanks: { type: Number, default: 0 },
    operations: [workshopOperationSchema],
    note: String,
    cancelledAt: Date,
    cancelledBy: { id: String, name: String },
    cancelReason: String,
    createdBy: { id: String, name: String }
}, { timestamps: true });
const WorkshopProduction = mongoose.model('WorkshopProduction', workshopProductionSchema);

const workshopMemoLineSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopRecipe' },
    requestedPacks: { type: Number, default: 0 },
    plannedOutputQty: { type: Number, default: 0 },
    plannedRemainderPlanks: { type: Number, default: 0 },
    packQty: { type: Number, default: 0 },
    planksPerUnit: { type: Number, default: 0 },
    actualProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    deliveredPacks: { type: Number, default: 0 },
    checked: { type: Boolean, default: false },
    isMatch: { type: Boolean, default: false },
    discrepancyReason: String
});

const workshopMemoSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true, trim: true },
    date: { type: Date, default: Date.now },
    status: { type: String, enum: ['created', 'mismatch', 'accepted', 'cancelled'], default: 'created' },
    lines: [workshopMemoLineSchema],
    note: String,
    signedBy: String,
    createdBy: { id: String, name: String },
    acceptedAt: Date,
    acceptedBy: { id: String, name: String },
    postedAt: Date,
    receiptAttempts: [mongoose.Schema.Types.Mixed]
}, { timestamps: true });
const WorkshopMemo = mongoose.model('WorkshopMemo', workshopMemoSchema);

const workshopDealerAssetSchema = new mongoose.Schema({
    dealer: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer', index: true },
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopRecipe', index: true },
    qty: { type: Number, default: 0 }
}, { timestamps: true });
workshopDealerAssetSchema.index({ dealer: 1, recipe: 1 }, { unique: true });
const WorkshopDealerAsset = mongoose.model('WorkshopDealerAsset', workshopDealerAssetSchema);

const workshopStocktakeLineSchema = new mongoose.Schema({
    entityType: String,
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopMaterial' },
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkshopRecipe' },
    systemQty: Number,
    actualQty: Number,
    delta: Number,
    note: String
}, { _id: false });

const workshopStocktakeSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    lines: [workshopStocktakeLineSchema],
    note: String,
    createdBy: { id: String, name: String }
}, { timestamps: true });
const WorkshopStocktake = mongoose.model('WorkshopStocktake', workshopStocktakeSchema);

function workshopNumber(value) {
    const n = Number(String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/)?.[0]);
    return Number.isFinite(n) ? n : 0;
}

function workshopPackQty(product, override = 0) {
    const direct = workshopNumber(override);
    if (direct > 0) return direct;
    return Math.max(0, Math.round(workshopNumber(product?.characteristics?.package_qty)));
}

function workshopUser(req) {
    return {
        id: req.user?.id || '',
        name: req.user?.fullName || req.user?.username || 'Сотрудник'
    };
}

async function workshopChangeLaminate(productId, delta) {
    const stock = await WorkshopLaminateStock.findOneAndUpdate(
        { product: productId },
        { $inc: { planksQty: delta } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (stock.planksQty < -0.0001) {
        await WorkshopLaminateStock.updateOne({ _id: stock._id }, { $inc: { planksQty: -delta } });
        throw new Error('Недостаточно ламината в остатках цеха');
    }
    if (stock.planksQty < 0) {
        stock.planksQty = 0;
        await stock.save();
    }
    return stock;
}

async function workshopChangeMaterial(materialId, delta) {
    const item = await WorkshopMaterial.findByIdAndUpdate(materialId, { $inc: { stockQty: delta } }, { new: true });
    if (!item) throw new Error('Материал не найден');
    if (item.stockQty < -0.0001) {
        await WorkshopMaterial.updateOne({ _id: item._id }, { $inc: { stockQty: -delta } });
        throw new Error(`Недостаточно материала «${item.name}»`);
    }
    if (item.stockQty < 0) {
        item.stockQty = 0;
        await item.save();
    }
    return item;
}

async function workshopChangeRecipe(recipeId, delta) {
    const item = await WorkshopRecipe.findByIdAndUpdate(recipeId, { $inc: { stockQty: delta } }, { new: true });
    if (!item) throw new Error('Изделие не найдено');
    if (item.stockQty < -0.0001) {
        await WorkshopRecipe.updateOne({ _id: item._id }, { $inc: { stockQty: -delta } });
        throw new Error(`Недостаточно готовых изделий «${item.name}»`);
    }
    if (item.stockQty < 0) {
        item.stockQty = 0;
        await item.save();
    }
    return item;
}


// --- НОВАЯ СХЕМА СЕКТОРОВ (КАСТОМНЫЕ) ---
const sectorSchema = new mongoose.Schema({ 
    name: String, 
    type: String // 'astana' (для DIY, Салонов) или 'region' (Север, Юг)
});
const Sector = mongoose.model('Sector', sectorSchema);

// --- ЗАПОЛНЕНИЕ СЕКТОРОВ ---
async function seedSectors() {
    const count = await Sector.countDocuments();
    if (count === 0) {
        console.log('Seeding sectors...');
        await Sector.insertMany([
            { name: 'DIY', type: 'astana' },
            { name: 'Салоны', type: 'astana' },
            { name: 'Рынки', type: 'astana' },
            { name: 'Объектные', type: 'astana' },
            { name: 'Север', type: 'region' },
            { name: 'Юг', type: 'region' },
            { name: 'Запад', type: 'region' },
            { name: 'Восток', type: 'region' },
            { name: 'Центр', type: 'region' }
        ]);
    }
}

const contactSchema = new mongoose.Schema({ name: String, position: String, contactInfo: String }, { _id: false }); 
const photoSchema = new mongoose.Schema({ description: String, photo_url: String, date: { type: Date, default: Date.now } }, { _id: false });
const additionalAddressSchema = new mongoose.Schema({ description: String, city: String, address: String }, { _id: false });
const visitSchema = new mongoose.Schema({ telegramEventId: String, date: String, comment: String, isCompleted: { type: Boolean, default: false } }, { _id: false });
const posMaterialSchema = new mongoose.Schema({ name: String, quantity: Number }, { _id: false });
const dealerLegalEntitySchema = new mongoose.Schema({
    type: { type: String, default: 'ТОО' },
    organizationName: String,
    director: String,
    legalAddress: String,
    bin: String,
    iik: String,
    bank: String,
    bik: String,
    kbe: String,
    email: String
}, { _id: false });
const competitorSchema = new mongoose.Schema({ brand: String, collection: String, price_opt: String, price_retail: String }, { _id: false });
const collectionItemSchema = new mongoose.Schema({
    name: String,
    type: { type: String, default: 'std' },
    class: String,
    thickness: String,
    format: String,
    price_opt: String,
    price_retail: String,
    currency: { type: String, default: 'KZT' },
    note: String
}, { _id: false });
const compContactSchema = new mongoose.Schema({ name: String, position: String, phone: String }, { _id: false });

const compRefSchema = new mongoose.Schema({
    name: String,
    country: String,
    supplier: String,
    warehouse: String,
    addresses: [additionalAddressSchema],
    logoUrl: String,
    website: String,
    instagram: String,
    info: String,

    status: { type: String, enum: ['active', 'watch', 'inactive'], default: 'active' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    segment: String,
    tags: [String],
    strengths: String,
    weaknesses: String,
    price_positioning: String,
    last_monitoring_date: String,
    next_monitoring_date: String,
    monitoring_owner: String,

    storage_days: String,
    stock_info: String,
    reserve_days: String,
    contacts: [compContactSchema],
    collections: [collectionItemSchema]
}, { timestamps: true });
const CompRef = mongoose.model('CompRef', compRefSchema);

const motivationSchemeSchema = new mongoose.Schema({
    name: { type:String, required:true, trim:true },
    ratePerM2: { type:Number, required:true, min:0 },
    validFrom: { type:String, default:'' },
    validTo: { type:String, default:'' },
    active: { type:Boolean, default:true },
    note: { type:String, default:'' },
    createdBy: { id:String, name:String },
    updatedBy: { id:String, name:String }
}, { timestamps:true });
motivationSchemeSchema.index({ active:1, validFrom:1, validTo:1, name:1 });
const MotivationScheme = mongoose.model('MotivationScheme', motivationSchemeSchema);

const dealerSchema = new mongoose.Schema({ dealer_id: String, name: String, price_type: String, price_list: { type: mongoose.Schema.Types.ObjectId, ref: 'PriceList', default: null }, motivation_scheme: { type: mongoose.Schema.Types.ObjectId, ref: 'MotivationScheme', default: null }, city: String, address: String, contacts: [contactSchema], bonuses: String, photos: [photoSchema], legal_entities: [dealerLegalEntitySchema], contract: { isSigned: Boolean, date: String }, region_sector: String, hasPersonalPlan: { type: Boolean, default: false }, delivery: String, website: String, instagram: String, additional_addresses: [additionalAddressSchema], pos_materials: [posMaterialSchema], visits: [visitSchema], products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], latitude: Number, longitude: Number, status: { type: String, default: 'standard' }, avatarUrl: String, competitors: [competitorSchema], responsible: String, responsibleUserId: String, responsibleAssignmentSource: String }, { timestamps: true });
const Dealer = mongoose.model('Dealer', dealerSchema);

const priceListRowSchema = new mongoose.Schema({
    scopeType: { type: String, enum: ['collection', 'product'], default: 'product' },
    collection: String,
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    sku: String,
    name: String,
    isLiquid: { type: Boolean, default: true },
    opt: { type: Number, default: 0 },
    rrp: { type: Number, default: 0 },
    displayPrice: { type: Number, default: 0 },
    maxRrp: { type: Number, default: 0 },
    currency: { type: String, default: 'KZT' }
}, { _id: false });

const priceListSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    versionDate: { type: String, default: '' },
    validFrom: { type: String, default: '' },
    validTo: { type: String, default: '' },
    active: { type: Boolean, default: true },
    includeIlliquid: { type: Boolean, default: false },
    archivedAt: Date,
    note: String,
    rows: [priceListRowSchema],
    createdBy: { id: String, name: String },
    updatedBy: { id: String, name: String }
}, { timestamps: true });
priceListSchema.index({ active: 1, name: 1, versionDate: -1 });
priceListSchema.index({ code: 1, versionDate: 1 });
const PriceList = mongoose.model('PriceList', priceListSchema);

const dealerDisplayPriceSchema = new mongoose.Schema({
    dealer: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer', required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    price: { type: Number, default: 0 },
    updatedBy: { id: String, name: String }
}, { timestamps: true });
dealerDisplayPriceSchema.index({ dealer: 1, product: 1 }, { unique: true });
const DealerDisplayPrice = mongoose.model('DealerDisplayPrice', dealerDisplayPriceSchema);

const dealerCollectionDisplayPriceSchema = new mongoose.Schema({
    dealer: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer', required: true, index: true },
    collection: { type: String, required: true, trim: true },
    price: { type: Number, default: 0 },
    updatedBy: { id: String, name: String }
}, { timestamps: true });
dealerCollectionDisplayPriceSchema.index({ dealer: 1, collection: 1 }, { unique: true });
const DealerCollectionDisplayPrice = mongoose.model('DealerCollectionDisplayPrice', dealerCollectionDisplayPriceSchema);

const pricingAuditSchema = new mongoose.Schema({
    at: { type: Date, default: Date.now },
    action: String,
    userId: String,
    userName: String,
    note: String
}, { _id: false });

const pricingConditionSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    kind: { type: String, enum: ['discount', 'price_list'], required: true },
    scopeType: { type: String, enum: ['dealer', 'sector', 'city', 'all'], default: 'dealer' },
    dealer: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer' },
    dealers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Dealer' }],
    scopeValue: String,
    scopeValues: [String],

    discountPercent: { type: Number, default: 0 },
    priceListName: String,
    priceList: { type: mongoose.Schema.Types.ObjectId, ref: 'PriceList' },
    stackable: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },

    startDate: { type: String, default: '' },
    endDate: { type: String, default: '' },
    paused: { type: Boolean, default: false },
    cancelledAt: Date,

    reasonType: {
        type: String,
        enum: ['social_posts', 'support_promo', 'regional_price', 'individual', 'other'],
        default: 'other'
    },
    requirementTarget: { type: Number, default: 0 },
    requirementCurrent: { type: Number, default: 0 },
    requirementUnit: { type: String, default: 'публикаций' },
    requirementDueDate: String,
    requirementVerified: { type: Boolean, default: false },
    proofNote: String,
    note: String,

    createdBy: { id: String, name: String },
    updatedBy: { id: String, name: String },
    audit: [pricingAuditSchema]
}, { timestamps: true });

pricingConditionSchema.index({ dealer: 1, startDate: 1, endDate: 1 });
pricingConditionSchema.index({ scopeType: 1, scopeValue: 1 });
pricingConditionSchema.index({ cancelledAt: 1 });
const PricingCondition = mongoose.model('PricingCondition', pricingConditionSchema);
const priceShareSchema = new mongoose.Schema({
    tokenHash: { type:String, required:true, unique:true, index:true },
    dealer: { type:mongoose.Schema.Types.ObjectId, ref:'Dealer', index:true },
    dealerId: String,
    dealerName: String,
    dealerCity: String,
    createdBy: { id:String, name:String },
    expiresAt: { type:Date, required:true, index:true },
    revokedAt: Date,
    snapshot: mongoose.Schema.Types.Mixed
}, { timestamps:true });
priceShareSchema.index({ expiresAt:1 }, { expireAfterSeconds:0 });
const PriceShare = mongoose.model('PriceShare', priceShareSchema);

const commercialOfferSchema = new mongoose.Schema({
    publicId: { type:String, required:true, unique:true, index:true },
    offerNumber: { type:String, required:true, index:true },
    dealer: { type:mongoose.Schema.Types.ObjectId, ref:'Dealer', index:true },
    dealerId: String,
    dealerName: String,
    dealerCity: String,
    createdBy: { id:String, name:String },
    expiresAt: { type:Date, required:true, index:true },
    revokedAt: Date,
    viewCount: { type:Number, default:0 },
    lastViewedAt: Date,
    snapshot: mongoose.Schema.Types.Mixed
}, { timestamps:true });
const CommercialOffer = mongoose.model('CommercialOffer', commercialOfferSchema);

let commercialOfferCleanupTimer = null;

async function purgeExpiredCommercialOffers() {
    if (mongoose.connection.readyState !== 1) return 0;
    const result = await CommercialOffer.deleteMany({ expiresAt:{ $lte:new Date() } });
    return Number(result?.deletedCount) || 0;
}

function ensureCommercialOfferCleanup() {
    if (commercialOfferCleanupTimer) return;
    commercialOfferCleanupTimer = setInterval(() => {
        purgeExpiredCommercialOffers().catch(error => console.error('Commercial offer cleanup error:', error));
    }, 60 * 1000);
    commercialOfferCleanupTimer.unref?.();
}

const salesSchema = new mongoose.Schema({ month: String, group: String, dealerId: String, dealerName: String, plan: Number, fact: Number, isCustom: { type: Boolean, default: false }, ownerUserId: String 
}, { timestamps: true }); 
const Sales = mongoose.model('Sales', salesSchema);
const employeeKpi = require('./server/employee-kpi').registerEmployeeKpi({
    app,mongoose,User,Dealer,Product,Sales,AuditLog,isAdminUser,getWorkingDealerFilter,almatyMonthKey
});

const motivationPayoutSchema = new mongoose.Schema({
    month: { type:String, required:true, index:true },
    dealer: { type:mongoose.Schema.Types.ObjectId, ref:'Dealer', required:true, index:true },
    dealerId: String,
    dealerName: String,
    dealerCity: String,
    scheme: { type:mongoose.Schema.Types.ObjectId, ref:'MotivationScheme' },
    schemeName: String,
    ratePerM2: { type:Number, default:0 },
    salesM2: { type:Number, default:0 },
    amount: { type:Number, default:0 },
    validFrom: String,
    validTo: String,
    partialPeriod: { type:Boolean, default:false },
    status: { type:String, enum:['pending','paid','skipped'], default:'pending', index:true },
    paidAt: Date,
    note: String,
    calculatedAt: Date,
    calculatedBy: { id:String, name:String },
    paidBy: { id:String, name:String }
}, { timestamps:true });
motivationPayoutSchema.index({ month:1, dealer:1 }, { unique:true });
const MotivationPayout = mongoose.model('MotivationPayout', motivationPayoutSchema);
const MotivationReminderSetting = mongoose.model('MotivationReminderSetting', new mongoose.Schema({ key:{type:String,unique:true}, enabled:Boolean, startDay:Number, endDay:Number, hideWhenEmpty:Boolean }));


const Knowledge = mongoose.model('Knowledge', new mongoose.Schema({ title: String, content: String }, { timestamps: true }));

function canonicalDealerPayload(input = {}) {
    const payload = { ...input };

    delete payload.organization;
    delete payload.organizations;
    delete payload.requisites;

    if (Object.prototype.hasOwnProperty.call(payload, 'price_list')) {
        const priceListId = String(payload.price_list?._id || payload.price_list?.id || payload.price_list || '').trim();
        payload.price_list = priceListId && mongoose.Types.ObjectId.isValid(priceListId) ? priceListId : null;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'motivation_scheme')) {
        const motivationId = String(payload.motivation_scheme?._id || payload.motivation_scheme?.id || payload.motivation_scheme || '').trim();
        payload.motivation_scheme = motivationId && mongoose.Types.ObjectId.isValid(motivationId) ? motivationId : null;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'contract')) {
        const source = payload.contract && typeof payload.contract === 'object' ? payload.contract : {};
        const contract = {};
        if (Object.prototype.hasOwnProperty.call(source, 'isSigned')) contract.isSigned = Boolean(source.isSigned);
        if (Object.prototype.hasOwnProperty.call(source, 'date')) contract.date = String(source.date || '');
        payload.contract = contract;
    }

    if (Array.isArray(payload.legal_entities)) {
        payload.legal_entities = payload.legal_entities
            .filter(entity => entity && typeof entity === 'object')
            .map(entity => ({
                type: String(entity.type || '').trim(),
                organizationName: String(entity.organizationName || '').trim(),
                director: String(entity.director || '').trim(),
                legalAddress: String(entity.legalAddress || '').trim(),
                bin: String(entity.bin || '').trim(),
                iik: String(entity.iik || '').trim(),
                bank: String(entity.bank || '').trim(),
                bik: String(entity.bik || '').trim(),
                kbe: String(entity.kbe || '').trim(),
                email: String(entity.email || '').trim()
            }))
            .filter(entity => Object.values(entity).some(Boolean));
    }

    return payload;
}

function legacyEntityType(name) {
    const value = String(name || '').trim();
    if (/^ИП\b/i.test(value)) return 'ИП';
    if (/^(ЧС|ФЛ|Физ)/i.test(value)) return 'Частное лицо';
    return 'ТОО';
}

async function migrateDealerCanonicalFields() {
    const collection = mongoose.connection.collection('dealers');
    const cursor = collection.find({});
    let migrated = 0;

    for await (const doc of cursor) {
        const update = { $unset: {} };
        let changed = false;
        let legalEntities = Array.isArray(doc.legal_entities) ? doc.legal_entities.filter(Boolean) : [];

        if (!legalEntities.length) {
            const req = doc.requisites && typeof doc.requisites === 'object' ? doc.requisites : {};
            const orgs = Array.isArray(doc.organizations) ? doc.organizations.filter(Boolean) : [];
            const primaryName = req.organizationName || orgs[0] || doc.organization || '';

            if (primaryName || Object.values(req).some(Boolean)) {
                legalEntities = [{
                    type: legacyEntityType(primaryName),
                    organizationName: primaryName,
                    director: req.director || '',
                    legalAddress: req.legalAddress || doc.address || '',
                    bin: req.bin || '',
                    iik: req.iik || '',
                    bank: req.bank || '',
                    bik: req.bik || '',
                    kbe: req.kbe || '',
                    email: req.email || ''
                }];
                orgs.slice(1).forEach(name => legalEntities.push({
                    type: legacyEntityType(name),
                    organizationName: name
                }));
            }
        }

        const set = {};
        if (legalEntities.length && (!Array.isArray(doc.legal_entities) || !doc.legal_entities.length)) {
            set.legal_entities = legalEntities;
            changed = true;
        }

        if (Object.prototype.hasOwnProperty.call(doc, 'organization')) { update.$unset.organization = ''; changed = true; }
        if (Object.prototype.hasOwnProperty.call(doc, 'organizations')) { update.$unset.organizations = ''; changed = true; }
        if (Object.prototype.hasOwnProperty.call(doc, 'requisites')) { update.$unset.requisites = ''; changed = true; }
        if (doc.contract && Object.prototype.hasOwnProperty.call(doc.contract, 'number')) {
            update.$unset['contract.number'] = '';
            changed = true;
        }

        if (changed) {
            if (Object.keys(set).length) update.$set = set;
            if (!Object.keys(update.$unset).length) delete update.$unset;
            await collection.updateOne({ _id: doc._id }, update);
            migrated++;
        }
    }

    if (migrated) console.log(`Dealer canonical field migration: ${migrated} records normalized`);
}

async function connectToDB() {
    if (dbConnectInFlight) return dbConnectInFlight;

    dbConnectInFlight = (async () => {
        if (!DB_CONNECTION_STRING) {
            appReady = false;
            console.error('No DB String');
            return false;
        }

        try {
            if (mongoose.connection.readyState !== 1) {
                await mongoose.connect(DB_CONNECTION_STRING, {
                    serverSelectionTimeoutMS: 10000,
                    connectTimeoutMS: 10000,
                    socketTimeoutMS: 45000,
                    maxPoolSize: 20,
                    minPoolSize: 1
                });
            }

            console.log('MongoDB Connected');
            await migrateDealerCanonicalFields();
            await seedStatuses();
            await seedUsers();
            await seedSectors();
            await migrateLegacyProductPhotos();
            await cleanupDealerEquipmentProducts();
            await seedWorkshopMaterials();
            await seedWorkshopRecipes();
            await normalizeWorkshopPosRecipes();

            appReady = true;
            gmailStockSync.start();
            telegramNotifications.start();
            await purgeExpiredCommercialOffers().catch(error => console.error('Initial commercial offer cleanup error:', error));
            ensureCommercialOfferCleanup();
            if (dbReconnectTimer) {
                clearTimeout(dbReconnectTimer);
                dbReconnectTimer = null;
            }
            return true;
        } catch (e) {
            appReady = false;
            console.error('MongoDB startup/connect error:', e);
            if (!shuttingDown && !dbReconnectTimer) {
                dbReconnectTimer = setTimeout(() => {
                    dbReconnectTimer = null;
                    connectToDB().catch(err => console.error('MongoDB reconnect error:', err));
                }, 5000);
                dbReconnectTimer.unref?.();
            }
            return false;
        } finally {
            dbConnectInFlight = null;
        }
    })();

    return dbConnectInFlight;
}

mongoose.connection.on('disconnected', () => {
    appReady = false;
    console.error('MongoDB disconnected');
    if (!shuttingDown && !dbReconnectTimer) {
        dbReconnectTimer = setTimeout(() => {
            dbReconnectTimer = null;
            connectToDB().catch(err => console.error('MongoDB reconnect error:', err));
        }, 5000);
        dbReconnectTimer.unref?.();
    }
});

mongoose.connection.on('error', err => {
    appReady = false;
    console.error('MongoDB connection error:', err);
});

async function seedWorkshopMaterials() {
    const defaults = [
        { code: 'PLYWOOD-SHEET', name: 'Фанера для расчесок', category: 'raw_sheet', unit: 'лист', purchaseUnit: 'лист', purchaseUnitSize: 1, note: '1 лист = 2 расчески из фанеры' },
        { code: 'LDSP-SHEET', name: 'ЛДСП для задних стенок', category: 'raw_sheet', unit: 'лист', purchaseUnit: 'лист', purchaseUnitSize: 1, note: 'Норма раскроя: 600 мм — 4 стенки/лист; 800 мм — 3 стенки/лист' },
        { code: 'ACRYLIC-SIGN', name: 'Табличка из оргстекла (полиграфия)', category: 'stand_component', unit: 'шт', purchaseUnit: 'шт', purchaseUnitSize: 1 },
        { code: 'STICKER-600', name: 'Наклейка 600 мм', category: 'stand_component', unit: 'шт', purchaseUnit: 'шт', purchaseUnitSize: 1 },
        { code: 'STICKER-800', name: 'Наклейка 800 мм', category: 'stand_component', unit: 'шт', purchaseUnit: 'шт', purchaseUnitSize: 1 },
        { code: 'FILM', name: 'Плёнка для стендов', category: 'consumable', unit: 'м', purchaseUnit: 'рулон', purchaseUnitSize: 1 },
        { code: 'EDGE', name: 'Кромка для стенок', category: 'consumable', unit: 'м', purchaseUnit: 'бухта', purchaseUnitSize: 200, note: '1 бухта = 200 м. Расход учитывать ориентировочно: возможен брак.' },
        { code: 'EDGE-GLUE', name: 'Клей для кромки', category: 'consumable', unit: 'мешок', purchaseUnit: 'мешок', purchaseUnitSize: 1 },
        { code: 'CUTTER', name: 'Фреза', category: 'tool', unit: 'шт', purchaseUnit: 'шт', purchaseUnitSize: 1 }
    ];
    for (const item of defaults) {
        await WorkshopMaterial.updateOne(
            { code: item.code },
            {
                $set: {
                    name: item.name,
                    category: item.category,
                    unit: item.unit,
                    purchaseUnit: item.purchaseUnit || item.unit,
                    purchaseUnitSize: item.purchaseUnitSize || 1,
                    note: item.note || ''
                },
                $setOnInsert: { stockQty: 0, minQty: 0, active: true }
            },
            { upsert: true }
        );
    }
}

function workshopPosDefinition(source = {}) {
    const recipe = source.recipe || source;
    const product = source.product || recipe?.product || {};
    const raw = [
        recipe?.sku, recipe?.name, recipe?.matrixPosName,
        product?.sku, product?.name
    ].filter(Boolean).join(' ');
    const text = raw.toUpperCase().replace(/Ё/g,'Е').replace(/\s+/g,' ').trim();

    const defs = [
        { match: /(^|[^A-ZА-Я0-9])(С|C)600([^0-9]|$)|600\s*ММ.*ЗАДН/i, recipeSku:'POS-BACK-600', name:'Задняя стенка 600 мм', outputType:'other', matrixPosName:'С600 - 600мм задняя стенка' },
        { match: /(^|[^A-ZА-Я0-9])(С|C)800([^0-9]|$)|800\s*ММ.*ЗАДН/i, recipeSku:'POS-BACK-800', name:'Задняя стенка 800 мм', outputType:'other', matrixPosName:'С800 - 800мм задняя стенка' },
        { match: /РФ-?2|RF-?2|РАСЧЕСК.*ФАНЕР/i, recipeSku:'POS-COMB-PLY', name:'Расческа из фанеры', outputType:'other', matrixPosName:'РФ-2 - Расческа из фанеры' },
        { match: /(^|[^A-ZА-Я0-9])(Н|H)600([^0-9]|$)|НАКЛЕЙК.*600/i, recipeSku:'POS-STICKER-600', name:'Наклейка 600 мм', outputType:'other', matrixPosName:'Н600 - 600мм наклейка' },
        { match: /(^|[^A-ZА-Я0-9])(Н|H)800([^0-9]|$)|НАКЛЕЙК.*800/i, recipeSku:'POS-STICKER-800', name:'Наклейка 800 мм', outputType:'other', matrixPosName:'Н800 - 800мм наклейка' },
        { match: /ТАБЛИЧК|ОРГ.?СТЕКЛ/i, recipeSku:'POS-ACRYLIC', name:'Табличка из оргстекла', outputType:'sign', matrixPosName:'Табличка - Табличка орг.стекло' }
    ];

    const known = defs.find(def => def.match.test(text));
    if (known) return known;

    const explicitPos = Boolean(
        recipe?.matrixPosName ||
        /^POS-/i.test(String(recipe?.sku || '')) ||
        recipe?.outputType === 'stand' ||
        recipe?.outputType === 'sign' ||
        /СТЕНД|ТОРГОВ.*ОБОРУД/i.test(text)
    );
    if (!explicitPos) return null;

    return {
        recipeSku: '',
        name: String(recipe?.name || product?.name || 'Торговое оборудование')
            .replace(/^\s*(ПЛАНШЕТ|ОБРАЗЕЦ)\s+/i,'')
            .trim(),
        outputType: recipe?.outputType === 'sample' ? 'other' : (recipe?.outputType || 'other'),
        matrixPosName: String(recipe?.matrixPosName || '').trim()
    };
}

async function normalizeWorkshopPosRecipes() {
    const recipes = await WorkshopRecipe.find({}).populate('product','sku name').lean();
    const affectedDealers = new Set();
    let normalized = 0;

    for (const recipe of recipes) {
        const def = workshopPosDefinition({ recipe, product: recipe.product || {} });
        if (!def) continue;

        const currentName = String(recipe.name || '').trim();
        const cleanName = def.name || currentName.replace(/^\s*(Планшет|Образец)\s+/i,'').trim();
        const isCanonical = def.recipeSku && String(recipe.sku || '') === def.recipeSku;

        if (def.recipeSku && !isCanonical) {
            const canonical = await WorkshopRecipe.findOne({ sku:def.recipeSku });
            if (canonical && String(canonical._id) !== String(recipe._id)) {
                const wrongStock = Math.max(0, Number(recipe.stockQty) || 0);
                const wrongMin = Math.max(0, Number(recipe.minStockQty) || 0);
                canonical.stockQty = Math.max(Number(canonical.stockQty) || 0, wrongStock);
                canonical.minStockQty = Math.max(Number(canonical.minStockQty) || 0, wrongMin);
                canonical.name = def.name;
                canonical.outputType = def.outputType;
                canonical.matrixPosName = def.matrixPosName;
                canonical.active = true;
                await canonical.save();

                const wrongAssets = await WorkshopDealerAsset.find({ recipe:recipe._id }).lean();
                for (const asset of wrongAssets) {
                    const existing = await WorkshopDealerAsset.findOne({ dealer:asset.dealer, recipe:canonical._id });
                    const qty = Math.max(0, Number(asset.qty) || 0);
                    if (existing) {
                        existing.qty = Math.max(Number(existing.qty) || 0, qty);
                        await existing.save();
                    } else if (qty > 0) {
                        await WorkshopDealerAsset.create({ dealer:asset.dealer, recipe:canonical._id, qty });
                    }
                    affectedDealers.add(String(asset.dealer));
                }
                await WorkshopDealerAsset.deleteMany({ recipe:recipe._id });

                await WorkshopRecipe.updateOne(
                    { _id:recipe._id },
                    { $set:{
                        name:cleanName || def.name,
                        outputType:def.outputType,
                        matrixPosName:def.matrixPosName,
                        stockQty:0,
                        active:false,
                        note:[String(recipe.note || '').trim(),'Автоматически объединено с торговым оборудованием '+def.recipeSku].filter(Boolean).join(' · ')
                    } }
                );
                normalized++;
                continue;
            }
        }

        const updates = {};
        if (currentName !== cleanName) updates.name = cleanName;
        if (recipe.outputType === 'sample') updates.outputType = def.outputType || 'other';
        if (def.matrixPosName && recipe.matrixPosName !== def.matrixPosName) updates.matrixPosName = def.matrixPosName;
        if (Object.keys(updates).length) {
            await WorkshopRecipe.updateOne({ _id:recipe._id }, { $set:updates });
            normalized++;
        }
    }

    for (const dealerId of affectedDealers) {
        const assets = await WorkshopDealerAsset.find({ dealer:dealerId, qty:{ $gt:0 } }).select('recipe').lean();
        for (const asset of assets) {
            await syncWorkshopPosToDealer(dealerId, asset.recipe);
        }
    }

    if (normalized) console.log(`Workshop POS normalization: ${normalized} recipes normalized`);
}

async function seedWorkshopRecipes() {
    const arabica = await Product.findOne({
        name: /Арабика/i,
        sku: /702/i
    }).lean();
    if (arabica) {
        const exists = await WorkshopRecipe.findOne({ product: arabica._id, outputType: 'sample' }).lean();
        if (!exists) {
            await WorkshopRecipe.create({
                name: `Планшет ${arabica.sku || ''} ${arabica.name || 'Дуб Арабика'}`.trim(),
                outputType: 'sample',
                sku: `SAMPLE-${arabica.sku || '702'}`,
                product: arabica._id,
                sideA: 'Палубная укладка',
                sideB: 'Ёлочка',
                planksPerUnit: 24,
                stockQty: 0,
                active: true,
                note: 'Норма: 24 планки на двухсторонний планшет. 4 упаковки по 30 планок = 5 планшетов без отхода.'
            });
        }
    }

    const materialList = await WorkshopMaterial.find({
        code: { $in: ['PLYWOOD-SHEET','LDSP-SHEET','ACRYLIC-SIGN','STICKER-600','STICKER-800','EDGE'] }
    }).lean();
    const materialByCode = new Map(materialList.map(item => [item.code, item]));

    const fixedRecipes = [
        {
            sku: 'POS-COMB-PLY',
            name: 'Расческа из фанеры',
            outputType: 'other',
            matrixPosName: 'РФ-2 - Расческа из фанеры',
            materials: [{ code:'PLYWOOD-SHEET', qty:0.5, mode:'strict' }],
            note: '1 лист фанеры = 2 расчески'
        },
        {
            sku: 'POS-ACRYLIC',
            name: 'Табличка из оргстекла',
            outputType: 'sign',
            matrixPosName: 'Табличка - Табличка орг.стекло',
            materials: [{ code:'ACRYLIC-SIGN', qty:1, mode:'strict' }],
            note: 'Оргстекло заказывается готовыми штуками в полиграфии'
        },
        {
            sku: 'POS-BACK-600',
            name: 'Стенка 600 мм',
            outputType: 'other',
            matrixPosName: 'С600 - 600мм задняя стенка',
            materials: [
                { code:'LDSP-SHEET', qty:0.25, mode:'strict' },
                { code:'EDGE', qty:0, mode:'estimate' }
            ],
            note: '1 лист ЛДСП = 4 стенки 600 мм. Кромка — ориентировочный расход.'
        },
        {
            sku: 'POS-BACK-800',
            name: 'Стенка 800 мм',
            outputType: 'other',
            matrixPosName: 'С800 - 800мм задняя стенка',
            materials: [
                { code:'LDSP-SHEET', qty:1/3, mode:'strict' },
                { code:'EDGE', qty:0, mode:'estimate' }
            ],
            note: '1 лист ЛДСП = 3 стенки 800 мм. Кромка — ориентировочный расход.'
        },
        {
            sku: 'POS-STICKER-600',
            name: 'Наклейка 600 мм',
            outputType: 'other',
            matrixPosName: 'Н600 - 600мм наклейка',
            materials: [{ code:'STICKER-600', qty:1, mode:'strict' }]
        },
        {
            sku: 'POS-STICKER-800',
            name: 'Наклейка 800 мм',
            outputType: 'other',
            matrixPosName: 'Н800 - 800мм наклейка',
            materials: [{ code:'STICKER-800', qty:1, mode:'strict' }]
        }
    ];

    for (const def of fixedRecipes) {
        const materials = def.materials
            .map(line => {
                const material = materialByCode.get(line.code);
                return material ? { material: material._id, qty: line.qty, mode: line.mode } : null;
            })
            .filter(Boolean);

        await WorkshopRecipe.updateOne(
            { sku: def.sku },
            {
                $set: {
                    name: def.name,
                    outputType: def.outputType,
                    matrixPosName: def.matrixPosName,
                    materials,
                    note: def.note || '',
                    active: true
                },
                $setOnInsert: {
                    stockQty: 0,
                    minStockQty: 0,
                    planksPerUnit: 0,
                    packQtyOverride: 0
                }
            },
            { upsert: true }
        );
    }
}

async function seedStatuses() { const count = await Status.countDocuments(); if (count === 0) { await Status.insertMany([{ value: 'active', label: 'Активный', color: '#198754', isVisible: true, sortOrder: 1 }, { value: 'standard', label: 'Стандарт', color: '#ffc107', isVisible: true, sortOrder: 2 }, { value: 'problem', label: 'Проблемный', color: '#dc3545', isVisible: true, sortOrder: 3 }, { value: 'potential', label: 'Потенциальный', color: '#0d6efd', isVisible: true, sortOrder: 4 }, { value: 'archive', label: 'Архив', color: '#6c757d', isVisible: false, sortOrder: 5 }]); } }
function convertToClient(doc) {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject() : { ...doc };
    obj.id = obj._id;
    delete obj._id;
    delete obj.__v;
    delete obj.password;

    if (obj.products) {
        obj.products = obj.products.map(product => {
            if (!product) return product;
            if (typeof product === 'object') {
                const copy = product.toObject ? product.toObject() : { ...product };
                if (copy._id) {
                    copy.id = copy._id;
                    delete copy._id;
                }
                return copy;
            }
            return product;
        });
    }

    if (obj.price_list && typeof obj.price_list === 'object') {
        const priceList = obj.price_list.toObject ? obj.price_list.toObject() : { ...obj.price_list };
        obj.price_list = {
            id: String(priceList._id || priceList.id || ''),
            name: priceList.name || '',
            code: priceList.code || '',
            versionDate: priceList.versionDate || '',
            validFrom: priceList.validFrom || '',
            validTo: priceList.validTo || '',
            active: priceList.active !== false
        };
    } else if (obj.price_list) {
        obj.price_list = { id: String(obj.price_list), name: '' };
    } else {
        obj.price_list = null;
    }

    if (!Array.isArray(obj.legal_entities)) obj.legal_entities = [];
    if (obj.contract && typeof obj.contract === 'object') {
        obj.contract = {
            isSigned: Boolean(obj.contract.isSigned),
            date: obj.contract.date || ''
        };
    }

    // Legacy duplicates are deliberately not exposed anymore.
    delete obj.organization;
    delete obj.organizations;
    delete obj.requisites;
    return obj;
}

function getUserRole(req) { return req.user ? req.user.role : 'guest'; }
function getUserScope(req) { return req.user ? req.user.scope : 'none'; }
function isGlobalViewer(req) {
    return Boolean(
        req.user &&
        (
            req.user.role === 'marketing' ||
            (req.user.permissions && req.user.permissions.is_admin)
        )
    );
}
function getLegacyScopeFilter(scope) {
    if (scope === 'astana') return { responsible: 'regional_astana' };
    if (scope === 'regions') return { responsible: 'regional_regions' };
    return {};
}

function getDealerFilter(req) {
    if (!req.user) return { _id: null };
    if (isGlobalViewer(req)) return {};

    const scope = getUserScope(req);
    if (scope === 'all') return {};

    // Принадлежность дилера определяется только полем "Ответственный"
    // в карточке дилера. Город и сектор не участвуют.
    if (scope === 'astana' || scope === 'regions') {
        return getLegacyScopeFilter(scope);
    }

    return { _id: null };
}

const NON_WORKING_DEALER_STATUSES = ['potential', 'archive'];

function isNonWorkingDealerStatus(status) {
    return NON_WORKING_DEALER_STATUSES.includes(String(status || '').trim().toLowerCase());
}

function getWorkingDealerFilter(baseFilter = {}) {
    const working = { status: { $nin: NON_WORKING_DEALER_STATUSES } };
    if (!baseFilter || Object.keys(baseFilter).length === 0) return working;
    return { $and: [baseFilter, working] };
}

function shouldIncludeNonWorkingDealers(req) {
    const view = String(req.query?.view || '').trim().toLowerCase();
    return view === 'main' || view === 'map';
}

async function getPricingWorkingDealerFilter(baseFilter = {}) {
    const aliases = new Set([
        ...NON_WORKING_DEALER_STATUSES,
        'prospect',
        'prospective',
        'potential_dealer',
        'potential-dealer',
        'потенциальный',
        'потенциальные',
        'архив',
        'архивный'
    ]);

    const configured = await Status.find({
        $or: [
            { value: { $regex: /(potential|prospect|archive|потенц|архив)/i } },
            { label: { $regex: /(потенц|архив|potential|prospect|archive)/i } }
        ]
    }).select('value').lean();

    configured.forEach(item => {
        const value = String(item?.value || '').trim();
        if (value) aliases.add(value);
    });

    const normalized = [...aliases].filter(Boolean);
    const working = {
        $and: [
            { status: { $nin: normalized } },
            { status: { $not: /^(potential|prospect|archive|потенц|архив)/i } }
        ]
    };

    if (!baseFilter || Object.keys(baseFilter).length === 0) return working;
    return { $and: [baseFilter, working] };
}

function priceListIsEffective(priceList, today = pricingTodayKey()) {
    if (!priceList || priceList.active === false) return false;
    const from = String(priceList.validFrom || '').trim();
    const to = String(priceList.validTo || '').trim();
    if (from && from > today) return false;
    if (to && to < today) return false;
    return true;
}

function pricingTodayKey() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Almaty',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
}

function normalizePricingText(value) {
    return String(value || '').trim().toLowerCase();
}

function pricingConditionStatus(condition, today = pricingTodayKey()) {
    if (condition.cancelledAt) return 'cancelled';
    if (condition.paused) return 'paused';

    const linkedPriceList = condition?.kind === 'price_list' &&
        condition?.priceList &&
        typeof condition.priceList === 'object'
            ? condition.priceList
            : null;

    if (linkedPriceList?.active === false) return 'expired';

    const startDates = [condition?.startDate, linkedPriceList?.validFrom]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .sort();
    const endDates = [condition?.endDate, linkedPriceList?.validTo]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .sort();

    const effectiveStartDate = startDates.length ? startDates[startDates.length - 1] : '';
    const effectiveEndDate = endDates.length ? endDates[0] : '';

    if (effectiveStartDate && effectiveStartDate > today) return 'planned';
    if (effectiveEndDate && effectiveEndDate < today) return 'expired';
    return 'active';
}

function pricingScopeSpecificity(condition) {
    if (condition.scopeType === 'dealer') return 4;
    if (condition.scopeType === 'sector') return 3;
    if (condition.scopeType === 'city') return 2;
    return 1;
}

function pricingConditionEffectiveStartDate(condition) {
    const linkedPriceList = condition?.kind === 'price_list' &&
        condition?.priceList &&
        typeof condition.priceList === 'object'
            ? condition.priceList
            : null;
    const dates = [condition?.startDate, linkedPriceList?.validFrom]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .sort();
    return dates.length ? dates[dates.length - 1] : '';
}

function pricingConditionMatchesDealer(condition, dealer) {
    if (!condition || !dealer) return false;
    if (condition.scopeType === 'all') return true;

    if (condition.scopeType === 'dealer') {
        const targets = Array.isArray(condition.dealers) && condition.dealers.length
            ? condition.dealers
            : (condition.dealer ? [condition.dealer] : []);
        const dealerId = String(dealer._id || dealer.id || '');
        return targets.some(target => String(target?._id || target?.id || target || '') === dealerId);
    }

    const values = Array.isArray(condition.scopeValues) && condition.scopeValues.length
        ? condition.scopeValues
        : (condition.scopeValue ? [condition.scopeValue] : []);

    if (condition.scopeType === 'sector') {
        const sector = normalizePricingText(dealer.region_sector);
        return values.some(value => normalizePricingText(value) === sector);
    }
    if (condition.scopeType === 'city') {
        const city = normalizePricingText(dealer.city);
        return values.some(value => normalizePricingText(value) === city);
    }
    return false;
}

function buildDealerPricingSummary(dealer, allConditions, today = pricingTodayKey()) {
    const matched = (allConditions || [])
        .filter(condition => pricingConditionMatchesDealer(condition, dealer))
        .map(condition => ({ ...condition, computedStatus: pricingConditionStatus(condition, today) }));

    const active = matched.filter(condition => condition.computedStatus === 'active');

    const priceLists = active
        .filter(condition => condition.kind === 'price_list' && (
            !condition.priceList || typeof condition.priceList !== 'object' || priceListIsEffective(condition.priceList, today)
        ))
        .sort((a, b) => {
            const specificityA = pricingScopeSpecificity(a);
            const specificityB = pricingScopeSpecificity(b);

            // For the same target level, the price list with the latest effective
            // start date wins. This makes a newly scheduled dealer price override
            // an older open-ended dealer price even if they came from different UI flows.
            if (specificityA === specificityB) {
                const startCompare = pricingConditionEffectiveStartDate(b)
                    .localeCompare(pricingConditionEffectiveStartDate(a));
                if (startCompare) return startCompare;
            }

            // Across different target levels explicit business priority still wins.
            return (Number(b.priority) || 0) - (Number(a.priority) || 0) ||
                specificityB - specificityA ||
                pricingConditionEffectiveStartDate(b).localeCompare(pricingConditionEffectiveStartDate(a)) ||
                String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) ||
                String(b._id || '').localeCompare(String(a._id || ''));
        });

    const selectedPriceList = priceLists[0] || null;
    const dealerPriceList = dealer?.price_list && typeof dealer.price_list === 'object'
        ? dealer.price_list
        : null;
    const dealerPriceListId = String(dealerPriceList?._id || dealerPriceList?.id || dealer?.price_list || '');
    const dealerProfilePriceListName = dealerPriceList?.name || '';
    const dealerPriceListEffective = dealerPriceList ? priceListIsEffective(dealerPriceList, today) : Boolean(dealer?.price_list);
    const dealerPriceListName = dealerPriceListEffective ? dealerProfilePriceListName : '';
    const effectiveDealerPriceListId = dealerPriceListEffective ? dealerPriceListId : '';
    const fallbackPriceListName = dealerPriceListName || dealer.price_type || 'Спец.цена';
    const activeDiscounts = active.filter(condition => condition.kind === 'discount');

    const exclusive = activeDiscounts
        .filter(condition => condition.stackable === false)
        .sort((a, b) =>
            (Number(b.priority) || 0) - (Number(a.priority) || 0) ||
            (Number(b.discountPercent) || 0) - (Number(a.discountPercent) || 0)
        );

    // The selected price list defines the base price. Active percentage discounts
    // are then applied on top of that base, matching the CRM UI and dealer rules.
    const stackableDiscounts = activeDiscounts
        .filter(condition => condition.stackable !== false)
        .sort((a, b) =>
            (Number(b.priority) || 0) - (Number(a.priority) || 0) ||
            String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
        );
    const seenDiscountPercents = new Set();
    const uniqueStackableDiscounts = stackableDiscounts.filter(condition => {
        const percent = Math.max(0, Number(condition.discountPercent) || 0);
        const key = percent.toFixed(4);
        if (seenDiscountPercents.has(key)) return false;
        seenDiscountPercents.add(key);
        return true;
    });
    const appliedDiscounts = exclusive.length
        ? [exclusive[0]]
        : uniqueStackableDiscounts;

    const totalDiscountPercent = appliedDiscounts.reduce(
        (sum, condition) => sum + Math.max(0, Number(condition.discountPercent) || 0),
        0
    );

    const ignoredDiscounts = activeDiscounts.filter(condition =>
        !appliedDiscounts.some(applied => String(applied._id) === String(condition._id))
    );
    const activeEndDates = active
        .flatMap(condition => {
            const dates = [condition.endDate];
            if (condition.kind === 'price_list' && condition.priceList && typeof condition.priceList === 'object') {
                dates.push(condition.priceList.validTo);
            }
            return dates;
        })
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .sort();
    const pendingRequirements = active.filter(condition =>
        Number(condition.requirementTarget) > 0 &&
        (
            Number(condition.requirementCurrent) < Number(condition.requirementTarget) ||
            condition.requirementVerified !== true
        )
    );

    return {
        dealerId: String(dealer._id || dealer.id || ''),
        dealerCode: dealer.dealer_id || '',
        dealerName: dealer.name || '',
        city: dealer.city || '',
        sector: dealer.region_sector || '',
        responsible: dealer.responsible || '',
        defaultPriceType: dealer.price_type || '',
        assignedPriceList: dealerProfilePriceListName || '',
        assignedPriceListId: dealerPriceListId,
        profilePriceList: dealerProfilePriceListName || dealer.price_type || 'Спец.цена',
        profilePriceListId: dealerPriceListId,
        profilePriceListEffective: dealerPriceListEffective,
        fallbackPriceList: fallbackPriceListName,
        effectivePriceList: selectedPriceList?.priceList?.name || selectedPriceList?.priceListName || selectedPriceList?.name || fallbackPriceListName,
        effectivePriceListId: String(selectedPriceList?.priceList?._id || selectedPriceList?.priceList || effectiveDealerPriceListId || ''),
        priceListCondition: selectedPriceList,
        priceResolution: {
            source: selectedPriceList ? 'priority_condition' : (dealerPriceListEffective ? 'dealer_profile' : 'default'),
            selectedConditionId: String(selectedPriceList?._id || ''),
            selectedPriority: selectedPriceList ? (Number(selectedPriceList.priority) || 0) : null,
            selectedScope: selectedPriceList?.scopeType || '',
            matchingPriceLists: priceLists.map(condition => ({
                id: String(condition._id || ''),
                name: condition.priceList?.name || condition.priceListName || condition.name || '',
                priority: Number(condition.priority) || 0,
                scopeType: condition.scopeType || '',
                selected: String(condition._id || '') === String(selectedPriceList?._id || '')
            })),
            discountsSuspended: false,
            suspendedDiscountCount: 0
        },
        priceOverride: selectedPriceList ? {
            active: true,
            conditionId: String(selectedPriceList._id || ''),
            scopeType: selectedPriceList.scopeType || '',
            scopeValues: Array.isArray(selectedPriceList.scopeValues) && selectedPriceList.scopeValues.length
                ? selectedPriceList.scopeValues
                : (selectedPriceList.scopeValue ? [selectedPriceList.scopeValue] : []),
            startDate: selectedPriceList.startDate || selectedPriceList?.priceList?.validFrom || '',
            endDate: selectedPriceList.endDate || selectedPriceList?.priceList?.validTo || '',
            priority: Number(selectedPriceList.priority) || 0,
            fallbackPriceList: fallbackPriceListName
        } : null,
        priceListConflicts: selectedPriceList
            ? Math.max(0, priceLists.filter(condition =>
                pricingScopeSpecificity(condition) === pricingScopeSpecificity(selectedPriceList)
              ).length - 1)
            : 0,
        activeDiscounts: appliedDiscounts,
        ignoredDiscounts,
        totalDiscountPercent,
        has5: appliedDiscounts.some(condition => Math.abs((Number(condition.discountPercent) || 0) - 5) < 0.001),
        has10: appliedDiscounts.some(condition => Math.abs((Number(condition.discountPercent) || 0) - 10) < 0.001),
        nearestEndDate: activeEndDates[0] || '',
        pendingRequirements: pendingRequirements.length,
        matchedConditions: matched
    };
}

function pricingUserMeta(req) {
    return {
        id: String(req.user?._id || req.user?.id || ''),
        name: req.user?.fullName || req.user?.username || ''
    };
}

function cleanPricingPayload(body = {}) {
    const kind = body.kind === 'price_list' ? 'price_list' : 'discount';
    const scopeType = ['dealer', 'sector', 'city', 'all'].includes(body.scopeType) ? body.scopeType : 'dealer';
    const reasonTypes = ['social_posts', 'support_promo', 'regional_price', 'individual', 'other'];
    const reasonType = reasonTypes.includes(body.reasonType) ? body.reasonType : 'other';
    const targetDefault = reasonType === 'social_posts' ? 8 : 0;

    const dealerIds = scopeType === 'dealer'
        ? [...new Set(
            (Array.isArray(body.dealerIds) ? body.dealerIds : [body.dealerId])
                .map(value => String(value || '').trim())
                .filter(value => mongoose.Types.ObjectId.isValid(value))
        )]
        : [];

    const scopeValues = (scopeType === 'sector' || scopeType === 'city')
        ? [...new Set(
            (Array.isArray(body.scopeValues) ? body.scopeValues : [body.scopeValue])
                .map(value => String(value || '').trim())
                .filter(Boolean)
        )]
        : [];

    return {
        name: String(body.name || '').trim(),
        code: String(body.code || '').trim(),
        kind,
        scopeType,
        dealer: dealerIds[0] || null,
        dealers: dealerIds,
        scopeValue: scopeValues[0] || '',
        scopeValues,
        discountPercent: kind === 'discount' ? Math.max(0, Number(body.discountPercent) || 0) : 0,
        priceListName: kind === 'price_list' ? String(body.priceListName || '').trim() : '',
        priceList: kind === 'price_list' && body.priceListId ? body.priceListId : null,
        stackable: kind === 'discount' ? body.stackable !== false : false,
        priority: kind === 'price_list'
            ? (Number(body.priority) > 0
                ? Number(body.priority)
                : (({ all:100, city:200, sector:300, dealer:400 })[scopeType] || 100))
            : (Number(body.priority) || 0),
        startDate: String(body.startDate || '').trim(),
        endDate: String(body.endDate || '').trim(),
        paused: Boolean(body.paused),
        reasonType,
        requirementTarget: Math.max(0, Number(body.requirementTarget ?? targetDefault) || 0),
        requirementCurrent: Math.max(0, Number(body.requirementCurrent) || 0),
        requirementUnit: String(body.requirementUnit || 'публикаций').trim() || 'публикаций',
        requirementDueDate: String(body.requirementDueDate || '').trim(),
        requirementVerified: Boolean(body.requirementVerified),
        proofNote: String(body.proofNote || '').trim(),
        note: String(body.note || '').trim()
    };
}

function validatePricingPayload(payload) {
    if (!payload.name) return 'Укажите название условия';
    if (payload.kind === 'discount' && (payload.discountPercent <= 0 || payload.discountPercent > 100)) {
        return 'Скидка должна быть больше 0% и не больше 100%';
    }
    if (payload.kind === 'price_list' && !payload.priceListName && !payload.priceList) return 'Выберите базовый прайс';
    if (payload.scopeType === 'dealer' && (!Array.isArray(payload.dealers) || !payload.dealers.length)) return 'Выберите хотя бы одного дилера';
    if ((payload.scopeType === 'sector' || payload.scopeType === 'city') && (!Array.isArray(payload.scopeValues) || !payload.scopeValues.length)) {
        return payload.scopeType === 'city' ? 'Выберите хотя бы один город' : 'Выберите хотя бы один сектор';
    }
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (payload.startDate && !dateRe.test(payload.startDate)) return 'Некорректная дата начала';
    if (payload.endDate && !dateRe.test(payload.endDate)) return 'Некорректная дата окончания';
    if (payload.startDate && payload.endDate && payload.endDate < payload.startDate) {
        return 'Дата окончания не может быть раньше даты начала';
    }
    return '';
}

function pricingPeriodsOverlap(aStart, aEnd, bStart, bEnd) {
    const startA = aStart || '0000-01-01';
    const endA = aEnd || '9999-12-31';
    const startB = bStart || '0000-01-01';
    const endB = bEnd || '9999-12-31';
    return startA <= endB && startB <= endA;
}

async function findPricingDuplicate(payload, excludeId = '') {
    if (!payload.code) return null;

    const query = {
        code: payload.code,
        kind: payload.kind,
        scopeType: payload.scopeType,
        cancelledAt: { $in: [null] }
    };
    if (excludeId) query._id = { $ne: excludeId };

    const targetSet = values => new Set((values || []).map(value => String(value?._id || value?.id || value || '').trim()).filter(Boolean));
    const textSet = values => new Set((values || []).map(value => normalizePricingText(value)).filter(Boolean));

    const candidates = await PricingCondition.find(query).lean();
    return candidates.find(item => {
        if (!pricingPeriodsOverlap(payload.startDate, payload.endDate, item.startDate, item.endDate)) return false;
        if (payload.scopeType === 'all') return true;

        if (payload.scopeType === 'dealer') {
            const current = targetSet(payload.dealers?.length ? payload.dealers : [payload.dealer]);
            const existing = targetSet(item.dealers?.length ? item.dealers : [item.dealer]);
            return [...current].some(value => existing.has(value));
        }

        const current = textSet(payload.scopeValues?.length ? payload.scopeValues : [payload.scopeValue]);
        const existing = textSet(item.scopeValues?.length ? item.scopeValues : [item.scopeValue]);
        return [...current].some(value => existing.has(value));
    }) || null;
}

async function validatePricingTargets(req, payload) {
    if (payload.scopeType === 'all') return '';

    const dealerFilter = await getPricingWorkingDealerFilter(getDealerFilter(req));

    if (payload.scopeType === 'dealer') {
        const ids = Array.isArray(payload.dealers) ? payload.dealers.filter(Boolean) : [];
        if (!ids.length) return 'Выберите хотя бы одного дилера';

        const available = await Dealer.find({
            $and: [
                { _id: { $in: ids } },
                dealerFilter
            ]
        }).select('_id').lean();

        const availableIds = new Set(available.map(item => String(item._id)));
        const missing = ids.filter(id => !availableIds.has(String(id)));
        return missing.length ? 'Один или несколько выбранных дилеров недоступны' : '';
    }

    if (payload.scopeType === 'city' || payload.scopeType === 'sector') {
        const values = Array.isArray(payload.scopeValues) ? payload.scopeValues.filter(Boolean) : [];
        if (!values.length) return payload.scopeType === 'city'
            ? 'Выберите хотя бы один город'
            : 'Выберите хотя бы один сектор';

        const field = payload.scopeType === 'city' ? 'city' : 'region_sector';
        const dealers = await Dealer.find(dealerFilter).select(field).lean();
        const available = new Set(
            dealers
                .map(item => normalizePricingText(item[field]))
                .filter(Boolean)
        );
        const missing = values.filter(value => !available.has(normalizePricingText(value)));
        return missing.length
            ? (payload.scopeType === 'city'
                ? 'Один или несколько выбранных городов отсутствуют в рабочей базе'
                : 'Один или несколько выбранных секторов отсутствуют в рабочей базе')
            : '';
    }

    return '';
}

async function cleanupAmbiguousLegacyOwnership() {
    // Старые версии CRM автоматически назначали единственному менеджеру
    // всех дилеров Астаны/регионов. Такое назначение нельзя считать ответственным.
    // Оставляем только назначения, которые были явно подтверждены пользователем.
    const ambiguousFilter = {
        responsibleUserId: { $nin: [null, ''] },
        responsible: { $in: ['regional_astana', 'regional_regions'] },
        $or: [
            { responsibleAssignmentSource: { $exists: false } },
            { responsibleAssignmentSource: null },
            { responsibleAssignmentSource: '' }
        ]
    };

    const result = await Dealer.updateMany(
        ambiguousFilter,
        {
            $unset: { responsibleUserId: '' },
            $set: { responsibleAssignmentSource: 'needs_review' }
        }
    );

    if (result.modifiedCount) {
        console.log(`Dealer ownership cleanup: ${result.modifiedCount} ambiguous assignments reset`);
    }
}

app.get('/api/auth/me', (req, res) => { res.json({ user: req.user }); });

// --- API ROUTES ---

app.get('/api/managers', requireAnyPermission('can_view_dealers', 'can_view_sales', 'can_edit_dealer'), async (req, res) => {
    try {
        const managers = await User.find({
            role: 'manager',
            isBlocked: { $ne: true },
            'permissions.is_admin': { $ne: true }
        })
            .select('_id username fullName scope')
            .sort({ fullName: 1, username: 1 })
            .lean();

        res.json(managers.map(user => ({
            id: String(user._id),
            username: user.username,
            fullName: user.fullName || user.username,
            scope: user.scope || 'all'
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/statuses', requireAnyPermission('can_view_dealers', 'can_view_map'), async (req, res) => { const s = await Status.find().sort({sortOrder: 1}).lean(); res.json(s.map(convertToClient)); });
app.post('/api/statuses', requirePermission('can_edit_dealer'), async (req, res) => { try { const s = new Status(req.body); await s.save(); res.json(convertToClient(s)); } catch(e){ res.status(500).json({error:e.message}); } });
app.put('/api/statuses/:id', requirePermission('can_edit_dealer'), async (req, res) => { try { await Status.findByIdAndUpdate(req.params.id, req.body); res.json({status:'ok'}); } catch(e){ res.status(500).json({error:e.message}); } });
app.delete('/api/statuses/:id', requirePermission('can_edit_dealer'), async (req, res) => { await Status.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });

// --- API СЕКТОРОВ ---
app.get('/api/sectors', requireAnyPermission('can_view_dealers', 'can_view_sales'), async (req, res) => { const list = await Sector.find().sort({name:1}); res.json(list.map(convertToClient)); });
app.post('/api/sectors', requirePermission('can_edit_dealer'), async (req, res) => { const s = new Sector(req.body); await s.save(); res.json(convertToClient(s)); });
app.delete('/api/sectors/:id', requirePermission('can_edit_dealer'), async (req, res) => { await Sector.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });

app.post('/api/exports/log', requireAnyPermission('can_export_base', 'can_export_prices'), async (req, res) => {
    try {
        const type=String(req.body?.type||'').trim();
        if (!['dealers','prices'].includes(type)) return res.status(400).json({error:'Неизвестный тип выгрузки'});
        if (type==='dealers' && !hasPermission(req,'can_export_base')) return res.status(403).json({error:'Нет права выгружать базу дилеров'});
        if (type==='prices' && !hasPermission(req,'can_export_prices')) return res.status(403).json({error:'Нет права выгружать цены конкурентов'});

        const scope=['current','working','all'].includes(String(req.body?.scope||'')) ? String(req.body.scope) : 'current';
        const columns=Array.isArray(req.body?.columns) ? req.body.columns.map(value=>String(value).slice(0,80)).slice(0,60) : [];
        const rowCount=Math.max(0,Math.min(100000,Number(req.body?.rowCount)||0));
        res.json({status:'logged',type,scope,columns,rowCount});
    } catch(e) {
        res.status(500).json({error:e.message});
    }
});

function escapeRegexLiteral(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function nextDealerCode() {
    const rows = await Dealer.find({ dealer_id: { $regex: /^IF\d+$/i } }).select('dealer_id').lean();
    let max = 0;
    rows.forEach(row => {
        const match = String(row.dealer_id || '').trim().match(/^IF(\d+)$/i);
        if (match) max = Math.max(max, Number(match[1]) || 0);
    });
    let next = max + 1;
    let code = 'IF' + String(next).padStart(3,'0');
    while (await Dealer.exists({ dealer_id: new RegExp('^' + escapeRegexLiteral(code) + '$','i') })) {
        next += 1;
        code = 'IF' + String(next).padStart(3,'0');
    }
    return code;
}

app.get('/api/dealers', requireAnyPermission('can_view_dealers', 'can_view_map', 'can_view_sales', 'can_view_competitors', 'can_view_reclamations'), async (req, res) => {
    try {
        let filter = getDealerFilter(req);
        if (req.query.scope === 'all' && req.user.permissions && req.user.permissions.is_admin) filter = {};
        if (req.query.context === 'sales' && hasPermission(req, 'can_view_sales')) filter = {};
        if (!shouldIncludeNonWorkingDealers(req)) filter = getWorkingDealerFilter(filter);

        let query = Dealer.find(filter);
        if (req.query.view === 'map') {
            query = query.select('_id name city address contacts latitude longitude status responsible responsibleUserId');
        } else {
            query = query.select('-photos -visits -products -avatarUrl')
                .populate('price_list', 'name code versionDate validFrom validTo active includeIlliquid').populate('motivation_scheme', 'name ratePerM2 validFrom validTo active');
        }
        const dealers = await query.lean();
        res.json(dealers.map(d => ({ id: d._id, ...d })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/dealers/next-id', requirePermission('can_create_dealer'), async (req, res) => {
    try { res.json({ dealer_id: await nextDealerCode() }); }
    catch (e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/dealers/:id/avatar', requirePermission('can_view_dealers'), async (req, res) => {
    try {
        const d = await Dealer.findOne({ _id: req.params.id, ...getDealerFilter(req) }).select('avatarUrl').lean();
        if (!d) return res.status(404).json({ error: 'Дилер не найден' });
        res.set('Cache-Control', 'private, max-age=900');
        res.json({ avatarUrl: d.avatarUrl || '' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/dealers/:id', requirePermission('can_view_dealers'), async (req, res) => {
    try {
        let query = Dealer.findOne({ _id: req.params.id, ...getDealerFilter(req) })
            .populate('price_list', 'name code versionDate validFrom validTo active includeIlliquid').populate('motivation_scheme', 'name ratePerM2 validFrom validTo active');
        if (req.query.view === 'profile') {
            query = query.select('-photos').populate('products', 'sku name');
        } else {
            query = query.populate('products');
        }
        const d = await query.lean();
        if (!d) return res.status(404).json({ error: 'Дилер не найден' });
        if (req.query.view === 'profile') res.set('Cache-Control', 'private, max-age=30');
        res.json(convertToClient(d));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/dealers/:id/photos', requirePermission('can_view_dealers'), async (req, res) => {
    try {
        const d = await Dealer.findOne({ _id: req.params.id, ...getDealerFilter(req) }).select('photos').lean();
        if (!d) return res.status(404).json({ error: 'Дилер не найден' });
        res.set('Cache-Control', 'private, max-age=60');
        res.json(Array.isArray(d.photos) ? d.photos : []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/dealers', requirePermission('can_create_dealer'), async (req, res) => {
    try {
        const scope = getUserScope(req);
        const isClone = Boolean(req.body && req.body._cloneSourceId);
        const payload = canonicalDealerPayload(req.body);
        delete payload._cloneSourceId;
        delete payload._cloneSourceDealerId;
        delete payload._cloneSourceLabel;

        payload.dealer_id = String(payload.dealer_id || '').trim().toUpperCase();
        if (!payload.dealer_id) payload.dealer_id = await nextDealerCode();
        if (!isClone) {
            const existingId = await Dealer.exists({ dealer_id:new RegExp('^'+escapeRegexLiteral(payload.dealer_id)+'$','i') });
            if (existingId) return res.status(409).json({ error:'Дилер с ID '+payload.dealer_id+' уже существует' });
        }

        if (req.user.role === 'manager' && !isGlobalViewer(req)) {
            payload.responsibleUserId = String(req.user.id || '');
            payload.responsibleAssignmentSource = req.body && req.body._cloneSourceId ? 'duplicate_self' : 'self_create';
            if (scope === 'astana') payload.responsible = 'regional_astana';
            if (scope === 'regions') payload.responsible = 'regional_regions';
        } else if (req.body && req.body._cloneSourceId && req.body.responsibleUserId) {
            payload.responsibleUserId = String(req.body.responsibleUserId || '');
            payload.responsibleAssignmentSource = 'duplicate';
        }

        const d = new Dealer(payload);
        await d.save();
        res.status(201).json(convertToClient(d));
    } catch (e) { res.status(500).json({ error:e.message }); }
});
app.post('/api/dealers/:id/visits', requirePermission('can_manage_visits'), async (req, res) => {
    try {
        const dealer = await Dealer.findOne({ _id: req.params.id, ...getDealerFilter(req) });
        if (!dealer) return res.status(404).json({ error: 'Дилер не найден' });

        const visit = {
            date: req.body.date || new Date().toISOString().slice(0, 10),
            comment: String(req.body.comment || '').trim(),
            isCompleted: req.body.isCompleted !== false
        };
        if (!visit.comment) return res.status(400).json({ error: 'Комментарий визита обязателен' });

        dealer.visits = dealer.visits || [];
        dealer.visits.push(visit);
        await dealer.save();

        res.status(201).json({ status: 'ok', visit });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dealers/:id/visits/:index', requirePermission('can_manage_visits'), async (req, res) => {
    try {
        const dealer = await Dealer.findOne({ _id: req.params.id, ...getDealerFilter(req) });
        if (!dealer) return res.status(404).json({ error: 'Дилер не найден' });

        const index = Number(req.params.index);
        if (!Number.isInteger(index) || index < 0 || !dealer.visits || !dealer.visits[index]) {
            return res.status(404).json({ error: 'Визит не найден' });
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'isCompleted')) {
            dealer.visits[index].isCompleted = Boolean(req.body.isCompleted);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'comment')) {
            dealer.visits[index].comment = String(req.body.comment || '').trim();
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'date')) {
            dealer.visits[index].date = String(req.body.date || '');
        }

        await dealer.save();
        res.json({ status: 'ok', visit: dealer.visits[index] });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dealers/:id', requirePermission('can_edit_dealer'), async (req, res) => {
    try {
        const payload = canonicalDealerPayload(req.body);
        if (Object.prototype.hasOwnProperty.call(payload,'dealer_id')) {
            payload.dealer_id = String(payload.dealer_id || '').trim().toUpperCase();
        }
        if (req.user.role === 'manager' && !isGlobalViewer(req)) {
            delete payload.responsibleUserId;
            delete payload.responsibleAssignmentSource;
            if (req.user.scope === 'astana') payload.responsible = 'regional_astana';
            if (req.user.scope === 'regions') payload.responsible = 'regional_regions';
        }
        const updated = await Dealer.findOneAndUpdate({ _id:req.params.id, ...getDealerFilter(req) }, payload, { new:true });
        if (!updated) return res.status(404).json({ error:'Дилер не найден' });
        res.json({status:'ok'});
    } catch (e) { res.status(500).json({ error:e.message }); }
});

app.patch('/api/dealers/:id', requirePermission('can_edit_dealer'), async (req, res) => {
    try {
        const payload = canonicalDealerPayload(req.body);
        if (Object.prototype.hasOwnProperty.call(payload,'dealer_id')) {
            payload.dealer_id = String(payload.dealer_id || '').trim().toUpperCase();
        }
        if (req.user.role === 'manager' && !isGlobalViewer(req)) {
            delete payload.responsibleUserId;
            delete payload.responsibleAssignmentSource;
            if (req.user.scope === 'astana') payload.responsible = 'regional_astana';
            if (req.user.scope === 'regions') payload.responsible = 'regional_regions';
        }
        const updated = await Dealer.findOneAndUpdate({ _id:req.params.id, ...getDealerFilter(req) }, { $set:payload }, { new:true }).lean();
        if (!updated) return res.status(404).json({ error:'Дилер не найден' });
        res.json({status:'ok'});
    } catch (e) { res.status(500).json({ error:e.message }); }
});
app.delete('/api/dealers/:id', requirePermission('can_delete_dealer'), async (req, res) => { try { await Dealer.findOneAndDelete({ _id: req.params.id, ...getDealerFilter(req) }); res.json({status:'deleted'}); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/dealers/:id/products', requireAnyPermission('can_view_dealers', 'can_view_products'), async (req, res) => {
    const d = await Dealer.findOne({ _id:req.params.id, ...getDealerFilter(req) }).populate('products');
    if (!d) return res.status(404).json({ error:'Дилер не найден' });
    const laminateProducts = (d.products || []).filter(product => String(product?.product_type || 'laminate') !== 'equipment');
    res.json(laminateProducts.map(convertToClient));
});
app.put('/api/dealers/:id/products', requirePermission('can_edit_matrix'), async (req, res) => {
    try {
        const requestedIds = [...new Set(
            (Array.isArray(req.body?.productIds) ? req.body.productIds : [])
                .map(value => String(value || '').trim())
                .filter(value => mongoose.Types.ObjectId.isValid(value))
        )];
        const laminateProducts = requestedIds.length
            ? await Product.find({
                _id:{ $in:requestedIds },
                product_type:{ $ne:'equipment' }
            }).select('_id').lean()
            : [];
        const productIds = laminateProducts.map(item => item._id);
        const d = await Dealer.findOneAndUpdate(
            { _id:req.params.id, ...getDealerFilter(req) },
            { $set:{ products:productIds } },
            { new:true }
        ).lean();
        if (!d) return res.status(404).json({ error:'Дилер не найден' });
        res.json({ status:'ok', saved:productIds.length });
    } catch (e) {
        res.status(400).json({ error:e.message });
    }
});
// ==========================================
// ЦЕНОВЫЕ УСЛОВИЯ ДИЛЕРОВ
// ==========================================
function normalizePricingSku(value) {
    return String(value || '').toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, '').trim();
}

function inferPricingCollection(product = {}) {
    return String(product.collection || '').trim().toUpperCase();
}

function isPricingLaminateProduct(product = {}) {
    const sku = normalizePricingSku(product.sku);
    const name = String(product.name || '').toUpperCase().replace(/Ё/g, 'Е');
    const collection = String(product.collection || '').trim();
    if (String(product.product_type || 'laminate') === 'equipment') return false;
    if (!sku && !name) return false;
    if (!collection) return false;
    if (sku === 'POS' || sku.startsWith('POS-')) return false;
    if (/СТЕНД|ТАБЛИЧК|НАКЛЕЙК|РАСЧЕСК|ЗАДНЯЯ\s*СТЕНК|ОБОРУДОВАН|ПЛИНТУС|ПОРОГ|ПРОФИЛ/.test(name)) return false;
    return true;
}

function cleanPriceListRows(rows = []) {
    return (Array.isArray(rows) ? rows : [])
        .filter(row => row && typeof row === 'object')
        .map(row => {
            const scopeType = row.scopeType === 'collection' ? 'collection' : 'product';
            return {
                scopeType,
                collection: String(row.collection || '').trim().toUpperCase(),
                product: scopeType === 'product' ? (row.productId || row.product || null) : null,
                sku: scopeType === 'product' ? String(row.sku || '').trim() : '',
                name: scopeType === 'product' ? String(row.name || '').trim() : String(row.collection || row.name || '').trim(),
                isLiquid: scopeType === 'collection' ? true : row.isLiquid !== false,
                opt: Math.max(0, Number(row.opt) || 0),
                rrp: Math.max(0, Number(row.rrp) || 0),
                displayPrice: Math.max(0, Number(row.displayPrice ?? row.maxRrp) || 0),
                maxRrp: Math.max(0, Number(row.maxRrp) || 0),
                currency: String(row.currency || 'KZT').trim() || 'KZT'
            };
        })
        .filter(row => row.scopeType === 'collection' ? row.collection : (row.product || row.sku || row.name));
}

function legacyRowCollection(row, productMap) {
    const product = row?.product ? productMap.get(String(row.product)) : null;
    return String(row?.collection || inferPricingCollection(product || row || '')).trim().toUpperCase();
}

function dealerPriceColumn(priceType = '') {
    const value = String(priceType || '').trim().toLowerCase();
    if (value.includes('ррц') || value.includes('рознич') || value.includes('макс')) return { key: 'rrp', label: 'РРЦ' };
    return { key: 'opt', label: 'Спец.цена' };
}

function firstDealerPhone(contacts = []) {
    for (const contact of Array.isArray(contacts) ? contacts : []) {
        const raw = String(contact?.contactInfo || '').trim();
        if (!raw) continue;
        const digits = raw.replace(/\D/g, '');
        if (digits.length >= 10) {
            if (digits.length === 10) return '7' + digits;
            if (digits.startsWith('8') && digits.length === 11) return '7' + digits.slice(1);
            return digits;
        }
    }
    return '';
}

async function resolveSummaryPriceList(summary) {
    const byId = summary?.effectivePriceListId;
    if (byId && mongoose.Types.ObjectId.isValid(byId)) {
        const found = await PriceList.findById(byId).lean();
        if (found && priceListIsEffective(found)) return found;
    }
    const name = String(summary?.effectivePriceList || '').trim();
    if (!name) return null;
    const candidates = await PriceList.find({ name, active: { $ne: false } }).sort({ versionDate: -1, updatedAt: -1 }).lean();
    return candidates.find(item => priceListIsEffective(item)) || null;
}

app.get('/api/pricing/catalog', requirePermission('can_view_pricing'), async (req, res) => {
    try {
        const products = await Product.find({})
            .select('_id sku name product_type collection is_liquid stock_qty characteristics photo_id')
            .sort({ sku: 1, name: 1 })
            .lean();

        res.json(products
            .map(product => {
                const productType = product.product_type === 'equipment' ? 'equipment' : 'laminate';
                return {
                    id: String(product._id),
                    sku: product.sku || '',
                    name: product.name || '',
                    productType,
                    collection: productType === 'equipment' ? 'ТОРГОВОЕ ОБОРУДОВАНИЕ' : inferPricingCollection(product),
                    isLiquid: productType === 'equipment' ? true : product.is_liquid !== false,
                    stockQty: Math.max(0, Number(product.stock_qty) || 0),
                    characteristics: product.characteristics || {},
                    photoId: String(product.photo_id || '').trim()
                };
            })
            .sort((a, b) =>
                String(a.productType).localeCompare(String(b.productType), 'ru') ||
                Number(b.isLiquid) - Number(a.isLiquid) ||
                String(a.collection).localeCompare(String(b.collection), 'ru') ||
                String(a.sku).localeCompare(String(b.sku), 'ru')
            ));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/pricing/price-lists', requireAnyPermission('can_view_pricing', 'can_view_dealers'), async (req, res) => {
    try {
        const lists = await PriceList.find({})
            .select('_id name code versionDate validFrom validTo active includeIlliquid archivedAt note rows createdAt updatedAt')
            .sort({ active: -1, versionDate: -1, updatedAt: -1 })
            .lean();
        res.json(lists.map(item => ({
            id: String(item._id),
            name: item.name || '',
            code: item.code || '',
            versionDate: item.versionDate || '',
            validFrom: item.validFrom || '',
            validTo: item.validTo || '',
            active: item.active !== false,
            includeIlliquid: item.includeIlliquid === true,
            archivedAt: item.archivedAt || null,
            note: item.note || '',
            rowsCount: Array.isArray(item.rows) ? item.rows.length : 0,
            pricedCount: Array.isArray(item.rows) ? item.rows.filter(row => Number(row.opt) > 0 || Number(row.rrp) > 0 || Number(row.displayPrice) > 0 || Number(row.maxRrp) > 0).length : 0,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/pricing/price-lists/:id', requirePermission('can_view_pricing'), async (req, res) => {
    try {
        const list = await PriceList.findById(req.params.id).lean();
        if (!list) return res.status(404).json({ error: 'Прайс не найден' });
        res.json({
            id: String(list._id),
            name: list.name || '',
            code: list.code || '',
            versionDate: list.versionDate || '',
            validFrom: list.validFrom || '',
            validTo: list.validTo || '',
            active: list.active !== false,
            includeIlliquid: list.includeIlliquid === true,
            note: list.note || '',
            rows: (list.rows || []).map(row => ({
                scopeType: row.scopeType || (row.product ? 'product' : 'collection'),
                collection: row.collection || '',
                productId: String(row.product || ''),
                sku: row.sku || '',
                name: row.name || '',
                isLiquid: row.isLiquid !== false,
                opt: Number(row.opt) || 0,
                rrp: Number(row.rrp) || 0,
                displayPrice: Number(row.displayPrice ?? row.maxRrp) || 0,
                currency: row.currency || 'KZT'
            }))
        });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/pricing/price-lists', requirePermission('can_manage_pricing'), async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        if (!name) return res.status(400).json({ error: 'Укажите название прайса' });
        const validFrom = String(req.body?.validFrom || '').trim();
        const validTo = String(req.body?.validTo || '').trim();
        const dateRe = /^\d{4}-\d{2}-\d{2}$/;
        if (validFrom && !dateRe.test(validFrom)) return res.status(400).json({ error:'Некорректная дата начала прайса' });
        if (validTo && !dateRe.test(validTo)) return res.status(400).json({ error:'Некорректная дата окончания прайса' });
        if (validFrom && validTo && validTo < validFrom) return res.status(400).json({ error:'Дата окончания прайса не может быть раньше даты начала' });
        const user = pricingUserMeta(req);
        const list = await PriceList.create({
            name,
            code: String(req.body?.code || '').trim(),
            versionDate: String(req.body?.versionDate || '').trim(),
            validFrom,
            validTo,
            active: req.body?.active !== false,
            includeIlliquid: req.body?.includeIlliquid === true,
            note: String(req.body?.note || '').trim(),
            rows: cleanPriceListRows(req.body?.rows),
            createdBy: user,
            updatedBy: user
        });
        res.status(201).json({ id: String(list._id), status: 'ok' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.put('/api/pricing/price-lists/:id', requirePermission('can_manage_pricing'), async (req, res) => {
    try {
        const list = await PriceList.findById(req.params.id);
        if (!list) return res.status(404).json({ error: 'Прайс не найден' });
        const name = String(req.body?.name || '').trim();
        if (!name) return res.status(400).json({ error: 'Укажите название прайса' });
        const validFrom = String(req.body?.validFrom || '').trim();
        const validTo = String(req.body?.validTo || '').trim();
        const dateRe = /^\d{4}-\d{2}-\d{2}$/;
        if (validFrom && !dateRe.test(validFrom)) return res.status(400).json({ error:'Некорректная дата начала прайса' });
        if (validTo && !dateRe.test(validTo)) return res.status(400).json({ error:'Некорректная дата окончания прайса' });
        if (validFrom && validTo && validTo < validFrom) return res.status(400).json({ error:'Дата окончания прайса не может быть раньше даты начала' });
        list.name = name;
        list.code = String(req.body?.code || '').trim();
        list.versionDate = String(req.body?.versionDate || '').trim();
        list.validFrom = validFrom;
        list.validTo = validTo;
        list.active = req.body?.active !== false;
        list.includeIlliquid = req.body?.includeIlliquid === true;
        list.archivedAt = list.active ? null : (list.archivedAt || new Date());
        list.note = String(req.body?.note || '').trim();
        list.rows = cleanPriceListRows(req.body?.rows);
        list.updatedBy = pricingUserMeta(req);
        await list.save();
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.delete('/api/pricing/price-lists/:id', requirePermission('can_manage_pricing'), async (req, res) => {
    try {
        const list = await PriceList.findById(req.params.id);
        if (!list) return res.status(404).json({ error: 'Прайс не найден' });
        list.active = false;
        list.archivedAt = new Date();
        list.updatedBy = pricingUserMeta(req);
        await list.save();
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/pricing/price-lists/:id/restore', requirePermission('can_manage_pricing'), async (req, res) => {
    try {
        const list = await PriceList.findById(req.params.id);
        if (!list) return res.status(404).json({ error:'Прайс не найден' });
        list.active = true;
        list.archivedAt = null;
        list.updatedBy = pricingUserMeta(req);
        await list.save();
        res.json({ status:'ok', active:true });
    } catch (e) {
        res.status(400).json({ error:e.message });
    }
});

app.delete('/api/pricing/price-lists/:id/permanent', requirePermission('can_manage_pricing'), async (req, res) => {
    try {
        const list = await PriceList.findById(req.params.id).lean();
        if (!list) return res.status(404).json({ error:'Прайс не найден' });

        const [dealerLinks, activeConditions] = await Promise.all([
            Dealer.countDocuments({ price_list:list._id }),
            PricingCondition.countDocuments({
                priceList:list._id,
                cancelledAt:{ $in:[null] }
            })
        ]);

        if (dealerLinks || activeConditions) {
            const parts = [];
            if (dealerLinks) parts.push('назначен дилерам: ' + dealerLinks);
            if (activeConditions) parts.push('используется в действующих условиях: ' + activeConditions);
            return res.status(409).json({
                error:'Прайс нельзя удалить, пока он используется (' + parts.join(', ') + '). Сначала снимите назначения или отмените условия.'
            });
        }

        await PriceList.deleteOne({ _id:list._id });
        res.json({ status:'deleted', id:String(list._id), name:list.name || '' });
    } catch (e) {
        res.status(400).json({ error:e.message });
    }
});

async function buildManualOfferPriceSheetSnapshot(priceListId, manualClient = {}) {
    const id = String(priceListId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
        const err = new Error('Выберите прайс для КП'); err.statusCode = 400; throw err;
    }
    const list = await PriceList.findOne({ _id:id, active:{ $ne:false } }).lean();
    if (!list) { const err = new Error('Выбранный прайс не найден'); err.statusCode = 404; throw err; }

    const products = await Product.find({})
        .select('_id sku name product_type collection is_liquid')
        .sort({ sku:1, name:1 })
        .lean();
    const laminate = products.filter(product => isPricingLaminateProduct(product));
    const equipment = products.filter(product => product.product_type === 'equipment');
    const productMap = new Map(products.map(product => [String(product._id), product]));

    const listRows = Array.isArray(list.rows) ? list.rows : [];
    const collectionRows = new Map();
    const productRows = new Map();
    const skuRows = new Map();
    const legacyByCollection = new Map();

    listRows.forEach(row => {
        const scope = row.scopeType || (row.product ? 'product' : 'collection');
        const collection = String(row.collection || legacyRowCollection(row, productMap)).trim().toUpperCase();
        if (scope === 'collection' && collection) {
            collectionRows.set(collection, row);
            return;
        }
        if (row.product) productRows.set(String(row.product), row);
        if (row.sku) skuRows.set(normalizePricingSku(row.sku), row);
        if (collection && !legacyByCollection.has(collection)) legacyByCollection.set(collection, row);
    });

    const liquidGroups = new Map();
    laminate.filter(product => product.is_liquid !== false).forEach(product => {
        const collection = inferPricingCollection(product);
        if (!liquidGroups.has(collection)) liquidGroups.set(collection, []);
        liquidGroups.get(collection).push(product);
    });

    const rows = [...liquidGroups.entries()]
        .sort((a,b) => String(a[0]).localeCompare(String(b[0]), 'ru'))
        .map(([collection,members]) => {
            const source = collectionRows.get(collection) || legacyByCollection.get(collection) || null;
            const basePrice = Math.max(0, Number(source?.opt) || 0);
            return {
                rowType:'collection',
                collection,
                label:collection,
                sku:'',
                name:collection,
                productId:'',
                members:members.length,
                isLiquid:true,
                inherited:false,
                opt:Number(source?.opt) || 0,
                rrp:Number(source?.rrp) || 0,
                basePrice,
                finalPrice:basePrice,
                displayPrice:Number(source?.displayPrice ?? source?.maxRrp) || 0,
                currency:source?.currency || 'KZT'
            };
        });

    const appendExplicitProductRow = (product, productType, isLiquid, collectionLabel) => {
        const source = productRows.get(String(product._id)) || skuRows.get(normalizePricingSku(product.sku)) || null;
        const basePrice = Math.max(0, Number(source?.opt) || 0);
        rows.push({
            rowType:'product',
            collection:collectionLabel,
            label:[product.sku,product.name].filter(Boolean).join(' · '),
            sku:product.sku || '',
            name:product.name || '',
            productId:String(product._id),
            productType,
            members:1,
            isLiquid,
            isEquipment:productType === 'equipment',
            inherited:false,
            opt:Number(source?.opt) || 0,
            rrp:Number(source?.rrp) || 0,
            basePrice,
            finalPrice:basePrice,
            displayPrice:Number(source?.displayPrice ?? source?.maxRrp) || 0,
            currency:source?.currency || 'KZT'
        });
    };

    laminate.filter(product => product.is_liquid === false)
        .sort((a,b) => String(a.sku || '').localeCompare(String(b.sku || ''),'ru'))
        .forEach(product => appendExplicitProductRow(product,'laminate',false,inferPricingCollection(product)));

    equipment
        .sort((a,b) => String(a.sku || '').localeCompare(String(b.sku || ''),'ru'))
        .forEach(product => appendExplicitProductRow(product,'equipment',false,'ТОРГОВОЕ ОБОРУДОВАНИЕ'));

    return {
        dealer:{
            id:'',
            dealer_id:'',
            name:String(manualClient.name || '').trim(),
            city:String(manualClient.city || '').trim(),
            sector:'',
            status:'manual',
            priceType:'',
            phone:''
        },
        priceList:{
            id:String(list._id),
            name:list.name || '',
            code:list.code || '',
            versionDate:list.versionDate || '',
            validFrom:list.validFrom || '',
            validTo:list.validTo || '',
            active:list.active !== false,
            includeIlliquid:list.includeIlliquid === true
        },
        priceType:{ key:'opt', label:'Спец.цена' },
        totalDiscountPercent:0,
        activeDiscounts:[],
        rows
    };
}

async function buildDealerPriceSheetSnapshot(req, dealerId, options = {}) {
    try {
        const dealerVisibilityFilter = options.allowPotential
            ? getDealerFilter(req)
            : await getPricingWorkingDealerFilter(getDealerFilter(req));
        const dealer = await Dealer.findOne({
            $and: [
                { _id: dealerId },
                dealerVisibilityFilter
            ]
        }).select('_id dealer_id name city region_sector price_type price_list responsible contacts status')
            .populate('price_list', 'name code versionDate validFrom validTo active includeIlliquid')
            .lean();
        if (!dealer) { const err = new Error('Дилер не найден'); err.statusCode = 404; throw err; }

        const conditions = await PricingCondition.find({})
            .populate('dealer', '_id dealer_id name city region_sector price_type responsible')
            .populate('dealers', '_id dealer_id name city region_sector price_type responsible')
            .populate('priceList', '_id name code versionDate validFrom validTo active includeIlliquid')
            .sort({ createdAt: -1 })
            .lean();

        const control = await priceControl.forDealer(dealer._id);
        if(control.terminated){const err=new Error('Сотрудничество с сетью прекращено. Новый прайс или КП недоступен');err.statusCode=409;throw err;}
        const summary = buildDealerPricingSummary(dealer, conditions);
        const forcedPriceListId = String(options.priceListId || '').trim();
        let forcedList = null;
        if (forcedPriceListId) {
            if (!mongoose.Types.ObjectId.isValid(forcedPriceListId)) {
                const err = new Error('Некорректный прайс'); err.statusCode = 400; throw err;
            }
            forcedList = await PriceList.findOne({ _id:forcedPriceListId, active:{ $ne:false } }).lean();
            if (!forcedList) { const err = new Error('Выбранный прайс не найден'); err.statusCode = 404; throw err; }
        }
        const list = forcedList || await resolveSummaryPriceList(summary);
        const fallbackList = forcedList ? null : (summary.priceOverride?.active ? await PriceList.findById(summary.profilePriceListId).lean().catch(() => null) : null);
        const priceType = list ? { key: 'opt', label: 'Спец.цена' } : dealerPriceColumn(dealer.price_type);

        let appliedDiscounts = Array.isArray(summary.activeDiscounts) ? summary.activeDiscounts : [];
        if (options.ignoreDiscounts) {
            appliedDiscounts = [];
        } else if (forcedList && options.applyAllDiscounts) {
            const activeDiscounts = (summary.matchedConditions || []).filter(condition =>
                condition.kind === 'discount' && condition.computedStatus === 'active'
            );
            const exclusive = activeDiscounts
                .filter(condition => condition.stackable === false)
                .sort((a,b) =>
                    (Number(b.priority) || 0) - (Number(a.priority) || 0) ||
                    (Number(b.discountPercent) || 0) - (Number(a.discountPercent) || 0)
                );
            appliedDiscounts = exclusive.length ? [exclusive[0]] : activeDiscounts.filter(condition => condition.stackable !== false);
        }
        const discount = Math.min(100, Math.max(0, appliedDiscounts.reduce(
            (sum, condition) => sum + Math.max(0, Number(condition.discountPercent) || 0), 0
        )));

        const products = await Product.find({})
            .select('_id sku name product_type collection is_liquid')
            .sort({ sku: 1, name: 1 })
            .lean();
        const laminate = products.filter(product => isPricingLaminateProduct(product));
        const equipment = products.filter(product => product.product_type === 'equipment');
        const productMap = new Map(products.map(product => [String(product._id), product]));

        const productDisplay = await DealerDisplayPrice.find({ dealer: dealer._id }).lean();
        const productDisplayMap = new Map(productDisplay.map(item => [String(item.product), Number(item.price) || 0]));
        const collectionDisplay = await DealerCollectionDisplayPrice.find({ dealer: dealer._id }).lean();
        const collectionDisplayMap = new Map(collectionDisplay.map(item => [String(item.collection || '').trim().toUpperCase(), Number(item.price) || 0]));

        const fallbackRows = Array.isArray(fallbackList?.rows) ? fallbackList.rows : [];
        const fallbackCollections = new Map();
        const fallbackProducts = new Map();
        const fallbackSkus = new Map();
        fallbackRows.forEach(row => {
            const collection = String(row.collection || legacyRowCollection(row, productMap)).trim().toUpperCase();
            const scope = row.scopeType || (row.product ? 'product' : 'collection');
            if (scope === 'collection' && collection) fallbackCollections.set(collection, row);
            if (row.product) fallbackProducts.set(String(row.product), row);
            if (row.sku) fallbackSkus.set(normalizePricingSku(row.sku), row);
        });
        const fallbackFor = (collection, product) => (
            (product && (fallbackProducts.get(String(product._id)) || fallbackSkus.get(normalizePricingSku(product.sku)))) ||
            fallbackCollections.get(collection) || null
        );
        const listRows = Array.isArray(list?.rows) ? list.rows : [];
        const collectionRows = new Map();
        const productRows = new Map();
        const skuRows = new Map();
        const legacyByCollection = new Map();

        listRows.forEach(row => {
            const scope = row.scopeType || (row.product ? 'product' : 'collection');
            const collection = String(row.collection || legacyRowCollection(row, productMap)).trim().toUpperCase();

            if (scope === 'collection' && collection) {
                collectionRows.set(collection, row);
                return;
            }

            if (row.product) productRows.set(String(row.product), row);
            if (row.sku) skuRows.set(normalizePricingSku(row.sku), row);
            if (collection && !legacyByCollection.has(collection)) legacyByCollection.set(collection, row);
        });

        const liquidGroups = new Map();
        laminate.filter(product => product.is_liquid !== false).forEach(product => {
            const collection = inferPricingCollection(product);
            if (!liquidGroups.has(collection)) liquidGroups.set(collection, []);
            liquidGroups.get(collection).push(product);
        });

        const rows = [];

        [...liquidGroups.entries()]
            .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ru'))
            .forEach(([collection, members]) => {
                const source = collectionRows.get(collection) || legacyByCollection.get(collection) || fallbackFor(collection) || null;
                const basePrice = source ? Math.max(0, Number(source[priceType.key]) || 0) : 0;
                const finalPrice = basePrice > 0 ? require('./server/price-control').finalPrice(basePrice, discount, control.surchargePercent) : 0;
                rows.push({
                    rowType: 'collection',
                    collection,
                    label: collection,
                    sku: '',
                    name: collection,
                    productId: '',
                    members: members.length,
                    isLiquid: true,
                    inherited: false,
                    opt: Number(source?.opt) || 0,
                    rrp: Number(source?.rrp) || 0,
                    basePrice,
                    finalPrice,
                    displayPrice: collectionDisplayMap.get(collection) || Number(source?.displayPrice ?? source?.maxRrp) || 0,
                    currency: source?.currency || 'KZT'
                });
            });

        laminate.filter(product => product.is_liquid === false)
            .sort((a, b) =>
                String(inferPricingCollection(a)).localeCompare(String(inferPricingCollection(b)), 'ru') ||
                String(a.sku || '').localeCompare(String(b.sku || ''), 'ru')
            )
            .forEach(product => {
                const collection = inferPricingCollection(product);
                const override = productRows.get(String(product._id)) || skuRows.get(normalizePricingSku(product.sku)) || null;
                const fallbackOverride = fallbackProducts.get(String(product._id)) || fallbackSkus.get(normalizePricingSku(product.sku)) || null;
                const source = override || fallbackOverride;
                const basePrice = source ? Math.max(0, Number(source[priceType.key]) || 0) : 0;
                const finalPrice = basePrice > 0 ? require('./server/price-control').finalPrice(basePrice, discount, control.surchargePercent) : 0;

                rows.push({
                    rowType: 'product',
                    collection,
                    label: [product.sku, product.name].filter(Boolean).join(' · '),
                    sku: product.sku || '',
                    name: product.name || '',
                    productId: String(product._id),
                    members: 1,
                    isLiquid: false,
                    productType: 'laminate',
                    inherited: false,
                    opt: Number(source?.opt) || 0,
                    rrp: Number(source?.rrp) || 0,
                    basePrice,
                    finalPrice,
                    displayPrice: productDisplayMap.get(String(product._id)) || Number(source?.displayPrice ?? source?.maxRrp) || 0,
                    currency: source?.currency || 'KZT'
                });
            });

        equipment
            .sort((a,b) => String(a.sku || '').localeCompare(String(b.sku || ''),'ru'))
            .forEach(product => {
                const source = productRows.get(String(product._id)) || skuRows.get(normalizePricingSku(product.sku)) ||
                    fallbackProducts.get(String(product._id)) || fallbackSkus.get(normalizePricingSku(product.sku)) || null;
                const basePrice = source ? Math.max(0, Number(source[priceType.key]) || 0) : 0;
                const finalPrice = basePrice > 0 ? require('./server/price-control').finalPrice(basePrice, discount, control.surchargePercent) : 0;
                rows.push({
                    rowType:'product',
                    collection:'ТОРГОВОЕ ОБОРУДОВАНИЕ',
                    label:[product.sku,product.name].filter(Boolean).join(' · '),
                    sku:product.sku || '',
                    name:product.name || '',
                    productId:String(product._id),
                    productType:'equipment',
                    members:1,
                    isLiquid:false,
                    isEquipment:true,
                    inherited:false,
                    opt:Number(source?.opt) || 0,
                    rrp:Number(source?.rrp) || 0,
                    basePrice,
                    finalPrice,
                    displayPrice:productDisplayMap.get(String(product._id)) || Number(source?.displayPrice ?? source?.maxRrp) || 0,
                    currency:source?.currency || 'KZT'
                });
            });

        return {
            dealer: {
                id: String(dealer._id),
                dealer_id: dealer.dealer_id || '',
                name: dealer.name || '',
                city: dealer.city || '',
                sector: dealer.region_sector || '',
                status: dealer.status || '',
                priceType: dealer.price_type || '',
                phone: firstDealerPhone(dealer.contacts)
            },
            priceList: list ? {
                id: String(list._id),
                name: list.name || '',
                code: list.code || '',
                versionDate: list.versionDate || '',
                validFrom: list.validFrom || '',
                validTo: list.validTo || '',
                active: list.active !== false,
                includeIlliquid: list.includeIlliquid === true
            } : null,
            priceType,
            totalDiscountPercent: discount,
            surchargePercent: control.surchargePercent,
            activeDiscounts: appliedDiscounts,
            rows
        };

    } catch (e) {
        throw e;
    }
}

app.get('/api/pricing/dealers/:id/price-sheet', requirePermission('can_view_pricing'), async (req, res) => {
    try {
        const priceListId = String(req.query?.priceListId || '').trim();
        const forOffer = String(req.query?.forOffer || '') === '1';
        res.json(await buildDealerPriceSheetSnapshot(req, req.params.id, {
            priceListId,
            applyAllDiscounts:Boolean(priceListId) && !forOffer,
            ignoreDiscounts:forOffer,
            allowPotential:forOffer
        }));
    } catch (e) {
        res.status(e.statusCode || 500).json({ error:e.message });
    }
});

app.get('/api/pricing/offer-price-sheet', requirePermission('can_view_pricing'), async (req, res) => {
    try {
        res.json(await buildManualOfferPriceSheetSnapshot(req.query?.priceListId, {
            name:String(req.query?.clientName || '').trim(),
            city:String(req.query?.clientCity || '').trim()
        }));
    } catch (e) {
        res.status(e.statusCode || 500).json({ error:e.message });
    }
});

app.post('/api/pricing/dealers/:id/share', requirePermission('can_view_pricing'), async (req, res) => {
    try {
        const snapshot = await buildDealerPriceSheetSnapshot(req, req.params.id);
        const expectedDealerId = String(snapshot?.dealer?.dealer_id || '').trim();
        const confirmation = String(req.body?.confirmDealerId || '').trim();

        if (!expectedDealerId || confirmation.toLowerCase() !== expectedDealerId.toLowerCase()) {
            return res.status(400).json({ error:'ID дилера не совпадает. Ссылка не создана.' });
        }

        const hours = Math.min(72, Math.max(1, Number(req.body?.expiresHours) || 24));
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + hours * 3600000);
        const user = pricingUserMeta(req);

        await PriceShare.create({
            tokenHash,
            dealer:req.params.id,
            dealerId:snapshot.dealer?.dealer_id || '',
            dealerName:snapshot?.dealer?.name || '',
            dealerCity:snapshot?.dealer?.city || '',
            createdBy:user,
            expiresAt,
            snapshot
        });

        res.status(201).json({
            url:`${APP_ORIGIN}/price/${token}`,
            xlsxUrl:`${APP_ORIGIN}/api/public/price-share/${token}.xlsx`,
            expiresAt:expiresAt.toISOString(),
            dealer:snapshot.dealer,
            priceList:snapshot.priceList,
            totalDiscountPercent:snapshot.totalDiscountPercent || 0
        });
    } catch (e) {
        res.status(e.statusCode || 500).json({ error:e.message });
    }
});



app.get('/api/pricing/offer-recipients', requirePermission('can_view_pricing'), async (req, res) => {
    try {
        const visibility = getDealerFilter(req);
        const dealers = await Dealer.find({
            $and: [
                visibility,
                { status: { $regex:/^(potential|prospect|потенц)/i } }
            ]
        })
            .select('_id dealer_id name city region_sector status responsible')
            .sort({ city:1, name:1 })
            .lean();

        res.json(dealers.map(dealer => ({
            dealerId:String(dealer._id),
            dealerCode:dealer.dealer_id || '',
            dealerName:dealer.name || '',
            city:dealer.city || '',
            sector:dealer.region_sector || '',
            status:dealer.status || 'potential',
            statusLabel:'Потенциальный'
        })));
    } catch (e) {
        res.status(500).json({ error:e.message });
    }
});

function commercialOfferContact(user = {}) {
    const fullName = [user.lastName, user.firstName, user.middleName].map(value => String(value || '').trim()).filter(Boolean).join(' ')
        || String(user.fullName || user.username || '').trim();
    return {
        userId:String(user._id || user.id || ''),
        fullName,
        lastName:String(user.lastName || '').trim(),
        firstName:String(user.firstName || '').trim(),
        middleName:String(user.middleName || '').trim(),
        phone:String(user.phone || '').trim(),
        email:String(user.email || '').trim(),
        position:String(user.position || '').trim()
    };
}

async function resolveCommercialOfferContact(req, requestedUserId = '') {
    const canChoose = isAdminUser(req);
    const targetId = canChoose && mongoose.Types.ObjectId.isValid(String(requestedUserId || '').trim())
        ? String(requestedUserId).trim()
        : String(req.user?.id || '');
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
        const error = new Error('Не удалось определить сотрудника для обратной связи');
        error.statusCode = 400;
        throw error;
    }
    const user = await User.findOne({
        _id:targetId,
        isBlocked:{ $ne:true },
        employmentStatus:{ $ne:'dismissed' }
    }).select('_id username fullName lastName firstName middleName phone email position').lean();
    if (!user) {
        const error = new Error('Сотрудник для обратной связи не найден или недоступен');
        error.statusCode = 404;
        throw error;
    }
    return commercialOfferContact(user);
}

app.get('/api/pricing/contact-users', requirePermission('can_view_pricing'), async (req, res) => {
    try {
        const canChoose = isAdminUser(req);
        const filter = canChoose
            ? { isBlocked:{ $ne:true }, employmentStatus:{ $ne:'dismissed' } }
            : { _id:req.user?.id, isBlocked:{ $ne:true }, employmentStatus:{ $ne:'dismissed' } };
        const users = await User.find(filter)
            .select('_id username fullName lastName firstName middleName phone email position')
            .sort({ lastName:1, firstName:1, fullName:1, username:1 })
            .lean();
        res.json({
            canChoose,
            currentUserId:String(req.user?.id || ''),
            contacts:users.map(commercialOfferContact)
        });
    } catch (e) {
        res.status(500).json({ error:e.message });
    }
});

app.get('/api/pricing/offers', requirePermission('can_view_pricing'), async (req, res) => {
    try {
        await purgeExpiredCommercialOffers();
        const dealers = await Dealer.find(getDealerFilter(req)).select('_id').lean();
        const dealerIds = dealers.map(item => item._id);
        const manualFilter = isGlobalViewer(req)
            ? { dealer:null }
            : { dealer:null, 'createdBy.id':String(req.user?.id || '') };
        const offers = await CommercialOffer.find({
            $or:[
                { dealer:{ $in:dealerIds } },
                manualFilter
            ]
        })
            .sort({ createdAt:-1 })
            .limit(250)
            .lean();
        const now = new Date();
        res.json(offers.map(item => {
            const snapshot = item.snapshot || {};
            const expired = item.expiresAt && new Date(item.expiresAt) <= now;
            return {
                id:String(item._id),
                offerNumber:item.offerNumber || '',
                dealerId:item.dealerId || '',
                dealerName:item.dealerName || '',
                dealerCity:item.dealerCity || '',
                priceListName:snapshot.priceList?.name || snapshot.priceType?.label || 'Спец.цена',
                totalDiscountPercent:Number(snapshot.totalDiscountPercent) || 0,
                itemsCount:Array.isArray(snapshot.items) ? snapshot.items.length : 0,
                createdBy:item.createdBy || {},
                createdAt:item.createdAt,
                expiresAt:item.expiresAt,
                revokedAt:item.revokedAt,
                viewCount:Number(item.viewCount) || 0,
                lastViewedAt:item.lastViewedAt || null,
                status:item.revokedAt ? 'revoked' : (expired ? 'expired' : 'active'),
                url:(!item.revokedAt && !expired) ? APP_ORIGIN + '/offer/' + item.publicId : '',
                canManage:isAdminUser(req) || String(item.createdBy?.id || '') === String(req.user?.id || ''),
                canDelete:isAdminUser(req) || String(item.createdBy?.id || '') === String(req.user?.id || '')
            };
        }));
    } catch (e) {
        res.status(500).json({ error:e.message });
    }
});

app.post('/api/pricing/offers', requirePermission('can_view_pricing'), async (req, res) => {
    try {
        const recipientMode = String(req.body?.recipientMode || 'crm').trim() === 'manual' ? 'manual' : 'crm';
        const dealerId = String(req.body?.dealerId || '').trim();
        const manualClientName = String(req.body?.manualClientName || '').trim();
        const manualClientCity = String(req.body?.manualClientCity || '').trim();
        const priceListId = String(req.body?.priceListId || '').trim();
        const showStock = req.body?.showStock === true;
        const description = String(req.body?.description || '').trim().slice(0,3000);

        if (!priceListId) return res.status(400).json({ error:'Выберите прайс для КП' });

        let snapshot;
        let dealerRef = null;

        if (recipientMode === 'manual') {
            if (!manualClientName) return res.status(400).json({ error:'Введите название нового клиента' });
            snapshot = await buildManualOfferPriceSheetSnapshot(priceListId, {
                name:manualClientName,
                city:manualClientCity
            });
        } else {
            if (!mongoose.Types.ObjectId.isValid(dealerId)) {
                return res.status(400).json({ error:'Выберите потенциального клиента' });
            }
            snapshot = await buildDealerPriceSheetSnapshot(req, dealerId, {
                priceListId,
                applyAllDiscounts:false,
                ignoreDiscounts:true,
                allowPotential:true
            });
            if (!/^(potential|prospect|потенц)/i.test(String(snapshot?.dealer?.status || ''))) {
                return res.status(400).json({ error:'Для КП из CRM выберите потенциального клиента' });
            }
            dealerRef = dealerId;
        }

        const selectedIds = [...new Set((Array.isArray(req.body?.productIds) ? req.body.productIds : [])
            .map(value => String(value || '').trim())
            .filter(value => mongoose.Types.ObjectId.isValid(value)))];
        if (!selectedIds.length) return res.status(400).json({ error:'Выберите хотя бы один декор' });

        const productCandidates = await Product.find({
            _id:{ $in:selectedIds }
        }).select('_id sku name product_type collection characteristics is_liquid stock_qty photo_id').lean();
        const products = productCandidates.filter(product =>
            isPricingLaminateProduct(product) || product.product_type === 'equipment'
        );
        if (!products.length) return res.status(400).json({ error:'Выбранные позиции не найдены в актуальной номенклатуре' });

        const collectionRowMap = new Map((snapshot.rows || [])
            .filter(row => row.rowType === 'collection')
            .map(row => [String(row.collection || '').trim().toUpperCase(), row]));
        const productRowMap = new Map();
        (snapshot.rows || []).filter(row => row.rowType === 'product').forEach(row => {
            if (row.productId) productRowMap.set('id:'+String(row.productId), row);
            if (row.sku) productRowMap.set('sku:'+normalizePricingSku(row.sku), row);
        });

        const items = products.map(product => {
            const productType = product.product_type === 'equipment' ? 'equipment' : 'laminate';
            const isLiquid = productType === 'laminate' ? product.is_liquid !== false : true;
            const collection = productType === 'equipment' ? 'ТОРГОВОЕ ОБОРУДОВАНИЕ' : inferPricingCollection(product);
            const specialPrice = productRowMap.get('id:'+String(product._id)) || productRowMap.get('sku:'+normalizePricingSku(product.sku)) || null;
            const price = (productType === 'equipment' || !isLiquid)
                ? (specialPrice || {})
                : (collectionRowMap.get(String(collection || '').trim().toUpperCase()) || {});
            return {
                productId:String(product._id),
                sku:product.sku || '',
                name:product.name || '',
                collection,
                productType,
                isLiquid,
                characteristics:product.characteristics || {},
                photoId:String(product.photo_id || '').trim(),
                stockQty:showStock ? Math.max(0, Number(product.stock_qty) || 0) : null,
                stockUnit:productType === 'equipment' ? 'шт' : 'м²',
                basePrice:Number(price.basePrice ?? price.opt) || 0,
                finalPrice:Number(price.finalPrice) || 0,
                rrp:Number(price.rrp) || 0,
                displayPrice:Number(price.displayPrice) || 0,
                currency:price.currency || 'KZT'
            };
        }).sort((a,b) =>
            String(a.collection).localeCompare(String(b.collection),'ru') ||
            String(a.sku).localeCompare(String(b.sku),'ru')
        );

        const days = Math.min(60, Math.max(1, Number(req.body?.expiresDays) || 14));
        const expiresAt = new Date(Date.now() + days * 86400000);
        const publicId = crypto.randomBytes(24).toString('hex');
        const now = new Date();
        const pad = value => String(value).padStart(2,'0');
        const offerNumber = 'КП-' + now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
        const user = pricingUserMeta(req);
        const contact = await resolveCommercialOfferContact(req, req.body?.contactUserId);

        const offerSnapshot = {
            ...snapshot,
            rows:undefined,
            items,
            showStock,
            description,
            recipientMode,
            contact,
            offerNumber,
            createdBy:user,
            generatedAt:now.toISOString()
        };

        const offer = await CommercialOffer.create({
            publicId,
            offerNumber,
            dealer:dealerRef,
            dealerId:snapshot.dealer?.dealer_id || '',
            dealerName:snapshot.dealer?.name || '',
            dealerCity:snapshot.dealer?.city || '',
            createdBy:user,
            expiresAt,
            snapshot:offerSnapshot
        });

        res.status(201).json({
            id:String(offer._id),
            offerNumber,
            url:APP_ORIGIN + '/offer/' + publicId,
            expiresAt:expiresAt.toISOString(),
            dealer:snapshot.dealer,
            priceList:snapshot.priceList,
            totalDiscountPercent:snapshot.totalDiscountPercent || 0,
            showStock,
            contact,
            itemsCount:items.length
        });
    } catch (e) {
        res.status(e.statusCode || 500).json({ error:e.message });
    }
});

app.delete('/api/pricing/offers/:id', requirePermission('can_view_pricing'), async (req, res) => {
    try {
        const offer = await CommercialOffer.findById(req.params.id);
        if (!offer) return res.status(404).json({ error:'КП не найдено' });
        const canManage = isAdminUser(req) || String(offer.createdBy?.id || '') === String(req.user?.id || '');
        if (!canManage) return res.status(403).json({ error:'Можно отзывать только свои КП' });
        offer.revokedAt = new Date();
        await offer.save();
        res.json({ status:'ok' });
    } catch (e) {
        res.status(400).json({ error:e.message });
    }
});

app.delete('/api/pricing/offers/:id/permanent', requirePermission('can_view_pricing'), async (req, res) => {
    try {
        const offer = await CommercialOffer.findById(req.params.id).lean();
        if (!offer) return res.status(404).json({ error:'КП не найдено' });
        const canDelete = isAdminUser(req) || String(offer.createdBy?.id || '') === String(req.user?.id || '');
        if (!canDelete) return res.status(403).json({ error:'Можно удалять только свои КП' });
        await CommercialOffer.deleteOne({ _id:offer._id });
        res.json({ status:'deleted', id:String(offer._id), offerNumber:offer.offerNumber || '' });
    } catch (e) {
        res.status(400).json({ error:e.message });
    }
});


async function priceControlSnapshotValid(item) {
    const id=item.dealer || item.snapshot?.dealer?.id;
    if(!id || !mongoose.isValidObjectId(id)) return true;
    const control=await priceControl.forDealer(id);
    return !control.terminated && Number(item.snapshot?.surchargePercent || 0)===control.surchargePercent;
}

app.get('/api/public/offers/:token', async (req, res) => {
    try {
        const token = String(req.params.token || '').trim();
        if (!/^[a-f0-9]{48}$/i.test(token)) return res.status(404).json({ error:'Ссылка недействительна' });
        const now = new Date();
        const offer = await CommercialOffer.findOneAndUpdate(
            { publicId:token, revokedAt:null, expiresAt:{ $gt:now } },
            { $inc:{ viewCount:1 }, $set:{ lastViewedAt:now } },
            { new:true }
        ).lean();
        if (!offer) return res.status(410).json({ error:'Срок действия КП истёк или ссылка была отозвана' });
        if(!await priceControlSnapshotValid(offer)) return res.status(410).json({error:'Условия изменились. Запросите новое КП у менеджера'});
        res.setHeader('Cache-Control','no-store');
        res.json({
            offerNumber:offer.offerNumber,
            dealerName:offer.dealerName,
            dealerCity:offer.dealerCity,
            createdBy:offer.createdBy || {},
            createdAt:offer.createdAt,
            expiresAt:offer.expiresAt,
            snapshot:offer.snapshot || {}
        });
    } catch (e) {
        res.status(500).json({ error:e.message });
    }
});

app.get('/api/public/price-share/:token.xlsx', async (req, res) => {
    try {
        const token = String(req.params.token || '').trim();
        if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(404).send('Ссылка недействительна');

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const share = await PriceShare.findOne({ tokenHash, revokedAt:null, expiresAt:{ $gt:new Date() } }).lean();
        if (!share) return res.status(410).send('Срок действия ссылки истёк или она была отозвана');
        if(!await priceControlSnapshotValid(share)) return res.status(410).send('Условия изменились. Запросите новый прайс у менеджера');

        const snapshot = share.snapshot || {};
        const dealer = snapshot.dealer || {};
        const priceList = snapshot.priceList || {};
        const includeIlliquid = priceList.includeIlliquid === true;
        const rows = Array.isArray(snapshot.rows)
            ? snapshot.rows.filter(row => row.isLiquid !== false || includeIlliquid)
            : [];
        const discount = Math.max(0, Number(snapshot.totalDiscountPercent) || 0);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'IDEAL FLOOR CRM';
        workbook.created = new Date();
        workbook.modified = new Date();

        const ws = workbook.addWorksheet('Прайс', {
            pageSetup:{ paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0, margins:{left:0.25,right:0.25,top:0.3,bottom:0.3,header:0,footer:0} },
            views:[{showGridLines:false}]
        });

        ws.columns = [
            { key:'collection', width:38 },
            { key:'wholesale', width:19 },
            { key:'final', width:21 },
            { key:'rrp', width:19 },
            { key:'display', width:20 }
        ];

        const thinGray = { style:'thin', color:{argb:'FFD6D8DC'} };
        const softGrayFill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFF5F6F7'} };
        const whiteFill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFFFFFF'} };

        const headerPath = path.join(__dirname,'public','ideal-floor-commercial-header.png.png');
        if (fs.existsSync(headerPath)) {
            const imageId = workbook.addImage({
                buffer:fs.readFileSync(headerPath),
                extension:'png'
            });
            ws.addImage(imageId,{
                tl:{col:0,row:0},
                ext:{width:805,height:279},
                editAs:'oneCell'
            });
            for(let r=1;r<=10;r++) ws.getRow(r).height=20.5;
        } else {
            ws.mergeCells('A1:E7');
            const fallback=ws.getCell('A1');
            fallback.value='IDEAL FLOOR';
            fallback.font={bold:true,size:30,color:{argb:'FFFFFFFF'}};
            fallback.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF991119'}};
            fallback.alignment={vertical:'middle',horizontal:'left'};
        }

        ws.mergeCells('A12:E12');
        const titleCell=ws.getCell('A12');
        titleCell.value='ПЕРСОНАЛЬНЫЙ ПРАЙС';
        titleCell.font={bold:true,size:18,color:{argb:'FF202226'}};
        titleCell.alignment={vertical:'middle',horizontal:'left'};
        titleCell.border={bottom:{style:'medium',color:{argb:'FF9F0710'}}};
        ws.getRow(12).height=30;

        const info = [
            ['Дилер', dealer.name || share.dealerName || ''],
            ['ID', dealer.dealer_id || share.dealerId || ''],
            ['Город', dealer.city || share.dealerCity || ''],
            ['Действующий прайс', priceList.name || snapshot.priceType?.label || 'Спец.цена'],
            ...(discount > 0 ? [['Скидка IDEAL FLOOR', '-' + discount.toLocaleString('ru-RU',{maximumFractionDigits:2}) + '%']] : []),
            ['Сформирован', new Date(share.createdAt).toLocaleString('ru-RU')],
            ['Ссылка действует до', new Date(share.expiresAt).toLocaleString('ru-RU')]
        ];

        let infoRow=14;
        info.forEach(([label,value],idx)=>{
            ws.mergeCells(`A${infoRow}:B${infoRow}`);
            ws.mergeCells(`C${infoRow}:E${infoRow}`);
            const labelCell=ws.getCell(`A${infoRow}`);
            const valueCell=ws.getCell(`C${infoRow}`);
            labelCell.value=label;
            valueCell.value=value;
            labelCell.font={bold:true,size:10,color:{argb:'FF70747B'}};
            valueCell.font={bold:true,size:10,color:{argb:label==='Скидка IDEAL FLOOR'?'FFB10B13':'FF25272B'}};
            labelCell.fill=softGrayFill;
            valueCell.fill=whiteFill;
            labelCell.alignment={vertical:'middle',horizontal:'left'};
            valueCell.alignment={vertical:'middle',horizontal:'left'};
            for(let c=1;c<=5;c++){
                const cell=ws.getCell(infoRow,c);
                cell.border={
                    top:idx===0 ? thinGray : undefined,
                    bottom:thinGray,
                    left:c===1 ? thinGray : undefined,
                    right:c===5 ? thinGray : undefined
                };
            }
            ws.getRow(infoRow).height=23;
            infoRow++;
        });

        const tableRow=infoRow+2;
        const headers=['Номенклатура','Оптовая цена','Итоговая оптовая','РРЦ','Цена на витрине'];
        headers.forEach((value,index)=>{
            const cell=ws.getCell(tableRow,index+1);
            cell.value=value;
            cell.font={bold:true,size:10,color:{argb:'FFFFFFFF'}};
            cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFA70A12'}};
            cell.alignment={vertical:'middle',horizontal:index===0?'left':'center',wrapText:true};
            cell.border={top:thinGray,bottom:thinGray,left:thinGray,right:thinGray};
        });
        ws.getRow(tableRow).height=32;

        rows.forEach((row,index)=>{
            const r=tableRow+1+index;
            const wholesale=Number(row.basePrice ?? row.opt) || 0;
            const finalPrice=Number.isFinite(Number(row.finalPrice)) ? Number(row.finalPrice) : wholesale;
            const values=[
                row.isLiquid === false ? [row.sku,row.name].filter(Boolean).join(' · ') : (row.collection || row.name || ''),
                wholesale || null,
                finalPrice || null,
                Number(row.rrp) || null,
                Number(row.displayPrice) || null
            ];

            values.forEach((value,colIndex)=>{
                const cell=ws.getCell(r,colIndex+1);
                cell.value=value;
                cell.fill=index%2===0 ? whiteFill : softGrayFill;
                cell.border={top:thinGray,bottom:thinGray,left:thinGray,right:thinGray};
                cell.alignment={
                    vertical:'middle',
                    horizontal:colIndex===0?'left':'right',
                    wrapText:colIndex===0
                };
                cell.font={
                    bold:colIndex===0 || colIndex===2,
                    size:10,
                    color:{argb:colIndex===2?'FFB10B13':'FF2A2C31'}
                };
                if(colIndex>0) cell.numFmt='#,##0.00 "₸"';
            });
            ws.getRow(r).height=25;
        });

        const footRow=tableRow+rows.length+2;
        ws.mergeCells(`A${footRow}:E${footRow}`);
        const foot=ws.getCell(`A${footRow}`);
        foot.value='Персональный прайс IDEAL FLOOR · предназначен только для указанного дилера.';
        foot.font={italic:true,size:9,color:{argb:'FF888B91'}};
        foot.alignment={horizontal:'center',vertical:'middle'};
        foot.border={top:{style:'thin',color:{argb:'FFD6D8DC'}}};
        ws.getRow(footRow).height=22;

        ws.views=[{showGridLines:false,state:'frozen',ySplit:tableRow}];

        const safeDealer = String(dealer.name || share.dealerName || share.dealerId || 'dealer')
            .replace(/[\\/:*?"<>|]+/g,' ')
            .replace(/\s+/g,' ')
            .trim()
            .slice(0,80) || 'dealer';

        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('Прайс IDEAL FLOOR - ' + safeDealer + '.xlsx')}`);
        res.setHeader('Cache-Control','no-store');
        res.send(Buffer.from(buffer));
    } catch (e) {
        console.error('Price share XLSX error:', e);
        res.status(500).send('Не удалось сформировать Excel');
    }
});

app.get('/api/public/price-share/:token', async (req, res) => {
    try {
        const token = String(req.params.token || '').trim();
        if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(404).json({ error:'Ссылка недействительна' });
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const share = await PriceShare.findOne({ tokenHash, revokedAt:null, expiresAt:{ $gt:new Date() } }).lean();
        if (!share) return res.status(410).json({ error:'Срок действия ссылки истёк или она была отозвана' });
        if(!await priceControlSnapshotValid(share)) return res.status(410).json({error:'Условия изменились. Запросите новый прайс у менеджера'});
        res.set('Cache-Control','no-store');
        res.json({
            dealer:{ dealer_id:share.dealerId || '', name:share.dealerName || '', city:share.dealerCity || '' },
            expiresAt:share.expiresAt,
            createdAt:share.createdAt,
            snapshot:share.snapshot || {}
        });
    } catch (e) {
        res.status(500).json({ error:e.message });
    }
});

app.put('/api/pricing/dealers/:id/display-prices', requirePermission('can_manage_pricing'), async (req, res) => {
    try {
        const dealer = await Dealer.findOne({
            $and: [
                { _id: req.params.id },
                await getPricingWorkingDealerFilter(getDealerFilter(req))
            ]
        }).select('_id').lean();
        if (!dealer) return res.status(404).json({ error: 'Дилер не найден' });

        const user = pricingUserMeta(req);
        const prices = Array.isArray(req.body?.prices) ? req.body.prices : [];

        for (const row of prices) {
            const rowType = row?.rowType === 'collection' ? 'collection' : 'product';
            const price = Math.max(0, Number(row?.price) || 0);

            if (rowType === 'collection') {
                const collection = String(row?.collection || '').trim().toUpperCase();
                if (!collection) continue;
                if (price <= 0) {
                    await DealerCollectionDisplayPrice.deleteOne({ dealer: dealer._id, collection });
                } else {
                    await DealerCollectionDisplayPrice.updateOne(
                        { dealer: dealer._id, collection },
                        { $set: { price, updatedBy: user } },
                        { upsert: true }
                    );
                }
                continue;
            }

            const productId = String(row?.productId || '').trim();
            if (!mongoose.Types.ObjectId.isValid(productId)) continue;
            if (price <= 0) {
                await DealerDisplayPrice.deleteOne({ dealer: dealer._id, product: productId });
            } else {
                await DealerDisplayPrice.updateOne(
                    { dealer: dealer._id, product: productId },
                    { $set: { price, updatedBy: user } },
                    { upsert: true }
                );
            }
        }

        res.json({ status: 'ok' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.get('/api/pricing/overview', requirePermission('can_view_pricing'), async (req, res) => {
    try {
        const dealers = await Dealer.find(await getPricingWorkingDealerFilter(getDealerFilter(req)))
            .select('_id dealer_id name city region_sector price_type price_list responsible')
            .populate('price_list', 'name code versionDate validFrom validTo active includeIlliquid')
            .sort({ name: 1 })
            .lean();
        const conditions = await PricingCondition.find({})
            .populate('dealer', '_id dealer_id name city region_sector price_type responsible')
            .populate('dealers', '_id dealer_id name city region_sector price_type responsible')
            .populate('priceList', '_id name code versionDate validFrom validTo active includeIlliquid')
            .sort({ createdAt: -1 })
            .lean();

        const networks = await priceControl.Network.find({members:{$in:dealers.map(d=>d._id)}}).select('-history -cases.evidence').lean();
        const controlByDealer = new Map(networks.flatMap(n=>n.members.map(id=>[String(id),priceControl.summary(n)])));
        const rows = dealers.map(dealer => ({...buildDealerPricingSummary(dealer, conditions),priceControl:controlByDealer.get(String(dealer._id)) || null}));
        const today = pricingTodayKey();
        const inSeven = new Date(today + 'T00:00:00Z');
        inSeven.setUTCDate(inSeven.getUTCDate() + 7);
        const sevenKey = inSeven.toISOString().slice(0, 10);

        const activeConditionIds = new Set();
        rows.forEach(row => row.matchedConditions.forEach(condition => {
            if (condition.computedStatus === 'active') activeConditionIds.add(String(condition._id));
        }));

        const visibleConditions = conditions
            .filter(condition => rows.some(row => pricingConditionMatchesDealer(condition, {
                _id: row.dealerId,
                name: row.dealerName,
                city: row.city,
                region_sector: row.sector,
                price_type: row.defaultPriceType,
                responsible: row.responsible
            })))
            .map(condition => ({
                ...condition,
                computedStatus: pricingConditionStatus(condition, today)
            }));

        res.json({
            today,
            rows,
            conditions: visibleConditions,
            stats: {
                dealersWith5: rows.filter(row => row.has5 && !row.has10).length,
                dealersWith10: rows.filter(row => row.has10 && !row.has5).length,
                dealersWithBoth: rows.filter(row => row.has5 && row.has10).length,
                activePriceOverrides: rows.filter(row => row.priceListCondition).length,
                expiringSoon: visibleConditions.filter(condition =>
                    condition.computedStatus === 'active' &&
                    condition.endDate &&
                    condition.endDate >= today &&
                    condition.endDate <= sevenKey
                ).length,
                pendingRequirements: rows.reduce((sum, row) => sum + row.pendingRequirements, 0)
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/pricing/dealers/:id', requirePermission('can_view_pricing'), async (req, res) => {
    try {
        const dealer = await Dealer.findOne({
            $and: [
                { _id: req.params.id },
                await getPricingWorkingDealerFilter(getDealerFilter(req))
            ]
        }).select('_id dealer_id name city region_sector price_type price_list responsible')
            .populate('price_list', 'name code versionDate validFrom validTo active includeIlliquid')
            .lean();
        if (!dealer) return res.status(404).json({ error: 'Дилер не найден' });

        const conditions = await PricingCondition.find({})
            .populate('dealer', '_id dealer_id name city region_sector price_type responsible')
            .populate('dealers', '_id dealer_id name city region_sector price_type responsible')
            .populate('priceList', '_id name code versionDate validFrom validTo active includeIlliquid')
            .sort({ createdAt: -1 })
            .lean();
        res.json({...buildDealerPricingSummary(dealer, conditions),priceControl:await priceControl.forDealer(dealer._id)});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/pricing/setup', requirePermission('can_manage_pricing'), async (req, res) => {
    try {
        const scopeType = ['dealer','sector','city','all'].includes(req.body?.scopeType) ? req.body.scopeType : 'dealer';
        const targetPayload = cleanPricingPayload({
            scopeType,
            dealerIds:req.body?.dealerIds,
            scopeValues:req.body?.scopeValues,
            kind:'discount',
            name:'Проверка цели',
            discountPercent:5
        });
        const targetError = validatePricingPayload(targetPayload) || (scopeType !== 'all' ? await validatePricingTargets(req, targetPayload) : '');
        if (targetError) return res.status(400).json({ error: targetError });
        if (!isGlobalViewer(req) && scopeType !== 'dealer') {
            return res.status(403).json({ error: 'Региональные и общие ценовые условия может создавать только пользователь с доступом ко всей компании' });
        }

        const priceListId = String(req.body?.priceListId || '').trim();
        let priceList = null;
        if (priceListId) {
            if (!mongoose.Types.ObjectId.isValid(priceListId)) return res.status(400).json({ error:'Некорректный прайс' });
            priceList = await PriceList.findOne({ _id:priceListId, active:{ $ne:false } }).lean();
            if (!priceList) return res.status(404).json({ error:'Прайс не найден или находится в архиве' });
        }

        const discounts = [...new Set((Array.isArray(req.body?.discounts) ? req.body.discounts : [])
            .map(value => Math.round(Number(value) * 100) / 100)
            .filter(value => Number.isFinite(value) && value > 0 && value <= 100))];
        if (!priceList && !discounts.length) {
            return res.status(400).json({ error:'Выберите хотя бы одну скидку или прайс' });
        }
        const startDate = String(req.body?.startDate || '').trim();
        const endDate = String(req.body?.endDate || '').trim();
        const dateRe = /^\d{4}-\d{2}-\d{2}$/;
        if (discounts.length && startDate && !dateRe.test(startDate)) return res.status(400).json({ error:'Некорректная дата начала акции' });
        if (discounts.length && endDate && !dateRe.test(endDate)) return res.status(400).json({ error:'Некорректная дата окончания акции' });
        if (discounts.length && startDate && endDate && endDate < startDate) return res.status(400).json({ error:'Дата окончания акции не может быть раньше даты начала' });

        const user = pricingUserMeta(req);
        const note = String(req.body?.note || '').trim();
        const base = {
            scopeType,
            dealer:targetPayload.dealer,
            dealers:targetPayload.dealers,
            scopeValue:targetPayload.scopeValue,
            scopeValues:targetPayload.scopeValues
        };

        const normalizeTarget = value => String(value?._id || value?.id || value || '').trim().toLowerCase();
        const exactTarget = condition => {
            if (condition.scopeType !== scopeType) return false;
            if (scopeType === 'all') return true;
            const wantedRaw = scopeType === 'dealer' ? targetPayload.dealers : targetPayload.scopeValues;
            const actualRaw = scopeType === 'dealer'
                ? (Array.isArray(condition.dealers) && condition.dealers.length ? condition.dealers : [condition.dealer])
                : (Array.isArray(condition.scopeValues) && condition.scopeValues.length ? condition.scopeValues : [condition.scopeValue]);
            const wanted = new Set((wantedRaw || []).map(normalizeTarget).filter(Boolean));
            const actual = new Set((actualRaw || []).map(normalizeTarget).filter(Boolean));
            return wanted.size === actual.size && [...wanted].every(value => actual.has(value));
        };

        const standardCodes = ['BASE-PRICE','SOCIAL-5','SUPPORT-10','CUSTOM-DISCOUNT'];
        const candidates = (await PricingCondition.find({
            scopeType,
            code:{ $in:standardCodes },
            cancelledAt:null
        })).filter(exactTarget);

        const chosenCodes = new Set();
        if (priceList) chosenCodes.add('BASE-PRICE');
        if (discounts.some(value => Math.abs(value - 5) < 0.001)) chosenCodes.add('SOCIAL-5');
        if (discounts.some(value => Math.abs(value - 10) < 0.001)) chosenCodes.add('SUPPORT-10');
        if (discounts.some(value => Math.abs(value - 5) >= 0.001 && Math.abs(value - 10) >= 0.001)) chosenCodes.add('CUSTOM-DISCOUNT');

        for (const existing of candidates) {
            const isBasePrice = existing.code === 'BASE-PRICE';
            const isDiscount = ['SOCIAL-5','SUPPORT-10','CUSTOM-DISCOUNT'].includes(existing.code);
            if (isBasePrice && !priceList) continue;
            if (isDiscount && !discounts.length) continue;
            if (chosenCodes.has(existing.code)) continue;
            existing.cancelledAt = new Date();
            existing.updatedBy = user;
            existing.audit.push({
                action:'cancelled',
                userId:user.id,
                userName:user.name,
                note:'Отключено при изменении настройки цен'
            });
            await existing.save();
        }

        async function upsertStandard(code, values, auditNote) {
            const matches = candidates.filter(item => item.code === code && !item.cancelledAt);
            let item = matches[0] || null;
            if (item) {
                Object.assign(item, base, values, { cancelledAt:null, updatedBy:user });
                item.audit.push({ action:'updated', userId:user.id, userName:user.name, note:auditNote });
                await item.save();
                for (const duplicate of matches.slice(1)) {
                    duplicate.cancelledAt = new Date();
                    duplicate.updatedBy = user;
                    duplicate.audit.push({ action:'cancelled', userId:user.id, userName:user.name, note:'Удалён дубль условия' });
                    await duplicate.save();
                }
                return item._id;
            }
            item = await PricingCondition.create({
                ...base,
                ...values,
                code,
                createdBy:user,
                updatedBy:user,
                audit:[{ action:'created', userId:user.id, userName:user.name, note:auditNote }]
            });
            return item._id;
        }

        const saved = [];
        const overridePriority = ({ all:100, city:200, sector:300, dealer:400 })[scopeType] || 100;
        if (priceList) {
            saved.push(await upsertStandard('BASE-PRICE', {
                kind:'price_list',
                name:priceList.name,
                priceList:priceList._id,
                priceListName:priceList.name,
                discountPercent:0,
                stackable:false,
                priority:overridePriority,
                startDate:String(priceList.validFrom || '').trim(),
                endDate:String(priceList.validTo || '').trim(),
                paused:false,
                reasonType:'other',
                requirementTarget:0,
                requirementCurrent:0,
                requirementUnit:'публикаций',
                requirementDueDate:'',
                requirementVerified:false,
                proofNote:'',
                note
            }, 'Прайс назначен через настройку цен'));
        }

        for (const discount of discounts) {
            const code = Math.abs(discount - 5) < 0.001
                ? 'SOCIAL-5'
                : (Math.abs(discount - 10) < 0.001 ? 'SUPPORT-10' : 'CUSTOM-DISCOUNT');
            saved.push(await upsertStandard(code, {
                kind:'discount',
                name:`Скидка −${discount}%`,
                priceList:null,
                priceListName:'',
                discountPercent:discount,
                stackable:true,
                priority:discount,
                startDate,
                endDate,
                paused:false,
                reasonType:'other',
                requirementTarget:0,
                requirementCurrent:0,
                requirementUnit:'публикаций',
                requirementDueDate:'',
                requirementVerified:false,
                proofNote:'',
                note
            }, `Скидка −${discount}% сохранена через настройку цен`));
        }

        res.json({ status:'ok', saved:saved.map(String) });
    } catch (e) {
        res.status(400).json({ error:e.message });
    }
});

app.post('/api/pricing/conditions', requirePermission('can_manage_pricing'), async (req, res) => {
    try {
        const payload = cleanPricingPayload(req.body);
        const validation = validatePricingPayload(payload);
        if (validation) return res.status(400).json({ error: validation });
        const duplicate = await findPricingDuplicate(payload);
        if (duplicate) {
            return res.status(400).json({ error: `Условие с кодом «${payload.code}» уже действует на эту же цель в пересекающийся период` });
        }

        if (!isGlobalViewer(req) && payload.scopeType !== 'dealer') {
            return res.status(403).json({ error: 'Региональные и общие ценовые условия может создавать только пользователь с доступом ко всей компании' });
        }
        if (payload.scopeType !== 'all') {
            const targetError = await validatePricingTargets(req, payload);
            if (targetError) return res.status(404).json({ error: targetError });
        }

        const user = pricingUserMeta(req);
        const condition = await PricingCondition.create({
            ...payload,
            createdBy: user,
            updatedBy: user,
            audit: [{ action: 'created', userId: user.id, userName: user.name, note: 'Условие создано' }]
        });
        const populated = await PricingCondition.findById(condition._id).populate('dealer', '_id dealer_id name city region_sector price_type responsible')
            .populate('dealers', '_id dealer_id name city region_sector price_type responsible')
            .populate('priceList', '_id name code versionDate validFrom validTo active includeIlliquid').lean();
        res.status(201).json({ ...populated, computedStatus: pricingConditionStatus(populated) });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.put('/api/pricing/conditions/:id', requirePermission('can_manage_pricing'), async (req, res) => {
    try {
        const existing = await PricingCondition.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Ценовое условие не найдено' });
        if (existing.cancelledAt) return res.status(400).json({ error: 'Отменённое условие нельзя редактировать' });

        const payload = cleanPricingPayload(req.body);
        const validation = validatePricingPayload(payload);
        if (validation) return res.status(400).json({ error: validation });
        const duplicate = await findPricingDuplicate(payload, existing._id);
        if (duplicate) {
            return res.status(400).json({ error: `Условие с кодом «${payload.code}» уже действует на эту же цель в пересекающийся период` });
        }

        if (!isGlobalViewer(req) && payload.scopeType !== 'dealer') {
            return res.status(403).json({ error: 'Региональные и общие ценовые условия может менять только пользователь с доступом ко всей компании' });
        }
        if (payload.scopeType !== 'all') {
            const targetError = await validatePricingTargets(req, payload);
            if (targetError) return res.status(404).json({ error: targetError });
        }

        const user = pricingUserMeta(req);
        Object.assign(existing, payload, { updatedBy: user });
        existing.audit.push({ action: 'updated', userId: user.id, userName: user.name, note: String(req.body.auditNote || 'Условие изменено').trim() });
        await existing.save();

        const populated = await PricingCondition.findById(existing._id).populate('dealer', '_id dealer_id name city region_sector price_type responsible')
            .populate('dealers', '_id dealer_id name city region_sector price_type responsible')
            .populate('priceList', '_id name code versionDate validFrom validTo active includeIlliquid').lean();
        res.json({ ...populated, computedStatus: pricingConditionStatus(populated) });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.delete('/api/pricing/conditions/:id', requirePermission('can_manage_pricing'), async (req, res) => {
    try {
        const condition = await PricingCondition.findById(req.params.id);
        if (!condition) return res.status(404).json({ error: 'Ценовое условие не найдено' });
        if (condition.cancelledAt) return res.status(400).json({ error: 'Условие уже отменено' });

        const user = pricingUserMeta(req);
        condition.cancelledAt = new Date();
        condition.updatedBy = user;
        condition.audit.push({
            action: 'cancelled',
            userId: user.id,
            userName: user.name,
            note: String(req.body?.reason || 'Условие отменено').trim()
        });
        await condition.save();
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/pricing/conditions/:id/restore', requirePermission('can_manage_pricing'), async (req, res) => {
    try {
        const condition = await PricingCondition.findById(req.params.id);
        if (!condition) return res.status(404).json({ error:'Ценовое условие не найдено' });
        if (!condition.cancelledAt) return res.status(400).json({ error:'Условие уже действует' });

        if (condition.kind === 'price_list' && condition.priceList) {
            const linkedList = await PriceList.findById(condition.priceList).select('_id name active').lean();
            if (!linkedList) {
                return res.status(409).json({ error:'Связанный прайс-лист удалён. Выберите другой прайс и создайте новое условие.' });
            }
            if (linkedList.active === false) {
                return res.status(409).json({ error:'Сначала восстановите прайс-лист «' + (linkedList.name || condition.priceListName || '') + '» из архива.' });
            }
        }

        const duplicate = await findPricingDuplicate({
            code:condition.code,
            kind:condition.kind,
            scopeType:condition.scopeType,
            dealer:condition.dealer,
            dealers:condition.dealers,
            scopeValue:condition.scopeValue,
            scopeValues:condition.scopeValues,
            startDate:condition.startDate,
            endDate:condition.endDate
        }, condition._id);
        if (duplicate) {
            return res.status(409).json({
                error:'Нельзя восстановить: на эту же цель и период уже действует условие с кодом «' + (condition.code || duplicate.code || '') + '».'
            });
        }

        const user = pricingUserMeta(req);
        condition.cancelledAt = null;
        condition.updatedBy = user;
        condition.audit.push({
            action:'restored',
            userId:user.id,
            userName:user.name,
            note:String(req.body?.reason || 'Условие восстановлено').trim()
        });
        await condition.save();

        const populated = await PricingCondition.findById(condition._id)
            .populate('dealer', '_id dealer_id name city region_sector price_type responsible')
            .populate('dealers', '_id dealer_id name city region_sector price_type responsible')
            .populate('priceList', '_id name code versionDate validFrom validTo active includeIlliquid')
            .lean();
        res.json({ ...populated, computedStatus:pricingConditionStatus(populated) });
    } catch (e) {
        res.status(400).json({ error:e.message });
    }
});

app.delete('/api/pricing/conditions/:id/permanent', requirePermission('can_manage_pricing'), async (req, res) => {
    try {
        const condition = await PricingCondition.findById(req.params.id).lean();
        if (!condition) return res.status(404).json({ error:'Ценовое условие не найдено' });
        await PricingCondition.deleteOne({ _id:condition._id });
        res.json({ status:'deleted', id:String(condition._id), name:condition.name || '' });
    } catch (e) {
        res.status(400).json({ error:e.message });
    }
});


function motivationUserMeta(req) {
    return {
        id:String(req.user?.id || ''),
        name:String(req.user?.fullName || req.user?.username || '')
    };
}

function normalizeMotivationSchemePayload(input = {}) {
    const name = String(input.name || '').trim();
    const ratePerM2 = Math.max(0, Number(input.ratePerM2) || 0);
    const validFrom = String(input.validFrom || '').trim();
    const validTo = String(input.validTo || '').trim();
    if (!name) { const err=new Error('Укажите название мотивации'); err.statusCode=400; throw err; }
    if (!(ratePerM2 > 0)) { const err=new Error('Ставка мотивации должна быть больше 0'); err.statusCode=400; throw err; }
    if (validFrom && !/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) { const err=new Error('Некорректная дата начала'); err.statusCode=400; throw err; }
    if (validTo && !/^\d{4}-\d{2}-\d{2}$/.test(validTo)) { const err=new Error('Некорректная дата окончания'); err.statusCode=400; throw err; }
    if (validFrom && validTo && validFrom > validTo) { const err=new Error('Дата окончания раньше даты начала'); err.statusCode=400; throw err; }
    return {
        name,
        ratePerM2,
        validFrom,
        validTo,
        active: input.active !== false,
        note:String(input.note || '').trim()
    };
}

function motivationMonthRange(month) {
    const value = String(month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(value)) { const err=new Error('Укажите месяц в формате ГГГГ-ММ'); err.statusCode=400; throw err; }
    const [year, monthNumber] = value.split('-').map(Number);
    const start = `${value}-01`;
    const endDate = new Date(Date.UTC(year, monthNumber, 0));
    const end = endDate.toISOString().slice(0,10);
    return { month:value, start, end };
}

function motivationSalesRange(payoutRange) {
    const [year, month] = payoutRange.month.split('-').map(Number);
    const salesMonth = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
    return motivationMonthRange(salesMonth);
}

function motivationSchemeAppliesToMonth(scheme, range) {
    if (!scheme || scheme.active === false) return false;
    const from = String(scheme.validFrom || '');
    const to = String(scheme.validTo || '');
    return (!from || from <= range.end) && (!to || to >= range.start);
}

app.get('/api/motivation/reminder-settings', requirePermission('can_view_sales'), async (req,res) => {
    try {
        const item = await MotivationReminderSetting.findOne({key:'dashboard'}).lean();
        res.json({enabled:item?.enabled !== false,startDay:item?.startDay || 1,endDay:item?.endDay || 10,hideWhenEmpty:item?.hideWhenEmpty !== false});
    } catch(e) { res.status(500).json({error:e.message}); }
});
app.put('/api/motivation/reminder-settings', requireAnyPermission('can_manage_pricing','can_edit_sales_fact'), async (req,res) => {
    try {
        const startDay=Number(req.body?.startDay), endDay=Number(req.body?.endDay);
        if(!Number.isInteger(startDay)||!Number.isInteger(endDay)||startDay<1||endDay>31||startDay>endDay) return res.status(400).json({error:'Укажите дни от 1 до 31 в правильном порядке'});
        const item=await MotivationReminderSetting.findOneAndUpdate({key:'dashboard'},{$set:{enabled:req.body.enabled!==false,startDay,endDay,hideWhenEmpty:req.body.hideWhenEmpty!==false}},{upsert:true,new:true});
        res.json({enabled:item.enabled,startDay:item.startDay,endDay:item.endDay,hideWhenEmpty:item.hideWhenEmpty});
    } catch(e) {res.status(500).json({error:e.message});}
});

app.get('/api/motivation/schemes', requireAnyPermission('can_view_dealers','can_create_dealer','can_edit_dealer','can_view_sales','can_view_pricing'), async (req,res) => {
    try {
        const includeArchive = String(req.query.all || '') === '1';
        const filter = includeArchive ? {} : { active:{ $ne:false } };
        const items = await MotivationScheme.find(filter).sort({ active:-1, validFrom:-1, name:1 }).lean();
        res.json(items.map(item => ({
            id:String(item._id),
            name:item.name || '',
            ratePerM2:Number(item.ratePerM2) || 0,
            validFrom:item.validFrom || '',
            validTo:item.validTo || '',
            active:item.active !== false,
            note:item.note || '',
            createdAt:item.createdAt,
            updatedAt:item.updatedAt
        })));
    } catch (e) { res.status(500).json({error:e.message}); }
});

app.post('/api/motivation/schemes', requireAnyPermission('can_manage_pricing','can_edit_sales_fact'), async (req,res) => {
    try {
        const payload = normalizeMotivationSchemePayload(req.body || {});
        payload.createdBy = motivationUserMeta(req);
        payload.updatedBy = motivationUserMeta(req);
        const item = await MotivationScheme.create(payload);
        res.status(201).json({ id:String(item._id), ...payload });
    } catch (e) { res.status(e.statusCode || 400).json({error:e.message}); }
});

app.put('/api/motivation/schemes/:id', requireAnyPermission('can_manage_pricing','can_edit_sales_fact'), async (req,res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({error:'Некорректная мотивация'});
        const payload = normalizeMotivationSchemePayload(req.body || {});
        payload.updatedBy = motivationUserMeta(req);
        const item = await MotivationScheme.findByIdAndUpdate(req.params.id, { $set:payload }, {new:true}).lean();
        if (!item) return res.status(404).json({error:'Мотивация не найдена'});
        res.json({ id:String(item._id), name:item.name, ratePerM2:item.ratePerM2, validFrom:item.validFrom, validTo:item.validTo, active:item.active !== false, note:item.note || '' });
    } catch (e) { res.status(e.statusCode || 400).json({error:e.message}); }
});

app.delete('/api/motivation/schemes/:id', requireAnyPermission('can_manage_pricing','can_edit_sales_fact'), async (req,res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({error:'Некорректная мотивация'});
        const assigned = await Dealer.countDocuments({ motivation_scheme:req.params.id });
        const item = await MotivationScheme.findByIdAndUpdate(req.params.id, { $set:{ active:false, updatedBy:motivationUserMeta(req) } }, {new:true}).lean();
        if (!item) return res.status(404).json({error:'Мотивация не найдена'});
        res.json({status:'archived', assigned});
    } catch (e) { res.status(400).json({error:e.message}); }
});

app.post('/api/motivation/payouts/recalculate', requireAnyPermission('can_edit_sales_fact','can_manage_pricing'), async (req,res) => {
    try {
        const range = motivationMonthRange(req.body?.month);
        const salesRange = motivationSalesRange(range);
        const visibility = getWorkingDealerFilter(getDealerFilter(req));
        const dealers = await Dealer.find({
            $and:[
                visibility,
                { motivation_scheme:{ $ne:null } }
            ]
        }).select('_id dealer_id name city motivation_scheme status').populate('motivation_scheme').lean();

        const eligibleDealers = dealers.filter(dealer => motivationSchemeAppliesToMonth(dealer.motivation_scheme, range));
        const ids = eligibleDealers.map(dealer => String(dealer._id));
        const salesRows = ids.length ? await Sales.find({
            month:salesRange.month,
            isCustom:{ $ne:true },
            dealerId:{ $in:ids }
        }).lean() : [];

        const salesByDealer = new Map();
        salesRows.forEach(row => {
            const id = String(row.dealerId || '');
            salesByDealer.set(id, (salesByDealer.get(id) || 0) + Math.max(0, Number(row.fact) || 0));
        });
        const dealersWithSales = eligibleDealers.filter(dealer => (salesByDealer.get(String(dealer._id)) || 0) > 0);

        const existing = await MotivationPayout.find({
            month:range.month,
            dealer:{ $in:eligibleDealers.map(d=>d._id) }
        }).lean();
        const existingByDealer = new Map(existing.map(item => [String(item.dealer), item]));
        const calculatedBy = motivationUserMeta(req);
        const qualifyingIds = [];

        for (const dealer of eligibleDealers) {
            const dealerId = String(dealer._id);
            const salesM2 = Math.round((salesByDealer.get(dealerId) || 0) * 100) / 100;
            if (!(salesM2 > 0)) continue;
            qualifyingIds.push(dealerId);
            const scheme = dealer.motivation_scheme || {};
            const ratePerM2 = Math.max(0, Number(scheme.ratePerM2) || 0);
            const amount = Math.round(salesM2 * ratePerM2 * 100) / 100;
            const partialPeriod = Boolean(
                (scheme.validFrom && scheme.validFrom > range.start) ||
                (scheme.validTo && scheme.validTo < range.end)
            );
            const prev = existingByDealer.get(dealerId);
            if (prev && (prev.status === 'paid' || prev.status === 'skipped')) continue;

            await MotivationPayout.findOneAndUpdate(
                { month:range.month, dealer:dealer._id },
                { $set:{
                    dealerId:dealer.dealer_id || '',
                    dealerName:dealer.name || '',
                    dealerCity:dealer.city || '',
                    scheme:scheme._id || null,
                    schemeName:scheme.name || '',
                    ratePerM2,
                    salesM2,
                    amount,
                    validFrom:scheme.validFrom || '',
                    validTo:scheme.validTo || '',
                    partialPeriod,
                    status:'pending',
                    calculatedAt:new Date(),
                    calculatedBy
                }},
                { upsert:true, new:true, setDefaultsOnInsert:true }
            );
        }

        const stalePending = existing.filter(item => item.status === 'pending' && !qualifyingIds.includes(String(item.dealer)));
        // Old pending payouts from the former same-month calculation must not survive recalculation.
        const allPending = await MotivationPayout.find({ month:range.month, status:'pending', dealer:{ $in:dealers.map(d=>d._id) } }).lean();
        const obsoletePending = allPending.filter(item => !qualifyingIds.includes(String(item.dealer)));
        const obsoleteIds = [...new Set([...stalePending, ...obsoletePending].map(item=>String(item._id)))];
        if (obsoleteIds.length) await MotivationPayout.deleteMany({ _id:{ $in:obsoleteIds } });

        const rows = await MotivationPayout.find({
            month:range.month,
            dealer:{ $in:dealers.map(d=>d._id) }
        }).sort({ status:1, dealerCity:1, dealerName:1 }).lean();

        res.json({
            month:range.month,
            salesMonth:salesRange.month,
            count:rows.length,
            pendingAmount:rows.filter(x=>x.status==='pending').reduce((sum,x)=>sum+(Number(x.amount)||0),0),
            diagnostics:{
                assigned:dealers.length,
                eligible:eligibleDealers.length,
                outsidePeriod:Math.max(0,dealers.length-eligibleDealers.length),
                withSales:dealersWithSales.length,
                withoutSales:Math.max(0,eligibleDealers.length-dealersWithSales.length)
            }
        });
    } catch (e) { res.status(e.statusCode || 500).json({error:e.message}); }
});

app.get('/api/motivation/payouts', requirePermission('can_view_sales'), async (req,res) => {
    try {
        const range = motivationMonthRange(req.query.month);
        const salesRange = motivationSalesRange(range);
        const dealerFilter = getDealerFilter(req);
        const dealers = await Dealer.find({
            $and:[dealerFilter,{ motivation_scheme:{ $ne:null } }]
        }).select('_id dealer_id name motivation_scheme status').populate('motivation_scheme').lean();
        const dealerIds = dealers.map(item=>item._id);
        const eligibleDealers = dealers.filter(dealer => motivationSchemeAppliesToMonth(dealer.motivation_scheme, range));
        const eligibleIds = eligibleDealers.map(item=>String(item._id));
        const diagnosticSales = eligibleIds.length ? await Sales.find({
            month:salesRange.month,
            isCustom:{ $ne:true },
            dealerId:{ $in:eligibleIds }
        }).select('dealerId fact').lean() : [];
        const salesByDealer = new Map();
        diagnosticSales.forEach(row=>{
            const id=String(row.dealerId||'');
            salesByDealer.set(id,(salesByDealer.get(id)||0)+Math.max(0,Number(row.fact)||0));
        });
        const withSales = eligibleDealers.filter(dealer => (salesByDealer.get(String(dealer._id)) || 0) > 0).length;
        const rows = await MotivationPayout.find({ month:range.month, dealer:{ $in:dealerIds } })
            .sort({ status:1, dealerCity:1, dealerName:1 }).lean();
        const summary = rows.reduce((acc,row)=>{
            acc.salesM2 += Number(row.salesM2)||0;
            acc.amount += Number(row.amount)||0;
            acc[row.status] = (acc[row.status]||0) + 1;
            if(row.status==='pending') acc.pendingAmount += Number(row.amount)||0;
            if(row.status==='paid') acc.paidAmount += Number(row.amount)||0;
            return acc;
        }, {salesM2:0,amount:0,pending:0,paid:0,skipped:0,pendingAmount:0,paidAmount:0});
        res.json({
            month:range.month,
            salesMonth:salesRange.month,
            summary,
            diagnostics:{
                assigned:dealers.length,
                eligible:eligibleDealers.length,
                outsidePeriod:Math.max(0,dealers.length-eligibleDealers.length),
                withSales,
                withoutSales:Math.max(0,eligibleDealers.length-withSales)
            },
            rows:rows.map(row=>({
                id:String(row._id),
                dealerId:row.dealerId || '',
                dealerName:row.dealerName || '',
                dealerCity:row.dealerCity || '',
                schemeName:row.schemeName || '',
                ratePerM2:Number(row.ratePerM2)||0,
                salesM2:Number(row.salesM2)||0,
                amount:Number(row.amount)||0,
                validFrom:row.validFrom || '',
                validTo:row.validTo || '',
                partialPeriod:Boolean(row.partialPeriod),
                status:row.status || 'pending',
                paidAt:row.paidAt,
                note:row.note || '',
                calculatedAt:row.calculatedAt,
                updatedAt:row.updatedAt
            }))
        });
    } catch (e) { res.status(e.statusCode || 500).json({error:e.message}); }
});

app.patch('/api/motivation/payouts/:id', requireAnyPermission('can_edit_sales_fact','can_manage_pricing'), async (req,res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({error:'Некорректная выплата'});
        const status = String(req.body?.status || '').trim();
        if (!['pending','paid','skipped'].includes(status)) return res.status(400).json({error:'Некорректный статус выплаты'});
        const update = {
            status,
            note:String(req.body?.note || '').trim()
        };
        if (status === 'paid') {
            update.paidAt = new Date();
            update.paidBy = motivationUserMeta(req);
        } else {
            update.paidAt = null;
            update.paidBy = {id:'',name:''};
        }
        const item = await MotivationPayout.findByIdAndUpdate(req.params.id, {$set:update}, {new:true}).lean();
        if (!item) return res.status(404).json({error:'Выплата не найдена'});
        res.json({status:'ok'});
    } catch (e) { res.status(400).json({error:e.message}); }
});

app.get('/api/products/count', requireAnyPermission('can_view_products', 'can_view_report', 'can_view_reclamations', 'can_view_dealers'), async (req, res) => {
    try {
        const count = await Product.countDocuments({});
        res.json({ count });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/products', requireAnyPermission('can_view_products', 'can_view_report', 'can_view_reclamations', 'can_view_dealers'), async (req, res) => { const s = new RegExp(req.query.search||'', 'i'); const p = await Product.find({$or:[{sku:s},{name:s},{collection:s}]}).sort({sku:1}).lean(); res.json(p.map(x=>{x.id=x._id;return x;})); });

app.get('/api/products/gmail-stock-status', requirePermission('can_manage_products'), async (req,res) => {
    try { res.json(await gmailStockSync.status()); }
    catch (error) { res.status(500).json({error:'Не удалось проверить состояние автоимпорта'}); }
});
app.get('/api/products/stock-import-meta', requireAnyPermission('can_view_products', 'can_view_report', 'can_view_dealers'), async (req, res) => {
    try {
        const meta = await StockImportMeta.findOne({ key:'free_stock' }).lean();
        res.json(meta ? {
            importedAt:meta.importedAt || null,
            importedBy:meta.importedBy || {},
            source:meta.source || 'Свободный остаток',
            fileName:meta.fileName || '',
            matched:Number(meta.matched) || 0,
            updated:Number(meta.updated) || 0
        } : { importedAt:null });
    } catch (e) {
        res.status(500).json({ error:e.message });
    }
});

app.post('/api/products/stock-import-meta', requirePermission('can_manage_products'), async (req, res) => {
    try {
        const user = pricingUserMeta(req);
        const importedAt = new Date();
        const meta = await StockImportMeta.findOneAndUpdate(
            { key:'free_stock' },
            { $set:{
                importedAt,
                importedBy:user,
                source:String(req.body?.source || 'Свободный остаток').trim(),
                fileName:String(req.body?.fileName || '').trim().slice(0,240),
                matched:Math.max(0,Number(req.body?.matched) || 0),
                updated:Math.max(0,Number(req.body?.updated) || 0)
            } },
            { upsert:true, new:true, setDefaultsOnInsert:true }
        ).lean();
        res.json({
            importedAt:meta.importedAt,
            importedBy:meta.importedBy || {},
            source:meta.source || 'Свободный остаток',
            fileName:meta.fileName || '',
            matched:Number(meta.matched) || 0,
            updated:Number(meta.updated) || 0
        });
    } catch (e) {
        res.status(400).json({ error:e.message });
    }
});
app.post('/api/products', requirePermission('can_manage_products'), async (req, res) => { const p = new Product(req.body); await p.save(); res.json(convertToClient(p)); });
app.put('/api/products/:id', requirePermission('can_manage_products'), async (req, res) => { const p = await Product.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(p)); });
app.delete('/api/products/:id', requirePermission('can_manage_products'), async (req, res) => { await Product.findByIdAndDelete(req.params.id); res.json({}); });
app.post('/api/admin/import-catalog', requirePermission('can_manage_products'), async (req, res) => { res.json({status: 'ok'}); });
app.get('/api/matrix', requireAnyPermission('can_view_products', 'can_view_report'), async (req, res) => {
    try {
        const [prods, dealers] = await Promise.all([
            Product.find({}).select('sku name product_type collection is_liquid photo_id').sort({sku:1}).lean(),
            Dealer.find(getWorkingDealerFilter(getDealerFilter(req))).select('_id name city responsible products pos_materials status').lean()
        ]);
        const dealerIds = dealers.map(d => d._id);
        const assets = dealerIds.length
            ? await WorkshopDealerAsset.find({ dealer: { $in: dealerIds }, qty: { $gt: 0 } })
                .populate('recipe', 'product outputType')
                .lean()
            : [];

        const productMap = new Map();
        dealers.forEach(d => productMap.set(d._id.toString(), new Set((d.products||[]).map(String))));

        const sampleMap = new Map();
        assets.forEach(asset => {
            const productId = asset.recipe?.outputType === 'sample' ? asset.recipe?.product : null;
            if (!productId) return;
            const key = `${asset.dealer}|${productId}`;
            sampleMap.set(key, (sampleMap.get(key) || 0) + (Number(asset.qty) || 0));
        });

        const posList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"];
        const matrix = prods.map(p => ({
            sku: p.sku,
            name: p.name,
            collection: p.collection || '',
            type: p.product_type === 'equipment' ? 'equipment' : 'product',
            is_liquid: p.is_liquid !== false,
            photoId: String(p.photo_id || '').trim(),
            dealers: dealers.map(d => ({
                value: productMap.get(d._id.toString()).has(p._id.toString()) ? 1 : 0,
                sample_qty: sampleMap.get(`${d._id}|${p._id}`) || 0,
                is_pos: false
            }))
        }));

        posList.forEach(pn => {
            matrix.push({
                sku: "POS",
                name: pn,
                type: 'pos',
                dealers: dealers.map(d => ({
                    value: (d.pos_materials||[]).find(m=>m.name===pn)?.quantity||0,
                    is_pos: true
                }))
            });
        });
        res.json({
            headers: dealers.map(d=>({id:d._id, name:d.name, city:d.city, responsible:d.responsible})),
            matrix
        });
    } catch (e) {
        res.status(500).json({error:e.message});
    }
});

app.get('/api/sales', requirePermission('can_view_sales'), async (req, res) => {
    try {
        const { month, months, dealerId } = req.query;
        let filter = month ? { month } : {};
        if (!month && months) {
            const count = Math.max(1, Math.min(24, Number(months) || 6));
            const now = new Date();
            now.setUTCDate(1);
            now.setUTCMonth(now.getUTCMonth() - (count - 1));
            const minMonth = now.toISOString().slice(0, 7);
            filter = { month: { $gte: minMonth } };
        }
        const scope = getUserScope(req);
        const companySalesView = req.query.context === 'sales' && hasPermission(req, 'can_view_sales');

        if (!companySalesView && !isGlobalViewer(req) && req.user.role === 'manager') {
            const dealers = await Dealer.find(getWorkingDealerFilter(getDealerFilter(req))).select('_id').lean();
            const dealerIds = dealers.map(d => String(d._id));
            const zonePlanId = scope === 'astana'
                ? 'PLAN_astana_all'
                : scope === 'regions'
                    ? 'PLAN_regions_all'
                    : 'PLAN_total_all';

            filter = {
                $and: [
                    filter,
                    {
                        $or: [
                            // Факт менеджера считается исключительно по дилерам,
                            // где он выбран ответственным.
                            { isCustom: { $ne: true }, dealerId: { $in: dealerIds } },
                            // План берём из сводки его зоны на странице Продажи.
                            { isCustom: { $ne: true }, dealerId: zonePlanId }
                        ]
                    }
                ]
            };
        } else if (!companySalesView && !isGlobalViewer(req) && scope !== 'all') {
            const dealers = await Dealer.find(getWorkingDealerFilter(getDealerFilter(req))).select('_id').lean();
            const dealerIds = dealers.map(d => String(d._id));
            const personalPlanIds = dealerIds.map(id => `PLAN_vip_${id}`);

            const sectorType = scope === 'astana' ? 'astana' : 'region';
            const sectors = await Sector.find({ type: sectorType }).select('name').lean();
            const slug = name => String(name || '').trim().replace(/\s+/g, '_').toLowerCase();
            const groupKeys = scope === 'astana'
                ? [...sectors.map(s => `astana_${slug(s.name)}`), 'regional_astana']
                : [...sectors.map(s => `sector_${slug(s.name)}`), 'regional_regions'];

            const groupPlanIds = groupKeys.map(key => `PLAN_${key}`);
            groupPlanIds.push(scope === 'astana' ? 'PLAN_astana_all' : 'PLAN_regions_all');
            const allowedPlanIds = [...personalPlanIds, ...groupPlanIds];

            filter = {
                $and: [
                    filter,
                    {
                        $or: [
                            { isCustom: { $ne: true }, dealerId: { $in: dealerIds } },
                            { isCustom: { $ne: true }, dealerId: { $in: allowedPlanIds } },
                            { isCustom: true, group: { $in: groupKeys } }
                        ]
                    }
                ]
            };
        }

        if (dealerId) {
            const requestedDealerId = String(dealerId);
            const requestedPlanId = `PLAN_vip_${requestedDealerId}`;
            filter = {
                $and: [
                    filter,
                    { dealerId: { $in: [requestedDealerId, requestedPlanId] } }
                ]
            };
        }

        const s = await Sales.find(filter).lean();

        // Нерабочие дилеры (potential/archive) не участвуют в текущей
        // операционной статистике продаж. Сами исторические строки Sales
        // остаются в базе и могут снова участвовать после возврата дилера
        // в рабочий статус.
        const workingBaseFilter = (companySalesView || isGlobalViewer(req)) ? {} : getDealerFilter(req);
        const workingDealers = await Dealer.find(getWorkingDealerFilter(workingBaseFilter)).select('_id').lean();
        const workingDealerIds = new Set(workingDealers.map(item => String(item._id)));

        const visibleSales = s.filter(row => {
            if (row.isCustom) return true;
            const rowDealerId = String(row.dealerId || '');
            if (!rowDealerId) return true;

            if (rowDealerId.startsWith('PLAN_manager_')) return false;
            if (rowDealerId.startsWith('PLAN_vip_')) {
                return workingDealerIds.has(rowDealerId.replace('PLAN_vip_', ''));
            }
            if (rowDealerId.startsWith('PLAN_')) return true;
            return workingDealerIds.has(rowDealerId);
        });

        res.json(visibleSales);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== ИСПРАВЛЕННЫЙ БЛОК: СОХРАНЕНИЕ, АГРЕГАЦИЯ И УДАЛЕНИЕ =====
app.post('/api/sales', async (req, res) => {
    const canFact = hasPermission(req, 'can_edit_sales_fact');
    const canPlan = hasPermission(req, 'can_edit_sales_plan');
    if (!canFact && !canPlan) {
        return res.status(403).json({ error: 'Недостаточно прав для изменения продаж' });
    }

    const now = new Date();
    const scope = req.user ? req.user.scope : 'none';
    const companySalesView = req.query.context === 'sales' && hasPermission(req, 'can_view_sales');
    const managerRestricted = Boolean(req.user && req.user.role === 'manager' && !isGlobalViewer(req) && !companySalesView);
    let managerDealerIds = null;
    if (managerRestricted) {
        const dealers = await Dealer.find(getWorkingDealerFilter(getDealerFilter(req))).select('_id').lean();
        managerDealerIds = new Set(dealers.map(d => String(d._id)));
    }

    // 1. Агрегируем дубликаты из присланных данных (если ввели несколько с одинаковым именем)
    const aggregatedData = {};
    (Array.isArray(req.body.data) ? req.body.data : []).forEach(i => {
        const row = { ...i };

        if (managerRestricted) {
            const dealerId = String(row.dealerId || '');
            if (row.isCustom) {
                row.ownerUserId = String(req.user.id);
            } else if (dealerId.startsWith('PLAN_manager_')) {
                return;
            } else if (dealerId.startsWith('PLAN_vip_')) {
                const ownedDealerId = dealerId.replace('PLAN_vip_', '');
                if (!managerDealerIds.has(ownedDealerId)) return;
            } else if (dealerId.startsWith('PLAN_')) {
                return;
            } else if (!managerDealerIds.has(dealerId)) {
                return;
            }
        }
        if (String(row.dealerId || '').startsWith('PLAN_manager_')) return;
        if (!canFact) delete row.fact;
        if (!canPlan) delete row.plan;

        const key = row.isCustom ? `custom_${row.group}_${row.dealerName}` : `dealer_${row.dealerId}`;
        if (!aggregatedData[key]) {
            aggregatedData[key] = row;
        } else {
            if (canFact) aggregatedData[key].fact = (Number(aggregatedData[key].fact) || 0) + (Number(row.fact) || 0);
            if (canPlan) aggregatedData[key].plan = (Number(aggregatedData[key].plan) || 0) + (Number(row.plan) || 0);
        }
    });

    // 2. Обновляем/Добавляем записи
    const ops = Object.values(aggregatedData).map(i => {
        const filter = { month: req.body.month };
        if (i.isCustom) {
            filter.isCustom = true;
            filter.dealerName = i.dealerName;
            if (i.group) filter.group = i.group; 
        } else {
            filter.dealerId = i.dealerId;
        }

        return {
            updateOne: { 
                filter: filter, 
                update: { $set: { ...i, updatedAt: now } }, 
                upsert: true 
            } 
        };
    }); 
    
    if (ops.length > 0) {
        await Sales.bulkWrite(ops); 
    }

    // Старые планы менеджеров больше не используются: план задаётся по зоне/сектору/дилеру.
    await Sales.deleteMany({
        month: req.body.month,
        dealerId: { $regex: '^PLAN_manager_' }
    });

    // 3. Умное удаление (Очистка разовых продаж)
    // Определяем, к каким группам имеет доступ текущий пользователь
    let groupFilter = {};
    if (managerRestricted) {
        groupFilter = { ownerUserId: String(req.user.id) };
    } else if (!companySalesView && scope === 'astana') {
        const sectors = await Sector.find({ type: 'astana' });
        groupFilter = { group: { $in: sectors.map(s => s.name) } };
    } else if (!companySalesView && scope === 'regions') {
        const sectors = await Sector.find({ type: 'region' });
        groupFilter = { group: { $in: sectors.map(s => s.name) } };
    }
    // Если admin или all, groupFilter остается пустым (имеет доступ ко всем)

    // Ищем все разовые продажи за этот месяц в базе (в рамках доступа пользователя)
    const dbCustomSales = await Sales.find({ 
        month: req.body.month, 
        isCustom: true, 
        ...groupFilter 
    });

    const idsToDelete = [];
    const incomingArray = Object.values(aggregatedData);

    if (canFact) dbCustomSales.forEach(dbSale => {
        // Проверяем, осталась ли эта продажа в присланных данных
        const existsInIncoming = incomingArray.some(
            i => i.isCustom && i.group === dbSale.group && i.dealerName === dbSale.dealerName
        );
        
        // Если в присланных данных её больше нет — помечаем на удаление
        if (!existsInIncoming) {
            idsToDelete.push(dbSale._id);
        }
    });

    // Удаляем всё лишнее
    if (canFact && idsToDelete.length > 0) {
        await Sales.deleteMany({ _id: { $in: idsToDelete } });
    }

    res.json({status:'ok'}); 
});
// ===================================================================

app.get('/api/competitors-ref', requirePermission('can_view_competitors'), async (req, res) => { const l = await CompRef.find().sort({name:1}); res.json(l.map(convertToClient)); });
app.post('/api/competitors-ref', requirePermission('can_manage_competitors'), async (req, res) => { const c = new CompRef(req.body); await c.save(); res.json(convertToClient(c)); });
app.put('/api/competitors-ref/:id', requirePermission('can_manage_competitors'), async (req, res) => { await CompRef.findByIdAndUpdate(req.params.id, req.body); res.json({status:'ok'}); });
app.delete('/api/competitors-ref/:id', requirePermission('can_manage_competitors'), async (req, res) => { await CompRef.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });
require('./server/training-downloads').registerTrainingDownloads({app,requirePermission});
app.get('/api/knowledge', requirePermission('can_view_knowledge'), async (req, res) => { const l = await Knowledge.find().sort({title:1}); res.json(l.map(convertToClient)); });
app.get('/api/knowledge/:id', requirePermission('can_view_knowledge'), async (req, res) => { res.json(convertToClient(await Knowledge.findById(req.params.id))); });
app.post('/api/knowledge', requirePermission('can_manage_knowledge'), async (req, res) => { const a = new Knowledge(req.body); await a.save(); res.json(convertToClient(a)); });
app.put('/api/knowledge/:id', requirePermission('can_manage_knowledge'), async (req, res) => { const a = await Knowledge.findByIdAndUpdate(req.params.id, req.body); res.json(convertToClient(a)); });
app.delete('/api/knowledge/:id', requirePermission('can_manage_knowledge'), async (req, res) => { await Knowledge.findByIdAndDelete(req.params.id); res.json({status:'deleted'}); });
app.get('/api/tasks', requirePermission('can_view_dashboard'), async (req, res) => { try { const data = await Dealer.find(getWorkingDealerFilter(getDealerFilter(req))).select('name visits status responsible').lean(); res.json(data.map(d => ({ id: d._id, name: d.name, status: d.status, visits: d.visits || [], responsible: d.responsible }))); } catch (e) { res.status(500).json([]); } });

async function getScopedDealerIds(req) {
    const baseFilter = isGlobalViewer(req) ? {} : getDealerFilter(req);
    const dealers = await Dealer.find(getWorkingDealerFilter(baseFilter)).select('_id').lean();
    return dealers.map(d => String(d._id));
}

// ==========================================
// РЕКВИЗИТЫ И РЕКЛАМАЦИИ
// ==========================================
const reclamationSchema = new mongoose.Schema({
    dealerId: String,
    dealerName: String,
    date: String,
    productName: String,
    invoiceNumber: String,
    purchaseDate: String,
    clientName: String,
    clientPhone: String,
    address: String,
    floor: String,
    houseType: String,
    totalArea: String,
    purchasedVolume: String,
    batchNumbers: [String],
    baseType: String,
    underlayment: String,
    warmFloor: String,
    installer: String,
    
    // --- НОВЫЕ ТЕХНИЧЕСКИЕ ПОЛЯ ---
    acclimatization: String, 
    storageMethod: String,
    dryingTime: String,
    floorFlatness: String,
// --- НОВЫЕ ПОЛЯ ---
    defectMoment: String,       // Момент выявления
    compensationAmount: Number, // Сумма компенсации
    internalNotes: String,
    
    description: String,
    clientDemand: String,
    resolution: String,
    photos: [{ photo_url: String }]
}, { timestamps: true });
const Reclamation = mongoose.model('Reclamation', reclamationSchema);
const telegramNotifications = require('./server/telegram-notifications').registerTelegram({
    app,mongoose,User,Dealer,Product,Sales,StockImportMeta,employeeKpi,AuditLog,connection:mongoose.connection,
    ready:()=>appReady&&!shuttingDown,origin:APP_ORIGIN
});


// ==========================================
// ЦЕХ API
// ==========================================
async function syncWorkshopPosToDealer(dealerId, recipeId) {
    const recipe = await WorkshopRecipe.findById(recipeId).select('matrixPosName').lean();
    const posName = String(recipe?.matrixPosName || '').trim();
    if (!posName) return;

    const recipes = await WorkshopRecipe.find({ matrixPosName: posName }).select('_id').lean();
    const recipeIds = recipes.map(item => item._id);
    const assets = await WorkshopDealerAsset.find({ dealer: dealerId, recipe: { $in: recipeIds } }).lean();
    const qty = assets.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

    const dealer = await Dealer.findById(dealerId);
    if (!dealer) return;
    dealer.pos_materials = Array.isArray(dealer.pos_materials) ? dealer.pos_materials : [];
    const index = dealer.pos_materials.findIndex(item => item.name === posName);
    if (qty > 0) {
        if (index >= 0) dealer.pos_materials[index].quantity = qty;
        else dealer.pos_materials.push({ name: posName, quantity: qty });
    } else if (index >= 0) {
        dealer.pos_materials.splice(index, 1);
    }
    await dealer.save();
}

app.post('/api/workshop/print-log', requirePermission('can_view_workshop'), async (req, res) => {
    try {
        const type=String(req.body?.type||'report').trim().slice(0,60);
        const referenceId=String(req.body?.referenceId||'').trim().slice(0,120);
        const title=String(req.body?.title||'Документ цеха').trim().slice(0,180);
        res.json({status:'logged',type,referenceId,title});
    } catch(e) {
        res.status(500).json({error:e.message});
    }
});

app.get('/api/workshop/bootstrap', requirePermission('can_view_workshop'), async (req, res) => {
    try {
        const [products, dealers, materials, recipes, laminateStocks, assets, productions, movements, memos] = await Promise.all([
            Product.find().select('sku name collection is_liquid characteristics.package_qty characteristics.size characteristics.class characteristics.thickness').sort({ sku: 1 }).lean(),
            Dealer.find(getWorkingDealerFilter(getDealerFilter(req))).select('_id dealer_id name city status').sort({ name: 1 }).lean(),
            WorkshopMaterial.find({ active: { $ne: false } }).sort({ category: 1, name: 1 }).lean(),
            WorkshopRecipe.find({ active: { $ne: false } })
                .populate('product', 'sku name is_liquid characteristics.package_qty')
                .populate('materials.material', 'code name unit purchaseUnit purchaseUnitSize stockQty')
                .populate('components.recipe', 'name outputType stockQty')
                .sort({ outputType: 1, name: 1 }).lean(),
            WorkshopLaminateStock.find().populate('product', 'sku name is_liquid characteristics.package_qty').lean(),
            WorkshopDealerAsset.find({ qty: { $gt: 0 } })
                .populate('dealer', 'dealer_id name city status')
                .populate({ path: 'recipe', populate: { path: 'product', select: 'sku name is_liquid' } })
                .sort({ updatedAt: -1 }).lean(),
            WorkshopProduction.find({ cancelledAt: { $exists: false } })
                .populate('recipe', 'name outputType')
                .populate('product', 'sku name')
                .sort({ date: -1, createdAt: -1 }).limit(30).lean(),
            WorkshopMovement.find()
                .populate('product', 'sku name')
                .populate('material', 'code name unit')
                .populate('recipe', 'name outputType')
                .populate('dealer', 'dealer_id name city')
                .sort({ date: -1, createdAt: -1 }).limit(60).lean(),
            WorkshopMemo.find()
                .populate('lines.product', 'sku name is_liquid characteristics.package_qty')
                .populate('lines.actualProduct', 'sku name is_liquid characteristics.package_qty')
                .populate('lines.recipe', 'name outputType planksPerUnit')
                .sort({ date: -1, createdAt: -1 }).limit(80).lean()
        ]);

        const memoIds = memos.map(item => item._id);
        const producedByMemoLine = memoIds.length ? await WorkshopProduction.aggregate([
            { $match: { memo: { $in: memoIds }, memoLineId: { $nin: [null, ''] }, cancelledAt: { $exists: false } } },
            { $group: { _id: '$memoLineId', qty: { $sum: '$outputQty' } } }
        ]) : [];
        const producedMap = new Map(producedByMemoLine.map(item => [String(item._id), Number(item.qty) || 0]));
        memos.forEach(memo => {
            (memo.lines || []).forEach(line => {
                line.producedQty = producedMap.get(String(line._id)) || 0;
            });
        });

        const today = new Date();
        today.setHours(0,0,0,0);
        const todayRows = await WorkshopProduction.find({ date: { $gte: today }, cancelledAt: { $exists: false } }).select('outputQty').lean();
        const todayProduction = todayRows.reduce((sum, item) => sum + (Number(item.outputQty) || 0), 0);
        const finishedStock = recipes.reduce((sum, item) => sum + (Number(item.stockQty) || 0), 0);
        const lowMaterials = materials.filter(item => Number(item.minQty) > 0 && Number(item.stockQty) <= Number(item.minQty)).length;
        const laminatePlanks = laminateStocks.reduce((sum, item) => sum + (Number(item.planksQty) || 0), 0);
        const openMemos = memos.filter(item => item.status === 'created' || item.status === 'mismatch').length;
        const visibleAssets = assets.filter(asset => !isNonWorkingDealerStatus(asset.dealer?.status));
        const dealerAssetStock = visibleAssets.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
        const openingBalanceCount = await WorkshopMovement.countDocuments({
            type: { $in: ['opening_balance', 'opening_dealer_balance'] }
        });

        res.json({
            products: products.map(convertToClient),
            dealers: dealers.map(convertToClient),
            materials: materials.map(convertToClient),
            recipes: recipes.map(convertToClient),
            laminateStocks: laminateStocks.map(convertToClient),
            dealerAssets: visibleAssets.map(convertToClient),
            productions: productions.map(convertToClient),
            movements: movements.map(convertToClient),
            memos: memos.map(convertToClient),
            stats: { todayProduction, finishedStock, lowMaterials, laminatePlanks, openMemos, dealerAssetStock, openingBalanceCount }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/workshop/movements', requirePermission('can_view_workshop'), async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 150));
        const filter = {};
        if (req.query.type) filter.type = req.query.type;
        const list = await WorkshopMovement.find(filter)
            .populate('product', 'sku name')
            .populate('material', 'code name unit')
            .populate('recipe', 'name outputType')
            .populate('dealer', 'dealer_id name city')
            .sort({ date: -1, createdAt: -1 }).limit(limit).lean();
        res.json(list.map(convertToClient));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/workshop/materials', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const item = new WorkshopMaterial({
            code: String(req.body.code || '').trim(),
            name: String(req.body.name || '').trim(),
            category: req.body.category || 'consumable',
            unit: req.body.unit || 'шт',
            purchaseUnit: String(req.body.purchaseUnit || req.body.unit || 'шт').trim(),
            purchaseUnitSize: Math.max(0.0001, workshopNumber(req.body.purchaseUnitSize) || 1),
            stockQty: Math.max(0, workshopNumber(req.body.stockQty)),
            minQty: Math.max(0, workshopNumber(req.body.minQty)),
            active: req.body.active !== false,
            note: String(req.body.note || '').trim()
        });
        if (!item.name) return res.status(400).json({ error: 'Укажите название материала' });
        await item.save();
        res.status(201).json(convertToClient(item));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/workshop/materials/:id', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const payload = {
            code: String(req.body.code || '').trim(),
            name: String(req.body.name || '').trim(),
            category: req.body.category || 'consumable',
            unit: req.body.unit || 'шт',
            purchaseUnit: String(req.body.purchaseUnit || req.body.unit || 'шт').trim(),
            purchaseUnitSize: Math.max(0.0001, workshopNumber(req.body.purchaseUnitSize) || 1),
            minQty: Math.max(0, workshopNumber(req.body.minQty)),
            active: req.body.active !== false,
            note: String(req.body.note || '').trim()
        };
        const item = await WorkshopMaterial.findByIdAndUpdate(req.params.id, payload, { new: true });
        if (!item) return res.status(404).json({ error: 'Материал не найден' });
        res.json(convertToClient(item));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/workshop/materials/:id', requireIsAdmin, async (req, res) => {
    try {
        const item = await WorkshopMaterial.findById(req.params.id);
        if (!item) return res.status(404).json({ error: 'Материал не найден' });

        const [movementUsed, recipeUsed] = await Promise.all([
            WorkshopMovement.exists({ material: item._id }),
            WorkshopRecipe.exists({ 'materials.material': item._id })
        ]);
        if (movementUsed || recipeUsed) {
            return res.status(400).json({ error: 'Материал уже используется в истории или рецептурах. Его можно отредактировать/деактивировать, но не удалить.' });
        }
        await WorkshopMaterial.deleteOne({ _id: item._id });
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/workshop/material-movement', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const materialId = req.body.materialId;
        const qty = Math.abs(workshopNumber(req.body.qty));
        const direction = req.body.direction === 'out' ? 'out' : 'in';
        if (!materialId || qty <= 0) return res.status(400).json({ error: 'Укажите материал и количество' });

        const delta = direction === 'out' ? -qty : qty;
        const material = await workshopChangeMaterial(materialId, delta);
        const movement = await WorkshopMovement.create({
            date: req.body.date || new Date(),
            type: req.body.type || (direction === 'out' ? 'material_issue' : 'material_receipt'),
            entityType: 'material',
            material: materialId,
            direction,
            qty,
            unit: material.unit || 'шт',
            serviceMemoNumber: String(req.body.serviceMemoNumber || '').trim(),
            note: String(req.body.note || '').trim(),
            createdBy: workshopUser(req)
        });
        res.status(201).json({ material: convertToClient(material), movement: convertToClient(movement) });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/workshop/recipes', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const recipe = new WorkshopRecipe({
            name: String(req.body.name || '').trim(),
            outputType: req.body.outputType || 'sample',
            sku: String(req.body.sku || '').trim(),
            product: req.body.productId || null,
            sideA: String(req.body.sideA || '').trim(),
            sideB: String(req.body.sideB || '').trim(),
            planksPerUnit: Math.max(0, workshopNumber(req.body.planksPerUnit)),
            packQtyOverride: Math.max(0, workshopNumber(req.body.packQtyOverride)),
            matrixPosName: String(req.body.matrixPosName || '').trim(),
            minStockQty: Math.max(0, workshopNumber(req.body.minStockQty)),
            materials: Array.isArray(req.body.materials) ? req.body.materials.map(item => ({
                material: item.materialId,
                qty: Math.max(0, workshopNumber(item.qty)),
                mode: item.mode === 'estimate' ? 'estimate' : 'strict'
            })).filter(item => item.material && item.qty >= 0) : [],
            components: Array.isArray(req.body.components) ? req.body.components.map(item => ({
                recipe: item.recipeId,
                qty: Math.max(0, workshopNumber(item.qty))
            })).filter(item => item.recipe && item.qty > 0) : [],
            active: req.body.active !== false,
            note: String(req.body.note || '').trim()
        });
        if (!recipe.name) return res.status(400).json({ error: 'Укажите название изделия' });
        await recipe.save();
        res.status(201).json(convertToClient(recipe));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/workshop/recipes/:id', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const payload = {
            name: String(req.body.name || '').trim(),
            outputType: req.body.outputType || 'sample',
            sku: String(req.body.sku || '').trim(),
            product: req.body.productId || null,
            sideA: String(req.body.sideA || '').trim(),
            sideB: String(req.body.sideB || '').trim(),
            planksPerUnit: Math.max(0, workshopNumber(req.body.planksPerUnit)),
            packQtyOverride: Math.max(0, workshopNumber(req.body.packQtyOverride)),
            matrixPosName: String(req.body.matrixPosName || '').trim(),
            minStockQty: Math.max(0, workshopNumber(req.body.minStockQty)),
            materials: Array.isArray(req.body.materials) ? req.body.materials.map(item => ({
                material: item.materialId,
                qty: Math.max(0, workshopNumber(item.qty)),
                mode: item.mode === 'estimate' ? 'estimate' : 'strict'
            })).filter(item => item.material && item.qty >= 0) : [],
            components: Array.isArray(req.body.components) ? req.body.components.map(item => ({
                recipe: item.recipeId,
                qty: Math.max(0, workshopNumber(item.qty))
            })).filter(item => item.recipe && item.qty > 0) : [],
            active: req.body.active !== false,
            note: String(req.body.note || '').trim()
        };
        const recipe = await WorkshopRecipe.findByIdAndUpdate(req.params.id, payload, { new: true });
        if (!recipe) return res.status(404).json({ error: 'Рецептура не найдена' });
        res.json(convertToClient(recipe));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/workshop/recipes/:id', requireIsAdmin, async (req, res) => {
    try {
        const recipe = await WorkshopRecipe.findById(req.params.id);
        if (!recipe) return res.status(404).json({ error: 'Рецептура не найдена' });

        const [productionUsed, movementUsed, dealerUsed, componentUsed, memoUsed] = await Promise.all([
            WorkshopProduction.exists({ recipe: recipe._id }),
            WorkshopMovement.exists({ recipe: recipe._id }),
            WorkshopDealerAsset.exists({ recipe: recipe._id, qty: { $gt: 0 } }),
            WorkshopRecipe.exists({ 'components.recipe': recipe._id }),
            WorkshopMemo.exists({ 'lines.recipe': recipe._id })
        ]);
        if (productionUsed || movementUsed || dealerUsed || componentUsed || memoUsed || Math.abs(Number(recipe.stockQty) || 0) > 0.0001) {
            return res.status(400).json({ error: 'Рецептура уже участвует в учёте. Её можно редактировать или деактивировать, но нельзя удалить без нарушения истории.' });
        }
        await WorkshopRecipe.deleteOne({ _id: recipe._id });
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/workshop/memos', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        let number = String(req.body.number || '').trim();
        const inputLines = Array.isArray(req.body.lines) ? req.body.lines : [];
        if (!inputLines.length) return res.status(400).json({ error: 'Добавьте хотя бы одну позицию' });
        if (!number) {
            let seq = Math.max(1, (await WorkshopMemo.countDocuments()) + 1);
            while (!number) {
                const candidate = `ЦЕХ-${String(seq).padStart(4, '0')}`;
                const exists = await WorkshopMemo.exists({ number: candidate });
                if (!exists) number = candidate;
                else seq += 1;
            }
        }

        const lines = [];
        const seenProducts = new Set();
        for (const input of inputLines) {
            const requestedPacks = Math.max(0, Math.floor(workshopNumber(input.requestedPacks)));
            if (!input.productId || requestedPacks <= 0) continue;

            const product = await Product.findById(input.productId).lean();
            if (!product) continue;
            const productKey = String(product._id);
            if (seenProducts.has(productKey)) {
                return res.status(400).json({ error: `Позиция «${product.sku || product.name}» добавлена в служебку дважды` });
            }
            seenProducts.add(productKey);

            let recipe = null;
            if (input.recipeId) {
                recipe = await WorkshopRecipe.findOne({
                    _id: input.recipeId,
                    product: product._id,
                    active: { $ne: false }
                }).lean();
                if (!recipe) {
                    return res.status(400).json({ error: `Выбранная рецептура не подходит для «${product.sku || product.name}»` });
                }
            } else {
                const recipes = await WorkshopRecipe.find({
                    product: product._id,
                    active: { $ne: false },
                    planksPerUnit: { $gt: 0 }
                }).lean();
                recipe = recipes.find(item => item.outputType === 'sample')
                    || recipes.find(item => item.outputType === 'stand')
                    || recipes[0]
                    || null;
            }

            const packQty = workshopPackQty(product, recipe?.packQtyOverride || 0);
            if (packQty <= 0) {
                return res.status(400).json({ error: `У «${product.sku || product.name}» не заполнено количество планок в упаковке` });
            }
            const planksPerUnit = recipe ? Math.max(0, workshopNumber(recipe.planksPerUnit)) : 0;

            const totalPlanks = requestedPacks * packQty;
            const plannedOutputQty = planksPerUnit > 0 ? Math.floor(totalPlanks / planksPerUnit) : 0;
            const plannedRemainderPlanks = planksPerUnit > 0 ? totalPlanks - plannedOutputQty * planksPerUnit : totalPlanks;

            lines.push({
                product: product._id,
                recipe: recipe?._id || null,
                requestedPacks,
                plannedOutputQty,
                plannedRemainderPlanks,
                packQty,
                planksPerUnit,
                actualProduct: product._id,
                deliveredPacks: 0,
                checked: false,
                isMatch: false,
                discrepancyReason: ''
            });
        }

        if (!lines.length) return res.status(400).json({ error: 'Нет корректных позиций для служебной записки' });

        const memo = await WorkshopMemo.create({
            number,
            date: req.body.date || new Date(),
            lines,
            note: String(req.body.note || '').trim(),
            signedBy: String(req.body.signedBy || req.user?.fullName || req.user?.username || '').trim(),
            createdBy: workshopUser(req)
        });

        const populated = await WorkshopMemo.findById(memo._id)
            .populate('lines.product', 'sku name is_liquid characteristics.package_qty')
            .populate('lines.recipe', 'name outputType planksPerUnit')
            .lean();
        res.status(201).json(convertToClient(populated));
    } catch (e) {
        if (e && e.code === 11000) return res.status(400).json({ error: 'Служебная записка с таким номером уже существует' });
        res.status(400).json({ error: e.message });
    }
});

app.put('/api/workshop/memos/:id', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const memo = await WorkshopMemo.findById(req.params.id);
        if (!memo) return res.status(404).json({ error: 'Служебная записка не найдена' });
        if (memo.postedAt || memo.status === 'accepted') {
            return res.status(400).json({ error: 'Принятую служебную записку нельзя редактировать. Используйте корректировку/отмену.' });
        }

        const number = String(req.body.number || memo.number || '').trim();
        const inputLines = Array.isArray(req.body.lines) ? req.body.lines : [];
        if (!number) return res.status(400).json({ error: 'Укажите номер служебной записки' });
        if (!inputLines.length) return res.status(400).json({ error: 'Добавьте хотя бы одну позицию' });

        const duplicateNumber = await WorkshopMemo.exists({ number, _id: { $ne: memo._id } });
        if (duplicateNumber) return res.status(400).json({ error: 'Служебная записка с таким номером уже существует' });

        const seenProducts = new Set();
        const lines = [];
        for (const input of inputLines) {
            const requestedPacks = Math.max(0, Math.floor(workshopNumber(input.requestedPacks)));
            if (!input.productId || requestedPacks <= 0) continue;

            const product = await Product.findById(input.productId).lean();
            if (!product) continue;
            const productKey = String(product._id);
            if (seenProducts.has(productKey)) {
                return res.status(400).json({ error: `Позиция «${product.sku || product.name}» добавлена в служебку дважды` });
            }
            seenProducts.add(productKey);

            let recipe = null;
            if (input.recipeId) {
                recipe = await WorkshopRecipe.findOne({ _id: input.recipeId, product: product._id, active: { $ne: false } }).lean();
            }
            if (!recipe) {
                const recipes = await WorkshopRecipe.find({ product: product._id, active: { $ne: false }, planksPerUnit: { $gt: 0 } }).lean();
                recipe = recipes.find(item => item.outputType === 'sample') || recipes.find(item => item.outputType === 'stand') || recipes[0] || null;
            }
            const packQty = workshopPackQty(product, recipe?.packQtyOverride || 0);
            const planksPerUnit = recipe ? Math.max(0, workshopNumber(recipe.planksPerUnit)) : 0;
            if (packQty <= 0) {
                return res.status(400).json({ error: `У «${product.sku || product.name}» не заполнено количество планок в упаковке` });
            }

            const totalPlanks = requestedPacks * packQty;
            const plannedOutputQty = planksPerUnit > 0 ? Math.floor(totalPlanks / planksPerUnit) : 0;
            const plannedRemainderPlanks = planksPerUnit > 0 ? totalPlanks - plannedOutputQty * planksPerUnit : totalPlanks;
            lines.push({
                product: product._id,
                recipe: recipe?._id || null,
                requestedPacks,
                plannedOutputQty,
                plannedRemainderPlanks,
                packQty,
                planksPerUnit,
                actualProduct: product._id,
                deliveredPacks: 0,
                checked: false,
                isMatch: false,
                discrepancyReason: ''
            });
        }

        if (!lines.length) return res.status(400).json({ error: 'Нет корректных позиций' });

        memo.number = number;
        memo.date = req.body.date || memo.date || new Date();
        memo.lines = lines;
        memo.note = String(req.body.note || '').trim();
        memo.signedBy = String(req.body.signedBy || '').trim();
        memo.status = 'created';
        memo.receiptAttempts = [];
        await memo.save();

        const populated = await WorkshopMemo.findById(memo._id)
            .populate('lines.product', 'sku name is_liquid characteristics.package_qty')
            .populate('lines.recipe', 'name outputType planksPerUnit minStockQty stockQty')
            .lean();
        res.json(convertToClient(populated));
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.delete('/api/workshop/memos/:id', requireIsAdmin, async (req, res) => {
    try {
        const memo = await WorkshopMemo.findById(req.params.id);
        if (!memo) return res.status(404).json({ error: 'Служебная записка не найдена' });
        if (memo.postedAt || memo.status === 'accepted') {
            return res.status(400).json({ error: 'Проведённую служебную записку нельзя удалить напрямую: она уже изменила остатки.' });
        }
        const linkedProduction = await WorkshopProduction.exists({ memo: memo._id });
        if (linkedProduction) return res.status(400).json({ error: 'По этой служебке уже есть производство. Сначала отмените связанные операции.' });
        await WorkshopMemo.deleteOne({ _id: memo._id });
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/workshop/memos/:id/receive', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const memo = await WorkshopMemo.findById(req.params.id);
        if (!memo) return res.status(404).json({ error: 'Служебная записка не найдена' });
        if (memo.status === 'accepted' && memo.postedAt) {
            return res.status(400).json({ error: 'Эта служебная записка уже принята и оприходована' });
        }

        const submitted = Array.isArray(req.body.lines) ? req.body.lines : [];
        if (!submitted.length) return res.status(400).json({ error: 'Нет строк для сверки' });

        const attemptLines = [];
        let allMatch = true;

        for (const line of memo.lines) {
            const row = submitted.find(item => String(item.lineId || '') === String(line._id));
            const actualProductId = row?.actualProductId || line.product;
            const deliveredPacks = Math.max(0, Math.floor(workshopNumber(row?.deliveredPacks)));
            const checked = Boolean(row?.checked);
            const sameProduct = String(actualProductId || '') === String(line.product || '');
            const sameQty = deliveredPacks === Number(line.requestedPacks || 0);
            const isMatch = checked && sameProduct && sameQty;

            line.actualProduct = actualProductId || line.product;
            line.deliveredPacks = deliveredPacks;
            line.checked = checked;
            line.isMatch = isMatch;
            line.discrepancyReason = String(row?.discrepancyReason || '').trim();

            if (!isMatch) allMatch = false;
            attemptLines.push({
                lineId: String(line._id),
                expectedProductId: String(line.product || ''),
                actualProductId: String(line.actualProduct || ''),
                requestedPacks: Number(line.requestedPacks || 0),
                deliveredPacks,
                checked,
                isMatch,
                discrepancyReason: line.discrepancyReason
            });
        }

        memo.receiptAttempts.push({
            date: req.body.date || new Date(),
            status: allMatch ? 'accepted' : 'mismatch',
            lines: attemptLines,
            note: String(req.body.note || '').trim(),
            createdBy: workshopUser(req)
        });

        if (!allMatch) {
            memo.status = 'mismatch';
            await memo.save();
            const populated = await WorkshopMemo.findById(memo._id)
                .populate('lines.product', 'sku name is_liquid characteristics.package_qty')
                .populate('lines.actualProduct', 'sku name is_liquid characteristics.package_qty')
                .populate('lines.recipe', 'name outputType planksPerUnit')
                .lean();
            return res.status(200).json({
                accepted: false,
                status: 'mismatch',
                message: 'Есть расхождения. Упаковки пока не оприходованы — требуется обмен/повторная сверка.',
                memo: convertToClient(populated)
            });
        }

        if (!memo.postedAt) {
            for (const line of memo.lines) {
                const product = await Product.findById(line.product).lean();
                if (!product) throw new Error('Одна из позиций служебки больше не найдена в каталоге');
                const packQty = Number(line.packQty) > 0 ? Number(line.packQty) : workshopPackQty(product);
                const planksQty = Number(line.requestedPacks || 0) * packQty;
                await workshopChangeLaminate(line.product, planksQty);
                await WorkshopMovement.create({
                    date: req.body.date || new Date(),
                    type: 'laminate_receipt',
                    entityType: 'laminate',
                    product: line.product,
                    direction: 'in',
                    qty: planksQty,
                    unit: 'планка',
                    serviceMemoNumber: memo.number,
                    note: String(req.body.note || '').trim(),
                    meta: {
                        memoId: String(memo._id),
                        memoLineId: String(line._id),
                        requestedPacks: Number(line.requestedPacks || 0),
                        deliveredPacks: Number(line.deliveredPacks || 0),
                        packQty,
                        plannedOutputQty: Number(line.plannedOutputQty || 0)
                    },
                    createdBy: workshopUser(req)
                });
            }
            memo.postedAt = new Date();
        }

        memo.status = 'accepted';
        memo.acceptedAt = new Date();
        memo.acceptedBy = workshopUser(req);
        await memo.save();

        const populated = await WorkshopMemo.findById(memo._id)
            .populate('lines.product', 'sku name is_liquid characteristics.package_qty')
            .populate('lines.actualProduct', 'sku name is_liquid characteristics.package_qty')
            .populate('lines.recipe', 'name outputType planksPerUnit')
            .lean();

        res.json({
            accepted: true,
            status: 'accepted',
            message: 'Все позиции совпали. Упаковки оприходованы в цех.',
            memo: convertToClient(populated)
        });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/workshop/laminate-receipt', requirePermission('can_manage_workshop'), async (req, res) => {
    return res.status(400).json({
        error: 'Одиночный приход отключен. Ламинат принимается только целыми упаковками по многострочной служебной записке.'
    });
});

app.post('/api/workshop/production', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const recipe = await WorkshopRecipe.findById(req.body.recipeId)
            .populate('product')
            .populate('materials.material')
            .populate('components.recipe');
        if (!recipe) return res.status(404).json({ error: 'Рецептура не найдена' });

        let sourceMemo = null;
        let sourceMemoLine = null;
        if (req.body.memoId) {
            sourceMemo = await WorkshopMemo.findById(req.body.memoId).lean();
            if (!sourceMemo || sourceMemo.status !== 'accepted') {
                return res.status(400).json({ error: 'Можно привязать производство только к принятой служебной записке' });
            }
            sourceMemoLine = (sourceMemo.lines || []).find(line => String(line._id) === String(req.body.memoLineId || ''));
            if (!sourceMemoLine) return res.status(400).json({ error: 'Строка служебной записки не найдена' });
            if (recipe.product && String(sourceMemoLine.product) !== String(recipe.product._id)) {
                return res.status(400).json({ error: 'Ламинат рецептуры не совпадает с выбранной строкой служебки' });
            }
        }

        const outputQty = Math.max(0, workshopNumber(req.body.outputQty));
        const scrapPlanks = Math.max(0, workshopNumber(req.body.scrapPlanks));
        const acceptedPacks = Math.max(0, workshopNumber(req.body.acceptedPacks));
        const acceptedLoosePlanks = Math.max(0, workshopNumber(req.body.acceptedLoosePlanks));
        if (outputQty <= 0) return res.status(400).json({ error: 'Укажите количество изготовленных изделий' });

        const packQty = workshopPackQty(recipe.product, recipe.packQtyOverride);
        const standardPlanksPerUnit = Math.max(0, workshopNumber(recipe.planksPerUnit));
        const requestedActualNorm = Math.max(0, workshopNumber(req.body.actualPlanksPerUnit));
        const actualPlanksPerUnit = requestedActualNorm > 0 ? requestedActualNorm : standardPlanksPerUnit;
        const customNormReason = String(req.body.customNormReason || '').trim();
        const customOrderName = String(req.body.customOrderName || '').trim();
        const customDimensions = String(req.body.customDimensions || '').trim();
        if (requestedActualNorm > 0 && Math.abs(requestedActualNorm - standardPlanksPerUnit) > 0.0001 && !customNormReason) {
            return res.status(400).json({ error: 'При изменении стандартной нормы укажите причину (например, индивидуальный образец)' });
        }
        const usedForOutput = actualPlanksPerUnit * outputQty;
        const consumedPlanks = usedForOutput + scrapPlanks;
        const acceptedTotal = acceptedPacks * packQty + acceptedLoosePlanks;

        if (consumedPlanks > 0) {
            if (!recipe.product) return res.status(400).json({ error: 'Для этой рецептуры не выбран ламинат' });
            const stock = await WorkshopLaminateStock.findOne({ product: recipe.product._id }).lean();
            if ((Number(stock?.planksQty) || 0) < consumedPlanks) {
                return res.status(400).json({ error: 'Недостаточно планок ламината в остатках цеха' });
            }
        }

        for (const line of recipe.materials || []) {
            if (line.mode === 'estimate') continue;
            const need = (Number(line.qty) || 0) * outputQty;
            if (need > 0 && (Number(line.material?.stockQty) || 0) < need) {
                return res.status(400).json({ error: `Недостаточно материала «${line.material?.name || 'материал'}»` });
            }
        }

        for (const line of recipe.components || []) {
            const need = (Number(line.qty) || 0) * outputQty;
            if (need > 0 && (Number(line.recipe?.stockQty) || 0) < need) {
                return res.status(400).json({ error: `Недостаточно готовых компонентов «${line.recipe?.name || 'компонент'}»` });
            }
        }

        if (consumedPlanks > 0) {
            await workshopChangeLaminate(recipe.product._id, -consumedPlanks);
            await WorkshopMovement.create({
                date: req.body.date || new Date(), type: 'production_laminate',
                entityType: 'laminate', product: recipe.product._id, direction: 'out',
                qty: consumedPlanks, unit: 'планка', note: String(req.body.note || '').trim(),
                serviceMemoNumber: sourceMemo?.number || '',
                meta: { recipeId: recipe._id, outputQty, scrapPlanks, standardPlanksPerUnit, actualPlanksPerUnit, customNormReason, customOrderName, customDimensions, memoId: sourceMemo?._id || null, memoLineId: sourceMemoLine?._id || null }, createdBy: workshopUser(req)
            });
        }

        for (const line of recipe.materials || []) {
            const need = (Number(line.qty) || 0) * outputQty;
            if (line.mode === 'estimate') {
                if (need > 0) {
                    await WorkshopMovement.create({
                        date: req.body.date || new Date(), type: 'production_material_estimate',
                        entityType: 'material', material: line.material._id, direction: 'neutral',
                        qty: need, unit: line.material.unit || 'шт',
                        note: 'Расчетный расход; фактический остаток автоматически не уменьшается',
                        meta: { recipeId: recipe._id, outputQty, estimate: true }, createdBy: workshopUser(req)
                    });
                }
                continue;
            }
            if (need <= 0) continue;
            await workshopChangeMaterial(line.material._id, -need);
            await WorkshopMovement.create({
                date: req.body.date || new Date(), type: 'production_material',
                entityType: 'material', material: line.material._id, direction: 'out',
                qty: need, unit: line.material.unit || 'шт',
                meta: { recipeId: recipe._id, outputQty }, createdBy: workshopUser(req)
            });
        }

        for (const line of recipe.components || []) {
            const need = (Number(line.qty) || 0) * outputQty;
            if (need <= 0) continue;
            await workshopChangeRecipe(line.recipe._id, -need);
            await WorkshopMovement.create({
                date: req.body.date || new Date(), type: 'production_component',
                entityType: 'finished', recipe: line.recipe._id, direction: 'out',
                qty: need, unit: 'шт', meta: { recipeId: recipe._id, outputQty },
                createdBy: workshopUser(req)
            });
        }

        const resultStock = await workshopChangeRecipe(recipe._id, outputQty);
        await WorkshopMovement.create({
            date: req.body.date || new Date(), type: 'production_output',
            entityType: 'finished', recipe: recipe._id, direction: 'in',
            qty: outputQty, unit: 'шт', note: String(req.body.note || '').trim(),
            serviceMemoNumber: sourceMemo?.number || '',
            meta: { acceptedPacks, acceptedLoosePlanks, acceptedTotal, packQty, consumedPlanks, scrapPlanks, memoId: sourceMemo?._id || null, memoLineId: sourceMemoLine?._id || null },
            createdBy: workshopUser(req)
        });

        const production = await WorkshopProduction.create({
            date: req.body.date || new Date(),
            recipe: recipe._id,
            product: recipe.product?._id || null,
            memo: sourceMemo?._id || null,
            memoLineId: sourceMemoLine?._id ? String(sourceMemoLine._id) : '',
            serviceMemoNumber: sourceMemo?.number || '',
            acceptedPacks,
            acceptedLoosePlanks,
            packQty,
            totalAcceptedPlanks: acceptedTotal,
            outputQty,
            standardPlanksPerUnit,
            actualPlanksPerUnit,
            customNormReason,
            customOrderName,
            customDimensions,
            consumedPlanks,
            scrapPlanks,
            operations: Array.isArray(req.body.operations)
                ? req.body.operations.map(item => ({
                    type: String(item.type || '').trim(),
                    qty: Math.max(0, workshopNumber(item.qty)),
                    note: String(item.note || '').trim()
                })).filter(item => item.type)
                : [],
            note: String(req.body.note || '').trim(),
            createdBy: workshopUser(req)
        });

        res.status(201).json({ production: convertToClient(production), stock: convertToClient(resultStock) });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.put('/api/workshop/productions/:id', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const production = await WorkshopProduction.findById(req.params.id);
        if (!production) return res.status(404).json({ error: 'Запись производства не найдена' });
        if (production.cancelledAt) return res.status(400).json({ error: 'Отменённую запись нельзя редактировать' });

        production.date = req.body.date || production.date;
        production.note = String(req.body.note ?? production.note ?? '').trim();
        production.customOrderName = String(req.body.customOrderName ?? production.customOrderName ?? '').trim();
        production.customDimensions = String(req.body.customDimensions ?? production.customDimensions ?? '').trim();
        production.customNormReason = String(req.body.customNormReason ?? production.customNormReason ?? '').trim();
        if (Array.isArray(req.body.operations)) {
            production.operations = req.body.operations.map(item => ({
                type: String(item.type || '').trim(),
                qty: Math.max(0, workshopNumber(item.qty)),
                note: String(item.note || '').trim()
            })).filter(item => item.type);
        }
        await production.save();
        res.json(convertToClient(production));
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.delete('/api/workshop/productions/:id', requireIsAdmin, async (req, res) => {
    try {
        const production = await WorkshopProduction.findById(req.params.id)
            .populate({
                path: 'recipe',
                populate: [
                    { path: 'materials.material' },
                    { path: 'components.recipe' }
                ]
            })
            .populate('product');
        if (!production) return res.status(404).json({ error: 'Запись производства не найдена' });
        if (production.cancelledAt) return res.status(400).json({ error: 'Эта запись уже отменена' });

        const recipe = production.recipe;
        if (!recipe) return res.status(400).json({ error: 'Рецептура производства не найдена' });
        const outputQty = Number(production.outputQty) || 0;

        if ((Number(recipe.stockQty) || 0) + 1e-9 < outputQty) {
            return res.status(400).json({ error: 'Нельзя отменить производство: часть изготовленных изделий уже выдана или использована.' });
        }

        if (outputQty > 0) await workshopChangeRecipe(recipe._id, -outputQty);
        if (production.product && Number(production.consumedPlanks) > 0) {
            await workshopChangeLaminate(production.product._id, Number(production.consumedPlanks));
        }

        for (const line of recipe.materials || []) {
            if (line.mode === 'estimate') continue;
            const qty = (Number(line.qty) || 0) * outputQty;
            if (qty > 0 && line.material?._id) await workshopChangeMaterial(line.material._id, qty);
        }
        for (const line of recipe.components || []) {
            const qty = (Number(line.qty) || 0) * outputQty;
            if (qty > 0 && line.recipe?._id) await workshopChangeRecipe(line.recipe._id, qty);
        }

        await WorkshopMovement.create({
            date: new Date(),
            type: 'production_cancelled',
            entityType: 'finished',
            recipe: recipe._id,
            direction: 'out',
            qty: outputQty,
            unit: 'шт',
            serviceMemoNumber: production.serviceMemoNumber || '',
            note: String(req.body?.reason || 'Отмена записи производства администратором'),
            meta: {
                productionId: String(production._id),
                restoredPlanks: Number(production.consumedPlanks) || 0,
                cancellation: true
            },
            createdBy: workshopUser(req)
        });

        production.cancelledAt = new Date();
        production.cancelledBy = workshopUser(req);
        production.cancelReason = String(req.body?.reason || '').trim();
        await production.save();

        res.json({ status: 'ok' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/workshop/writeoff', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const entityType = req.body.entityType;
        const qty = Math.abs(workshopNumber(req.body.qty));
        const serviceMemoNumber = String(req.body.serviceMemoNumber || '').trim();
        if (qty <= 0) return res.status(400).json({ error: 'Укажите количество списания' });
        if (!serviceMemoNumber) return res.status(400).json({ error: 'Для списания укажите номер служебной записки' });

        let movementData = {
            date: req.body.date || new Date(), type: 'writeoff', entityType,
            direction: 'out', qty, serviceMemoNumber,
            note: String(req.body.note || '').trim(), createdBy: workshopUser(req)
        };

        if (entityType === 'laminate') {
            await workshopChangeLaminate(req.body.productId, -qty);
            movementData.product = req.body.productId;
            movementData.unit = 'планка';
        } else if (entityType === 'material') {
            const material = await workshopChangeMaterial(req.body.materialId, -qty);
            movementData.material = req.body.materialId;
            movementData.unit = material.unit || 'шт';
        } else if (entityType === 'finished') {
            await workshopChangeRecipe(req.body.recipeId, -qty);
            movementData.recipe = req.body.recipeId;
            movementData.unit = 'шт';
        } else {
            return res.status(400).json({ error: 'Неизвестный тип списания' });
        }

        const movement = await WorkshopMovement.create(movementData);
        res.status(201).json(convertToClient(movement));
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/workshop/dealer-movement', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const dealerId = req.body.dealerId;
        const recipeId = req.body.recipeId;
        const action = req.body.action || 'issue';
        const qty = Math.abs(workshopNumber(req.body.qty));
        if (!dealerId || !recipeId || qty <= 0) return res.status(400).json({ error: 'Выберите дилера, изделие и количество' });

        const [dealer, recipe] = await Promise.all([
            Dealer.findById(dealerId).select('_id name'),
            WorkshopRecipe.findById(recipeId)
        ]);
        if (!dealer) return res.status(404).json({ error: 'Дилер не найден' });
        if (!recipe) return res.status(404).json({ error: 'Изделие не найдено' });

        let asset = await WorkshopDealerAsset.findOne({ dealer: dealerId, recipe: recipeId });
        if (!asset) asset = new WorkshopDealerAsset({ dealer: dealerId, recipe: recipeId, qty: 0 });

        const condition = req.body.returnCondition || 'defect';
        let issued = 0;
        let returned = 0;

        if (action === 'issue') {
            if (Number(recipe.stockQty) < qty) return res.status(400).json({ error: 'Недостаточно готовых изделий в цехе' });
            await workshopChangeRecipe(recipeId, -qty);
            asset.qty += qty;
            issued = qty;
        } else if (action === 'return') {
            if (Number(asset.qty) < qty) return res.status(400).json({ error: 'У дилера числится меньше изделий' });
            asset.qty -= qty;
            returned = qty;
            if (condition === 'reusable') await workshopChangeRecipe(recipeId, qty);
        } else if (action === 'replacement') {
            const returnQty = Math.abs(workshopNumber(req.body.returnQty || qty));
            const issueQty = Math.abs(workshopNumber(req.body.issueQty || qty));
            if (Number(asset.qty) < returnQty) return res.status(400).json({ error: 'У дилера числится меньше изделий для возврата' });
            if (Number(recipe.stockQty) < issueQty) return res.status(400).json({ error: 'Недостаточно изделий для замены' });
            asset.qty = Number(asset.qty) - returnQty + issueQty;
            await workshopChangeRecipe(recipeId, -issueQty);
            if (condition === 'reusable') await workshopChangeRecipe(recipeId, returnQty);
            returned = returnQty;
            issued = issueQty;
        } else {
            return res.status(400).json({ error: 'Неизвестная операция с дилером' });
        }

        asset.qty = Math.max(0, Number(asset.qty) || 0);
        await asset.save();

        const movement = await WorkshopMovement.create({
            date: req.body.date || new Date(),
            type: `dealer_${action}`,
            entityType: 'finished',
            recipe: recipeId,
            dealer: dealerId,
            direction: action === 'return' ? 'in' : action === 'issue' ? 'out' : 'neutral',
            qty,
            unit: 'шт',
            note: String(req.body.note || '').trim(),
            meta: { issued, returned, returnCondition: condition, reason: String(req.body.reason || '').trim() },
            createdBy: workshopUser(req)
        });

        await syncWorkshopPosToDealer(dealerId, recipeId);
        res.status(201).json({ asset: convertToClient(asset), movement: convertToClient(movement) });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.get('/api/workshop/dealers/:dealerId/assets', requireAnyPermission('can_view_workshop', 'can_view_dealers'), async (req, res) => {
    try {
        const assets = await WorkshopDealerAsset.find({ dealer: req.params.dealerId, qty: { $gt: 0 } })
            .populate({ path: 'recipe', populate: { path: 'product', select: 'sku name is_liquid' } })
            .sort({ updatedAt: -1 }).lean();
        res.json(assets.map(convertToClient));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/workshop/opening-balance', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const location = req.body.location === 'dealer' ? 'dealer' : 'workshop';
        const inputLines = Array.isArray(req.body.lines) ? req.body.lines : [];
        const date = req.body.date || new Date();
        const note = String(req.body.note || '').trim();
        if (!inputLines.length) return res.status(400).json({ error: 'Укажите хотя бы один фактический остаток' });

        let dealer = null;
        if (location === 'dealer') {
            if (!req.body.dealerId) return res.status(400).json({ error: 'Выберите дилера' });
            dealer = await Dealer.findOne({
                _id: req.body.dealerId,
                ...getWorkingDealerFilter(getDealerFilter(req))
            }).select('_id name');
            if (!dealer) return res.status(404).json({ error: 'Дилер не найден или недоступен' });
        }

        const changed = [];
        for (const line of inputLines) {
            let recipe = null;
            if (line.recipeId) {
                recipe = await WorkshopRecipe.findOne({ _id: line.recipeId, active: { $ne: false } });
            } else if (line.productId) {
                const product = await Product.findById(line.productId).lean();
                if (!product) continue;

                const posDef = workshopPosDefinition({ product });
                if (posDef?.recipeSku) {
                    recipe = await WorkshopRecipe.findOne({ sku:posDef.recipeSku, active:{ $ne:false } });
                } else {
                    recipe = await WorkshopRecipe.findOne({
                        product: product._id,
                        outputType: 'sample',
                        active: { $ne: false }
                    });
                    if (!recipe) {
                        recipe = await WorkshopRecipe.create({
                            name: `Планшет ${product.sku || ''} ${product.name || ''}`.trim(),
                            outputType: 'sample',
                            sku: `SAMPLE-${product.sku || String(product._id).slice(-6)}`,
                            product: product._id,
                            planksPerUnit: 0,
                            packQtyOverride: 0,
                            stockQty: 0,
                            minStockQty: 0,
                            active: true,
                            note: 'Создано автоматически при вводе стартовых остатков. Норму производства можно заполнить позже.'
                        });
                    }
                }
            }
            if (!recipe) continue;

            const actualQty = Math.max(0, workshopNumber(line.actualQty));
            const lineNote = String(line.note || '').trim();

            if (location === 'workshop') {
                const previousQty = Number(recipe.stockQty) || 0;
                const delta = actualQty - previousQty;
                if (Math.abs(delta) <= 0.0001) continue;

                await workshopChangeRecipe(recipe._id, delta);
                await WorkshopMovement.create({
                    date,
                    type: 'opening_balance',
                    entityType: 'finished',
                    recipe: recipe._id,
                    direction: delta > 0 ? 'in' : 'out',
                    qty: Math.abs(delta),
                    unit: 'шт',
                    note: lineNote || note || 'Стартовый остаток готовых образцов до начала учёта в CRM',
                    meta: { previousQty, actualQty, delta, source: 'legacy_opening_balance' },
                    createdBy: workshopUser(req)
                });
                changed.push({ recipeId: String(recipe._id), previousQty, actualQty, delta });
            } else {
                let asset = await WorkshopDealerAsset.findOne({ dealer: dealer._id, recipe: recipe._id });
                const previousQty = Number(asset?.qty) || 0;
                const delta = actualQty - previousQty;
                if (Math.abs(delta) <= 0.0001) continue;

                if (!asset) asset = new WorkshopDealerAsset({ dealer: dealer._id, recipe: recipe._id, qty: 0 });
                asset.qty = actualQty;
                await asset.save();

                await WorkshopMovement.create({
                    date,
                    type: 'opening_dealer_balance',
                    entityType: 'finished',
                    recipe: recipe._id,
                    dealer: dealer._id,
                    direction: 'neutral',
                    qty: Math.abs(delta),
                    unit: 'шт',
                    note: lineNote || note || 'Образцы уже находились у дилера до начала учёта в CRM',
                    meta: { previousQty, actualQty, delta, source: 'legacy_opening_balance' },
                    createdBy: workshopUser(req)
                });
                await syncWorkshopPosToDealer(dealer._id, recipe._id);
                changed.push({ recipeId: String(recipe._id), previousQty, actualQty, delta });
            }
        }

        if (!changed.length) return res.status(400).json({ error: 'Фактические остатки не отличаются от текущих' });
        res.status(201).json({
            status: 'ok',
            location,
            dealerId: dealer ? String(dealer._id) : '',
            changed
        });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/workshop/correction', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const reason = String(req.body.reason || '').trim();
        const inputLines = Array.isArray(req.body.lines) ? req.body.lines.slice(0, 10) : [];
        if (reason.length < 3) return res.status(400).json({ error: 'Укажите причину исправления' });
        if (!inputLines.length) return res.status(400).json({ error: 'Добавьте хотя бы одну позицию' });

        const prepared = [];
        const seen = new Set();

        for (const line of inputLines) {
            const entityType = String(line.entityType || '').trim();
            const id = String(line.id || '').trim();
            const actualQty = Math.max(0, workshopNumber(line.actualQty));
            if (!['finished','laminate','material'].includes(entityType) || !id) {
                return res.status(400).json({ error: 'Некорректная позиция для исправления' });
            }

            const key = entityType + ':' + id;
            if (seen.has(key)) return res.status(400).json({ error: 'Одна и та же позиция добавлена дважды' });
            seen.add(key);

            if (entityType === 'finished') {
                const item = await WorkshopRecipe.findById(id).lean();
                if (!item) return res.status(404).json({ error: 'Готовое изделие не найдено' });
                prepared.push({
                    entityType, id, actualQty,
                    previousQty: Math.max(0, Number(item.stockQty) || 0),
                    unit: 'шт',
                    name: item.name || 'Готовое изделие',
                    recipe: id
                });
            } else if (entityType === 'material') {
                const item = await WorkshopMaterial.findById(id).lean();
                if (!item) return res.status(404).json({ error: 'Материал не найден' });
                prepared.push({
                    entityType, id, actualQty,
                    previousQty: Math.max(0, Number(item.stockQty) || 0),
                    unit: item.unit || 'шт',
                    name: item.name || 'Материал',
                    material: id
                });
            } else {
                const product = await Product.findById(id).select('sku name').lean();
                if (!product) return res.status(404).json({ error: 'Ламинат не найден' });
                const stock = await WorkshopLaminateStock.findOne({ product: id }).lean();
                prepared.push({
                    entityType, id, actualQty,
                    previousQty: Math.max(0, Number(stock?.planksQty) || 0),
                    unit: 'планка',
                    name: [product.sku, product.name].filter(Boolean).join(' · ') || 'Ламинат',
                    product: id
                });
            }
        }

        const changed = prepared
            .map(item => ({ ...item, delta: item.actualQty - item.previousQty }))
            .filter(item => Math.abs(item.delta) > 0.0001);

        if (!changed.length) return res.status(400).json({ error: 'Новые остатки совпадают с текущими' });

        const savedLines = [];
        for (const item of changed) {
            if (item.entityType === 'finished') {
                await WorkshopRecipe.updateOne({ _id: item.id }, { $set: { stockQty: item.actualQty } });
            } else if (item.entityType === 'material') {
                await WorkshopMaterial.updateOne({ _id: item.id }, { $set: { stockQty: item.actualQty } });
            } else {
                await WorkshopLaminateStock.findOneAndUpdate(
                    { product: item.id },
                    { $set: { planksQty: item.actualQty } },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            }

            await WorkshopMovement.create({
                date: req.body.date || new Date(),
                type: 'manual_correction',
                entityType: item.entityType,
                product: item.product || null,
                material: item.material || null,
                recipe: item.recipe || null,
                direction: item.delta > 0 ? 'in' : 'out',
                qty: Math.abs(item.delta),
                unit: item.unit,
                note: reason,
                meta: {
                    previousQty: item.previousQty,
                    actualQty: item.actualQty,
                    delta: item.delta,
                    reason,
                    source: 'manual_correction'
                },
                createdBy: workshopUser(req)
            });

            savedLines.push({
                entityType: item.entityType,
                product: item.product || null,
                material: item.material || null,
                recipe: item.recipe || null,
                systemQty: item.previousQty,
                actualQty: item.actualQty,
                delta: item.delta,
                note: reason
            });
        }

        await WorkshopStocktake.create({
            date: req.body.date || new Date(),
            lines: savedLines,
            note: 'Корректировка остатка: ' + reason,
            createdBy: workshopUser(req)
        });

        res.status(201).json({
            status: 'ok',
            reason,
            changed: changed.map(item => ({
                entityType: item.entityType,
                id: item.id,
                name: item.name,
                previousQty: item.previousQty,
                actualQty: item.actualQty,
                delta: item.delta,
                unit: item.unit
            }))
        });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/workshop/stocktake', requirePermission('can_manage_workshop'), async (req, res) => {
    try {
        const inputLines = Array.isArray(req.body.lines) ? req.body.lines : [];
        if (!inputLines.length) return res.status(400).json({ error: 'Добавьте позиции инвентаризации' });
        const savedLines = [];

        for (const line of inputLines) {
            const actualQty = Math.max(0, workshopNumber(line.actualQty));
            let systemQty = 0;
            let delta = 0;
            let movement = null;

            if (line.entityType === 'laminate' && line.productId) {
                const current = await WorkshopLaminateStock.findOne({ product: line.productId }).lean();
                systemQty = Number(current?.planksQty) || 0;
                delta = actualQty - systemQty;
                if (Math.abs(delta) > 0.0001) {
                    await workshopChangeLaminate(line.productId, delta);
                    movement = { entityType:'laminate', product:line.productId, unit:'планка' };
                }
                savedLines.push({ entityType:'laminate', product:line.productId, systemQty, actualQty, delta, note:line.note || '' });
            } else if (line.entityType === 'material' && line.materialId) {
                const current = await WorkshopMaterial.findById(line.materialId).lean();
                if (!current) continue;
                systemQty = Number(current.stockQty) || 0;
                delta = actualQty - systemQty;
                if (Math.abs(delta) > 0.0001) {
                    await workshopChangeMaterial(line.materialId, delta);
                    movement = { entityType:'material', material:line.materialId, unit:current.unit || 'шт' };
                }
                savedLines.push({ entityType:'material', material:line.materialId, systemQty, actualQty, delta, note:line.note || '' });
            } else if (line.entityType === 'finished' && line.recipeId) {
                const current = await WorkshopRecipe.findById(line.recipeId).lean();
                if (!current) continue;
                systemQty = Number(current.stockQty) || 0;
                delta = actualQty - systemQty;
                if (Math.abs(delta) > 0.0001) {
                    await workshopChangeRecipe(line.recipeId, delta);
                    movement = { entityType:'finished', recipe:line.recipeId, unit:'шт' };
                }
                savedLines.push({ entityType:'finished', recipe:line.recipeId, systemQty, actualQty, delta, note:line.note || '' });
            }

            if (movement && Math.abs(delta) > 0.0001) {
                await WorkshopMovement.create({
                    date: req.body.date || new Date(),
                    type: 'stocktake_adjustment',
                    ...movement,
                    direction: delta > 0 ? 'in' : 'out',
                    qty: Math.abs(delta),
                    note: line.note || '',
                    meta: { systemQty, actualQty, delta },
                    createdBy: workshopUser(req)
                });
            }
        }

        const stocktake = await WorkshopStocktake.create({
            date: req.body.date || new Date(),
            lines: savedLines,
            note: String(req.body.note || '').trim(),
            createdBy: workshopUser(req)
        });
        res.status(201).json(convertToClient(stocktake));
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.get('/api/reclamations/dashboard', requirePermission('can_view_reclamations'), async (req, res) => {
    try {
        const dealerIds = await getScopedDealerIds(req);
        const query = {
            $or: [
                { resolution: { $exists: false } },
                { resolution: null },
                { resolution: '' }
            ]
        };
        if (dealerIds) query.dealerId = { $in: dealerIds };

        const list = await Reclamation.find(query)
            .select('dealerId dealerName resolution createdAt date')
            .sort({ createdAt: -1 })
            .lean();
        res.json(list.map(convertToClient));
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/reclamations', requirePermission('can_view_reclamations'), async (req, res) => {
    try {
        const dealerIds = await getScopedDealerIds(req);
        const pipeline = [];
        if (dealerIds) pipeline.push({ $match: { dealerId: { $in: dealerIds } } });
        pipeline.push(
            { $sort: { createdAt: -1 } },
            { $project: {
                dealerId: 1,
                dealerName: 1,
                date: 1,
                productName: 1,
                purchasedVolume: 1,
                description: 1,
                clientDemand: 1,
                resolution: 1,
                invoiceNumber: 1,
                clientName: 1,
                defectVolume: 1,
                compensationAmount: 1,
                createdAt: 1,
                updatedAt: 1,
                photoCount: { $size: { $ifNull: ['$photos', []] } }
            } }
        );
        const list = await Reclamation.aggregate(pipeline);
        res.json(list.map(item => ({ ...item, id: String(item._id), _id: undefined })));
    } catch(e) { res.status(500).json({error: e.message}); }
});
app.get('/api/reclamations/:id', requirePermission('can_view_reclamations'), async (req, res) => {
    try {
        const dealerIds = await getScopedDealerIds(req);
        const query = { _id: req.params.id };
        if (dealerIds) query.dealerId = { $in: dealerIds };
        const item = await Reclamation.findOne(query).lean();
        if (!item) return res.status(404).json({ error: 'Рекламация не найдена' });
        res.json(convertToClient(item));
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/reclamations', requirePermission('can_manage_reclamations'), async (req, res) => {
    try { 
        const r = new Reclamation(req.body); 
        await r.save(); 
        res.json(convertToClient(r)); 
    } catch(e) { res.status(500).json({error: e.message}); }
});
app.put('/api/reclamations/:id', requirePermission('can_manage_reclamations'), async (req, res) => {
    try { 
        const r = await Reclamation.findByIdAndUpdate(req.params.id, req.body, { new: true }); 
        res.json(convertToClient(r)); 
    } catch(e) { res.status(500).json({error: e.message}); }
});
app.delete('/api/reclamations/:id', requirePermission('can_manage_reclamations'), async (req, res) => {
    try { 
        await Reclamation.findByIdAndDelete(req.params.id); 
        res.json({status: 'deleted'}); 
    } catch(e) { res.status(500).json({error: e.message}); }
});

const priceControl = require('./server/price-control').install({app,mongoose,Dealer,requireAnyPermission,requirePermission,getDealerFilter,isGlobalViewer,hasPermission,today:pricingTodayKey});

serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server port ${PORT}`);
    connectToDB().catch(err => console.error('Initial DB connection error:', err));
});

serverInstance.keepAliveTimeout = 65000;
serverInstance.headersTimeout = 66000;
serverInstance.requestTimeout = 120000;

async function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    gmailStockSync.stop();
    telegramNotifications.stop();
    appReady = false;
    console.log(`${signal} received, shutting down gracefully`);

    if (dbReconnectTimer) {
        clearTimeout(dbReconnectTimer);
        dbReconnectTimer = null;
    }

    const forceExit = setTimeout(() => {
        console.error('Graceful shutdown timeout exceeded');
        process.exit(1);
    }, 15000);
    forceExit.unref?.();

    try {
        if (serverInstance) {
            await new Promise(resolve => serverInstance.close(() => resolve()));
        }
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close(false);
        }
        clearTimeout(forceExit);
        process.exit(0);
    } catch (err) {
        console.error('Graceful shutdown error:', err);
        process.exit(1);
    }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', reason => {
    console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', err => {
    console.error('Uncaught exception:', err);
    appReady = false;
});

