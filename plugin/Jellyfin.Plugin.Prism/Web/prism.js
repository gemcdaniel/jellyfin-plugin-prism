/*! Prism — Client Script (built from src/js/) */
(function () {
  'use strict';

  // --- 01-core.js ---
if (window.__prismInit) {
    return;
  }
  window.__prismInit = true;

  var DEFAULT_CONFIG = {
    enablePlugin: true,
    enableThemeCss: true,
    themeDashboard: true,
    enableTvGuideScrollFix: true,
    enableHeroSpotlight: true,
    enableDetailBackdrop: true,
    enableDynamicAmbientColor: true,
    enableMediaBadges: true,
    enableHomeSections: true,
    enableInfiniteDiscovery: true,
    enableWatchlist: true,
    enableLibraryInfiniteScroll: true,
    enableDesktopHamburger: true,
    hasTmdbApiKey: false
  };

  var HOME_CACHE_PREFIX = 'prism_home_v3_';
  var HOME_FRESH_MS = 2 * 60 * 1000;
  var HOME_STALE_MS = 30 * 60 * 1000;

  var state = {
    config: DEFAULT_CONFIG,
    homeData: null,
    homeUserId: null,
    homeFetchedAt: 0,
    loadingHome: false,
    slideIndex: 0,
    slideBackdropIndex: 0,
    slideTimer: null,
    inlineTimers: {},
    inlineObserver: null,
    inlineVisMap: {},
    colorCache: {},
    activeColorKey: null,
    badgeCache: {},
    badgeScanTimer: null,
    badgeInFlight: false,
    watchlistSet: {},
    watchlistLoadedFor: null,
    watchlistInFlight: false,
    themeCache: {},
    discovery: {
      userId: null,
      page: 0,
      pageSize: 4,
      hasMore: true,
      loading: false,
      pagesLoaded: 0,
      maxPages: 10,
      observer: null,
      generation: 0,
      renderedIds: {}
    },
    libScroll: {
      key: '',
      loading: false,
      hasMore: true,
      totalCount: null,
      observer: null,
      generation: 0,
      seenIds: {}
    },
    domSyncRaf: null,
    domSyncTimer: null,
    navViewsCache: null,
    navViewsFetchedAt: 0,
    navDrawerOpen: false
  };

  function resolveUrl(relativePath) {
    if (window.ApiClient && typeof window.ApiClient.getUrl === 'function') {
      return window.ApiClient.getUrl(relativePath);
    }
    var path = window.location.pathname || '/';
    var webIdx = path.toLowerCase().indexOf('/web');
    var base = webIdx > 0 ? path.slice(0, webIdx) : '';
    return base + '/' + relativePath.replace(/^\/+/, '');
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeItemId(raw) {
    if (!raw) return '';
    return String(raw).replace(/-/g, '').toLowerCase();
  }

  function isTvLayout() {
    return Boolean(document.documentElement && document.documentElement.classList.contains('layout-tv'));
  }

  function isHomeRoute() {
    var hash = (window.location.hash || '').toLowerCase();
    return hash === '' || hash === '#' || hash === '#/' || hash.indexOf('#/home') === 0 || hash.indexOf('#!/home') === 0;
  }

  function isDetailsRoute() {
    var hash = (window.location.hash || '').toLowerCase();
    return hash.indexOf('#/details') === 0 || hash.indexOf('#!/details') === 0;
  }

  function isDashboardRoute() {
    var hash = (window.location.hash || '').toLowerCase();
    return hash.indexOf('#/dashboard') === 0 || hash.indexOf('#!/dashboard') === 0;
  }

  function getDetailItemId() {
    var hash = window.location.hash || '';
    var qIdx = hash.indexOf('?');
    if (qIdx === -1) return null;
    var query = hash.slice(qIdx + 1).split('&');
    for (var i = 0; i < query.length; i += 1) {
      var parts = query[i].split('=');
      if (parts[0] === 'id' && parts[1]) {
        return decodeURIComponent(parts[1]);
      }
    }
    return null;
  }

  function getActiveHomePage() {
    var sections = document.querySelectorAll('.homeSectionsContainer');
    for (var i = 0; i < sections.length; i += 1) {
      var page = sections[i].closest('.page');
      if (!page || !page.classList.contains('hide')) {
        return { page: page || sections[i].parentElement, container: sections[i] };
      }
    }
    return null;
  }

  function buildImageUrl(itemId, type, maxWidth, tag, index) {
    var idx = typeof index === 'number' && index > 0 ? index : 0;
    if (window.ApiClient && typeof window.ApiClient.getImageUrl === 'function') {
      var opts = {
        type: type,
        maxWidth: maxWidth,
        quality: 90
      };
      if (tag) opts.tag = tag;
      if (idx > 0) opts.index = idx;
      return window.ApiClient.getImageUrl(itemId, opts);
    }
    var suffix = idx > 0 ? '/' + idx : '';
    var base = resolveUrl('Items/' + encodeURIComponent(itemId) + '/Images/' + type + suffix);
    var url = base + '?maxWidth=' + maxWidth + '&quality=90';
    if (tag) {
      url += '&tag=' + encodeURIComponent(tag);
    }
    return url;
  }

  function navigateToItem(itemId) {
    var hashTarget = '#/details?id=' + encodeURIComponent(itemId);
    if (window.Emby && window.Emby.Page && typeof window.Emby.Page.show === 'function') {
      try {
        window.Emby.Page.show('/details?id=' + encodeURIComponent(itemId));
        return;
      } catch (_) {
        // Fallback to hash navigation below
      }
    }
    window.location.hash = hashTarget;
  }

  function syncDashboardThemeState() {
    var link = document.querySelector('link[data-prism]');
    if (!link) return;
    if (!state.config.enablePlugin || !state.config.enableThemeCss) {
      link.disabled = true;
      return;
    }
    link.disabled = isDashboardRoute() && state.config.themeDashboard === false;
  }

  function loadConfig() {
    return fetch(resolveUrl('Prism/config'), { credentials: 'same-origin' })
      .then(function (res) {
        return res.ok ? res.json() : DEFAULT_CONFIG;
      })
      .then(function (cfg) {
        state.config = {
          enablePlugin: cfg.enablePlugin !== false,
          enableThemeCss: cfg.enableThemeCss !== false,
          themeDashboard: cfg.themeDashboard !== false,
          enableTvGuideScrollFix: cfg.enableTvGuideScrollFix !== false,
          enableHeroSpotlight: cfg.enableHeroSpotlight !== false,
          enableDetailBackdrop: cfg.enableDetailBackdrop !== false,
          enableDynamicAmbientColor: cfg.enableDynamicAmbientColor !== false,
          enableMediaBadges: cfg.enableMediaBadges !== false,
          enableHomeSections: cfg.enableHomeSections !== false,
          enableInfiniteDiscovery: cfg.enableInfiniteDiscovery !== false,
          enableWatchlist: cfg.enableWatchlist !== false,
          enableLibraryInfiniteScroll: cfg.enableLibraryInfiniteScroll !== false,
          enableDesktopHamburger: cfg.enableDesktopHamburger !== false,
          hasTmdbApiKey: Boolean(cfg.hasTmdbApiKey)
        };
        syncDashboardThemeState();
      })
      .catch(function () {
        syncDashboardThemeState();
      });
  }

  function hasHomePayloadContent(data) {
    if (!data) return false;
    var hasHero = Boolean(data.HeroItems && data.HeroItems.length > 0);
    var hasSections = Boolean(data.Sections && data.Sections.length > 0);
    return hasHero || hasSections;
  }

  function readCachedHome(uid) {
    if (!uid) return null;
    try {
      var raw = window.localStorage.getItem(HOME_CACHE_PREFIX + normalizeItemId(uid));
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !hasHomePayloadContent(parsed.data) || !parsed.savedAt) return null;
      var age = Date.now() - parsed.savedAt;
      if (age > HOME_STALE_MS) return null;
      return {
        data: parsed.data,
        savedAt: parsed.savedAt,
        fresh: age <= HOME_FRESH_MS
      };
    } catch (_) {
      return null;
    }
  }

  function writeCachedHome(uid, data) {
    if (!uid || !hasHomePayloadContent(data)) return;
    try {
      window.localStorage.setItem(
        HOME_CACHE_PREFIX + normalizeItemId(uid),
        JSON.stringify({ savedAt: Date.now(), data: data })
      );
    } catch (_) {
      // Ignore quota / privacy mode storage errors
    }
  }

  function invalidateCachedHome(uid) {
    if (!uid) return;
    try {
      window.localStorage.removeItem(HOME_CACHE_PREFIX + normalizeItemId(uid));
    } catch (_) {
      // Ignore storage errors
    }
  }

  // --- 02-stability.js ---
// ------------------------------------------------------------------------
  // Stability Fixes: Backdrop DOM Leak Prune, Dashboard Back Fix, TV Guide Scroll
  // ------------------------------------------------------------------------
  function attachBackdropPruneObserver(container) {
    if (!container || container.getAttribute('data-prism-backdrop-prune') === '1') {
      return;
    }
    container.setAttribute('data-prism-backdrop-prune', '1');

    var prune = function () {
      while (container.children.length > 2) {
        container.removeChild(container.firstElementChild);
      }
    };

    prune();
    var observer = new MutationObserver(prune);
    observer.observe(container, { childList: true });
  }

  function ensureBackdropLeakFix() {
    var containers = document.querySelectorAll('.backdropContainer');
    for (var i = 0; i < containers.length; i += 1) {
      attachBackdropPruneObserver(containers[i]);
    }
  }

  function initDashboardBackButtonFix() {
    document.addEventListener('click', function (e) {
      if (!state.config.enablePlugin || !isDashboardRoute()) return;
      var btn = e.target && e.target.closest
        ? e.target.closest('header .MuiIconButton-root, header button.MuiButtonBase-root, .skinHeader .headerBackButton')
        : null;
      if (!btn) return;

      var label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
      var isBackIcon = Boolean(
        btn.classList.contains('headerBackButton')
        || btn.querySelector('[data-testid="ArrowBackIcon"], [data-testid="ArrowBackIosNewIcon"], .arrow_back')
        || label.indexOf('back') !== -1
      );
      if (!isBackIcon) return;

      var idx = window.history.state && typeof window.history.state.idx === 'number'
        ? window.history.state.idx
        : null;
      if (idx === 0 || window.history.length <= 1) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (window.Dashboard && typeof window.Dashboard.navigate === 'function') {
          window.Dashboard.navigate('/home');
        } else {
          window.location.hash = '#/home';
        }
      }
    }, true);
  }

  // Live TV Guide Vertical Scroll Fix (#5705)
  function ensureGuideCellVisible(el) {
    if (!el || !state.config.enableTvGuideScrollFix) return;
    var scroller = el.closest('.guideVerticalScroller');
    if (!scroller) return;

    var pad = 76;
    var elRect = el.getBoundingClientRect();
    var scRect = scroller.getBoundingClientRect();

    if (scroller.scrollHeight > scroller.clientHeight + 4) {
      if (elRect.bottom > scRect.bottom - pad) {
        scroller.scrollTop += (elRect.bottom - scRect.bottom + pad);
      } else if (elRect.top < scRect.top + pad) {
        scroller.scrollTop -= (scRect.top + pad - elRect.top);
      }
    } else if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function findAdjacentGuideCell(currentCell, direction) {
    if (currentCell.classList.contains('guide-channelHeaderCell')) {
      var headers = Array.prototype.slice.call(
        document.querySelectorAll('.tvguide .guide-channelHeaderCell')
      );
      var idx = headers.indexOf(currentCell);
      if (idx === -1) return null;
      return headers[idx + direction] || null;
    }

    if (currentCell.classList.contains('programCell')) {
      var row = currentCell.closest('.channelPrograms');
      if (!row) return null;
      var targetRow = direction > 0 ? row.nextElementSibling : row.previousElementSibling;
      while (targetRow && !targetRow.classList.contains('channelPrograms')) {
        targetRow = direction > 0 ? targetRow.nextElementSibling : targetRow.previousElementSibling;
      }
      if (!targetRow) return null;

      var curRect = currentCell.getBoundingClientRect();
      var curMidX = curRect.left + curRect.width / 2;
      var candidates = targetRow.querySelectorAll('.programCell');
      var best = null;
      var bestDist = Infinity;

      for (var i = 0; i < candidates.length; i += 1) {
        var r = candidates[i].getBoundingClientRect();
        if (curMidX >= r.left && curMidX <= r.right) {
          return candidates[i];
        }
        var dist = Math.abs(r.left + r.width / 2 - curMidX);
        if (dist < bestDist) {
          bestDist = dist;
          best = candidates[i];
        }
      }
      return best;
    }

    return null;
  }

  function initTvGuideScrollFix() {
    document.addEventListener('focusin', function (e) {
      if (!state.config.enableTvGuideScrollFix) return;
      var target = e.target && e.target.closest
        ? e.target.closest('.tvguide .guide-channelHeaderCell, .tvguide .programCell')
        : null;
      if (target) {
        ensureGuideCellVisible(target);
      }
    }, true);

    document.addEventListener('keydown', function (e) {
      if (!state.config.enableTvGuideScrollFix) return;
      var isDown = e.key === 'ArrowDown' || e.keyCode === 40;
      var isUp = e.key === 'ArrowUp' || e.keyCode === 38;
      if (!isDown && !isUp) return;

      var active = document.activeElement;
      var cell = active && active.closest
        ? active.closest('.tvguide .guide-channelHeaderCell, .tvguide .programCell')
        : null;
      if (!cell) return;

      var direction = isDown ? 1 : -1;
      var prevActive = active;

      window.setTimeout(function () {
        if (document.activeElement === prevActive) {
          var nextCell = findAdjacentGuideCell(cell, direction);
          if (nextCell) {
            try {
              nextCell.focus({ preventScroll: true });
            } catch (_) {
              nextCell.focus();
            }
            ensureGuideCellVisible(nextCell);
          }
        } else if (document.activeElement) {
          ensureGuideCellVisible(document.activeElement);
        }
      }, 35);
    }, true);
  }

  function isFocusInvalid() {
    var active = document.activeElement;
    return !active
      || active === document.body
      || active === document.documentElement
      || active.classList.contains('page')
      || active.offsetParent === null;
  }

  function findFirstVisibleHomeTarget() {
    var selectors = [
      '#slides-container[data-prism-injected="true"] .play-button',
      '.page:not(.hide) .homeSectionsContainer .card[tabindex="0"]',
      '.page:not(.hide) .homeSectionsContainer .card',
      '.page:not(.hide) .homeSectionsContainer .prism-theme-tile',
      '.page:not(.hide) .card[tabindex="0"]',
      '.page:not(.hide) button:not([tabindex="-1"]), .page:not(.hide) a[href]',
      '.MuiAppBar-root button, .skinHeader button'
    ];
    for (var s = 0; s < selectors.length; s += 1) {
      var nodes = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < nodes.length; i += 1) {
        if (nodes[i] && nodes[i].offsetParent !== null) {
          return nodes[i];
        }
      }
    }
    return null;
  }

  function focusFirstHomeTarget() {
    if (!isTvLayout() || !isHomeRoute() || !isFocusInvalid()) {
      return;
    }
    var target = findFirstVisibleHomeTarget();
    if (target) {
      try {
        target.focus({ preventScroll: true });
      } catch (_) {
        target.focus();
      }
    }
  }

  function initTvLaunchFocusRescue() {
    document.addEventListener('keydown', function (e) {
      if (!isTvLayout()) return;
      var code = e.keyCode;
      var key = e.key || '';
      var isArrow = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight'
        || code === 37 || code === 38 || code === 39 || code === 40;
      if (!isArrow || !isFocusInvalid()) return;

      var target = findFirstVisibleHomeTarget();
      if (target) {
        e.preventDefault();
        try {
          target.focus({ preventScroll: true });
        } catch (_) {
          target.focus();
        }
      }
    }, true);
  }

  // Desktop Hamburger Menu & Slide-Out Navigation Drawer
  var NAV_ICONS = {
    menu: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
    favorite: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 21.35-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z"/></svg>',
    movies: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m18 4 2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>',
    tvshows: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>',
    livetv: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2zm0 14H3V8h18v12zM9 10v8l7-4z"/></svg>',
    playlists: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
    dashboard: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>'
  };

  function isLoginRoute() {
    var hash = (window.location.hash || '').toLowerCase();
    return hash.indexOf('#/login') === 0 || hash.indexOf('#!/login') === 0;
  }

  function buildLibraryNavHref(view) {
    var serverId = window.ApiClient && typeof window.ApiClient.serverId === 'function'
      ? window.ApiClient.serverId()
      : '';
    var id = view.Id;
    var type = String(view.CollectionType || '').toLowerCase();
    if (type === 'movies') return '#/movies?topParentId=' + encodeURIComponent(id) + '&collectionType=movies';
    if (type === 'tvshows') return '#/tv?topParentId=' + encodeURIComponent(id) + '&collectionType=tvshows';
    if (type === 'music') return '#/music?topParentId=' + encodeURIComponent(id) + '&collectionType=music';
    if (type === 'playlists') return '#/playlists?topParentId=' + encodeURIComponent(id) + '&collectionType=playlists';
    if (type === 'livetv') return '#/livetv?collectionType=livetv';
    return '#/list?parentId=' + encodeURIComponent(id) + (serverId ? '&serverId=' + encodeURIComponent(serverId) : '');
  }

  function getServerBrandTitle() {
    if (window.ApiClient) {
      if (typeof window.ApiClient.serverName === 'function') {
        var n = window.ApiClient.serverName();
        if (n) return n;
      }
      if (window.ApiClient._serverInfo && window.ApiClient._serverInfo.Name) {
        return window.ApiClient._serverInfo.Name;
      }
    }
    return 'Jellyfin';
  }

  function isNavHrefActive(href) {
    var cur = (window.location.hash || '#/home').toLowerCase();
    if (href === '#/home') {
      return (cur === '' || cur === '#' || cur === '#/' || cur === '#/home' || cur.indexOf('#/home?') === 0)
        && cur.indexOf('tab=1') === -1;
    }
    if (href === '#/home?tab=1') {
      return cur.indexOf('#/home') === 0 && cur.indexOf('tab=1') !== -1;
    }
    return cur.indexOf(href.toLowerCase()) === 0;
  }

  function fetchNavViewsAndUser(uid) {
    var now = Date.now();
    var viewsPromise;
    if (state.navViewsCache && now - state.navViewsFetchedAt < 60000) {
      viewsPromise = Promise.resolve(state.navViewsCache);
    } else if (window.ApiClient && typeof window.ApiClient.getUserViews === 'function') {
      viewsPromise = window.ApiClient.getUserViews({}, uid).then(function (res) {
        var items = (res && res.Items) || [];
        state.navViewsCache = items;
        state.navViewsFetchedAt = Date.now();
        return items;
      }).catch(function () {
        return state.navViewsCache || [];
      });
    } else {
      viewsPromise = Promise.resolve([]);
    }

    var userPromise = window.ApiClient && typeof window.ApiClient.getCurrentUser === 'function'
      ? window.ApiClient.getCurrentUser().catch(function () { return null; })
      : Promise.resolve(null);

    return Promise.all([viewsPromise, userPromise]);
  }

  function renderPrismNavDrawerLinks(container, views, user) {
    var html = '<div class="prism-nav-section-label">Browse</div>';
    var primary = [
      { label: 'Home', href: '#/home', icon: NAV_ICONS.home },
      { label: 'Favorites', href: '#/home?tab=1', icon: NAV_ICONS.favorite }
    ];

    for (var i = 0; i < primary.length; i += 1) {
      var p = primary[i];
      html +=
        '<a class="prism-nav-link' + (isNavHrefActive(p.href) ? ' is-active' : '') + '" href="' + escapeHtml(p.href) + '">' +
          p.icon +
          '<span>' + escapeHtml(p.label) + '</span>' +
        '</a>';
    }

    if (views && views.length > 0) {
      html += '<div class="prism-nav-section-label">Libraries</div>';
      for (var v = 0; v < views.length; v += 1) {
        var view = views[v];
        var type = String(view.CollectionType || '').toLowerCase();
        var icon = NAV_ICONS[type] || NAV_ICONS.folder;
        var href = buildLibraryNavHref(view);
        html +=
          '<a class="prism-nav-link' + (isNavHrefActive(href) ? ' is-active' : '') + '" href="' + escapeHtml(href) + '">' +
            icon +
            '<span>' + escapeHtml(view.Name) + '</span>' +
          '</a>';
      }
    }

    html += '<div class="prism-nav-section-label">Account</div>';
    html +=
      '<a class="prism-nav-link' + (isNavHrefActive('#/mypreferencesmenu') ? ' is-active' : '') + '" href="#/mypreferencesmenu">' +
        NAV_ICONS.settings +
        '<span>Settings</span>' +
      '</a>';

    if (user && user.Policy && user.Policy.IsAdministrator) {
      html +=
        '<a class="prism-nav-link' + (isNavHrefActive('#/dashboard') ? ' is-active' : '') + '" href="#/dashboard">' +
          NAV_ICONS.dashboard +
          '<span>Dashboard</span>' +
        '</a>';
    }

    container.innerHTML = html;
  }

  function closePrismNavDrawer() {
    state.navDrawerOpen = false;
    var drawer = document.getElementById('prism-nav-drawer');
    if (drawer) {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
    }
  }

  function openPrismNavDrawer() {
    var drawer = document.getElementById('prism-nav-drawer');
    if (!drawer) {
      drawer = document.createElement('div');
      drawer.id = 'prism-nav-drawer';
      drawer.setAttribute('aria-hidden', 'true');
      drawer.innerHTML =
        '<div class="prism-nav-backdrop"></div>' +
        '<nav class="prism-nav-panel" aria-label="Primary Navigation">' +
          '<div class="prism-nav-header">' +
            '<div class="prism-nav-brand"></div>' +
            '<button type="button" class="prism-nav-close" aria-label="Close Menu">&times;</button>' +
          '</div>' +
          '<div class="prism-nav-links"></div>' +
        '</nav>';
      document.body.appendChild(drawer);

      drawer.querySelector('.prism-nav-backdrop').addEventListener('click', closePrismNavDrawer);
      drawer.querySelector('.prism-nav-close').addEventListener('click', closePrismNavDrawer);
      drawer.querySelector('.prism-nav-links').addEventListener('click', function (e) {
        var link = e.target && e.target.closest ? e.target.closest('a.prism-nav-link') : null;
        if (link) {
          closePrismNavDrawer();
        }
      });

      document.addEventListener('keydown', function (e) {
        if (state.navDrawerOpen && (e.key === 'Escape' || e.keyCode === 27)) {
          closePrismNavDrawer();
        }
      });
    }

    drawer.querySelector('.prism-nav-brand').textContent = getServerBrandTitle();
    var linksEl = drawer.querySelector('.prism-nav-links');
    renderPrismNavDrawerLinks(linksEl, state.navViewsCache || [], null);

    state.navDrawerOpen = true;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');

    var uid = window.ApiClient && typeof window.ApiClient.getCurrentUserId === 'function'
      ? window.ApiClient.getCurrentUserId()
      : null;
    if (uid) {
      fetchNavViewsAndUser(uid).then(function (res) {
        if (state.navDrawerOpen && document.body.contains(linksEl)) {
          renderPrismNavDrawerLinks(linksEl, res[0], res[1]);
        }
      });
    }
  }

  function syncDesktopHamburgerMenu() {
    var uid = window.ApiClient && typeof window.ApiClient.getCurrentUserId === 'function'
      ? window.ApiClient.getCurrentUserId()
      : null;
    var active = Boolean(
      state.config.enablePlugin
      && state.config.enableDesktopHamburger
      && !isTvLayout()
      && !isDashboardRoute()
      && !isLoginRoute()
      && uid
      && window.innerWidth >= 900
    );

    var wasActive = document.documentElement.classList.contains('prism-hamburger-active');
    document.documentElement.classList.toggle('prism-hamburger-active', active);

    if (!active) {
      var staleBtns = document.querySelectorAll('[data-prism-hamburger="1"]');
      for (var i = 0; i < staleBtns.length; i += 1) {
        if (staleBtns[i].parentNode) staleBtns[i].parentNode.removeChild(staleBtns[i]);
      }
      var taggedToolbars = document.querySelectorAll('[data-prism-nav-toolbar="1"]');
      for (var j = 0; j < taggedToolbars.length; j += 1) {
        taggedToolbars[j].removeAttribute('data-prism-nav-toolbar');
      }
      closePrismNavDrawer();
      if (wasActive) syncHeaderMetrics();
      return;
    }

    var toolbar = document.querySelector('.MuiAppBar-root > .MuiToolbar-root')
      || document.querySelector('.MuiAppBar-root .MuiToolbar-root');
    if (!toolbar) return;
    if (toolbar.getAttribute('data-prism-nav-toolbar') !== '1') {
      toolbar.setAttribute('data-prism-nav-toolbar', '1');
    }

    var nativeBtn = toolbar.querySelector('button[aria-label="Open Menu"]:not([data-prism-hamburger])');
    if (nativeBtn && nativeBtn.offsetParent !== null) {
      return;
    }

    if (!toolbar.querySelector('[data-prism-hamburger="1"]')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'prism-hamburger-btn';
      btn.setAttribute('data-prism-hamburger', '1');
      btn.setAttribute('aria-label', 'Open Navigation Menu');
      btn.title = 'Menu';
      btn.innerHTML = NAV_ICONS.menu;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openPrismNavDrawer();
      });
      toolbar.insertBefore(btn, toolbar.firstChild);
      syncHeaderMetrics();
    } else if (!wasActive) {
      syncHeaderMetrics();
    }
  }

  // --- 03-ambient-detail.js ---
// ------------------------------------------------------------------------
  // Header Metrics, Dynamic Ambient Color Extraction, Detail Backdrop & Watchlist Button
  // ------------------------------------------------------------------------
  function syncHeroTopPull() {
    var hero = document.querySelector('#slides-container[data-prism-injected="true"]');
    if (!hero) {
      document.documentElement.style.removeProperty('--prism-hero-pull');
      return;
    }

    var page = hero.closest('.page');
    var scrollTop = (window.scrollY || window.pageYOffset || 0) + (page ? page.scrollTop : 0);
    if (scrollTop > 2) {
      return;
    }

    var rootStyle = document.documentElement.style;
    var currentPull = parseFloat(rootStyle.getPropertyValue('--prism-hero-pull'));
    if (!Number.isFinite(currentPull)) {
      currentPull = parseFloat(rootStyle.getPropertyValue('--prism-header-offset')) || 64;
    }

    var rect = hero.getBoundingClientRect();
    var naturalTop = rect.top + currentPull;
    if (Number.isFinite(naturalTop) && naturalTop >= 0) {
      var clamped = Math.max(0, Math.min(160, Math.round(naturalTop)));
      rootStyle.setProperty('--prism-hero-pull', clamped + 'px');
    }
  }

  function syncHeaderMetrics() {
    var header = document.querySelector('.MuiAppBar-root') || document.querySelector('.skinHeader');
    var h = header && header.offsetHeight ? header.offsetHeight : 64;
    if (h < 48) h = 48;
    if (h > 112) h = 112;
    document.documentElement.style.setProperty('--prism-header-offset', h + 'px');
    syncHeroTopPull();
  }

  function syncScrollState(evt) {
    var y = window.scrollY || window.pageYOffset || 0;
    if (evt && evt.target && typeof evt.target.scrollTop === 'number' && evt.target !== document) {
      if (evt.target.scrollTop > y) {
        y = evt.target.scrollTop;
      }
    } else {
      var activePage = document.querySelector('.page:not(.hide)');
      if (activePage && activePage.scrollTop > y) {
        y = activePage.scrollTop;
      }
    }
    document.documentElement.classList.toggle('prism-at-top', y < 40);
  }

  function syncPageHeroClasses() {
    var hasHero = false;
    var onHome = isHomeRoute();
    document.documentElement.classList.toggle('prism-home-route', onHome);

    if (onHome) {
      var activeHome = getActiveHomePage();
      hasHero = Boolean(activeHome && activeHome.page && activeHome.page.querySelector('#slides-container[data-prism-injected="true"]'));
    } else if (isDetailsRoute()) {
      var pages = document.querySelectorAll('.itemDetailPage');
      for (var i = 0; i < pages.length; i += 1) {
        if (!pages[i].classList.contains('hide') && pages[i].classList.contains('has-prism-backdrop')) {
          hasHero = true;
          break;
        }
      }
    }
    document.documentElement.classList.toggle('prism-hero-page', hasHero);
    syncHeroTopPull();
    syncScrollState();
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h = 0;
    var s = 0;
    var l = (max + min) / 2;

    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) {
        h = (g - b) / d + (g < b ? 6 : 0);
      } else if (max === g) {
        h = (b - r) / d + 2;
      } else {
        h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  function hslToRgb(h, s, l) {
    var r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  function rgbToHex(rgb) {
    return '#' + rgb.map(function (v) {
      var hex = Math.max(0, Math.min(255, v)).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  function setAmbientPalette(palette) {
    var rootStyle = document.documentElement.style;
    if (!palette) {
      rootStyle.removeProperty('--prism-dynamic-1');
      rootStyle.removeProperty('--prism-dynamic-2');
      rootStyle.removeProperty('--prism-dynamic-rgb');
      rootStyle.removeProperty('--prism-dynamic-2-rgb');
      return;
    }
    rootStyle.setProperty('--prism-dynamic-1', palette.hex1);
    rootStyle.setProperty('--prism-dynamic-2', palette.hex2);
    rootStyle.setProperty('--prism-dynamic-rgb', palette.rgb1);
    rootStyle.setProperty('--prism-dynamic-2-rgb', palette.rgb2);
  }

  function resetAmbientColor() {
    state.activeColorKey = null;
    setAmbientPalette(null);
  }

  function extractDominantPalette(img) {
    var canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 9;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, 16, 9);
    var data = ctx.getImageData(0, 0, 16, 9).data;

    var buckets = [];
    for (var b = 0; b < 12; b += 1) {
      buckets.push({ weight: 0, hueSum: 0, satSum: 0, lightSum: 0 });
    }

    for (var i = 0; i < data.length; i += 4) {
      var hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      var h = hsl[0];
      var s = hsl[1];
      var l = hsl[2];
      if (l < 0.14 || l > 0.88 || s < 0.16) continue;

      var weight = s * (1 - Math.abs(l - 0.5) * 1.1);
      if (weight <= 0) continue;

      var bucketIdx = Math.floor(h * 12) % 12;
      buckets[bucketIdx].weight += weight;
      buckets[bucketIdx].hueSum += h * weight;
      buckets[bucketIdx].satSum += s * weight;
      buckets[bucketIdx].lightSum += l * weight;
    }

    var best = null;
    for (var k = 0; k < buckets.length; k += 1) {
      if (buckets[k].weight > 0 && (!best || buckets[k].weight > best.weight)) {
        best = buckets[k];
      }
    }
    if (!best) return null;

    var avgH = best.hueSum / best.weight;
    var avgS = Math.max(0.68, Math.min(0.88, best.satSum / best.weight + 0.15));
    var avgL = Math.max(0.56, Math.min(0.64, best.lightSum / best.weight));

    var companionH = (avgH + 34 / 360) % 1;
    var rgb1Arr = hslToRgb(avgH, avgS, avgL);
    var rgb2Arr = hslToRgb(companionH, 0.84, 0.62);

    return {
      hex1: rgbToHex(rgb1Arr),
      hex2: rgbToHex(rgb2Arr),
      rgb1: rgb1Arr.join(', '),
      rgb2: rgb2Arr.join(', ')
    };
  }

  function applyAmbientColorForUrl(cacheKey, imgUrl) {
    if (!state.config.enablePlugin || !state.config.enableDynamicAmbientColor) {
      resetAmbientColor();
      return;
    }
    state.activeColorKey = cacheKey;

    if (state.colorCache[cacheKey]) {
      setAmbientPalette(state.colorCache[cacheKey]);
      return;
    }

    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      if (state.activeColorKey !== cacheKey) return;
      try {
        var palette = extractDominantPalette(img);
        if (palette) {
          state.colorCache[cacheKey] = palette;
          setAmbientPalette(palette);
        } else {
          setAmbientPalette(null);
        }
      } catch (_) {
        setAmbientPalette(null);
      }
    };
    img.onerror = function () {
      if (state.activeColorKey === cacheKey) {
        setAmbientPalette(null);
      }
    };
    img.src = imgUrl;
  }

  function syncDetailWatchlistButton(activePage, itemId) {
    if (!activePage || !itemId) return;
    var existing = activePage.querySelector('.prism-detail-watchlist-btn');
    if (!state.config.enablePlugin || !state.config.enableWatchlist) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return;
    }

    var host = activePage.querySelector('.mainDetailButtons');
    if (!host) return;

    var active = isItemWatchlisted(itemId);
    if (!existing) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emby-button prism-watchlist-btn prism-detail-watchlist-btn';
      btn.setAttribute('data-prism-wl-id', normalizeItemId(itemId));
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleWatchlistItem(itemId);
      });

      var anchor = host.querySelector('.btnResume') || host.querySelector('.btnPlay');
      if (anchor && anchor.nextSibling) {
        host.insertBefore(btn, anchor.nextSibling);
      } else {
        host.appendChild(btn);
      }
      existing = btn;
    } else {
      existing.setAttribute('data-prism-wl-id', normalizeItemId(itemId));
    }

    existing.classList.toggle('is-active', active);
    existing.setAttribute('aria-pressed', active ? 'true' : 'false');
    existing.innerHTML = renderWatchlistSvg(active) + '<span>' + (active ? 'In Watchlist' : 'Watchlist') + '</span>';
  }

  function tryEnhanceDetailPage() {
    if (!isDetailsRoute()) {
      return;
    }

    var itemId = getDetailItemId();
    if (!itemId) return;

    var pages = document.querySelectorAll('.itemDetailPage');
    var activePage = null;
    for (var i = 0; i < pages.length; i += 1) {
      if (!pages[i].classList.contains('hide')) {
        activePage = pages[i];
        break;
      }
    }
    if (!activePage) return;

    syncDetailWatchlistButton(activePage, itemId);

    if (!state.config.enablePlugin || !state.config.enableDetailBackdrop) {
      var old = activePage.querySelector('.prism-detail-backdrop');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      activePage.classList.remove('has-prism-backdrop');
      syncPageHeroClasses();
      return;
    }

    if (activePage.getAttribute('data-prism-detail-id') === itemId) {
      syncHeaderMetrics();
      syncPageHeroClasses();
      if (activePage.classList.contains('has-prism-backdrop')) {
        var existingLayer = activePage.querySelector('.prism-detail-backdrop');
        var backdropId = (existingLayer && existingLayer.getAttribute('data-prism-backdrop-id')) || itemId;
        applyAmbientColorForUrl('detail-' + backdropId, buildImageUrl(backdropId, 'Backdrop', 64));
      }
      return;
    }

    activePage.setAttribute('data-prism-detail-id', itemId);
    var stale = activePage.querySelector('.prism-detail-backdrop');
    if (stale && stale.parentNode) {
      stale.parentNode.removeChild(stale);
    }
    activePage.classList.remove('has-prism-backdrop');

    var layer = document.createElement('div');
    layer.className = 'prism-detail-backdrop';
    layer.setAttribute('data-prism-backdrop-id', itemId);

    var img = document.createElement('img');
    img.alt = '';
    img.loading = 'eager';
    layer.appendChild(img);

    activePage.insertBefore(layer, activePage.firstChild);

    var currentBackdropId = itemId;
    var triedParentFallback = false;

    img.onload = function () {
      if (!document.body.contains(activePage) || activePage.getAttribute('data-prism-detail-id') !== itemId) {
        return;
      }
      activePage.classList.add('has-prism-backdrop');
      syncHeaderMetrics();
      syncPageHeroClasses();
      applyAmbientColorForUrl('detail-' + currentBackdropId, buildImageUrl(currentBackdropId, 'Backdrop', 64));
    };

    img.onerror = function () {
      if (!triedParentFallback && window.ApiClient && typeof window.ApiClient.getItem === 'function') {
        triedParentFallback = true;
        var uid = typeof window.ApiClient.getCurrentUserId === 'function' ? window.ApiClient.getCurrentUserId() : null;
        if (uid) {
          window.ApiClient.getItem(uid, itemId).then(function (item) {
            if (!document.body.contains(activePage) || activePage.getAttribute('data-prism-detail-id') !== itemId) {
              return;
            }
            var fallbackId = item && (item.ParentBackdropItemId || item.SeriesId || item.ParentId);
            if (fallbackId && fallbackId !== currentBackdropId) {
              currentBackdropId = fallbackId;
              layer.setAttribute('data-prism-backdrop-id', fallbackId);
              img.src = buildImageUrl(fallbackId, 'Backdrop', 1920);
              return;
            }
            if (layer.parentNode) layer.parentNode.removeChild(layer);
            activePage.classList.remove('has-prism-backdrop');
            resetAmbientColor();
            syncPageHeroClasses();
          }).catch(function () {
            if (layer.parentNode) layer.parentNode.removeChild(layer);
            activePage.classList.remove('has-prism-backdrop');
            resetAmbientColor();
            syncPageHeroClasses();
          });
          return;
        }
      }
      if (layer.parentNode) layer.parentNode.removeChild(layer);
      activePage.classList.remove('has-prism-backdrop');
      resetAmbientColor();
      syncPageHeroClasses();
    };

    img.src = buildImageUrl(itemId, 'Backdrop', 1920);
  }

  // --- 04-spotlight.js ---
// ------------------------------------------------------------------------
  // Hero Spotlight & Inline Discovery Spotlight Banners
  // ------------------------------------------------------------------------
  function renderWatchlistSvg(active) {
    if (active) {
      return '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>';
  }

  function clearHeroSpotlightTimers() {
    if (state.slideTimer) {
      window.clearTimeout(state.slideTimer);
      state.slideTimer = null;
    }
  }

  function clearInlineSpotlights() {
    var keys = Object.keys(state.inlineTimers);
    for (var i = 0; i < keys.length; i += 1) {
      window.clearTimeout(state.inlineTimers[keys[i]]);
    }
    state.inlineTimers = {};
    state.inlineVisMap = {};
    if (state.inlineObserver) {
      state.inlineObserver.disconnect();
      state.inlineObserver = null;
    }
  }

  function getSharedInlineObserver() {
    if (state.inlineObserver || typeof window.IntersectionObserver !== 'function') {
      return state.inlineObserver;
    }
    state.inlineObserver = new window.IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i += 1) {
        var entry = entries[i];
        var sid = entry.target && entry.target.getAttribute('data-prism-section-id');
        if (sid) {
          state.inlineVisMap[sid] = Boolean(entry.isIntersecting);
        }
      }
    }, { threshold: 0.2 });
    return state.inlineObserver;
  }

  function buildPillsHtml(item) {
    var pills = [];
    if (item.ProductionYear) pills.push('<span>' + escapeHtml(item.ProductionYear) + '</span>');
    if (item.RunTimeMinutes) pills.push('<span>' + escapeHtml(item.RunTimeMinutes) + 'm</span>');
    if (item.CommunityRating) pills.push('<span>&#9733; ' + escapeHtml(item.CommunityRating) + '</span>');
    if (item.Badges && item.Badges.length > 0) {
      for (var b = 0; b < item.Badges.length; b += 1) {
        pills.push('<span class="genre-container">' + escapeHtml(item.Badges[b]) + '</span>');
      }
    } else {
      if (item.Is4k) pills.push('<span class="genre-container">4K</span>');
      if (item.IsHdr) pills.push('<span class="genre-container">HDR</span>');
    }
    return pills.join('<span>&bull;</span>');
  }

  function setupBackdropCrossfade(layerA, layerB, useLayerA, url, altText, enableKenBurns) {
    var activeLayer = useLayerA ? layerA : layerB;
    var inactiveLayer = useLayerA ? layerB : layerA;

    var activate = function () {
      activeLayer.alt = altText || '';
      activeLayer.classList.add('is-active');
      if (enableKenBurns && !isTvLayout()) {
        activeLayer.classList.remove('prism-kb-active');
        void activeLayer.offsetWidth;
        activeLayer.classList.add('prism-kb-active');
      } else {
        activeLayer.classList.remove('prism-kb-active');
      }
      inactiveLayer.classList.remove('is-active', 'prism-kb-active');
    };

    if (activeLayer.getAttribute('data-prism-src') === url) {
      activate();
      return;
    }

    activeLayer.setAttribute('data-prism-src', url);
    activeLayer.onload = function () {
      if (activeLayer.getAttribute('data-prism-src') === url) {
        activate();
      }
    };
    activeLayer.src = url;
    if (activeLayer.complete) {
      activate();
    }
  }

  function renderLogoOrTitle(container, item, headingTag) {
    var tag = headingTag || 'h2';
    if (item.HasLogo) {
      var logoUrl = buildImageUrl(item.Id, 'Logo', 520, item.LogoImageTag, 0);
      container.innerHTML =
        '<img class="prism-hero-logo" src="' + escapeHtml(logoUrl) + '" alt="' + escapeHtml(item.Name) + '" />' +
        '<' + tag + ' class="prism-hero-title" style="display:none;">' + escapeHtml(item.Name) + '</' + tag + '>';
      var logoImg = container.querySelector('.prism-hero-logo');
      var titleEl = container.querySelector('.prism-hero-title');
      if (logoImg && titleEl) {
        logoImg.addEventListener('error', function () {
          logoImg.style.display = 'none';
          titleEl.style.display = '';
        });
      }
    } else {
      container.innerHTML = '<' + tag + ' class="prism-hero-title">' + escapeHtml(item.Name) + '</' + tag + '>';
    }
  }

  function attachSwipeHandlers(targetEl, opts) {
    if (!targetEl || !opts) return;

    var tracking = false;
    var startX = 0;
    var startY = 0;
    var lastX = 0;
    var lastY = 0;
    var startTime = 0;
    var lockedAxis = null;
    var suppressClickUntil = 0;

    targetEl.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1 || opts.getCount() <= 1) {
        if (tracking) {
          tracking = false;
          lockedAxis = null;
          if (opts.onPauseChange) opts.onPauseChange(false);
        }
        return;
      }
      var touch = e.touches[0];
      tracking = true;
      lockedAxis = null;
      startX = touch.clientX;
      startY = touch.clientY;
      lastX = startX;
      lastY = startY;
      startTime = Date.now();
      if (opts.onPauseChange) opts.onPauseChange(true);
    }, { passive: true });

    targetEl.addEventListener('touchmove', function (e) {
      if (!tracking) return;
      if (!e.touches || e.touches.length !== 1) {
        tracking = false;
        lockedAxis = null;
        if (opts.onPauseChange) opts.onPauseChange(false);
        return;
      }
      var touch = e.touches[0];
      lastX = touch.clientX;
      lastY = touch.clientY;
      var dx = lastX - startX;
      var dy = lastY - startY;

      if (!lockedAxis && (dx * dx + dy * dy) > 100) {
        lockedAxis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      }

      if (lockedAxis === 'x' && e.cancelable) {
        e.preventDefault();
      }
    }, { passive: false });

    targetEl.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      if (opts.onPauseChange) opts.onPauseChange(false);

      var axis = lockedAxis;
      lockedAxis = null;
      if (axis !== 'x' || opts.getCount() <= 1) return;

      var pt = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
      var endX = pt ? pt.clientX : lastX;
      var endY = pt ? pt.clientY : lastY;
      var dx = endX - startX;
      var dy = endY - startY;
      var dt = Date.now() - startTime;
      var isSwipe = (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.2)
        || (Math.abs(dx) >= 28 && dt < 300 && Math.abs(dx) > Math.abs(dy) * 1.5);

      if (isSwipe) {
        suppressClickUntil = Date.now() + 350;
        if (dx < 0) {
          opts.onNext();
        } else {
          opts.onPrev();
        }
      }
    }, { passive: true });

    targetEl.addEventListener('touchcancel', function () {
      if (!tracking) return;
      tracking = false;
      lockedAxis = null;
      if (opts.onPauseChange) opts.onPauseChange(false);
    }, { passive: true });

    targetEl.addEventListener('click', function (e) {
      if (Date.now() < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }
      }
    }, true);
  }

  function renderHeroSpotlight(hostPage, heroItems) {
    if (!state.config.enableHeroSpotlight || !heroItems || heroItems.length === 0) {
      return;
    }

    var existing = hostPage.querySelector('#slides-container[data-prism-injected="true"]');
    if (existing) {
      var activeHero = heroItems[state.slideIndex % heroItems.length];
      if (activeHero) {
        applyAmbientColorForUrl('hero-' + activeHero.Id, buildImageUrl(activeHero.Id, 'Backdrop', 64, activeHero.BackdropImageTag, 0));
      }
      syncWatchlistButtonsInNode(existing);
      syncHeaderMetrics();
      syncPageHeroClasses();
      return;
    }

    clearHeroSpotlightTimers();

    var wrapper = document.createElement('div');
    wrapper.id = 'slides-container';
    wrapper.setAttribute('data-prism-injected', 'true');
    wrapper.innerHTML =
      '<div class="slide">' +
        '<img class="backdrop prism-backdrop-layer is-active" alt="" loading="eager" />' +
        '<img class="backdrop prism-backdrop-layer" alt="" loading="eager" />' +
        '<div class="backdrop-overlay"></div>' +
        '<div class="prism-hero-content">' +
          '<div class="prism-hero-reason" style="display:none;"></div>' +
          '<div class="logo-container"></div>' +
          '<div class="info-container"></div>' +
          '<p class="plot-container"></p>' +
          '<div class="button-container"></div>' +
        '</div>' +
      '</div>' +
      '<div class="hero-controls-right">' +
        '<button type="button" class="arrow-button prev" aria-label="Previous Slide">&#8249;</button>' +
        '<div class="dots-container"></div>' +
        '<button type="button" class="arrow-button next" aria-label="Next Slide">&#8250;</button>' +
      '</div>';

    var slideEl = wrapper.querySelector('.slide');
    var layers = slideEl.querySelectorAll('.prism-backdrop-layer');
    var layerA = layers[0];
    var layerB = layers[1];
    var reasonEl = slideEl.querySelector('.prism-hero-reason');
    var logoEl = slideEl.querySelector('.logo-container');
    var infoEl = slideEl.querySelector('.info-container');
    var plotEl = slideEl.querySelector('.plot-container');
    var btnWrap = slideEl.querySelector('.button-container');
    var dotsEl = wrapper.querySelector('.dots-container');
    var prevBtn = wrapper.querySelector('.arrow-button.prev');
    var nextBtn = wrapper.querySelector('.arrow-button.next');
    var paused = false;
    var touchPaused = false;
    var layerToggle = false;

    function scheduleNextHeroTick() {
      clearHeroSpotlightTimers();
      var currentItem = heroItems[state.slideIndex % heroItems.length];
      var hasSecondBackdrop = currentItem && currentItem.BackdropCount >= 2 && state.slideBackdropIndex === 0;
      var delay = hasSecondBackdrop ? 5000 : (currentItem && currentItem.BackdropCount >= 2 ? 5000 : 8000);

      state.slideTimer = window.setTimeout(function () {
        if (!document.body.contains(wrapper) || !isHomeRoute()) {
          clearHeroSpotlightTimers();
          return;
        }
        if (paused || touchPaused || document.hidden) {
          scheduleNextHeroTick();
          return;
        }
        if (hasSecondBackdrop) {
          drawSlide(state.slideIndex, 1);
        } else {
          drawSlide(state.slideIndex + 1, 0);
        }
      }, delay);
    }

    function drawSlide(idx, backdropIdx) {
      state.slideIndex = (idx + heroItems.length) % heroItems.length;
      var item = heroItems[state.slideIndex];
      var maxBg = item.BackdropCount >= 2 ? Math.min(2, item.BackdropCount) : 1;
      state.slideBackdropIndex = (backdropIdx || 0) % maxBg;

      var bgTag = (item.BackdropImageTags && item.BackdropImageTags[state.slideBackdropIndex])
        || item.BackdropImageTag
        || null;
      var bgUrl = buildImageUrl(item.Id, 'Backdrop', 1600, bgTag, state.slideBackdropIndex);

      layerToggle = !layerToggle;
      setupBackdropCrossfade(layerA, layerB, layerToggle, bgUrl, item.Name, true);

      if (state.slideBackdropIndex === 0 && maxBg > 1) {
        var preloadTag = item.BackdropImageTags && item.BackdropImageTags[1];
        var preloadImg = new Image();
        preloadImg.src = buildImageUrl(item.Id, 'Backdrop', 1600, preloadTag, 1);
      }

      if (backdropIdx == null || backdropIdx === 0 || !logoEl.firstChild) {
        if (item.ReasonTag) {
          reasonEl.textContent = item.ReasonTag;
          reasonEl.style.display = '';
        } else {
          reasonEl.style.display = 'none';
        }

        renderLogoOrTitle(logoEl, item, 'h2');
        infoEl.innerHTML = buildPillsHtml(item);
        plotEl.textContent = item.Overview || '';

        var wlHtml = '';
        if (state.config.enableWatchlist) {
          var isWl = isItemWatchlisted(item.Id);
          wlHtml =
            '<button type="button" class="detail-button prism-watchlist-btn' + (isWl ? ' is-active' : '') + '" data-prism-wl-id="' + escapeHtml(normalizeItemId(item.Id)) + '" aria-pressed="' + (isWl ? 'true' : 'false') + '">' +
              renderWatchlistSvg(isWl) +
              '<span>' + (isWl ? 'In Watchlist' : 'Watchlist') + '</span>' +
            '</button>';
        }

        btnWrap.innerHTML =
          '<button type="button" class="play-button" style="display:inline-flex;align-items:center;justify-content:center;gap:0.4rem;"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span>View &amp; Play</span></button>' +
          '<button type="button" class="detail-button">Details</button>' +
          wlHtml;

        var playBtn = btnWrap.querySelector('.play-button');
        var detailBtn = btnWrap.querySelector('.detail-button:not(.prism-watchlist-btn)');
        var wlBtn = btnWrap.querySelector('.prism-watchlist-btn');
        if (playBtn) playBtn.addEventListener('click', function () { navigateToItem(item.Id); });
        if (detailBtn) detailBtn.addEventListener('click', function () { navigateToItem(item.Id); });
        if (wlBtn) {
          wlBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleWatchlistItem(item.Id);
          });
        }

        var dotsHtml = '';
        for (var i = 0; i < heroItems.length; i += 1) {
          dotsHtml += '<button type="button" tabindex="-1" class="dot ' + (i === state.slideIndex ? 'active' : '') + '" data-slide-idx="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>';
        }
        dotsEl.innerHTML = dotsHtml;

        applyAmbientColorForUrl('hero-' + item.Id, buildImageUrl(item.Id, 'Backdrop', 64, item.BackdropImageTag, 0));
      }

      scheduleNextHeroTick();
    }

    prevBtn.addEventListener('click', function () { drawSlide(state.slideIndex - 1, 0); });
    nextBtn.addEventListener('click', function () { drawSlide(state.slideIndex + 1, 0); });
    dotsEl.addEventListener('click', function (e) {
      var dot = e.target && e.target.closest ? e.target.closest('[data-slide-idx]') : null;
      if (dot) drawSlide(Number(dot.getAttribute('data-slide-idx')), 0);
    });

    wrapper.addEventListener('keydown', function (e) {
      var key = e.key || '';
      var code = e.keyCode;
      var isRight = key === 'ArrowRight' || code === 39;
      var isLeft = key === 'ArrowLeft' || code === 37;
      var isDown = key === 'ArrowDown' || code === 40;
      var isUp = key === 'ArrowUp' || code === 38;

      if (!isRight && !isLeft && !isDown && !isUp) {
        return;
      }

      if (isUp) {
        var headerTarget = document.querySelector('.skinHeader .emby-tab-button-active, .skinHeader .emby-tab-button, .MuiAppBar-root button, .skinHeader button');
        if (headerTarget) {
          e.preventDefault();
          e.stopPropagation();
          headerTarget.focus();
        }
        return;
      }

      if (isDown) {
        var firstCard = hostPage.querySelector('.homeSectionsContainer .card[tabindex="0"], .homeSectionsContainer .card, .homeSectionsContainer .prism-theme-tile, .homeSectionsContainer button, .homeSectionsContainer a');
        if (firstCard) {
          e.preventDefault();
          e.stopPropagation();
          firstCard.focus();
        }
        return;
      }

      var focusables = [
        btnWrap.querySelector('.play-button'),
        btnWrap.querySelector('.detail-button:not(.prism-watchlist-btn)'),
        btnWrap.querySelector('.prism-watchlist-btn'),
        prevBtn,
        nextBtn
      ].filter(function (el) {
        return el && el.offsetParent !== null;
      });

      var idx = focusables.indexOf(document.activeElement);
      if (idx === -1) return;

      if (isRight && idx < focusables.length - 1) {
        e.preventDefault();
        e.stopPropagation();
        focusables[idx + 1].focus();
      } else if (isLeft && idx > 0) {
        e.preventDefault();
        e.stopPropagation();
        focusables[idx - 1].focus();
      }
    });

    wrapper.addEventListener('mouseenter', function () { paused = true; });
    wrapper.addEventListener('mouseleave', function () { paused = false; });
    wrapper.addEventListener('focusin', function () { paused = true; });
    wrapper.addEventListener('focusout', function () { paused = false; });

    attachSwipeHandlers(wrapper, {
      getCount: function () { return heroItems.length; },
      onNext: function () { drawSlide(state.slideIndex + 1, 0); },
      onPrev: function () { drawSlide(state.slideIndex - 1, 0); },
      onPauseChange: function (p) {
        touchPaused = p;
        if (!p) paused = false;
      }
    });

    drawSlide(state.slideIndex, 0);

    var sectionsContainer = hostPage.querySelector('.homeSectionsContainer');
    if (sectionsContainer && sectionsContainer.parentNode) {
      sectionsContainer.parentNode.insertBefore(wrapper, sectionsContainer);
    }

    syncHeaderMetrics();
    syncPageHeroClasses();
    syncHeroTopPull();
  }

  function renderInlineSpotlight(section) {
    var items = (section.Items || []).filter(function (x) { return x && x.HasBackdrop; });
    if (items.length === 0) {
      items = section.Items || [];
    }

    var el = document.createElement('div');
    el.className = 'verticalSection prism-home-section prism-inline-spotlight';
    el.setAttribute('data-prism-injected', 'true');
    el.setAttribute('data-prism-section-id', section.Id);

    el.innerHTML =
      '<div class="sectionTitleContainer sectionTitleContainer-cards prism-section-header">' +
        '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:0.45rem;">' +
          '<h2 class="sectionTitle sectionTitle-cards">' + escapeHtml(section.Title) + '</h2>' +
          (section.Badge ? '<span class="prism-section-pill">' + escapeHtml(section.Badge) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="prism-inline-spotlight-stage">' +
        '<img class="prism-backdrop-layer is-active" alt="" loading="lazy" />' +
        '<img class="prism-backdrop-layer" alt="" loading="lazy" />' +
        '<div class="prism-inline-scrim"></div>' +
        '<div class="prism-inline-content">' +
          '<div class="logo-container"></div>' +
          '<div class="info-container"></div>' +
          '<p class="plot-container"></p>' +
          '<div class="button-container"></div>' +
        '</div>' +
        '<div class="hero-controls-right">' +
          '<button type="button" class="arrow-button prev" aria-label="Previous">&#8249;</button>' +
          '<div class="dots-container"></div>' +
          '<button type="button" class="arrow-button next" aria-label="Next">&#8250;</button>' +
        '</div>' +
      '</div>';

    var stage = el.querySelector('.prism-inline-spotlight-stage');
    var layers = stage.querySelectorAll('.prism-backdrop-layer');
    var layerA = layers[0];
    var layerB = layers[1];
    var logoEl = stage.querySelector('.logo-container');
    var infoEl = stage.querySelector('.info-container');
    var plotEl = stage.querySelector('.plot-container');
    var btnWrap = stage.querySelector('.button-container');
    var dotsEl = stage.querySelector('.dots-container');
    var prevBtn = stage.querySelector('.arrow-button.prev');
    var nextBtn = stage.querySelector('.arrow-button.next');

    var slideIdx = 0;
    var paused = false;
    var touchPaused = false;
    var layerToggle = false;

    function scheduleInlineTick() {
      if (state.inlineTimers[section.Id]) {
        window.clearTimeout(state.inlineTimers[section.Id]);
      }
      state.inlineTimers[section.Id] = window.setTimeout(function () {
        if (!document.body.contains(el) || !isHomeRoute()) {
          delete state.inlineTimers[section.Id];
          return;
        }
        var visible = state.inlineVisMap[section.Id] !== false;
        if (!paused && !touchPaused && !document.hidden && visible && items.length > 1) {
          drawInline(slideIdx + 1);
        } else {
          scheduleInlineTick();
        }
      }, 9000);
    }

    function drawInline(idx) {
      if (items.length === 0) return;
      slideIdx = (idx + items.length) % items.length;
      var item = items[slideIdx];
      var bgUrl = item.HasBackdrop
        ? buildImageUrl(item.Id, 'Backdrop', 1400, item.BackdropImageTag, 0)
        : buildImageUrl(item.Id, 'Primary', 800, item.PrimaryImageTag, 0);

      layerToggle = !layerToggle;
      setupBackdropCrossfade(layerA, layerB, layerToggle, bgUrl, item.Name, false);
      renderLogoOrTitle(logoEl, item, 'h3');
      infoEl.innerHTML = buildPillsHtml(item);
      plotEl.textContent = item.Overview || '';

      var wlHtml = '';
      if (state.config.enableWatchlist) {
        var isWl = isItemWatchlisted(item.Id);
        wlHtml =
          '<button type="button" class="detail-button prism-watchlist-btn' + (isWl ? ' is-active' : '') + '" data-prism-wl-id="' + escapeHtml(normalizeItemId(item.Id)) + '" aria-pressed="' + (isWl ? 'true' : 'false') + '">' +
            renderWatchlistSvg(isWl) +
            '<span>' + (isWl ? 'In Watchlist' : 'Watchlist') + '</span>' +
          '</button>';
      }

      btnWrap.innerHTML =
        '<button type="button" class="play-button" style="display:inline-flex;align-items:center;justify-content:center;gap:0.4rem;"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span>View &amp; Play</span></button>' +
        '<button type="button" class="detail-button">Details</button>' +
        wlHtml;

      var playBtn = btnWrap.querySelector('.play-button');
      var detailBtn = btnWrap.querySelector('.detail-button:not(.prism-watchlist-btn)');
      var wlBtn = btnWrap.querySelector('.prism-watchlist-btn');
      if (playBtn) playBtn.addEventListener('click', function () { navigateToItem(item.Id); });
      if (detailBtn) detailBtn.addEventListener('click', function () { navigateToItem(item.Id); });
      if (wlBtn) {
        wlBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          toggleWatchlistItem(item.Id);
        });
      }

      var dotsHtml = '';
      for (var i = 0; i < items.length; i += 1) {
        dotsHtml += '<button type="button" tabindex="-1" class="dot ' + (i === slideIdx ? 'active' : '') + '" data-slide-idx="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>';
      }
      dotsEl.innerHTML = dotsHtml;

      scheduleInlineTick();
    }

    prevBtn.addEventListener('click', function () { drawInline(slideIdx - 1); });
    nextBtn.addEventListener('click', function () { drawInline(slideIdx + 1); });
    dotsEl.addEventListener('click', function (e) {
      var dot = e.target && e.target.closest ? e.target.closest('[data-slide-idx]') : null;
      if (dot) drawInline(Number(dot.getAttribute('data-slide-idx')));
    });

    stage.addEventListener('mouseenter', function () { paused = true; });
    stage.addEventListener('mouseleave', function () { paused = false; });
    stage.addEventListener('focusin', function () { paused = true; });
    stage.addEventListener('focusout', function () { paused = false; });

    attachSwipeHandlers(stage, {
      getCount: function () { return items.length; },
      onNext: function () { drawInline(slideIdx + 1); },
      onPrev: function () { drawInline(slideIdx - 1); },
      onPauseChange: function (p) {
        touchPaused = p;
        if (!p) paused = false;
      }
    });

    var obs = getSharedInlineObserver();
    if (obs) {
      obs.observe(el);
    }

    drawInline(0);
    return el;
  }

  // --- 05-sections-discovery.js ---
// ------------------------------------------------------------------------
  // Watchlist Sync, Home Sections, Thematic Modal & Hybrid Infinite Discovery
  // ------------------------------------------------------------------------
  function isItemWatchlisted(itemId) {
    var norm = normalizeItemId(itemId);
    return Boolean(norm && state.watchlistSet[norm]);
  }

  function seedWatchlistFromHome(data) {
    if (!data) return;
    var applyList = function (items) {
      if (!items) return;
      for (var i = 0; i < items.length; i += 1) {
        var norm = normalizeItemId(items[i].Id);
        if (norm && typeof items[i].IsWatchlisted === 'boolean') {
          if (items[i].IsWatchlisted) state.watchlistSet[norm] = true;
          else delete state.watchlistSet[norm];
        }
      }
    };
    applyList(data.HeroItems);
    if (data.Sections) {
      for (var s = 0; s < data.Sections.length; s += 1) {
        applyList(data.Sections[s].Items);
      }
    }
  }

  function syncWatchlistButtonsInNode(root) {
    var scope = root || document;
    var buttons = scope.querySelectorAll('[data-prism-wl-id]');
    for (var i = 0; i < buttons.length; i += 1) {
      var btn = buttons[i];
      var id = btn.getAttribute('data-prism-wl-id');
      var active = isItemWatchlisted(id);
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (btn.classList.contains('prism-card-wl-btn')) {
        btn.title = active ? 'Remove from Watchlist' : 'Add to Watchlist';
        btn.setAttribute('aria-label', btn.title);
        btn.innerHTML = renderWatchlistSvg(active);
      } else if (btn.classList.contains('prism-detail-watchlist-btn') || btn.classList.contains('prism-watchlist-btn')) {
        btn.innerHTML = renderWatchlistSvg(active) + '<span>' + (active ? 'In Watchlist' : 'Watchlist') + '</span>';
      }
    }
  }

  function fetchWatchlistIds(uid) {
    if (!state.config.enablePlugin || !state.config.enableWatchlist || !uid) return;
    if (!window.ApiClient || typeof window.ApiClient.getJSON !== 'function') return;
    if (state.watchlistLoadedFor === uid || state.watchlistInFlight) return;
    state.watchlistInFlight = true;

    window.ApiClient.getJSON(window.ApiClient.getUrl('Prism/Watchlist', { userId: uid }))
      .then(function (resp) {
        state.watchlistInFlight = false;
        state.watchlistLoadedFor = uid;
        var next = {};
        var ids = (resp && resp.Ids) || [];
        for (var i = 0; i < ids.length; i += 1) {
          var norm = normalizeItemId(ids[i]);
          if (norm) next[norm] = true;
        }
        state.watchlistSet = next;
        syncWatchlistButtonsInNode(document);
      })
      .catch(function () {
        state.watchlistInFlight = false;
      });
  }

  function toggleWatchlistItem(itemId) {
    if (!state.config.enablePlugin || !state.config.enableWatchlist || !itemId) return;
    if (!window.ApiClient || typeof window.ApiClient.ajax !== 'function') return;
    var uid = typeof window.ApiClient.getCurrentUserId === 'function' ? window.ApiClient.getCurrentUserId() : null;
    if (!uid) return;

    var norm = normalizeItemId(itemId);
    var prev = Boolean(state.watchlistSet[norm]);
    var next = !prev;

    if (next) state.watchlistSet[norm] = true;
    else delete state.watchlistSet[norm];
    syncWatchlistButtonsInNode(document);
    invalidateCachedHome(uid);

    window.ApiClient.ajax({
      type: 'POST',
      url: window.ApiClient.getUrl('Prism/Watchlist/' + encodeURIComponent(itemId), { userId: uid }),
      data: JSON.stringify({ IsWatchlisted: next }),
      contentType: 'application/json',
      dataType: 'json'
    }).then(function (resp) {
      if (resp && typeof resp.IsWatchlisted === 'boolean') {
        if (resp.IsWatchlisted) state.watchlistSet[norm] = true;
        else delete state.watchlistSet[norm];
        syncWatchlistButtonsInNode(document);
      }
      // Refresh cached Home data cleanly on next return to Home
      state.homeData = null;
    }).catch(function () {
      if (prev) state.watchlistSet[norm] = true;
      else delete state.watchlistSet[norm];
      syncWatchlistButtonsInNode(document);
    });
  }

  function badgeModifierClass(label) {
    var upper = String(label || '').toUpperCase();
    if (upper === '4K') return 'prism-badge--4k';
    if (upper === 'DV') return 'prism-badge--dv';
    if (upper.indexOf('HDR') === 0) return 'prism-badge--hdr';
    return 'prism-badge--audio';
  }

  function renderBadgePillsHtml(badges) {
    if (!state.config.enableMediaBadges || !badges || badges.length === 0) {
      return '';
    }
    var count = Math.min(2, badges.length);
    var html = '<div class="prism-card-badges">';
    for (var i = 0; i < count; i += 1) {
      var label = badges[i];
      html += '<span class="prism-badge ' + badgeModifierClass(label) + '">' + escapeHtml(label) + '</span>';
    }
    html += '</div>';
    return html;
  }

  function renderPosterOrThumbCardHtml(item, sectionCardFormat) {
    var isThumb = item.CardFormat === 'Thumb' || sectionCardFormat === 'Thumb';
    var imgWidth = isThumb ? 560 : 400;
    var imgUrl = isThumb && !item.HasPrimary && item.SeriesId
      ? buildImageUrl(item.SeriesId, 'Backdrop', imgWidth, item.BackdropImageTag, 0)
      : buildImageUrl(item.Id, 'Primary', imgWidth, item.PrimaryImageTag, 0);

    var secondaryText = '';
    if (item.Subtitle) {
      secondaryText = escapeHtml(item.Subtitle);
    } else {
      var subParts = [];
      if (item.ProductionYear) subParts.push(item.ProductionYear);
      if (item.CommunityRating) subParts.push('&#9733; ' + item.CommunityRating);
      if (!state.config.enableMediaBadges && item.Is4k) subParts.push('4K');
      secondaryText = subParts.join(' &bull; ');
    }

    var wlBtnHtml = '';
    if (state.config.enableWatchlist && item.Type !== 'Episode') {
      var norm = normalizeItemId(item.Id);
      var isWl = isItemWatchlisted(item.Id) || item.IsWatchlisted;
      wlBtnHtml =
        '<button type="button" tabindex="-1" class="prism-card-wl-btn' + (isWl ? ' is-active' : '') + '" data-prism-wl-id="' + escapeHtml(norm) + '" aria-pressed="' + (isWl ? 'true' : 'false') + '" title="' + (isWl ? 'Remove from Watchlist' : 'Add to Watchlist') + '" aria-label="' + (isWl ? 'Remove from Watchlist' : 'Add to Watchlist') + '">' +
          renderWatchlistSvg(isWl) +
        '</button>';
    }

    var cardClass = isThumb
      ? 'card overflowBackdropCard prism-card-thumb card-hoverable card-withuserdata'
      : 'card overflowPortraitCard card-hoverable card-withuserdata';
    var padderClass = isThumb
      ? 'cardPadder cardPadder-overflowBackdrop'
      : 'cardPadder cardPadder-overflowPortrait';

    return (
      '<div class="' + cardClass + '" tabindex="0" data-prism-item-id="' + escapeHtml(item.Id) + '" style="flex:0 0 auto;">' +
        '<div class="cardBox cardBox-bottompadded">' +
          '<div class="cardScalable">' +
            '<div class="' + padderClass + '"></div>' +
            '<div class="cardContent">' +
              '<div class="cardImageContainer coveredImage" style="background-image:url(\'' + escapeHtml(imgUrl) + '\');">' +
                '<div><img src="' + escapeHtml(imgUrl) + '" alt="' + escapeHtml(item.Name) + '" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" /></div>' +
              '</div>' +
            '</div>' +
            renderBadgePillsHtml(item.Badges) +
            wlBtnHtml +
            '<div class="cardOverlayContainer itemAction" style="position:absolute;inset:0;opacity:0;">' +
              '<a class="cardImageContainer" href="#/details?id=' + escapeHtml(item.Id) + '" aria-label="' + escapeHtml(item.Name) + '" style="position:absolute;inset:0;"></a>' +
              '<button type="button" class="cardOverlayFab-primary" aria-label="Play" style="z-index:2;width:52px;height:52px;padding:0;line-height:1;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;"><svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true" style="display:block;margin-left:2px;"><path d="M8 5v14l11-7z"/></svg></button>' +
            '</div>' +
          '</div>' +
          '<div class="cardFooter">' +
            '<div class="cardText cardText-first">' + escapeHtml(item.Name) + '</div>' +
            '<div class="cardText cardText-secondary">' + secondaryText + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderThematicGridSection(section) {
    var el = document.createElement('div');
    el.className = 'verticalSection prism-home-section prism-thematic-section';
    el.setAttribute('data-prism-injected', 'true');
    el.setAttribute('data-prism-section-id', section.Id);

    var tilesHtml = '';
    for (var i = 0; i < section.Items.length; i += 1) {
      var tile = section.Items[i];
      var accent = /^#[0-9a-f]{3,8}$/i.test(tile.AccentHex || '') ? tile.AccentHex : '#7C5CFF';
      var bgUrl = tile.HasBackdrop
        ? buildImageUrl(tile.Id, 'Backdrop', 720, tile.BackdropImageTag, 0)
        : buildImageUrl(tile.Id, 'Primary', 480, tile.PrimaryImageTag, 0);

      tilesHtml +=
        '<div class="prism-theme-tile" tabindex="0" role="button" data-prism-theme-id="' + escapeHtml(tile.ThemeId) + '" style="--prism-tile-accent:' + escapeHtml(accent) + ';">' +
          '<img class="prism-theme-tile-bg" src="' + escapeHtml(bgUrl) + '" alt="' + escapeHtml(tile.Name) + '" loading="lazy" />' +
          '<div class="prism-theme-tile-scrim"></div>' +
          '<div class="prism-theme-tile-body">' +
            '<div class="prism-theme-tile-group">' + escapeHtml(tile.Subtitle) + '</div>' +
            '<div class="prism-theme-tile-name">' + escapeHtml(tile.Name) + '</div>' +
            (tile.ItemCount ? '<div class="prism-theme-tile-count">' + escapeHtml(tile.ItemCount) + ' titles</div>' : '') +
          '</div>' +
        '</div>';
    }

    el.innerHTML =
      '<div class="sectionTitleContainer sectionTitleContainer-cards prism-section-header">' +
        '<div style="display:flex;align-items:center;">' +
          '<h2 class="sectionTitle sectionTitle-cards">' + escapeHtml(section.Title) + '</h2>' +
          (section.Badge ? '<span class="prism-section-pill">' + escapeHtml(section.Badge) + '</span>' : '') +
        '</div>' +
        '<div class="prism-scroll-nav">' +
          '<button type="button" tabindex="-1" class="prism-scroll-btn" data-prism-scroll="-1" aria-label="Scroll left">&#8249;</button>' +
          '<button type="button" tabindex="-1" class="prism-scroll-btn" data-prism-scroll="1" aria-label="Scroll right">&#8250;</button>' +
        '</div>' +
      '</div>' +
      '<div class="prism-scroller" data-horizontal="true" style="overflow-x:auto;overflow-y:visible;">' +
        '<div class="scrollSlider prism-items-container focuscontainer-x" style="display:flex;flex-wrap:nowrap;">' +
          tilesHtml +
        '</div>' +
      '</div>';

    el.addEventListener('click', function (e) {
      var scrollBtn = e.target && e.target.closest ? e.target.closest('[data-prism-scroll]') : null;
      if (scrollBtn) {
        e.preventDefault();
        var scroller = el.querySelector('.prism-scroller');
        if (scroller) {
          var dir = Number(scrollBtn.getAttribute('data-prism-scroll')) || 1;
          var delta = dir * Math.max(320, scroller.clientWidth * 0.8);
          if (typeof scroller.scrollBy === 'function') scroller.scrollBy({ left: delta, behavior: 'smooth' });
          else scroller.scrollLeft += delta;
        }
        return;
      }
      var tileEl = e.target && e.target.closest ? e.target.closest('[data-prism-theme-id]') : null;
      if (tileEl) {
        e.preventDefault();
        openThemeModal(tileEl.getAttribute('data-prism-theme-id'), tileEl);
      }
    });

    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.keyCode === 13 || e.key === ' ') {
        var tileEl = e.target && e.target.closest ? e.target.closest('[data-prism-theme-id]') : null;
        if (tileEl) {
          e.preventDefault();
          openThemeModal(tileEl.getAttribute('data-prism-theme-id'), tileEl);
        }
      }
    });

    return el;
  }

  function renderSectionElement(section) {
    if (section.RenderMode === 'Spotlight') {
      return renderInlineSpotlight(section);
    }
    if (section.RenderMode === 'ThematicGrid') {
      return renderThematicGridSection(section);
    }

    var el = document.createElement('div');
    el.className = 'verticalSection prism-home-section';
    el.setAttribute('data-prism-injected', 'true');
    el.setAttribute('data-prism-section-id', section.Id);

    var cardsHtml = '';
    for (var i = 0; i < section.Items.length; i += 1) {
      cardsHtml += renderPosterOrThumbCardHtml(section.Items[i], section.CardFormat);
    }

    el.innerHTML =
      '<div class="sectionTitleContainer sectionTitleContainer-cards prism-section-header">' +
        '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:0.2rem;">' +
          '<h2 class="sectionTitle sectionTitle-cards">' + escapeHtml(section.Title) + '</h2>' +
          (section.Badge ? '<span class="prism-section-pill">' + escapeHtml(section.Badge) + '</span>' : '') +
        '</div>' +
        '<div class="prism-scroll-nav">' +
          '<button type="button" tabindex="-1" class="prism-scroll-btn" data-prism-scroll="-1" aria-label="Scroll left">&#8249;</button>' +
          '<button type="button" tabindex="-1" class="prism-scroll-btn" data-prism-scroll="1" aria-label="Scroll right">&#8250;</button>' +
        '</div>' +
      '</div>' +
      '<div class="prism-scroller" data-horizontal="true" style="overflow-x:auto;overflow-y:visible;">' +
        '<div class="scrollSlider prism-items-container focuscontainer-x" style="display:flex;flex-wrap:nowrap;">' +
          cardsHtml +
        '</div>' +
      '</div>';

    el.addEventListener('click', function (e) {
      var wlBtn = e.target && e.target.closest ? e.target.closest('.prism-card-wl-btn') : null;
      if (wlBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleWatchlistItem(wlBtn.getAttribute('data-prism-wl-id'));
        return;
      }

      var scrollBtn = e.target && e.target.closest ? e.target.closest('[data-prism-scroll]') : null;
      if (scrollBtn) {
        e.preventDefault();
        var scroller = el.querySelector('.prism-scroller');
        if (scroller) {
          var dir = Number(scrollBtn.getAttribute('data-prism-scroll')) || 1;
          var delta = dir * Math.max(320, scroller.clientWidth * 0.8);
          if (typeof scroller.scrollBy === 'function') {
            scroller.scrollBy({ left: delta, behavior: 'smooth' });
          } else {
            scroller.scrollLeft += delta;
          }
        }
        return;
      }

      var card = e.target && e.target.closest ? e.target.closest('[data-prism-item-id]') : null;
      if (card) {
        e.preventDefault();
        navigateToItem(card.getAttribute('data-prism-item-id'));
      }
    });

    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.keyCode === 13) {
        var card = e.target && e.target.closest ? e.target.closest('[data-prism-item-id]') : null;
        if (card) {
          e.preventDefault();
          navigateToItem(card.getAttribute('data-prism-item-id'));
        }
      }
    });

    return el;
  }

  function closeThemeModal(restoreFocusEl) {
    var existing = document.getElementById('prism-theme-modal-backdrop');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    if (restoreFocusEl && typeof restoreFocusEl.focus === 'function' && document.body.contains(restoreFocusEl)) {
      try {
        restoreFocusEl.focus({ preventScroll: true });
      } catch (_) {
        restoreFocusEl.focus();
      }
    }
  }

  function openThemeModal(themeId, triggerEl) {
    if (!themeId || !window.ApiClient) return;
    var uid = typeof window.ApiClient.getCurrentUserId === 'function' ? window.ApiClient.getCurrentUserId() : null;
    if (!uid) return;

    closeThemeModal(null);

    var backdrop = document.createElement('div');
    backdrop.id = 'prism-theme-modal-backdrop';
    backdrop.className = 'prism-theme-modal-backdrop';
    backdrop.innerHTML =
      '<div class="prism-theme-modal" role="dialog" aria-modal="true" aria-label="Thematic Collection">' +
        '<div class="prism-theme-modal-header">' +
          '<div>' +
            '<div class="prism-theme-modal-eyebrow">Thematic Pick</div>' +
            '<h2 class="prism-theme-modal-title">Loading theme...</h2>' +
            '<div class="prism-theme-modal-subtitle"></div>' +
          '</div>' +
          '<button type="button" class="prism-theme-modal-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="prism-theme-modal-body">' +
          '<div class="prism-discovery-loading"><span class="prism-spinner"></span><span>Loading titles...</span></div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(backdrop);

    var closeBtn = backdrop.querySelector('.prism-theme-modal-close');
    var titleEl = backdrop.querySelector('.prism-theme-modal-title');
    var eyebrowEl = backdrop.querySelector('.prism-theme-modal-eyebrow');
    var subtitleEl = backdrop.querySelector('.prism-theme-modal-subtitle');
    var bodyEl = backdrop.querySelector('.prism-theme-modal-body');

    var onKeyDown = function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        document.removeEventListener('keydown', onKeyDown, true);
        closeThemeModal(triggerEl);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    var dismiss = function () {
      document.removeEventListener('keydown', onKeyDown, true);
      closeThemeModal(triggerEl);
    };

    closeBtn.addEventListener('click', dismiss);
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) dismiss();
    });

    if (isTvLayout()) {
      closeBtn.focus();
    }

    var renderDetail = function (detail) {
      if (!document.body.contains(backdrop)) return;
      eyebrowEl.textContent = detail.Group || 'Thematic Pick';
      titleEl.textContent = detail.Name || 'Theme';
      subtitleEl.textContent = detail.Subtitle || '';

      if (!detail.Items || detail.Items.length === 0) {
        bodyEl.innerHTML = '<div class="prism-discovery-end">No matching library titles found for this theme.</div>';
        return;
      }

      var gridHtml = '<div class="prism-theme-modal-grid">';
      for (var i = 0; i < detail.Items.length; i += 1) {
        gridHtml += renderPosterOrThumbCardHtml(detail.Items[i], 'Portrait');
      }
      gridHtml += '</div>';
      bodyEl.innerHTML = gridHtml;

      bodyEl.addEventListener('click', function (e) {
        var wlBtn = e.target && e.target.closest ? e.target.closest('.prism-card-wl-btn') : null;
        if (wlBtn) {
          e.preventDefault();
          e.stopPropagation();
          toggleWatchlistItem(wlBtn.getAttribute('data-prism-wl-id'));
          return;
        }
        var card = e.target && e.target.closest ? e.target.closest('[data-prism-item-id]') : null;
        if (card) {
          e.preventDefault();
          dismiss();
          navigateToItem(card.getAttribute('data-prism-item-id'));
        }
      });

      bodyEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
          var card = e.target && e.target.closest ? e.target.closest('[data-prism-item-id]') : null;
          if (card) {
            e.preventDefault();
            dismiss();
            navigateToItem(card.getAttribute('data-prism-item-id'));
          }
        }
      });

      if (isTvLayout()) {
        var firstCard = bodyEl.querySelector('.card');
        if (firstCard) firstCard.focus();
      }
    };

    var cacheKey = normalizeItemId(uid) + ':' + themeId;
    if (state.themeCache[cacheKey]) {
      renderDetail(state.themeCache[cacheKey]);
      return;
    }

    window.ApiClient.getJSON(window.ApiClient.getUrl('Prism/Theme/' + encodeURIComponent(themeId), { userId: uid }))
      .then(function (detail) {
        state.themeCache[cacheKey] = detail;
        renderDetail(detail);
      })
      .catch(function () {
        if (document.body.contains(backdrop)) {
          bodyEl.innerHTML = '<div class="prism-discovery-end">Unable to load theme items right now.</div>';
        }
      });
  }

  function injectHomeSections(container, sections) {
    if (!state.config.enableHomeSections || !sections || sections.length === 0) {
      return;
    }
    if (container.querySelector('[data-prism-core="true"]')) {
      return;
    }

    var anchor = container.querySelector('.section1') || container.querySelector('.section0');
    var insertBeforeNode = anchor ? anchor.nextSibling : null;

    var frag = document.createDocumentFragment();
    for (var i = 0; i < sections.length; i += 1) {
      if (sections[i].Items && sections[i].Items.length > 0) {
        var el = renderSectionElement(sections[i]);
        el.setAttribute('data-prism-core', 'true');
        frag.appendChild(el);
      }
    }

    if (insertBeforeNode) {
      container.insertBefore(frag, insertBeforeNode);
    } else {
      container.appendChild(frag);
    }
  }

  function resetDiscoveryState() {
    state.discovery.generation += 1;
    state.discovery.page = 0;
    state.discovery.hasMore = true;
    state.discovery.loading = false;
    state.discovery.pagesLoaded = 0;
    state.discovery.renderedIds = {};
    if (state.discovery.observer) {
      state.discovery.observer.disconnect();
      state.discovery.observer = null;
    }
    clearInlineSpotlights();
  }

  function renderDiscoveryFooterState(footer) {
    if (!footer) return;
    if (state.discovery.loading) {
      footer.innerHTML = '<div class="prism-discovery-loading"><span class="prism-spinner"></span><span>Loading personalized picks...</span></div>';
      return;
    }
    if (!state.discovery.hasMore || state.discovery.pagesLoaded >= state.discovery.maxPages) {
      footer.innerHTML = state.discovery.pagesLoaded > 0
        ? '<div class="prism-discovery-end">You\'ve reached the end of today\'s discovery feed</div>'
        : '';
      return;
    }
    if (isTvLayout()) {
      footer.innerHTML = '<button type="button" class="prism-load-more-btn">Discover More</button>';
      var btn = footer.querySelector('.prism-load-more-btn');
      if (btn) {
        btn.addEventListener('click', function () {
          loadNextDiscoveryPage(true);
        });
      }
    } else {
      footer.innerHTML = '<div class="prism-discovery-sentinel" aria-hidden="true"></div>';
    }
  }

  function loadNextDiscoveryPage(fromUserTrigger) {
    if (!state.config.enablePlugin || !state.config.enableInfiniteDiscovery) return;
    if (!isHomeRoute()) return;
    if (state.discovery.loading || !state.discovery.hasMore || state.discovery.pagesLoaded >= state.discovery.maxPages) {
      return;
    }

    var activeHome = getActiveHomePage();
    if (!activeHome || !activeHome.container) return;
    var root = activeHome.container.querySelector('#prism-discovery-root');
    var footer = activeHome.container.querySelector('#prism-discovery-footer');
    if (!root || !footer) return;

    var uid = state.discovery.userId;
    if (!uid) return;

    var gen = state.discovery.generation;
    state.discovery.loading = true;
    renderDiscoveryFooterState(footer);

    window.ApiClient.getJSON(window.ApiClient.getUrl('Prism/Discovery', {
      userId: uid,
      page: state.discovery.page,
      pageSize: state.discovery.pageSize
    })).then(function (resp) {
      if (gen !== state.discovery.generation || !isHomeRoute() || !document.body.contains(root)) {
        state.discovery.loading = false;
        return;
      }

      state.discovery.loading = false;
      state.discovery.page += 1;
      state.discovery.pagesLoaded += 1;
      state.discovery.hasMore = Boolean(resp && resp.HasMore) && state.discovery.pagesLoaded < state.discovery.maxPages;

      var sections = (resp && resp.Sections) || [];
      var frag = document.createDocumentFragment();
      var firstNewSection = null;

      for (var i = 0; i < sections.length; i += 1) {
        var sec = sections[i];
        if (!sec || !sec.Items || sec.Items.length === 0) continue;
        if (state.discovery.renderedIds[sec.Id]) continue;
        state.discovery.renderedIds[sec.Id] = true;

        var secEl = renderSectionElement(sec);
        if (!firstNewSection) firstNewSection = secEl;
        frag.appendChild(secEl);
      }

      root.appendChild(frag);
      renderDiscoveryFooterState(footer);

      if (fromUserTrigger && isTvLayout() && firstNewSection) {
        var focusTarget = firstNewSection.querySelector('.card, .play-button, .prism-theme-tile');
        if (focusTarget) {
          try {
            focusTarget.focus({ preventScroll: true });
          } catch (_) {
            focusTarget.focus();
          }
        }
      }
    }).catch(function () {
      if (gen === state.discovery.generation) {
        state.discovery.loading = false;
        state.discovery.hasMore = false;
        renderDiscoveryFooterState(footer);
      }
    });
  }

  function ensureDiscoveryFeed(container, uid, discoveryAvailable) {
    if (!state.config.enablePlugin || !state.config.enableInfiniteDiscovery || !discoveryAvailable) {
      return;
    }

    var existingRoot = container.querySelector('#prism-discovery-root');
    var existingFooter = container.querySelector('#prism-discovery-footer');

    if (existingRoot && existingFooter && state.discovery.userId === uid) {
      return;
    }

    resetDiscoveryState();
    state.discovery.userId = uid;

    if (!existingRoot) {
      existingRoot = document.createElement('div');
      existingRoot.id = 'prism-discovery-root';
      existingRoot.setAttribute('data-prism-injected', 'true');
      container.appendChild(existingRoot);
    }

    if (!existingFooter) {
      existingFooter = document.createElement('div');
      existingFooter.id = 'prism-discovery-footer';
      existingFooter.className = 'prism-discovery-footer';
      existingFooter.setAttribute('data-prism-injected', 'true');
      container.appendChild(existingFooter);
    }

    renderDiscoveryFooterState(existingFooter);

    if (!isTvLayout() && typeof window.IntersectionObserver === 'function' && !state.discovery.observer) {
      state.discovery.observer = new window.IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i += 1) {
          if (entries[i].isIntersecting) {
            loadNextDiscoveryPage(false);
            break;
          }
        }
      }, { rootMargin: '350px 0px' });
      state.discovery.observer.observe(existingFooter);
    }

    if (state.discovery.pagesLoaded === 0 && !state.discovery.loading) {
      loadNextDiscoveryPage(false);
    }
  }

  // --- 06-infinite-scroll.js ---
// ------------------------------------------------------------------------
  // Library Infinite Scroll (Movies & TV Library Pages, 100-item batches)
  // ------------------------------------------------------------------------
  function teardownLibraryInfiniteScroll() {
    state.libScroll.generation += 1;
    state.libScroll.loading = false;
    state.libScroll.key = '';
    if (state.libScroll.observer) {
      state.libScroll.observer.disconnect();
      state.libScroll.observer = null;
    }
    var oldFooter = document.getElementById('prism-lib-scroll-footer');
    if (oldFooter && oldFooter.parentNode) {
      oldFooter.parentNode.removeChild(oldFooter);
    }
  }

  function parseHashParams() {
    var hash = window.location.hash || '';
    var qIdx = hash.indexOf('?');
    var route = (qIdx >= 0 ? hash.slice(0, qIdx) : hash).replace(/^#!?\/?/, '').toLowerCase();
    var query = {};
    if (qIdx >= 0) {
      var parts = hash.slice(qIdx + 1).split('&');
      for (var i = 0; i < parts.length; i += 1) {
        var kv = parts[i].split('=');
        if (kv[0]) {
          query[decodeURIComponent(kv[0])] = kv[1] ? decodeURIComponent(kv[1]) : '';
        }
      }
    }
    return { route: route, query: query };
  }

  function readLibraryPagingTotal(root) {
    var scopes = [root, document.querySelector('header.MuiAppBar-root')];
    var regex = /(\d[\d,]*)\s*-\s*(\d[\d,]*)\s+of\s+(\d[\d,]*)/i;
    for (var s = 0; s < scopes.length; s += 1) {
      if (!scopes[s]) continue;
      var labels = scopes[s].querySelectorAll('.listPaging > span, .MuiChip-label');
      for (var i = 0; i < labels.length; i += 1) {
        var m = String(labels[i].textContent || '').trim().match(regex);
        if (m && m[3]) {
          var parsed = parseInt(m[3].replace(/,/g, ''), 10);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
      }
    }
    return null;
  }

  function getLibraryPageContext() {
    if (!state.config.enablePlugin || !state.config.enableLibraryInfiniteScroll) {
      return null;
    }

    var parsed = parseHashParams();
    var route = parsed.route;
    var isMovies = route === 'movies' || route === 'movies.html';
    var isTv = route === 'tv' || route === 'tv.html';
    if (!isMovies && !isTv) {
      return null;
    }

    if (parsed.query.tab && parsed.query.tab !== '0') {
      return null;
    }

    var root = null;
    if (isMovies) {
      root = document.querySelector('#moviesPage:not(.hide)')
        || document.querySelector('.libraryPage:not(.hide) #moviesTab.is-active');
    } else {
      root = document.querySelector('#tvshowsPage:not(.hide)')
        || document.querySelector('.libraryPage:not(.hide) #seriesTab.is-active');
    }
    if (!root) return null;

    var container = root.querySelector('.itemsContainer:not(.vertical-list)');
    if (!container) return null;

    var existingCards = container.querySelectorAll('.card');
    if (!existingCards || existingCards.length === 0) return null;

    if (!window.ApiClient || typeof window.ApiClient.getCurrentUserId !== 'function') return null;
    var uid = window.ApiClient.getCurrentUserId();
    if (!uid) return null;

    var parentId = parsed.query.topParentId || parsed.query.parentId || '';
    var mediaType = isMovies ? 'movies' : 'series';
    var itemType = isMovies ? 'Movie' : 'Series';

    var sortBy = 'SortName,ProductionYear';
    var sortOrder = 'Ascending';
    var filters = '';
    var genres = '';
    var tags = '';
    var years = '';
    var nameStartsWith = '';

    if (parentId) {
      try {
        var sortRaw = window.localStorage.getItem(uid + '-' + parentId + '-' + mediaType);
        var filterRaw = window.localStorage.getItem(uid + '-' + parentId + '-' + mediaType + '-filter');
        if (sortRaw) {
          var sortObj = JSON.parse(sortRaw);
          if (sortObj.SortBy) sortBy = sortObj.SortBy;
          if (sortObj.SortOrder) sortOrder = sortObj.SortOrder;
          if (sortObj.NameStartsWith) nameStartsWith = sortObj.NameStartsWith;
        }
        if (filterRaw) {
          var filterObj = JSON.parse(filterRaw);
          if (filterObj.Filters) filters = filterObj.Filters;
          if (filterObj.Genres) genres = filterObj.Genres;
          if (filterObj.Tags) tags = filterObj.Tags;
          if (filterObj.Years) years = filterObj.Years;
        }
      } catch (_) {
        // Ignore malformed Jellyfin localStorage values
      }
    }

    var alphaBtn = root.querySelector('.alphaPickerButton-selected, .alphaPicker-fixed-right [aria-pressed="true"]');
    if (alphaBtn) {
      var alphaVal = alphaBtn.getAttribute('data-value') || alphaBtn.value || alphaBtn.textContent;
      if (alphaVal && alphaVal.trim()) {
        nameStartsWith = alphaVal.trim();
      }
    }

    var totalFromDom = readLibraryPagingTotal(root);
    var firstCard = existingCards[0];
    var cardShape = 'portraitCard';
    if (firstCard.classList.contains('backdropCard') || firstCard.classList.contains('overflowBackdropCard')) {
      cardShape = 'backdropCard';
    } else if (firstCard.classList.contains('squareCard') || firstCard.classList.contains('overflowSquareCard')) {
      cardShape = 'squareCard';
    }

    return {
      uid: uid,
      root: root,
      container: container,
      existingCards: existingCards,
      cardShape: cardShape,
      parentId: parentId,
      itemType: itemType,
      sortBy: sortBy,
      sortOrder: sortOrder,
      filters: filters,
      genres: genres,
      tags: tags,
      years: years,
      nameStartsWith: nameStartsWith,
      totalFromDom: totalFromDom,
      key: [route, parentId, mediaType, sortBy, sortOrder, filters, genres, tags, years, nameStartsWith].join('|')
    };
  }

  function renderLibScrollFooter(ctx) {
    var footer = document.getElementById('prism-lib-scroll-footer');
    if (!footer) return;

    if (state.libScroll.loading) {
      footer.innerHTML = '<div class="prism-discovery-loading"><span class="prism-spinner"></span><span>Loading more titles...</span></div>';
      return;
    }

    if (!state.libScroll.hasMore) {
      footer.innerHTML = '';
      return;
    }

    if (isTvLayout()) {
      footer.innerHTML = '<button type="button" class="prism-load-more-btn">Load More</button>';
      var btn = footer.querySelector('.prism-load-more-btn');
      if (btn) {
        btn.addEventListener('click', function () {
          loadNextLibraryBatch(true);
        });
      }
    } else {
      footer.innerHTML = '<div class="prism-discovery-sentinel" aria-hidden="true"></div>';
    }
  }

  function buildLibraryCardHtml(item, cardShape, itemType) {
    var isBackdrop = cardShape === 'backdropCard';
    var imgType = isBackdrop && item.BackdropImageTags && item.BackdropImageTags.length > 0 ? 'Backdrop' : 'Primary';
    var imgTag = imgType === 'Backdrop'
      ? item.BackdropImageTags[0]
      : (item.ImageTags && item.ImageTags.Primary);
    var imgUrl = buildImageUrl(item.Id, imgType, isBackdrop ? 560 : 400, imgTag, 0);
    var padderClass = isBackdrop
      ? 'cardPadder cardPadder-backdrop'
      : (cardShape === 'squareCard' ? 'cardPadder cardPadder-square' : 'cardPadder cardPadder-portrait');

    var yearText = item.ProductionYear ? String(item.ProductionYear) : '';

    return (
      '<div class="card ' + cardShape + ' card-hoverable card-withuserdata" tabindex="0" data-prism-lib-card="1" data-id="' + escapeHtml(item.Id) + '" data-type="' + escapeHtml(item.Type || itemType) + '">' +
        '<div class="cardBox cardBox-bottompadded">' +
          '<div class="cardScalable">' +
            '<div class="' + padderClass + '"></div>' +
            '<div class="cardContent">' +
              '<div class="cardImageContainer coveredImage" style="background-image:url(\'' + escapeHtml(imgUrl) + '\');">' +
                '<div><img src="' + escapeHtml(imgUrl) + '" alt="' + escapeHtml(item.Name) + '" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" /></div>' +
              '</div>' +
            '</div>' +
            '<div class="cardOverlayContainer itemAction" style="position:absolute;inset:0;opacity:0;">' +
              '<a class="cardImageContainer" href="#/details?id=' + escapeHtml(item.Id) + '" aria-label="' + escapeHtml(item.Name) + '" style="position:absolute;inset:0;"></a>' +
              '<button type="button" class="cardOverlayFab-primary" aria-label="Play" style="z-index:2;width:52px;height:52px;padding:0;line-height:1;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;"><svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true" style="display:block;margin-left:2px;"><path d="M8 5v14l11-7z"/></svg></button>' +
            '</div>' +
          '</div>' +
          '<div class="cardFooter">' +
            '<div class="cardText cardText-first">' + escapeHtml(item.Name) + '</div>' +
            '<div class="cardText cardText-secondary">' + escapeHtml(yearText) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function loadNextLibraryBatch(fromUserTrigger) {
    var ctx = getLibraryPageContext();
    if (!ctx || state.libScroll.loading || !state.libScroll.hasMore) {
      return;
    }

    var currentCount = ctx.container.querySelectorAll('.card').length;
    if (state.libScroll.totalCount != null && currentCount >= state.libScroll.totalCount) {
      state.libScroll.hasMore = false;
      renderLibScrollFooter(ctx);
      return;
    }

    var gen = state.libScroll.generation;
    state.libScroll.loading = true;
    renderLibScrollFooter(ctx);

    var params = {
      StartIndex: currentCount,
      Limit: 100,
      Recursive: true,
      IncludeItemTypes: ctx.itemType,
      SortBy: ctx.sortBy,
      SortOrder: ctx.sortOrder,
      Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,ProductionYear',
      ImageTypeLimit: 1,
      EnableImageTypes: 'Primary,Backdrop,Thumb',
      EnableTotalRecordCount: true
    };
    if (ctx.parentId) params.ParentId = ctx.parentId;
    if (ctx.filters) params.Filters = ctx.filters;
    if (ctx.genres) params.Genres = ctx.genres;
    if (ctx.tags) params.Tags = ctx.tags;
    if (ctx.years) params.Years = ctx.years;
    if (ctx.nameStartsWith) params.NameStartsWith = ctx.nameStartsWith;

    window.ApiClient.getItems(ctx.uid, params).then(function (result) {
      if (gen !== state.libScroll.generation || !document.body.contains(ctx.container)) {
        state.libScroll.loading = false;
        return;
      }

      state.libScroll.loading = false;
      var items = (result && result.Items) || [];
      if (result && typeof result.TotalRecordCount === 'number') {
        state.libScroll.totalCount = result.TotalRecordCount;
      }

      if (items.length === 0) {
        state.libScroll.hasMore = false;
        renderLibScrollFooter(ctx);
        return;
      }

      var html = '';
      var addedCount = 0;
      for (var i = 0; i < items.length; i += 1) {
        var norm = normalizeItemId(items[i].Id);
        if (!norm || state.libScroll.seenIds[norm]) continue;
        state.libScroll.seenIds[norm] = true;
        html += buildLibraryCardHtml(items[i], ctx.cardShape, ctx.itemType);
        addedCount += 1;
      }

      if (addedCount > 0) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        var frag = document.createDocumentFragment();
        var firstAdded = tmp.firstElementChild;
        while (tmp.firstChild) {
          frag.appendChild(tmp.firstChild);
        }
        ctx.container.appendChild(frag);
        scheduleNativeBadgeScan();

        if (fromUserTrigger && isTvLayout() && firstAdded) {
          try {
            firstAdded.focus({ preventScroll: true });
          } catch (_) {
            firstAdded.focus();
          }
        }
      }

      var totalAfter = ctx.container.querySelectorAll('.card').length;
      if (items.length < 100 || (state.libScroll.totalCount != null && totalAfter >= state.libScroll.totalCount)) {
        state.libScroll.hasMore = false;
      }

      renderLibScrollFooter(ctx);
    }).catch(function () {
      if (gen === state.libScroll.generation) {
        state.libScroll.loading = false;
        renderLibScrollFooter(ctx);
      }
    });
  }

  function tryInitLibraryInfiniteScroll() {
    var ctx = getLibraryPageContext();
    if (!ctx) {
      if (state.libScroll.key) {
        teardownLibraryInfiniteScroll();
      }
      return;
    }

    var existingFooter = document.getElementById('prism-lib-scroll-footer');
    if (state.libScroll.key === ctx.key && existingFooter && document.body.contains(existingFooter)) {
      return;
    }

    teardownLibraryInfiniteScroll();
    state.libScroll.key = ctx.key;
    state.libScroll.totalCount = ctx.totalFromDom;

    var seen = {};
    for (var i = 0; i < ctx.existingCards.length; i += 1) {
      var id = extractNativeCardItemId(ctx.existingCards[i]);
      if (id) seen[id] = true;
    }
    state.libScroll.seenIds = seen;

    var knownTotal = ctx.totalFromDom;
    var hasMoreInitial = knownTotal != null
      ? ctx.existingCards.length < knownTotal
      : ctx.existingCards.length >= 50;
    state.libScroll.hasMore = hasMoreInitial;

    if (!hasMoreInitial) {
      return;
    }

    if (!ctx.container.getAttribute('data-prism-lib-click')) {
      ctx.container.setAttribute('data-prism-lib-click', '1');
      ctx.container.addEventListener('click', function (e) {
        var card = e.target && e.target.closest ? e.target.closest('.card[data-prism-lib-card="1"]') : null;
        if (card && card.closest('.itemsContainer') === ctx.container) {
          e.preventDefault();
          var id = card.getAttribute('data-id');
          if (id) navigateToItem(id);
        }
      });
      ctx.container.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
          var card = e.target && e.target.closest ? e.target.closest('.card[data-prism-lib-card="1"]') : null;
          if (card && card.closest('.itemsContainer') === ctx.container) {
            e.preventDefault();
            var id = card.getAttribute('data-id');
            if (id) navigateToItem(id);
          }
        }
      });
    }

    var footer = document.createElement('div');
    footer.id = 'prism-lib-scroll-footer';
    footer.className = 'prism-discovery-footer';
    footer.setAttribute('data-prism-injected', 'true');
    if (ctx.container.parentNode) {
      ctx.container.parentNode.insertBefore(footer, ctx.container.nextSibling);
    }

    renderLibScrollFooter(ctx);

    if (!isTvLayout() && typeof window.IntersectionObserver === 'function') {
      state.libScroll.observer = new window.IntersectionObserver(function (entries) {
        for (var j = 0; j < entries.length; j += 1) {
          if (entries[j].isIntersecting) {
            loadNextLibraryBatch(false);
            break;
          }
        }
      }, { rootMargin: '400px 0px' });
      state.libScroll.observer.observe(footer);
    }
  }

  // --- 07-badges-bootstrap.js ---
// ------------------------------------------------------------------------
  // Batched Media Quality Badges, Home SWR Orchestration & Bootstrap
  // ------------------------------------------------------------------------
  var SKIP_BADGE_TYPES = {
    CollectionFolder: 1,
    UserView: 1,
    Folder: 1,
    Person: 1,
    Genre: 1,
    MusicGenre: 1,
    Studio: 1,
    BoxSet: 1,
    Channel: 1,
    TvChannel: 1,
    Program: 1,
    Photo: 1,
    PhotoAlbum: 1,
    Playlist: 1
  };

  function extractNativeCardItemId(card) {
    var attrId = card.getAttribute('data-id');
    if (attrId) return normalizeItemId(attrId);
    var link = card.querySelector('a[href*="id="]');
    if (link) {
      var match = link.getAttribute('href').match(/[?&]id=([a-f0-9-]+)/i);
      if (match && match[1]) return normalizeItemId(match[1]);
    }
    return '';
  }

  function applyBadgesToCard(card, badges) {
    card.setAttribute('data-prism-badged', '1');
    if (!badges || badges.length === 0) return;
    var scalable = card.querySelector('.cardScalable');
    if (!scalable || scalable.querySelector('.prism-card-badges')) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = renderBadgePillsHtml(badges);
    if (tmp.firstChild) {
      scalable.appendChild(tmp.firstChild);
    }
  }

  function scanNativeCardsForBadges() {
    if (!state.config.enablePlugin || !state.config.enableMediaBadges) return;
    if (!window.ApiClient || typeof window.ApiClient.ajax !== 'function') return;
    if (typeof window.ApiClient.accessToken === 'function' && !window.ApiClient.accessToken()) return;

    var cards = document.querySelectorAll('.card:not([data-prism-badged]):not([data-prism-item-id])');
    if (!cards || cards.length === 0) return;

    var pending = [];
    var unseenMap = {};
    var batchIds = [];

    for (var i = 0; i < cards.length; i += 1) {
      var card = cards[i];
      if (card.offsetParent === null) continue;
      if (card.closest && (card.closest('#prism-discovery-root') || card.closest('.prism-theme-modal'))) {
        card.setAttribute('data-prism-badged', 'skip');
        continue;
      }

      var dtype = card.getAttribute('data-type');
      if (dtype && SKIP_BADGE_TYPES[dtype]) {
        card.setAttribute('data-prism-badged', 'skip');
        continue;
      }

      var id = extractNativeCardItemId(card);
      if (!id || id.length !== 32) {
        card.setAttribute('data-prism-badged', 'skip');
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(state.badgeCache, id)) {
        applyBadgesToCard(card, state.badgeCache[id]);
      } else {
        pending.push({ card: card, id: id });
        if (!unseenMap[id] && batchIds.length < 120) {
          unseenMap[id] = true;
          batchIds.push(id);
        }
      }
    }

    if (batchIds.length === 0 || state.badgeInFlight) return;
    state.badgeInFlight = true;

    window.ApiClient.ajax({
      type: 'POST',
      url: window.ApiClient.getUrl('Prism/MediaBadges'),
      data: JSON.stringify({ Ids: batchIds }),
      contentType: 'application/json',
      dataType: 'json'
    }).then(function (resp) {
      var map = resp || {};
      for (var b = 0; b < batchIds.length; b += 1) {
        var bid = batchIds[b];
        state.badgeCache[bid] = map[bid] || [];
      }
      for (var p = 0; p < pending.length; p += 1) {
        var entry = pending[p];
        if (Object.prototype.hasOwnProperty.call(state.badgeCache, entry.id)) {
          applyBadgesToCard(entry.card, state.badgeCache[entry.id]);
        }
      }
      state.badgeInFlight = false;
      if (document.querySelector('.card:not([data-prism-badged]):not([data-prism-item-id])')) {
        scheduleNativeBadgeScan();
      }
    }).catch(function () {
      state.badgeInFlight = false;
    });
  }

  function scheduleNativeBadgeScan() {
    if (!state.config.enablePlugin || !state.config.enableMediaBadges) return;
    if (state.badgeScanTimer) {
      window.clearTimeout(state.badgeScanTimer);
    }
    state.badgeScanTimer = window.setTimeout(scanNativeCardsForBadges, 180);
  }

  function installCardHoverRule() {
    if (document.getElementById('prism-js-helpers')) return;
    var style = document.createElement('style');
    style.id = 'prism-js-helpers';
    style.textContent =
      '.prism-home-section .card:hover .cardOverlayContainer,' +
      '.prism-home-section .card:focus-within .cardOverlayContainer,' +
      '.card[data-prism-lib-card="1"]:hover .cardOverlayContainer,' +
      '.card[data-prism-lib-card="1"]:focus-within .cardOverlayContainer{opacity:1 !important;}';
    document.head.appendChild(style);
  }

  function removeInjectedHomeDom(activeHome) {
    if (!activeHome) return;
    if (activeHome.page) {
      var hero = activeHome.page.querySelector('#slides-container[data-prism-injected="true"]');
      if (hero && hero.parentNode) hero.parentNode.removeChild(hero);
    }
    if (activeHome.container) {
      var coreSections = activeHome.container.querySelectorAll('[data-prism-core="true"]');
      for (var i = 0; i < coreSections.length; i += 1) {
        if (coreSections[i].parentNode) coreSections[i].parentNode.removeChild(coreSections[i]);
      }
    }
    clearHeroSpotlightTimers();
  }

  function renderHomeDataIntoActivePage(activeHome, uid, data) {
    seedWatchlistFromHome(data);
    renderHeroSpotlight(activeHome.page, data.HeroItems);
    injectHomeSections(activeHome.container, data.Sections);
    ensureDiscoveryFeed(activeHome.container, uid, data.DiscoveryAvailable);
    focusFirstHomeTarget();
  }

  function tryEnhanceHome() {
    if (!state.config.enablePlugin) return;
    if (!state.config.enableHeroSpotlight && !state.config.enableHomeSections && !state.config.enableInfiniteDiscovery) {
      return;
    }
    if (!isHomeRoute()) {
      return;
    }

    var activeHome = getActiveHomePage();
    if (!activeHome || !activeHome.container) {
      return;
    }

    if (!window.ApiClient || typeof window.ApiClient.getCurrentUserId !== 'function') {
      return;
    }
    var uid = window.ApiClient.getCurrentUserId();
    if (!uid) {
      return;
    }

    fetchWatchlistIds(uid);

    if (state.homeData && state.homeUserId === uid) {
      renderHomeDataIntoActivePage(activeHome, uid, state.homeData);
      return;
    }

    var swr = readCachedHome(uid);
    if (swr && swr.data) {
      state.homeData = swr.data;
      state.homeUserId = uid;
      state.homeFetchedAt = swr.savedAt;
      renderHomeDataIntoActivePage(activeHome, uid, swr.data);
      if (swr.fresh) {
        return;
      }
    }

    if (state.loadingHome) {
      return;
    }
    state.loadingHome = true;

    window.ApiClient.getJSON(window.ApiClient.getUrl('Prism/HomeSections', { userId: uid }))
      .then(function (data) {
        state.loadingHome = false;
        var prevVersion = state.homeData && state.homeData.CacheVersion;
        var nextVersion = data && data.CacheVersion;
        state.homeData = data;
        state.homeUserId = uid;
        state.homeFetchedAt = Date.now();
        writeCachedHome(uid, data);

        var currentHome = getActiveHomePage();
        if (currentHome && isHomeRoute()) {
          if (prevVersion && nextVersion && prevVersion !== nextVersion) {
            removeInjectedHomeDom(currentHome);
          }
          renderHomeDataIntoActivePage(currentHome, uid, data);
        }
      })
      .catch(function () {
        state.loadingHome = false;
      });
  }

  function runCoalescedDomSync() {
    ensureBackdropLeakFix();
    syncDesktopHamburgerMenu();
    if (isHomeRoute()) {
      tryEnhanceHome();
    } else if (isDetailsRoute()) {
      tryEnhanceDetailPage();
    } else {
      tryInitLibraryInfiniteScroll();
    }
    scheduleNativeBadgeScan();
  }

  function scheduleDomSync() {
    if (state.domSyncTimer || state.domSyncRaf) {
      return;
    }
    state.domSyncTimer = window.setTimeout(function () {
      state.domSyncTimer = null;
      if (typeof window.requestAnimationFrame === 'function') {
        state.domSyncRaf = window.requestAnimationFrame(function () {
          state.domSyncRaf = null;
          runCoalescedDomSync();
        });
      } else {
        runCoalescedDomSync();
      }
    }, 120);
  }

  function bootstrap() {
    installCardHoverRule();
    ensureBackdropLeakFix();
    initDashboardBackButtonFix();
    initTvGuideScrollFix();
    initTvLaunchFocusRescue();
    syncHeaderMetrics();
    syncScrollState();

    window.addEventListener('scroll', syncScrollState, { passive: true, capture: true });
    window.addEventListener('resize', function () {
      syncHeaderMetrics();
      syncDesktopHamburgerMenu();
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && isHomeRoute()) {
        tryEnhanceHome();
      }
    });

    loadConfig().then(function () {
      syncDesktopHamburgerMenu();
      tryEnhanceHome();
      tryEnhanceDetailPage();
      tryInitLibraryInfiniteScroll();
      syncPageHeroClasses();
      scheduleNativeBadgeScan();
      window.setTimeout(focusFirstHomeTarget, 250);
    });

    window.addEventListener('hashchange', function () {
      closePrismNavDrawer();
      syncDashboardThemeState();
      syncDesktopHamburgerMenu();
      if (!isHomeRoute()) {
        clearHeroSpotlightTimers();
        resetDiscoveryState();
      }
      if (!isHomeRoute() && !isDetailsRoute()) {
        resetAmbientColor();
      }
      teardownLibraryInfiniteScroll();
      syncPageHeroClasses();

      window.setTimeout(function () {
        ensureBackdropLeakFix();
        syncDesktopHamburgerMenu();
        syncHeaderMetrics();
        tryEnhanceHome();
        tryEnhanceDetailPage();
        tryInitLibraryInfiniteScroll();
        syncPageHeroClasses();
        scheduleNativeBadgeScan();
        focusFirstHomeTarget();
      }, 150);
    });

    var observer = new MutationObserver(scheduleDomSync);
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
