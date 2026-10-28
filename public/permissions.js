(function () {
    const PAGE_PERMISSIONS = {
        '/': 'can_view_dealers',
        '/index.html': 'can_view_dealers',
        '/map.html': 'can_view_map',
        '/products.html': 'can_view_products',
        '/report.html': 'can_view_report',
        '/sales.html': 'can_view_sales',
        '/competitors.html': 'can_view_competitors',
        '/knowledge.html': 'can_view_knowledge',
        '/reclamations.html': 'can_view_reclamations',
        '/dealer.html': 'can_view_dealers',
        '/users.html': 'can_manage_users'
    };

    const NAV_PERMISSIONS = {
        '/': 'can_view_dealers',
        '/map.html': 'can_view_map',
        '/products.html': 'can_view_products',
        '/report.html': 'can_view_report',
        '/sales.html': 'can_view_sales',
        '/competitors.html': 'can_view_competitors',
        '/knowledge.html': 'can_view_knowledge',
        '/reclamations.html': 'can_view_reclamations',
        '/users.html': 'can_manage_users'
    };

    function getToken() {
        return localStorage.getItem('crm_token');
    }

    function logout() {
        localStorage.removeItem('crm_token');
        localStorage.removeItem('crm_user');
        window.location.href = '/login.html';
    }

    async function apiFetch(url, options) {
        options = options || {};
        options.headers = options.headers || {};
        const token = getToken();
        if (token) options.headers.Authorization = 'Bearer ' + token;

        const response = await window.__crmOriginalFetch(url, options);
        if (response.status === 401) {
            logout();
            throw new Error('Сессия завершена');
        }
        return response;
    }

    function can(permission) {
        const user = window.CRMAuth && window.CRMAuth.user;
        if (!user || !user.permissions) return false;
        return Boolean(user.permissions.is_admin || user.permissions[permission]);
    }

    function applyNavigation() {
        document.querySelectorAll('a[href]').forEach(link => {
            let path;
            try { path = new URL(link.href, window.location.origin).pathname; } catch (_) { return; }
            const permission = NAV_PERMISSIONS[path];
            if (permission && !can(permission)) {
                const item = link.closest('.nav-item, .bottom-nav-item') || link;
                item.style.display = 'none';
            }
        });

        document.querySelectorAll('[data-permission]').forEach(el => {
            const permission = el.dataset.permission;
            el.style.display = can(permission) ? '' : 'none';
        });
    }

    function applyRoleBadge() {
        const badge = document.getElementById('user-role-badge');
        if (!badge || !window.CRMAuth.user) return;
        const user = window.CRMAuth.user;
        const names = { manager: 'Менеджер', marketing: 'Маркетинг', guest: 'Гость' };
        badge.textContent = names[user.role] || user.role || 'Пользователь';
    }

    async function init() {
        if (window.location.pathname === '/login.html') return null;
        if (!getToken()) {
            window.location.href = '/login.html';
            return null;
        }

        const response = await apiFetch('/api/auth/me');
        if (!response.ok) {
            if (response.status === 403) {
                logout();
                return null;
            }
            throw new Error('Не удалось проверить пользователя');
        }

        const data = await response.json();
        window.CRMAuth.user = data.user || null;
        localStorage.setItem('crm_user', JSON.stringify(window.CRMAuth.user));

        const permission = PAGE_PERMISSIONS[window.location.pathname];
        if (permission && !can(permission)) {
            document.body.innerHTML =
                '<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:12vh auto;padding:32px;text-align:center">' +
                '<h2>Нет доступа к разделу</h2>' +
                '<p style="color:#6c757d">Для вашей учетной записи этот раздел отключен администратором.</p>' +
                '<a href="/" style="color:#b9040a;font-weight:700">Вернуться на главную</a></div>';
            return window.CRMAuth.user;
        }

        applyNavigation();
        applyRoleBadge();
        return window.CRMAuth.user;
    }

    window.__crmOriginalFetch = window.fetch.bind(window);
    window.fetch = apiFetch;

    window.CRMAuth = {
        user: null,
        ready: null,
        can,
        logout,
        applyNavigation,
        init
    };

    window.CRMAuth.ready = init().catch(err => {
        console.error('CRM auth init error:', err);
    });
})();