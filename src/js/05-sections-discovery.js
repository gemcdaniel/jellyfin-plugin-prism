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

