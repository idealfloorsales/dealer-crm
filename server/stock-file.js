// Matching and header rules mirror the existing manual stock import.
const normalizeExcelText = value => String(value ?? '').replace(/ё/g,'е').trim().toLowerCase().replace(/\s+/g,' ');
const normalizeExcelSku = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g,'');
function parseStockNumber(value) {
    const clean = String(value ?? '').replace(/\s+/g,'').replace(',','.');
    const number = Number(clean);
    return Number.isFinite(number) ? number : null;
}
function planStockImport(rows, allProducts) {
        let cSku = -1, cName = -1, cFreeStock = -1;
        let skuHeaderRow = -1, nameHeaderRow = -1, stockHeaderRow = -1;
        let freeStockHeaderLabel = '';
        const freeStockCandidates = [];

        // В выгрузках 1С заголовки могут быть на разных строках.
        // Общий «Остаток» намеренно игнорируем: в CRM загружается только «Свободный остаток».
        for(let i=0; i<Math.min(rows.length, 40); i++) {
            const row = Array.isArray(rows[i]) ? rows[i] : [];
            row.forEach((cell,j) => {
                const raw = String(cell ?? '').trim();
                const v = normalizeExcelText(cell).replace(/[^a-zа-я0-9]+/g,'');

                if (v === 'свободныйостаток' || v === 'свободно') {
                    freeStockCandidates.push({column:j,row:i,label:raw || 'Свободный остаток',score:3});
                } else if (v.includes('свободныйостаток') && !v.includes('общийостаток')) {
                    freeStockCandidates.push({column:j,row:i,label:raw || 'Свободный остаток',score:2});
                }

                if (cSku < 0 && (
                    v === 'артикул' ||
                    v === 'sku' ||
                    v === 'кодтовара' ||
                    v === 'кодноменклатуры' ||
                    v === 'номенклатураартикул'
                )) {
                    cSku = j;
                    skuHeaderRow = i;
                }

                if (cName < 0 && (
                    v === 'номенклатура' ||
                    v.includes('наименован') ||
                    v === 'товар'
                )) {
                    cName = j;
                    nameHeaderRow = i;
                }
            });
        }

        if (freeStockCandidates.length) {
            freeStockCandidates.sort((a,b) => b.score-a.score || a.row-b.row || a.column-b.column);
            const picked = freeStockCandidates[0];
            cFreeStock = picked.column;
            stockHeaderRow = picked.row;
            freeStockHeaderLabel = picked.label || 'Свободный остаток';
        }

        if (cFreeStock < 0) {
            throw new Error('В файле не найдена колонка «Свободный остаток». Общий «Остаток» CRM намеренно не использует.');
        }
        if (cSku < 0 && cName < 0) {
            throw new Error('Не найдена колонка с артикулом или наименованием товара.');
        }

        const hIdx = Math.max(stockHeaderRow, skuHeaderRow, nameHeaderRow);

        const bySku = new Map();
        const byAlias = new Map();
        const byName = new Map();

        allProducts.forEach(product => {
            const sku = normalizeExcelSku(product.sku);
            const alias = normalizeExcelText(product.excel_alias);
            const name = normalizeExcelText(product.name);
            if (sku && !bySku.has(sku)) bySku.set(sku, product);
            if (alias && !byAlias.has(alias)) byAlias.set(alias, product);
            if (name && !byName.has(name)) byName.set(name, product);
        });

        const quantities = new Map();

        for(let i=hIdx+1; i<rows.length; i++) {
            const row = Array.isArray(rows[i]) ? rows[i] : [];
            const skuRaw = cSku >= 0 ? String(row[cSku] || '').trim() : '';
            const nameRaw = cName >= 0 ? String(row[cName] || '').trim() : '';
            const stock = parseStockNumber(row[cFreeStock]);
            if (stock !== null && stock < 0) throw new Error("Отрицательный остаток в файле");

            if (stock === null || (!skuRaw && !nameRaw)) continue;

            const skuKey = normalizeExcelSku(skuRaw);
            const nameKey = normalizeExcelText(nameRaw);
            let product = skuKey ? bySku.get(skuKey) : null;
            if (!product && nameKey) product = byAlias.get(nameKey);
            if (!product && nameKey) product = byName.get(nameKey);

            // В типовой выгрузке артикул часто находится внутри длинного наименования.
            if (!product) {
                const sourceText = [skuRaw,nameRaw].filter(Boolean).join(' ').toLowerCase();
                product = allProducts.find(item => {
                    const sku = String(item.sku || '').trim().toLowerCase();
                    return sku.length > 3 && sourceText.includes(sku);
                }) || null;
            }

            if (!product) continue;
            quantities.set(String(product._id), stock);
        }
        if (!quantities.size) throw new Error('В файле не найдено ни одной позиции матрицы; остатки не изменены');
        const operations = allProducts.filter(p => Number(p.stock_qty) !== (quantities.get(String(p._id)) ?? 0)).map(p => ({
            updateOne: { filter:{_id:p._id}, update:{$set:{stock_qty:quantities.get(String(p._id)) ?? 0}} }
        }));
        return { operations, matched:quantities.size, source:freeStockHeaderLabel };
}
module.exports = { planStockImport };
