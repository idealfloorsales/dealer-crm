document.addEventListener('DOMContentLoaded', () => {
    
    // UI Elements
    const contactsListContainer = document.getElementById('dealer-contacts-list'); 
    const bonusesContainer = document.getElementById('dealer-bonuses');
    const photoGalleryContainer = document.getElementById('dealer-photo-gallery'); 
    const deliveryContainer = document.getElementById('dealer-delivery'); 
    const linksContainer = document.getElementById('dealer-links'); 
    const addressesListContainer = document.getElementById('dealer-addresses-list'); 
    const posListContainer = document.getElementById('dealer-pos-list'); 
    const visitsListContainer = document.getElementById('dealer-visits-list'); 
    const competitorsListContainer = document.getElementById('dealer-competitors-list'); 
    const productsStatsContainer = document.getElementById('dealer-products-stats');
    const salesHistoryContainer = document.getElementById('dealer-sales-history');
    const workshopAssetsContainer = document.getElementById('dealer-workshop-assets');
    
    const dealerNameEl = document.getElementById('dealer-name');
    const dealerIdEl = document.getElementById('dealer-id-subtitle');
    const dealerCityEl = document.getElementById('dealer-city-badge');
    const dealerStatusEl = document.getElementById('dealer-status-badge');
    const dealerAvatarImg = document.getElementById('dealer-avatar-img');
    const dealerScoreValueEl = document.getElementById('dealer-score-value');
    const dealerScoreLabelEl = document.getElementById('dealer-score-label');
    const dealerScoreBreakdownEl = document.getElementById('dealer-score-breakdown');
    const dealerSalesMonthEl = document.getElementById('dealer-sales-month');
    const dealerPlanProgressEl = document.getElementById('dealer-plan-progress');
    const dealerLastVisitEl = document.getElementById('dealer-last-visit');
    
    // Buttons
    const deleteBtn = document.getElementById('delete-dealer-btn'); 
    const editBtn = document.getElementById('edit-dealer-btn'); 
    const navigateBtn = document.getElementById('navigate-btn'); 
    const carouselInner = document.getElementById('carousel-inner');

    // API
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 
    const API_SALES_URL = '/api/sales';

    const params = new URLSearchParams(window.location.search);
    const dealerId = params.get('id');

    let dealerLat = null;
    let dealerLng = null;
    let galleryCarouselContent = '';
    let currentDealerName = '';
    let currentUserRole = 'guest';
    let currentDealerSales = [];
    let currentDealer = null;
    let photosLoaded = false;
    let catalogLoaded = false;
    let catalogPromise = null;
    let photoPromise = null;
    let editorReferencePromise = null;
    let editorStatuses = [];
    let editorSectors = [];
    const profileCacheKey = `crm:dealer-profile:${dealerId}`;

    if (!dealerId) { 
        if(dealerNameEl) dealerNameEl.textContent = 'Ошибка: ID не указан'; 
        return; 
    }

    const safeText = (text) => text ? text.toString().replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';
    const formatUrl = (url) => { if (!url) return null; if (!url.startsWith('http')) return 'https://' + url; return url; }
    
    const formatResponsible = (val) => {
        if (val === 'regional_astana') return 'Региональный Астана';
        if (val === 'regional_regions') return 'Региональный Регионы';
        if (val === 'office') return 'Офис / Прочее';
        return val || '---';
    };

    const statusLabels = {
        active: 'Активный',
        standard: 'Стандарт',
        potential: 'Потенциальный',
        problem: 'Проблемный',
        archive: 'Архив'
    };

    function can(permission) {
        return Boolean(window.CRMAuth && CRMAuth.can(permission));
    }

    function formatMetric(value) {
        const n = Number(value) || 0;
        return n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
    }

    async function loadDealerSales(dealer) {
        if (!can('can_view_sales')) return [];
        try {
            const res = await fetch(`${API_SALES_URL}?dealerId=${encodeURIComponent(dealerId)}`);
            if (!res.ok) return [];
            const rows = await res.json();
            const dealerKey = String(dealerId);
            const personalPlanKey = `PLAN_vip_${dealerKey}`;

            return rows.filter(s => {
                const rowDealerId = String(s.dealerId || '');
                if (rowDealerId === dealerKey) return true;
                return dealer?.hasPersonalPlan === true && rowDealerId === personalPlanKey;
            });
        } catch (e) {
            console.warn('Не удалось загрузить продажи дилера', e);
            return [];
        }
    }

    function renderDealerOverview(dealer, salesRows) {
        const canViewSales = can('can_view_sales');
        const month = new Date().toISOString().slice(0, 7);
        const monthRows = canViewSales ? salesRows.filter(s => s.month === month) : [];
        const totals = window.CRMScore && CRMScore.getSalesTotals
            ? CRMScore.getSalesTotals(monthRows)
            : {
                fact: monthRows.reduce((sum, row) => sum + (Number(row.fact) || 0), 0),
                plan: monthRows.reduce((sum, row) => sum + (Number(row.plan) || 0), 0)
            };
        const { fact, plan } = totals;

        const score = window.CRMScore
            ? CRMScore.calculateDealerScore({
                dealer,
                salesRows: monthRows,
                visits: dealer.visits || [],
                canViewSales,
                canViewVisits: true
            })
            : { score: 0, label: 'Нет оценки', level: 'problem', breakdown: {} };

        if (dealerScoreValueEl) dealerScoreValueEl.textContent = score.score;
        if (dealerScoreLabelEl) {
            dealerScoreLabelEl.textContent = score.label;
            dealerScoreLabelEl.className = `dealer-score-label score-${score.level}`;
        }

        if (dealerScoreBreakdownEl) {
            dealerScoreBreakdownEl.innerHTML = Object.values(score.breakdown).map(part => {
                const pct = part.max > 0 ? Math.round(part.score / part.max * 100) : 0;
                return `<div class="dealer-score-part" title="${safeText(part.note)}">
                    <div class="dealer-score-part-head">
                        <span>${safeText(part.label)}</span>
                        <strong>${part.score}/${part.max}</strong>
                    </div>
                    <div class="dealer-score-part-bar"><span style="width:${pct}%"></span></div>
                </div>`;
            }).join('');
        }

        if (dealerSalesMonthEl) {
            dealerSalesMonthEl.textContent = canViewSales ? formatMetric(fact) : 'Нет доступа';
        }

        if (dealerPlanProgressEl) {
            if (!canViewSales) dealerPlanProgressEl.textContent = 'Нет доступа';
            else if (plan > 0) dealerPlanProgressEl.textContent = `${Math.round(fact / plan * 100)}%`;
            else if (dealer.hasPersonalPlan) dealerPlanProgressEl.textContent = 'Не задан';
            else dealerPlanProgressEl.textContent = 'Без плана';
        }

        if (dealerLastVisitEl) {
            const lastVisit = window.CRMScore ? CRMScore.latestCompletedVisit(dealer.visits || []) : null;
            dealerLastVisitEl.textContent = lastVisit
                ? lastVisit._date.toLocaleDateString('ru-RU', { day:'numeric', month:'short', year:'numeric' })
                : 'Не было';
        }
    }

    function readCachedDealerProfile() {
        try {
            const raw = sessionStorage.getItem(profileCacheKey);
            if (!raw) return null;
            const cached = JSON.parse(raw);
            if (!cached || !cached.data || Date.now() - Number(cached.savedAt || 0) > 120000) return null;
            return cached.data;
        } catch (_) {
            return null;
        }
    }

    function cacheDealerProfile(dealer) {
        try {
            sessionStorage.setItem(profileCacheKey, JSON.stringify({ savedAt: Date.now(), data: dealer }));
        } catch (_) {}
    }

    async function loadDealerProfile(force = false) {
        if (!force) {
            const cached = readCachedDealerProfile();
            if (cached) return cached;
        }
        const url = `${API_DEALERS_URL}/${dealerId}?view=profile${force ? `&fresh=${Date.now()}` : ''}`;
        const response = await fetch(url, force ? { cache: 'no-store' } : undefined);
        if (!response.ok) throw new Error('Дилер не найден.');
        const dealer = await response.json();
        cacheDealerProfile(dealer);
        return dealer;
    }

    async function loadProductCount() {
        try {
            const response = await fetch(`${API_PRODUCTS_URL}/count`, { crmTrackLoading: false });
            if (!response.ok) return 0;
            const data = await response.json();
            return Number(data.count) || 0;
        } catch (_) {
            return 0;
        }
    }

    async function ensurePhotosLoaded() {
        if (photosLoaded) return currentDealer?.photos || [];
        if (photoPromise) return photoPromise;
        photoPromise = (async () => {
            const container = photoGalleryContainer;
            if (container) container.innerHTML = '<div class="dealer-lazy-state"><span class="spinner-border spinner-border-sm"></span><span>Загружаем фото…</span></div>';
            try {
                const response = await fetch(`${API_DEALERS_URL}/${dealerId}/photos`);
                if (!response.ok) throw new Error('Не удалось загрузить фото');
                const photos = await response.json();
                photosLoaded = true;
                if (currentDealer) currentDealer.photos = photos;
                renderDealerPhotos(photos);
                if (window.DealerDocuments && currentDealer) {
                    window.DealerDocuments.setDealer(currentDealer, window.CRMAuth ? CRMAuth.user : null);
                }
                return photos;
            } catch (error) {
                if (container) container.innerHTML = '<div class="dealer-lazy-state is-error"><i class="bi bi-exclamation-circle"></i><span>Фото не загрузились</span></div>';
                return [];
            } finally {
                photoPromise = null;
            }
        })();
        return photoPromise;
    }

    async function ensureCatalogLoaded() {
        if (catalogLoaded) return true;
        if (catalogPromise) return catalogPromise;
        catalogPromise = (async () => {
            try {
                const response = await fetch(API_PRODUCTS_URL);
                if (!response.ok) throw new Error('catalog');
                const allProducts = await response.json();
                catalogLoaded = true;
                if (window.DealerDocuments) window.DealerDocuments.setCatalog(allProducts);
                return true;
            } catch (error) {
                console.warn('Не удалось загрузить каталог для документов', error);
                return false;
            } finally {
                catalogPromise = null;
            }
        })();
        return catalogPromise;
    }

    // --- MAIN FETCH ---
    async function fetchDealerDetails(force = false) {
        try {
            try {
                if (window.CRMAuth && !CRMAuth.user && CRMAuth.ready) await CRMAuth.ready;
                const user = window.CRMAuth ? CRMAuth.user : null;
                currentUserRole = user ? user.role : 'guest';

                if (editBtn && (!window.CRMAuth || !CRMAuth.can('can_edit_dealer'))) {
                    editBtn.style.display = 'none';
                }
                if (deleteBtn && (!window.CRMAuth || !CRMAuth.can('can_delete_dealer'))) {
                    deleteBtn.style.display = 'none';
                }
                if (!can('can_view_sales')) {
                    const salesTab = document.querySelector('[data-bs-target="#sales-pane"]');
                    if (salesTab) salesTab.closest('.nav-item')?.remove();
                }
            } catch(e) { console.warn('Auth check skipped'); }

            const dealerPromise = loadDealerProfile(force);
            const productCountPromise = loadProductCount();
            const previousPhotos = photosLoaded && Array.isArray(currentDealer?.photos) ? currentDealer.photos : null;
            const dealer = await dealerPromise;
            if (previousPhotos) dealer.photos = previousPhotos;
            currentDealer = dealer;
            currentDealerName = dealer.name;
            if (window.CRMAuth?.can('can_edit_dealer')) ensureEditorReferences();
            if (window.DealerDocuments) {
                window.DealerDocuments.setDealer(dealer, window.CRMAuth ? CRMAuth.user : null);
            }

            const [salesRows, totalProductsCount] = await Promise.all([
                loadDealerSales(dealer),
                productCountPromise
            ]);
            currentDealerSales = salesRows;

            const dealerProductsCount = dealer.products ? dealer.products.length : 0;
            const percent = totalProductsCount > 0 ? Math.round((dealerProductsCount / totalProductsCount) * 100) : 0;

            dealerLat = dealer.latitude;
            dealerLng = dealer.longitude;
            
            if(dealerNameEl) dealerNameEl.textContent = safeText(dealer.name);
            if(dealerIdEl) dealerIdEl.innerHTML = `<i class="bi bi-hash"></i> ${safeText(dealer.dealer_id)}`;
            if(dealerCityEl) dealerCityEl.innerHTML = `<i class="bi bi-geo-alt"></i> ${safeText(dealer.city)}`;
            if(dealerStatusEl) {
                const status = dealer.status || 'standard';
                dealerStatusEl.textContent = statusLabels[status] || status;
                dealerStatusEl.className = `dealer-status-pill dealer-status-${status}`;
            }
            
            if (dealerAvatarImg) {
                if (dealer.avatarUrl) {
                    dealerAvatarImg.src = dealer.avatarUrl;
                    dealerAvatarImg.onclick = () => { openAvatarModal(dealer.avatarUrl); };
                } else { 
                    dealerAvatarImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f1f5f9'/%3E%3Ctext x='50' y='50' font-family='Arial' font-size='40' fill='%23cbd5e1' text-anchor='middle' dy='.3em'%3ESHOP%3C/text%3E%3C/svg%3E";
                }
            }
            document.title = `${dealer.name}`;
            
            const infoEl = document.getElementById('dealer-info-main');
            if(infoEl) {
                // 1. ОРГАНИЗАЦИИ
                let orgsHtml = '<span class="text-muted">Не указано</span>';
                if (dealer.organizations && dealer.organizations.length > 0) {
                    orgsHtml = dealer.organizations.map(o => `<div>${safeText(o)}</div>`).join('');
                } else if (dealer.organization) {
                    orgsHtml = safeText(dealer.organization); // Обратная совместимость
                }

                // 2. ДОГОВОР
                let contractHtml = '<span class="text-muted">Нет данных</span>';
                if (dealer.contract) {
                    const isSigned = dealer.contract.isSigned;
                    const date = dealer.contract.date ? ` <small class="text-muted">(${dealer.contract.date})</small>` : '';
                    const number = dealer.contract.number ? ` <span class="badge bg-light text-dark border ms-1">${safeText(dealer.contract.number)}</span>` : '';
                    contractHtml = isSigned 
                        ? `<span class="text-success fw-bold"><i class="bi bi-file-earmark-check-fill me-1"></i>Подписан</span>${number}${date}` 
                        : `<span class="text-danger"><i class="bi bi-file-earmark-x me-1"></i>Не подписан</span>${number}${date}`;
                }

                // 3. СЕКТОР (Только если есть)
                let sectorRow = '';
                if (dealer.region_sector) {
                    sectorRow = `<div class="info-row"><span class="info-label">Сектор</span><span class="info-val fw-bold text-dark">${safeText(dealer.region_sector)}</span></div>`;
                }

                infoEl.innerHTML = `
                    <div class="info-row"><span class="info-label">Ответственный</span><span class="info-val text-primary fw-bold">${formatResponsible(dealer.responsible)}</span></div>
                    ${sectorRow}
                    <div class="info-row"><span class="info-label">Договор</span><span class="info-val">${contractHtml}</span></div>
                    <div class="info-row"><span class="info-label">Организации</span><span class="info-val text-dark">${orgsHtml}</span></div>
                    <div class="info-row"><span class="info-label">Тип цен</span><span class="info-val">${safeText(dealer.price_type)}</span></div>
                    <div class="info-row"><span class="info-label">Адрес (Факт)</span><span class="info-val">${safeText(dealer.address)}</span></div>
                `;
            }

            if (productsStatsContainer) {
                productsStatsContainer.innerHTML = `<div class="p-3 bg-light rounded border"><div class="d-flex justify-content-between mb-1"><strong>Загрузка матрицы</strong><span>${dealerProductsCount} / ${totalProductsCount}</span></div><div class="progress" style="height: 8px;"><div class="progress-bar bg-success" role="progressbar" style="width: ${percent}%"></div></div></div>`;
            }

            if(deliveryContainer) deliveryContainer.textContent = safeText(dealer.delivery) || 'Не указано';
            if(bonusesContainer) bonusesContainer.textContent = safeText(dealer.bonuses) || 'Нет примечаний';
            
            renderDealerAddresses(dealer.additional_addresses || []); 
            renderDealerPos(dealer.pos_materials || []); 
            renderDealerLinks(dealer.website, dealer.instagram); 
            renderDealerVisits(dealer.visits || []);
            renderDealerContacts(dealer.contacts || []);
            renderDealerCompetitors(dealer.competitors || []);
            loadDealerWorkshopAssets();
            if (!photosLoaded && photoGalleryContainer) {
                photoGalleryContainer.innerHTML = '<div class="dealer-lazy-state"><i class="bi bi-images"></i><span>Фото загрузятся при открытии вкладки</span></div>';
            }
            fetchDealerProducts(dealer.products);
            renderDealerOverview(dealer, currentDealerSales);
            renderDealerSales(currentDealerSales); 

        } catch (error) { 
            console.error(error); 
            if(dealerNameEl) dealerNameEl.textContent = 'Ошибка загрузки'; 
        }
    }

    // --- RENDER SALES ---
    function renderDealerSales(mySales) {
        if (!salesHistoryContainer) return;
        if (!can('can_view_sales')) {
            salesHistoryContainer.innerHTML = '<div class="cc-empty">Нет доступа к продажам</div>';
            return;
        }
        try {

            if (!mySales || mySales.length === 0) { 
                salesHistoryContainer.innerHTML = '<div class="text-center py-4 text-muted bg-light rounded">Нет данных о продажах.</div>'; 
                return; 
            }

            // Агрегация
            const aggregatedData = {}; 
            let grandTotal = 0;

            mySales.forEach(s => {
                if(!s.month) return;
                const year = s.month.split('-')[0];
                const fact = parseFloat(s.fact) || 0;
                if (fact === 0) return;

                if (!aggregatedData[year]) aggregatedData[year] = {};
                if (!aggregatedData[year][s.month]) aggregatedData[year][s.month] = 0;
                
                aggregatedData[year][s.month] += fact;
                grandTotal += fact;
            });

            const years = Object.keys(aggregatedData).sort().reverse();

            if (years.length === 0) {
                salesHistoryContainer.innerHTML = '<div class="text-center py-4 text-muted bg-light rounded">Продажи равны нулю.</div>'; 
                return;
            }

            let html = '<div class="table-responsive"><table class="table table-bordered table-sm mb-0">';
            html += '<thead class="table-light"><tr><th>Период</th><th class="text-end">Факт (м²)</th></tr></thead><tbody>';

            years.forEach(year => {
                html += `<tr class="table-secondary"><td colspan="2" class="fw-bold ps-3 text-dark">${year} год</td></tr>`;
                const monthsData = aggregatedData[year];
                const sortedMonths = Object.keys(monthsData).sort().reverse(); 
                let yearTotal = 0;

                sortedMonths.forEach(monthKey => {
                    const value = monthsData[monthKey];
                    const date = new Date(monthKey + '-01');
                    const monthName = date.toLocaleString('ru-RU', { month: 'long' });
                    const monthDisplay = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                    const displayValue = parseFloat(value.toFixed(2));
                    yearTotal += value;
                    html += `<tr><td class="ps-4">${monthDisplay}</td><td class="text-end font-monospace">${displayValue}</td></tr>`;
                });
                html += `<tr style="background-color: #fffbeb;"><td class="ps-3 fw-bold text-muted">Итого за ${year}:</td><td class="text-end fw-bold text-dark">${parseFloat(yearTotal.toFixed(2))}</td></tr>`;
            });

            html += '</tbody>';
            html += `<tfoot class="table-dark"><tr><td class="fw-bold ps-3 text-uppercase">Всего за все время</td><td class="text-end fw-bold fs-6">${parseFloat(grandTotal.toFixed(2))}</td></tr></tfoot>`;
            html += '</table></div>';
            salesHistoryContainer.innerHTML = html;

        } catch (e) { 
            console.error(e);
            salesHistoryContainer.innerHTML = `<p class="text-danger">Ошибка загрузки продаж</p>`; 
        }
    }

    function renderDealerContacts(contacts) {
        if (!contactsListContainer) return;
        if (!contacts || contacts.length === 0) { contactsListContainer.innerHTML = '<p class="text-muted">Нет контактов.</p>'; return; }
        let html = '';
        contacts.forEach(contact => {
            const phoneClean = contact.contactInfo ? contact.contactInfo.replace(/[^0-9]/g, '') : '';
            const hasPhone = phoneClean.length >= 10;
            let btns = '';
            if (hasPhone) { btns = `<div class="d-flex gap-2"><a href="tel:+${phoneClean}" class="btn btn-sm btn-white border"><i class="bi bi-telephone-fill text-primary"></i></a><a href="https://wa.me/${phoneClean}" target="_blank" class="btn btn-sm btn-white border"><i class="bi bi-whatsapp text-success"></i></a></div>`; }
            html += `<div class="col-md-6"><div class="contact-card-modern"><div class="contact-card-info"><h6>${safeText(contact.name)}</h6><p>${safeText(contact.position)}</p><p class="text-primary mt-1">${safeText(contact.contactInfo)}</p></div>${btns}</div></div>`;
        });
        contactsListContainer.innerHTML = html;
    }

    function renderDealerVisits(visits) {
        if (!visitsListContainer) return;
        if (!visits || visits.length === 0) { visitsListContainer.innerHTML = '<p class="text-muted">История пуста.</p>'; return; }
        visits.sort((a, b) => new Date(b.date) - new Date(a.date));
        let html = '';
        visits.forEach(v => {
            const dateStr = v.date ? new Date(v.date).toLocaleDateString('ru-RU', {weekday:'short', year:'numeric', month:'long', day:'numeric'}) : '-';
            const statusIcon = v.isCompleted ? '<span class="text-success ms-2"><i class="bi bi-check-circle-fill"></i></span>' : '<span class="text-warning ms-2"><i class="bi bi-hourglass-split"></i></span>';
            html += `<div class="timeline-item"><div class="timeline-date">${dateStr} ${statusIcon}</div><div class="timeline-text">${safeText(v.comment)}</div></div>`;
        });
        visitsListContainer.innerHTML = html;
    }

    function renderDealerAddresses(addresses) {
        if (!addressesListContainer) return;
        if (!addresses || addresses.length === 0) { addressesListContainer.innerHTML = '<div class="text-muted small">Нет доп. адресов</div>'; return; }
        let html = '';
        addresses.forEach(addr => { html += `<div class="p-2 bg-light border rounded mb-2"><div class="fw-bold small">${safeText(addr.description)}</div><div class="text-muted small"><i class="bi bi-geo-alt me-1"></i>${safeText(addr.city)}, ${safeText(addr.address)}</div></div>`; });
        addressesListContainer.innerHTML = html;
    }

    function fetchDealerProducts(products) {
        const c = document.getElementById('dealer-products-list'); if (!c) return;
        if (!products || products.length === 0) { c.innerHTML = '<div class="p-3 text-center text-muted border rounded bg-light small">Нет выставленных товаров</div>'; return; }
        products.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }));
        let html = '<div class="products-grid">';
        html += products.map(p => `<div class="product-grid-item" title="${safeText(p.name)}"><i class="bi bi-check-circle-fill"></i><div class="product-info"><span class="product-sku">${safeText(p.sku)}</span><span class="product-name">${safeText(p.name)}</span></div></div>`).join('');
        html += '</div>';
        c.innerHTML = html;
    }

    function renderDealerLinks(website, instagram) { 
        if (!linksContainer) return; 
        let html = ''; const safeWebsite = formatUrl(website); const safeInstagram = formatUrl(instagram); 
        if (safeWebsite) html += `<a href="${safeWebsite}" target="_blank" class="btn btn-sm btn-white border text-primary"><i class="bi bi-globe me-1"></i>Сайт</a>`; 
        if (safeInstagram) html += `<a href="${safeInstagram}" target="_blank" class="btn btn-sm btn-white border text-danger"><i class="bi bi-instagram me-1"></i>Instagram</a>`; 
        linksContainer.innerHTML = html; 
    }

    function renderDealerPhotos(photos) { 
        if (!photoGalleryContainer) return; 
        if (!photos || photos.length === 0) { photoGalleryContainer.innerHTML = '<p class="text-muted">Нет фотографий.</p>'; return; } 
        photos.sort((a, b) => new Date(b.date||0) - new Date(a.date||0)); 
        let html = ''; let slideIndex = 0; galleryCarouselContent = ''; const groups = {}; 
        photos.forEach(p => { const d = p.date ? new Date(p.date).toLocaleDateString('ru-RU') : "Ранее"; if(!groups[d]) groups[d]=[]; groups[d].push(p); }); 
        for (const [date, group] of Object.entries(groups)) { 
            html += `<h6 class="mt-4 mb-2 text-muted small fw-bold border-bottom pb-1">${date}</h6><div class="gallery-grid">`; 
            group.forEach(p => { 
                html += `<div class="gallery-item" onclick="openLightbox(${slideIndex})"><img src="${p.photo_url}" loading="lazy"></div>`; 
                galleryCarouselContent += `<div class="carousel-item ${slideIndex===0?'active':''}" style="height: 100%;"><div class="d-flex justify-content-center align-items-center h-100"><img src="${p.photo_url}" style="max-height: 100%; max-width: 100%; object-fit: contain;"></div></div>`; 
                slideIndex++; 
            }); 
            html += `</div>`; 
        } 
        photoGalleryContainer.innerHTML = html; 
        if (carouselInner) carouselInner.innerHTML = galleryCarouselContent; 
    }

    window.openLightbox = function(index) { const modalEl = document.getElementById('imageModal'); const carouselEl = document.querySelector('#photoCarousel'); if (modalEl && carouselEl && carouselInner) { carouselInner.innerHTML = galleryCarouselContent; const myModal = new bootstrap.Modal(modalEl); const carousel = new bootstrap.Carousel(carouselEl); carousel.to(index); myModal.show(); } }
    function openAvatarModal(url) { const modalEl = document.getElementById('imageModal'); if (modalEl && carouselInner) { carouselInner.innerHTML = `<div class="carousel-item active" style="height: 100%;"><div class="d-flex justify-content-center align-items-center h-100"><img src="${url}" style="max-height: 100%; max-width: 100%; object-fit: contain;"></div></div>`; const myModal = new bootstrap.Modal(modalEl); myModal.show(); } }

    async function loadDealerWorkshopAssets() {
        if (!workshopAssetsContainer) return;
        try {
            const response = await fetch(`/api/workshop/dealers/${dealerId}/assets`, { crmTrackLoading: false });
            if (!response.ok) throw new Error('workshop');
            const assets = await response.json();
            if (!Array.isArray(assets) || !assets.length) {
                workshopAssetsContainer.innerHTML = '<div class="dealer-workshop-empty"><i class="bi bi-box"></i><strong>Ничего не числится</strong><span>По учету цеха образцы и стенды этому дилеру пока не выдавались.</span></div>';
                return;
            }
            workshopAssetsContainer.innerHTML = '<div class="dealer-workshop-grid">' + assets.map(asset => {
                const recipe = asset.recipe || {};
                const product = recipe.product || {};
                const isOld = product.is_liquid === false;
                return `<article class="dealer-workshop-item">
                    <div class="dealer-workshop-item-main">
                        <span class="dealer-workshop-icon"><i class="bi bi-${recipe.outputType === 'stand' ? 'easel2' : 'grid-3x3-gap'}"></i></span>
                        <div>
                            <strong>${safeText(recipe.name || 'Изделие')}</strong>
                            <small>${safeText(product.sku || '')}${product.name ? ' · '+safeText(product.name) : ''}</small>
                            ${isOld ? '<em><i class="bi bi-clock-history"></i> Неактуальная позиция</em>' : ''}
                        </div>
                    </div>
                    <b>${Number(asset.qty || 0).toLocaleString('ru-RU')} шт</b>
                </article>`;
            }).join('') + '</div>';
        } catch (e) {
            workshopAssetsContainer.innerHTML = '<div class="dealer-workshop-empty"><i class="bi bi-exclamation-circle"></i><strong>Не удалось загрузить учет цеха</strong></div>';
        }
    }

    function renderDealerPos(posItems) {
        if (!posListContainer) return;
        if (!posItems || posItems.length === 0) { posListContainer.innerHTML = '<p class="text-muted small">Нет оборудования.</p>'; return; }
        let html = '<div class="table-responsive"><table class="table table-bordered table-sm"><thead><tr><th>Оборудование</th><th>Кол-во</th></tr></thead><tbody>';
        posItems.forEach(item => { html += `<tr><td>${safeText(item.name)}</td><td class="text-center fw-bold">${item.quantity || 1}</td></tr>`; });
        posListContainer.innerHTML = html + '</tbody></table></div>';
    }

    function renderDealerCompetitors(competitors) {
        if (!competitorsListContainer) return;
        if (!competitors || competitors.length === 0) { competitorsListContainer.innerHTML = '<p class="text-muted">Нет данных.</p>'; return; }
        let html = '<div class="table-responsive"><table class="table table-hover table-sm border"><thead><tr class="table-light"><th>Бренд</th><th>Коллекция</th><th>ОПТ</th><th>Розница</th></tr></thead><tbody>';
        competitors.forEach(c => { html += `<tr><td class="fw-bold">${safeText(c.brand)}</td><td>${safeText(c.collection)}</td><td>${safeText(c.price_opt)}</td><td>${safeText(c.price_retail)}</td></tr>`; });
        competitorsListContainer.innerHTML = html + '</tbody></table></div>';
    }

    function editValue(id) {
        return document.getElementById(id)?.value?.trim() || '';
    }

    function ensureProfileEditModal() {
        let modalEl = document.getElementById('dealer-profile-edit-modal');
        if (modalEl) return modalEl;

        const shell = document.createElement('div');
        shell.innerHTML = `
            <div class="modal fade dealer-profile-edit-modal" id="dealer-profile-edit-modal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                <div class="modal-dialog modal-xl modal-dialog-scrollable modal-dialog-centered">
                    <div class="modal-content">
                        <div class="dealer-profile-edit-head">
                            <div>
                                <span>КАРТОЧКА ДИЛЕРА</span>
                                <h3>Редактирование</h3>
                                <p id="dealer-profile-edit-subtitle">Изменения сохраняются сразу в карточку дилера.</p>
                            </div>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Закрыть"></button>
                        </div>
                        <div class="dealer-profile-edit-tabs">
                            <button type="button" class="active" data-profile-edit-tab="main"><i class="bi bi-shop"></i><span>Основное</span></button>
                            <button type="button" data-profile-edit-tab="contacts"><i class="bi bi-people"></i><span>Контакты</span></button>
                            <button type="button" data-profile-edit-tab="requisites"><i class="bi bi-file-earmark-text"></i><span>Реквизиты</span></button>
                        </div>
                        <form id="dealer-profile-edit-form">
                            <div class="modal-body dealer-profile-edit-body">
                                <section class="dealer-profile-edit-pane active" data-profile-edit-pane="main">
                                    <div class="dealer-profile-edit-section">
                                        <div class="dealer-profile-edit-section-title"><i class="bi bi-shop"></i><div><strong>Основная информация</strong><small>Название, статус, город и ответственный</small></div></div>
                                        <div class="row g-3">
                                            <div class="col-md-4"><label>ID дилера</label><input id="profile-edit-dealer-id" class="form-control"></div>
                                            <div class="col-md-8"><label>Название</label><input id="profile-edit-name" class="form-control" required></div>
                                            <div class="col-md-4"><label>Статус</label><select id="profile-edit-status" class="form-select"></select></div>
                                            <div class="col-md-4"><label>Город</label><input id="profile-edit-city" class="form-control"></div>
                                            <div class="col-md-4"><label>Тип цен</label><input id="profile-edit-price-type" class="form-control"></div>
                                            <div class="col-md-8"><label>Адрес</label><input id="profile-edit-address" class="form-control"></div>
                                            <div class="col-md-4"><label>Ответственный</label>
                                                <select id="profile-edit-responsible" class="form-select">
                                                    <option value="">Не выбран</option>
                                                    <option value="regional_astana">Астана</option>
                                                    <option value="regional_regions">Регионы</option>
                                                    <option value="office">Офис</option>
                                                </select>
                                            </div>
                                            <div class="col-md-4"><label>Сектор</label><select id="profile-edit-sector" class="form-select"><option value="">Не выбран</option></select></div>
                                            <div class="col-md-8"><label>Условия доставки</label><input id="profile-edit-delivery" class="form-control"></div>
                                            <div class="col-md-6"><label>Сайт</label><input id="profile-edit-website" class="form-control"></div>
                                            <div class="col-md-6"><label>Instagram</label><input id="profile-edit-instagram" class="form-control"></div>
                                            <div class="col-12"><label>Заметки и особые условия</label><textarea id="profile-edit-bonuses" class="form-control" rows="3"></textarea></div>
                                        </div>
                                    </div>
                                    <div class="dealer-profile-edit-section">
                                        <div class="dealer-profile-edit-section-title"><i class="bi bi-file-earmark-check"></i><div><strong>Договор</strong><small>Номер, дата и статус подписания</small></div></div>
                                        <div class="row g-3 align-items-end">
                                            <div class="col-md-5"><label>Номер договора</label><input id="profile-edit-contract-number" class="form-control"></div>
                                            <div class="col-md-4"><label>Дата договора</label><input id="profile-edit-contract-date" type="date" class="form-control"></div>
                                            <div class="col-md-3">
                                                <div class="dealer-profile-edit-switch">
                                                    <span>Договор подписан</span>
                                                    <div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" id="profile-edit-contract-signed"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section class="dealer-profile-edit-pane" data-profile-edit-pane="contacts">
                                    <div class="dealer-profile-edit-section">
                                        <div class="dealer-profile-edit-section-title">
                                            <i class="bi bi-people"></i>
                                            <div><strong>Контакты дилера</strong><small>Менеджеры, руководители и телефоны</small></div>
                                            <button type="button" class="dealer-profile-edit-add" id="profile-edit-add-contact"><i class="bi bi-plus-lg"></i> Контакт</button>
                                        </div>
                                        <div id="profile-edit-contacts" class="dealer-profile-edit-contacts"></div>
                                    </div>
                                </section>

                                <section class="dealer-profile-edit-pane" data-profile-edit-pane="requisites">
                                    <div class="dealer-profile-edit-section">
                                        <div class="dealer-profile-edit-section-title"><i class="bi bi-building"></i><div><strong>Основное юридическое лицо</strong><small>Используется в документах дилера</small></div></div>
                                        <div class="row g-3">
                                            <div class="col-md-7"><label>Наименование организации</label><input id="profile-edit-org-name" class="form-control"></div>
                                            <div class="col-md-5"><label>БИН</label><input id="profile-edit-bin" class="form-control"></div>
                                            <div class="col-md-6"><label>Директор</label><input id="profile-edit-director" class="form-control"></div>
                                            <div class="col-md-6"><label>Email</label><input id="profile-edit-email" type="email" class="form-control"></div>
                                            <div class="col-12"><label>Юридический адрес</label><input id="profile-edit-legal-address" class="form-control"></div>
                                            <div class="col-md-6"><label>ИИК</label><input id="profile-edit-iik" class="form-control"></div>
                                            <div class="col-md-6"><label>Банк</label><input id="profile-edit-bank" class="form-control"></div>
                                            <div class="col-md-6"><label>БИК</label><input id="profile-edit-bik" class="form-control"></div>
                                            <div class="col-md-6"><label>КБЕ</label><input id="profile-edit-kbe" class="form-control"></div>
                                        </div>
                                    </div>
                                </section>
                            </div>
                            <div class="modal-footer dealer-profile-edit-footer">
                                <span><i class="bi bi-shield-check"></i> Фото, визиты, матрица и конкуренты этим сохранением не изменяются.</span>
                                <div>
                                    <button type="button" class="btn btn-light" data-bs-dismiss="modal">Отмена</button>
                                    <button type="submit" class="btn btn-dark" id="dealer-profile-edit-save"><i class="bi bi-check2"></i> Сохранить</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>`;
        modalEl = shell.firstElementChild;
        document.body.appendChild(modalEl);

        modalEl.querySelectorAll('[data-profile-edit-tab]').forEach(button => {
            button.addEventListener('click', () => activateProfileEditTab(button.dataset.profileEditTab));
        });

        document.getElementById('profile-edit-add-contact')?.addEventListener('click', () => addProfileContactRow());
        document.getElementById('profile-edit-contacts')?.addEventListener('click', event => {
            const remove = event.target.closest('[data-remove-profile-contact]');
            if (remove) remove.closest('.dealer-profile-contact-row')?.remove();
        });
        document.getElementById('profile-edit-responsible')?.addEventListener('change', refreshProfileSectorOptions);
        document.getElementById('dealer-profile-edit-form')?.addEventListener('submit', saveProfileEdit);
        return modalEl;
    }

    function activateProfileEditTab(name) {
        const modalEl = ensureProfileEditModal();
        modalEl.querySelectorAll('[data-profile-edit-tab]').forEach(button => {
            button.classList.toggle('active', button.dataset.profileEditTab === name);
        });
        modalEl.querySelectorAll('[data-profile-edit-pane]').forEach(pane => {
            pane.classList.toggle('active', pane.dataset.profileEditPane === name);
        });
    }

    function addProfileContactRow(contact = {}) {
        ensureProfileEditModal();
        const container = document.getElementById('profile-edit-contacts');
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'dealer-profile-contact-row';
        row.innerHTML = `
            <input class="form-control profile-contact-name" placeholder="Имя" value="${String(contact.name || '').replace(/"/g, '&quot;')}">
            <input class="form-control profile-contact-position" placeholder="Должность" value="${String(contact.position || '').replace(/"/g, '&quot;')}">
            <input class="form-control profile-contact-info" placeholder="+7 700 000 00 00" value="${String(contact.contactInfo || '').replace(/"/g, '&quot;')}">
            <button type="button" data-remove-profile-contact aria-label="Удалить контакт"><i class="bi bi-x-lg"></i></button>`;
        container.appendChild(row);
    }

    function collectProfileContacts() {
        return [...document.querySelectorAll('#profile-edit-contacts .dealer-profile-contact-row')].map(row => ({
            name: row.querySelector('.profile-contact-name')?.value.trim() || '',
            position: row.querySelector('.profile-contact-position')?.value.trim() || '',
            contactInfo: row.querySelector('.profile-contact-info')?.value.trim() || ''
        })).filter(contact => contact.name || contact.position || contact.contactInfo);
    }

    function primaryLegalEntity(dealer) {
        if (Array.isArray(dealer?.legal_entities) && dealer.legal_entities.length) return { ...dealer.legal_entities[0] };
        return {
            organizationName: dealer?.requisites?.organizationName || dealer?.organizations?.[0] || dealer?.organization || '',
            director: dealer?.requisites?.director || '',
            legalAddress: dealer?.requisites?.legalAddress || '',
            bin: dealer?.requisites?.bin || '',
            iik: dealer?.requisites?.iik || '',
            bank: dealer?.requisites?.bank || '',
            bik: dealer?.requisites?.bik || '',
            kbe: dealer?.requisites?.kbe || '',
            email: dealer?.requisites?.email || ''
        };
    }

    async function refreshProfileSectorOptions() {
        const select = document.getElementById('profile-edit-sector');
        const responsible = document.getElementById('profile-edit-responsible')?.value || '';
        if (!select) return;
        const sectors = Array.isArray(select._crmSectors) ? select._crmSectors : [];
        const type = responsible === 'regional_astana' ? 'astana' : responsible === 'regional_regions' ? 'region' : '';
        const current = select.dataset.selected || select.value || '';
        const filtered = type ? sectors.filter(item => item.type === type) : [];
        select.innerHTML = '<option value="">Не выбран</option>' + filtered.map(item => `<option value="${String(item.name || '').replace(/"/g,'&quot;')}">${safeText(item.name)}</option>`).join('');
        if (current && filtered.some(item => item.name === current)) select.value = current;
        select.disabled = !type;
    }

    async function ensureEditorReferences() {
        if (editorReferencePromise) return editorReferencePromise;
        editorReferencePromise = Promise.all([
            fetch('/api/statuses', { crmTrackLoading: false }).then(r => r.ok ? r.json() : []).catch(() => []),
            fetch('/api/sectors', { crmTrackLoading: false }).then(r => r.ok ? r.json() : []).catch(() => [])
        ]).then(([statuses, sectors]) => {
            editorStatuses = Array.isArray(statuses) ? statuses : [];
            editorSectors = Array.isArray(sectors) ? sectors : [];
            return { statuses: editorStatuses, sectors: editorSectors };
        }).finally(() => {
            // Keep the resolved arrays; a new request is only needed after a full page refresh.
        });
        return editorReferencePromise;
    }

    async function fillProfileEditor(section = 'main') {
        if (!currentDealer) return;
        const modalEl = ensureProfileEditModal();
        const subtitle = document.getElementById('dealer-profile-edit-subtitle');
        if (subtitle) subtitle.textContent = currentDealer.name || 'Карточка дилера';

        const { statuses, sectors } = await ensureEditorReferences();

        const statusSelect = document.getElementById('profile-edit-status');
        if (statusSelect) {
            const fallback = [
                {value:'standard',label:'Стандарт'}, {value:'active',label:'Активный'},
                {value:'problem',label:'Проблемный'}, {value:'potential',label:'Потенциальный'}, {value:'archive',label:'Архив'}
            ];
            const source = statuses.length ? statuses : fallback;
            statusSelect.innerHTML = source.map(item => `<option value="${item.value}">${safeText(item.label || item.value)}</option>`).join('');
            statusSelect.value = currentDealer.status || 'standard';
        }

        const values = {
            'profile-edit-dealer-id': currentDealer.dealer_id,
            'profile-edit-name': currentDealer.name,
            'profile-edit-city': currentDealer.city,
            'profile-edit-price-type': currentDealer.price_type,
            'profile-edit-address': currentDealer.address,
            'profile-edit-delivery': currentDealer.delivery,
            'profile-edit-website': currentDealer.website,
            'profile-edit-instagram': currentDealer.instagram,
            'profile-edit-bonuses': currentDealer.bonuses,
            'profile-edit-contract-number': currentDealer.contract?.number,
            'profile-edit-contract-date': currentDealer.contract?.date
        };
        Object.entries(values).forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input) input.value = value || '';
        });
        const signed = document.getElementById('profile-edit-contract-signed');
        if (signed) signed.checked = Boolean(currentDealer.contract?.isSigned);

        const responsible = document.getElementById('profile-edit-responsible');
        if (responsible) responsible.value = currentDealer.responsible || '';

        const sectorSelect = document.getElementById('profile-edit-sector');
        if (sectorSelect) {
            sectorSelect._crmSectors = sectors;
            sectorSelect.dataset.selected = currentDealer.region_sector || '';
        }
        await refreshProfileSectorOptions();

        const contacts = document.getElementById('profile-edit-contacts');
        if (contacts) contacts.innerHTML = '';
        (currentDealer.contacts || []).forEach(addProfileContactRow);
        if (!currentDealer.contacts?.length) addProfileContactRow();

        const legal = primaryLegalEntity(currentDealer);
        const legalValues = {
            'profile-edit-org-name': legal.organizationName,
            'profile-edit-director': legal.director,
            'profile-edit-legal-address': legal.legalAddress,
            'profile-edit-bin': legal.bin,
            'profile-edit-iik': legal.iik,
            'profile-edit-bank': legal.bank,
            'profile-edit-bik': legal.bik,
            'profile-edit-kbe': legal.kbe,
            'profile-edit-email': legal.email
        };
        Object.entries(legalValues).forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input) input.value = value || '';
        });

        activateProfileEditTab(section);
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    async function saveProfileEdit(event) {
        event.preventDefault();
        if (!currentDealer || !window.CRMAuth?.can('can_edit_dealer')) return;

        const saveButton = document.getElementById('dealer-profile-edit-save');
        const oldHtml = saveButton?.innerHTML || '';
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Сохраняем';
        }

        const legal = {
            organizationName: editValue('profile-edit-org-name'),
            director: editValue('profile-edit-director'),
            legalAddress: editValue('profile-edit-legal-address'),
            bin: editValue('profile-edit-bin'),
            iik: editValue('profile-edit-iik'),
            bank: editValue('profile-edit-bank'),
            bik: editValue('profile-edit-bik'),
            kbe: editValue('profile-edit-kbe'),
            email: editValue('profile-edit-email')
        };
        const legalEntities = Array.isArray(currentDealer.legal_entities) ? currentDealer.legal_entities.map(item => ({...item})) : [];
        if (legalEntities.length) legalEntities[0] = { ...legalEntities[0], ...legal };
        else if (Object.values(legal).some(Boolean)) legalEntities.push(legal);

        const payload = {
            dealer_id: editValue('profile-edit-dealer-id'),
            name: editValue('profile-edit-name'),
            status: editValue('profile-edit-status'),
            city: editValue('profile-edit-city'),
            price_type: editValue('profile-edit-price-type'),
            address: editValue('profile-edit-address'),
            responsible: editValue('profile-edit-responsible'),
            region_sector: editValue('profile-edit-sector'),
            delivery: editValue('profile-edit-delivery'),
            website: editValue('profile-edit-website'),
            instagram: editValue('profile-edit-instagram'),
            bonuses: editValue('profile-edit-bonuses'),
            contacts: collectProfileContacts(),
            contract: {
                isSigned: Boolean(document.getElementById('profile-edit-contract-signed')?.checked),
                date: editValue('profile-edit-contract-date'),
                number: editValue('profile-edit-contract-number')
            },
            requisites: legal,
            legal_entities: legalEntities,
            organizations: legalEntities.map(item => item.organizationName).filter(Boolean)
        };

        try {
            const response = await fetch(`${API_DEALERS_URL}/${dealerId}`, {
                method: 'PATCH',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Не удалось сохранить изменения');
            }

            currentDealer = { ...currentDealer, ...payload };
            cacheDealerProfile(currentDealer);
            bootstrap.Modal.getOrCreateInstance(document.getElementById('dealer-profile-edit-modal')).hide();
            window.showToast?.('Изменения сохранены', 'success');
            await fetchDealerDetails(true);
        } catch (error) {
            window.showToast?.(error.message || 'Ошибка сохранения', 'error');
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.innerHTML = oldHtml;
            }
        }
    }

    function setupDealerReturnNavigation() {
        const stored = sessionStorage.getItem('crm:dealerReturnTo');
        const referrer = (() => {
            try {
                const url = new URL(document.referrer);
                return url.origin === location.origin && !url.pathname.endsWith('/dealer.html') ? url.href : '';
            } catch (_) { return ''; }
        })();
        const returnUrl = stored || referrer || '/';
        document.querySelectorAll('[data-dealer-back]').forEach(link => {
            link.href = returnUrl;
            link.addEventListener('click', event => {
                if (referrer && history.length > 1) {
                    event.preventDefault();
                    history.back();
                }
            });
        });
    }

    const docsEditBtn = document.getElementById('dealer-docs-edit-requisites');
    if (docsEditBtn) docsEditBtn.addEventListener('click', () => {
        if (!window.CRMAuth || !CRMAuth.can('can_edit_dealer')) return;
        fillProfileEditor('requisites');
    });

    if(editBtn) editBtn.addEventListener('click', () => {
        if (!window.CRMAuth || !CRMAuth.can('can_edit_dealer')) return;
        if (!currentDealer) {
            window.showToast?.('Карточка ещё загружается', 'info');
            return;
        }
        fillProfileEditor('main');
    });

    document.querySelector('[data-bs-target="#photos-pane"]')?.addEventListener('shown.bs.tab', () => {
        ensurePhotosLoaded();
    });
    document.querySelector('[data-bs-target="#documents-pane"]')?.addEventListener('shown.bs.tab', () => {
        ensureCatalogLoaded();
        ensurePhotosLoaded();
    });

    if(navigateBtn) navigateBtn.addEventListener('click', () => {
        if (!currentDealer || !dealerLat || !dealerLng) {
            window.showToast?.('Координаты не заданы', 'warning');
            return;
        }
        const query = encodeURIComponent([currentDealer.name, currentDealer.address].filter(Boolean).join(' '));
        window.open(`https://2gis.kz/search/${query}?m=${dealerLng},${dealerLat}/17`, '_blank', 'noopener');
    });
    if(deleteBtn) deleteBtn.addEventListener('click', async () => {
        if (!window.CRMAuth || !CRMAuth.can('can_delete_dealer')) return;
        if (confirm(`Удалить дилера ${currentDealerName}?`)) {
            try {
                const response = await fetch(`${API_DEALERS_URL}/${dealerId}`, { method: 'DELETE' });
                if (response.ok) window.location.href = '/';
            } catch (error) { alert('Ошибка.'); }
        }
    });

    window.printDiv = (divId, title) => {
        const content = document.getElementById(divId).innerHTML;
        const win = window.open('', '', 'height=600,width=800');
        win.document.write(`<html><head><title>${title}</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"></head><body class="p-4"><h3>${currentDealerName} - ${title}</h3>${content}</body></html>`);
        setTimeout(() => { win.print(); }, 1000);
    };

    window.exportData = (type) => {
        const clean = (text) => `"${String(text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        let csv = ""; let filename = `${currentDealerName}_${type}.csv`;
        if (type === 'sales') {
            const table = document.querySelector('#dealer-sales-history table'); if(!table) return alert("Нет данных");
            table.querySelectorAll('tr').forEach(tr => {
                const rowData = [];
                tr.querySelectorAll('th, td').forEach(td => rowData.push(clean(td.innerText)));
                csv += rowData.join(";") + "\n";
            });
        } else if (type === 'competitors') {
            const table = document.querySelector('#dealer-competitors-list table'); if(!table) return alert("Нет данных");
            csv = "\uFEFFБренд;Коллекция;ОПТ;Розница\n"; table.querySelectorAll('tbody tr').forEach(tr => { const tds = tr.querySelectorAll('td'); csv += `${clean(tds[0].innerText)};${clean(tds[1].innerText)};${clean(tds[2].innerText)};${clean(tds[3].innerText)}\n`; });
        } else if (type === 'products') {
            csv = "\uFEFFТип;Артикул/Название;Значение\n";
            const posTable = document.querySelector('#dealer-pos-list table'); if(posTable) posTable.querySelectorAll('tbody tr').forEach(tr => { const tds = tr.querySelectorAll('td'); csv += `Стенд;${clean(tds[0].innerText)};${clean(tds[1].innerText)}\n`; });
            const items = document.querySelectorAll('.product-grid-item'); items.forEach(item => { const sku = item.querySelector('.product-sku')?.innerText || ''; const name = item.querySelector('.product-name')?.innerText || ''; csv += `Товар;${clean(sku)};${clean(name)}\n`; });
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    setupDealerReturnNavigation();
    fetchDealerDetails();
});
