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

