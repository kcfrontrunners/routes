(function () {
  'use strict';
  if (window.KCRT) return; // idempotent — safe to load multiple times

  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  var LEAFLET_GPX = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.7.0/gpx.min.js';
  var TILE_URL    = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  var TILE_ATTR   = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

  var ORIGIN_LABELS = { loose_park: 'Loose Park', mill_creek: 'Mill Creek', sunday: 'Sunday' };

  // Module state
  var gpxCache         = {};
  var leafletMap       = null;
  var activeGpxLayer   = null;
  var activeMileMarkers= [];
  var closeBtn         = null;
  var leafletLoading   = false;
  var leafletCallbacks = [];

  // ── CSS ──────────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('kcrt-styles')) return;
    var s = document.createElement('style');
    s.id = 'kcrt-styles';
    s.textContent = [
      /* Mini card */
      '.kcrt-mini-card{display:flex;overflow:hidden;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);margin-top:12px;cursor:pointer;transition:border-color .15s}',
      '.kcrt-mini-card:hover{border-color:rgba(255,255,255,.28)}',
      '.kcrt-mini-thumb{width:110px;flex-shrink:0;background:rgba(0,0,0,.22);position:relative;overflow:hidden;min-height:82px}',
      '.kcrt-mini-thumb canvas{display:block;width:100%;height:100%;position:absolute;inset:0;object-fit:cover}',
      '.kcrt-mini-shimmer{position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.06) 50%,transparent);background-size:200% 100%;animation:kcrt-shimmer 1.8s ease-in-out infinite}',
      '@keyframes kcrt-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}',
      '.kcrt-mini-info{padding:10px 12px;display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}',
      '.kcrt-mini-name{font-size:.88rem;font-weight:700;color:#F0EDE8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.kcrt-mini-dist{font-size:.74rem;color:#F28C84;font-weight:600}',
      '.kcrt-mini-desc{font-size:.78rem;color:#8A8A9A;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1}',
      '.kcrt-mini-cta{font-size:.78rem;font-weight:600;color:#F28C84;margin-top:6px;background:none;border:none;padding:0;cursor:pointer;text-align:left}',

      /* Full modal overlay */
      '#kcrt-modal{position:fixed;inset:0;z-index:9999;display:none;background:rgba(0,0,0,.76);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}',
      '#kcrt-modal.open{display:flex;align-items:center;justify-content:center}',
      '#kcrt-modal-inner{position:relative;background:#212129;border:1px solid rgba(255,255,255,.12);border-radius:18px;width:90vw;max-width:1100px;height:85vh;max-height:700px;display:flex;overflow:hidden}',
      '@media(max-width:700px){#kcrt-modal-inner{flex-direction:column;width:100vw;height:100dvh;max-height:none;border-radius:0}}',

      /* Info panel */
      '#kcrt-modal-info{width:38%;min-width:260px;padding:32px 28px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;border-right:1px solid rgba(255,255,255,.09)}',
      '@media(max-width:700px){#kcrt-modal-info{width:100%;border-right:none;border-bottom:1px solid rgba(255,255,255,.09);max-height:50%;overflow-y:auto;padding:20px 18px;gap:10px}}',
      '.kcrt-eyebrow{font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#F28C84;margin:0}',
      '.kcrt-name{font-size:1.2rem;font-weight:700;color:#F0EDE8;margin:0;line-height:1.3}',
      '.kcrt-dist{font-size:2rem;font-weight:800;color:#F0EDE8;line-height:1;letter-spacing:-.02em}',
      '.kcrt-dist span{font-size:.8rem;font-weight:400;color:#8A8A9A;margin-left:4px}',
      '.kcrt-desc{font-size:.85rem;color:#8A8A9A;line-height:1.6;flex:1}',
      '.kcrt-actions{display:flex;flex-direction:column;gap:8px;margin-top:auto;padding-top:8px}',
      '.kcrt-btn-primary{display:block;text-align:center;padding:11px 20px;background:#BA3830;color:#fff;font-weight:600;font-size:.88rem;border-radius:8px;text-decoration:none;transition:opacity .15s}',
      '.kcrt-btn-primary:hover{opacity:.85;color:#fff}',
      '.kcrt-btn-outline{display:block;text-align:center;padding:10px 20px;background:none;border:1px solid rgba(255,255,255,.25);color:#F0EDE8;font-weight:600;font-size:.88rem;border-radius:8px;text-decoration:none;cursor:pointer;transition:border-color .15s}',
      '.kcrt-btn-outline:hover{border-color:rgba(255,255,255,.5);color:#F0EDE8}',
      '#kcrt-close{align-self:flex-start;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#F0EDE8;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;line-height:1}',
      '#kcrt-close:hover{background:rgba(255,255,255,.18)}',

      /* Map panel */
      '#kcrt-modal-map-wrap{flex:1;position:relative;display:flex;flex-direction:column;min-height:0;background:#e8e8e8}',
      '#kcrt-modal-map{flex:1;width:100%;min-height:0}',
      '.kcrt-map-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#e8e8e8;z-index:10}',
      '.kcrt-spinner{width:36px;height:36px;border:3px solid rgba(0,0,0,.1);border-top-color:#BA3830;border-radius:50%;animation:kcrt-spin .8s linear infinite}',
      '@keyframes kcrt-spin{to{transform:rotate(360deg)}}',

      /* Elevation chart */
      '#kcrt-modal-elevation{border-top:1px solid rgba(0,0,0,.12);background:#f0f0ec;padding:8px 14px 10px;flex-shrink:0}',
      '.kcrt-elev-label{font-size:.6rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#8A8A9A;margin:0 0 4px}',
      '.kcrt-elev-footer{display:flex;justify-content:space-between;font-size:.62rem;color:#8A8A9A;margin-top:3px}',

      /* Leaflet light-theme overrides */
      '.leaflet-container{background:#e8e8e8!important}',
      '.leaflet-control-attribution{background:rgba(255,255,255,.8)!important;color:rgba(0,0,0,.5)!important}',
      '.leaflet-control-attribution a{color:rgba(0,0,0,.6)!important}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Leaflet lazy loader ───────────────────────────────────────────────────────
  function loadLeaflet(cb) {
    if (window.L && window.L.GPX) { cb(); return; }
    leafletCallbacks.push(cb);
    if (leafletLoading) return;
    leafletLoading = true;

    if (!document.querySelector('link[href*="leaflet"]')) {
      var lnk = document.createElement('link');
      lnk.rel = 'stylesheet'; lnk.href = LEAFLET_CSS;
      document.head.appendChild(lnk);
    }
    var s1 = document.createElement('script');
    s1.src = LEAFLET_JS;
    s1.onload = function () {
      var s2 = document.createElement('script');
      s2.src = LEAFLET_GPX;
      s2.onload = function () {
        var cbs = leafletCallbacks.splice(0);
        cbs.forEach(function (fn) { fn(); });
      };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  }

  // ── Tile math (verbatim from kc-routes-widget.js) ────────────────────────────
  function lngToTileF(lon, z) {
    return (lon + 180) / 360 * Math.pow(2, z);
  }
  function latToTileF(lat, z) {
    var r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z);
  }
  function bestPreviewZoom(minLat, maxLat, minLon, maxLon, W, H) {
    for (var z = 17; z >= 8; z--) {
      var pw = (lngToTileF(maxLon, z) - lngToTileF(minLon, z)) * 256;
      var ph = (latToTileF(minLat, z) - latToTileF(maxLat, z)) * 256;
      if (pw < W * 0.72 && ph < H * 0.72) return z;
    }
    return 10;
  }

  // ── Canvas thumbnail renderer ─────────────────────────────────────────────────
  function renderPreview(gpxText, thumbEl) {
    var parser = new DOMParser();
    var doc    = parser.parseFromString(gpxText, 'text/xml');
    var nodes  = doc.getElementsByTagNameNS('*', 'trkpt');
    if (!nodes.length) nodes = doc.getElementsByTagNameNS('*', 'rtept');
    var trkpts = Array.from(nodes).map(function (pt) {
      return [parseFloat(pt.getAttribute('lat')), parseFloat(pt.getAttribute('lon'))];
    });
    if (trkpts.length < 2) return;

    var lats   = trkpts.map(function (p) { return p[0]; });
    var lons   = trkpts.map(function (p) { return p[1]; });
    var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
    var minLon = Math.min.apply(null, lons), maxLon = Math.max.apply(null, lons);
    var midLat = (minLat + maxLat) / 2, midLon = (minLon + maxLon) / 2;

    var W  = thumbEl.offsetWidth  || 110;
    var H  = thumbEl.offsetHeight || 82;
    var z  = bestPreviewZoom(minLat, maxLat, minLon, maxLon, W, H);
    var cx = lngToTileF(midLon, z), cy = latToTileF(midLat, z);
    var ox = cx - W / 2 / 256,     oy = cy - H / 2 / 256;

    var tx0 = Math.floor(ox), tx1 = Math.ceil(ox + W / 256);
    var ty0 = Math.floor(oy), ty1 = Math.ceil(oy + H / 256);
    var maxT = Math.pow(2, z) - 1;

    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    var total = (tx1 - tx0) * (ty1 - ty0), loaded = 0;
    var subs  = ['a', 'b', 'c', 'd'];

    function latLonToXY(lat, lon) {
      return { x: (lngToTileF(lon, z) - ox) * 256, y: (latToTileF(lat, z) - oy) * 256 };
    }
    function drawRoute() {
      ctx.beginPath();
      var p0 = latLonToXY(trkpts[0][0], trkpts[0][1]);
      ctx.moveTo(p0.x, p0.y);
      for (var i = 1; i < trkpts.length; i++) {
        var p = latLonToXY(trkpts[i][0], trkpts[i][1]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = '#E05C52';
      ctx.lineWidth   = 2.5;
      ctx.lineJoin    = 'round';
      ctx.lineCap     = 'round';
      ctx.stroke();
      if (document.body.contains(thumbEl)) {
        var sh = thumbEl.querySelector('.kcrt-mini-shimmer');
        if (sh) sh.parentNode.removeChild(sh);
        thumbEl.appendChild(canvas);
      }
    }
    function onDone() { if (++loaded === total) drawRoute(); }

    for (var ty = ty0; ty < ty1; ty++) {
      for (var tx = tx0; tx < tx1; tx++) {
        (function (tx, ty) {
          var cx2 = Math.max(0, Math.min(maxT, tx));
          var cy2 = Math.max(0, Math.min(maxT, ty));
          var sd  = subs[(Math.abs(cx2) + Math.abs(cy2)) % 4];
          var img = new Image();
          img.src = 'https://' + sd + '.basemaps.cartocdn.com/rastertiles/voyager/' + z + '/' + cx2 + '/' + cy2 + '.png';
          var destX = (tx - ox) * 256, destY = (ty - oy) * 256;
          img.onload = function () { ctx.drawImage(img, destX, destY, 256, 256); onDone(); };
          img.onerror = onDone;
        })(tx, ty);
      }
    }
    if (total === 0) drawRoute();
  }

  // ── Mile markers ──────────────────────────────────────────────────────────────
  function addMileMarkers(gpxLayer) {
    if (!leafletMap) return;
    var MILE_M = 1609.344;
    var latlngs = [];
    function findPolylines(layer) {
      if (layer instanceof L.Polyline) {
        var ll = layer.getLatLngs();
        if (ll.length && Array.isArray(ll[0])) {
          ll.forEach(function (seg) { latlngs = latlngs.concat(seg); });
        } else { latlngs = latlngs.concat(ll); }
      } else if (typeof layer.eachLayer === 'function') {
        layer.eachLayer(findPolylines);
      }
    }
    findPolylines(gpxLayer);
    if (latlngs.length < 2) return;

    var accumulated = 0, nextMile = MILE_M;
    for (var i = 1; i < latlngs.length; i++) {
      accumulated += latlngs[i - 1].distanceTo(latlngs[i]);
      if (accumulated >= nextMile) {
        var mileNum = Math.round(nextMile / MILE_M);
        var icon = L.divIcon({
          className: '',
          html: '<div style="width:20px;height:20px;background:#BA3830;border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.35);line-height:1;font-family:sans-serif">' + mileNum + '</div>',
          iconSize: [20, 20], iconAnchor: [10, 10]
        });
        L.marker(latlngs[i], { icon: icon }).addTo(leafletMap);
        activeMileMarkers.push(L.marker(latlngs[i], { icon: icon }));
        nextMile += MILE_M;
      }
    }
  }

  // ── Elevation chart ───────────────────────────────────────────────────────────
  function renderElevationChart(gpxLayer, container) {
    var elevData = typeof gpxLayer.get_elevation_data === 'function' ? gpxLayer.get_elevation_data() : null;
    if (!elevData || elevData.length < 2) { container.style.display = 'none'; return; }

    var W = 600, H = 54, pad = 4;
    var maxDist = elevData[elevData.length - 1][0];
    var eles    = elevData.map(function (d) { return d[1]; });
    var minEle  = Math.min.apply(null, eles), maxEle = Math.max.apply(null, eles);
    var range   = maxEle - minEle || 1;

    var pts = elevData.map(function (d) {
      return ((d[0] / maxDist) * W).toFixed(1) + ',' + (H - pad - ((d[1] - minEle) / range) * (H - pad * 2)).toFixed(1);
    }).join(' ');
    var fill    = pts + ' ' + W + ',' + H + ' 0,' + H;
    var totalMi = (maxDist * 0.621371).toFixed(1);
    var minFt   = Math.round(minEle * 3.28084), maxFt = Math.round(maxEle * 3.28084);

    container.innerHTML =
      '<p class="kcrt-elev-label">Elevation</p>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:48px;display:block">' +
        '<polygon points="' + fill + '" fill="rgba(186,56,48,.18)"/>' +
        '<polyline points="' + pts + '" fill="none" stroke="#BA3830" stroke-width="1.8" stroke-linejoin="round"/>' +
      '</svg>' +
      '<div class="kcrt-elev-footer"><span>0 mi</span>' +
      '<span>' + maxFt + ' ft max · ' + minFt + ' ft min</span>' +
      '<span>' + totalMi + ' mi</span></div>';
    container.style.display = '';
  }

  // ── Modal DOM (created once) ──────────────────────────────────────────────────
  function buildModal() {
    if (document.getElementById('kcrt-modal')) return;

    closeBtn = document.createElement('button');
    closeBtn.id = 'kcrt-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', function () { window.KCRT.closeModal(); });

    var infoPanel = document.createElement('div');
    infoPanel.id = 'kcrt-modal-info';

    var mapEl = document.createElement('div');
    mapEl.id = 'kcrt-modal-map';

    var mapLoading = document.createElement('div');
    mapLoading.className = 'kcrt-map-loading';
    mapLoading.id = 'kcrt-map-loading';
    var spinner = document.createElement('div');
    spinner.className = 'kcrt-spinner';
    mapLoading.appendChild(spinner);

    var elevEl = document.createElement('div');
    elevEl.id = 'kcrt-modal-elevation';
    elevEl.style.display = 'none';

    var mapWrap = document.createElement('div');
    mapWrap.id = 'kcrt-modal-map-wrap';
    mapWrap.appendChild(mapEl);
    mapWrap.appendChild(mapLoading);
    mapWrap.appendChild(elevEl);

    var inner = document.createElement('div');
    inner.id = 'kcrt-modal-inner';
    inner.appendChild(infoPanel);
    inner.appendChild(mapWrap);

    var overlay = document.createElement('div');
    overlay.id = 'kcrt-modal';
    overlay.appendChild(inner);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) window.KCRT.closeModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') window.KCRT.closeModal();
    });
    document.body.appendChild(overlay);
  }

  function initMap(route) {
    var mapEl   = document.getElementById('kcrt-modal-map');
    var loading = document.getElementById('kcrt-map-loading');
    if (!mapEl) return;

    if (!leafletMap) {
      leafletMap = L.map(mapEl, { zoomControl: true, attributionControl: true });
      L.tileLayer(TILE_URL, { attribution: TILE_ATTR, subdomains: 'abcd', maxZoom: 19 }).addTo(leafletMap);
      leafletMap.setView([39.0997, -94.5786], 12);
    } else {
      leafletMap.invalidateSize();
    }
    if (loading) loading.style.display = 'flex';

    var key = route.route_id;
    if (gpxCache[key]) {
      drawGpx(gpxCache[key], route, loading);
    } else {
      fetch(route.gpx_url)
        .then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); })
        .then(function (text) { gpxCache[key] = text; drawGpx(text, route, loading); })
        .catch(function (e) {
          if (loading) loading.style.display = 'none';
          console.warn('kcrt: GPX fetch error', e);
        });
    }
  }

  function drawGpx(gpxText, route, loadingEl) {
    if (!leafletMap) return;
    if (activeGpxLayer) { leafletMap.removeLayer(activeGpxLayer); activeGpxLayer = null; }

    var blob = new Blob([gpxText], { type: 'application/gpx+xml' });
    var url  = URL.createObjectURL(blob);

    var gpx = new L.GPX(url, {
      async: true,
      marker_options: {
        startIconUrl: 'https://unpkg.com/leaflet-gpx@1.7.0/pin-icon-start.png',
        endIconUrl:   'https://unpkg.com/leaflet-gpx@1.7.0/pin-icon-end.png',
        shadowUrl:    'https://unpkg.com/leaflet-gpx@1.7.0/pin-shadow.png'
      },
      polyline_options: { color: '#BA3830', weight: 3, opacity: 0.9 }
    });

    gpx.on('loaded', function (e) {
      leafletMap.fitBounds(e.target.getBounds(), { padding: [24, 24] });
      if (loadingEl) loadingEl.style.display = 'none';
      URL.revokeObjectURL(url);
      addMileMarkers(e.target);
      var elevEl = document.getElementById('kcrt-modal-elevation');
      if (elevEl) renderElevationChart(e.target, elevEl);
    });
    gpx.on('error', function () {
      if (loadingEl) loadingEl.style.display = 'none';
      URL.revokeObjectURL(url);
    });

    gpx.addTo(leafletMap);
    activeGpxLayer = gpx;
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  window.KCRT = {

    renderMiniCard: function (route, routeType) {
      injectStyles();

      // Thumbnail container
      var thumb   = document.createElement('div');
      thumb.className = 'kcrt-mini-thumb';
      var shimmer = document.createElement('div');
      shimmer.className = 'kcrt-mini-shimmer';
      thumb.appendChild(shimmer);

      // Info pane
      var nameEl = document.createElement('div');
      nameEl.className = 'kcrt-mini-name';
      nameEl.textContent = route.display_name || route.source_name || 'Route';

      var distEl = document.createElement('div');
      distEl.className = 'kcrt-mini-dist';
      distEl.textContent = '◉ ' + (+route.distance_miles).toFixed(1) + ' mi';

      var descText = route.display_description || route.source_description || '';
      var descEl   = document.createElement('div');
      descEl.className = 'kcrt-mini-desc';
      descEl.textContent = descText;

      var cta = document.createElement('button');
      cta.className = 'kcrt-mini-cta';
      cta.textContent = 'View full route →';

      var info = document.createElement('div');
      info.className = 'kcrt-mini-info';
      info.appendChild(nameEl);
      info.appendChild(distEl);
      if (descText) info.appendChild(descEl);
      info.appendChild(cta);

      // Card wrapper
      var card = document.createElement('div');
      card.className = 'kcrt-mini-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'View route: ' + (route.display_name || 'Route'));
      card.appendChild(thumb);
      card.appendChild(info);

      var openFn = function () { window.KCRT.openModal(route); };
      card.addEventListener('click', openFn);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFn(); }
      });

      // Fetch GPX for thumbnail (use cache if available)
      var key = route.route_id;
      if (gpxCache[key]) {
        renderPreview(gpxCache[key], thumb);
      } else if (route.gpx_url) {
        fetch(route.gpx_url)
          .then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); })
          .then(function (text) {
            gpxCache[key] = text;
            if (document.body.contains(thumb)) renderPreview(text, thumb);
          })
          .catch(function () {
            var sh = thumb.querySelector('.kcrt-mini-shimmer');
            if (sh) sh.style.animation = 'none';
          });
      }

      return card;
    },

    openModal: function (route) {
      injectStyles();
      buildModal();

      var modal     = document.getElementById('kcrt-modal');
      var infoPanel = document.getElementById('kcrt-modal-info');
      if (!modal || !infoPanel) return;

      var dist        = (+route.distance_miles).toFixed(2);
      var desc        = route.display_description || route.source_description || 'No description available.';
      var originLabel = ORIGIN_LABELS[route.origin] || route.origin || '';

      // Repopulate info panel
      infoPanel.innerHTML = '';
      infoPanel.appendChild(closeBtn);

      function mkEl(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
      }

      infoPanel.appendChild(mkEl('p', 'kcrt-eyebrow', originLabel));
      infoPanel.appendChild(mkEl('h2', 'kcrt-name', route.display_name || route.source_name || 'Route'));

      var distEl = mkEl('div', 'kcrt-dist');
      distEl.innerHTML = dist + '<span>miles</span>';
      infoPanel.appendChild(distEl);

      infoPanel.appendChild(mkEl('p', 'kcrt-desc', desc));

      var actions = mkEl('div', 'kcrt-actions');

      if (route.garmin_url) {
        var garminBtn = document.createElement('a');
        garminBtn.className = 'kcrt-btn-primary';
        garminBtn.href = route.garmin_url;
        garminBtn.target = '_blank';
        garminBtn.rel = 'noopener';
        garminBtn.textContent = 'View on Garmin →';
        actions.appendChild(garminBtn);
      }
      if (route.gpx_url) {
        var gpxBtn = document.createElement('a');
        gpxBtn.className = 'kcrt-btn-outline';
        gpxBtn.href = route.gpx_url;
        gpxBtn.download = route.gpx_file_name || '';
        gpxBtn.textContent = 'Download GPX';
        actions.appendChild(gpxBtn);
      }

      var shareBtn = mkEl('button', 'kcrt-btn-outline', 'Share route ↗');
      shareBtn.addEventListener('click', function () {
        var url = window.location.href;
        if (navigator.share) {
          navigator.share({ title: route.display_name || 'Route', url: url });
        } else {
          navigator.clipboard.writeText(url).then(function () {
            shareBtn.textContent = 'Copied! ✓';
            setTimeout(function () { shareBtn.textContent = 'Share route ↗'; }, 2000);
          }).catch(function () {});
        }
      });
      actions.appendChild(shareBtn);

      infoPanel.appendChild(actions);

      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      history.replaceState(null, '', '#route-' + route.route_id);

      requestAnimationFrame(function () {
        loadLeaflet(function () { initMap(route); });
      });
    },

    closeModal: function () {
      var modal = document.getElementById('kcrt-modal');
      if (!modal || !modal.classList.contains('open')) return;
      modal.classList.remove('open');
      document.body.style.overflow = '';
      history.replaceState(null, '', location.pathname + location.search);

      if (activeGpxLayer && leafletMap) {
        leafletMap.removeLayer(activeGpxLayer);
        activeGpxLayer = null;
      }
      activeMileMarkers.forEach(function (m) { if (leafletMap) leafletMap.removeLayer(m); });
      activeMileMarkers = [];

      var elevEl = document.getElementById('kcrt-modal-elevation');
      if (elevEl) { elevEl.innerHTML = ''; elevEl.style.display = 'none'; }
    }
  };
})();
