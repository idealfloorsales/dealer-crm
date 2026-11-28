'use strict';

const {handle} = require('../public/instagram-accounts');
const monthFormat = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit'});
const localMonth = date => monthFormat.format(date);
const PAGE_SIZE = 50;
const PAGES_PER_PASS = 4;
const PREVIEW_SIZE = 12;

function offsetMonth(month,offset) {
    const date = new Date(month+'-01T12:00:00Z');
    date.setUTCMonth(date.getUTCMonth()+offset);
    return date.toISOString().slice(0,7);
}

function brandInCaption(caption) {
    const value=String(caption || '').normalize('NFKC').toLowerCase().replace(/[\u200b-\u200d\ufeff]/g,'');
    return /(?:^|[^\p{L}\p{N}])(?:ideal[\s._-]*floor(?:[\s._-]*(?:kz|kazakhstan))?|idea[\s._-]*floor[\s._-]*(?:kz|kazakhstan)|идеал[\s._-]*фло{1,2}р(?:[\s._-]*(?:кз|казахстан))?|идеа[\s._-]*фло{1,2}р[\s._-]*кз)(?![\p{L}\p{N}])/u.test(value);
}

function fieldsFor(username,after,since,until) {
    if (!handle(username) || handle(username)!==username) throw new Error('Некорректное имя Instagram');
    if (after && (typeof after!=='string' || after.length>4096 || /[(),{}\s]/.test(after))) {
        throw new Error('Недействительный курсор публикаций Instagram');
    }
    const period=since==null ? '' : '.since('+since+').until('+until+')';
    const cursor=after ? '.after('+after+')' : '';
    return 'business_discovery.username('+username+'){username,followers_count,media_count,media.limit('+PAGE_SIZE+')'+
        period+cursor+'{id,caption,media_type,permalink,timestamp,like_count,comments_count}}';
}

function parsePage(result) {
    const profile=result?.business_discovery;
    if (!profile) throw Object.assign(new Error('Meta не вернула профессиональный профиль Instagram.'),{status:422});
    const edge=profile.media;
    if (!Array.isArray(edge?.data) && !(edge==null && profile.media_count===0)) {
        throw new Error('Meta вернула профиль без списка публикаций. Проверка периода не завершена.');
    }
    const posts=new Map();
    let skipped=0;
    for (const item of edge?.data || []) {
        const timestamp=new Date(item?.timestamp);
        if (!item?.id || !item.timestamp || !Number.isFinite(+timestamp)) {
            skipped++;
            continue;
        }
        const caption=String(item.caption || '');
        posts.set(String(item.id),{id:String(item.id),mediaType:String(item.media_type || ''),permalink:String(item.permalink || ''),
            caption,timestamp,likeCount:Number.isFinite(item.like_count) ? item.like_count : null,
            commentsCount:Number.isFinite(item.comments_count) ? item.comments_count : null,textMatch:brandInCaption(caption)});
    }
    const after=edge?.paging?.cursors?.after;
    if (edge?.paging?.next && !after) throw new Error('Meta не вернула курсор следующей страницы.');
    return {profile,posts:[...posts.values()],after:after || '',skipped};
}

// Archive each page before moving its cursor. Nested Business Discovery returns
// an after cursor without a next URL. Neither a short nor an empty page proves EOF.
async function scanPeriod({username,month,saved,now,read,archive,checkpoint,onHead,pageBudget=PAGES_PER_PASS}) {
    let state=saved?.pending && saved.startedAt ? {...saved} :
        {startedAt:now,after:'',ranged:true,pending:true,skipped:0,checkedAt:saved?.checkedAt || null};
    const start=+new Date(offsetMonth(month,-1)+'-01T00:00:00+05:00');
    const end=Math.min(+new Date(state.startedAt),+new Date(offsetMonth(month,1)+'-01T00:00:00+05:00')-1);
    await checkpoint(state);
    const seen=new Set(state.after ? [state.after] : []);
    let pages=0;
    while (pages<pageBudget) {
        let page;
        try {
            const fields=fieldsFor(username,state.after,state.ranged ? Math.floor(start/1000)-1 : null,Math.ceil(end/1000)+1);
            page=parsePage(await read(fields));
        } catch (error) {
            // A deleted cursor, or a Graph version that rejects nested time filters,
            // must not turn a partial scan into an empty completed one.
            if (error.metaCode!==100 || (!state.after && !state.ranged)) throw error;
            state={...state,after:'',skipped:0,ranged:state.after ? state.ranged : false};
            await checkpoint(state);
            if (pages || seen.has('restart')) return state;
            seen.add('restart');
            continue;
        }
        pages++;
        const inPeriod=page.posts.filter(p=>+p.timestamp>=start && +p.timestamp<=end);
        await archive(inPeriod);
        if (!state.after && onHead) await onHead(page,state);
        const repeated=page.after && (page.after===state.after || seen.has(page.after));
        if (repeated) {
            state={...state,after:'',pending:true};
            await checkpoint(state);
            throw new Error('Meta повторила страницу публикаций. Проверка будет продолжена.');
        }
        const finished=!page.after;
        const skipped=(state.skipped || 0)+page.skipped;
        state={...state,after:page.after,pending:!finished,skipped,
            checkedAt:finished ? (skipped ? null : state.startedAt) : state.checkedAt};
        await checkpoint(state);
        if (finished) break;
        seen.add(page.after);
    }
    return state;
}
module.exports={brandInCaption,fieldsFor,parsePage,scanPeriod,localMonth,offsetMonth,PREVIEW_SIZE};
