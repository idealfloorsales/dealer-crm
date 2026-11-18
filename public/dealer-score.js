(function () {
    function number(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function hasText(value) {
        return Boolean(String(value || '').trim());
    }

    function latestCompletedVisit(visits) {
        return (Array.isArray(visits) ? visits : [])
            .filter(v => v && v.isCompleted && v.date)
            .map(v => ({ ...v, _date: new Date(v.date) }))
            .filter(v => !Number.isNaN(v._date.getTime()))
            .sort((a, b) => b._date - a._date)[0] || null;
    }

    function getSalesTotals(salesRows) {
        const rows = Array.isArray(salesRows) ? salesRows : [];
        const fact = rows
            .filter(row => !String(row.dealerId || '').startsWith('PLAN_'))
            .reduce((sum, row) => sum + number(row.fact), 0);

        const explicitPlanRows = rows.filter(row => String(row.dealerId || '').startsWith('PLAN_'));
        const planSource = explicitPlanRows.length ? explicitPlanRows : rows;
        const plan = planSource.reduce((sum, row) => sum + number(row.plan), 0);

        return { fact, plan };
    }

    function calculateDealerScore(options) {
        options = options || {};
        const dealer = options.dealer || {};
        const salesRows = Array.isArray(options.salesRows) ? options.salesRows : [];
        const visits = Array.isArray(options.visits) ? options.visits : (dealer.visits || []);
        const canViewSales = options.canViewSales !== false;
        const canViewVisits = options.canViewVisits !== false;

        const breakdown = {};
        let rawScore = 0;
        let availableMax = 0;

        if (canViewSales) {
            const { fact, plan } = getSalesTotals(salesRows);
            let score = 0;
            let note = 'Нет продаж в текущем месяце';

            if (fact > 0 && plan > 0) {
                const achievement = fact / plan;
                score = 20 + Math.min(1, achievement) * 20;
                note = achievement >= 1
                    ? 'План выполнен'
                    : `Выполнено ${Math.round(achievement * 100)}% плана`;
            } else if (fact > 0 && plan <= 0) {
                const hasPersonalPlan = dealer.hasPersonalPlan === true;
                score = hasPersonalPlan ? 24 : 34;
                note = hasPersonalPlan ? 'Продажи есть, план не заполнен' : 'Продажи есть, индивидуального плана нет';
            }

            score = Math.round(score);
            breakdown.sales = { label: 'Продажи', score, max: 40, note, fact, plan };
            rawScore += score;
            availableMax += 40;
        }

        if (canViewVisits) {
            const last = latestCompletedVisit(visits);
            let score = 0;
            let note = 'Нет завершённых визитов';
            let days = null;

            if (last) {
                days = Math.max(0, Math.floor((Date.now() - last._date.getTime()) / 86400000));
                if (days <= 14) score = 25;
                else if (days <= 30) score = 22;
                else if (days <= 45) score = 17;
                else if (days <= 60) score = 11;
                else if (days <= 90) score = 6;
                else score = 2;
                note = days === 0 ? 'Визит сегодня' : `Последний визит ${days} дн. назад`;
            }

            breakdown.visits = { label: 'Визиты', score, max: 25, note, days };
            rawScore += score;
            availableMax += 25;
        }

        const statusMap = {
            active: { score: 15, note: 'Активный' },
            standard: { score: 12, note: 'Стандарт' },
            potential: { score: 10, note: 'Потенциальный' },
            problem: { score: 2, note: 'Проблемный' },
            archive: { score: 0, note: 'Архив' }
        };
        const status = statusMap[dealer.status] || { score: 10, note: 'Статус не указан' };
        breakdown.status = { label: 'Статус', score: status.score, max: 15, note: status.note };
        rawScore += status.score;
        availableMax += 15;

        const profileChecks = [
            hasText(dealer.city),
            hasText(dealer.address),
            hasText(dealer.responsible),
            hasText(dealer.price_type),
            Array.isArray(dealer.legal_entities) && dealer.legal_entities.some(entity => hasText(entity?.organizationName)),
            Boolean(dealer.contract && (dealer.contract.isSigned || hasText(dealer.contract.date)))
        ];
        const profileFilled = profileChecks.filter(Boolean).length;
        const profileScore = Math.round((profileFilled / profileChecks.length) * 10);
        breakdown.profile = {
            label: 'Карточка',
            score: profileScore,
            max: 10,
            note: `Заполнено ${profileFilled} из ${profileChecks.length} основных полей`
        };
        rawScore += profileScore;
        availableMax += 10;

        const contacts = Array.isArray(dealer.contacts) ? dealer.contacts : [];
        const hasPhone = contacts.some(c => hasText(c && c.contactInfo) && String(c.contactInfo).replace(/\D/g, '').length >= 10);
        let activityScore = 0;
        if (contacts.length > 0) activityScore += 4;
        if (hasPhone) activityScore += 2;
        if (dealer.latitude && dealer.longitude) activityScore += 2;
        if (hasText(dealer.website) || hasText(dealer.instagram)) activityScore += 2;
        breakdown.activity = {
            label: 'Контакты и активность',
            score: activityScore,
            max: 10,
            note: activityScore >= 8 ? 'Контактные данные заполнены хорошо' : 'Можно дополнить контакты и данные'
        };
        rawScore += activityScore;
        availableMax += 10;

        const score = availableMax > 0 ? Math.round((rawScore / availableMax) * 100) : 0;
        let level = 'problem';
        let label = 'Проблемный';
        if (score >= 90) { level = 'excellent'; label = 'Отлично'; }
        else if (score >= 75) { level = 'good'; label = 'Хорошо'; }
        else if (score >= 60) { level = 'normal'; label = 'Нормально'; }
        else if (score >= 40) { level = 'attention'; label = 'Требует внимания'; }

        const reasons = Object.values(breakdown)
            .filter(part => part.max > 0 && (part.score / part.max) < 0.6)
            .sort((a, b) => (a.score / a.max) - (b.score / b.max))
            .map(part => part.note)
            .filter(Boolean);

        return {
            score,
            level,
            label,
            rawScore,
            availableMax,
            breakdown,
            reasons
        };
    }

    function getDealerGrowthRecommendations(options) {
        options = options || {};
        const dealer = options.dealer || {};
        const rows = Array.isArray(options.salesRows) ? options.salesRows : [];
        const visits = Array.isArray(options.visits) ? options.visits : (dealer.visits || []);
        const canViewSales = options.canViewSales !== false;
        const canViewVisits = options.canViewVisits !== false;
        const result = [];
        const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
            timeZone:'Asia/Almaty', year:'numeric', month:'2-digit', day:'2-digit'
        }).formatToParts(new Date()).map(part=>[part.type,part.value]));
        const today = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
        const currentMonth = today.slice(0,7);
        const currentDay = Number(dateParts.day)||1;
        const daysInMonth = new Date(Date.UTC(Number(dateParts.year),Number(dateParts.month),0)).getUTCDate();
        const monthOffset = (month, offset) => {
            const [y,m] = String(month).split('-').map(Number);
            const d = new Date(Date.UTC(y,m-1+offset,1));
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
        };
        const area = value => Math.round(Number(value)||0);
        const salesByMonth = new Map();
        const presentMonths = new Set();
        rows.filter(row => !String(row.dealerId||'').startsWith('PLAN_') && /^\\d{4}-\\d{2}$/.test(String(row.month||'')))
            .forEach(row => {
                const key=String(row.month);
                presentMonths.add(key);
                salesByMonth.set(key,(salesByMonth.get(key)||0)+number(row.fact));
            });
        const factAt = key => salesByMonth.get(key)||0;
        const average = keys => keys.reduce((sum,key)=>sum+factAt(key),0)/Math.max(1,keys.length);
        const reasons = [];
        const actions = [];
        const metricLines = [];
        let risk = 'stable';

        if (canViewSales) {
            const lastClosed = monthOffset(currentMonth,-1);
            const recentKeys = [-3,-2,-1].map(offset=>monthOffset(currentMonth,offset));
            const priorKeys = [-6,-5,-4].map(offset=>monthOffset(currentMonth,offset));
            const recentAvg=average(recentKeys);
            const priorAvg=average(priorKeys);
            const recentCoverage=recentKeys.filter(key=>presentMonths.has(key)).length;
            const priorCoverage=priorKeys.filter(key=>presentMonths.has(key)).length;
            const completeHistory=recentCoverage>=2 && priorCoverage>=2 && priorAvg>0;
            const decline=completeHistory ? (priorAvg-recentAvg)/priorAvg : 0;
            const recentTotal=recentKeys.reduce((sum,key)=>sum+factAt(key),0);
            const priorTotal=priorKeys.reduce((sum,key)=>sum+factAt(key),0);

            if (completeHistory) {
                metricLines.push(`Последние 3 закрытых месяца: ${area(recentTotal)} м²`);
                metricLines.push(`Предыдущие 3 месяца: ${area(priorTotal)} м²`);
                if (decline>=0.2) {
                    risk=decline>=0.4?'critical':'high';
                    reasons.push(`Средние продажи за последние 3 месяца ниже предыдущего периода на ${Math.round(decline*100)}%.`);
                    actions.push('Связаться с дилером в ближайшие 1–2 рабочих дня и выяснить, что изменилось в спросе и заказах.');
                } else if (decline>=0.1) {
                    risk='watch';
                    reasons.push(`Средний темп за последние 3 месяца снизился на ${Math.round(decline*100)}% — ранний сигнал, стоит проверить ситуацию.`);
                    actions.push('Запланировать короткий контакт с дилером и сверить ожидания по заказам.');
                }
            } else {
                metricLines.push('Для сравнения темпа пока не хватает данных за 6 закрытых месяцев.');
            }

            const currentFact=factAt(currentMonth);
            const elapsed=currentDay/Math.max(1,daysInMonth);
            const currentPace=currentFact/Math.max(elapsed,0.1);
            const recentBaseline=recentCoverage>=2 ? recentAvg : 0;
            if (currentDay>=10 && currentFact>0 && recentBaseline>0 && currentPace<recentBaseline*0.75) {
                if (risk==='stable') risk='watch';
                reasons.push(`Текущий месяц пока идет примерно на ${Math.max(0,Math.round((1-currentPace/recentBaseline)*100))}% ниже среднего темпа последних месяцев.`);
                metricLines.push(`Текущий темп: около ${area(currentPace)} м²/мес.`);
            }

            if (risk==='critical'||risk==='high'||risk==='watch') {
                const competitorList=Array.isArray(dealer.competitors)?dealer.competitors:[];
                if (competitorList.length) {
                    reasons.push(`В карточке отмечено ${competitorList.length} конкурирующих бренда. Это фактор для проверки, но само по себе не доказывает причину снижения.`);
                    actions.push('На встрече уточнить, какие именно товары конкурента продаются активнее и какие у него условия.');
                }
                const lastVisit=latestCompletedVisit(visits);
                const daysSince=lastVisit?Math.max(0,Math.floor((Date.now()-lastVisit._date.getTime())/86400000)):null;
                if (canViewVisits && (daysSince===null||daysSince>45)) {
                    reasons.push(daysSince===null?'В CRM нет завершённых визитов.':`Последний завершённый визит был ${daysSince} дней назад.`);
                    actions.push('Провести визит с проверкой выкладки, ценников, наличия образцов и обратной связи продавцов.');
                }
                if (Array.isArray(dealer.products)&&dealer.products.length===0) {
                    reasons.push('В матрице дилера не отмечены наши товары.');
                    actions.push('Сверить фактическую выкладку и подобрать минимальный набор ходовых декоров.');
                }
                if (!actions.some(item=>item.includes('цен')||item.includes('услов'))) {
                    actions.push('Сверить цену и условия на 2–3 сопоставимые позиции; при необходимости запросить адресное предложение.');
                }
                actions.push('После контакта отметить результат и повторно проверить продажи в следующем месяце.');
            }

            if (!result.length && risk!=='stable') {
                result.push({
                    priority:risk==='critical'?'high':risk==='watch'?'medium':'high',
                    title:risk==='critical'?'Критическое снижение темпа продаж':risk==='watch'?'Появился сигнал к проверке':'Продажи дилера снизились',
                    reason:reasons[0]||'Изменился темп продаж относительно истории дилера.',
                    signals:reasons.slice(1),
                    metrics:metricLines,
                    steps:[...new Set(actions)],
                    action:'sales'
                });
            } else if (risk==='stable' && completeHistory) {
                result.push({
                    priority:'low',
                    title:'Темп продаж стабилен',
                    reason:'Сравнение последних трёх закрытых месяцев с предыдущими тремя не выявило существенного снижения.',
                    signals:[],
                    metrics:metricLines,
                    steps:['Продолжать текущую работу; обратить внимание на новые изменения темпа в следующих месяцах.'],
                    action:'sales'
                });
            }
        }

        if (canViewVisits && !result.length) {
            const hasUpcoming=visits.some(visit=>!visit?.isCompleted&&visit?.date&&String(visit.date).slice(0,10)>=today);
            const lastVisit=latestCompletedVisit(visits);
            const daysSince=lastVisit?Math.max(0,Math.floor((Date.now()-lastVisit._date.getTime())/86400000)):null;
            if (!hasUpcoming&&(daysSince===null||daysSince>60)) {
                result.push({
                    priority:daysSince===null||daysSince>90?'high':'medium',
                    title:'Давно не было контакта с дилером',
                    reason:daysSince===null?'В CRM нет завершённых визитов.':`Последний завершённый визит был ${daysSince} дней назад.`,
                    signals:dealer.competitors?.length?[ `У дилера отмечено конкурентов: ${dealer.competitors.length}.` ]:[],
                    metrics:[],
                    steps:['Связаться с дилером и уточнить текущие продажи, спрос, выкладку и предложения конкурентов.'],
                    action:'visit'
                });
            }
        }
        return result;
    }

    function previousMonthKey(month) {
        const [year,monthNumber]=String(month||'').split('-').map(Number);
        if(!year||!monthNumber) return '';
        const d=new Date(Date.UTC(year,monthNumber-2,1));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
    }

    window.CRMScore = {
        calculateDealerScore,
        latestCompletedVisit,
        getSalesTotals,
        getDealerGrowthRecommendations
    };
})();