function coverageOf(user) {
    const global=user.role==='admin'||user.role==='marketing'||user.permissions?.is_admin===true;
    const scope=global?'all':user.scope||'all';
    return {scope,label:scope==='astana'?'Астана':scope==='regions'?'Регионы':'Вся компания',filter:scope==='astana'?{responsible:'regional_astana'}:scope==='regions'?{responsible:'regional_regions'}:{}};
}
function latestActivity(user, latestAction) {
    const timestamps=[user.lastSeenAt,user.lastLoginAt,latestAction].map(v=>v?new Date(v).getTime():NaN).filter(Number.isFinite);
    return timestamps.length?new Date(Math.max(...timestamps)):null;
}
function salesForCoverage(rows,workingDealers,scope) {
    const ids=new Set(workingDealers.map(d=>String(d._id)));
    const planId=scope==='astana'?'PLAN_astana_all':scope==='regions'?'PLAN_regions_all':'PLAN_total_all';
    const summary=rows.find(row=>row.dealerId===planId);
    const dealerRows=rows.filter(row=>!row.isCustom&&ids.has(String(row.dealerId)));
    const customRows=rows.filter(row=>row.isCustom&&(scope==='all'||(scope==='astana'?/^(astana_|regional_astana$)/:/^(sector_|regional_regions$)/).test(String(row.group||''))));
    const fact=[...dealerRows,...customRows].reduce((n,row)=>n+Math.max(0,Number(row.fact)||0),0);
    const personal=rows.filter(row=>String(row.dealerId||'').startsWith('PLAN_vip_')&&ids.has(String(row.dealerId).slice(9)));
    const plan=summary?Math.max(0,Number(summary.plan)||0):(personal.length?personal:dealerRows).reduce((n,row)=>n+Math.max(0,Number(row.plan)||0),0);
    return {plan,fact,percent:plan>0?Math.round(fact/plan*1000)/10:0,hasPlan:plan>0};
}
module.exports={coverageOf,latestActivity,salesForCoverage};
