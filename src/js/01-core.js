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

