/* Shared CRM refinements; no business data or API calls. */
(function () {
  'use strict';

  function initProductFilters() {
    var toolbar = document.querySelector('.products-page .product-toolbar');
    var searchRow = toolbar && toolbar.querySelector('.product-search-row');
    var grid = toolbar && toolbar.querySelector('.product-filter-grid');
    var reset = toolbar && toolbar.querySelector('#product-reset-filters');
    if (!toolbar || !searchRow || !grid || !reset || toolbar.dataset.crmFiltersReady) return;

    toolbar.dataset.crmFiltersReady = '1';
    grid.id = grid.id || 'product-filter-grid';
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'product-filters-toggle';
    toggle.className = 'crm-inline-filter-toggle';
    toggle.setAttribute('aria-controls', grid.id);
    toggle.setAttribute('title', 'Показать или скрыть фильтры');
    toggle.innerHTML = '<i class="bi bi-sliders2" aria-hidden="true"></i><span>Фильтры</span>';
    searchRow.insertBefore(toggle, reset);

    function setExpanded(expanded) {
      toolbar.classList.toggle('crm-filters-collapsed', !expanded);
      toggle.classList.toggle('is-active', expanded);
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('title', expanded ? 'Скрыть фильтры' : 'Показать фильтры');
      if (!expanded && grid.contains(document.activeElement)) toggle.focus();
    }
    toggle.addEventListener('click', function () {
      setExpanded(toolbar.classList.contains('crm-filters-collapsed'));
    });
    setExpanded(false);
  }

  function addMissingTabIcons() {
    var selector = [
      '.product-view-tabs button', '.pricing-view-tabs button',
      '.workshop-tabs button', '.workshop-stock-view-tabs button',
      '.employee-tabs button', '.dealer-edit-nav button', '.profile-tabs button',
      '.training-tabs button', '.training-view-tabs button',
      '.sales-mobile-tabs button', '.nav[role="tablist"] button',
      '[role="tablist"] [role="tab"]'
    ].join(',');
    document.querySelectorAll(selector).forEach(function (tab) {
      if (tab.querySelector('i.bi,svg')) return;
      var name = (tab.textContent || tab.getAttribute('aria-label') || '').toLowerCase().trim();
      if (!name) return;
      var patterns = [
        [/истор|событ|активност/, 'bi-clock-history'],
        [/дилер|магазин|партнер|контакт/, 'bi-people'],
        [/цен|скидк|прайс|оплат/, 'bi-tags'],
        [/продаж|сводк|результ/, 'bi-graph-up-arrow'],
        [/документ|акт|бланк|кп/, 'bi-file-earmark-text'],
        [/карта|визит|адрес|город/, 'bi-geo-alt'],
        [/товар|матриц|каталог|остат|ламинат|номенклат/, 'bi-box-seam'],
        [/настр|фильтр|услов/, 'bi-sliders2'],
        [/сотруд|доступ|роль/, 'bi-shield-lock'],
        [/архив/, 'bi-archive'],
        [/клиент|инфо|обзор|общ/, 'bi-info-circle']
      ];
      var iconName = 'bi-grid-3x3-gap';
      for (var i = 0; i < patterns.length; i++) {
        if (patterns[i][0].test(name)) { iconName = patterns[i][1]; break; }
      }
      var icon = document.createElement('i');
      icon.className = 'bi ' + iconName;
      icon.setAttribute('aria-hidden', 'true');
      tab.insertBefore(icon, tab.firstChild);
    });
  }

  function init() {
    initProductFilters();
    addMissingTabIcons();
    document.addEventListener('shown.bs.tab', addMissingTabIcons);
    // Some tabs are created after dealer, pricing or workshop data are loaded.
    window.setTimeout(addMissingTabIcons, 750);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
