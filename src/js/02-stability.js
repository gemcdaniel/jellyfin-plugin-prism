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

