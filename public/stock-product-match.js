'use strict';

function createStockProductMatcher(products) {
    const letters = {а:'a',в:'b',е:'e',к:'k',м:'m',н:'h',о:'o',р:'p',с:'c',т:'t',х:'x'};
    const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase()
        .replace(/[‐‑‒–—−]/g,'-').replace(/\s*-\s*/g,'-').trim();
    const skuKey = value => normalize(value).replace(/[авекмнорстх]/g, c => letters[c]);
    const nameKey = value => normalize(value).replace(/ё/g,'е').replace(/\s+/g,' ');
    const bySku = new Map(), byName = new Map();
    function add(map,key,product) {
        if (key) map.set(key, map.has(key) && map.get(key)!==product ? null : product);
    }
    for (const product of products) {
        add(bySku,skuKey(product.sku),product);
        add(byName,nameKey(product.excel_alias),product);
        add(byName,nameKey(product.name),product);
    }
    return (sku,name) => {
        const candidates = new Set();
        const direct = skuKey(sku);
        if (bySku.has(direct)) candidates.add(bySku.get(direct));
        else {
            const tokens = skuKey([sku,name].join(' ')).match(/[\p{L}\p{N}]+(?:[-_.\/][\p{L}\p{N}]+)*/gu) || [];
            for (const token of tokens) if (bySku.has(token)) candidates.add(bySku.get(token));
        }
        if (!candidates.size && byName.has(nameKey(name))) candidates.add(byName.get(nameKey(name)));
        if (candidates.size > 1 || candidates.has(null)) throw new Error('Неоднозначный артикул в строке: '+String(name||sku).slice(0,100));
        return candidates.values().next().value;
    };
}
if (typeof module !== 'undefined' && module.exports) module.exports = {createStockProductMatcher};
