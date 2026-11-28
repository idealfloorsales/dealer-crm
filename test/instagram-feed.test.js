'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {scanPeriod,parsePage,fieldsFor,brandInCaption,offsetMonth,localMonth}=require('../server/instagram-feed');
const {classify,productDirectory}=require('../server/instagram-report');
const {credits}=require('../public/instagram-accounts');
const now=new Date('2026-11-26T12:00:00Z');
const item=(id,caption='',timestamp='2026-11-04T12:00:00Z')=>({id:String(id),caption,timestamp,permalink:'https://www.instagram.com/p/'+id+'/'});
const page=(items,after)=>({business_discovery:{username:'shop',media_count:200,media:{data:items,paging:{cursors:{after}}}}});
function fixture(read) {
    const history=new Map(), states=[];
    const params={username:'shop',month:'2026-11',now,read,archive:async posts=>{
        for (const post of posts) history.set(post.id,{...post,username:'shop'});
    },checkpoint:async state=>states.push({...state})};
    return {params,history,states};
}

test('reaches posts beyond the preview, including a promoted original; overlapping pages do not add a second credit',async()=>{
    const calls=[];
    const media=Array.from({length:65},(_,i)=>item(i+1,i===59 ? '#IDEAL_FLOOR_KZ' : ''));
    const {params,history,states}=fixture(async fields=>{
        calls.push(fields);
        return fields.includes('.after(cursorA)') ? page(media.slice(49,65)) : page(media.slice(0,50),'cursorA');
    });
    await scanPeriod({...params,pageBudget:1});
    assert.equal(states.at(-1).pending,true);
    assert.equal(states.at(-1).checkedAt,null);
    await scanPeriod({...params,saved:states.at(-1)});
    assert.equal(calls.length,2);
    assert.equal(history.size,65);
    const rows=classify([...history.values()],[],[]);
    assert.deepEqual(rows.filter(p=>p.ideal).map(p=>p.id),['60']);
    assert.equal(credits(rows),1);
    assert.deepEqual(states.at(-1).checkedAt,now);
});

test('an empty intermediate page, an old pinned post and month boundaries do not terminate a scan',async()=>{
    const data=[page([item(1,'','2025-01-01T00:00:00Z')],'one'),page([],'two'),
        page([item(2,'','2026-09-30T19:00:00Z'),item(3,'','2026-09-30T18:59:59Z'),item(4,'',now.toISOString())])];
    const {params,history,states}=fixture(async()=>data.shift());
    await scanPeriod(params);
    assert.deepEqual([...history.keys()],['2','4']);
    assert.equal(states.at(-1).pending,false);
    assert.equal(offsetMonth('2026-01',-1),'2025-12');
    assert.equal(localMonth(new Date('2026-09-30T19:00:00Z')),'2026-10');
});

test('falls back for unsupported nested dates and recovers an expired cursor without losing committed pages',async()=>{
    let fail=true;const {params,states,history}=fixture(async fields=>{
        if (fields.includes('.since(')) throw Object.assign(Error('unsupported range'),{metaCode:100});
        if (fields.includes('.after(A)') && fail) {
            fail=false;throw Object.assign(Error('expired cursor'),{metaCode:100});
        }
        return fields.includes('.after(A)') ? page([item(2)]) : page([item(1)],'A');
    });
    await scanPeriod(params);
    assert.equal(states.at(-1).pending,true);
    await scanPeriod({...params,saved:states.at(-1)});
    assert.equal(states.at(-1).pending,false);
    assert.deepEqual([...history.keys()],['1','2']);
});

test('an incomplete Meta response, a repeated cursor or a throttled page never certifies coverage',async()=>{
    assert.throws(()=>parsePage({business_discovery:{media_count:7}}));
    assert.throws(()=>parsePage({business_discovery:{media:{data:[],paging:{next:'opaque'}}}}));
    assert.throws(()=>fieldsFor('shop','bad)input',1,2));
    const a=fixture(async()=>page([item(1)],'repeat'));
    await assert.rejects(scanPeriod(a.params));
    assert.equal(a.history.size,1);
    assert.equal(a.states.at(-1).pending,true);
    assert.equal(a.states.at(-1).checkedAt,null);
    const b=fixture(async fields=>{
        if (fields.includes('.after(')) throw Object.assign(Error('rate limit'),{metaCode:4});
        return page([item(1)],'cursor');
    });
    await assert.rejects(scanPeriod(b.params),e=>e.metaCode===4);
    assert.equal(b.states.at(-1).after,'cursor');
    assert.equal(b.states.at(-1).pending,true);
    const c=fixture(async()=>page([item(2),{id:'undated'}]));
    await scanPeriod(c.params);
    assert.equal(c.history.size,1);
    assert.equal(c.states.at(-1).checkedAt,null);
    assert.equal(c.states.at(-1).skipped,1);
});

test('long captions, official account spellings and unambiguous dealer SKU variations give the same credits across roles',()=>{
    const caption='🏡'.repeat(1100)+' Акция от @ideafloor.kz';
    const parsed=parsePage(page([item(7,caption)])).posts[0];
    assert.equal(parsed.caption,caption);
    assert.equal(parsed.textMatch,true);
    assert.equal(brandInCaption('Акция на ламинат другого бренда'),false);
    const products=productDirectory([{name:'Дуб Миндаль',sku:'8EH34-711'}]);
    const posts=['8ЕН34 711','#8EH34_711','8EH34711','8EH34-7112','скидка'].map((c,i)=>({...item(i+1,c),username:'shop'}));
    const full=classify(posts,products,[]);
    const restricted=classify(posts,products,[],false);
    assert.deepEqual(full.map(p=>p.ideal),[true,true,true,false,false]);
    assert.deepEqual(full.map(p=>p.ideal),restricted.map(p=>p.ideal));
    assert.ok(restricted.every(p=>!p.skus.length && !p.namedSkus.length));
    assert.equal(credits(full),1);
    assert.equal(credits(restricted),1);
    const ambiguous=productDirectory([{sku:'ABC-123'},{sku:'AB-C123'}]);
    assert.deepEqual(classify([item(8,'ABC123')],ambiguous,[])[0].skus,[]);
});
