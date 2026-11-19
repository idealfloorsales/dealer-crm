(function () {
    const number = value => Number(value || 0).toLocaleString('ru-RU');
    const dateText = value => {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    document.addEventListener('DOMContentLoaded', () => {
        const pane = document.getElementById('instagram-pane');
        if (!pane) return;
        const params = new URLSearchParams(location.search);
        const dealerId = params.get('id') || params.get('dealerId') || '';
        const statusEl = document.getElementById('instagram-monitor-status');
        const setupEl = document.getElementById('instagram-admin-setup');
        const controlsEl = document.getElementById('instagram-admin-controls');
        const callbackEl = document.getElementById('instagram-callback-uri');
        const copyCallbackBtn = document.getElementById('instagram-copy-callback');
        const connectBtn = document.getElementById('instagram-connect');
        const pagePicker = document.getElementById('instagram-page-picker');
        const pageSelect = document.getElementById('instagram-page-select');
        const selectPageBtn = document.getElementById('instagram-select-page');
        const syncBtn = document.getElementById('instagram-sync');
        const metricsEl = document.getElementById('instagram-metrics');
        const matchEl = document.getElementById('instagram-brand-match');
        const postsEl = document.getElementById('instagram-posts');
        const admin = Boolean(window.CRMAuth?.user?.permissions?.is_admin || window.CRMAuth?.user?.role === 'admin');
        let publicStatus = { connected: false };
        let currentUsername = '';
        let busy = false;

        function setStatus(text, kind) {
            statusEl.textContent = text;
            statusEl.className = 'dealer-instagram-status' + (kind ? ' is-' + kind : '');
        }

        async function api(url, options) {
            const response = await fetch(url, Object.assign({ crmTrackLoading: false, headers: { 'Content-Type': 'application/json' } }, options || {}));
            let data = {};
            try { data = await response.json(); } catch (_) {}
            if (!response.ok) throw new Error(data.error || 'Не удалось выполнить запрос');
            return data;
        }

        function setBusy(value) {
            busy = Boolean(value);
            syncBtn.disabled = busy || !dealerId || !currentUsername || !publicStatus.connected;
            syncBtn.innerHTML = busy
                ? '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Обновляем'
                : '<i class="bi bi-arrow-repeat me-1"></i>Обновить';
        }

        function renderSnapshot(snapshot) {
            metricsEl.replaceChildren();
            postsEl.replaceChildren();
            matchEl.hidden = true;
            if (!snapshot) {
                metricsEl.hidden = true;
                postsEl.innerHTML = '<div class="dealer-instagram-empty">Данных пока нет. Нажмите «Обновить», чтобы запросить открытый профиль через Meta.</div>';
                return;
            }
            metricsEl.hidden = false;
            const values = [
                ['Подписчики', snapshot.followersCount],
                ['Всего публикаций', snapshot.mediaCount],
                ['Проверено последних публикаций', snapshot.checkedMediaCount]
            ];
            values.forEach(([label, value]) => {
                const box = document.createElement('div');
                box.className = 'dealer-instagram-metric';
                const caption = document.createElement('span');
                caption.textContent = label;
                const numberEl = document.createElement('strong');
                numberEl.textContent = value === null || value === undefined ? '—' : number(value);
                box.append(caption, numberEl);
                metricsEl.appendChild(box);
            });
            const checked = Number(snapshot.checkedMediaCount || 0);
            const matched = Number(snapshot.textMatchCount || 0);
            matchEl.hidden = false;
            matchEl.className = 'dealer-instagram-match' + (matched ? ' has-match' : '');
            matchEl.textContent = matched
                ? 'В подписях найдено ' + number(matched) + ' текстовых совпадений с IDEAL FLOOR среди ' + number(checked) + ' последних публикаций.'
                : 'Текстовых упоминаний IDEAL FLOOR в подписях последних ' + number(checked) + ' публикаций не найдено.';
            if (snapshot.fetchedAt) {
                const updated = document.createElement('small');
                updated.className = 'd-block text-muted mt-2';
                updated.textContent = 'Последнее обновление: ' + dateText(snapshot.fetchedAt);
                matchEl.appendChild(updated);
            }
            const posts = Array.isArray(snapshot.posts) ? snapshot.posts : [];
            if (!posts.length) {
                postsEl.innerHTML = '<div class="dealer-instagram-empty">Meta не вернула публикации для этого профиля.</div>';
                return;
            }
            posts.forEach(post => {
                const card = document.createElement('article');
                card.className = 'dealer-instagram-post' + (post.textMatch ? ' has-match' : '');
                const head = document.createElement('div');
                head.className = 'dealer-instagram-post-head';
                const time = document.createElement('small');
                time.textContent = dateText(post.timestamp);
                const tag = document.createElement('span');
                tag.textContent = post.textMatch ? 'Совпадение в подписи' : (post.mediaType === 'VIDEO' ? 'Видео / Reels' : 'Публикация');
                head.append(time, tag);
                const caption = document.createElement('p');
                caption.textContent = post.caption || 'Без подписи';
                card.append(head, caption);
                if (post.permalink && /^https:\/\/(www\.)?instagram\.com\//i.test(post.permalink)) {
                    const link = document.createElement('a');
                    link.href = post.permalink;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = 'Открыть публикацию';
                    card.appendChild(link);
                }
                if (post.likeCount !== null || post.commentsCount !== null) {
                    const stats = document.createElement('small');
                    stats.className = 'd-block mt-2 text-muted';
                    stats.textContent = 'Нравится: ' + (post.likeCount === null ? '—' : number(post.likeCount)) + ' · Комментарии: ' + (post.commentsCount === null ? '—' : number(post.commentsCount));
                    card.appendChild(stats);
                }
                postsEl.appendChild(card);
            });
        }

        async function loadSnapshot() {
            if (!dealerId) {
                setStatus('Не удалось определить дилера на этой странице.', 'error');
                return;
            }
            const data = await api('/api/dealers/' + encodeURIComponent(dealerId) + '/instagram-monitor');
            currentUsername = String(data.dealer?.username || '');
            syncBtn.disabled = !publicStatus.connected || !currentUsername || busy;
            if (!currentUsername) {
                setStatus('Добавьте ссылку на Instagram в карточку дилера, чтобы загрузить статистику.', 'warn');
                renderSnapshot(null);
                return;
            }
            if (!data.snapshot) {
                setStatus('Профиль @' + currentUsername + ' указан. Данных пока нет.', publicStatus.connected ? '' : 'warn');
                renderSnapshot(null);
            } else {
                setStatus('Instagram дилера: @' + data.snapshot.username, 'ok');
                renderSnapshot(data.snapshot);
            }
        }

        async function loadPublicStatus() {
            try {
                publicStatus = await api('/api/integrations/instagram/status');
                if (currentUsername) syncBtn.disabled = !publicStatus.connected || !currentUsername || busy;
                if (!publicStatus.connected) {
                    if (!currentUsername) setStatus('Укажите ссылку на Instagram в карточке дилера.', 'warn');
                    else if (!admin) setStatus('Данные Instagram ещё не подключены администратором CRM.', 'warn');
                    else if (!setupEl.hidden) setStatus('Сначала настройте приложение Meta для CRM.', 'warn');
                    else setStatus('Подключите аккаунт Meta, чтобы загружать статистику.', 'warn');
                } else if (publicStatus.account) {
                    setStatus('CRM подключена через аккаунт @' + publicStatus.account + '.', 'ok');
                }
            } catch (error) {
                setStatus(error.message, 'error');
            }
        }

        function fillPages(data) {
            pageSelect.replaceChildren();
            const pages = (data.pages || []).filter(page => page.hasProfessionalInstagram);
            if (!pages.length) {
                pagePicker.hidden = true;
                if (data.configured && !data.connected) {
                    setStatus('Meta вошла, но не нашла Страницу Facebook с профессиональным Instagram. Переведите ast.flooring в режим «Автор»/«Бизнес» и свяжите его со Страницей.', 'warn');
                }
                return;
            }
            pages.forEach(page => {
                const option = document.createElement('option');
                option.value = page.id;
                option.textContent = page.name + (page.instagramUsername ? ' · @' + page.instagramUsername : '');
                pageSelect.appendChild(option);
            });
            if (data.selectedPage?.id) pageSelect.value = data.selectedPage.id;
            pagePicker.hidden = Boolean(data.connected);
        }

        async function loadAdminStatus() {
            if (!admin) {
                controlsEl.hidden = true;
                return;
            }
            controlsEl.hidden = false;
            try {
                const data = await api('/api/admin/integrations/instagram/status');
                setupEl.hidden = data.configured;
                callbackEl.textContent = data.redirectUri || '';
                connectBtn.hidden = !data.configured || data.connected;
                if (copyCallbackBtn) copyCallbackBtn.hidden = !data.redirectUri;
                fillPages(data);
                if (!data.configured) {
                    setStatus('Для начала подключения Meta нужны App ID и App Secret в настройках Render.', 'warn');
                } else if (data.connected && data.selectedPage) {
                    setStatus('CRM подключена через аккаунт @' + (data.selectedPage.instagramUsername || 'Instagram') + '.', 'ok');
                }
            } catch (error) {
                setStatus(error.message, 'error');
            }
        }

        syncBtn.addEventListener('click', async () => {
            if (busy || !dealerId || !currentUsername) return;
            setBusy(true);
            setStatus('Запрашиваем профиль и последние публикации у Meta…', '');
            try {
                const data = await api('/api/dealers/' + encodeURIComponent(dealerId) + '/instagram-monitor/sync', { method: 'POST', body: '{}' });
                renderSnapshot(data.snapshot);
                setStatus('Данные @' + (data.snapshot?.username || currentUsername) + ' обновлены.', 'ok');
            } catch (error) {
                setStatus(error.message, 'error');
            } finally {
                setBusy(false);
            }
        });

        connectBtn?.addEventListener('click', async () => {
            const popup = window.open('about:blank', 'crm-instagram-meta-connect', 'popup,width=620,height=760');
            if (!popup) {
                setStatus('Разрешите всплывающее окно для перехода на Meta и повторите.', 'warn');
                return;
            }
            try {
                const data = await api('/api/admin/integrations/instagram/start', { method: 'POST', body: '{}' });
                popup.location.href = data.authUrl;
                const poll = window.setInterval(() => {
                    if (popup.closed) {
                        window.clearInterval(poll);
                        loadPublicStatus();
                        loadAdminStatus();
                    }
                }, 700);
            } catch (error) {
                popup.close();
                setStatus(error.message, 'error');
            }
        });

        selectPageBtn?.addEventListener('click', async () => {
            if (!pageSelect.value) return;
            selectPageBtn.disabled = true;
            try {
                await api('/api/admin/integrations/instagram/select-page', { method: 'POST', body: JSON.stringify({ pageId: pageSelect.value }) });
                setStatus('Профессиональный Instagram подключён к CRM.', 'ok');
                await Promise.all([loadPublicStatus(), loadAdminStatus()]);
            } catch (error) {
                setStatus(error.message, 'error');
            } finally {
                selectPageBtn.disabled = false;
            }
        });

        copyCallbackBtn?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(callbackEl.textContent || '');
                copyCallbackBtn.innerHTML = '<i class="bi bi-check2"></i> Скопировано';
                window.setTimeout(() => { copyCallbackBtn.innerHTML = '<i class="bi bi-copy"></i> Скопировать'; }, 1600);
            } catch (_) {
                setStatus('Не удалось скопировать URL. Выделите его и скопируйте вручную.', 'warn');
            }
        });

        window.addEventListener('message', event => {
            if (event.origin !== location.origin || event.data?.type !== 'crm-instagram-oauth') return;
            if (event.data.payload?.status === 'ok') setStatus('Meta подтвердила доступ. Выберите подключённую страницу.', 'ok');
            else setStatus(event.data.payload?.message || 'Meta не завершила подключение.', 'error');
            loadPublicStatus();
            loadAdminStatus();
        });

        Promise.resolve(window.CRMAuth?.ready).then(async () => {
            await Promise.all([loadPublicStatus(), loadSnapshot()]);
            await loadAdminStatus();
        }).catch(() => {
            setStatus('Не удалось загрузить раздел Instagram.', 'error');
        });
    });
})();
