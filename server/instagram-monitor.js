'use strict';

const crypto = require('crypto');

function installInstagramMonitor(options) {
    const {
        app, mongoose, Dealer, User, requireAdmin, requirePermission,
        getDealerFilter, origin
    } = options;

    const pageSchema = new mongoose.Schema({
        pageId: { type: String, required: true },
        pageName: { type: String, default: '' },
        instagramUserId: { type: String, default: '' },
        instagramUsername: { type: String, default: '' },
        pageTokenEncrypted: { type: String, default: '' }
    }, { _id: false });

    const connectionSchema = new mongoose.Schema({
        key: { type: String, unique: true, default: 'primary' },
        pages: { type: [pageSchema], default: [] },
        selectedPageId: { type: String, default: '' },
        connectedBy: { type: String, default: '' },
        connectedAt: { type: Date, default: null },
        userTokenExpiresAt: { type: Date, default: null }
    }, { timestamps: true, collection: 'instagram_monitor_connection' });
    const Connection = mongoose.models.InstagramMonitorConnection ||
        mongoose.model('InstagramMonitorConnection', connectionSchema);

    const stateSchema = new mongoose.Schema({
        state: { type: String, required: true, unique: true },
        adminId: { type: String, required: true },
        expiresAt: { type: Date, required: true }
    }, { timestamps: true, collection: 'instagram_monitor_oauth_states' });
    stateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const OAuthState = mongoose.models.InstagramMonitorOAuthState ||
        mongoose.model('InstagramMonitorOAuthState', stateSchema);

    const postSchema = new mongoose.Schema({
        id: String,
        mediaType: String,
        permalink: String,
        caption: String,
        timestamp: Date,
        likeCount: Number,
        commentsCount: Number,
        textMatch: Boolean
    }, { _id: false });

    const snapshotSchema = new mongoose.Schema({
        username: { type: String, required: true, unique: true, index: true },
        dealerId: { type: String, default: '' },
        followersCount: { type: Number, default: null },
        mediaCount: { type: Number, default: null },
        checkedMediaCount: { type: Number, default: 0 },
        textMatchCount: { type: Number, default: 0 },
        posts: { type: [postSchema], default: [] },
        fetchedAt: { type: Date, default: null },
        error: { type: String, default: '' }
    }, { timestamps: true, collection: 'instagram_dealer_snapshots' });
    const Snapshot = mongoose.models.InstagramDealerSnapshot ||
        mongoose.model('InstagramDealerSnapshot', snapshotSchema);

    const graphVersion = /^v\d+\.\d+$/.test(String(process.env.META_GRAPH_API_VERSION || ''))
        ? String(process.env.META_GRAPH_API_VERSION)
        : 'v27.0';
    const configured = () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
    const loginConfigId = () => String(process.env.META_IG_LOGIN_CONFIG_ID || '').trim();
    const redirectUri = () => String(process.env.META_IG_REDIRECT_URI || (String(origin || '').replace(/\/+$/, '') + '/api/instagram/callback'));

    function encryptionKey() {
        const secret = String(process.env.META_APP_SECRET || '');
        if (!secret) throw new Error('Instagram API не настроен');
        return crypto.createHash('sha256').update('ideal-floor-crm:instagram-token:v1\0' + secret).digest();
    }

    function encryptToken(value) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
        const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
        return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
    }

    function decryptToken(value) {
        const parts = String(value || '').split('.');
        if (parts.length !== 3) throw new Error('Нужно заново подключить Instagram');
        const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(parts[0], 'base64url'));
        decipher.setAuthTag(Buffer.from(parts[1], 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8');
    }

    async function requestJson(url, options) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        timer.unref?.();
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.error) {
                const error = new Error(String(payload.error?.message || 'Meta не выполнила запрос'));
                error.metaCode = Number(payload.error?.code) || 0;
                error.status = response.status;
                throw error;
            }
            return payload;
        } finally {
            clearTimeout(timer);
        }
    }

    function graphUrl(path, params) {
        const url = new URL('https://graph.facebook.com/' + graphVersion + '/' + String(path).replace(/^\/+/, ''));
        Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));
        return url;
    }

    async function graphGet(path, token, params) {
        return requestJson(graphUrl(path, params), {
            method: 'GET',
            headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
        });
    }

    function callbackPage(payload) {
        const json = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
        const targetOrigin = JSON.stringify(String(origin || '').replace(/\/+$/, ''));
        return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instagram CRM</title><body style="font:16px Arial,sans-serif;padding:28px;color:#333"><p id="result">Завершаем подключение Instagram…</p><a href="/">Вернуться в CRM</a><script>(function(){var data=' + json + ';var target=' + targetOrigin + ';document.getElementById("result").textContent=data.status==="ok"?"Instagram подключён. Это окно можно закрыть.":(data.message||"Не удалось подключить Instagram.");if(window.opener){window.opener.postMessage({type:"crm-instagram-oauth",payload:data},target);setTimeout(function(){window.close()},500)}})();</script></body></html>';
    }

    function handleFromUrl(value) {
        let raw = String(value || '').trim();
        if (!raw) return '';
        if (raw[0] === '@') raw = raw.slice(1);
        if (/^https?:\/\//i.test(raw)) {
            try {
                const url = new URL(raw);
                if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return '';
                raw = url.pathname.split('/').filter(Boolean)[0] || '';
            } catch (_) { return ''; }
        } else {
            raw = raw.split(/[/?#]/)[0];
        }
        raw = raw.replace(/^@/, '').trim();
        return /^[A-Za-z0-9._]{1,30}$/.test(raw) ? raw : '';
    }

    function publicSnapshot(snapshot) {
        if (!snapshot) return null;
        return {
            username: snapshot.username,
            followersCount: snapshot.followersCount,
            mediaCount: snapshot.mediaCount,
            checkedMediaCount: snapshot.checkedMediaCount,
            textMatchCount: snapshot.textMatchCount,
            posts: (snapshot.posts || []).map(post => ({
                id: post.id,
                mediaType: post.mediaType,
                permalink: post.permalink,
                caption: post.caption,
                timestamp: post.timestamp,
                likeCount: post.likeCount,
                commentsCount: post.commentsCount,
                textMatch: Boolean(post.textMatch)
            })),
            fetchedAt: snapshot.fetchedAt,
            error: snapshot.error || ''
        };
    }

    function textHasBrand(caption) {
        const value = String(caption || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ');
        return [
            'idealfloor', 'ideal floor', 'ideal floor kz', 'идеал флор',
            'идеалфлор', 'идеал флор кз', 'идеал флор казахстан',
            'идеафлор кз', 'ideafloor kz'
        ].some(term => value.includes(term));
    }

    function profileErrorMessage(error) {
        if (error?.metaCode === 190) return 'Подключение Meta истекло. Администратору нужно подключить Instagram заново.';
        if ([10, 100, 200].includes(Number(error?.metaCode))) {
            return 'Meta не отдала этот профиль. Обычно так бывает, если аккаунт дилера личный/закрытый или не выданы права Instagram Public Content.';
        }
        return 'Не удалось получить данные от Meta. Проверьте подключение и повторите позже.';
    }

    async function getConnection() {
        return Connection.findOne({ key: 'primary' }).lean();
    }

    function safePage(page) {
        return {
            id: page.pageId,
            name: page.pageName || 'Facebook Page',
            instagramUsername: page.instagramUsername || '',
            hasProfessionalInstagram: Boolean(page.instagramUserId && page.pageTokenEncrypted)
        };
    }

    app.get('/api/integrations/instagram/status', requirePermission('can_view_dealers'), async (req, res) => {
        try {
            const connection = await getConnection();
            const selected = connection?.pages?.find(page => page.pageId === connection.selectedPageId);
            res.json({
                connected: Boolean(selected?.instagramUserId && selected?.pageTokenEncrypted),
                account: selected?.instagramUsername || '',
                connectedAt: connection?.connectedAt || null
            });
        } catch (_) {
            res.status(503).json({ error: 'Не удалось проверить подключение Instagram' });
        }
    });

    app.get('/api/admin/integrations/instagram/status', requireAdmin, async (req, res) => {
        try {
            const connection = await getConnection();
            const selected = connection?.pages?.find(page => page.pageId === connection.selectedPageId);
            res.json({
                configured: configured(),
                loginConfigConfigured: Boolean(loginConfigId()),
                redirectUri: redirectUri(),
                connected: Boolean(selected?.instagramUserId && selected?.pageTokenEncrypted),
                selectedPage: selected ? safePage(selected) : null,
                pages: (connection?.pages || []).map(safePage),
                connectedAt: connection?.connectedAt || null
            });
        } catch (_) {
            res.status(503).json({ error: 'Не удалось проверить подключение Instagram' });
        }
    });

    app.post('/api/admin/integrations/instagram/start', requireAdmin, async (req, res) => {
        try {
            if (!configured()) return res.status(503).json({ error: 'В Render ещё не заданы META_APP_ID и META_APP_SECRET' });
            const state = crypto.randomBytes(32).toString('hex');
            await OAuthState.create({ state, adminId: String(req.user.id), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
            const url = new URL('https://www.facebook.com/' + graphVersion + '/dialog/oauth');
            url.searchParams.set('client_id', process.env.META_APP_ID);
            url.searchParams.set('redirect_uri', redirectUri());
            url.searchParams.set('response_type', 'code');
            url.searchParams.set('state', state);
            const configId = loginConfigId();
            if (configId) {
                // Facebook Login for Business takes permissions from the saved configuration.
                url.searchParams.set('config_id', configId);
                url.searchParams.set('response_type', 'code');
                url.searchParams.set('override_default_response_type', 'true');
            } else {
                // Keep compatibility with classic Facebook Login while no Business config is set.
                url.searchParams.set('scope', 'pages_show_list,instagram_basic,pages_read_engagement');
            }
            url.searchParams.set('auth_type', 'rerequest');
            res.json({ authUrl: url.toString() });
        } catch (_) {
            res.status(500).json({ error: 'Не удалось начать подключение Instagram' });
        }
    });

    app.get('/api/instagram/callback', async (req, res) => {
        const fail = message => res.status(200).type('html').send(callbackPage({ status: 'error', message }));
        try {
            if (!configured()) return fail('В CRM пока не настроены ключи Meta.');
            if (req.query.error) return fail('Meta не завершила подключение. Можно попробовать ещё раз.');
            const code = String(req.query.code || '');
            const state = String(req.query.state || '');
            if (!code || !/^[a-f0-9]{32,128}$/i.test(state)) return fail('Ссылка подключения неполная. Запустите подключение из CRM заново.');
            const savedState = await OAuthState.findOneAndDelete({ state }).lean();
            if (!savedState || savedState.expiresAt <= new Date()) return fail('Срок действия подключения истёк. Запустите его из CRM заново.');
            const admin = await User.findById(savedState.adminId).lean();
            if (!admin || admin.isBlocked || !(admin.permissions?.is_admin === true || admin.role === 'admin')) {
                return fail('Подключить Instagram может только действующий администратор CRM.');
            }

            const tokenUrl = graphUrl('oauth/access_token', {
                client_id: process.env.META_APP_ID,
                client_secret: process.env.META_APP_SECRET,
                redirect_uri: redirectUri(),
                code
            });
            const shortToken = await requestJson(tokenUrl, { method: 'GET', headers: { Accept: 'application/json' } });
            let userToken = shortToken.access_token;
            let expiresIn = Number(shortToken.expires_in) || 3600;
            try {
                const longToken = await requestJson(graphUrl('oauth/access_token', {
                    grant_type: 'fb_exchange_token',
                    client_id: process.env.META_APP_ID,
                    client_secret: process.env.META_APP_SECRET,
                    fb_exchange_token: userToken
                }), { method: 'GET', headers: { Accept: 'application/json' } });
                if (longToken.access_token) userToken = longToken.access_token;
                if (Number(longToken.expires_in)) expiresIn = Number(longToken.expires_in);
            } catch (_) {
                // The Page token is still requested and checked below; allow Meta's valid short token fallback.
            }

            const pageData = await graphGet('me/accounts', userToken, {
                fields: 'id,name,access_token,tasks,instagram_business_account',
                limit: 100
            });
            const pages = [];
            for (const page of (Array.isArray(pageData.data) ? pageData.data : []).slice(0, 100)) {
                if (!page?.id || !page?.access_token) continue;
                let igUserId = String(page.instagram_business_account?.id || '');
                let username = '';
                if (igUserId) {
                    try {
                        const igProfile = await graphGet(igUserId, page.access_token, { fields: 'id,username,name' });
                        username = String(igProfile.username || '');
                    } catch (_) {
                        igUserId = '';
                    }
                }
                pages.push({
                    pageId: String(page.id),
                    pageName: String(page.name || 'Facebook Page'),
                    instagramUserId: igUserId,
                    instagramUsername: username,
                    pageTokenEncrypted: encryptToken(page.access_token)
                });
            }

            let selectedPageId = '';
            const usable = pages.filter(page => page.instagramUserId);
            if (usable.length === 1) selectedPageId = usable[0].pageId;
            await Connection.findOneAndUpdate({ key: 'primary' }, {
                $set: {
                    pages,
                    selectedPageId,
                    connectedBy: String(admin._id),
                    connectedAt: new Date(),
                    userTokenExpiresAt: new Date(Date.now() + expiresIn * 1000)
                }
            }, { upsert: true, new: true });
            res.status(200).type('html').send(callbackPage({
                status: 'ok',
                pagesFound: usable.length,
                selected: Boolean(selectedPageId)
            }));
        } catch (error) {
            fail(error?.metaCode === 190
                ? 'Meta вернула недействительный доступ. Проверьте аккаунт Facebook/Instagram и повторите подключение.'
                : 'Meta не завершила подключение. Проверьте настройки приложения и повторите.');
        }
    });

    app.post('/api/admin/integrations/instagram/select-page', requireAdmin, async (req, res) => {
        try {
            const pageId = String(req.body?.pageId || '');
            const connection = await Connection.findOne({ key: 'primary' });
            if (!connection) return res.status(409).json({ error: 'Сначала подключите аккаунт Meta' });
            const page = connection.pages.find(item => item.pageId === pageId && item.instagramUserId && item.pageTokenEncrypted);
            if (!page) return res.status(400).json({ error: 'У выбранной страницы нет подключённого профессионального Instagram' });
            connection.selectedPageId = page.pageId;
            connection.connectedAt = connection.connectedAt || new Date();
            await connection.save();
            res.json({ ok: true, selectedPage: safePage(page) });
        } catch (_) {
            res.status(500).json({ error: 'Не удалось выбрать страницу Meta' });
        }
    });

    app.delete('/api/admin/integrations/instagram', requireAdmin, async (req, res) => {
        try {
            await Connection.deleteOne({ key: 'primary' });
            await OAuthState.deleteMany({});
            res.json({ ok: true });
        } catch (_) {
            res.status(500).json({ error: 'Не удалось отключить Instagram' });
        }
    });

    async function accessibleDealer(req, dealerId) {
        return Dealer.findOne({ _id: dealerId, ...getDealerFilter(req) }).select('_id name instagram').lean();
    }

    app.get('/api/dealers/:id/instagram-monitor', requirePermission('can_view_dealers'), async (req, res) => {
        try {
            const dealer = await accessibleDealer(req, req.params.id);
            if (!dealer) return res.status(404).json({ error: 'Дилер не найден' });
            const username = handleFromUrl(dealer.instagram);
            const snapshot = username ? await Snapshot.findOne({ username: username.toLowerCase() }).lean() : null;
            res.json({
                dealer: { id: String(dealer._id), name: dealer.name, username },
                snapshot: publicSnapshot(snapshot)
            });
        } catch (_) {
            res.status(500).json({ error: 'Не удалось загрузить данные Instagram' });
        }
    });

    const inFlight = new Map();
    async function syncDealer(dealer, username) {
        const key = username.toLowerCase();
        if (inFlight.has(key)) return inFlight.get(key);
        const task = (async () => {
            const connection = await getConnection();
            const page = connection?.pages?.find(item => item.pageId === connection.selectedPageId);
            if (!page?.instagramUserId || !page.pageTokenEncrypted) {
                const error = new Error('Сначала администратор должен подключить профессиональный Instagram и выбрать связанную страницу Facebook.');
                error.status = 409;
                throw error;
            }
            let token;
            try { token = decryptToken(page.pageTokenEncrypted); }
            catch (_) {
                const error = new Error('Срок доступа к Instagram закончился. Администратору нужно подключить аккаунт заново.');
                error.status = 409;
                throw error;
            }
            const fields = 'business_discovery.username(' + username + '){username,followers_count,media_count,media.limit(12){id,caption,media_type,permalink,timestamp,like_count,comments_count}}';
            const result = await graphGet(page.instagramUserId, token, { fields });
            const profile = result.business_discovery;
            if (!profile) {
                const error = new Error('Meta не вернула данные этого аккаунта. Для Business Discovery подходят профессиональные Business/Creator профили.');
                error.status = 422;
                throw error;
            }
            const posts = (Array.isArray(profile.media?.data) ? profile.media.data : []).map(media => {
                const caption = String(media.caption || '').slice(0, 2200);
                return {
                    id: String(media.id || ''),
                    mediaType: String(media.media_type || ''),
                    permalink: String(media.permalink || ''),
                    caption,
                    timestamp: media.timestamp ? new Date(media.timestamp) : null,
                    likeCount: Number.isFinite(Number(media.like_count)) ? Number(media.like_count) : null,
                    commentsCount: Number.isFinite(Number(media.comments_count)) ? Number(media.comments_count) : null,
                    textMatch: textHasBrand(caption)
                };
            });
            const textMatchCount = posts.filter(post => post.textMatch).length;
            await reports.archive(username, posts);
            const saved = await Snapshot.findOneAndUpdate({ username: username.toLowerCase() }, {
                $set: {
                    dealerId: String(dealer._id),
                    username: String(profile.username || username).toLowerCase(),
                    followersCount: Number(profile.followers_count) || 0,
                    mediaCount: Number(profile.media_count) || 0,
                    checkedMediaCount: posts.length,
                    textMatchCount,
                    posts,
                    fetchedAt: new Date(),
                    error: ''
                }
            }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
            return saved;
        })();
        inFlight.set(username.toLowerCase(), task);
        try { return await task; }
        finally { inFlight.delete(key); }
    }

    const reports = require('./instagram-report').install({
        ...options, Snapshot, handleFromUrl, syncDealer, getConnection
    });
    app.post('/api/dealers/:id/instagram-monitor/sync', requirePermission('can_view_dealers'), async (req, res) => {
        try {
            const dealer = await accessibleDealer(req, req.params.id);
            if (!dealer) return res.status(404).json({ error: 'Дилер не найден' });
            const username = handleFromUrl(dealer.instagram);
            if (!username) return res.status(400).json({ error: 'В карточке дилера укажите ссылку на профиль Instagram вида instagram.com/username' });
            const snapshot = await syncDealer(dealer, username);
            res.json({ snapshot: publicSnapshot(snapshot) });
        } catch (error) {
            const status = Number(error?.status) || 502;
            res.status(status).json({ error: error?.status ? error.message : profileErrorMessage(error) });
        }
    });
}

module.exports = { installInstagramMonitor };
