'use strict';

// One source of truth for hiding products outside the Matrix archive.
// Old Mongo documents have no is_archived field and remain active.
const ACTIVE_PRODUCT_MATCH = Object.freeze({ is_archived: { $ne: true } });
const ARCHIVED_PRODUCT_MATCH = Object.freeze({ is_archived: true });

function activeProductFilter(extra = {}) {
    return { ...extra, is_archived: { $ne: true } };
}

function skuKey(value) {
    return String(value || '').trim().toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, '');
}

function archiveIndex(products = []) {
    const ids = new Set();
    const skus = new Set();
    for (const item of products) {
        if (!item) continue;
        const id = String(item._id || item.id || '').trim();
        const sku = skuKey(item.sku);
        if (id) ids.add(id);
        if (sku) skus.add(sku);
    }
    return { ids, skus };
}

function rowReferencesArchivedProduct(row, archive) {
    if (!row || typeof row !== 'object') return false;
    const rawId = row.productId || row.product || null; // row._id belongs to the price-list subdocument, not Product
    const id = rawId ? String(rawId?._id || rawId?.id || rawId) : '';
    if (id && archive.ids.has(id)) return true;
    if (id) return false; // An active item with a reused SKU must stay visible.
    const sku = skuKey(row.sku);
    return !!sku && archive.skus.has(sku);
}

function visibleRows(rows, archive) {
    if (!Array.isArray(rows)) return [];
    return rows.filter(row => !rowReferencesArchivedProduct(row, archive));
}

function visibleSnapshot(snapshot = {}, archive) {
    return {
        ...snapshot,
        ...(Array.isArray(snapshot.rows) ? { rows: visibleRows(snapshot.rows, archive) } : {}),
        ...(Array.isArray(snapshot.items) ? { items: visibleRows(snapshot.items, archive) } : {})
    };
}

module.exports = {
    ACTIVE_PRODUCT_MATCH,
    ARCHIVED_PRODUCT_MATCH,
    activeProductFilter,
    skuKey,
    archiveIndex,
    rowReferencesArchivedProduct,
    visibleRows,
    visibleSnapshot
};
