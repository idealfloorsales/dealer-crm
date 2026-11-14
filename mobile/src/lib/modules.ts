export type CRMModuleKey =
 'prices'|'matrix'|'display'|'reclamations'|'workshop'|'competitors'|'training'|
 'employees'|'audit'|'dealer';

export type CRMModule={
 key:CRMModuleKey;title:string;subtitle:string;icon:string;path:string;permission:string;
};
export const modules:CRMModule[]=[
 {key:'prices',title:'Цены и КП',subtitle:'Прайсы, скидки и коммерческие предложения',icon:'%',path:'/pricing.html',permission:'can_view_pricing'},
 {key:'matrix',title:'Матрица',subtitle:'Ассортимент, остатки и архив позиций',icon:'▦',path:'/products.html',permission:'can_view_products'},
 {key:'display',title:'Выставленность и отчёты',subtitle:'Планы, показатели, стенды и выкладка',icon:'▥',path:'/report.html',permission:'can_view_report'},
 {key:'reclamations',title:'Рекламации',subtitle:'Заявления и печатные формы',icon:'!',path:'/reclamations.html',permission:'can_view_reclamations'},
 {key:'workshop',title:'Цех',subtitle:'Материалы, служебки, производство',icon:'⚙',path:'/workshop.html',permission:'can_view_workshop'},
 {key:'competitors',title:'Конкуренты',subtitle:'Рынок и позиции конкурентов',icon:'◎',path:'/competitors.html',permission:'can_view_competitors'},
 {key:'training',title:'Обучение',subtitle:'Материалы и знания',icon:'◆',path:'/knowledge.html',permission:'can_view_knowledge'},
 {key:'employees',title:'Сотрудники',subtitle:'Команда и рабочие права',icon:'♙',path:'/users.html',permission:'can_view_kpi'},
 {key:'audit',title:'Журнал',subtitle:'История действий и изменений',icon:'◷',path:'/audit.html',permission:'can_manage_users'},
 {key:'dealer',title:'Полная карточка',subtitle:'Все разделы профиля дилера',icon:'▦',path:'/dealer.html',permission:'can_view_dealers'},
];
export function findCRMModule(key:string){return modules.find(x=>x.key===key);}
export function modulePath(key:CRMModuleKey,dealerId?:string){
 const module=findCRMModule(key);
 if(!module)return '/';
 if(module.key==='dealer'&&dealerId)return module.path+'?id='+encodeURIComponent(dealerId);
 return module.path;
}
