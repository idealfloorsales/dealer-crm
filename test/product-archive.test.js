'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {activeProductFilter,archiveIndex,rowReferencesArchivedProduct,visibleRows,visibleSnapshot}=require('../server/product-archive');

test('normal products include legacy documents without is_archived',()=>{
 assert.deepEqual(activeProductFilter({product_type:'laminate'}),{product_type:'laminate',is_archived:{$ne:true}});
});
test('archived product is hidden by id and by sku in an older price-list row',()=>{
 const hidden=archiveIndex([{_id:'p1',sku:'EH-711'}]);
 assert.equal(rowReferencesArchivedProduct({product:'p1',sku:'EH-711'},hidden),true);
 assert.equal(rowReferencesArchivedProduct({_id:'subdocument',sku:'EH-711'},hidden),true);
 assert.equal(rowReferencesArchivedProduct({sku:'EH-711'},hidden),true);
 assert.equal(rowReferencesArchivedProduct({productId:'p2',sku:'EH-711'},hidden),false);
 assert.equal(rowReferencesArchivedProduct({scopeType:'collection',collection:'ENGLAND'},hidden),false);
 assert.equal(rowReferencesArchivedProduct({sku:'RWZ833-05'},hidden),false);
});
test('archived rows are excluded from public offers without mutating their stored snapshot',()=>{
 const hidden=archiveIndex([{_id:'p1',sku:'EH-711'}]);
 const stored={rows:[{productId:'p1',sku:'EH-711'},{sku:'ACTIVE'}],items:[{productId:'p1',sku:'EH-711'},{productId:'p2',sku:'ACTIVE'}]};
 const publicView=visibleSnapshot(stored,hidden);
 assert.equal(publicView.rows.length,1);
 assert.equal(publicView.items.length,1);
 assert.equal(stored.rows.length,2);
 assert.equal(stored.items.length,2);
});
test('editing active price rows can preserve archived pricing for future restoration',()=>{
 const hidden=archiveIndex([{_id:'p1',sku:'EH-711'}]);
 const oldRows=[{scopeType:'product',product:'p1',sku:'EH-711',opt:1000},{scopeType:'collection',collection:'RWN',opt:1200}];
 const submitted=[{scopeType:'collection',collection:'RWN',opt:1300}];
 const oldArchive=oldRows.filter(row=>rowReferencesArchivedProduct(row,hidden));
 const merged=[...visibleRows(submitted,hidden),...oldArchive];
 assert.equal(merged.length,2);
 assert.equal(merged.find(row=>row.sku==='EH-711').opt,1000);
});
