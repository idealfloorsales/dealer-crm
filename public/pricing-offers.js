document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const API = '/api/pricing';
    const state = { dealers:[], lists:[], catalog:[], offers:[], contacts:[], canChooseContact:false, currentContactUserId:'', sheet:null, selected:new Set(), loaded:false, recipientMode:'crm' };
    const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
    const n = value => Number(value) || 0;
    const money = value => n(value) > 0 ? n(value).toLocaleString('ru-RU',{maximumFractionDigits:2}) + ' ₸' : '—';
    const dateText = value => value ? new Date(value).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
    const driveThumb = id => id ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w520' : '';

    function toast(message,type='success'){
        if (window.CRMUI?.toast) return CRMUI.toast(message,type);
        alert(message);
    }

    function currentDealer(){
        return state.dealers.find(item => String(item.dealerId) === String($('pricing-offer-dealer')?.value || '')) || null;
    }

    function manualRecipient(){
        const name=String($('pricing-offer-manual-name')?.value || '').trim();
        if(!name) return null;
        return {
            dealerId:'',
            dealerCode:'',
            dealerName:name,
            city:String($('pricing-offer-manual-city')?.value || '').trim(),
            sector:'',
            status:'manual',
            statusLabel:'Новый клиент'
        };
    }

    function currentRecipient(){
        return state.recipientMode==='manual' ? manualRecipient() : currentDealer();
    }

    function showStock(){
        return Boolean($('pricing-offer-show-stock')?.checked);
    }

    function includeIlliquid(){
        return Boolean($('pricing-offer-show-illiquid')?.checked);
    }

    function includeEquipment(){
        return Boolean($('pricing-offer-show-equipment')?.checked);
    }

    function offerDescription(){
        return String($('pricing-offer-description')?.value || '').trim();
    }

    function currentContact(){
        const selected=String($('pricing-offer-contact-user')?.value || '').trim();
        return state.contacts.find(item=>String(item.userId)===selected) || state.contacts[0] || null;
    }

    function fillContactOptions(){
        const select=$('pricing-offer-contact-user');
        const wrap=$('pricing-offer-contact-select-wrap');
        if(!select) return;
        const current=select.value;
        select.innerHTML=state.contacts.map(item=>{
            const phone=item.phone ? ' · ' + esc(item.phone) : ' · телефон не указан';
            const position=item.position ? ' · ' + esc(item.position) : '';
            return '<option value="' + esc(item.userId) + '">' + esc(item.fullName || 'Сотрудник') + position + phone + '</option>';
        }).join('');
        const preferred=state.contacts.some(item=>String(item.userId)===String(current))
            ? current
            : (state.contacts.some(item=>String(item.userId)===String(state.currentContactUserId)) ? state.currentContactUserId : (state.contacts[0]?.userId || ''));
        select.value=preferred;
        if(wrap) wrap.hidden=!state.canChooseContact;
    }

    function renderContact(){
        const host=$('pricing-offer-contact-card');
        if(!host) return;
        const contact=currentContact();
        if(!contact){
            host.className='pricing-offer-dealer-card is-empty';
            host.textContent='Контакт сотрудника не найден';
            return;
        }
        host.className='pricing-offer-dealer-card';
        const mode=state.canChooseContact ? 'Выбран администратором' : 'Подставляется автоматически';
        host.innerHTML='<strong>' + esc(contact.fullName || 'Сотрудник') + '</strong><span>' +
            esc([contact.position,contact.phone].filter(Boolean).join(' · ') || 'Рабочий телефон не указан') +
            '</span><small>' + esc(mode) + '</small>';
    }

    function productVisibleByMode(item){
        if(item?.productType === 'equipment') return includeEquipment();
        if(item?.isLiquid === false) return includeIlliquid();
        return true;
    }


    function activeLists(){
        const today = new Date().toISOString().slice(0,10);
        return state.lists.filter(item => item.active !== false && (!item.validFrom || item.validFrom <= today) && (!item.validTo || item.validTo >= today));
    }

    function fillDealerOptions(){
        const select=$('pricing-offer-dealer');
        if(!select) return;
        const current=select.value;
        select.innerHTML='<option value="">Выберите потенциального клиента</option>' + state.dealers.map(row =>
            '<option value="' + esc(row.dealerId) + '">' + esc(row.dealerName) + (row.city ? ' · ' + esc(row.city) : '') + '</option>'
        ).join('');
        if(state.dealers.some(row=>String(row.dealerId)===String(current))) select.value=current;
    }

    function fillPriceOptions(){
        const select=$('pricing-offer-price-list');
        if(!select) return;
        const current=select.value;
        select.innerHTML='<option value="">Выберите прайс</option>' + activeLists().map(item =>
            '<option value="' + esc(item.id) + '">' + esc(item.name) + (item.versionDate ? ' · ' + esc(String(item.versionDate).slice(0,10)) : '') + '</option>'
        ).join('');
        if(activeLists().some(item=>String(item.id)===String(current))) select.value=current;
    }

    function fillCollections(){
        const select=$('pricing-offer-collection');
        if(!select) return;
        const current=select.value;
        const collections=[...new Set(state.catalog.filter(productVisibleByMode).map(item=>item.collection).filter(Boolean))]
            .sort((a,b)=>String(a).localeCompare(String(b),'ru'));
        select.innerHTML='<option value="">Все коллекции</option>' + collections.map(name=>'<option value="' + esc(name) + '">' + esc(name) + '</option>').join('');
        select.value=collections.includes(current) ? current : '';
    }

    function priceForProduct(product){
        if(!state.sheet) return null;
        const rows=state.sheet.rows || [];
        const special=rows.find(row =>
            row.rowType === 'product' &&
            (
                String(row.productId || '') === String(product.id || '') ||
                (row.sku && String(row.sku).trim().toLowerCase() === String(product.sku || '').trim().toLowerCase())
            )
        );
        if(product?.productType === 'equipment' || product?.isLiquid === false) return special || null;
        return rows.find(row =>
            row.rowType === 'collection' &&
            String(row.collection || '').trim().toUpperCase() === String(product.collection || '').trim().toUpperCase()
        ) || special || null;
    }

    function renderDealer(){
        const dealer=currentRecipient();
        const host=$('pricing-offer-dealer-card');
        if(!dealer){
            host.className='pricing-offer-dealer-card is-empty';
            host.textContent=state.recipientMode==='manual'
                ? 'Введите название нового клиента'
                : 'Сначала выберите потенциального клиента';
            return;
        }
        host.className='pricing-offer-dealer-card';
        const meta=[dealer.city,dealer.sector].filter(Boolean).join(' · ');
        host.innerHTML='<strong>' + esc(dealer.dealerName) + '</strong>' +
            (meta ? '<span>' + esc(meta) + '</span>' : '') +
            '<small>' + esc(state.recipientMode==='manual' ? 'Новый клиент · не добавляется в CRM' : 'Статус: ' + (dealer.statusLabel || 'Потенциальный')) + '</small>';
    }

    function syncRecipientMode(){
        const crm=$('pricing-offer-recipient-crm');
        const manual=$('pricing-offer-recipient-manual');
        if(crm) crm.hidden=state.recipientMode!=='crm';
        if(manual) manual.hidden=state.recipientMode!=='manual';
        document.querySelectorAll('[data-offer-recipient-mode]').forEach(btn=>{
            btn.classList.toggle('active',btn.dataset.offerRecipientMode===state.recipientMode);
        });
        renderDealer();
        syncCreateState();
    }

    function renderPriceSummary(){
        const host=$('pricing-offer-price-summary');
        if(!state.sheet){
            host.className='pricing-offer-price-summary is-empty';
            host.textContent='Выберите клиента и прайс для КП.';
            return;
        }
        const list=state.sheet.priceList?.name || state.sheet.priceType?.label || 'Спец.цена';
        const discount=n(state.sheet.totalDiscountPercent);
        host.className='pricing-offer-price-summary';
        host.innerHTML='<div><small>Прайс</small><strong>' + esc(list) + '</strong></div><div><small>Скидки</small><strong>Не применяются</strong></div><div><small>Расчёт</small><strong>По выбранному прайсу</strong></div>';
    }

    function filteredProducts(){
        const query=String($('pricing-offer-search')?.value || '').trim().toLowerCase();
        const collection=$('pricing-offer-collection')?.value || '';
        return state.catalog.filter(item => {
            if(!productVisibleByMode(item)) return false;
            if(collection && item.collection !== collection) return false;
            if(query && ![item.sku,item.name,item.collection,item.productType==='equipment'?'торговое оборудование':''].join(' ').toLowerCase().includes(query)) return false;
            return true;
        });
    }

    function pruneHiddenSelections(){
        const visibleIds=new Set(state.catalog.filter(productVisibleByMode).map(item=>String(item.id)));
        [...state.selected].forEach(id=>{ if(!visibleIds.has(String(id))) state.selected.delete(String(id)); });
    }

    function productCard(item){
        const selected=state.selected.has(String(item.id));
        const price=priceForProduct(item);
        const photo=driveThumb(item.photoId);
        const ch=item.characteristics || {};
        const specs=item.productType==='equipment'
            ? 'Торговое оборудование'
            : [ch.class,ch.thickness ? ch.thickness+' мм' : '',ch.bevel].filter(Boolean).join(' · ');
        const badges=[
            item.productType==='equipment' ? '<span class="pricing-offer-product-kind is-equipment">Торговое оборудование</span>' : '',
            item.productType!=='equipment' && item.isLiquid===false ? '<span class="pricing-offer-product-kind is-illiquid">Неликвид</span>' : ''
        ].join('');
        const stockUnit=item.productType==='equipment' ? 'шт' : 'м²';
        const stockHtml=showStock()
            ? '<span class="pricing-offer-product-stock"><i class="bi bi-box-seam"></i> Остаток: ' + n(item.stockQty).toLocaleString('ru-RU',{maximumFractionDigits:2}) + ' ' + stockUnit + '</span>'
            : '';
        return '<button type="button" class="pricing-offer-product-card ' + (selected?'is-selected':'') + '" data-offer-product="' + esc(item.id) + '">' +
            '<span class="pricing-offer-product-check"><i class="bi bi-' + (selected?'check-lg':'plus-lg') + '"></i></span>' +
            '<div class="pricing-offer-product-photo">' + (photo ? '<img src="' + esc(photo) + '" alt="' + esc(item.name) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'"><span class="pricing-offer-photo-fallback"><i class="bi bi-image"></i></span>' : '<span class="pricing-offer-photo-fallback" style="display:grid"><i class="bi bi-image"></i></span>') + '</div>' +
            '<div class="pricing-offer-product-copy"><small>' + esc(item.sku || '') + '</small><strong>' + esc(item.name || '') + '</strong><span>' + esc(item.collection || '') + '</span><em>' + esc(specs || 'IDEAL FLOOR') + '</em>' + badges + stockHtml + '</div>' +
            '<div class="pricing-offer-product-price"><small>Цена для КП</small><strong>' + (price ? money(price.finalPrice || price.basePrice) : '—') + '</strong>' + (price && n(state.sheet?.totalDiscountPercent) ? '<span>с учётом скидки</span>' : '') + '</div>' +
        '</button>';
    }

    function renderProducts(){
        const host=$('pricing-offer-product-grid');
        if(!host) return;
        const items=filteredProducts();
        if(!items.length){
            host.innerHTML='<div class="pricing-empty"><i class="bi bi-search me-1"></i>Позиции не найдены</div>';
        }else{
            host.innerHTML=items.map(productCard).join('');
        }
        $('pricing-offer-selected-count').textContent=state.selected.size;
        syncCreateState();
    }

    async function refreshSheet(){
        const dealer=currentRecipient();
        state.sheet=null;
        renderPriceSummary();
        renderProducts();
        if(!dealer) return;
        const priceListId=$('pricing-offer-price-list')?.value || '';
        if(!priceListId){
            syncCreateState();
            return;
        }
        try{
            const url=state.recipientMode==='manual'
                ? API+'/offer-price-sheet?priceListId='+encodeURIComponent(priceListId)+'&clientName='+encodeURIComponent(dealer.dealerName || '')+'&clientCity='+encodeURIComponent(dealer.city || '')
                : API+'/dealers/'+encodeURIComponent(dealer.dealerId)+'/price-sheet?forOffer=1&priceListId='+encodeURIComponent(priceListId);
            const response=await fetch(url,{crmTrackLoading:false});
            const data=await response.json().catch(()=>({}));
            if(!response.ok) throw new Error(data.error || 'Не удалось рассчитать цены');
            state.sheet=data;
            renderPriceSummary();
            renderProducts();
        }catch(error){
            toast(error.message,'error');
        }
    }

    function syncCreateState(){
        const dealer=currentRecipient();
        const priceSelected=Boolean($('pricing-offer-price-list')?.value);
        const ready=Boolean(dealer && priceSelected && state.sheet && state.selected.size);
        const btn=$('pricing-offer-create-btn');
        if(btn) btn.disabled=!ready;
        const summary=$('pricing-offer-create-summary');
        if(!dealer) summary.textContent=state.recipientMode==='manual' ? 'Введите название нового клиента' : 'Выберите потенциального клиента';
        else if(!priceSelected) summary.textContent='Выберите прайс для КП';
        else if(!state.selected.size) summary.textContent='Выберите коллекции или позиции';
        else summary.textContent=dealer.dealerName + ' · ' + state.selected.size + ' позиций · ' + (state.sheet?.priceList?.name || state.sheet?.priceType?.label || 'Спец.цена') + (showStock() ? ' · с остатками' : '');
    }

    function resetBuilder(){
        state.selected.clear();
        state.sheet=null;
        state.recipientMode='crm';
        if($('pricing-offer-dealer')) $('pricing-offer-dealer').value='';
        if($('pricing-offer-manual-name')) $('pricing-offer-manual-name').value='';
        if($('pricing-offer-manual-city')) $('pricing-offer-manual-city').value='';
        if($('pricing-offer-price-list')) $('pricing-offer-price-list').value='';
        if($('pricing-offer-contact-user')) $('pricing-offer-contact-user').value=state.currentContactUserId || state.contacts[0]?.userId || '';
        if($('pricing-offer-show-stock')) $('pricing-offer-show-stock').checked=false;
        if($('pricing-offer-show-illiquid')) $('pricing-offer-show-illiquid').checked=false;
        if($('pricing-offer-show-equipment')) $('pricing-offer-show-equipment').checked=false;
        if($('pricing-offer-description')) $('pricing-offer-description').value=$('pricing-offer-description').defaultValue || '';
        if($('pricing-offer-search')) $('pricing-offer-search').value='';
        if($('pricing-offer-collection')) $('pricing-offer-collection').value='';
        $('pricing-offer-result')?.classList.add('d-none');
        syncRecipientMode();
        fillCollections();
        fillContactOptions();
        renderContact();
        renderPriceSummary();
        renderProducts();
    }

    async function createOffer(){
        const dealer=currentRecipient();
        if(!dealer || !state.sheet || !state.selected.size) return;
        const btn=$('pricing-offer-create-btn');
        const original=btn.innerHTML;
        try{
            btn.disabled=true;
            btn.innerHTML='<span class="spinner-border spinner-border-sm"></span> Создаём КП';
            const response=await fetch(API+'/offers',{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    recipientMode:state.recipientMode,
                    dealerId:state.recipientMode==='crm' ? dealer.dealerId : '',
                    manualClientName:state.recipientMode==='manual' ? dealer.dealerName : '',
                    manualClientCity:state.recipientMode==='manual' ? dealer.city : '',
                    priceListId:$('pricing-offer-price-list').value || '',
                    contactUserId:currentContact()?.userId || '',
                    expiresDays:Number($('pricing-offer-expiry').value || 14),
                    showStock:showStock(),
                    description:offerDescription(),
                    productIds:[...state.selected]
                })
            });
            const data=await response.json().catch(()=>({}));
            if(!response.ok) throw new Error(data.error || 'Не удалось создать КП');
            const result=$('pricing-offer-result');
            result.classList.remove('d-none');
            result.innerHTML='<div class="pricing-offer-result-icon"><i class="bi bi-check2"></i></div><div class="pricing-offer-result-copy"><small>КП СОЗДАНО</small><strong>' + esc(data.offerNumber || 'Коммерческое предложение') + '</strong><span>' + esc(dealer.dealerName) + ' · ' + esc(String(data.itemsCount || state.selected.size)) + ' позиций · действует до ' + esc(dateText(data.expiresAt)) + '</span></div><div class="pricing-offer-result-actions"><button type="button" data-offer-copy="' + esc(data.url) + '"><i class="bi bi-copy"></i> Скопировать ссылку</button><a href="' + esc(data.url) + '" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> Открыть</a><a class="is-whatsapp" href="https://wa.me/?text=' + encodeURIComponent('Коммерческое предложение IDEAL FLOOR для ' + dealer.dealerName + ': ' + data.url) + '" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> WhatsApp</a></div>';
            result.scrollIntoView({behavior:'smooth',block:'nearest'});
            toast('Электронное КП создано');
            await loadOffers();
        }catch(error){
            toast(error.message,'error');
        }finally{
            btn.innerHTML=original;
            syncCreateState();
        }
    }

    function offerStatus(item){
        if(item.status==='revoked') return ['Отозвано','is-revoked'];
        if(item.status==='expired') return ['Истекло','is-expired'];
        return ['Активно','is-active'];
    }

    function renderOffers(){
        const host=$('pricing-offer-history');
        if(!host) return;
        if(!state.offers.length){
            host.innerHTML='<div class="pricing-empty"><i class="bi bi-file-earmark-text me-1"></i>КП ещё не создавались</div>';
            return;
        }
        host.innerHTML=state.offers.map(item=>{
            const status=offerStatus(item);
            const actions=[];
            if(item.url){
                actions.push('<button data-offer-copy="' + esc(item.url) + '" title="Скопировать ссылку"><i class="bi bi-copy"></i></button>');
                actions.push('<a href="' + esc(item.url) + '" target="_blank" rel="noopener" title="Открыть КП"><i class="bi bi-box-arrow-up-right"></i></a>');
                if(item.canManage) actions.push('<button class="is-warning" data-offer-revoke="' + esc(item.id) + '" title="Отозвать ссылку"><i class="bi bi-slash-circle"></i></button>');
            }
            if(item.canDelete) actions.push('<button class="is-danger" data-offer-delete="' + esc(item.id) + '" data-offer-number="' + esc(item.offerNumber || 'КП') + '" title="Удалить КП навсегда"><i class="bi bi-trash3"></i></button>');
            return '<article class="pricing-offer-history-card"><div class="pricing-offer-history-main"><span class="pricing-offer-status ' + status[1] + '">' + status[0] + '</span><strong>' + esc(item.offerNumber || 'КП') + '</strong><small>' + esc(item.dealerName || '') + (item.dealerCity ? ' · ' + esc(item.dealerCity) : '') + '</small></div><div class="pricing-offer-history-meta"><div><small>Прайс</small><strong>' + esc(item.priceListName || '—') + '</strong></div><div><small>Скидка</small><strong>' + (n(item.totalDiscountPercent)?'−'+n(item.totalDiscountPercent).toLocaleString('ru-RU',{maximumFractionDigits:2})+'%':'0%') + '</strong></div><div><small>Позиций</small><strong>' + esc(item.itemsCount || 0) + '</strong></div><div><small>Просмотров</small><strong>' + esc(item.viewCount || 0) + '</strong></div><div><small>Создано</small><strong>' + esc(dateText(item.createdAt)) + '</strong></div><div><small>Действует до</small><strong>' + esc(dateText(item.expiresAt)) + '</strong></div></div><div class="pricing-offer-history-actions">' + actions.join('') + '</div></article>';
        }).join('');
    }

    async function loadOffers(){
        try{
            const response=await fetch(API+'/offers',{crmTrackLoading:false});
            const data=await response.json().catch(()=>[]);
            if(!response.ok) throw new Error(data.error || 'Не удалось загрузить КП');
            state.offers=Array.isArray(data)?data:[];
            renderOffers();
        }catch(error){
            $('pricing-offer-history').innerHTML='<div class="pricing-empty text-danger">' + esc(error.message) + '</div>';
        }
    }

    async function loadData(){
        if(state.loaded) return;
        try{
            if(window.CRMAuth?.ready) await CRMAuth.ready;
            if(window.CRMAuth && !CRMAuth.can('can_view_pricing')) return;
            const [recipientsRes,listsRes,catalogRes,offersRes,contactsRes]=await Promise.all([
                fetch(API+'/offer-recipients',{crmTrackLoading:false}),
                fetch(API+'/price-lists',{crmTrackLoading:false}),
                fetch(API+'/catalog',{crmTrackLoading:false}),
                fetch(API+'/offers',{crmTrackLoading:false}),
                fetch(API+'/contact-users',{crmTrackLoading:false})
            ]);
            const recipients=await recipientsRes.json().catch(()=>[]);
            const lists=await listsRes.json().catch(()=>[]);
            const catalog=await catalogRes.json().catch(()=>[]);
            const offers=await offersRes.json().catch(()=>[]);
            const contactsData=await contactsRes.json().catch(()=>({}));
            if(!recipientsRes.ok) throw new Error(recipients.error || 'Не удалось загрузить потенциальных клиентов');
            if(!listsRes.ok) throw new Error(lists.error || 'Не удалось загрузить прайсы');
            if(!catalogRes.ok) throw new Error(catalog.error || 'Не удалось загрузить ассортимент');
            if(!contactsRes.ok) throw new Error(contactsData.error || 'Не удалось загрузить контакты сотрудников');
            state.dealers=Array.isArray(recipients)?recipients:[];
            state.lists=Array.isArray(lists)?lists:[];
            state.catalog=Array.isArray(catalog)?catalog:[];
            state.offers=Array.isArray(offers)?offers:[];
            state.contacts=Array.isArray(contactsData.contacts)?contactsData.contacts:[];
            state.canChooseContact=Boolean(contactsData.canChoose);
            state.currentContactUserId=String(contactsData.currentUserId || '');
            state.loaded=true;
            fillDealerOptions(); fillPriceOptions(); fillCollections(); fillContactOptions(); syncRecipientMode(); renderDealer(); renderContact(); renderPriceSummary(); renderProducts(); renderOffers();
        }catch(error){
            console.error(error);
            toast(error.message,'error');
        }
    }

    $('pricing-offer-new-btn')?.addEventListener('click',()=>{
        document.querySelector('[data-pricing-view="offers"]')?.click();
        resetBuilder();
        setTimeout(()=>$('pricing-offer-dealer')?.focus(),80);
    });
    $('pricing-offer-reset-btn')?.addEventListener('click',resetBuilder);
    document.querySelectorAll('[data-offer-recipient-mode]').forEach(btn=>btn.addEventListener('click',()=>{
        const next=btn.dataset.offerRecipientMode==='manual' ? 'manual' : 'crm';
        if(next===state.recipientMode) return;
        state.recipientMode=next;
        state.sheet=null;
        if($('pricing-offer-price-list')) $('pricing-offer-price-list').value='';
        syncRecipientMode();
        renderPriceSummary();
        renderProducts();
        setTimeout(()=>state.recipientMode==='manual' ? $('pricing-offer-manual-name')?.focus() : $('pricing-offer-dealer')?.focus(),40);
    }));
    $('pricing-offer-dealer')?.addEventListener('change',()=>{ $('pricing-offer-price-list').value=''; state.sheet=null; renderDealer(); renderPriceSummary(); renderProducts(); syncCreateState(); });
    $('pricing-offer-contact-user')?.addEventListener('change',()=>{ renderContact(); syncCreateState(); });
    $('pricing-offer-manual-name')?.addEventListener('input',()=>{ renderDealer(); syncCreateState(); });
    $('pricing-offer-manual-name')?.addEventListener('change',()=>{
        if(state.recipientMode==='manual' && currentRecipient() && $('pricing-offer-price-list')?.value && !state.sheet) refreshSheet();
    });
    $('pricing-offer-manual-city')?.addEventListener('input',()=>{ renderDealer(); syncCreateState(); });
    $('pricing-offer-price-list')?.addEventListener('change',refreshSheet);
    $('pricing-offer-show-stock')?.addEventListener('change',()=>{ renderProducts(); syncCreateState(); });
    $('pricing-offer-show-illiquid')?.addEventListener('change',()=>{ pruneHiddenSelections(); fillCollections(); renderProducts(); });
    $('pricing-offer-show-equipment')?.addEventListener('change',()=>{ pruneHiddenSelections(); fillCollections(); renderProducts(); });
    $('pricing-offer-search')?.addEventListener('input',renderProducts);
    $('pricing-offer-collection')?.addEventListener('change',renderProducts);
    $('pricing-offer-select-visible')?.addEventListener('click',()=>{ filteredProducts().forEach(item=>state.selected.add(String(item.id))); renderProducts(); });
    $('pricing-offer-clear')?.addEventListener('click',()=>{ state.selected.clear(); renderProducts(); });
    $('pricing-offer-create-btn')?.addEventListener('click',createOffer);
    $('pricing-offer-refresh-btn')?.addEventListener('click',loadOffers);

    $('pricing-offer-product-grid')?.addEventListener('click',event=>{
        const card=event.target.closest('[data-offer-product]');
        if(!card) return;
        const id=String(card.dataset.offerProduct || '');
        if(state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
        renderProducts();
    });

    document.addEventListener('click',async event=>{
        const copy=event.target.closest('[data-offer-copy]');
        if(copy){
            const url=copy.dataset.offerCopy || '';
            try{ await navigator.clipboard.writeText(url); toast('Ссылка на КП скопирована'); }
            catch(e){ prompt('Скопируйте ссылку:',url); }
            return;
        }
        const revoke=event.target.closest('[data-offer-revoke]');
        if(revoke){
            if(!confirm('Отозвать это КП? Клиент больше не сможет открыть ссылку, но КП останется в истории.')) return;
            try{
                const response=await fetch(API+'/offers/'+encodeURIComponent(revoke.dataset.offerRevoke),{method:'DELETE'});
                const data=await response.json().catch(()=>({}));
                if(!response.ok) throw new Error(data.error || 'Не удалось отозвать КП');
                toast('КП отозвано');
                await loadOffers();
            }catch(error){ toast(error.message,'error'); }
            return;
        }
        const remove=event.target.closest('[data-offer-delete]');
        if(remove){
            const number=remove.dataset.offerNumber || 'это КП';
            if(!confirm('Удалить ' + number + ' навсегда? История, ссылка и статистика просмотров будут удалены без возможности восстановления.')) return;
            try{
                remove.disabled=true;
                const response=await fetch(API+'/offers/'+encodeURIComponent(remove.dataset.offerDelete)+'/permanent',{method:'DELETE'});
                const data=await response.json().catch(()=>({}));
                if(!response.ok) throw new Error(data.error || 'Не удалось удалить КП');
                toast('КП удалено');
                await loadOffers();
            }catch(error){
                remove.disabled=false;
                toast(error.message,'error');
            }
        }
    });

    loadData();
});