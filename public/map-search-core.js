/* IDEAL FLOOR CRM · dealer search, shared between map and tests. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CRMMapSearch = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const kazakhLetters = { 'ә':'а','ғ':'г','қ':'к','ң':'н','ө':'о','ұ':'у','ү':'у','һ':'х','і':'и','ё':'е' };
    const alias = {
        'нур султан':'астана', 'нурсултан':'астана', 'nur sultan':'астана',
        'astana':'астана','almaty':'алматы','shymkent':'шымкент','karaganda':'караганда',
        'aktobe':'актобе','atyrau':'атырау','aktau':'актау','kostanay':'костанай',
        'uralsk':'уральск','petropavlovsk':'петропавловск'
    };
    function normalize(text) {
        let value = String(text == null ? '' : text).toLowerCase().trim().replace(/[әғқңөұүһіё]/g, c => kazakhLetters[c] || c);
        value = value.replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
        for (const [from, to] of Object.entries(alias)) {
            if (value === from) return to;
            if (value.includes(from)) value = value.split(from).join(to);
        }
        return value.replace(/\s+/g,' ').trim();
    }
    function hasCoordinates(dealer) {
        const rawLat = dealer && dealer.latitude;
        const rawLng = dealer && dealer.longitude;
        if (rawLat == null || rawLng == null || String(rawLat).trim() === '' || String(rawLng).trim() === '') return false;
        const lat = Number(rawLat), lng = Number(rawLng);
        return Number.isFinite(lat) && Number.isFinite(lng) &&
            Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && lat !== 0 && lng !== 0;
    }
    function tokens(value) { return normalize(value).split(' ').filter(Boolean); }
    function oneEditAway(left, right) {
        if (Math.abs(left.length-right.length) > 1) return false;
        let i=0,j=0, edits=0;
        while (i<left.length && j<right.length) {
            if (left[i]===right[j]) {i++;j++;continue;}
            if (++edits>1) return false;
            if (left.length>right.length) i++;
            else if (left.length<right.length) j++;
            else {i++;j++;}
        }
        return edits+(left.length-i)+(right.length-j)<=1;
    }
    function tokenScore(token, field) {
        if (!field) return 0;
        if (field===token) return 20;
        if (field.startsWith(token)) return 15;
        if (field.includes(' '+token)) return 12;
        if (field.includes(token)) return 9;
        if (token.length>=5 && field.split(' ').some(part=>part.length>=5 && oneEditAway(part,token))) return 5;
        return 0;
    }
    function scoreDealer(dealer, query) {
        const qs=tokens(query);
        if (!qs.length) return 1;
        const contacts=Array.isArray(dealer?.contacts)?dealer.contacts:[];
        const fields=[
            [normalize(dealer?.dealer_id),5],
            [normalize(dealer?.name),4],
            [normalize(dealer?.city),3],
            [normalize(dealer?.address),3],
            [normalize(dealer?.region_sector),2],
            [normalize(dealer?.responsible),1]
        ];
        contacts.forEach(contact => {
            fields.push([normalize(contact?.name),2],[normalize(contact?.position),1],[normalize(contact?.contactInfo),2]);
        });
        let total=0;
        for (const q of qs) {
            let best=0;
            for (const [field,weight] of fields) best=Math.max(best,tokenScore(q,field)*weight);
            if (!best) return 0;
            total+=best;
        }
        const whole=normalize(query);
        if (fields[0][0]===whole) total+=130;
        if (fields[1][0]===whole) total+=100;
        if (fields[1][0].startsWith(whole)) total+=40;
        if (fields[3][0].includes(whole)) total+=22;
        if (fields[2][0]===whole) total+=25;
        return total;
    }
    function rankDealers(dealers, query) {
        return (Array.isArray(dealers)?dealers:[])
            .map(dealer => ({dealer,score:scoreDealer(dealer,query)}))
            .filter(item => item.score>0)
            .sort((a,b)=>b.score-a.score ||
                Number(hasCoordinates(b.dealer))-Number(hasCoordinates(a.dealer)) ||
                String(a.dealer.name||'').localeCompare(String(b.dealer.name||''),'ru'))
            .map(item=>item.dealer);
    }
    return {normalize,tokens,hasCoordinates,scoreDealer,rankDealers};
});
