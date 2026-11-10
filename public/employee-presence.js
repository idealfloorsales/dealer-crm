// Only a visible, authenticated CRM tab reports presence. Closed/hidden tabs expire server-side.
(async()=>{
    if(window.CRMAuth?.ready) await CRMAuth.ready;
    if(!window.CRMAuth?.user) return;
    let pending=false,lastSent=0;
    async function heartbeat(){
        if(pending || document.visibilityState!=='visible' || !localStorage.getItem('crm_token') || Date.now()-lastSent<30000) return;
        pending=true;
        try{
            const response=await fetch('/api/auth/presence',{method:'POST',crmTrackLoading:false});
            if(response.ok)lastSent=Date.now();
        }catch(_){}finally{pending=false;}
    }
    void heartbeat();
    setInterval(heartbeat,45000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void heartbeat();});
    window.addEventListener('online',heartbeat);
})();
