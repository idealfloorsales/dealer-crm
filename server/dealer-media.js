'use strict';
const crypto=require('node:crypto');const {previewDataUrl}=require('./image-preview');
const version=value=>crypto.createHash('sha256').update(String(value||'')).digest('hex').slice(0,24);
async function previewPhotoRows(rows,excludeVideos=false){
 const out=[];
 for(let index=0;index<rows.length;index++){
  const photo=rows[index];
  const isVideo=/^data:video\/|\.(mp4|webm|mov)(?:\?|$)/i.test(String(photo.photo_url||''));
  out.push({...photo,photo_url:excludeVideos&&isVideo?'':await previewDataUrl(photo.photo_url,320),isVideo,originalIndex:index,originalVersion:version(photo.photo_url)});
 }
 return out;
}
function registerDealerMedia({app,Dealer,Reclamation,requirePermission,getDealerFilter,getScopedDealerIds}){
 app.get('/api/dealers/:id/photos/:index',requirePermission('can_view_dealers'),async(req,res)=>{
  if(!/^\d{1,4}$/.test(req.params.index))return res.sendStatus(400);
  try{
   const index=Number(req.params.index);
   const dealer=await Dealer.findOne({_id:req.params.id,...getDealerFilter(req)}).select({name:1,photos:{$slice:[index,1]}}).lean();
   if(!dealer)return res.sendStatus(404);
   const photo=dealer.photos?.[0];if(!photo)return res.sendStatus(404);
   if(req.query.v&&req.query.v!==version(photo.photo_url))return res.status(409).json({error:'Фото изменились. Обновите галерею.'});
   res.set('Cache-Control','private, no-store').json(photo);
  }catch(_){res.status(400).json({error:'Не удалось открыть оригинал фото'});}
 });
 if(Reclamation)app.get('/api/reclamations/:id/photos/:index',requirePermission('can_view_reclamations'),async(req,res)=>{
  if(!/^\d{1,4}$/.test(req.params.index))return res.sendStatus(400);
  try{
   const ids=await getScopedDealerIds(req),filter={_id:req.params.id};if(ids)filter.dealerId={$in:ids};
   const item=await Reclamation.findOne(filter).select({dealerId:1,photos:{$slice:[Number(req.params.index),1]}}).lean();
   if(!item)return res.sendStatus(404);
   const photo=item.photos?.[0];if(!photo)return res.sendStatus(404);
   if(req.query.v&&req.query.v!==version(photo.photo_url))return res.status(409).json({error:'Вложения изменились. Обновите рекламацию.'});
   res.set('Cache-Control','private, no-store').json(photo);
  }catch(_){res.status(400).json({error:'Не удалось открыть вложение'});}
 });
}
module.exports={previewPhotoRows,registerDealerMedia,version};
