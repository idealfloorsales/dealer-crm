document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const API = '/api/pricing';
    const state = { dealers:[], lists:[], catalog:[], offers:[], sheet:null, selected:new Set(), loaded:false };
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
        const collections=[...new Set(state.catalog.map(item=>item.collection).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ru'));
        select.innerHTML='<option value="">Все коллекции</option>' + collections.map(name=>'<option value="' + esc(name) + '">' + esc(name) + '</option>').join('');
    }

    function priceForProduct(product){
        if(!state.sheet) return null;
        return (state.sheet.rows || []).find(row =>
            row.rowType === 'collection' &&
            String(row.collection || '').trim().toUpperCase() === String(product.collection || '').trim().toUpperCase()
        ) || null;
    }

    function renderDealer(){
        const dealer=currentDealer();
        const host=$('pricing-offer-dealer-card');
        if(!dealer){
            host.className='pricing-offer-dealer-card is-empty';
            host.textContent='Сначала выберите потенциального клиента';
            return;
        }
        host.className='pricing-offer-dealer-card';
        host.innerHTML='<strong>' + esc(dealer.dealerName) + '</strong><span>' + esc([dealer.city,dealer.sector].filter(Boolean).join(' · ')) + '</span><small>Статус: ' + esc(dealer.statusLabel || 'Потенциальный') + '</small>';
    }

    function renderPriceSummary(){
        const host=$('pricing-offer-price-summary');
        if(!state.sheet){
            host.className='pricing-offer-price-summary is-empty';
            host.textContent='Выберите потенциального клиента и прайс для КП.';
            return;
        }
        const list=state.sheet.priceList?.name || state.sheet.priceType?.label || 'Спец.цена';
        const discount=n(state.sheet.totalDiscountPercent);
        host.className='pricing-offer-price-summary';
        host.innerHTML='<div><small>Прайс</small><strong>' + esc(list) + '</strong></div><div><small>Скидки дилера</small><strong class="' + (discount?'is-red':'') + '">' + (discount ? '−'+discount.toLocaleString('ru-RU',{maximumFractionDigits:2})+'%' : '0%') + '</strong></div><div><small>Расчёт</small><strong>' + ( $('pricing-offer-price-list')?.value ? 'Выбранный прайс + скидки' : 'Действующие условия CRM') + '</strong></div>';
    }

    function filteredProducts(){
        const query=String($('pricing-offer-search')?.value || '').trim().toLowerCase();
        const collection=$('pricing-offer-collection')?.value || '';
        return state.catalog.filter(item => {
            if(item.isLiquid === false) return false;
            if(collection && item.collection !== collection) return false;
            if(query && ![item.sku,item.name,item.collection].join(' ').toLowerCase().includes(query)) return false;
            return true;
        });
    }

    function productCard(item){
        const selected=state.selected.has(String(item.id));
        const price=priceForProduct(item);
        const photo=driveThumb(item.photoId);
        const ch=item.characteristics || {};
        const specs=[ch.class,ch.thickness ? ch.thickness+' мм' : '',ch.bevel].filter(Boolean).join(' · ');
        return '<button type="button" class="pricing-offer-product-card ' + (selected?'is-selected':'') + '" data-offer-product="' + esc(item.id) + '">' +
            '<span class="pricing-offer-product-check"><i class="bi bi-' + (selected?'check-lg':'plus-lg') + '"></i></span>' +
            '<div class="pricing-offer-product-photo">' + (photo ? '<img src="' + esc(photo) + '" alt="' + esc(item.name) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'"><span class="pricing-offer-photo-fallback"><i class="bi bi-image"></i></span>' : '<span class="pricing-offer-photo-fallback" style="display:grid"><i class="bi bi-image"></i></span>') + '</div>' +
            '<div class="pricing-offer-product-copy"><small>' + esc(item.sku || '') + '</small><strong>' + esc(item.name || '') + '</strong><span>' + esc(item.collection || '') + '</span><em>' + esc(specs || 'IDEAL FLOOR') + '</em></div>' +
            '<div class="pricing-offer-product-price"><small>Цена для КП</small><strong>' + (price ? money(price.finalPrice || price.basePrice) : '—') + '</strong>' + (price && n(state.sheet?.totalDiscountPercent) ? '<span>с учётом скидки</span>' : '') + '</div>' +
        '</button>';
    }

    function renderProducts(){
        const host=$('pricing-offer-product-grid');
        if(!host) return;
        const items=filteredProducts();
        if(!items.length){
            host.innerHTML='<div class="pricing-empty"><i class="bi bi-search me-1"></i>Декоры не найдены</div>';
        }else{
            host.innerHTML=items.map(productCard).join('');
        }
        $('pricing-offer-selected-count').textContent=state.selected.size;
        syncCreateState();
    }

    async function refreshSheet(){
        const dealer=currentDealer();
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
            const url=API+'/dealers/'+encodeURIComponent(dealer.dealerId)+'/price-sheet?forOffer=1&priceListId='+encodeURIComponent(priceListId);
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
        const dealer=currentDealer();
        const priceSelected=Boolean($('pricing-offer-price-list')?.value);
        const ready=Boolean(dealer && priceSelected && state.sheet && state.selected.size);
        const btn=$('pricing-offer-create-btn');
        if(btn) btn.disabled=!ready;
        const summary=$('pricing-offer-create-summary');
        if(!dealer) summary.textContent='Выберите потенциального клиента';
        else if(!priceSelected) summary.textContent='Выберите прайс для КП';
        else if(!state.selected.size) summary.textContent='Выберите коллекции или декоры';
        else summary.textContent=dealer.dealerName + ' · ' + state.selected.size + ' декоров · ' + (state.sheet?.priceList?.name || state.sheet?.priceType?.label || 'Спец.цена');
    }

    function resetBuilder(){
        state.selected.clear();
        state.sheet=null;
        if($('pricing-offer-dealer')) $('pricing-offer-dealer').value='';
        if($('pricing-offer-price-list')) $('pricing-offer-price-list').value='';
        if($('pricing-offer-search')) $('pricing-offer-search').value='';
        if($('pricing-offer-collection')) $('pricing-offer-collection').value='';
        $('pricing-offer-result')?.classList.add('d-none');
        renderDealer();
        renderPriceSummary();
        renderProducts();
    }

    async function createOffer(){
        const dealer=currentDealer();
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
                    dealerId:dealer.dealerId,
                    priceListId:$('pricing-offer-price-list').value || '',
                    expiresDays:Number($('pricing-offer-expiry').value || 14),
                    productIds:[...state.selected]
                })
            });
            const data=await response.json().catch(()=>({}));
            if(!response.ok) throw new Error(data.error || 'Не удалось создать КП');
            const result=$('pricing-offer-result');
            result.classList.remove('d-none');
            result.innerHTML='<div class="pricing-offer-result-icon"><i class="bi bi-check2"></i></div><div class="pricing-offer-result-copy"><small>КП СОЗДАНО</small><strong>' + esc(data.offerNumber || 'Коммерческое предложение') + '</strong><span>' + esc(dealer.dealerName) + ' · ' + esc(String(data.itemsCount || state.selected.size)) + ' декоров · действует до ' + esc(dateText(data.expiresAt)) + '</span></div><div class="pricing-offer-result-actions"><button type="button" data-offer-copy="' + esc(data.url) + '"><i class="bi bi-copy"></i> Скопировать ссылку</button><a href="' + esc(data.url) + '" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> Открыть</a><a class="is-whatsapp" href="https://wa.me/?text=' + encodeURIComponent('Коммерческое предложение IDEAL FLOOR для ' + dealer.dealerName + ': ' + data.url) + '" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> WhatsApp</a></div>';
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
            return '<article class="pricing-offer-history-card"><div class="pricing-offer-history-main"><span class="pricing-offer-status ' + status[1] + '">' + status[0] + '</span><strong>' + esc(item.offerNumber || 'КП') + '</strong><small>' + esc(item.dealerName || '') + (item.dealerCity ? ' · ' + esc(item.dealerCity) : '') + '</small></div><div class="pricing-offer-history-meta"><div><small>Прайс</small><strong>' + esc(item.priceListName || '—') + '</strong></div><div><small>Скидка</small><strong>' + (n(item.totalDiscountPercent)?'−'+n(item.totalDiscountPercent).toLocaleString('ru-RU',{maximumFractionDigits:2})+'%':'0%') + '</strong></div><div><small>Декоров</small><strong>' + esc(item.itemsCount || 0) + '</strong></div><div><small>Просмотров</small><strong>' + esc(item.viewCount || 0) + '</strong></div><div><small>Создано</small><strong>' + esc(dateText(item.createdAt)) + '</strong></div></div><div class="pricing-offer-history-actions">' + (item.url ? '<button data-offer-copy="' + esc(item.url) + '" title="Скопировать"><i class="bi bi-copy"></i></button><a href="' + esc(item.url) + '" target="_blank" rel="noopener" title="Открыть"><i class="bi bi-box-arrow-up-right"></i></a><button class="is-danger" data-offer-revoke="' + esc(item.id) + '" title="Отозвать"><i class="bi bi-x-lg"></i></button>' : '') + '</div></article>';
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
            const [recipientsRes,listsRes,catalogRes,offersRes]=await Promise.all([
                fetch(API+'/offer-recipients',{crmTrackLoading:false}),
                fetch(API+'/price-lists',{crmTrackLoading:false}),
                fetch(API+'/catalog',{crmTrackLoading:false}),
                fetch(API+'/offers',{crmTrackLoading:false})
            ]);
            const recipients=await recipientsRes.json().catch(()=>[]);
            const lists=await listsRes.json().catch(()=>[]);
            const catalog=await catalogRes.json().catch(()=>[]);
            const offers=await offersRes.json().catch(()=>[]);
            if(!recipientsRes.ok) throw new Error(recipients.error || 'Не удалось загрузить потенциальных клиентов');
            if(!listsRes.ok) throw new Error(lists.error || 'Не удалось загрузить прайсы');
            if(!catalogRes.ok) throw new Error(catalog.error || 'Не удалось загрузить ассортимент');
            state.dealers=Array.isArray(recipients)?recipients:[];
            state.lists=Array.isArray(lists)?lists:[];
            state.catalog=Array.isArray(catalog)?catalog:[];
            state.offers=Array.isArray(offers)?offers:[];
            state.loaded=true;
            fillDealerOptions(); fillPriceOptions(); fillCollections(); renderDealer(); renderPriceSummary(); renderProducts(); renderOffers();
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
    $('pricing-offer-dealer')?.addEventListener('change',()=>{ $('pricing-offer-price-list').value=''; state.sheet=null; renderDealer(); renderPriceSummary(); renderProducts(); syncCreateState(); });
    $('pricing-offer-price-list')?.addEventListener('change',refreshSheet);
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
            if(!confirm('Отозвать это КП? Клиент больше не сможет открыть ссылку.')) return;
            try{
                const response=await fetch(API+'/offers/'+encodeURIComponent(revoke.dataset.offerRevoke),{method:'DELETE'});
                const data=await response.json().catch(()=>({}));
                if(!response.ok) throw new Error(data.error || 'Не удалось отозвать КП');
                toast('КП отозвано');
                await loadOffers();
            }catch(error){ toast(error.message,'error'); }
        }
    });

    loadData();
});