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

  function getRouteKey() {
    if (!window.location) return '';
    return (window.location.pathname || '') + (window.location.search || '') + (window.location.hash || '');
  }

  function handleRouteChange(force) {
    var nextKey = getRouteKey();
    if (!force && nextKey === state.lastRouteKey) {
      return;
    }
    state.lastRouteKey = nextKey;

    if (state.routeSyncTimer) {
      window.clearTimeout(state.routeSyncTimer);
      state.routeSyncTimer = null;
    }

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

    state.routeSyncTimer = window.setTimeout(function () {
      state.routeSyncTimer = null;
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
  }

  function patchHistoryNavigation() {
    if (!window.history || state.historyPatched) {
      return;
    }
    state.historyPatched = true;

    if (typeof window.history.pushState === 'function') {
      var origPushState = window.history.pushState;
      window.history.pushState = function () {
        var ret = origPushState.apply(window.history, arguments);
        handleRouteChange(false);
        return ret;
      };
    }

    if (typeof window.history.replaceState === 'function') {
      var origReplaceState = window.history.replaceState;
      window.history.replaceState = function () {
        var ret = origReplaceState.apply(window.history, arguments);
        handleRouteChange(false);
        return ret;
      };
    }
  }

  function runCoalescedDomSync() {
    if (getRouteKey() !== state.lastRouteKey) {
      handleRouteChange(false);
    }
    ensureBackdropLeakFix();
    syncDesktopHamburgerMenu();
    syncPageHeroClasses();
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

    state.lastRouteKey = getRouteKey();
    patchHistoryNavigation();

    window.addEventListener('hashchange', function () {
      handleRouteChange(true);
    });

    window.addEventListener('popstate', function () {
      handleRouteChange(false);
    });

    document.addEventListener('viewshow', function () {
      syncPageHeroClasses();
      syncHeaderMetrics();
      scheduleDomSync();
    }, true);

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

