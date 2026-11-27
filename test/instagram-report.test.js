'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {classify,matcher,previous} = require('../server/instagram-report');

test('SKU and brand recognition, Kazakhstan day boundary and repeated days', () => {
    const product = {sku:'8EH34-721',pattern:matcher('8EH34-721')};
    const brand = {name:'RIMI',pattern:matcher('RIMI')};
    const post = {id:'1',caption:'#8eh34‑721 Rimi',timestamp:'2026-11-05T19:00:00Z',likeCount:3,commentsCount:0};
    const rows = classify([post,{...post,id:'2',timestamp:'2026-11-06T08:00:00Z'}],[product],[brand]);
    assert.deepEqual(rows[0].brands,['RIMI']);
    assert.deepEqual(rows[0].skus,['8EH34-721']);
    assert.deepEqual([...new Set(rows.map(p=>p.day))],['2026-11-06']);
    assert.equal(rows[0].interactions,3);
    const [other]=classify([{...post,caption:'8EH34-7212 Primissima',likeCount:null}],[product],[brand]);
    assert.equal(other.ideal,false);
    assert.deepEqual(other.brands,[]);
    assert.equal(other.interactions,null);
});
test('previous reference month crosses year boundary',()=>assert.equal(previous('2026-01'),'2025-12'));

test('separate account credits for the same local day, including legacy and duplicate handles', () => {
    const {handles,credits} = require('../public/instagram-accounts');
    assert.deepEqual(handles({instagram:'@FIRST'}),['first']);
    assert.deepEqual(handles({instagram:'@FIRST', instagram_extra:['instagram.com/first/','https://www.instagram.com/second/?ref=test']}), ['first','second']);
    const posts = ['first','first','second','second'].map((username,index)=>({
        id:String(index), username,textMatch:true,timestamp:index===3?'2026-11-06T19:00:00Z':'2026-11-06T12:00:00Z'
    }));
    const rows=classify(posts,[],[]);
    assert.equal(credits(rows.slice(0,2)),1);
    assert.equal(credits(rows.slice(0,3)),2);
    assert.equal(credits(rows),3);
});

test('different names and exact accounts identify distinct competitors once per post', () => {
    const {competitorDirectory} = require('../server/instagram-report');
    const brands = competitorDirectory([
        {name:'RIMI',instagram:'instagram.com/floors.kz/'}, {name:' rimi ',instagram:'@rimi_official'},
        {name:'EBM'}, {name:''}
    ]);
    const captions = ['Rimi, RIMI, @floors.kz, #EBM.', '@floors.kz_shop @ebm_extra', '@rimi_official.', '@ebm'];
    const posts = captions.map(caption=>({caption,timestamp:'2026-11-06T12:00:00Z'}));
    assert.deepEqual(classify(posts,[],brands).map(p=>p.brands),[['RIMI','EBM'],[],['RIMI'],['EBM']]);
});

test('matches product codes and unambiguous named decors next to the brand', () => {
    const {productDirectory} = require('../server/instagram-report');
    const products = productDirectory([
        {name:'Дуб Медовый',sku:'OPT-2'}, {name:'Дуб Лайт',sku:'OPT-20'},
        {name:'Дуб Лайт',sku:'MAP-8'}, {name:'Дуб Миндаль',sku:'EH-711'},
        {name:'Миндаль',sku:'OTHER-3'}, {name:'Без артикула',sku:'  '}
    ]);
    const captions = ['#OPT‑ 20 и OPT-20. OPT-200', 'IDEAL FLOOR — «Дуб Медовый».',
        'Дуб Миндаль от @idealfloor.kz', 'IDEAL FLOOR — Дуб Лайт.', 'Дуб Медовый, RIMI. IDEAL FLOOR тоже есть.',
        'IDEAL FLOOR — Дуб Медовый светлый.', 'IDEAL FLOOR: Дуб Медовый, OPT-2', '@test_opt-2 OPT-2-A'];
    const rows = classify(captions.map(caption=>({caption,textMatch:true,timestamp:'2026-11-12T10:00:00Z'})),products,[]);
    assert.deepEqual(rows.map(p=>p.skus),[['OPT-20'],['OPT-2'],['EH-711'],[],[],[],['OPT-2'],[]]);
    assert.deepEqual(rows.map(p=>p.namedSkus),[[],['OPT-2'],['EH-711'],[],[],[],[],[]]);
});
