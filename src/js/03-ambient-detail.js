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

