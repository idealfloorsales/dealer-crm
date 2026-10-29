(function () {
    function ensureMotionStyles() {
        if (document.getElementById('crm-motion-styles')) return;
        const link = document.createElement('link');
        link.id = 'crm-motion-styles';
        link.rel = 'stylesheet';
        link.href = '/ui-motion.css?v={{VER}}';
        document.head.appendChild(link);
    }
    ensureMotionStyles();

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
        '/workshop.html': 'can_view_workshop',
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
        '/workshop.html': 'can_view_workshop',
        '/users.html': 'can_manage_users'
    };

    const NAV_ITEMS = [
        { path: '/', label: 'Дилеры', permission: 'can_view_dealers', icon: 'shop' },
        { path: '/map.html', label: 'Карта', permission: 'can_view_map', icon: 'geo-alt' },
        { path: '/products.html', label: 'Матрица', permission: 'can_view_products', icon: 'grid-3x3-gap' },
        { path: '/report.html', label: 'Выставленность', permission: 'can_view_report', icon: 'bar-chart' },
        { path: '/sales.html', label: 'Продажи', permission: 'can_view_sales', icon: 'graph-up-arrow' },
        { path: '/competitors.html', label: 'Конкуренты', permission: 'can_view_competitors', icon: 'globe2' },
        { path: '/knowledge.html', label: 'Статьи', permission: 'can_view_knowledge', icon: 'journal-text' },
        { path: '/reclamations.html', label: 'Рекламации', permission: 'can_view_reclamations', icon: 'shield-exclamation' },
        { path: '/workshop.html', label: 'Цех', permission: 'can_view_workshop', icon: 'tools' },
        { path: '/users.html', label: 'Сотрудники', permission: 'can_manage_users', icon: 'people' }
    ];

    const MOBILE_PRIMARY_PATHS = ['/', '/map.html', '/sales.html', '/products.html'];

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


    function ensureMobileNavStyles() {
        if (document.getElementById('crm-mobile-nav-styles')) return;
        const style = document.createElement('style');
        style.id = 'crm-mobile-nav-styles';
        style.textContent = `
            @media (max-width: 991.98px) {
                body {
                    padding-bottom: calc(84px + env(safe-area-inset-bottom)) !important;
                }

                body.crm-mobile-sheet-open {
                    overflow: hidden;
                }

                .bottom-nav {
                    display: none !important;
                }

                .crm-mobile-nav {
                    position: fixed;
                    left: 10px;
                    right: 10px;
                    bottom: calc(8px + env(safe-area-inset-bottom));
                    z-index: 1085;
                    display: grid;
                    grid-template-columns: repeat(5, minmax(0,1fr));
                    align-items: center;
                    height: 64px;
                    padding: 6px;
                    border: 1px solid rgba(23,24,27,.08);
                    border-radius: 19px;
                    background: rgba(255,255,255,.96);
                    box-shadow: 0 14px 40px rgba(28,24,24,.16);
                    backdrop-filter: blur(18px);
                    -webkit-backdrop-filter: blur(18px);
                }

                .crm-mobile-nav-item,
                .crm-mobile-nav-more {
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 3px;
                    min-width: 0;
                    height: 52px;
                    padding: 0 4px;
                    border: 0;
                    border-radius: 13px;
                    background: transparent;
                    color: #909298;
                    text-decoration: none;
                    font-family: inherit;
                }

                .crm-mobile-nav-item i,
                .crm-mobile-nav-more i {
                    font-size: 1.18rem;
                    line-height: 1;
                }

                .crm-mobile-nav-item span,
                .crm-mobile-nav-more span {
                    max-width: 100%;
                    overflow: hidden;
                    font-size: .57rem;
                    font-weight: 700;
                    line-height: 1;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .crm-mobile-nav-item.active,
                .crm-mobile-nav-more.active {
                    background: #fff1f1;
                    color: #b9040a;
                }

                .crm-mobile-nav-item.active::after,
                .crm-mobile-nav-more.active::after {
                    content: "";
                    position: absolute;
                    top: 3px;
                    width: 18px;
                    height: 2px;
                    border-radius: 99px;
                    background: #b9040a;
                }

                .crm-mobile-sheet-backdrop {
                    position: fixed;
                    inset: 0;
                    z-index: 1090;
                    opacity: 0;
                    visibility: hidden;
                    background: rgba(17,17,19,.38);
                    backdrop-filter: blur(3px);
                    -webkit-backdrop-filter: blur(3px);
                    transition: opacity .18s ease, visibility .18s ease;
                }

                .crm-mobile-sheet-backdrop.open {
                    opacity: 1;
                    visibility: visible;
                }

                .crm-mobile-sheet {
                    position: absolute;
                    left: 8px;
                    right: 8px;
                    bottom: calc(8px + env(safe-area-inset-bottom));
                    max-height: min(78vh, 680px);
                    overflow: hidden;
                    border: 1px solid rgba(23,24,27,.07);
                    border-radius: 26px;
                    background: #f7f5f2;
                    box-shadow: 0 28px 70px rgba(15,15,17,.3);
                    transform: translateY(calc(100% + 28px));
                    transition: transform .22s cubic-bezier(.2,.8,.2,1);
                }

                .crm-mobile-sheet-backdrop.open .crm-mobile-sheet {
                    transform: translateY(0);
                }

                .crm-mobile-sheet-handle {
                    width: 38px;
                    height: 4px;
                    margin: 9px auto 3px;
                    border-radius: 99px;
                    background: #d2ceca;
                }

                .crm-mobile-sheet-head {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 12px 16px 10px;
                }

                .crm-mobile-sheet-head strong {
                    display: block;
                    color: #25262a;
                    font-size: 1rem;
                    font-weight: 780;
                }

                .crm-mobile-sheet-head small {
                    display: block;
                    margin-top: 3px;
                    color: #96989d;
                    font-size: .62rem;
                    font-weight: 600;
                }

                .crm-mobile-sheet-close {
                    display: grid;
                    place-items: center;
                    flex: 0 0 auto;
                    width: 36px;
                    height: 36px;
                    padding: 0;
                    border: 0;
                    border-radius: 11px;
                    background: #ebe7e3;
                    color: #66686d;
                    font-size: 1rem;
                }

                .crm-mobile-sheet-scroll {
                    max-height: calc(min(78vh, 680px) - 126px);
                    overflow-y: auto;
                    padding: 3px 12px 14px;
                    overscroll-behavior: contain;
                }

                .crm-mobile-sheet-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0,1fr));
                    gap: 8px;
                }

                .crm-mobile-sheet-link {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    justify-content: space-between;
                    min-height: 86px;
                    padding: 12px;
                    border: 1px solid rgba(23,24,27,.055);
                    border-radius: 15px;
                    background: #fff;
                    color: #55575c;
                    text-decoration: none;
                }

                .crm-mobile-sheet-link i {
                    display: grid;
                    place-items: center;
                    width: 32px;
                    height: 32px;
                    border-radius: 10px;
                    background: #f1eeea;
                    color: #77797e;
                    font-size: .93rem;
                }

                .crm-mobile-sheet-link span {
                    width: 100%;
                    margin-top: 9px;
                    overflow: hidden;
                    font-size: .66rem;
                    font-weight: 730;
                    line-height: 1.15;
                    text-overflow: ellipsis;
                }

                .crm-mobile-sheet-link.active {
                    border-color: rgba(185,4,10,.16);
                    background: #fff5f5;
                    color: #a20a10;
                }

                .crm-mobile-sheet-link.active i {
                    background: #b9040a;
                    color: #fff;
                }

                .crm-mobile-sheet-account {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    margin-top: 10px;
                    padding: 11px 12px;
                    border: 1px solid rgba(23,24,27,.055);
                    border-radius: 15px;
                    background: #fff;
                }

                .crm-mobile-sheet-user {
                    min-width: 0;
                }

                .crm-mobile-sheet-user strong {
                    display: block;
                    overflow: hidden;
                    color: #333438;
                    font-size: .72rem;
                    font-weight: 750;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .crm-mobile-sheet-user small {
                    display: block;
                    margin-top: 2px;
                    color: #999ba0;
                    font-size: .58rem;
                }

                .crm-mobile-sheet-logout {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    flex: 0 0 auto;
                    min-height: 36px;
                    padding: 0 11px;
                    border: 0;
                    border-radius: 10px;
                    background: #fff0f0;
                    color: #a20a10;
                    font-size: .63rem;
                    font-weight: 750;
                }

                #mobile-fab-add {
                    bottom: calc(86px + env(safe-area-inset-bottom)) !important;
                }

                .dealer-route-bar {
                    bottom: calc(82px + env(safe-area-inset-bottom)) !important;
                }

                .dealer-route-active #mobile-fab-add {
                    bottom: calc(150px + env(safe-area-inset-bottom)) !important;
                }
            }

            @media (min-width: 992px) {
                .crm-mobile-nav,
                .crm-mobile-sheet-backdrop {
                    display: none !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function renderMobileNavigation() {
        if (window.location.pathname === '/login.html') return;
        ensureMobileNavStyles();

        document.querySelectorAll('.crm-mobile-nav, .crm-mobile-sheet-backdrop').forEach(el => el.remove());

        const currentPath = getCurrentNavPath();
        const userRole = window.CRMAuth?.user?.role;
        const primaryPaths = userRole === 'workshop' ? ['/workshop.html'] : MOBILE_PRIMARY_PATHS;
        const primaryItems = primaryPaths
            .map(path => NAV_ITEMS.find(item => item.path === path))
            .filter(Boolean);

        const nav = document.createElement('nav');
        nav.className = 'crm-mobile-nav';
        nav.setAttribute('aria-label', 'Мобильная навигация');
        nav.style.gridTemplateColumns = `repeat(${Math.max(2, primaryItems.length + 1)}, minmax(0,1fr))`;

        nav.innerHTML = primaryItems.map(item => {
            const active = item.path === currentPath;
            return `<a href="${item.path}" class="crm-mobile-nav-item${active ? ' active' : ''}" data-permission="${item.permission}">
                <i class="bi bi-${item.icon}"></i>
                <span>${item.label}</span>
            </a>`;
        }).join('') + `
            <button type="button" class="crm-mobile-nav-more${primaryPaths.includes(currentPath) ? '' : ' active'}" id="crm-mobile-more">
                <i class="bi bi-grid"></i>
                <span>Ещё</span>
            </button>`;

        const backdrop = document.createElement('div');
        backdrop.className = 'crm-mobile-sheet-backdrop';
        backdrop.id = 'crm-mobile-sheet-backdrop';
        backdrop.innerHTML = `
            <div class="crm-mobile-sheet" role="dialog" aria-modal="true" aria-label="Все разделы CRM">
                <div class="crm-mobile-sheet-handle"></div>
                <div class="crm-mobile-sheet-head">
                    <div>
                        <strong>Меню</strong>
                        <small>Все разделы CRM</small>
                    </div>
                    <button type="button" class="crm-mobile-sheet-close" id="crm-mobile-sheet-close" aria-label="Закрыть"><i class="bi bi-x-lg"></i></button>
                </div>
                <div class="crm-mobile-sheet-scroll">
                    <div class="crm-mobile-sheet-grid">
                        ${NAV_ITEMS.map(item => {
                            const active = item.path === currentPath;
                            return `<a href="${item.path}" class="crm-mobile-sheet-link${active ? ' active' : ''}" data-permission="${item.permission}">
                                <i class="bi bi-${item.icon}"></i>
                                <span>${item.label}</span>
                            </a>`;
                        }).join('')}
                    </div>
                    <div class="crm-mobile-sheet-account">
                        <div class="crm-mobile-sheet-user">
                            <strong id="crm-mobile-user-name">Пользователь</strong>
                            <small id="crm-mobile-user-role">CRM IDEAL FLOOR</small>
                        </div>
                        <button type="button" class="crm-mobile-sheet-logout" id="crm-mobile-logout"><i class="bi bi-box-arrow-right"></i> Выйти</button>
                    </div>
                </div>
            </div>`;

        document.body.appendChild(nav);
        document.body.appendChild(backdrop);

        const openButton = nav.querySelector('#crm-mobile-more');
        const closeButton = backdrop.querySelector('#crm-mobile-sheet-close');
        const logoutButton = backdrop.querySelector('#crm-mobile-logout');

        const openSheet = () => {
            backdrop.classList.add('open');
            document.body.classList.add('crm-mobile-sheet-open');
        };
        const closeSheet = () => {
            backdrop.classList.remove('open');
            document.body.classList.remove('crm-mobile-sheet-open');
        };

        openButton?.addEventListener('click', openSheet);
        closeButton?.addEventListener('click', closeSheet);
        logoutButton?.addEventListener('click', logout);
        backdrop.addEventListener('click', e => {
            if (e.target === backdrop) closeSheet();
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && backdrop.classList.contains('open')) closeSheet();
        }, { once: false });
    }

    function updateMobileUserInfo() {
        const user = window.CRMAuth?.user;
        if (!user) return;
        const name = document.getElementById('crm-mobile-user-name');
        const role = document.getElementById('crm-mobile-user-role');
        const roleNames = { manager: 'Менеджер', marketing: 'Маркетинг', workshop: 'Цех', guest: 'Гость' };
        if (name) name.textContent = user.name || user.username || user.email || 'Пользователь';
        if (role) role.textContent = roleNames[user.role] || user.role || 'CRM IDEAL FLOOR';
    }

    let crmPendingRequests = 0;
    let crmLoaderShowTimer = null;
    let crmLoaderLongTimer = null;
    let crmLoaderHideTimer = null;
    let crmRevealFrame = null;

    function ensureFeedbackShell() {
        if (!document.body) return;

        if (!document.getElementById('crm-network-progress')) {
            const progress = document.createElement('div');
            progress.id = 'crm-network-progress';
            progress.className = 'crm-network-progress';
            progress.setAttribute('aria-hidden', 'true');
            progress.innerHTML = '<div class="crm-network-progress-bar"></div>';
            document.body.appendChild(progress);
        }

        if (!document.getElementById('crm-loading-pill')) {
            const pill = document.createElement('div');
            pill.id = 'crm-loading-pill';
            pill.className = 'crm-loading-pill';
            pill.setAttribute('role', 'status');
            pill.setAttribute('aria-live', 'polite');
            pill.innerHTML = '<span class="crm-loading-pill-spinner"></span><span class="crm-loading-pill-text">Загружаем данные…</span>';
            document.body.appendChild(pill);
        }

        if (!document.getElementById('crm-toast-stack')) {
            const existing = document.getElementById('toast-container-custom');
            const stack = existing || document.createElement('div');
            stack.id = existing ? existing.id : 'crm-toast-stack';
            stack.classList.add('crm-toast-stack');
            stack.setAttribute('aria-live', 'polite');
            stack.setAttribute('aria-atomic', 'false');
            if (!existing) document.body.appendChild(stack);
        }
    }

    function startNetworkActivity() {
        crmPendingRequests += 1;
        if (crmPendingRequests !== 1) return;

        clearTimeout(crmLoaderHideTimer);
        clearTimeout(crmLoaderShowTimer);
        clearTimeout(crmLoaderLongTimer);

        crmLoaderShowTimer = setTimeout(() => {
            ensureFeedbackShell();
            const progress = document.getElementById('crm-network-progress');
            if (progress && crmPendingRequests > 0) {
                progress.classList.remove('is-done');
                progress.classList.add('is-visible', 'is-loading');
            }
        }, 260);

        crmLoaderLongTimer = setTimeout(() => {
            ensureFeedbackShell();
            const pill = document.getElementById('crm-loading-pill');
            if (pill && crmPendingRequests > 0) pill.classList.add('is-visible');
        }, 900);
    }

    function stopNetworkActivity() {
        crmPendingRequests = Math.max(0, crmPendingRequests - 1);
        if (crmPendingRequests > 0) return;

        clearTimeout(crmLoaderShowTimer);
        clearTimeout(crmLoaderLongTimer);

        const progress = document.getElementById('crm-network-progress');
        const pill = document.getElementById('crm-loading-pill');
        if (pill) pill.classList.remove('is-visible');

        if (progress && progress.classList.contains('is-visible')) {
            progress.classList.remove('is-loading');
            progress.classList.add('is-done');
            crmLoaderHideTimer = setTimeout(() => {
                progress.classList.remove('is-visible', 'is-done');
            }, 300);
        }
    }

    function normalizeToastType(type) {
        const value = String(type || 'success').toLowerCase();
        if (value === 'danger') return 'error';
        if (['success', 'error', 'warning', 'info'].includes(value)) return value;
        return 'info';
    }

    function showToast(message, type = 'success', options = {}) {
        ensureFeedbackShell();
        const stack = document.getElementById('crm-toast-stack') || document.getElementById('toast-container-custom');
        if (!stack) return null;

        const toastType = normalizeToastType(type);
        const titles = {
            success: 'Готово',
            error: 'Не удалось выполнить',
            warning: 'Обратите внимание',
            info: 'Информация'
        };
        const icons = {
            success: 'check-lg',
            error: 'exclamation-triangle',
            warning: 'exclamation-circle',
            info: 'info-lg'
        };

        const duration = Math.max(1800, Number(options.duration) || (toastType === 'error' ? 5200 : 3600));
        const toast = document.createElement('div');
        toast.className = `crm-toast crm-toast-${toastType}`;
        toast.style.setProperty('--toast-duration', duration + 'ms');
        toast.setAttribute('role', toastType === 'error' ? 'alert' : 'status');

        const icon = document.createElement('span');
        icon.className = 'crm-toast-icon';
        icon.innerHTML = `<i class="bi bi-${icons[toastType]}"></i>`;

        const copy = document.createElement('span');
        copy.className = 'crm-toast-copy';

        const title = document.createElement('span');
        title.className = 'crm-toast-title';
        title.textContent = options.title || titles[toastType];

        const body = document.createElement('span');
        body.className = 'crm-toast-message';
        body.textContent = String(message || '');

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'crm-toast-close';
        close.setAttribute('aria-label', 'Закрыть');
        close.innerHTML = '<i class="bi bi-x-lg"></i>';

        const progress = document.createElement('span');
        progress.className = 'crm-toast-progress';

        copy.append(title, body);
        toast.append(icon, copy, close, progress);
        stack.prepend(toast);

        // Не даём уведомлениям бесконечно накапливаться.
        Array.from(stack.querySelectorAll('.crm-toast')).slice(4).forEach(old => old.remove());

        let removeTimer = null;
        const dismiss = () => {
            if (!toast.isConnected || toast.classList.contains('is-out')) return;
            clearTimeout(removeTimer);
            toast.classList.remove('is-in');
            toast.classList.add('is-out');
            setTimeout(() => toast.remove(), 220);
        };

        close.addEventListener('click', dismiss);
        toast.addEventListener('mouseenter', () => {
            progress.style.animationPlayState = 'paused';
            clearTimeout(removeTimer);
        });
        toast.addEventListener('mouseleave', () => {
            progress.style.animationPlayState = 'running';
            removeTimer = setTimeout(dismiss, Math.min(1800, duration));
        });

        requestAnimationFrame(() => toast.classList.add('is-in'));
        removeTimer = setTimeout(dismiss, duration);
        return toast;
    }

    function setButtonLoading(button, loading = true, label = '') {
        if (!button) return;
        if (loading) {
            if (!button.dataset.crmOriginalHtml) button.dataset.crmOriginalHtml = button.innerHTML;
            button.classList.add('crm-btn-busy');
            button.disabled = true;
            if (label) button.textContent = label;
        } else {
            button.classList.remove('crm-btn-busy');
            button.disabled = false;
            if (button.dataset.crmOriginalHtml) {
                button.innerHTML = button.dataset.crmOriginalHtml;
                delete button.dataset.crmOriginalHtml;
            }
        }
    }

    function revealMotionElements(root = document) {
        const selector = [
            '.cc-kpi-card',
            '.dealer-v3-card',
            '.attention-item',
            '.cc-event-item',
            '.task-item-modern',
            '.sales-summary-group',
            '.reclamation-card',
            '.product-card',
            '.app-panel',
            '.card'
        ].join(',');

        const elements = [];
        if (root.nodeType === 1 && root.matches?.(selector)) elements.push(root);
        root.querySelectorAll?.(selector).forEach(el => elements.push(el));

        elements.slice(0, 40).forEach((el, index) => {
            if (el.dataset.crmMotionReady === '1') return;
            el.dataset.crmMotionReady = '1';
            el.classList.add('crm-reveal');
            el.style.transitionDelay = Math.min(index, 8) * 18 + 'ms';
            requestAnimationFrame(() => {
                el.classList.add('crm-reveal-in');
                setTimeout(() => {
                    el.classList.remove('crm-reveal', 'crm-reveal-in');
                    el.style.transitionDelay = '';
                }, 520);
            });
        });
    }

    function scheduleReveal(root = document) {
        cancelAnimationFrame(crmRevealFrame);
        crmRevealFrame = requestAnimationFrame(() => revealMotionElements(root));
    }

    const crmPrefetchedPages = new Set();
    const crmPrefetchedDealers = new Set();

    function crmInternalUrl(anchor) {
        if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return null;
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return null;
        try {
            const url = new URL(anchor.href, window.location.href);
            return url.origin === window.location.origin ? url : null;
        } catch (_) {
            return null;
        }
    }

    function prefetchDealerProfile(url) {
        if (url.pathname !== '/dealer.html') return;
        const dealerId = url.searchParams.get('id');
        if (!dealerId || crmPrefetchedDealers.has(dealerId)) return;
        crmPrefetchedDealers.add(dealerId);

        window.fetch(`/api/dealers/${encodeURIComponent(dealerId)}?view=profile`, { crmTrackLoading: false, keepalive: true })
            .then(response => response.ok ? response.json() : null)
            .then(data => {
                if (!data) return;
                try {
                    sessionStorage.setItem(`crm:dealer-profile:${dealerId}`, JSON.stringify({
                        savedAt: Date.now(),
                        data
                    }));
                } catch (_) {}
            })
            .catch(() => {});
    }

    function prefetchInternalPage(anchor) {
        const url = crmInternalUrl(anchor);
        if (!url) return;

        prefetchDealerProfile(url);

        const key = url.pathname + url.search;
        if (crmPrefetchedPages.has(key) || key === window.location.pathname + window.location.search) return;
        crmPrefetchedPages.add(key);

        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url.href;
        link.as = 'document';
        document.head.appendChild(link);
    }

    function beginSeamlessNavigation(anchor, event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const url = crmInternalUrl(anchor);
        if (!url) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;

        if (url.pathname === '/dealer.html' && window.location.pathname !== '/dealer.html') {
            try { sessionStorage.setItem('crm:dealerReturnTo', window.location.href); } catch (_) {}
        }

        ensureFeedbackShell();
        document.body.classList.add('crm-page-leaving');
        const progress = document.getElementById('crm-network-progress');
        if (progress) {
            progress.classList.remove('is-done');
            progress.classList.add('is-visible', 'is-loading');
        }
    }

    function initSeamlessNavigation() {
        if (document.documentElement.dataset.crmNavigationReady === '1') return;
        document.documentElement.dataset.crmNavigationReady = '1';

        document.addEventListener('pointerover', event => {
            const anchor = event.target.closest?.('a[href]');
            if (anchor) prefetchInternalPage(anchor);
        }, { passive: true });

        document.addEventListener('touchstart', event => {
            const anchor = event.target.closest?.('a[href]');
            if (anchor) prefetchInternalPage(anchor);
        }, { passive: true });

        document.addEventListener('click', event => {
            const anchor = event.target.closest?.('a[href]');
            if (anchor) beginSeamlessNavigation(anchor, event);
        }, true);

        window.addEventListener('pageshow', () => {
            document.body?.classList.remove('crm-page-leaving');
            const progress = document.getElementById('crm-network-progress');
            if (progress) progress.classList.remove('is-visible', 'is-loading', 'is-done');
        });
    }

    function initInteractionLayer() {
        if (!document.body || document.body.dataset.crmUiReady === '1') return;
        document.body.dataset.crmUiReady = '1';
        document.body.classList.add('crm-ui-enhanced');
        initSeamlessNavigation();
        ensureFeedbackShell();
        scheduleReveal(document);

        if (!window.__crmOriginalAlert) {
            window.__crmOriginalAlert = window.alert.bind(window);
            window.alert = message => {
                const text = String(message || '');
                const lower = text.toLowerCase();
                const type = /ошиб|не удалось|невозмож|слишком больш|нет доступа/.test(lower)
                    ? 'error'
                    : /вниман|предупреж|не заполн|не задан/.test(lower)
                        ? 'warning'
                        : 'info';
                showToast(text, type);
            };
        }

        document.addEventListener('submit', event => {
            const submitter = event.submitter;
            if (!submitter || submitter.disabled) return;
            submitter.classList.add('crm-saving-pulse');
            setTimeout(() => submitter.classList.remove('crm-saving-pulse'), 900);
        }, true);

        const observer = new MutationObserver(mutations => {
            const added = mutations.flatMap(mutation => Array.from(mutation.addedNodes || []))
                .find(node => node && node.nodeType === 1);
            if (added) scheduleReveal(document);
        });
        observer.observe(document.body, { childList: true, subtree: true });

        function closeTransientOverlays() {
            document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                const toggle = menu.parentElement?.querySelector('[data-bs-toggle="dropdown"]');
                try {
                    if (toggle && window.bootstrap?.Dropdown) {
                        const instance = bootstrap.Dropdown.getInstance(toggle) || bootstrap.Dropdown.getOrCreateInstance(toggle);
                        instance.hide();
                    }
                } catch (_) {}
                menu.classList.remove('show');
            });
            document.querySelectorAll('[data-bs-toggle="dropdown"].show').forEach(toggle => {
                toggle.classList.remove('show');
                toggle.setAttribute('aria-expanded', 'false');
            });
            document.querySelectorAll('.dropdown.show').forEach(dropdown => dropdown.classList.remove('show'));
            document.querySelectorAll('.multi-select-menu.show').forEach(menu => menu.classList.remove('show'));

            const globalSearch = document.querySelector('.global-search-overlay.open');
            if (globalSearch) {
                globalSearch.classList.remove('open');
                globalSearch.setAttribute('aria-hidden', 'true');
            }

            const sheetBackdrop = document.querySelector('.crm-mobile-sheet-backdrop.open');
            if (sheetBackdrop) sheetBackdrop.classList.remove('open');
            document.body.classList.remove('crm-mobile-sheet-open');
        }

        document.addEventListener('click', event => {
            if (event.target.closest('.dropdown-menu a, .dropdown-menu button')) {
                closeTransientOverlays();
            }
        }, true);

        function syncModalStack(modalEl) {
            if (!modalEl) return;
            const shown = Array.from(document.querySelectorAll('.modal.show'));
            const index = Math.max(0, shown.indexOf(modalEl));
            const modalZ = 30010 + index * 20;
            modalEl.style.setProperty('z-index', String(modalZ), 'important');

            requestAnimationFrame(() => {
                const backdrops = Array.from(document.querySelectorAll('.modal-backdrop'));
                const backdrop = backdrops[backdrops.length - 1];
                if (backdrop) backdrop.style.setProperty('z-index', String(modalZ - 10), 'important');
            });
        }

        document.addEventListener('show.bs.modal', event => {
            closeTransientOverlays();
            document.body.classList.add('crm-modal-transitioning');

            const alreadyOpen = document.querySelectorAll('.modal.show').length;
            const modalZ = 30010 + alreadyOpen * 20;
            event.target.style.setProperty('z-index', String(modalZ), 'important');

            requestAnimationFrame(() => {
                const backdrops = Array.from(document.querySelectorAll('.modal-backdrop'));
                const backdrop = backdrops[backdrops.length - 1];
                if (backdrop) backdrop.style.setProperty('z-index', String(modalZ - 10), 'important');
            });

            scheduleReveal(event.target);
        });

        document.addEventListener('shown.bs.modal', event => {
            document.body.classList.remove('crm-modal-transitioning');
            syncModalStack(event.target);
            scheduleReveal(event.target);
        });

        document.addEventListener('hidden.bs.modal', event => {
            event.target.style.removeProperty('z-index');

            const remaining = Array.from(document.querySelectorAll('.modal.show'));
            if (remaining.length) {
                document.body.classList.add('modal-open');
                remaining.forEach(syncModalStack);
            } else {
                document.body.classList.remove('crm-modal-transitioning');
            }
        });
    }

    async function apiFetch(url, options) {
        options = options || {};
        options.headers = options.headers || {};
        const token = getToken();
        if (token) options.headers.Authorization = 'Bearer ' + token;

        const trackLoading = options.crmTrackLoading !== false;
        if (trackLoading) startNetworkActivity();

        try {
            const response = await window.__crmOriginalFetch(url, options);
            if (response.status === 401) {
                logout();
                throw new Error('Сессия завершена');
            }
            return response;
        } finally {
            if (trackLoading) stopNetworkActivity();
        }
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
        const names = { manager: 'Менеджер', marketing: 'Маркетинг', workshop: 'Цех', guest: 'Гость' };
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
                ['/workshop.html', 'can_view_workshop'],
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

        renderMobileNavigation();
        applyNavigation();
        applyRoleBadge();
        updateMobileUserInfo();
        return window.CRMAuth.user;
    }

    // Меню строится синхронно до DOMContentLoaded, чтобы все страницы
    // получили один и тот же набор пунктов и порядок.
    renderTopNavigation();

    window.__crmOriginalFetch = window.fetch.bind(window);
    window.fetch = apiFetch;

    let crmCachedUser = null;
    try {
        crmCachedUser = JSON.parse(localStorage.getItem('crm_user') || 'null');
    } catch (_) {
        crmCachedUser = null;
    }

    window.CRMAuth = {
        user: crmCachedUser,
        ready: null,
        can,
        logout,
        applyNavigation,
        renderTopNavigation,
        renderMobileNavigation,
        init
    };

    window.showToast = showToast;
    window.CRMUI = {
        showToast,
        setButtonLoading,
        startLoading: startNetworkActivity,
        stopLoading: stopNetworkActivity,
        reveal: scheduleReveal
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInteractionLayer, { once: true });
    } else {
        initInteractionLayer();
    }

    window.CRMAuth.ready = init().catch(err => {
        console.error('CRM auth init error:', err);
    });
})();