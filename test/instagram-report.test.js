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
