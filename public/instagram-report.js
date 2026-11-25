'use strict';
document.addEventListener('DOMContentLoaded', async () => {
    await window.CRMAuth?.ready;
    const el = id => document.getElementById(id);
    const requested = new URLSearchParams(location.search).get('dealer');
    const filters = ['sector','city','manager','dealer','collection'];
    const fmt = n => Number(n).toLocaleString('ru-RU',{maximumFractionDigits:3});
    el('month').value = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit'}).format(new Date());
    let data, version = 0;
    function elem(tag,text,cls) {
        const node = document.createElement(tag);
        if (text != null) node.textContent = text;
        if (cls) node.className = cls;
        return node;
    }
    function link(post) {
        const a = elem(post.url ? 'a':'span',post.day);
        if (post.url) { a.href=post.url; a.target='_blank'; a.rel='noopener'; }
        return a;
    }
    function group(box,title,items) {
        const details = elem('details',null,'mb-2');
        details.append(elem('summary',title));
        for (const item of items) details.append(item);
        box.append(details);
    }
    function line(post,label) {
        const item = elem('div',null,'py-1');
        item.append(link(post), ' · '+label);
        return item;
    }
    function render() {
        const target = el('results');
        target.replaceChildren();
        const collection = el('collection').value;
        const catalog = data.catalog.filter(p => !collection || p.collection === collection);
        const skus = new Set(catalog.map(p=>p.sku));
        const labels = new Map(catalog.map(p=>[p.sku,[p.sku,p.name].filter(Boolean).join(' · ')]));
        const matches = p => !collection || p.skus.some(s=>skus.has(s));
        let count = 0;
        for (const row of data.rows) {
            if (['sector','city','manager'].some(f => el(f).value && el(f).value !== row[f]) ||
                (el('dealer').value && el('dealer').value !== row.id)) continue;
            const visible = catalog.filter(p=>!p.archived && row.displayed.includes(p.id));
            const posts = row.posts.filter(p=>p.day.startsWith(data.month)).sort((a,b)=>b.day.localeCompare(a.day));
            const own = posts.filter(p=>p.ideal && matches(p));
            const daily = row.daily.filter(s=>!collection || skus.has(s.sku));
            if (collection && !visible.length && !own.length && !daily.length) continue;
            const rivals=posts.filter(p=>p.brands.length);
            const earlier=row.posts.filter(p=>!p.day.startsWith(data.month));
            const oldRivals=earlier.filter(p=>p.brands.length);
            const days=new Set(posts.filter(p=>p.ideal).map(p=>p.day));
            const focus=el('focus').value;
            const exhibited=new Set(visible.map(p=>p.sku));
            if (focus==='silent' && (!row.checked || !exhibited.size || own.some(p=>p.skus.some(s=>exhibited.has(s))))) continue;
            if (focus==='near' && days.size!==7) continue;
            if (focus==='rising' && !(earlier.length && posts.length && rivals.length/posts.length>oldRivals.length/earlier.length)) continue;
            count++;
            const box = elem('article',null,'border-bottom py-3');
            const a = elem('a',row.name);
            a.href='/dealer.html?id='+encodeURIComponent(row.id);
            const heading=elem('h2',null,'h5'); heading.append(a); box.append(heading);
            box.append(elem('p',[row.sector,row.city,row.manager].filter(Boolean).join(' · '),'mb-1'));
            box.append(elem('p','Instagram: '+days.size+' из 8 дней · '+(row.checked?'проверено '+new Date(row.checked).toLocaleString('ru-RU',{timeZone:'Asia/Almaty'}):row.username?'ожидает проверки':'профиль не указан'),'small'));
            if (own.length) box.append(line(own[0],'Последняя найденная публикация за месяц'));
            const promoted = new Set(own.flatMap(p=>p.skus).filter(s=>skus.has(s)));
            group(box,'Выставлено: '+visible.length+' · Артикулов в публикациях: '+promoted.size,[
                elem('p','На витрине: '+(visible.map(p=>labels.get(p.sku)).join(', ')||'—')),
                elem('p','В публикациях: '+([...promoted].map(s=>labels.get(s)).join(', ')||'—'))
            ]);
            if (rivals.length || oldRivals.length) group(box,'Конкуренты у дилера · '+rivals.length+' из '+posts.length+' постов (прошлый месяц: '+oldRivals.length+' из '+earlier.length+')',
                rivals.map(p=>line(p,p.brands.join(', '))));
            const ranked=own.filter(p=>p.interactions!=null).sort((a,b)=>b.interactions-a.interactions);
            group(box,'Отклик на публикации · '+ranked.length,ranked.map(p=>{
                const others=posts.filter(x=>x.id!==p.id && x.interactions!=null).map(x=>x.interactions).sort((a,b)=>a-b);
                const middle=Math.floor(others.length/2);
                const median=others.length%2?others[middle]:(others[middle-1]+others[middle])/2;
                return line(p,fmt(p.interactions)+' реакций'+(others.length?' · обычно '+fmt(median)+' (медиана остальных постов дилера)':' · пока нет базы сравнения'));
            }));
            const timeline=own.map(p=>({day:p.day,node:line(p,'Публикация · '+(p.skus.join(', ')||'IDEAL FLOOR'))}));
            for (const s of daily) timeline.push({day:s.day,node:elem('div',s.day+' · '+s.sku+' · '+fmt(s.sqm)+' м²')});
            if (data.canSales) box.append(elem('p','Продажи дилера за месяц: '+(row.sales==null?'нет данных':fmt(row.sales)+' м²')+
                ' · По '+(collection?'коллекции':'артикулам')+' в детализации: '+(daily.length?fmt(daily.reduce((a,s)=>a+s.sqm,0))+' м²':'нет данных'),'mb-2'));
            group(box,'Даты публикаций и продаж',timeline.sort((a,b)=>b.day.localeCompare(a.day)).map(t=>t.node));
            target.append(box);
        }
        el('status').textContent='Дилеров в выборке: '+count+'. Учтены публикации, доступные при проверках. Даты по времени Казахстана.';
    }
    async function load() {
        const run=++version;
        el('status').textContent='Загрузка…';
        el('results').replaceChildren();
        try {
            const response=await fetch('/api/instagram/report?month='+encodeURIComponent(el('month').value));
            const payload=await response.json();
            if (run!==version) return;
            if (!response.ok) throw Error(payload.error);
            const initial=!data;
            data=payload;
            for(const f of filters) {
                const select=el(f);
                const old=initial && f==='dealer'?requested:select.value;
                const choices=f==='dealer'?data.rows.map(r=>[r.id,r.name]):
                    [...new Set((f==='collection'?data.catalog:data.rows).map(r=>r[f]).filter(Boolean))].sort().map(v=>[v,v]);
                select.replaceChildren(new Option('Все',''),...choices.map(([v,t])=>new Option(t,v)));
                select.value=old||'';
            }
            el('import-box').hidden=!data.canImport;
            render();
        } catch(e) { if(run===version) {data=null;el('status').textContent=e.message||'Ошибка загрузки';} }
    }
    el('month').onchange=load;
    el('focus').onchange=()=>data && render();
    for(const f of filters) el(f).onchange=()=>data && render();
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
    await load();
});
