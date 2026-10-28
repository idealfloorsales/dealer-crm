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
            const fact = salesRows.reduce((sum, row) => sum + number(row.fact), 0);
            const plan = salesRows.reduce((sum, row) => sum + number(row.plan), 0);
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
            (Array.isArray(dealer.organizations) && dealer.organizations.length > 0) || hasText(dealer.organization),
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

        return {
            score,
            level,
            label,
            rawScore,
            availableMax,
            breakdown
        };
    }

    window.CRMScore = {
        calculateDealerScore,
        latestCompletedVisit
    };
})();