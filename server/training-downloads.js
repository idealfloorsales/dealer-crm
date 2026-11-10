const path=require('path');
function registerTrainingDownloads({app,requirePermission}){
 app.get('/api/training/download/:format',requirePermission('can_view_knowledge'),(req,res)=>{
  const format=req.params.format;if(!['docx','pdf'].includes(format))return res.status(404).json({error:'Формат не найден'});
  res.set('Cache-Control','private, no-store');
  res.download(path.join(__dirname,'training','ideal-floor-training.'+format),'IDEAL-FLOOR-Обучение.'+format,error=>{if(error&&!res.headersSent)res.status(503).json({error:'Файл временно недоступен'});});
 });
}
module.exports={registerTrainingDownloads};
