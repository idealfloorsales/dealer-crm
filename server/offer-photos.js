'use strict';
const {previewBuffer}=require('./image-preview');
// Same-origin print assets, restricted to the images in the live offer snapshot.
function registerOfferPhotos({app,CommercialOffer,validSnapshot,fetcher=(...args)=>fetch(...args)}) {
    const cache=new Map();let bytes=0;
    app.get('/api/public/offers/:token/photo/:photoId',async(req,res)=>{
        const token=String(req.params.token||''),id=String(req.params.photoId||'');
        if(!/^[a-f0-9]{48}$/i.test(token)||!/^[a-zA-Z0-9_-]{8,200}$/.test(id))return res.sendStatus(404);
        try {
            const offer=await CommercialOffer.findOne({publicId:token,revokedAt:null,expiresAt:{$gt:new Date()}}).lean();
            if(!offer||!await validSnapshot(offer))return res.sendStatus(410);
            if(!(offer.snapshot?.items||[]).some(item=>String(item.photoId||'')===id))return res.sendStatus(404);
            const size=req.query.size==='full'?2200:700,key=id+':'+size;
            let asset=cache.get(key);
            if(!asset||asset.expires<Date.now()) {
                if(asset){bytes-=asset.body.length;cache.delete(key);}
                const response=await fetcher('https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz=w'+size,{signal:AbortSignal.timeout(20000)});
                const type=String(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
                if(!response.ok||!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(type))return res.sendStatus(502);
                const chunks=[];let length=0;
                for await(const chunk of response.body){length+=chunk.length;if(length>24*1024*1024)throw Error('IMAGE_TOO_LARGE');chunks.push(Buffer.from(chunk));}
                const image=await previewBuffer(Buffer.concat(chunks),type,size);
                asset={type:image.type,body:image.body,expires:Date.now()+5*60*1000};
                const duplicate=cache.get(key);if(duplicate){bytes-=duplicate.body.length;cache.delete(key);}
                while(bytes+asset.body.length>24*1024*1024&&cache.size){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).body.length;cache.delete(oldest);}
                cache.set(key,asset);bytes+=asset.body.length;
            }
            res.set('Cache-Control','private, no-store').type(asset.type).send(asset.body);
        } catch(_){res.sendStatus(502);}
    });
}
module.exports={registerOfferPhotos};
