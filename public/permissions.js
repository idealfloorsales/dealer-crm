(function () {
    const CRM_LIGHT_THEMES = {
        clean: { label:'Белая', icon:'circle-fill' },
        warm: { label:'Тёплая', icon:'sun' },
        cool: { label:'Холодная', icon:'snow' },
        pearl: { label:'Жемчужная', icon:'gem' }
    };

    function currentLightTheme() {
        const saved = localStorage.getItem('crm_light_theme') || 'clean';
        return CRM_LIGHT_THEMES[saved] ? saved : 'clean';
    }

    function applyLightTheme(theme) {
        const key = CRM_LIGHT_THEMES[theme] ? theme : 'clean';
        document.documentElement.dataset.crmTheme = key;
        localStorage.setItem('crm_light_theme', key);
        document.querySelectorAll('[data-crm-theme-choice]').forEach(button => {
            button.classList.toggle('active', button.dataset.crmThemeChoice === key);
            button.setAttribute('aria-pressed', button.dataset.crmThemeChoice === key ? 'true' : 'false');
        });
        const label = document.querySelector('[data-crm-theme-label]');
        if (label) label.textContent = CRM_LIGHT_THEMES[key].label;
    }

    applyLightTheme(currentLightTheme());

    function ensureThemeStyles() {
        if (document.getElementById('crm-light-theme-styles')) return;
        const style = document.createElement('style');
        style.id = 'crm-light-theme-styles';
        style.textContent = `
          :root[data-crm-theme="clean"]{--crm-theme-bg:#f3f4f6;--crm-theme-surface:#fff;--crm-theme-soft:#f8f8f9;--crm-theme-border:#e6e7e9}
          :root[data-crm-theme="warm"]{--crm-theme-bg:#f4f0eb;--crm-theme-surface:#fffdf9;--crm-theme-soft:#f7f1ea;--crm-theme-border:#e7ddd2}
          :root[data-crm-theme="cool"]{--crm-theme-bg:#eef3f7;--crm-theme-surface:#fbfdff;--crm-theme-soft:#f1f6fa;--crm-theme-border:#dce6ed}
          :root[data-crm-theme="pearl"]{--crm-theme-bg:#f0f0f2;--crm-theme-surface:#fdfdfd;--crm-theme-soft:#f5f5f6;--crm-theme-border:#dedfe2}
          body{background-color:var(--crm-theme-bg,var(--bg-light))!important}
          .crm-topbar{background:color-mix(in srgb,var(--crm-theme-surface,#fff) 96%,transparent)!important}
          .crm-mobile-nav,.crm-mobile-sheet,.dealer-form-content,.app-workspace-card,.cc-card,.card{
            border-color:var(--crm-theme-border,#e6e7e9)!important;
          }
          .crm-mobile-nav{background:color-mix(in srgb,var(--crm-theme-surface,#fff) 96%,transparent)!important}
          .crm-mobile-sheet{background:var(--crm-theme-bg,#f7f5f2)!important}
          .crm-mobile-sheet-link,.crm-mobile-sheet-account{background:var(--crm-theme-surface,#fff)!important}
          .crm-theme-row{margin-top:10px;padding:11px 12px;border:1px solid var(--crm-theme-border,#e5e5e5);border-radius:15px;background:var(--crm-theme-surface,#fff)}
          .crm-theme-row-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
          .crm-theme-row-head strong{font-size:.68rem;color:#4b4d52}
          .crm-theme-row-head small{font-size:.55rem;color:#9a9ca1}
          .crm-theme-options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
          .crm-theme-choice{min-height:48px;padding:5px;border:1px solid var(--crm-theme-border,#dedede);border-radius:11px;background:var(--crm-theme-soft,#f7f7f7);color:#73757a;font-size:.52rem;font-weight:700}
          .crm-theme-choice i{display:block;margin-bottom:3px;font-size:.8rem}
          .crm-theme-choice.active{border-color:#b9040a;background:#fff1f1;color:#a20a10}
          .crm-theme-desktop{display:grid;place-items:center;width:36px;height:36px;border:1px solid rgba(23,24,27,.08);border-radius:11px;background:var(--crm-theme-surface,#fff);color:#77797e}
        `;
        document.head.appendChild(style);
    }
    ensureThemeStyles();

    function ensureMotionStyles() {
        if (document.getElementById('crm-motion-styles')) return;
        const link = document.createElement('link');
        link.id = 'crm-motion-styles';
        link.rel = 'stylesheet';
        link.href = '/ui-motion.css?v={{VER}}';
        document.head.appendChild(link);
    }
    ensureMotionStyles();

    function ensureAppHead() {
        if (!document.querySelector('link[rel="manifest"]')) {
            const manifest = document.createElement('link');
            manifest.rel = 'manifest';
            manifest.href = '/manifest.json';
            document.head.appendChild(manifest);
        }
        if (!document.querySelector('meta[name="theme-color"]')) {
            const theme = document.createElement('meta');
            theme.name = 'theme-color';
            theme.content = '#b9040a';
            document.head.appendChild(theme);
        }
    }
    ensureAppHead();

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
        '/pricing.html': 'can_view_pricing',
        '/dealer.html': 'can_view_dealers',
        '/users.html': 'can_manage_users',
        '/audit.html': 'can_manage_users'
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
        '/pricing.html': 'can_view_pricing',
        '/users.html': 'can_manage_users',
        '/audit.html': 'can_manage_users'
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
        { path: '/pricing.html', label: 'Цены', permission: 'can_view_pricing', icon: 'percent' },
        { path: '/users.html', label: 'Сотрудники', permission: 'can_manage_users', icon: 'people' },
        { path: '/audit.html', label: 'Журнал', permission: 'can_manage_users', icon: 'clock-history' }
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

        nav.classList.add('desktop-nav', 'crm-topbar');
        const currentPath = getCurrentNavPath();
        const currentItem = NAV_ITEMS.find(item => item.path === currentPath);
        const pageLabel = currentItem?.label || 'CRM';

        const itemsHtml = NAV_ITEMS.map(item => {
            const active = item.path === currentPath;
            return `
                <li class="nav-item" data-permission="${item.permission}">
                    <a class="nav-link${active ? ' active fw-bold' : ''}" href="${item.path}">${item.label}</a>
                </li>`;
        }).join('');

        nav.innerHTML = `
            <div class="container-fluid crm-topbar-inner">
                <a class="navbar-brand crm-topbar-brand" href="/" aria-label="IDEAL FLOOR CRM">
                    <img src="logo.png" alt="IDEAL FLOOR CRM" height="40">
                </a>

                <div class="crm-topbar-mobile-context" aria-label="Текущий раздел">
                    <span class="crm-topbar-mobile-kicker">IDEAL FLOOR CRM</span>
                    <strong>${pageLabel}</strong>
                </div>

                <div class="crm-topbar-desktop-content">
                    <ul class="navbar-nav me-auto">
                        ${itemsHtml}
                    </ul>
                    <div class="crm-topbar-account">
                        <button type="button" class="crm-theme-desktop" id="crm-theme-cycle" title="Сменить светлую тему"><i class="bi bi-palette"></i></button>
                        <button type="button" class="crm-connection-chip" data-crm-network-status title="Состояние соединения">
                            <span class="crm-topbar-live-dot"></span><span data-crm-network-label>Связь</span>
                        </button>
                        <span id="user-role-badge" class="crm-role-badge">...</span>
                        <button id="logout-btn" class="crm-topbar-logout" type="button" title="Выйти">
                            <i class="bi bi-box-arrow-right"></i><span>Выход</span>
                        </button>
                    </div>
                </div>

                <button type="button" class="crm-topbar-mobile-status" data-crm-network-status aria-label="Состояние соединения">
                    <span class="crm-topbar-live-dot"></span>
                    <span data-crm-network-label>Связь</span>
                </button>
            </div>`;

        const logoutButton = document.getElementById('logout-btn');
        if (logoutButton) logoutButton.addEventListener('click', logout);
        const themeCycle = document.getElementById('crm-theme-cycle');
        if (themeCycle) themeCycle.addEventListener('click', () => {
            const keys = Object.keys(CRM_LIGHT_THEMES);
            const current = currentLightTheme();
            const next = keys[(keys.indexOf(current) + 1) % keys.length];
            applyLightTheme(next);
            showToast('Тема: ' + CRM_LIGHT_THEMES[next].label, 'info', { duration:1800 });
        });
    }


    const crmNetwork = {
        state: 'checking',
        lastSuccessAt: 0,
        lastFailureAt: 0,
        lastLatency: null
    };

    function networkMeta(state) {
        const states = {
            checking: { label: 'Связь…', title: 'Проверяем соединение' },
            online: { label: 'Онлайн', title: 'Связь с CRM работает' },
            slow: { label: 'Медленно', title: 'Связь есть, но сервер отвечает медленно' },
            unstable: { label: 'Нестабильно', title: 'Соединение нестабильно. Данные могут загружаться дольше обычного' },
            offline: { label: 'Нет сети', title: 'Нет соединения. Доступны только уже закэшированные экраны' },
            server: { label: 'Сервер', title: 'Интернет доступен, но CRM-сервер временно не отвечает' }
        };
        return states[state] || states.checking;
    }

    function setNetworkState(state, latency) {
        crmNetwork.state = state;
        if (Number.isFinite(latency)) crmNetwork.lastLatency = latency;
        const meta = networkMeta(state);
        document.documentElement.dataset.crmNetwork = state;
        document.querySelectorAll('[data-crm-network-status]').forEach(chip => {
            chip.dataset.state = state;
            chip.title = meta.title;
            chip.setAttribute('aria-label', meta.title);
            const label = chip.querySelector('[data-crm-network-label]');
            if (label) label.textContent = meta.label;
        });
    }

    function markNetworkSuccess(latency) {
        crmNetwork.lastSuccessAt = Date.now();
        setNetworkState(Number.isFinite(latency) && latency > 3500 ? 'slow' : 'online', latency);
    }

    function markNetworkFailure(kind = 'unstable') {
        crmNetwork.lastFailureAt = Date.now();
        const state = navigator.onLine === false ? 'offline' : kind;
        setNetworkState(state);
    }

    function showNetworkDetails() {
        const meta = networkMeta(crmNetwork.state);
        let detail = meta.title;
        if (Number.isFinite(crmNetwork.lastLatency) && crmNetwork.state !== 'offline') {
            detail += ` · ${Math.max(1, Math.round(crmNetwork.lastLatency))} мс`;
        }
        showToast(detail, crmNetwork.state === 'online' ? 'success' : crmNetwork.state === 'slow' ? 'warning' : 'info', {
            title: 'Соединение'
        });
    }

    function initConnectivityLayer() {
        setNetworkState(navigator.onLine === false ? 'offline' : 'checking');
        window.addEventListener('offline', () => setNetworkState('offline'));
        window.addEventListener('online', () => setNetworkState('checking'));
        document.addEventListener('click', event => {
            if (event.target.closest?.('[data-crm-network-status]')) showNetworkDetails();
        });
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator) || window.location.protocol !== 'https:') return;
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(error => {
                console.warn('CRM service worker registration failed:', error);
            });
        }, { once: true });
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
                <span>Меню</span>
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
                    <div class="crm-theme-row">
                        <div class="crm-theme-row-head"><strong>Светлая тема</strong><small data-crm-theme-label>${CRM_LIGHT_THEMES[currentLightTheme()].label}</small></div>
                        <div class="crm-theme-options">
                            ${Object.entries(CRM_LIGHT_THEMES).map(([key,item]) => `<button type="button" class="crm-theme-choice${currentLightTheme()===key ? ' active' : ''}" data-crm-theme-choice="${key}"><i class="bi bi-${item.icon}"></i>${item.label}</button>`).join('')}
                        </div>
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
        backdrop.querySelectorAll('[data-crm-theme-choice]').forEach(button => {
            button.addEventListener('click', () => applyLightTheme(button.dataset.crmThemeChoice));
        });
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

    const CRM_CONTEXT_VERSION = 2;
    const CRM_CONTEXT_CONTROL_SELECTOR = [
        'input[id*="filter"]',
        'select[id*="filter"]',
        'textarea[id*="filter"]',
        'input[id*="search"]',
        'select[id*="search"]',
        'select[id*="sort"]',
        'input[id*="sort"]',
        '#month-picker',
        '[data-crm-context]'
    ].join(',');
    const CRM_CONTEXT_VIEW_ATTRS = [
        'data-pricing-view',
        'data-report-view',
        'data-stock-view',
        'data-ws-tab',
        'data-stock-view-tab',
        'data-view'
    ];

    function crmContextKey() {
        return 'crm_ui_context_v' + CRM_CONTEXT_VERSION + ':' + window.location.pathname;
    }

    function readPageContext() {
        try {
            const parsed = JSON.parse(sessionStorage.getItem(crmContextKey()) || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    function writePageContext(context) {
        try {
            sessionStorage.setItem(crmContextKey(), JSON.stringify({
                ...context,
                path:window.location.pathname,
                updatedAt:Date.now()
            }));
        } catch (_) {}
    }

    function isContextControl(element) {
        if (!element?.matches?.(CRM_CONTEXT_CONTROL_SELECTOR)) return false;
        if (element.closest('.modal')) return false;
        if (element.disabled) return false;
        if (element.type === 'password' || element.type === 'file' || element.type === 'hidden') return false;
        return Boolean(element.id || element.name || element.dataset.crmContext);
    }

    function contextControlKey(element) {
        if (element.id) return '#' + element.id;
        if (element.name) return '[name="' + String(element.name).replace(/"/g, '\\"') + '"]';
        return '[data-crm-context="' + String(element.dataset.crmContext || '').replace(/"/g, '\\"') + '"]';
    }

    function readControlValue(element) {
        if (element.type === 'checkbox' || element.type === 'radio') return Boolean(element.checked);
        return element.value ?? '';
    }

    function writeControlValue(element, value) {
        if (!element) return false;
        if (element.type === 'checkbox' || element.type === 'radio') {
            const wanted = Boolean(value);
            if (element.checked === wanted) return false;
            element.checked = wanted;
            return true;
        }
        const wanted = String(value ?? '');
        if (element.tagName === 'SELECT' && ![...element.options].some(option => String(option.value) === wanted)) {
            return false;
        }
        if (String(element.value ?? '') === wanted) return false;
        element.value = wanted;
        return true;
    }

    function saveControlToContext(element) {
        if (!isContextControl(element)) return;
        const context = readPageContext();
        context.controls = context.controls || {};
        context.controls[contextControlKey(element)] = readControlValue(element);
        writePageContext(context);
    }

    function capturePageContext() {
        const context = readPageContext();
        context.controls = context.controls || {};
        document.querySelectorAll(CRM_CONTEXT_CONTROL_SELECTOR).forEach(element => {
            if (!isContextControl(element)) return;
            context.controls[contextControlKey(element)] = readControlValue(element);
        });
        context.scroll = {
            x:window.scrollX || 0,
            y:window.scrollY || document.documentElement.scrollTop || 0
        };
        writePageContext(context);
        return context;
    }

    function restoreContextControls({ notify = true } = {}) {
        const context = readPageContext();
        const controls = context.controls || {};
        Object.entries(controls).forEach(([selector,value]) => {
            let element = null;
            try { element = document.querySelector(selector); } catch (_) { return; }
            if (!isContextControl(element)) return;
            const changed = writeControlValue(element, value);
            if (changed && notify) {
                const eventName = element.tagName === 'SELECT' || element.type === 'checkbox' || element.type === 'radio'
                    ? 'change'
                    : 'input';
                element.dispatchEvent(new Event(eventName, { bubbles:true }));
            }
        });
    }

    function viewContextSelector(attr, value) {
        const escaped = String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return '[' + attr + '="' + escaped + '"]';
    }

    function saveViewToContext(element) {
        if (!element) return;
        const context = readPageContext();
        context.views = context.views || {};
        for (const attr of CRM_CONTEXT_VIEW_ATTRS) {
            if (element.hasAttribute(attr)) {
                context.views[attr] = element.getAttribute(attr) || '';
                writePageContext(context);
                return;
            }
        }
    }

    function restoreContextViews() {
        const context = readPageContext();
        const views = context.views || {};
        Object.entries(views).forEach(([attr,value]) => {
            if (!CRM_CONTEXT_VIEW_ATTRS.includes(attr)) return;
            let target = null;
            try { target = document.querySelector(viewContextSelector(attr,value)); } catch (_) { return; }
            if (!target || target.closest('.modal')) return;
            const alreadyActive = target.classList.contains('active') ||
                target.getAttribute('aria-selected') === 'true' ||
                target.getAttribute('aria-pressed') === 'true';
            if (!alreadyActive) target.click();
        });

        if (context.bootstrapTab) {
            let tab = null;
            try { tab = document.querySelector(context.bootstrapTab); } catch (_) {}
            if (tab && !tab.closest('.modal')) {
                try {
                    if (window.bootstrap?.Tab) bootstrap.Tab.getOrCreateInstance(tab).show();
                    else tab.click();
                } catch (_) {}
            }
        }
    }

    function restoreContextScroll() {
        const context = readPageContext();
        const scroll = context.scroll;
        if (!scroll || !Number.isFinite(Number(scroll.y))) return;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                window.scrollTo({
                    left:Math.max(0, Number(scroll.x) || 0),
                    top:Math.max(0, Number(scroll.y) || 0),
                    behavior:'auto'
                });
            });
        });
    }

    function clearPageContext({ keepScroll = false } = {}) {
        if (!keepScroll) {
            try { sessionStorage.removeItem(crmContextKey()); } catch (_) {}
            return;
        }
        const context = readPageContext();
        writePageContext({ scroll:context.scroll || {x:0,y:0} });
    }

    function initPageContextLayer() {
        if (!document.body || document.body.dataset.crmContextReady === '1') return;
        document.body.dataset.crmContextReady = '1';

        let scrollTimer = null;
        const rememberScroll = () => {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                const context = readPageContext();
                context.scroll = {
                    x:window.scrollX || 0,
                    y:window.scrollY || document.documentElement.scrollTop || 0
                };
                writePageContext(context);
            }, 120);
        };

        document.addEventListener('input', event => saveControlToContext(event.target), true);
        document.addEventListener('change', event => saveControlToContext(event.target), true);
        window.addEventListener('scroll', rememberScroll, { passive:true });

        document.addEventListener('click', event => {
            const view = event.target.closest(CRM_CONTEXT_VIEW_ATTRS.map(attr => '[' + attr + ']').join(','));
            if (view && !view.closest('.modal')) saveViewToContext(view);

            const reset = event.target.closest(
                '#dealer-reset-filters,#report-reset-filters,#reset-filters,#product-reset-filters,#rec-reset-filters,#map-reset-filters,[data-reset-filters],[data-crm-context-reset]'
            );
            if (reset) {
                setTimeout(() => {
                    const context = readPageContext();
                    context.controls = {};
                    context.views = context.views || {};
                    document.querySelectorAll(CRM_CONTEXT_CONTROL_SELECTOR).forEach(element => {
                        if (isContextControl(element)) {
                            context.controls[contextControlKey(element)] = readControlValue(element);
                        }
                    });
                    writePageContext(context);
                }, 0);
            }
        }, true);

        document.addEventListener('shown.bs.tab', event => {
            const tab = event.target;
            if (!tab || tab.closest('.modal')) return;
            const id = tab.id ? '#' + tab.id : null;
            const target = tab.getAttribute('data-bs-target') || tab.getAttribute('href');
            const selector = id || (target ? '[data-bs-target="' + String(target).replace(/"/g, '\\"') + '"]' : null);
            if (!selector) return;
            const context = readPageContext();
            context.bootstrapTab = selector;
            writePageContext(context);
        });

        window.addEventListener('pagehide', capturePageContext);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') capturePageContext();
        });

        const restore = () => {
            restoreContextControls({ notify:true });
            restoreContextViews();
            restoreContextScroll();
        };

        setTimeout(restore, 80);
        setTimeout(restore, 350);
        setTimeout(restore, 900);

        let mutationTimer = null;
        const observer = new MutationObserver(mutations => {
            const relevant = mutations.some(mutation => {
                const target = mutation.target;
                if (!target?.closest) return false;
                return Boolean(
                    target.matches?.(CRM_CONTEXT_CONTROL_SELECTOR) ||
                    target.closest(CRM_CONTEXT_CONTROL_SELECTOR) ||
                    Array.from(mutation.addedNodes || []).some(node =>
                        node?.nodeType === 1 && (
                            node.matches?.(CRM_CONTEXT_CONTROL_SELECTOR) ||
                            node.querySelector?.(CRM_CONTEXT_CONTROL_SELECTOR)
                        )
                    )
                );
            });
            if (!relevant) return;
            clearTimeout(mutationTimer);
            mutationTimer = setTimeout(() => restoreContextControls({ notify:true }), 40);
        });
        observer.observe(document.body, { childList:true, subtree:true });
    }

    function initInteractionLayer() {
        if (!document.body || document.body.dataset.crmUiReady === '1') return;
        document.body.dataset.crmUiReady = '1';
        document.body.classList.add('crm-ui-enhanced');
        initSeamlessNavigation();
        initPageContextLayer();
        ensureFeedbackShell();
        initConnectivityLayer();
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
        const startedAt = performance.now();
        if (trackLoading) startNetworkActivity();

        try {
            const response = await window.__crmOriginalFetch(url, options);
            const latency = performance.now() - startedAt;

            if (response.status >= 500) {
                markNetworkFailure('server');
            } else {
                markNetworkSuccess(latency);
            }

            if (response.status === 401) {
                logout();
                throw new Error('Сессия завершена');
            }
            return response;
        } catch (error) {
            markNetworkFailure(navigator.onLine === false ? 'offline' : 'unstable');
            throw error;
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
        if (!window.CRMAuth.user) return;
        const user = window.CRMAuth.user;
        const names = { manager: 'Менеджер', marketing: 'Маркетинг', workshop: 'Цех', guest: 'Гость' };
        const label = names[user.role] || user.role || 'Пользователь';
        const badge = document.getElementById('user-role-badge');
        if (badge) badge.textContent = label;
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
                ['/users.html', 'can_manage_users'],
                ['/audit.html', 'can_manage_users']
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
    registerServiceWorker();

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
        reveal: scheduleReveal,
        captureContext: capturePageContext,
        restoreContext: () => {
            restoreContextControls({ notify:true });
            restoreContextViews();
            restoreContextScroll();
        },
        clearContext: clearPageContext
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