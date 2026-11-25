'use strict';

(function () {
    function handle(value) {
        let raw = String(value || '').trim();
        if (/^(?:www\.)?instagram\.com\//i.test(raw)) raw = 'https://' + raw;
        if (/^https?:\/\//i.test(raw)) {
            let url;
            try { url = new URL(raw); } catch { return ''; }
            if (!/^(?:www\.|m\.)?instagram\.com$/i.test(url.hostname)) return '';
            const parts = url.pathname.split('/').filter(Boolean);
            if (parts.length !== 1) return '';
            raw = parts[0];
        }
        raw = raw.replace(/^@/, '').toLowerCase();
        if (['reel','reels','stories','p','explore','accounts','direct'].includes(raw)) return '';
        return /^[a-z0-9._]{1,30}$/.test(raw) ? raw : '';
    }

    function handles(dealer) {
        return [...new Set([dealer.instagram, ...(dealer.instagram_extra || [])].map(handle).filter(Boolean))];
    }

    function credits(posts) {
        return new Set(posts.filter(p => p.ideal).map(p => p.username + '/' + p.day)).size;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {handle, handles, credits};
        return;
    }
    function addField(box, value) {
        const row = document.createElement('div');
        row.className = 'input-group mt-2';
        const input = document.createElement('input');
        input.className = 'form-control';
        input.placeholder = '@username';
        input.setAttribute('aria-label','Дополнительная страница Instagram');
        input.value = value;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-outline-secondary';
        remove.textContent = '×';
        remove.setAttribute('aria-label','Убрать страницу Instagram');
        remove.onclick = () => row.remove();
        row.append(input, remove);
        box.append(row);
        return input;
    }
    function fields(id) {
        const input = document.getElementById(id);
        let box = document.getElementById(id + '-extra');
        if (!box) {
            box = document.createElement('div');
            box.id = id + '-extra';
            const add = document.createElement('button');
            add.type = 'button';
            add.textContent = '+ Instagram';
            add.className = 'btn btn-sm btn-outline-secondary mt-2';
            add.onclick = () => addField(box,'').focus();
            input.after(box,add);
            input.form?.addEventListener('reset', () => box.replaceChildren());
        }
        return box;
    }
    function fill(id, dealer) {
        const box = fields(id);
        document.getElementById(id).value = dealer.instagram || '';
        box.replaceChildren();
        for (const value of dealer.instagram_extra || []) addField(box,value);
    }
    function values(id) {
        const inputs = [document.getElementById(id), ...fields(id).querySelectorAll('input')];
        const raw = inputs.map(input=>input.value.trim()).filter(Boolean);
        return {instagram:raw[0] || '',instagram_extra:raw.slice(1)};
    }
    window.InstagramAccounts = {handle,handles,credits,fill,values};
    document.addEventListener('DOMContentLoaded',()=>{
        for (const id of ['instagram','edit_instagram']) if (document.getElementById(id)) fields(id);
    });
})();
