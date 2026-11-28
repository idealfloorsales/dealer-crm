'use strict';
document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('home-instagram');
    if (!panel) return;
    const el = key => document.getElementById('ig-' + key);
    const requested = new URLSearchParams(location.search).get('dealer');
    const dealerFields = ['sector','city','manager'];
    const filters = [...dealerFields,'dealer','collection','decor','competitor'];
    const managerNames = new Map([['regional_astana','Астана'],['regional_regions','Регионы'],['office','Офис']]);
    const order = new Intl.Collator('ru',{numeric:true});
    const plurals = new Intl.PluralRules('ru');
    const words = {
        posts:{one:'пост',few:'поста',many:'постов'},
        brands:{one:'бренд',few:'бренда',many:'брендов'}
    };
    const count = (n,unit) => n + ' ' + words[unit][plurals.select(n)];
    const fmt = n => Number(n).toLocaleString('ru-RU',{maximumFractionDigits:3});
    const shortDate = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'});
    const checkedDate = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'});
    const monthFormat = new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',timeZone:'Asia/Almaty'});
    const date = iso => shortDate.format(new Date(iso+'T12:00:00Z'));
    const newest = (a,b) => b.day.localeCompare(a.day);
    el('month').value = monthFormat.format(new Date());
    let data, version = 0, refreshTimer, refreshedAt = 0;

    function elem(tag,text,cls) {
        const node = document.createElement(tag);
        if (text != null) node.textContent = text;
        if (cls) node.className = cls;
        return node;
    }
    function icon(name) {
        const node = elem('i',null,'bi bi-'+name);
        node.setAttribute('aria-hidden','true');
        return node;
    }
    function addFilter(key,title) {
        const label = elem('label',title);
        const select = elem('select',null,'form-select');
        select.id = 'ig-'+key;
        label.append(select);
        panel.querySelector('.ig-filter-grid').append(label);
    }
    addFilter('decor','Декор IDEAL FLOOR');
    addFilter('competitor','Упомянутый конкурент');

    function groupPosts(posts,getTags) {
        const groups = new Map();
        for (const post of posts) for (const tag of new Set(getTags(post))) {
            if (!groups.has(tag)) groups.set(tag,[]);
            groups.get(tag).push(post);
        }
        return groups;
    }
    function activity(row,catalog,bySku,filtered) {
        const inScope = sku=>!filtered || bySku.has(sku);
        const posts = row.posts.filter(p=>p.day.startsWith(data.month)).sort(newest);
        const earlier = row.posts.filter(p=>!p.day.startsWith(data.month)).sort(newest);
        const own = posts.filter(p=>p.ideal && (!filtered || p.skus.some(inScope)));
        const productPosts = groupPosts(own,p=>p.skus.filter(inScope));
        const displayed = new Set(row.displayed);
        const samples = catalog.filter(p=>!p.archived && displayed.has(p.id));
        const silent = samples.filter(p=>!productPosts.has(p.sku)).sort((a,b)=>order.compare(a.sku,b.sku));
        const rivals = posts.filter(p=>p.brands.length);
        const oldRivals = earlier.filter(p=>p.brands.length);
        const known = row.coverage ? row.coverage.total>0 && row.coverage.checked===row.coverage.total :
            posts.length>0 || (row.hasMonthCheck ?? (row.checked && monthFormat.format(new Date(row.checked))===data.month));
        return {posts,earlier,own,productPosts,bySku,samples,silent,rivals,oldRivals,known,
            brands:groupPosts(rivals,p=>p.brands),previousBrands:groupPosts(oldRivals,p=>p.brands),
            credits:InstagramAccounts.credits(posts),daily:row.daily.filter(p=>inScope(p.sku))};
    }
    function include(s,filtered) {
        if (filtered && !s.samples.length && !s.own.length && !s.daily.length) return false;
        if (el('competitor').value && !s.brands.has(el('competitor').value)) return false;
        switch (el('focus').value) {
            case 'silent': return s.known && s.silent.length>0;
            case 'near': return s.known && s.credits===7;
            case 'rising': return s.earlier.length && s.posts.length && s.rivals.length/s.posts.length > s.oldRivals.length/s.earlier.length;
            default: return true;
        }
    }
    function metric(label,value,unit,note,cls) {
        const cell = elem('span',null,'ig-metric '+cls);
        cell.append(elem('small',label,'ig-mobile-label'));
        const number = elem('span',null,'ig-number');
        number.append(elem('strong',value ?? '—'));
        if (unit && value!=null) number.append(' '+unit);
        if (value>0) cell.classList.add('has-activity');
        cell.append(number);
        if (note) cell.append(elem('small',note,'ig-sub'));
        return cell;
    }
    function summary(row,s) {
        const node = elem('summary',null,'ig-columns');
        const identity = elem('span',null,'ig-identity');
        const shop = icon('shop');
        shop.classList.add('ig-shop');
        const caption = elem('span',null,'ig-dealer-caption');
        const meta = elem('small');
        if (row.code) meta.append(elem('span',row.code,'ig-code'));
        meta.append([row.city,row.sector].filter(Boolean).join(' · '));
        caption.append(elem('strong',row.name),meta);
        identity.append(shop,caption);

        const metrics = elem('span',null,'ig-metrics');
        const pending = !row.username ? 'Нет профиля' : row.coverage?.pending ? 'Проверяется месяц' : 'История за месяц неполная';
        metrics.append(metric('IDEAL FLOOR',s.known || s.own.length ? s.own.length : null,words.posts[plurals.select(s.own.length)],
            s.known ? (s.own.length ? 'Последний · '+date(s.own[0].day) : '') : pending,'ig-own'));
        if (data.canMatrix) metrics.append(metric('Наши декоры',s.known || s.productPosts.size ? s.productPosts.size : null,'в постах',s.samples.length+' на витрине','ig-products'));
        if (data.canCompetitors) {
            const known = (s.known || s.brands.size>0) && data.hasCompetitorBrands;
            metrics.append(metric('Конкуренты',known ? s.brands.size : null,words.brands[plurals.select(s.brands.size)],
                known ? count(s.rivals.length,'posts') : '', 'ig-rivals'));
        }
        const progress = elem('span',null,'ig-progress');
        const credit = elem('strong',s.known || s.credits ? s.credits : '—');
        credit.append(elem('small',' / 8'));
        progress.title = 'Зачёты за месяц. У каждой страницы дилера засчитывается одна публикация IDEAL FLOOR за день.';
        progress.append(elem('small','Зачёты','ig-sr'),credit);
        if (s.known || s.credits) {
            const meter = elem('progress');
            meter.max = 8; meter.value = Math.min(8,s.credits); meter.setAttribute('aria-label','Зачёты из восьми');
            progress.append(meter);
            if (s.credits>=8) progress.classList.add('is-complete');
        }
        const arrow = icon('chevron-down');
        arrow.classList.add('ig-chevron');
        node.append(identity,metrics,progress,arrow);
        return node;
    }

    function source(post,detail) {
        const line = elem('div',null,'ig-entry');
        const time = elem('time',date(post.day));
        time.dateTime = post.day;
        const type = /\/reels?\//i.test(post.url) ? 'Reels' : 'Публикация';
        const title = [type,post.username && '@'+post.username].filter(Boolean).join(' · ');
        const link = elem(post.url ? 'a' : 'span',title);
        if (post.url) {
            link.href=post.url; link.target='_blank'; link.rel='noopener';
            link.append(' ',icon('box-arrow-up-right'));
        }
        line.append(time,link);
        if (detail) line.append(elem('small',detail));
        return line;
    }
    function disclosure(title,total,children,cls='ig-disclosure') {
        const d = elem('details',null,cls);
        const head = elem('summary');
        head.append(elem('span',title),elem('span',total,'ig-tally'),icon('chevron-down'));
        const content = elem('div',null,'ig-details-content');
        content.append(...children);
        d.append(head,content);
        return d;
    }
    function panelFor(title,symbol) {
        const block = elem('section',null,'ig-detail-panel');
        const h = elem('h3');
        h.append(icon(symbol),title);
        block.append(h);
        return block;
    }
    function ranking(block,groups,describe) {
        const entries = [...groups].sort(([a,pa],[b,pb])=>pb.length-pa.length || newest(pa[0],pb[0]) || order.compare(a,b));
        const rest = [];
        for (const [index,[key,posts]] of entries.entries()) {
            const {name,meta,evidence} = describe(key);
            const d = elem('details',null,'ig-mention');
            const h = elem('summary');
            const label = elem('span',null,'ig-item-label');
            label.append(elem('strong',name));
            if (meta) label.append(elem('small',meta));
            const stats = elem('span',null,'ig-item-stats');
            stats.append(elem('strong',count(posts.length,'posts')),elem('small',date(posts[0].day)));
            h.append(label,stats,icon('chevron-down'));
            d.append(h,...posts.map(p=>source(p,evidence?.(p))));
            if (index<3) block.append(d); else rest.push(d);
        }
        if (rest.length) block.append(disclosure('Показать остальные',rest.length,rest));
    }
    function productsPanel(s) {
        const block = panelFor('Декоры IDEAL FLOOR','layers');
        if (s.known && s.samples.length) {
            const p = elem('p','Декоры с витрины в постах · ');
            p.append(elem('strong',(s.samples.length-s.silent.length)+' из '+s.samples.length));
            block.append(p);
        }
        const onShelf = new Set(s.samples.map(p=>p.sku));
        ranking(block,s.productPosts,sku=>{
            const p=s.bySku.get(sku);
            return {name:p?.name || sku,meta:[sku,p?.collection,!onShelf.has(sku) && 'Нет отметки на витрине'].filter(Boolean).join(' · '),
                evidence:post=>post.namedSkus?.includes(sku) ? 'По названию и бренду' : 'По артикулу'};
        });
        if (s.silent.length) {
            const tiles=elem('ul',null,'ig-samples');
            for (const p of s.silent) {
                const li=elem('li');
                li.append(elem('strong',p.name || p.sku),elem('small',p.sku));
                tiles.append(li);
            }
            block.append(disclosure(s.known ? 'На витрине без упоминаний' : 'На витрине · упоминаний пока не найдено',s.silent.length,[tiles]));
        }
        const brandOnly = s.own.filter(p=>!p.skus.length);
        if (brandOnly.length) block.append(disclosure('О бренде без указания декора',brandOnly.length,brandOnly.map(p=>source(p))));
        if (!s.samples.length && !s.own.length) block.append(elem('p','Образцы не отмечены. Упоминаний декоров за месяц пока нет.'));
        return block;
    }
    function rivalsPanel(s) {
        const block = panelFor('Бренды конкурентов','people');
        if (!data.hasCompetitorBrands) {
            block.append(elem('p','Справочник конкурентов пуст.'));
            return block;
        }
        if (s.rivals.length) {
            const p=elem('p','Посты с упоминанием конкурентов · ');
            p.append(elem('strong',s.rivals.length+' из '+s.posts.length));
            block.append(p);
        } else block.append(elem('p',s.known ? 'В собранных подписях за месяц упоминаний нет.' : 'За этот месяц пока нет данных.'));
        ranking(block,s.brands,brand=>({name:brand,
            meta:s.earlier.length ? 'В прошлом месяце · '+count(s.previousBrands.get(brand)?.length || 0,'posts') : ''}));
        const previousOnly=new Map([...s.previousBrands].filter(([brand])=>!s.brands.has(brand)));
        if (previousOnly.size) {
            const items=document.createDocumentFragment();
            ranking(items,previousOnly,brand=>({name:brand}));
            block.append(disclosure('Упоминались только в прошлом месяце',previousOnly.size,[items]));
        }
        return block;
    }

    function scanInfo(row,s) {
        const wrap=elem('div',null,'ig-scan-info');
        const label=elem('small');
        label.setAttribute('role','status');
        const c=row.coverage;
        const info=c.pending ? 'Идёт проверка' : s.known ? 'Проверено '+checkedDate.format(new Date(c.asOf)) :
            'Период проверен у '+c.checked+' из '+c.total+' страниц';
        label.textContent='Получено за месяц · '+count(s.posts.length,'posts')+' · '+info;
        wrap.append(label);
        if (!c.total || el('month').value>monthFormat.format(new Date())) return wrap;
        const button=elem('button',c.pending ? 'Обновить результат' : 'Перепроверить месяц','ig-check');
        button.type='button';
        button.onclick=async ()=>{
            button.disabled=true;
            const month=data.month;
            try {
                if (!c.pending) {
                    const response=await fetch('/api/dealers/'+encodeURIComponent(row.id)+'/instagram-monitor/check-month',{
                        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({month})
                    });
                    if (!response.ok) throw Error((await response.json()).error || 'Не удалось запустить проверку');
                }
                if (el('month').value===month) await load(true);
            } catch (error) { label.textContent=error.message; }
            finally { button.disabled=false; }
        };
        wrap.append(button);
        return wrap;
    }

    function cardBody(row,s) {
        const body=elem('div',null,'ig-row-body');
        if (row.coverage?.total) body.append(scanInfo(row,s));
        const panels=elem('div',null,'ig-detail-grid');
        if (data.canMatrix) panels.append(productsPanel(s));
        if (data.canCompetitors) panels.append(rivalsPanel(s));
        if (panels.childElementCount) body.append(panels);

        if (!el('decor').value && !el('collection').value) {
            const other=s.posts.filter(post=>!post.ideal);
            if (other.length) body.append(disclosure('Без совпадения с IDEAL FLOOR',other.length,
                other.map(post=>source(post,post.brands.length ? post.brands.join(', ') : 'Бренд и декор не распознаны в подписи'))));
        }
        const engaged=s.own.filter(p=>p.interactions!=null).sort((a,b)=>b.interactions-a.interactions);
        if (engaged.length) body.append(disclosure('Отклик на наши посты',engaged.length,engaged.map(p=>{
            const peers=s.posts.filter(other=>other!==p && other.interactions!=null).map(other=>other.interactions).sort((a,b)=>a-b);
            const middle=Math.floor(peers.length/2);
            const median=peers.length%2 ? peers[middle] : (peers[middle-1]+peers[middle])/2;
            return source(p,'Реакции · '+fmt(p.interactions)+(peers.length ? ' · медиана остальных постов '+fmt(median) : ''));
        })));
        if (data.canSales && (row.sales!=null || s.daily.length)) {
            const sales=elem('div',null,'ig-sales');
            if (row.sales!=null) sales.append(elem('span','Продажи дилера · '+fmt(row.sales)+' м²'));
            if (s.daily.length) sales.append(elem('span','По артикулам · '+fmt(s.daily.reduce((total,x)=>total+x.sqm,0))+' м²'));
            body.append(sales);
        }
        const events=s.own.map(p=>({day:p.day,node:source(p,p.skus.join(', ') || 'IDEAL FLOOR')}));
        for (const sale of s.daily) events.push({day:sale.day,node:elem('div',date(sale.day)+' · '+sale.sku+' · '+fmt(sale.sqm)+' м²','ig-entry')});
        if (events.length) body.append(disclosure(data.canSales ? 'Публикации и продажи по датам' : 'Публикации по датам',events.length,events.sort(newest).map(e=>e.node)));
        const footer=elem('div',null,'ig-footer');
        const checked=row.checked ? 'Проверено '+checkedDate.format(new Date(row.checked)) :
            row.checkedProfiles ? 'Проверено страниц '+row.checkedProfiles+' из '+row.usernames.length : row.username ? 'Ожидает проверки' : 'Профиль не указан';
        footer.append(elem('small',[managerNames.get(row.manager) || row.manager,checked].filter(Boolean).join(' · ')));
        const link=elem('a','Карточка дилера');
        link.href='/dealer.html?id='+encodeURIComponent(row.id);
        link.append(' ',icon('arrow-up-right'));
        footer.append(link);
        body.append(footer);
        return body;
    }

    function render() {
        const collection=el('collection').value, sku=el('decor').value;
        const filtered=Boolean(collection || sku);
        const catalog=data.catalog.filter(p=>(!collection || p.collection===collection) && (!sku || p.sku===sku));
        const bySku=new Map(catalog.map(p=>[p.sku,p]));
        const fragment=document.createDocumentFragment();
        for (const row of data.rows) {
            if (dealerFields.some(key=>el(key).value && el(key).value!==row[key]) || (el('dealer').value && el('dealer').value!==row.id)) continue;
            const s=activity(row,catalog,bySku,filtered);
            if (!include(s,filtered)) continue;
            const card=elem('details',null,'ig-row');
            card.dataset.dealerId=row.id;
            card.append(summary(row,s));
            card.addEventListener('toggle',()=>{
                if (card.open && card.childElementCount===1) card.append(cardBody(row,s));
            });
            fragment.append(card);
        }
        const n=fragment.childElementCount;
        el('results').replaceChildren(fragment);
        el('count').textContent=n;
        el('status').hidden=Boolean(n);
        el('status').textContent=n ? '' : 'По выбранным фильтрам дилеров нет.';
        const active=[...dealerFields,'collection','decor','competitor'].filter(key=>el(key).value).length;
        el('filter-count').textContent=active ? '('+active+')' : '';
    }
    function setOptions(key,entries,selected=el(key).value) {
        const select=el(key);
        select.replaceChildren(new Option('Все',''),...entries.map(([value,label])=>new Option(label,value)));
        select.value=entries.some(([value])=>value===selected) ? selected : '';
    }
    function setDecors() {
        const collection=el('collection').value;
        const options=new Map(data.catalog.filter(p=>p.sku && (!collection || p.collection===collection)).map(p=>[p.sku,[p.sku,p.name].filter(Boolean).join(' · ')]));
        setOptions('decor',[...options].sort(([a],[b])=>order.compare(a,b)));
    }
    function bindFilters(initial) {
        const distinct=values=>[...new Set(values.filter(Boolean))].sort(order.compare);
        for (const f of dealerFields) setOptions(f,distinct(data.rows.map(r=>r[f])).map(v=>[v,f==='manager' ? managerNames.get(v) || v : v]));
        setOptions('dealer',data.rows.map(r=>[r.id,r.name]),initial && requested ? requested : el('dealer').value);
        setOptions('collection',distinct(data.catalog.map(p=>p.collection)).map(v=>[v,v]));
        setDecors();
        const brands=data.rows.flatMap(row=>row.posts.filter(p=>p.day.startsWith(data.month)).flatMap(p=>p.brands));
        setOptions('competitor',distinct(brands).map(v=>[v,v]));
        el('decor').parentElement.hidden=el('collection').parentElement.hidden=!data.canMatrix;
        el('competitor').parentElement.hidden=!data.canCompetitors;
        const silent=el('focus').querySelector('[value="silent"]');
        silent.textContent='Есть декоры на витрине без упоминаний';
        silent.hidden=!data.canMatrix;
        el('focus').querySelector('[value="rising"]').hidden=!data.canCompetitors;
        if (el('focus').selectedOptions[0]?.hidden) el('focus').value='';
        const columns=['Дилер','IDEAL FLOOR'];
        if (data.canMatrix) columns.push('Наши декоры');
        if (data.canCompetitors) columns.push('Конкуренты');
        panel.style.setProperty('--ig-metrics',String(columns.length-1));
        const head=panel.querySelector('.ig-column-head');
        head.replaceChildren(...[...columns,'Зачёты',''].map(t=>elem('span',t)));
        head.hidden=false;
    }
    function scheduleRefresh() {
        clearTimeout(refreshTimer);
        if (!panel.hidden && !document.hidden && data?.rows.some(row=>row.coverage?.pending)) {
            refreshTimer=setTimeout(()=>load(true),45000);
        }
    }
    async function load(quiet=false) {
        quiet=quiet===true && data?.month===el('month').value;
        clearTimeout(refreshTimer);
        const openRows=quiet ? new Set([...panel.querySelectorAll('.ig-row[open]')].map(n=>n.dataset.dealerId)) : new Set();
        const run=++version, initial=!data;
        const month=el('month').value;
        if (!quiet) {
            el('status').hidden=false;
            el('retry').hidden=true;
            el('count').textContent='—';
            el('status').textContent='Загружаем отчёт…';
            el('results').replaceChildren();
            panel.querySelector('.ig-column-head').hidden=true;
            el('import-box').hidden=true;
        }
        try {
            const response=await fetch('/api/instagram/report?month='+encodeURIComponent(month));
            const payload=await response.json();
            if (run!==version) return;
            if (!response.ok) throw Error(payload.error);
            data=payload;
            bindFilters(initial);
            el('import-box').hidden=!data.canImport;
            refreshedAt=Date.now();
            render();
            for (const n of panel.querySelectorAll('.ig-row')) if (openRows.has(n.dataset.dealerId)) n.open=true;
        } catch(e) {
            if(run===version) {
                if (!quiet) data=null;
                el('retry').hidden=false;el('status').hidden=false;el('status').textContent=e.message || 'Ошибка загрузки';
            }
        } finally { if (run===version) scheduleRefresh(); }
    }
    document.addEventListener('visibilitychange',scheduleRefresh);
    el('month').onchange=load;
    el('focus').onchange=()=>data && data.month===el('month').value && render();
    for (const f of filters) el(f).onchange=()=>{
        if (!data || data.month!==el('month').value) return;
        if (f==='collection') setDecors();
        render();
    };
    el('import').onclick=async()=>{
        const file=el('file').files[0];
        if(!file) {el('import-status').textContent='Выберите CSV';return;}
        el('import').disabled=true;
        try {
            const lines=(await file.text()).replace(/^\uFEFF/,'').trim().split(/\r?\n/);
            if(lines.shift()?.trim()!=='Дата;Дилер;Артикул;м²') throw Error('Проверьте заголовок по примеру');
            const rows=lines.filter(l=>l.trim()).map(l=>l.split(';').map(s=>s.trim()));
            const response=await fetch('/api/instagram/report/daily-sales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows})});
            const result=await response.json();
            if(!response.ok) throw Error(result.error);
            el('import-status').textContent='Сохранено строк: '+result.count;
            await load();
        } catch(e) {el('import-status').textContent=e.message;}
        finally {el('import').disabled=false;}
    };
    el('retry').onclick=load;
    const toggle=el('toggle');
    let started=false;
    function showReport(scroll) {
        const open=location.hash==='#instagram';
        panel.hidden=!open;
        toggle.setAttribute('aria-expanded',String(open));
        if(open && !started) {
            started=true;
            Promise.resolve(window.CRMAuth?.ready).then(load);
        }
        else if (open && data && Date.now()-refreshedAt>60000) load(true);
        else scheduleRefresh();
        if(open && scroll) toggle.scrollIntoView({block:'center'});
    }
    toggle.onclick=()=>{
        const url=new URL(location.href);
        url.hash=panel.hidden?'instagram':'';
        history.pushState(null,'',url);
        showReport(false);
    };
    window.addEventListener('hashchange',()=>showReport(true));
    window.addEventListener('popstate',()=>showReport(true));
    showReport(true);
});
