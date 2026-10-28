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

    const NAV_ITEMS = [
        { path: '/', label: 'Дилеры', permission: 'can_view_dealers' },
        { path: '/map.html', label: 'Карта', permission: 'can_view_map' },
        { path: '/products.html', label: 'Матрица', permission: 'can_view_products' },
        { path: '/report.html', label: 'Выставленность', permission: 'can_view_report' },
        { path: '/sales.html', label: 'Продажи', permission: 'can_view_sales' },
        { path: '/competitors.html', label: 'Конкуренты', permission: 'can_view_competitors' },
        { path: '/knowledge.html', label: 'Статьи', permission: 'can_view_knowledge' },
        { path: '/reclamations.html', label: 'Рекламации', permission: 'can_view_reclamations' },
        { path: '/users.html', label: 'Сотрудники', permission: 'can_manage_users' }
    ];

    function getToken() {
        return localStorage.getItem('crm_token');
    }

    function logout() {
        localStorage.removeItem('crm_token');
        localStorage.removeItem('crm_user');
        window.location.href = '/login.html';
    }

    function getCurrentNavPath() {
        const path = window.location.pathname;
        if (path === '/index.html' || path === '/dealer.html') return '/';
        return path;
    }

    function renderTopNavigation() {
        const nav = document.querySelector('nav.navbar');
        if (!nav || window.location.pathname === '/login.html') return;

        nav.classList.add('desktop-nav');
        const currentPath = getCurrentNavPath();

        const itemsHtml = NAV_ITEMS.map(item => {
            const active = item.path === currentPath;
            return `
                <li class="nav-item" data-permission="${item.permission}">
                    <a class="nav-link${active ? ' active fw-bold' : ''}" href="${item.path}">${item.label}</a>
                </li>`;
        }).join('');

        nav.innerHTML = `
            <div class="container-fluid">
                <a class="navbar-brand" href="/">
                    <img src="logo.png" alt="IDEAL FLOOR CRM" height="40">
                </a>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Открыть меню">
                    <span class="navbar-toggler-icon"></span>
                </button>
                <div class="collapse navbar-collapse" id="navbarNav">
                    <ul class="navbar-nav me-auto">
                        ${itemsHtml}
                    </ul>
                    <div class="d-flex align-items-center gap-3">
                        <span id="user-role-badge" class="badge bg-light text-dark border">...</span>
                        <button id="logout-btn" class="btn btn-sm btn-outline-danger" type="button">
                            <i class="bi bi-box-arrow-right me-1"></i>Выход
                        </button>
                    </div>
                </div>
            </div>`;

        const logoutButton = document.getElementById('logout-btn');
        if (logoutButton) logoutButton.addEventListener('click', logout);
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
            const preferredRoutes = [
                ['/', 'can_view_dealers'],
                ['/sales.html', 'can_view_sales'],
                ['/competitors.html', 'can_view_competitors'],
                ['/products.html', 'can_view_products'],
                ['/report.html', 'can_view_report'],
                ['/knowledge.html', 'can_view_knowledge'],
                ['/reclamations.html', 'can_view_reclamations'],
                ['/map.html', 'can_view_map'],
                ['/users.html', 'can_manage_users']
            ];
            const target = preferredRoutes.find(([, right]) => can(right));

            if (target && target[0] !== window.location.pathname) {
                window.location.replace(target[0]);
                return window.CRMAuth.user;
            }

            document.body.innerHTML =
                '<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:12vh auto;padding:32px;text-align:center">' +
                '<h2>Нет доступных разделов</h2>' +
                '<p style="color:#6c757d">Для вашей учетной записи пока не включено ни одного раздела. Обратитесь к администратору CRM.</p>' +
                '<button onclick="CRMAuth.logout()" style="border:0;border-radius:20px;padding:10px 18px;background:#b9040a;color:#fff;font-weight:700;cursor:pointer">Выйти</button></div>';
            return window.CRMAuth.user;
        }

        applyNavigation();
        applyRoleBadge();
        return window.CRMAuth.user;
    }

    // Меню строится синхронно до DOMContentLoaded, чтобы все страницы
    // получили один и тот же набор пунктов и порядок.
    renderTopNavigation();

    window.__crmOriginalFetch = window.fetch.bind(window);
    window.fetch = apiFetch;

    window.CRMAuth = {
        user: null,
        ready: null,
        can,
        logout,
        applyNavigation,
        renderTopNavigation,
        init
    };

    window.CRMAuth.ready = init().catch(err => {
        console.error('CRM auth init error:', err);
    });
})();