document.addEventListener('DOMContentLoaded', () => {
    const discountTitle = item => 'Скидка −' + Number(item.discountPercent || 0).toLocaleString('ru-RU',{maximumFractionDigits:2}) + '%';
    
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
    const dealerPricingSummary = document.getElementById('dealer-pricing-summary');
    const dealerPricingManageLink = document.getElementById('dealer-pricing-manage-link');
    const dealerPriceShareBtn = document.getElementById('dealer-price-share-btn');
    const dealerPriceShareModalEl = document.getElementById('dealer-price-share-modal');
    const dealerShareIdentity = document.getElementById('dealer-share-identity');
    const dealerShareConfirmId = document.getElementById('dealer-share-confirm-id');
    const dealerShareExpiry = document.getElementById('dealer-share-expiry');
    const dealerShareCreateBtn = document.getElementById('dealer-share-create-btn');
    const dealerShareResult = document.getElementById('dealer-share-result');
    
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
    const duplicateBtn = document.getElementById('duplicate-dealer-btn');
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
    let galleryPhotos=[];
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

    dealerPriceShareBtn?.addEventListener('click', openDealerPriceShare);
    dealerShareConfirmId?.addEventListener('input', updateDealerShareConfirmation);
    dealerShareCreateBtn?.addEventListener('click', createDealerPriceShare);

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
                const response = await fetch(`${API_DEALERS_URL}/${dealerId}/photos?preview=1`);
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
                if (!window.CRMAuth || !CRMAuth.can('can_edit_dealer')) {
                    document.querySelectorAll('[data-profile-edit-open], #dealer-docs-edit-requisites').forEach(button => {
                        button.style.display = 'none';
                    });
                }
                if (duplicateBtn && (!window.CRMAuth || !CRMAuth.can('can_create_dealer'))) {
                    duplicateBtn.style.display = 'none';
                }
                if (deleteBtn && (!window.CRMAuth || !CRMAuth.can('can_delete_dealer'))) {
                    deleteBtn.style.display = 'none';
                }
                if (!can('can_view_sales')) {
                    const salesTab = document.querySelector('[data-bs-target="#sales-pane"]');
                    if (salesTab) salesTab.closest('.nav-item')?.remove();
                }
                if (!can('can_view_pricing')) {
                    const pricingTab = document.querySelector('[data-bs-target="#pricing-pane"]');
                    if (pricingTab) pricingTab.closest('.nav-item')?.remove();
                    document.getElementById('pricing-pane')?.remove();
                } else if (dealerPricingManageLink) {
                    dealerPricingManageLink.href = `/pricing.html?dealer=${encodeURIComponent(dealerId)}`;
                    if (!can('can_manage_pricing')) dealerPricingManageLink.style.display = 'none';
                }
            } catch(e) { console.warn('Auth check skipped'); }

            const dealerPromise = loadDealerProfile(force);
            const productCountPromise = loadProductCount();
            const previousPhotos = photosLoaded && Array.isArray(currentDealer?.photos) ? currentDealer.photos : null;
            const dealer = await dealerPromise;
            if (previousPhotos) dealer.photos = previousPhotos;
            currentDealer = dealer;
            const motivationHistory = document.getElementById('dealer-motivation-history');
            if (motivationHistory && dealer.motivation_scheme) { motivationHistory.dataset.dealerCode = String(dealer.dealer_id || ''); motivationHistory.style.display = ''; document.dispatchEvent(new Event('crm:dealer-motivation-ready')); }
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
                    dealerAvatarImg.onclick = async () => {
                        openAvatarModal(dealer.avatarUrl);
                        if(!dealer.avatarIsPreview)return;
                        try {
                            const response=await fetch(`${API_DEALERS_URL}/${encodeURIComponent(dealerId)}/avatar`,{crmTrackLoading:false});
                            if(response.ok){const original=await response.json();if(original.avatarUrl)openAvatarModal(original.avatarUrl);}
                        }catch(_){}
                    };
                } else { 
                    dealerAvatarImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f1f5f9'/%3E%3Ctext x='50' y='50' font-family='Arial' font-size='40' fill='%23cbd5e1' text-anchor='middle' dy='.3em'%3ESHOP%3C/text%3E%3C/svg%3E";
                }
            }
            document.title = `${dealer.name}`;
            
            const infoEl = document.getElementById('dealer-info-main');
            if(infoEl) {
                // 1. ЮРИДИЧЕСКИЕ ЛИЦА — единый источник legal_entities
                let orgsHtml = '<span class="text-muted">Не указано</span>';
                if (Array.isArray(dealer.legal_entities) && dealer.legal_entities.length > 0) {
                    orgsHtml = dealer.legal_entities
                        .map(entity => entity?.organizationName)
                        .filter(Boolean)
                        .map(name => `<div>${safeText(name)}</div>`)
                        .join('');
                }

                // 2. ДОГОВОР — номер всегда равен ID дилера
                const contractNumber = String(dealer.dealer_id || '').trim();
                const isSigned = Boolean(dealer.contract?.isSigned);
                const date = dealer.contract?.date ? ` <small class="text-muted">(${dealer.contract.date})</small>` : '';
                const number = contractNumber ? ` <span class="badge bg-light text-dark border ms-1">${safeText(contractNumber)}</span>` : '';
                const contractHtml = isSigned 
                    ? `<span class="text-success fw-bold"><i class="bi bi-file-earmark-check-fill me-1"></i>Подписан</span>${number}${date}` 
                    : `<span class="text-danger"><i class="bi bi-file-earmark-x me-1"></i>Не подписан</span>${number}${date}`;

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
                    <div class="info-row"><span class="info-label">Прайс</span><span class="info-val">${safeText(dealer.price_list?.name || dealer.price_type || 'Не назначен')}</span></div>
                    <div class="info-row"><span class="info-label">Адрес (Факт)</span><span class="info-val">${safeText(dealer.address)}</span></div>
                `;
            }

            if (productsStatsContainer) {
                productsStatsContainer.innerHTML = `<div class="p-3 bg-light rounded border"><div class="d-flex justify-content-between mb-1"><strong>Загрузка матрицы</strong><span>${dealerProductsCount} / ${totalProductsCount}</span></div><div class="progress" style="height: 8px;"><div class="progress-bar bg-success" role="progressbar" style="width: ${percent}%"></div></div></div>`;
            }

            if(deliveryContainer) deliveryContainer.textContent = safeText(dealer.delivery) || 'Не указано';
            if(bonusesContainer) {
                const motivation = dealer.motivation_scheme && typeof dealer.motivation_scheme === 'object' ? dealer.motivation_scheme : null;
                const motivationPeriod = motivation
                    ? [motivation.validFrom ? motivation.validFrom.split('-').reverse().join('.') : 'без даты начала', motivation.validTo ? motivation.validTo.split('-').reverse().join('.') : 'без даты окончания'].join(' — ')
                    : '';
                bonusesContainer.innerHTML =
                    '<div class="dealer-motivation-summary ' + (motivation ? 'is-active' : 'is-empty') + '">' +
                        '<span class="dealer-motivation-summary-icon"><i class="bi bi-cash-coin"></i></span>' +
                        '<div><small>Мотивация</small><strong>' + (motivation ? safeText(motivation.name) : 'Не назначена') + '</strong>' +
                        (motivation ? '<span>' + Number(motivation.ratePerM2 || 0).toLocaleString('ru-RU') + ' ₸/м² · ' + safeText(motivationPeriod) + '</span>' : '') +
                        '</div>' +
                    '</div>' +
                    '<div class="dealer-motivation-notes"><small>Заметки и особые условия</small><p>' + (dealer.bonuses ? safeText(dealer.bonuses) : 'Нет примечаний') + '</p></div>';
            }
            
            renderDealerAddresses(dealer.additional_addresses || []); 
            renderDealerPos(dealer.pos_materials || []); 
            renderDealerLinks(dealer.website, dealer.instagram); 
            renderDealerVisits(dealer.visits || []);
            renderDealerContacts(dealer.contacts || []);
            renderDealerCompetitors(dealer.competitors || []);
            loadDealerWorkshopAssets();
            loadDealerPricing();
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
        galleryPhotos=photos.slice();
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

    async function loadGalleryOriginal(index){
        const photo=galleryPhotos[index],slide=carouselInner?.querySelectorAll('.carousel-item')[index],image=slide?.querySelector('img');
        if(!photo||!image||photo.originalIndex===undefined||image.dataset.originalLoaded==='1')return;
        const target=image;
        try{
            const response=await fetch(`${API_DEALERS_URL}/${encodeURIComponent(dealerId)}/photos/${photo.originalIndex}?v=${encodeURIComponent(photo.originalVersion||'')}`,{crmTrackLoading:false});
            if(!response.ok)return;
            const original=await response.json();
            if(target.isConnected&&slide.classList.contains('active')&&original.photo_url){
                carouselInner.querySelectorAll('img[data-original-loaded]').forEach(img=>{img.src=img.dataset.previewSource;delete img.dataset.originalLoaded;delete img.dataset.previewSource;});
                target.dataset.previewSource=photo.photo_url;target.dataset.originalLoaded='1';target.src=original.photo_url;
            }
        }catch(_){}
    }
    const photoCarousel=document.getElementById('photoCarousel');
    photoCarousel?.addEventListener('slid.bs.carousel',event=>{void loadGalleryOriginal(event.to);});
    window.openLightbox = function(index) { const modalEl = document.getElementById('imageModal'); const carouselEl = document.querySelector('#photoCarousel'); if (modalEl && carouselEl && carouselInner) { carouselInner.innerHTML = galleryCarouselContent; const myModal = new bootstrap.Modal(modalEl); const carousel = bootstrap.Carousel.getOrCreateInstance(carouselEl); carousel.to(index); myModal.show();void loadGalleryOriginal(index); } }
    function openAvatarModal(url) { const modalEl = document.getElementById('imageModal'); if (modalEl && carouselInner) { carouselInner.innerHTML = `<div class="carousel-item active" style="height: 100%;"><div class="d-flex justify-content-center align-items-center h-100"><img src="${url}" style="max-height: 100%; max-width: 100%; object-fit: contain;"></div></div>`; const myModal = new bootstrap.Modal(modalEl); myModal.show(); } }

    function formatDealerPrice(value) {
        const number = Number(value) || 0;
        return number > 0
            ? number.toLocaleString('ru-RU',{maximumFractionDigits:2}) + ' ₸'
            : '—';
    }

    let dealerPricingState = {
        discounts: [],
        totalDiscountPercent: 0
    };

    function priceAfterDiscount(value, percent) {
        const base = Number(value) || 0;
        const discount = Math.max(0, Number(percent) || 0);
        if (base <= 0 || discount <= 0) return base;
        return Math.max(0, base * (1 - discount / 100));
    }

    async function toggleDealerPriceDetails(button) {
        const details = document.getElementById('dealer-price-details');
        if (!details) return;

        if (!details.hidden) {
            details.hidden = true;
            button?.classList.remove('is-open');
            if (button) button.innerHTML = '<i class="bi bi-chevron-down"></i> Развернуть прайс';
            return;
        }

        details.hidden = false;
        button?.classList.add('is-open');
        if (button) button.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Загружаем';

        try {
            const response = await fetch(`/api/pricing/dealers/${dealerId}/price-sheet`, { crmTrackLoading:false });
            const sheet = await response.json().catch(()=>({}));
            if (!response.ok) throw new Error(sheet.error || 'Не удалось загрузить прайс');

            const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
            const liquid = rows.filter(row => row.isLiquid !== false);

            const totalDiscount = Math.max(0, Number(sheet.totalDiscountPercent) || 0);
            const discounts = Array.isArray(sheet.activeDiscounts) ? sheet.activeDiscounts : [];
            const has5 = discounts.some(item => Math.abs((Number(item.discountPercent) || 0) - 5) < 0.001);
            const has10 = discounts.some(item => Math.abs((Number(item.discountPercent) || 0) - 10) < 0.001);

            const rowHtml = row => {
                const wholesale = Number(row.basePrice ?? row.opt) || 0;
                const price5 = has5 ? priceAfterDiscount(wholesale, 5) : 0;
                const price10 = has10 ? priceAfterDiscount(wholesale, 10) : 0;
                const finalWholesale = Number.isFinite(Number(row.finalPrice)) ? Number(row.finalPrice) : (totalDiscount > 0 ? priceAfterDiscount(wholesale, totalDiscount) : wholesale);

                return `
                    <div class="dealer-price-detail-row">
                        <div>
                            <strong>${safeText(row.collection || row.name || 'Коллекция')}</strong>
                            <small>${safeText((row.members || 0) + ' поз. в коллекции')}</small>
                        </div>
                        <div class="dealer-price-detail-values dealer-price-detail-values-expanded">
                            <span class="is-final"><small>Действующая оптовая цена</small><strong>${formatDealerPrice(finalWholesale)}</strong></span>
                            <span><small>Рекомендуемая розница</small><strong>${formatDealerPrice(row.rrp)}</strong></span>
                            <span class="is-display"><small>Цена на витрине</small><strong>${formatDealerPrice(row.displayPrice)}</strong></span>
                            ${has5 ? `<span class="is-action"><small>Опт −5%</small><strong>${formatDealerPrice(price5)}</strong></span>` : ''}
                            ${has10 ? `<span class="is-action"><small>Опт −10%</small><strong>${formatDealerPrice(price10)}</strong></span>` : ''}
                            ${totalDiscount > 0 ? `<span><small>Оптовая до скидки</small><strong>${formatDealerPrice(wholesale)}</strong><em>−${totalDiscount.toLocaleString('ru-RU',{maximumFractionDigits:2})}%</em></span>` : ''}
                        </div>
                    </div>`;
            };

            details.innerHTML =
                `<div class="dealer-price-details-head">
                    <div>
                        <strong>${safeText(sheet.priceList?.name || 'Прайс')}</strong>
                        <small>${sheet.priceList?.versionDate ? 'Версия от '+new Date(sheet.priceList.versionDate+'T00:00:00').toLocaleDateString('ru-RU') : 'Без даты версии'}</small>
                    </div>
                    <span>${safeText(sheet.priceType?.label || sheet.dealer?.priceType || 'Спец.цена')}</span>
                </div>` +
                (liquid.length ? `<div class="dealer-price-detail-section-title">Коллекции</div>${liquid.map(row=>rowHtml(row)).join('')}` : '') +
                (!liquid.length ? '<div class="dealer-price-empty"><i class="bi bi-receipt"></i><span>В прайсе пока нет заполненных цен</span></div>' : '');

            if (button) button.innerHTML = '<i class="bi bi-chevron-up"></i> Свернуть прайс';
        } catch (error) {
            details.innerHTML = '<div class="dealer-price-empty is-error"><i class="bi bi-exclamation-circle"></i><span>Не удалось загрузить содержимое прайса</span></div>';
            if (button) button.innerHTML = '<i class="bi bi-chevron-up"></i> Свернуть прайс';
        }
    }

    function dealerPricingScopeText(condition) {
        if (!condition) return 'из профиля дилера';
        if (condition.scopeType === 'dealer') return 'для дилера';
        const values = Array.isArray(condition.scopeValues) && condition.scopeValues.length
            ? condition.scopeValues
            : (condition.scopeValue ? [condition.scopeValue] : []);
        if (condition.scopeType === 'sector') return values.length ? 'сектор: ' + values.join(', ') : 'сектор';
        if (condition.scopeType === 'city') return values.length ? 'город: ' + values.join(', ') : 'город';
        if (condition.scopeType === 'all') return 'вся дилерская сеть';
        return 'специальное условие';
    }

    function dealerDateText(value, fallback = 'без срока') {
        if (!value) return fallback;
        const date = new Date(String(value).slice(0,10) + 'T00:00:00');
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('ru-RU');
    }

    function updateDealerShareConfirmation() {
        if (!dealerShareCreateBtn || !dealerShareConfirmId || !currentDealer) return;
        const expected = String(currentDealer.dealer_id || '').trim().toLowerCase();
        const actual = String(dealerShareConfirmId.value || '').trim().toLowerCase();
        dealerShareCreateBtn.disabled = !expected || actual !== expected;
    }

    function openDealerPriceShare() {
        if (!currentDealer || !dealerPriceShareModalEl) return;
        dealerShareIdentity.innerHTML = `
            <div><small>Дилер</small><strong>${safeText(currentDealer.name || '')}</strong></div>
            <div><small>Город</small><strong>${safeText(currentDealer.city || '—')}</strong></div>
            <div><small>ID</small><strong class="is-id">${safeText(currentDealer.dealer_id || '—')}</strong></div>
        `;
        dealerShareConfirmId.value = '';
        dealerShareResult.classList.add('d-none');
        dealerShareResult.innerHTML = '';
        dealerShareCreateBtn?.classList.remove('d-none');
        updateDealerShareConfirmation();
        bootstrap.Modal.getOrCreateInstance(dealerPriceShareModalEl).show();
        setTimeout(()=>dealerShareConfirmId?.focus(),250);
    }

    async function createDealerPriceShare() {
        if (!currentDealer || !dealerShareCreateBtn) return;
        try {
            dealerShareCreateBtn.disabled = true;
            dealerShareCreateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Создаём';
            const response = await fetch(`/api/pricing/dealers/${dealerId}/share`, {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({confirmDealerId:dealerShareConfirmId.value || '',expiresHours:Number(dealerShareExpiry.value || 24)})
            });
            const data = await response.json().catch(()=>({}));
            if (!response.ok) throw new Error(data.error || 'Не удалось создать ссылку');

            const url = data.url || '';
            const xlsxUrl = data.xlsxUrl || (url ? url.replace('/price/','/api/public/price-share/') + '.xlsx' : '');
            const expires = data.expiresAt ? new Date(data.expiresAt).toLocaleString('ru-RU') : '';
            const dealerName = data.dealer?.name || currentDealer.name || 'Дилер';
            const filename = `Прайс IDEAL FLOOR - ${dealerName}.xlsx`.replace(/[\\/:*?"<>|]+/g,' ');

            dealerShareCreateBtn?.classList.add('d-none');
            dealerShareResult.classList.remove('d-none');
            dealerShareResult.innerHTML = `
                <div class="dealer-share-result-head"><i class="bi bi-check-circle-fill"></i><div><strong>Прайс готов</strong><span>Для ${safeText(dealerName)} · действует до ${safeText(expires)}</span></div></div>
                <div class="dealer-share-link"><input class="form-control" readonly value="${safeText(url)}"><button type="button" class="btn btn-light border" data-copy-share title="Скопировать ссылку"><i class="bi bi-copy"></i></button></div>
                <button type="button" class="btn btn-success dealer-share-whatsapp" data-share-excel disabled>
                    <i class="bi bi-whatsapp"></i><span><strong>Отправить Excel в WhatsApp</strong><small data-share-excel-status>Подготавливаем файл…</small></span>
                </button>
                <a class="dealer-share-download" href="${safeText(xlsxUrl)}" download>
                    <i class="bi bi-file-earmark-excel"></i><span>Скачать Excel отдельно</span>
                </a>
            `;
            dealerShareResult.querySelector('[data-copy-share]')?.addEventListener('click', async ()=>{
                await navigator.clipboard?.writeText(url);
                window.showToast?.('Ссылка скопирована');
            });

            const shareExcelButton = dealerShareResult.querySelector('[data-share-excel]');
            const shareExcelStatus = dealerShareResult.querySelector('[data-share-excel-status]');
            let preparedExcelFile = null;
            let nativeFileShareReady = false;

            const downloadExcel = () => {
                const download = document.createElement('a');
                download.href = xlsxUrl;
                download.download = filename;
                document.body.appendChild(download);
                download.click();
                download.remove();
            };

            const openWhatsAppWithDownloadedExcel = () => {
                downloadExcel();
                const message = `Прайс IDEAL FLOOR для ${dealerName}. Excel-файл скачан — прикрепите его к этому сообщению.`;
                window.open(`https://wa.me/?text=${encodeURIComponent(message)}`,'_blank','noopener');
            };

            // Prepare the file before the click. File sharing requires transient user activation,
            // and awaiting fetch inside the click caused "Permission denied".
            if (shareExcelButton && navigator.share && navigator.canShare) {
                fetch(xlsxUrl,{cache:'no-store'})
                    .then(response => {
                        if (!response.ok) throw new Error('Не удалось сформировать Excel');
                        return response.blob();
                    })
                    .then(blob => {
                        preparedExcelFile = new File([blob], filename, {
                            type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                        });
                        nativeFileShareReady = navigator.canShare({files:[preparedExcelFile]});
                        shareExcelButton.disabled = false;
                        if (shareExcelStatus) {
                            shareExcelStatus.textContent = nativeFileShareReady
                                ? 'Файл готов · выберите WhatsApp'
                                : 'Excel скачается, затем откроется WhatsApp';
                        }
                    })
                    .catch(() => {
                        shareExcelButton.disabled = false;
                        if (shareExcelStatus) shareExcelStatus.textContent = 'Скачать Excel и открыть WhatsApp';
                    });
            } else {
                if (shareExcelButton) shareExcelButton.disabled = false;
                if (shareExcelStatus) shareExcelStatus.textContent = 'Excel скачается, затем откроется WhatsApp';
            }

            shareExcelButton?.addEventListener('click', ()=>{
                if (nativeFileShareReady && preparedExcelFile && navigator.share) {
                    // This call happens synchronously in the click event to keep browser permission.
                    try {
                        const promise = navigator.share({
                            title:`Прайс IDEAL FLOOR для ${dealerName}`,
                            text:`Персональный прайс IDEAL FLOOR для ${dealerName}`,
                            files:[preparedExcelFile]
                        });
                        promise?.catch(error => {
                            if (error?.name === 'AbortError') return;
                            downloadExcel();
                            window.showToast?.('Браузер запретил системную отправку. Excel скачан — прикрепите его в WhatsApp.','info');
                        });
                    } catch(error) {
                        openWhatsAppWithDownloadedExcel();
                    }
                    return;
                }
                openWhatsAppWithDownloadedExcel();
            });
        } catch(e) {
            window.showToast?.(e.message || 'Ошибка создания ссылки','error');
        } finally {
            dealerShareCreateBtn.innerHTML = '<i class="bi bi-link-45deg me-1"></i>Создать ссылку';
            updateDealerShareConfirmation();
        }
    }

    async function loadDealerPricing() {
        if (!dealerPricingSummary || !can('can_view_pricing')) return;
        try {
            const response = await fetch(`/api/pricing/dealers/${dealerId}`, { crmTrackLoading: false });
            if (!response.ok) throw new Error('pricing');
            const pricing = await response.json();
            const discounts = Array.isArray(pricing.activeDiscounts) ? pricing.activeDiscounts : [];
            dealerPricingState = {
                discounts,
                totalDiscountPercent: Math.max(0, Number(pricing.totalDiscountPercent) || 0)
            };
            const matched = Array.isArray(pricing.matchedConditions) ? pricing.matchedConditions : [];
            const active = matched.filter(item => item.computedStatus === 'active');
            const pending = active.filter(item => Number(item.requirementTarget) > 0 && (Number(item.requirementCurrent) < Number(item.requirementTarget) || item.requirementVerified !== true));

            const discountBadges = discounts.length
                ? discounts.map(item => `<span class="dealer-price-chip is-discount">${safeText(discountTitle(item))}</span>`).join('')
                : '<span class="dealer-price-chip">Дополнительных скидок нет</span>';

            const conditionsHtml = active.length
                ? active.map(item => {
                    const isDiscount = item.kind === 'discount';
                    const title = isDiscount
                        ? `${safeText(discountTitle(item))}`
                        : safeText(item.priceListName || item.name);
                    const conditionStart = item.startDate || item.priceList?.validFrom || '';
                    const conditionEnd = item.endDate || item.priceList?.validTo || '';
                    const dates = `${dealerDateText(conditionStart,'сразу')} — ${dealerDateText(conditionEnd,'без срока')}`;
                    const scopeText = dealerPricingScopeText(item);
                    const req = Number(item.requirementTarget) > 0
                        ? `<small class="dealer-price-requirement ${Number(item.requirementCurrent)>=Number(item.requirementTarget) && item.requirementVerified ? 'is-ok':''}">
                            <i class="bi bi-instagram"></i> ${Number(item.requirementCurrent)||0}/${Number(item.requirementTarget)||0} ${safeText(item.requirementUnit || 'публикаций')}${item.requirementVerified ? ' · подтверждено' : ''}
                          </small>`
                        : '';
                    return `<article class="dealer-price-condition">
                        <div><strong>${title}</strong><small>${scopeText} · ${dates}</small>${req}</div>
                        <span class="dealer-price-kind">${isDiscount ? 'скидка' : 'прайс'}</span>
                    </article>`;
                }).join('')
                : '<div class="dealer-price-empty"><i class="bi bi-check2-circle"></i><span>Активных специальных условий нет</span></div>';

            const override = pricing.priceOverride?.active ? pricing.priceOverride : null;
            const profilePrice = pricing.profilePriceList || pricing.assignedPriceList || pricing.defaultPriceType || 'Спец.цена';
            const currentPrice = pricing.effectivePriceList || profilePrice;
            const overridePeriod = override
                ? `${dealerDateText(override.startDate,'сразу')} — ${dealerDateText(override.endDate,'без срока')}`
                : 'Нет временной подмены';
            const overrideSource = pricing.priceListCondition ? dealerPricingScopeText(pricing.priceListCondition) : 'прайс из профиля';

            dealerPricingSummary.innerHTML = `
                <div class="dealer-price-overview">
                    <div class="dealer-price-metric">
                        <small>Прайс из профиля</small>
                        <strong>${safeText(profilePrice)}</strong>
                        <span>постоянная база дилера</span>
                    </div>
                    <div class="dealer-price-metric ${override ? 'is-override':''}">
                        <small>Сейчас действует</small>
                        <strong>${safeText(currentPrice)}</strong>
                        <span>${safeText(overrideSource)}</span>
                    </div>
                    <div class="dealer-price-metric is-accent">
                        <small>Итоговая скидка</small>${pricing.priceControl?.surchargePercent ? '<span class="pc-accent">Надбавка сети +'+Number(pricing.priceControl.surchargePercent).toLocaleString('ru-RU')+'% · учтена в ценах</span>':''}
                        <strong>${pricing.totalDiscountPercent ? '−'+Number(pricing.totalDiscountPercent).toLocaleString('ru-RU',{maximumFractionDigits:2})+'%' : '0%'}</strong>
                        <span>${discounts.length ? (override ? 'от действующего приоритетного прайса' : 'от действующей оптовой цены') : 'без дополнительной скидки'}</span>
                    </div>
                    <div class="dealer-price-metric ${override ? 'is-return':''}">
                        <small>${override ? 'Период приоритетного прайса' : 'Приоритетный прайс'}</small>
                        <strong>${safeText(overridePeriod)}</strong>
                        <span>${override ? 'после окончания → '+safeText(override.fallbackPriceList || profilePrice) : 'используется прайс из профиля'}</span>
                    </div>
                </div>
                <div class="dealer-price-chips">${discountBadges}</div>
                <div class="dealer-price-conditions">${conditionsHtml}</div>
                <div class="dealer-price-expand-wrap">
                    <button type="button" class="dealer-price-expand-btn" id="dealer-price-expand-btn">
                        <i class="bi bi-chevron-down"></i> Развернуть прайс
                    </button>
                </div>
                <div id="dealer-price-details" class="dealer-price-details" hidden></div>`;

            const expandButton = document.getElementById('dealer-price-expand-btn');
            if (expandButton) {
                expandButton.addEventListener('click', () => toggleDealerPriceDetails(expandButton));
            }
        } catch (e) {
            dealerPricingSummary.innerHTML = '<div class="dealer-price-empty is-error"><i class="bi bi-exclamation-circle"></i><span>Не удалось загрузить ценовые условия</span></div>';
        }
    }

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

    let profilePriceLists = [];

    async function loadProfilePriceLists(selectedId = '') {
        const select = document.getElementById('profile-edit-price-list');
        if (!select) return;
        try {
            const response = await fetch('/api/pricing/price-lists', { crmTrackLoading:false });
            if (!response.ok) throw new Error('price lists');
            const data = await response.json();
            profilePriceLists = Array.isArray(data) ? data.filter(item => item.active !== false) : [];
            select.innerHTML = '<option value="">Не назначен</option>';
            profilePriceLists
                .sort((a,b)=>String(a.name || '').localeCompare(String(b.name || ''),'ru'))
                .forEach(item => {
                    const label = [item.name, item.versionDate ? 'от '+item.versionDate.split('-').reverse().join('.') : ''].filter(Boolean).join(' · ');
                    select.add(new Option(label, item.id));
                });
            const wanted = String(selectedId || '');
            if ([...select.options].some(option => option.value === wanted)) select.value = wanted;
        } catch (_) {
            select.innerHTML = '<option value="">Не удалось загрузить прайсы</option>';
        }
    }

    function ensureProfileEditModal() {
        let modalEl = document.getElementById('dealer-profile-edit-modal');
        if (modalEl) return modalEl;

        const shell = document.createElement('div');
        shell.innerHTML = `
            <div class="modal fade dealer-profile-edit-modal" id="dealer-profile-edit-modal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                <div class="modal-dialog modal-lg modal-dialog-scrollable modal-dialog-centered">
                    <div class="modal-content">
                        <div class="dealer-profile-edit-head">
                            <div>
                                <span id="dealer-profile-edit-kicker">КАРТОЧКА ДИЛЕРА</span>
                                <h3 id="dealer-profile-edit-title">Редактирование</h3>
                                <p id="dealer-profile-edit-subtitle">Изменения сохраняются только в выбранный блок.</p>
                            </div>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Закрыть"></button>
                        </div>
                        <form id="dealer-profile-edit-form">
                            <div class="modal-body dealer-profile-edit-body">
                                <section class="dealer-profile-edit-pane active" data-profile-edit-pane="main">
                                    <div class="dealer-profile-edit-section">
                                        <div class="dealer-profile-edit-section-title"><i class="bi bi-shop"></i><div><strong>Основная информация</strong><small>Название, статус, город, ответственный и договор</small></div></div>
                                        <div class="row g-3">
                                            <div class="col-md-4"><label>ID дилера</label><input id="profile-edit-dealer-id" class="form-control"></div>
                                            <div class="col-md-8"><label>Название</label><input id="profile-edit-name" class="form-control" required></div>
                                            <div class="col-md-4"><label>Статус</label><select id="profile-edit-status" class="form-select"></select></div>
                                            <div class="col-md-4"><label>Город</label><input id="profile-edit-city" class="form-control"></div>
                                            <div class="col-md-4"><label>Прайс</label><select id="profile-edit-price-list" class="form-select"><option value="">Не назначен</option></select></div>
                                            <div class="col-md-8"><label>Мотивация дилера</label><div class="motivation-field-row"><select id="profile-edit-motivation-scheme" data-motivation-select class="form-select"><option value="">Без мотивации</option></select><button type="button" class="motivation-gear-btn motivation-manager-open" title="Настроить мотивации"><i class="bi bi-gear"></i></button></div></div>
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
                                            <div class="col-md-4"><label>Дата договора</label><input id="profile-edit-contract-date" type="date" class="form-control"></div>
                                            <div class="col-md-4">
                                                <label class="d-block">Договор</label>
                                                <div class="dealer-profile-edit-switch">
                                                    <span>Подписан</span>
                                                    <div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" id="profile-edit-contract-signed"></div>
                                                </div>
                                            </div>
                                            <div class="col-md-6"><label>Сайт</label><input id="profile-edit-website" class="form-control"></div>
                                            <div class="col-md-6"><label>Instagram</label><input id="profile-edit-instagram" class="form-control"></div>
                                        </div>
                                    </div>
                                </section>

                                <section class="dealer-profile-edit-pane" data-profile-edit-pane="logistics">
                                    <div class="dealer-profile-edit-section">
                                        <div class="dealer-profile-edit-section-title">
                                            <i class="bi bi-truck"></i>
                                            <div><strong>Логистика и адреса</strong><small>Условия доставки и дополнительные точки</small></div>
                                            <button type="button" class="dealer-profile-edit-add" id="profile-edit-add-address"><i class="bi bi-plus-lg"></i> Адрес</button>
                                        </div>
                                        <div class="mb-3"><label>Условия доставки</label><input id="profile-edit-delivery" class="form-control"></div>
                                        <div id="profile-edit-addresses" class="dealer-profile-edit-contacts"></div>
                                    </div>
                                </section>

                                <section class="dealer-profile-edit-pane" data-profile-edit-pane="notes">
                                    <div class="dealer-profile-edit-section">
                                        <div class="dealer-profile-edit-section-title"><i class="bi bi-sticky"></i><div><strong>Бонусы и заметки</strong><small>Особые условия и рабочие комментарии</small></div></div>
                                        <label>Заметки и особые условия</label>
                                        <textarea id="profile-edit-bonuses" class="form-control" rows="7"></textarea>
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
                                <span><i class="bi bi-shield-check"></i> Сохраняется только этот блок.</span>
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

        document.getElementById('profile-edit-add-contact')?.addEventListener('click', () => addProfileContactRow());
        document.getElementById('profile-edit-contacts')?.addEventListener('click', event => {
            const remove = event.target.closest('[data-remove-profile-contact]');
            if (remove) remove.closest('.dealer-profile-contact-row')?.remove();
        });
        document.getElementById('profile-edit-add-address')?.addEventListener('click', () => addProfileAddressRow());
        document.getElementById('profile-edit-addresses')?.addEventListener('click', event => {
            const remove = event.target.closest('[data-remove-profile-address]');
            if (remove) remove.closest('.dealer-profile-contact-row')?.remove();
        });
        document.getElementById('profile-edit-responsible')?.addEventListener('change', refreshProfileSectorOptions);
        document.getElementById('dealer-profile-edit-form')?.addEventListener('submit', saveProfileEdit);
        return modalEl;
    }

    function activateProfileEditTab(name) {
        const modalEl = ensureProfileEditModal();
        modalEl.dataset.editSection = name;
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

    function addProfileAddressRow(address = {}) {
        ensureProfileEditModal();
        const container = document.getElementById('profile-edit-addresses');
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'dealer-profile-contact-row';
        row.innerHTML = `
            <input class="form-control profile-address-description" placeholder="Описание точки" value="${String(address.description || '').replace(/"/g, '&quot;')}">
            <input class="form-control profile-address-city" placeholder="Город" value="${String(address.city || '').replace(/"/g, '&quot;')}">
            <input class="form-control profile-address-address" placeholder="Адрес" value="${String(address.address || '').replace(/"/g, '&quot;')}">
            <button type="button" data-remove-profile-address aria-label="Удалить адрес"><i class="bi bi-x-lg"></i></button>`;
        container.appendChild(row);
    }

    function collectProfileAddresses() {
        return [...document.querySelectorAll('#profile-edit-addresses .dealer-profile-contact-row')].map(row => ({
            description: row.querySelector('.profile-address-description')?.value.trim() || '',
            city: row.querySelector('.profile-address-city')?.value.trim() || '',
            address: row.querySelector('.profile-address-address')?.value.trim() || ''
        })).filter(item => item.description || item.city || item.address);
    }

    function primaryLegalEntity(dealer) {
        if (Array.isArray(dealer?.legal_entities) && dealer.legal_entities.length) {
            return { ...dealer.legal_entities[0] };
        }
        return {
            organizationName: '',
            director: '',
            legalAddress: '',
            bin: '',
            iik: '',
            bank: '',
            bik: '',
            kbe: '',
            email: ''
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
        });
        return editorReferencePromise;
    }

    async function fillProfileEditor(section = 'main') {
        if (!currentDealer) return;
        const modalEl = ensureProfileEditModal();
        const titles = {
            main: ['ОСНОВНОЕ', 'Основная информация'],
            logistics: ['ЛОГИСТИКА', 'Логистика и адреса'],
            notes: ['ЗАМЕТКИ', 'Бонусы и заметки'],
            contacts: ['КОНТАКТЫ', 'Контакты дилера'],
            requisites: ['РЕКВИЗИТЫ', 'Юридические реквизиты']
        };
        const [kicker, title] = titles[section] || titles.main;
        const kickerEl = document.getElementById('dealer-profile-edit-kicker');
        const titleEl = document.getElementById('dealer-profile-edit-title');
        const subtitle = document.getElementById('dealer-profile-edit-subtitle');
        if (kickerEl) kickerEl.textContent = kicker;
        if (titleEl) titleEl.textContent = title;
        if (subtitle) subtitle.textContent = currentDealer.name || 'Карточка дилера';

        const { statuses, sectors } = await ensureEditorReferences();

        if (section === 'main') {
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
                'profile-edit-address': currentDealer.address,
                'profile-edit-website': currentDealer.website,
                'profile-edit-instagram': currentDealer.instagram,
                'profile-edit-contract-date': currentDealer.contract?.date
            };
            Object.entries(values).forEach(([id, value]) => {
                const input = document.getElementById(id);
                if (input) input.value = value || '';
            });
            await loadProfilePriceLists(currentDealer.price_list?.id || currentDealer.price_list || '');
            const profileMotivation = document.getElementById('profile-edit-motivation-scheme');
            if (profileMotivation) {
                profileMotivation.dataset.selected = String(currentDealer.motivation_scheme?.id || currentDealer.motivation_scheme?._id || currentDealer.motivation_scheme || '');
                window.CRMMotivation?.refreshSelects();
            }
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
        }

        if (section === 'logistics') {
            const delivery = document.getElementById('profile-edit-delivery');
            if (delivery) delivery.value = currentDealer.delivery || '';
            const addresses = document.getElementById('profile-edit-addresses');
            if (addresses) addresses.innerHTML = '';
            (currentDealer.additional_addresses || []).forEach(addProfileAddressRow);
            if (!currentDealer.additional_addresses?.length) addProfileAddressRow();
        }

        if (section === 'notes') {
            const notes = document.getElementById('profile-edit-bonuses');
            if (notes) notes.value = currentDealer.bonuses || '';
        }

        if (section === 'contacts') {
            const contacts = document.getElementById('profile-edit-contacts');
            if (contacts) contacts.innerHTML = '';
            (currentDealer.contacts || []).forEach(addProfileContactRow);
            if (!currentDealer.contacts?.length) addProfileContactRow();
        }

        if (section === 'requisites') {
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
        }

        activateProfileEditTab(section);
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    async function saveProfileEdit(event) {
        event.preventDefault();
        if (!currentDealer || !window.CRMAuth?.can('can_edit_dealer')) return;

        const modalEl = document.getElementById('dealer-profile-edit-modal');
        const section = modalEl?.dataset.editSection || 'main';
        const saveButton = document.getElementById('dealer-profile-edit-save');
        const oldHtml = saveButton?.innerHTML || '';
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Сохраняем';
        }

        let payload = {};
        if (section === 'main') {
            payload = {
                dealer_id: editValue('profile-edit-dealer-id'),
                name: editValue('profile-edit-name'),
                status: editValue('profile-edit-status'),
                city: editValue('profile-edit-city'),
                price_list: editValue('profile-edit-price-list') || null,
                motivation_scheme: editValue('profile-edit-motivation-scheme') || null,
                address: editValue('profile-edit-address'),
                responsible: editValue('profile-edit-responsible'),
                region_sector: editValue('profile-edit-sector'),
                website: editValue('profile-edit-website'),
                instagram: editValue('profile-edit-instagram'),
                contract: {
                    isSigned: Boolean(document.getElementById('profile-edit-contract-signed')?.checked),
                    date: editValue('profile-edit-contract-date')
                }
            };
        } else if (section === 'logistics') {
            payload = {
                delivery: editValue('profile-edit-delivery'),
                additional_addresses: collectProfileAddresses()
            };
        } else if (section === 'notes') {
            payload = { bonuses: editValue('profile-edit-bonuses') };
        } else if (section === 'contacts') {
            payload = { contacts: collectProfileContacts() };
        } else if (section === 'requisites') {
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
            payload = { legal_entities: legalEntities };
        }

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
            bootstrap.Modal.getOrCreateInstance(modalEl).hide();
            window.showToast?.('Блок обновлён', 'success');
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

    document.querySelectorAll('[data-profile-edit-open]').forEach(button => {
        button.addEventListener('click', () => {
            if (!window.CRMAuth || !CRMAuth.can('can_edit_dealer')) return;
            if (!currentDealer) {
                window.showToast?.('Карточка ещё загружается', 'info');
                return;
            }
            fillProfileEditor(button.dataset.profileEditOpen || 'main');
        });
    });

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

    if(duplicateBtn) duplicateBtn.addEventListener('click', () => {
        if (!window.CRMAuth || !CRMAuth.can('can_create_dealer')) return;
        window.location.href = '/?duplicate=' + encodeURIComponent(dealerId);
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
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || 'Не удалось удалить дилера');
                }
                window.location.href = '/';
            } catch (error) { alert(error.message || 'Ошибка удаления дилера'); }
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
