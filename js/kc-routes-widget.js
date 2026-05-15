(function () {
  'use strict';

  // --- Config ----------------------------------------------------------------
  var ROUTES_JSON  = 'https://kcfrontrunners.github.io/routes/data/routes.json';
  var HISTORY_JSON = 'https://kcfrontrunners.github.io/routes/data/route-history.json';
  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  var LEAFLET_GPX = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.7.0/gpx.min.js';
  var TILE_URL    = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  var TILE_ATTR   = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

  // Design tokens
  var C = {
    bg:      '#121217',
    surface: '#212129',
    border:  'rgba(255,255,255,0.09)',
    text:    '#F0EDE8',
    muted:   '#8A8A9A',
    accent:  '#F28C84',
    red:     '#BA3830',
    track:   '#BA3830'
  };

  // --- State ------------------------------------------------------------------
  var allRoutes = [];
  var filterOrigin   = 'all';
  var filterDistance = 'all';
  var filterSearch   = '';
  var sortDir        = 'alpha'; // 'alpha' | 'asc' | 'desc'
  var gpxCache          = {};
  var leafletMap        = null;
  var activeGpxLayer    = null;
  var activeMileMarkers = [];
  var debounceTimer     = null;
  var previewObserver   = null;
  var closeBtn          = null;
  var routeHistoryMap   = {};

  var ORIGIN_LABELS = { loose_park: 'Loose Park', mill_creek: 'Mill Creek', sunday: 'Sunday' };
  var DIST_RANGES   = [
    { key: 'all',  label: 'All' },
    { key: 'u4',   label: '< 4 mi',  test: function(d){ return d < 4; } },
    { key: '4-5',  label: '4-5 mi',  test: function(d){ return d >= 4 && d < 5; } },
    { key: '5-6',  label: '5-6 mi',  test: function(d){ return d >= 5 && d < 6; } },
    { key: '6p',   label: '6+ mi',   test: function(d){ return d >= 6; } }
  ];

  // --- CSS injection ----------------------------------------------------------
  function injectStyles() {
    var s = document.createElement('style');
    s.id = 'kc-routes-styles';
    s.textContent = [
      '#kc-routes-wrap *{box-sizing:border-box}',

      /* Header */
      '#kc-routes-header{padding:48px 24px 32px;background:' + C.bg + ';max-width:var(--wp--style--global--content-size,1200px);margin:0 auto}',

      /* Sticky filter bar */
      '#kc-routes-filters{position:sticky;top:0;z-index:100;background:' + C.bg + ';border-bottom:1px solid ' + C.border + ';padding:12px 24px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}',
      '.kc-filter-group{display:flex;flex-direction:column;gap:4px}',
      '.kc-filter-label{font-size:.6rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + C.muted + ';padding-left:2px}',
      '.kc-filter-box{display:flex;gap:4px;flex-wrap:wrap;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:5px 6px}',
      '#kc-routes-filters .kc-tab-group{display:flex;gap:4px;flex-wrap:wrap}',
      '.kc-tab{background:none;border:1px solid ' + C.border + ';color:' + C.muted + ';border-radius:8px;padding:6px 14px;font-size:.8rem;font-weight:600;cursor:pointer;transition:all .15s}',
      '.kc-tab:hover{border-color:rgba(255,255,255,.25);color:' + C.text + '}',
      '.kc-tab.active{background:' + C.red + ';border-color:' + C.red + ';color:#fff}',
      '.kc-dist-group{display:flex;gap:4px;flex-wrap:wrap}',
      '#kc-routes-search{background:' + C.surface + ';border:1px solid ' + C.border + ';border-radius:8px;color:' + C.text + ';padding:6px 12px;font-size:.85rem;width:200px;outline:none}',
      '#kc-routes-search::placeholder{color:' + C.muted + '}',
      '#kc-routes-search:focus{border-color:rgba(255,255,255,.3)}',
      '.kc-sort-btn{background:none;border:1px solid ' + C.border + ';color:' + C.muted + ';border-radius:8px;padding:6px 12px;font-size:.8rem;cursor:pointer;white-space:nowrap;transition:all .15s}',
      '.kc-sort-btn:hover{color:' + C.text + ';border-color:rgba(255,255,255,.25)}',
      '.kc-count{font-size:.8rem;color:' + C.muted + ';margin-left:auto;white-space:nowrap}',

      /* Grid */
      '#kc-routes-grid{max-width:var(--wp--style--global--content-size,1200px);margin:0 auto;padding:24px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px}',
      '@media(max-width:900px){#kc-routes-grid{grid-template-columns:repeat(2,1fr)}}',
      '@media(max-width:560px){#kc-routes-grid{grid-template-columns:1fr}}',

      /* Route card */
      '.kc-route-card{background:' + C.surface + ';border:1px solid ' + C.border + ';border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:10px;cursor:pointer;transition:border-color .15s,transform .1s;overflow:hidden}',

      /* Card route preview */
      '.kc-card-preview{margin:-20px -20px 0;height:90px;border-radius:14px 14px 0 0;overflow:hidden;background:rgba(0,0,0,.18);border-bottom:1px solid ' + C.border + ';position:relative;flex-shrink:0}',
      '.kc-card-preview svg{display:block;width:100%;height:100%}',
      '.kc-preview-shimmer{position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.05) 50%,transparent);background-size:200% 100%;animation:kc-shimmer 1.8s ease-in-out infinite}',
      '@keyframes kc-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}',
      '.kc-route-card:hover{border-color:rgba(255,255,255,.22);transform:translateY(-1px)}',
      '.kc-route-card:focus{outline:2px solid #F28C84;outline-offset:2px}',
      '.kc-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}',
      '.kc-card-name{font-size:.95rem;font-weight:600;color:' + C.text + ';line-height:1.3;flex:1}',
      '.kc-dist-badge{flex-shrink:0;font-size:.7rem;font-weight:700;letter-spacing:.05em;padding:3px 8px;border-radius:6px;white-space:nowrap}',
      '.kc-dist-u4{background:rgba(99,202,141,.15);color:#63ca8d}',
      '.kc-dist-45{background:rgba(242,140,132,.15);color:#F28C84}',
      '.kc-dist-56{background:rgba(255,180,100,.15);color:#ffb464}',
      '.kc-dist-6p{background:rgba(186,56,48,.2);color:#f07070}',
      '.kc-card-origin{font-size:.7rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:' + C.accent + '}',
      '.kc-card-desc{font-size:.82rem;color:' + C.muted + ';line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.kc-card-btn{margin-top:auto;display:inline-flex;align-items:center;gap:6px;font-size:.82rem;font-weight:600;color:' + C.accent + ';background:none;border:none;padding:0;cursor:pointer}',
      '.kc-card-btn:hover{color:' + C.text + '}',

      /* Empty state */
      '#kc-routes-empty{display:none;text-align:center;padding:64px 24px;color:' + C.muted + '}',
      '#kc-routes-empty p{font-size:1rem;margin:8px 0 0}',
      '.kc-reset-btn{margin-top:12px;padding:8px 18px;background:none;border:1px solid rgba(255,255,255,.2);color:#F0EDE8;border-radius:8px;cursor:pointer;font-size:.85rem;transition:border-color .15s}',
      '.kc-reset-btn:hover{border-color:rgba(255,255,255,.4)}',

      /* Modal overlay */
      '#kc-route-modal{position:fixed;inset:0;z-index:9999;display:none;background:rgba(0,0,0,.75);backdrop-filter:blur(4px)}',
      '#kc-route-modal.open{display:flex;align-items:center;justify-content:center}',
      '#kc-modal-inner{position:relative;background:' + C.surface + ';border:1px solid rgba(255,255,255,.12);border-radius:18px;width:90vw;max-width:1100px;height:85vh;max-height:700px;display:flex;overflow:hidden}',
      '@media(max-width:700px){#kc-modal-inner{flex-direction:column;width:100vw;height:100dvh;max-height:none;border-radius:0}}',

      /* Modal left panel */
      '#kc-modal-info{width:38%;min-width:260px;padding:32px 28px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;border-right:1px solid ' + C.border + '}',
      '@media(max-width:700px){#kc-modal-info{width:100%;border-right:none;border-bottom:1px solid ' + C.border + ';min-height:auto;max-height:50%;overflow-y:auto;padding:20px 18px;gap:10px}}',
      '.kc-modal-eyebrow{font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + C.accent + ';margin:0}',
      '.kc-modal-name{font-size:1.2rem;font-weight:700;color:' + C.text + ';margin:0;line-height:1.3}',
      '.kc-modal-dist{font-size:2rem;font-weight:800;color:' + C.text + ';line-height:1;letter-spacing:-.02em}',
      '.kc-modal-dist span{font-size:.8rem;font-weight:400;color:' + C.muted + ';margin-left:4px}',
      '.kc-modal-desc{font-size:.85rem;color:' + C.muted + ';line-height:1.6}',
      '.kc-modal-actions{display:flex;flex-direction:column;gap:8px;margin-top:auto;padding-top:8px}',
      '.kc-modal-btn-primary{display:block;text-align:center;padding:11px 20px;background:' + C.red + ';color:#fff;font-weight:600;font-size:.88rem;border-radius:8px;text-decoration:none;transition:opacity .15s}',
      '.kc-modal-btn-primary:hover{opacity:.85;color:#fff}',
      '.kc-modal-btn-outline{display:block;text-align:center;padding:10px 20px;background:none;border:1px solid rgba(255,255,255,.25);color:' + C.text + ';font-weight:600;font-size:.88rem;border-radius:8px;text-decoration:none;transition:border-color .15s}',
      '.kc-modal-btn-outline:hover{border-color:rgba(255,255,255,.5);color:' + C.text + '}',

      /* Modal map panel */
      '#kc-modal-map-wrap{flex:1;position:relative;background:#e8e8e8;display:flex;flex-direction:column;min-height:0}',
      '#kc-modal-map{flex:1;width:100%;min-height:0}',
      '.kc-map-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#e8e8e8;z-index:10}',

      /* Elevation profile */
      '#kc-modal-elevation{border-top:1px solid rgba(0,0,0,.12);background:#f0f0ec;padding:8px 14px 10px;flex-shrink:0}',
      '.kc-elev-label{font-size:.6rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#8A8A9A;margin:0 0 4px}',
      '.kc-elev-footer{display:flex;justify-content:space-between;font-size:.62rem;color:#8A8A9A;margin-top:3px}',
      '.kc-spinner{width:36px;height:36px;border:3px solid rgba(255,255,255,.1);border-top-color:' + C.accent + ';border-radius:50%;animation:kc-spin 0.8s linear infinite}',
      '@keyframes kc-spin{to{transform:rotate(360deg)}}',

      /* Close button */
      '#kc-modal-close{align-self:flex-start;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#F0EDE8;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;line-height:1;flex-shrink:0}',
      '#kc-modal-close:hover{background:rgba(255,255,255,.16)}',

      /* Leaflet light overrides */
      '.leaflet-container{background:#e8e8e8}',
      '.leaflet-control-attribution{background:rgba(255,255,255,.8)!important;color:rgba(0,0,0,.5)!important}',
      '.leaflet-control-attribution a{color:rgba(0,0,0,.6)!important}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // --- Library loading --------------------------------------------------------
  function loadScript(src, cb) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = cb;
    document.head.appendChild(s);
  }
  function loadCSS(href) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }

  function loadLibraries(cb) {
    loadCSS(LEAFLET_CSS);
    loadScript(LEAFLET_JS, function () {
      loadScript(LEAFLET_GPX, cb);
    });
  }

  // --- DOM helpers ------------------------------------------------------------
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function(k) {
      if (k === 'className') e.className = attrs[k];
      else if (k === 'style') e.style.cssText = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function(c) {
        if (!c && c !== 0) return;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return e;
  }

  // --- Filtering / sorting ----------------------------------------------------
  function distClass(d) {
    if (d < 4)        return 'kc-dist-u4';
    if (d < 5)        return 'kc-dist-45';
    if (d < 6)        return 'kc-dist-56';
    return 'kc-dist-6p';
  }
  function distRangeKey(d) {
    if (d < 4)        return 'u4';
    if (d < 5)        return '4-5';
    if (d < 6)        return '5-6';
    return '6p';
  }

  function getFiltered() {
    var q = filterSearch.toLowerCase().trim();
    return allRoutes
      .filter(function(r) {
        if (filterOrigin !== 'all' && r.origin !== filterOrigin) return false;
        if (filterDistance !== 'all') {
          var range = DIST_RANGES.find(function(x){ return x.key === filterDistance; });
          if (range && range.test && !range.test(r.distance_miles)) return false;
        }
        if (q) {
          var haystack = ((r.display_name || '') + ' ' + (r.display_description || '')).toLowerCase();
          if (haystack.indexOf(q) === -1) return false;
        }
        return true;
      })
      .sort(function(a, b) {
        if (sortDir === 'alpha') {
          var na = (a.display_name || a.source_name || '').toLowerCase();
          var nb = (b.display_name || b.source_name || '').toLowerCase();
          if (na !== nb) return na < nb ? -1 : 1;
          // Tiebreak by description so e.g. many "Loose Park" routes are stable
          var da = (a.display_description || a.source_description || '').toLowerCase();
          var db = (b.display_description || b.source_description || '').toLowerCase();
          return da < db ? -1 : da > db ? 1 : 0;
        }
        return sortDir === 'asc'
          ? a.distance_miles - b.distance_miles
          : b.distance_miles - a.distance_miles;
      });
  }

  // --- UI building ------------------------------------------------------------
  function buildHeader() {
    var wrap = el('div', { id: 'kc-routes-header' }, [
      el('p', { style: 'font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + C.accent + ';margin:0 0 8px' }, 'Our routes'),
      el('h1', { style: 'font-size:clamp(1.8rem,4vw,2.8rem);font-weight:700;color:' + C.text + ';margin:0 0 8px;line-height:1.1;letter-spacing:-.01em' }, 'Find your run'),
      el('p', { id: 'kc-routes-subtitle', style: 'font-size:.9rem;color:' + C.muted + ';margin:0' }, '')
    ]);
    return wrap;
  }

  function makeTab(label, value, currentVal, onClick) {
    var t = el('button', { className: 'kc-tab' + (currentVal === value ? ' active' : '') }, label);
    t.addEventListener('click', function() { onClick(value); });
    return t;
  }

  function buildFilterBar() {
    // Origin tabs
    var originTabs = el('div', { className: 'kc-tab-group kc-filter-box' }, [
      makeTab('All', 'all', filterOrigin, setOrigin),
      makeTab('Loose Park', 'loose_park', filterOrigin, setOrigin),
      makeTab('Mill Creek', 'mill_creek', filterOrigin, setOrigin),
      makeTab('Sunday', 'sunday', filterOrigin, setOrigin)
    ]);
    var originGroup = el('div', { className: 'kc-filter-group' }, [
      el('span', { className: 'kc-filter-label' }, 'Category'),
      originTabs
    ]);

    // Distance pills
    var distPills = el('div', { className: 'kc-dist-group kc-filter-box' },
      DIST_RANGES.map(function(r) {
        return makeTab(r.label, r.key, filterDistance, setDistance);
      })
    );
    var distGroup = el('div', { className: 'kc-filter-group' }, [
      el('span', { className: 'kc-filter-label' }, 'Distance'),
      distPills
    ]);

    // Search
    var search = el('input', {
      id: 'kc-routes-search',
      type: 'text',
      placeholder: 'Search routes...',
      value: filterSearch
    });
    search.addEventListener('input', function() {
      clearTimeout(debounceTimer);
      var val = this.value;
      debounceTimer = setTimeout(function() { setSearch(val); }, 200);
    });

    // Sort button
    function sortLabel() {
      return sortDir === 'alpha' ? 'A \u2192 Z' : 'Distance ' + (sortDir === 'asc' ? '\u2191' : '\u2193');
    }
    var sortBtn = el('button', { className: 'kc-sort-btn' }, sortLabel());
    sortBtn.addEventListener('click', function() {
      sortDir = sortDir === 'alpha' ? 'asc' : sortDir === 'asc' ? 'desc' : 'alpha';
      sortBtn.textContent = sortLabel();
      render();
    });

    // Count
    var count = el('span', { className: 'kc-count', id: 'kc-routes-count' }, '');

    return el('div', { id: 'kc-routes-filters' }, [
      originGroup, distGroup, search, sortBtn, count
    ]);
  }

  function setOrigin(v) {
    filterOrigin = v;
    var originMap = { all:'All', loose_park:'Loose Park', mill_creek:'Mill Creek', sunday:'Sunday' };
    document.querySelectorAll('#kc-routes-filters .kc-tab-group .kc-tab').forEach(function(t){
      t.classList.toggle('active', t.textContent.trim() === originMap[v]);
    });
    render();
  }

  function setDistance(v) {
    filterDistance = v;
    document.querySelectorAll('#kc-routes-filters .kc-dist-group .kc-tab').forEach(function(t){
      var range = DIST_RANGES.find(function(r){ return r.label === t.textContent.trim(); });
      t.classList.toggle('active', range && range.key === v);
    });
    render();
  }

  function setSearch(v) { filterSearch = v; render(); }

  function buildCard(route) {
    var d = (+route.distance_miles).toFixed(2);
    var badge = el('span', { className: 'kc-dist-badge ' + distClass(route.distance_miles) }, d + ' mi');
    var name  = el('div', { className: 'kc-card-name' }, route.display_name || route.source_name || 'Route');
    var top   = el('div', { className: 'kc-card-top' }, [name, badge]);
    var origin = el('div', { className: 'kc-card-origin' }, ORIGIN_LABELS[route.origin] || route.origin);
    var desc   = el('div', { className: 'kc-card-desc' }, route.display_description || route.source_description || '');
    var btn    = el('button', { className: 'kc-card-btn' }, 'View route \u2192');

    // Route shape preview (lazily loaded via IntersectionObserver)
    var preview = el('div', { className: 'kc-card-preview' });
    preview.setAttribute('data-route-id', String(route.route_id));
    preview.setAttribute('data-gpx-url', route.gpx_url || '');
    preview.appendChild(el('div', { className: 'kc-preview-shimmer' }));

    // If already cached from a modal open, render immediately
    if (gpxCache[route.route_id]) {
      renderCardPreviewSVG(gpxCache[route.route_id], preview);
    }

    var nameStr   = route.display_name || route.source_name || 'Route';
    var originStr = ORIGIN_LABELS[route.origin] || route.origin;
    var card = el('div', {
      className: 'kc-route-card',
      tabindex: '0',
      role: 'button',
      'aria-label': nameStr + ', ' + d + ' miles, ' + originStr
    }, [preview, top, origin, desc, btn]);
    card.addEventListener('click', function() { openModal(route); });
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(route); }
    });
    return card;
  }

  function render() {
    var grid  = document.getElementById('kc-routes-grid');
    var empty = document.getElementById('kc-routes-empty');
    var count = document.getElementById('kc-routes-count');
    var sub   = document.getElementById('kc-routes-subtitle');
    if (!grid) return;

    var filtered = getFiltered();

    // Update subtitle once (total routes)
    if (sub && sub.textContent === '') {
      sub.textContent = allRoutes.length + ' routes across Kansas City';
    }

    // Count label
    if (count) {
      count.textContent = filtered.length + ' route' + (filtered.length !== 1 ? 's' : '');
    }

    // Clear and repopulate grid
    grid.innerHTML = '';
    if (filtered.length === 0) {
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      filtered.forEach(function(r) { grid.appendChild(buildCard(r)); });
      setupPreviewObserver();
    }
  }

  // --- Modal ------------------------------------------------------------------
  function buildModal() {
    closeBtn = el('button', { id: 'kc-modal-close', 'aria-label': 'Close' }, '\u00D7');
    closeBtn.addEventListener('click', closeModal);

    var infoPanel = el('div', { id: 'kc-modal-info' });
    var mapWrap   = el('div', { id: 'kc-modal-map-wrap' }, [
      el('div', { id: 'kc-modal-map' }),
      el('div', { className: 'kc-map-loading', id: 'kc-map-loading' }, [
        el('div', { className: 'kc-spinner' })
      ]),
      el('div', { id: 'kc-modal-elevation', style: 'display:none' })
    ]);

    var inner = el('div', { id: 'kc-modal-inner' }, [infoPanel, mapWrap]);
    var overlay = el('div', { id: 'kc-route-modal' }, [inner]);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeModal();
    });

    document.body.appendChild(overlay);
  }

  function openModal(route) {
    var modal    = document.getElementById('kc-route-modal');
    var infoPanel = document.getElementById('kc-modal-info');
    if (!modal || !infoPanel) return;

    // Populate info panel
    var dist = (+route.distance_miles).toFixed(2);
    var desc = route.display_description || route.source_description || 'No description available.';
    var originLabel = ORIGIN_LABELS[route.origin] || route.origin;

    infoPanel.innerHTML = '';
    infoPanel.appendChild(closeBtn);
    infoPanel.appendChild(el('p', { className: 'kc-modal-eyebrow' }, originLabel));
    infoPanel.appendChild(el('h2', { className: 'kc-modal-name' }, route.display_name || route.source_name || 'Route'));

    var distEl = el('div', { className: 'kc-modal-dist' });
    distEl.innerHTML = dist + '<span>miles</span>';
    infoPanel.appendChild(distEl);

    infoPanel.appendChild(el('p', { className: 'kc-modal-desc' }, desc));

    var histEntry = routeHistoryMap[String(route.route_id)];
    if (histEntry && histEntry.last_run_dates && histEntry.last_run_dates.length) {
      var histSection = el('div', { style: 'margin-top:2px' });
      histSection.appendChild(el('p', {
        style: 'font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:' + C.muted + ';margin:0 0 6px'
      }, 'Recent runs'));
      histEntry.last_run_dates.slice(0, 8).forEach(function(ds) {
        var parts = ds.split('-');
        var d = new Date(+parts[0], +parts[1] - 1, +parts[2]); // local-time parse avoids UTC-midnight off-by-one
        var label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        histSection.appendChild(el('p', {
          style: 'font-size:.82rem;color:' + C.muted + ';margin:0 0 2px;line-height:1.4'
        }, label));
      });
      infoPanel.appendChild(histSection);
    }

    var actions = el('div', { className: 'kc-modal-actions' });
    if (route.garmin_url) {
      var garminBtn = el('a', {
        className: 'kc-modal-btn-primary',
        href: route.garmin_url,
        target: '_blank',
        rel: 'noopener'
      }, 'View on Garmin \u2192');
      actions.appendChild(garminBtn);
    }
    if (route.gpx_url) {
      var gpxBtn = el('a', {
        className: 'kc-modal-btn-outline',
        href: route.gpx_url,
        download: route.gpx_file_name || ''
      }, 'Download GPX');
      actions.appendChild(gpxBtn);
    }

    // Share button
    var shareBtn = el('button', { className: 'kc-modal-btn-outline kc-share-btn' }, 'Share route ↗');
    shareBtn.addEventListener('click', function() {
      var url = window.location.href;
      if (navigator.share) {
        navigator.share({ title: route.display_name || 'Route', url: url });
      } else {
        navigator.clipboard.writeText(url).then(function() {
          shareBtn.textContent = 'Copied! ✓';
          setTimeout(function() { shareBtn.textContent = 'Share route ↗'; }, 2000);
        }).catch(function() {
          shareBtn.textContent = 'Share route ↗';
        });
      }
    });
    actions.appendChild(shareBtn);
    infoPanel.appendChild(actions);

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    history.replaceState(null, '', '#route-' + route.route_id);

    // Initialize or reuse Leaflet map
    requestAnimationFrame(function() {
      initMap(route);
    });
  }

  function closeModal() {
    var modal = document.getElementById('kc-route-modal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    history.replaceState(null, '', location.pathname + location.search);

    // Remove GPX layer but keep map instance
    if (activeGpxLayer && leafletMap) {
      leafletMap.removeLayer(activeGpxLayer);
      activeGpxLayer = null;
    }

    // Remove mile markers
    activeMileMarkers.forEach(function(m) { if (leafletMap) leafletMap.removeLayer(m); });
    activeMileMarkers = [];

    // Clear elevation chart
    var elevEl = document.getElementById('kc-modal-elevation');
    if (elevEl) { elevEl.innerHTML = ''; elevEl.style.display = 'none'; }
  }

  function initMap(route) {
    var mapEl = document.getElementById('kc-modal-map');
    var loading = document.getElementById('kc-map-loading');
    if (!mapEl) return;

    if (!leafletMap) {
      leafletMap = L.map(mapEl, { zoomControl: true, attributionControl: true });
      L.tileLayer(TILE_URL, {
        attribution: TILE_ATTR,
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(leafletMap);
      leafletMap.setView([39.0997, -94.5786], 12);
    } else {
      leafletMap.invalidateSize();
    }

    if (loading) loading.style.display = 'flex';

    var gpxUrl = route.gpx_url;
    var cacheKey = route.route_id;

    if (gpxCache[cacheKey]) {
      drawGpx(gpxCache[cacheKey], route, loading);
    } else {
      fetch(gpxUrl)
        .then(function(r) { return r.ok ? r.text() : Promise.reject(r.status); })
        .then(function(text) {
          gpxCache[cacheKey] = text;
          drawGpx(text, route, loading);
        })
        .catch(function(e) {
          if (loading) loading.style.display = 'none';
          console.warn('kc-routes: GPX fetch error', e);
        });
    }
  }

  function drawGpx(gpxText, route, loadingEl) {
    if (!leafletMap) return;
    if (activeGpxLayer) { leafletMap.removeLayer(activeGpxLayer); activeGpxLayer = null; }

    var parser = new DOMParser();
    var doc = parser.parseFromString(gpxText, 'text/xml');
    var blob = new Blob([gpxText], { type: 'application/gpx+xml' });
    var url = URL.createObjectURL(blob);

    var gpx = new L.GPX(url, {
      async: true,
      marker_options: {
        startIconUrl: 'https://unpkg.com/leaflet-gpx@1.7.0/pin-icon-start.png',
        endIconUrl:   'https://unpkg.com/leaflet-gpx@1.7.0/pin-icon-end.png',
        shadowUrl:    'https://unpkg.com/leaflet-gpx@1.7.0/pin-shadow.png'
      },
      polyline_options: {
        color: C.track,
        weight: 3,
        opacity: 0.9
      }
    });

    gpx.on('loaded', function(e) {
      leafletMap.fitBounds(e.target.getBounds(), { padding: [24, 24] });
      if (loadingEl) loadingEl.style.display = 'none';
      URL.revokeObjectURL(url);
      addMileMarkers(e.target);
      var elevEl = document.getElementById('kc-modal-elevation');
      if (elevEl) renderElevationChart(e.target, elevEl);
    });

    gpx.on('error', function() {
      if (loadingEl) loadingEl.style.display = 'none';
      URL.revokeObjectURL(url);
    });

    gpx.addTo(leafletMap);
    activeGpxLayer = gpx;
  }

  // --- Card route preview -----------------------------------------------------
  function setupPreviewObserver() {
    // Disconnect any previous observer (filter/sort rebuild)
    if (previewObserver) { previewObserver.disconnect(); previewObserver = null; }

    var previews = document.querySelectorAll('.kc-card-preview[data-gpx-url]');
    if (!previews.length) return;

    if (!('IntersectionObserver' in window)) {
      // Fallback for older browsers: load all immediately
      previews.forEach(loadCardPreview);
      return;
    }

    previewObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        previewObserver.unobserve(entry.target);
        loadCardPreview(entry.target);
      });
    }, { rootMargin: '400px 0px' });

    previews.forEach(function(p) {
      // Skip if already rendered (cache hit handled in buildCard)
      if (p.querySelector('svg')) return;
      previewObserver.observe(p);
    });
  }

  function loadCardPreview(previewEl) {
    var routeId = previewEl.getAttribute('data-route-id');
    var gpxUrl  = previewEl.getAttribute('data-gpx-url');
    if (!gpxUrl) return;

    if (gpxCache[routeId]) {
      renderCardPreviewSVG(gpxCache[routeId], previewEl);
      return;
    }

    fetch(gpxUrl)
      .then(function(r) { return r.ok ? r.text() : Promise.reject(r.status); })
      .then(function(text) {
        gpxCache[routeId] = text;
        // Only render if the card is still in the DOM
        if (document.body.contains(previewEl)) renderCardPreviewSVG(text, previewEl);
      })
      .catch(function() { previewEl.innerHTML = ''; });
  }

  // --- Tile math (Web Mercator) ------------------------------------------------
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

  function renderCardPreviewSVG(gpxText, container) {
    var parser = new DOMParser();
    var doc    = parser.parseFromString(gpxText, 'text/xml');
    // GPX files may use <trkpt> (track) or <rtept> (route); namespace-wildcard handles default-namespace GPX
    var nodes  = doc.getElementsByTagNameNS('*', 'trkpt');
    if (!nodes.length) nodes = doc.getElementsByTagNameNS('*', 'rtept');
    var trkpts = Array.from(nodes).map(function(pt) {
      return [parseFloat(pt.getAttribute('lat')), parseFloat(pt.getAttribute('lon'))];
    });
    if (trkpts.length < 2) { container.innerHTML = ''; return; }

    var lats   = trkpts.map(function(p) { return p[0]; });
    var lons   = trkpts.map(function(p) { return p[1]; });
    var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
    var minLon = Math.min.apply(null, lons), maxLon = Math.max.apply(null, lons);
    var midLat = (minLat + maxLat) / 2, midLon = (minLon + maxLon) / 2;

    var W = container.offsetWidth || 300;
    var H = container.offsetHeight || 90;
    var z = bestPreviewZoom(minLat, maxLat, minLon, maxLon, W, H);

    // Fractional tile coords of viewport center, then derive canvas origin (top-left)
    var cx = lngToTileF(midLon, z),  cy = latToTileF(midLat, z);
    var ox = cx - W / 2 / 256,       oy = cy - H / 2 / 256;

    // Tile range to fetch
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
      if (document.body.contains(container)) {
        container.innerHTML = '';
        container.appendChild(canvas);
      }
    }

    function onDone() { if (++loaded === total) drawRoute(); }

    for (var ty = ty0; ty < ty1; ty++) {
      for (var tx = tx0; tx < tx1; tx++) {
        (function(tx, ty) {
          // Clamp to valid tile range
          var clampedX = Math.max(0, Math.min(maxT, tx));
          var clampedY = Math.max(0, Math.min(maxT, ty));
          var img   = new Image();
          var sd    = subs[(Math.abs(clampedX) + Math.abs(clampedY)) % 4];
          img.src   = 'https://' + sd + '.basemaps.cartocdn.com/rastertiles/voyager/' + z + '/' + clampedX + '/' + clampedY + '.png';
          var destX = (tx - ox) * 256, destY = (ty - oy) * 256;
          img.onload = function() { ctx.drawImage(img, destX, destY, 256, 256); onDone(); };
          img.onerror = onDone;
        })(tx, ty);
      }
    }
    if (total === 0) drawRoute();
  }

  // --- Mile markers -----------------------------------------------------------
  function addMileMarkers(gpxLayer) {
    if (!leafletMap) return;
    var MILE_M = 1609.344;
    var latlngs = [];

    // leaflet-gpx nests track as: GPX \u2192 FeatureGroup \u2192 Polyline
    // Use a recursive walk so we find the Polyline at any depth
    function findPolylines(layer) {
      if (layer instanceof L.Polyline) {
        var ll = layer.getLatLngs();
        if (ll.length && Array.isArray(ll[0])) {
          ll.forEach(function(seg) { latlngs = latlngs.concat(seg); });
        } else {
          latlngs = latlngs.concat(ll);
        }
      } else if (typeof layer.eachLayer === 'function') {
        layer.eachLayer(findPolylines);
      }
    }
    findPolylines(gpxLayer);

    if (latlngs.length < 2) return;

    var accumulated = 0;
    var nextMile = MILE_M;

    for (var i = 1; i < latlngs.length; i++) {
      var seg = latlngs[i - 1].distanceTo(latlngs[i]);
      accumulated += seg;

      if (accumulated >= nextMile) {
        var mileNum = Math.round(nextMile / MILE_M);
        var icon = L.divIcon({
          className: '',
          html: '<div style="width:20px;height:20px;background:#BA3830;border:2px solid #fff;' +
                'border-radius:50%;display:flex;align-items:center;justify-content:center;' +
                'font-size:9px;font-weight:800;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.35);' +
                'line-height:1;font-family:sans-serif">' + mileNum + '</div>',
          iconSize:   [20, 20],
          iconAnchor: [10, 10]
        });
        var marker = L.marker(latlngs[i], { icon: icon });
        marker.addTo(leafletMap);
        activeMileMarkers.push(marker);
        nextMile += MILE_M;
      }
    }
  }

  // --- Elevation profile SVG --------------------------------------------------
  function renderElevationChart(gpxLayer, container) {
    var elevData = typeof gpxLayer.get_elevation_data === 'function'
      ? gpxLayer.get_elevation_data() : null;

    if (!elevData || elevData.length < 2) { container.style.display = 'none'; return; }

    var W = 600, H = 54, pad = 4;
    var maxDist = elevData[elevData.length - 1][0]; // km (leaflet-gpx d[0] unit)
    var eles    = elevData.map(function(d) { return d[1]; }); // metres
    var minEle  = Math.min.apply(null, eles);
    var maxEle  = Math.max.apply(null, eles);
    var range   = maxEle - minEle || 1;

    var pts = elevData.map(function(d) {
      var x = (d[0] / maxDist) * W;
      var y = H - pad - ((d[1] - minEle) / range) * (H - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');

    // Closed polygon for fill
    var fill = pts + ' ' + W + ',' + H + ' 0,' + H;

    var totalMi = (maxDist * 0.621371).toFixed(1); // km \u2192 miles
    var minFt   = Math.round(minEle * 3.28084);
    var maxFt   = Math.round(maxEle * 3.28084);

    container.innerHTML =
      '<p class="kc-elev-label">Elevation</p>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" ' +
           'style="width:100%;height:48px;display:block">' +
        '<polygon points="' + fill + '" fill="rgba(186,56,48,.18)"/>' +
        '<polyline points="' + pts + '" fill="none" stroke="#BA3830" ' +
                 'stroke-width="1.8" stroke-linejoin="round"/>' +
      '</svg>' +
      '<div class="kc-elev-footer">' +
        '<span>0 mi</span>' +
        '<span>' + maxFt + '\u2009ft max \u00B7 ' + minFt + '\u2009ft min</span>' +
        '<span>' + totalMi + ' mi</span>' +
      '</div>';

    container.style.display = '';
  }

  // --- Bootstrap --------------------------------------------------------------
  function buildPage(routes) {
    allRoutes = routes;

    // Find the WordPress page content entry point
    var entry = document.querySelector('.entry-content, .wp-block-post-content, main article, #page');
    if (!entry) entry = document.body;

    // Inject our wrapper before whatever WP put there
    var wrap = el('div', { id: 'kc-routes-wrap', style: 'background:' + C.bg + ';min-height:60vh;padding-bottom:64px' });

    wrap.appendChild(buildHeader());
    wrap.appendChild(buildFilterBar());
    wrap.appendChild(el('div', { id: 'kc-routes-grid' }));
    var resetBtn = el('button', { className: 'kc-reset-btn' }, 'Clear filters');
    resetBtn.addEventListener('click', function() {
      filterOrigin = 'all'; filterDistance = 'all'; filterSearch = ''; sortDir = 'alpha';
      var s = document.getElementById('kc-routes-search'); if (s) s.value = '';
      var fb = document.getElementById('kc-routes-filters');
      if (fb) fb.parentNode.replaceChild(buildFilterBar(), fb);
      render();
    });
    wrap.appendChild(el('div', { id: 'kc-routes-empty' }, [
      el('div', { style: 'font-size:2rem' }, '\uD83D\uDD0D'),
      el('p', {}, 'No routes match your filters.'),
      resetBtn
    ]));

    // Replace or prepend into entry
    var firstChild = entry.firstElementChild;
    if (firstChild) entry.insertBefore(wrap, firstChild);
    else entry.appendChild(wrap);

    // Hide any native WP archive/no-results content (e.g. "Archive: Routes, nothing found")
    Array.from(entry.children).forEach(function(child) {
      if (child.id !== 'kc-routes-wrap') child.style.display = 'none';
    });

    buildModal();
    render();

    // Deep-link: auto-open route modal if URL hash matches #route-{id}
    if (location.hash && location.hash.indexOf('#route-') === 0) {
      var routeId = location.hash.slice(7);
      var linked = allRoutes.filter(function(r) { return String(r.route_id) === routeId; })[0];
      if (linked) openModal(linked);
    }
  }

  function init() {
    if (!document.getElementById('kc-routes-styles')) injectStyles();

    // Background fetch of route history — non-blocking; modal reads from routeHistoryMap when it opens
    fetch(HISTORY_JSON)
      .then(function(r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function(data) { routeHistoryMap = data.history || {}; })
      .catch(function() { /* history is optional — silently skip */ });

    // Show spinner while Leaflet + routes.json load
    var entry = document.querySelector('.entry-content, .wp-block-post-content, main article, #page') || document.body;
    var loadingEl = el('div', { id: 'kc-routes-loading', style: 'display:flex;align-items:center;justify-content:center;min-height:40vh' }, [
      el('div', { className: 'kc-spinner' })
    ]);
    entry.insertBefore(loadingEl, entry.firstChild);

    loadLibraries(function() {
      fetch(ROUTES_JSON)
        .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function(data) {
          var s = document.getElementById('kc-routes-loading');
          if (s) s.parentNode.removeChild(s);
          buildPage(Array.isArray(data) ? data : []);
        })
        .catch(function(e) {
          var s = document.getElementById('kc-routes-loading');
          if (s) s.innerHTML = '<p style="color:#8A8A9A;font-size:.9rem;margin:0">Unable to load routes. Please try again later.</p>';
          console.warn('kc-routes: failed to load routes.json', e);
        });
    });
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
