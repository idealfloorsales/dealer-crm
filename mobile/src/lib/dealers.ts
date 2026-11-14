import type { Dealer } from '@/types';

const kazakh: Record<string,string> = {
  'ә':'а','ғ':'г','қ':'к','ң':'н','ө':'о','ұ':'у','ү':'у','һ':'х','і':'и','ё':'е'
};
const cityAliases: Record<string,string> = {
  'нур султан':'астана','нурсултан':'астана','nur sultan':'астана',
  'astana':'астана','almaty':'алматы','shymkent':'шымкент',
  'karaganda':'караганда','aktobe':'актобе','uralsk':'уральск',
  'atyrau':'атырау','aktau':'актау','kostanay':'костанай'
};

export function normalizeSearch(value: unknown): string {
  let text = String(value ?? '').toLowerCase().trim()
    .replace(/[әғқңөұүһіё]/g, c => kazakh[c] || c)
    .replace(/[^a-zа-я0-9]+/g, ' ').replace(/\s+/g,' ').trim();
  for(const [original,normalized] of Object.entries(cityAliases)){
    if(text.includes(original))text=text.split(original).join(normalized);
  }
  return text.trim();
}

export function validDealerPoint(dealer: Dealer): boolean {
  if(dealer.latitude == null || dealer.longitude == null ||
      String(dealer.latitude).trim()==='' || String(dealer.longitude).trim()==='') return false;
  const lat=Number(dealer.latitude),lon=Number(dealer.longitude);
  return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=40&&lat<=56.5&&lon>=45&&lon<=88.5;
}

export function dealerStatus(status?: string): string {
  const names:Record<string,string>={active:'Активный',standard:'Стандарт',
    potential:'Потенциальный',problem:'Проблемный',archive:'Архив'};
  return names[String(status || '').toLowerCase()] || status || 'Без статуса';
}
function tokenMatch(token:string,field:string):number{
 if(!field)return 0;
 if(field===token)return 20;
 if(field.startsWith(token))return 14;
 if(field.includes(' '+token))return 11;
 if(field.includes(token))return 7;
 return 0;
}
export function dealerSearchScore(dealer:Dealer,search:string):number{
 const tokens=normalizeSearch(search).split(' ').filter(Boolean);
 if(!tokens.length)return 1;
 const fields:Array<[string,number]>=[
  [normalizeSearch(dealer.dealer_id),5],
  [normalizeSearch(dealer.name),4],
  [normalizeSearch(dealer.city),3],
  [normalizeSearch(dealer.address),3],
  [normalizeSearch(dealer.responsible),1],
  [normalizeSearch(dealer.region_sector),1]
 ];
 let score=0;
 for(const token of tokens){
  const best=fields.reduce((max,[field,weight])=>Math.max(max,tokenMatch(token,field)*weight),0);
  if(!best)return 0;
  score+=best;
 }
 const whole=normalizeSearch(search);
 if(fields[0][0]===whole)score+=100;
 if(fields[1][0]===whole)score+=90;
 return score;
}
export type DealerFilter = 'all'|'active'|'potential'|'unmapped'|'problem';
export function filterDealers(dealers:Dealer[],query:string,filter:DealerFilter):Dealer[]{
 const filtered=dealers.filter(dealer=>{
  const status=String(dealer.status||'').toLowerCase();
  if(filter==='active'&&['archive','potential'].includes(status))return false;
  if(filter==='potential'&&status!=='potential')return false;
  if(filter==='unmapped'&&validDealerPoint(dealer))return false;
  if(filter==='problem'&&status!=='problem')return false;
  return dealerSearchScore(dealer,query)>0;
 });
 return filtered.sort((a,b)=>{
  if(query.trim())return dealerSearchScore(b,query)-dealerSearchScore(a,query);
  return String(a.name||'').localeCompare(String(b.name||''),'ru');
 });
}
