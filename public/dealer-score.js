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
        const recommendations = [];
        const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
            timeZone:'Asia/Almaty', year:'numeric', month:'2-digit', day:'2-digit'
        }).formatToParts(new Date()).map(part=>[part.type,part.value]));
        const today = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
        const currentMonth = today.slice(0,7);
        const currentDay = Number(dateParts.day)||1;
        const daysInMonth = new Date(Date.UTC(Number(dateParts.year),Number(dateParts.month),0)).getUTCDate();
        const add = (priority,title,reason,steps,action='sales') => recommendations.push({priority,title,reason,steps,action});

        if (canViewSales) {
            const currentRows = rows.filter(row=>String(row.month||'')===currentMonth);
            const current = getSalesTotals(currentRows);
            const elapsed = currentDay / Math.max(1,daysInMonth);
            if (current.plan > 0 && currentDay >= 7 && current.fact < current.plan * elapsed * 0.8) {
                const expected = Math.round(current.plan * elapsed);
                add('high','Есть риск отстать от плана',
                    `Факт ${Math.round(current.fact)} м²; ориентир по темпу на сегодня — около ${expected} м².`,
                    ['Уточнить у дилера ожидаемые заказы до конца месяца.','Проверить наличие нужных декоров и сроки доставки.','Рассмотреть точечное предложение на 2–3 подходящие позиции.'],'pricing');
            }

            const history = new Map();
            rows.filter(row=>!String(row.dealerId||'').startsWith('PLAN_') && row.month && row.month < currentMonth)
                .forEach(row=>history.set(row.month,(history.get(row.month)||0)+number(row.fact)));
            const months = [...history.keys()].sort().reverse();
            if (months.length >= 4 && months[0] === previousMonthKey(currentMonth)) {
                const recent = history.get(months[0]) || 0;
                const baselineMonths = months.slice(1,4);
                const baseline = baselineMonths.reduce((sum,key)=>sum+(history.get(key)||0),0)/baselineMonths.length;
                if (baseline > 0 && recent < baseline * 0.75) {
                    add('high','Зафиксировано снижение продаж',
                        `Последний закрытый месяц: ${Math.round(recent)} м² против среднего ${Math.round(baseline)} м² за три предыдущих месяца.`,
                        ['На визите выяснить, что изменилось: спрос, цены, наличие или активность конкурентов.','Проверить выкладку, ценники и остатки по ходовым позициям.','После проверки предложить обучение, обновление стенда или адресную акцию.'],'visit');
                }
            }

            const hasRecentSales = rows.some(row=>!String(row.dealerId||'').startsWith('PLAN_') && number(row.fact)>0 && String(row.month||'')>=previousMonthKey(currentMonth));
            if (current.plan <= 0 && hasRecentSales) {
                add('medium','Нет согласованного плана на месяц',
                    'Продажи есть, но CRM не показывает цель, с которой можно сравнивать результат.',
                    ['Согласовать с дилером реалистичный объём на месяц.','Выбрать одну коллекцию для дополнительной выкладки или продвижения.'],'sales');
            } else if (!hasRecentSales && current.fact === 0 && current.plan === 0) {
                add('medium','Нет свежего факта продаж',
                    'В CRM нет текущих продаж, поэтому сначала нужно проверить актуальность данных.',
                    ['Уточнить у ответственного, поступил ли свежий отчёт.','Если данные актуальны — связаться с дилером и выяснить, что мешает заказу.'],'sales');
            }
        }

        if (canViewVisits) {
            const hasUpcoming = visits.some(visit=>!visit?.isCompleted && visit?.date && String(visit.date).slice(0,10)>=today);
            const lastVisit = latestCompletedVisit(visits);
            const daysSince = lastVisit ? Math.max(0,Math.floor((Date.now()-lastVisit._date.getTime())/86400000)) : null;
            if (!hasUpcoming && (daysSince === null || daysSince > 45)) {
                add(daysSince===null||daysSince>75?'high':'medium','Нужен контакт с дилером',
                    daysSince===null?'В CRM нет завершённых визитов.':'Последний завершённый визит был '+daysSince+' дней назад.',
                    ['Проверить, как представлены образцы и актуальны ли ценники.','Спросить, какие коллекции и цены предлагают конкуренты.','Завершить встречу одним согласованным шагом: заказ, выкладка или обучение.'],'visit');
            }
        }

        if (dealer.status === 'active' && Array.isArray(dealer.products) && dealer.products.length === 0) {
            add('medium','Проверьте представленность ассортимента',
                'В карточке дилера не отмечены товары в матрице.',
                ['Сверить фактическую выкладку с матрицей.','Подобрать стартовый набор декоров под формат магазина.'],'assortment');
        }

        if (Array.isArray(dealer.competitors) && dealer.competitors.length > 0) {
            add('medium','Используйте сведения о конкурентах',
                `В карточке дилера отмечено конкурирующих брендов: ${dealer.competitors.length}.`,
                ['На визите уточнить конкретные декоры, цены и условия конкурента.','Подготовить сравнение по подтверждённым характеристикам.','Если есть ценовой разрыв — запросить адресное решение, не общую скидку.'],'pricing');
        }

        const rank = {high:0,medium:1,low:2};
        return recommendations.sort((a,b)=>(rank[a.priority]??3)-(rank[b.priority]??3)).slice(0,4);
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