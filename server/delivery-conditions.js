'use strict';

function cleanName(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 700) {
        throw Object.assign(Error('Укажите условия доставки и оплаты, до 700 символов'), { status: 400 });
    }
    return value.trim();
}
function cleanPart(value, label) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') throw Object.assign(Error('Некорректное поле «' + label + '»'), { status: 400 });
    return value.replace(/\s+/g, ' ').trim();
}
function makeConditionName(deliveryPart, paymentPart) {
    const delivery = cleanPart(deliveryPart, 'Доставка');
    const payment = cleanPart(paymentPart, 'Оплата');
    const name = [
        delivery ? 'Доставка: ' + delivery : '',
        payment ? 'Оплата: ' + payment : ''
    ].filter(Boolean).join(' · ');
    return cleanName(name);
}
function conditionPayload(body = {}, before = null) {
    const hasParts = Object.prototype.hasOwnProperty.call(body, 'deliveryPart') ||
                     Object.prototype.hasOwnProperty.call(body, 'paymentPart');
    if (hasParts) {
        const deliveryPart = cleanPart(body.deliveryPart, 'Доставка');
        const paymentPart = cleanPart(body.paymentPart, 'Оплата');
        return { name: makeConditionName(deliveryPart, paymentPart), deliveryPart, paymentPart };
    }
    if (body.name !== undefined) {
        const name = cleanName(body.name);
        return { name, deliveryPart: name, paymentPart: '' };
    }
    if (before) {
        return {
            name: before.name,
            deliveryPart: typeof before.deliveryPart === 'string' ? before.deliveryPart : before.name,
            paymentPart: before.paymentPart || ''
        };
    }
    throw Object.assign(Error('Заполните доставку или оплату'), { status: 400 });
}
function combine(records, values) {
    const rows = records.map(r => ({
        id: String(r._id),
        name: r.name,
        active: r.active !== false,
        aliases: r.aliases || [],
        deliveryPart: typeof r.deliveryPart === 'string' ? r.deliveryPart : r.name,
        paymentPart: r.paymentPart || '',
        usage: 0,
        legacy: typeof r.deliveryPart !== 'string'
    }));
    const byValue = new Map();
    for (const row of rows) for (const value of [row.name, ...row.aliases]) byValue.set(value, row);
    // Existing free-form values stay in dealer profiles; they are not auto-imported into the catalog.
    for (const value of values) {
        if (typeof value !== 'string' || !value.trim()) continue;
        const match = byValue.get(value);
        if (match) match.usage++;
    }
    return rows.sort((a,b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'ru'));
}

function install({ app, mongoose, Dealer, AuditLog, hasPermission, isAdminUser, getDealerFilter }) {
    const schema = new mongoose.Schema({
        name: { type: String, required: true, unique: true },
        deliveryPart: { type: String, default: '' },
        paymentPart: { type: String, default: '' },
        aliases: { type: [String], default: [] },
        active: { type: Boolean, default: true },
        keys: { type: [String], default: undefined }
    }, { timestamps: true });
    schema.index({ keys: 1 }, { unique: true, sparse: true });
    const Condition = mongoose.model('DeliveryCondition', schema);

    const read = (req,res,next) => !req.user?.id
        ? res.status(401).json({ error: 'Требуется вход' })
        : !['can_view_dealers','can_create_dealer','can_edit_dealer','can_view_pricing','can_manage_pricing'].some(p => hasPermission(req,p))
            ? res.status(403).json({ error: 'Нет доступа к условиям доставки' })
            : (res.set('Cache-Control', 'no-store'), next());
    const manage = (req,res,next) => isAdminUser(req)
        ? next()
        : res.status(403).json({ error: 'Справочник условий изменяет администратор' });
    const fail = (res,error) => res.status(error.status || (error.code === 11000 ? 409 : 503)).json({
        error: error.code === 11000 ? 'Такой вариант уже существует' :
               error.status ? error.message : 'Не удалось сохранить справочник. Повторите позже.'
    });
    async function log(req,item,action) {
        await AuditLog.create({
            actor: { id:req.user.id, name:req.user.fullName || req.user.username, role:req.user.role },
            module:'delivery-conditions', action, entityType:'delivery_condition',
            entityId:String(item._id),
            summary:action === 'delivery_archive' ? 'Архивировал условия доставки и оплаты'
                : action === 'delivery_restore' ? 'Вернул условия доставки и оплаты из архива'
                : 'Сохранил условия доставки и оплаты',
            success:true
        }).catch(() => {});
    }

    app.get('/api/delivery-conditions', read, async(req,res) => {
        try {
            const [records, dealers] = await Promise.all([
                Condition.find().select('name aliases active deliveryPart paymentPart').limit(2001).lean(),
                Dealer.find(getDealerFilter(req)).select('delivery').limit(20001).lean()
            ]);
            if (records.length > 2000 || dealers.length > 20000) {
                return res.status(503).json({ error:'Справочник слишком большой для полной загрузки' });
            }
            res.json({ canManage:isAdminUser(req), items:combine(records, dealers.map(d => d.delivery)) });
        } catch(e) { fail(res,e); }
    });

    app.post('/api/delivery-conditions', read, manage, async(req,res) => {
        try {
            const payload = conditionPayload(req.body || {});
            if (req.body?.active !== undefined && typeof req.body.active !== 'boolean') {
                return res.status(400).json({ error:'Некорректное состояние архива' });
            }
            const legacyName = req.body?.legacyName;
            if (legacyName !== undefined &&
                (typeof legacyName !== 'string' || legacyName.length > 2000 ||
                 !await Dealer.findOne({ $and:[getDealerFilter(req), { delivery:legacyName }] }).select('_id').lean())) {
                return res.status(409).json({ error:'Исходные условия больше не найдены. Обновите справочник.' });
            }
            const reserved = [payload.name, ...(legacyName ? [legacyName] : [])];
            const existing = await Condition.findOne({
                $or:[{ name:{ $in:reserved } }, { aliases:{ $in:reserved } }]
            }).lean();
            if (existing) return res.status(409).json({ error:'Такой вариант уже есть в справочнике, включая архив и прежние названия' });
            const aliases = legacyName && legacyName !== payload.name ? [legacyName] : [];
            const item = await Condition.create({
                ...payload, aliases, keys:[...new Set([payload.name, ...aliases])],
                active:req.body?.active !== false
            });
            await log(req,item,item.active ? 'delivery_save' : 'delivery_archive');
            res.status(201).json({ id:String(item._id) });
        } catch(e) { fail(res,e); }
    });

    app.patch('/api/delivery-conditions/:id', read, manage, async(req,res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).json({ error:'Некорректный вариант' });
            }
            const before = await Condition.findById(req.params.id).lean();
            if (!before) return res.status(404).json({ error:'Вариант не найден' });
            const payload = conditionPayload(req.body || {}, before);
            const active = req.body?.active === undefined ? before.active !== false : req.body.active;
            if (typeof active !== 'boolean') return res.status(400).json({ error:'Некорректное состояние архива' });

            const aliases = [...new Set([
                ...(before.aliases || []),
                ...(payload.name !== before.name ? [before.name] : [])
            ])].filter(value => value !== payload.name);
            const reserved = [payload.name, ...aliases];
            const conflict = await Condition.findOne({
                _id:{ $ne:before._id },
                $or:[{name:{ $in:reserved }}, {aliases:{ $in:reserved }}]
            }).lean();
            if (conflict) return res.status(409).json({ error:'Это название используется другим вариантом' });
            const item = await Condition.findOneAndUpdate(
                { _id:before._id, name:before.name, updatedAt:before.updatedAt },
                { $set:{...payload, active, aliases, keys:reserved} },
                { new:true }
            ).lean();
            if (!item) return res.status(409).json({ error:'Вариант уже изменён. Обновите справочник.' });
            await log(req,item,active === (before.active !== false) ? 'delivery_save' : active ? 'delivery_restore' : 'delivery_archive');
            res.json({id:String(item._id)});
        } catch(e) { fail(res,e); }
    });

    return {Condition};
}
module.exports = { install, combine, cleanName, cleanPart, makeConditionName, conditionPayload };
