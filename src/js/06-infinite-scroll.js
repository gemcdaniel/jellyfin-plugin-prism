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

