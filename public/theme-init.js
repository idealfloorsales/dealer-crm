/* Apply the saved appearance before page styles paint. */
(function () {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    function apply() {
        let mode = 'system';
        try {
            const saved = localStorage.getItem('crm_theme_mode');
            if (['system', 'light', 'dark'].includes(saved)) mode = saved;
        } catch (_) {}
        const theme = mode === 'system' ? (query?.matches ? 'dark' : 'light') : mode;
        document.documentElement.dataset.crmThemeMode = mode;
        document.documentElement.dataset.crmTheme = theme;
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = theme === 'dark' ? '#151619' : '#ffffff';
    }
    apply();
    if (query?.addEventListener) query.addEventListener('change', apply);
    else if (query?.addListener) query.addListener(apply);
})();
