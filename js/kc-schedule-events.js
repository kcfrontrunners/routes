(function(){
  'use strict';
  var CAL='kansascityfrontrunners@gmail.com';
  var KEY='GOOGLE_CALENDAR_API_KEY';
  var ROUTES='https://kcfrontrunners.github.io/routes/data/routes.json';
  var KCRT_JS='https://kcfrontrunners.github.io/routes/js/kc-route-modal.js';
  var DAYS=90;
  var INITIAL_DAYS=21;
  var root=document.getElementById('kc-sched');
  if(!root)return;

  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function stripHtml(h){
    if(!h)return'';
    var s=String(h);
    s=s.replace(/<br\s*\/?>/gi,' ');
    s=s.replace(/<[^>]+>/g,'');
    s=s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#39;/g,"'").replace(/&quot;/g,'"');
    s=s.replace(/&#(\d+);/g,function(_,n){return String.fromCharCode(parseInt(n,10));}).replace(/&#x([0-9a-f]+);/gi,function(_,n){return String.fromCharCode(parseInt(n,16));});
    return s.trim();
  }
  function fmtDate(s){var d=new Date(s.length===10?s+'T12:00:00':s);return d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'America/Chicago'});}
  function fmtTime(s){if(!s||s.length===10)return'';var d=new Date(s);return d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/Chicago'});}
  function dayKey(s){if(s.length===10)return s;var d=new Date(s);return d.toLocaleDateString('en-CA',{timeZone:'America/Chicago'});}

  function parseRefs(desc){
    var text=stripHtml(desc||''),refs=[],m;
    var pat=new RegExp('^((?:run|walk)\\s+)?route(?:\\s*\\([^)]*\\))?\\s*:\\s*(.+)$','gim');
    while((m=pat.exec(text))!==null){
      var prefix=(m[1]||'').trim().toLowerCase();
      var v=m[2].trim();
      var routeType=prefix==='run'?'run':prefix==='walk'?'walk':'';
      refs.push(/^https?:\/\//.test(v)?{type:'url',val:v,routeType:routeType}:{type:'slug',val:v.toLowerCase(),routeType:routeType});
    }
    return refs;
  }
  function extraDesc(desc,maxLen){
    maxLen=maxLen||130;
    if(!desc)return'';
    var text=stripHtml(desc),keep=[];
    text.split(/[\n\r]+/).forEach(function(line){
      var l=line.trim();
      if(!l||l.length<4)return;
      if(/^(?:(?:run|walk)\s+)?route(?:\s*\([^)]*\))?\s*:/i.test(l))return;
      if(/^(?:cancelled|moved|urgent|update|announcements?)\s*:/i.test(l))return;
      if(/^https?:\/\//i.test(l))return;
      keep.push(l);
    });
    var result=keep.join(' ').replace(/\s+/g,' ').trim();
    if(result.length>maxLen)result=result.slice(0,maxLen-1).replace(/\s\S*$/,'')+'…';
    return result;
  }
  function garminId(u){var m=u.match(/\/course\/(\d+)/);return m?m[1]:null;}
  function gmapId(u){try{var p=new URL(u);if(!p.hostname.includes('gmap-pedometer.com'))return null;return p.searchParams.get('r');}catch(e){return null;}}
  function kcfrId(u){try{var p=new URL(u);if(!p.hostname.includes('kcfrontrunners.org'))return null;var m=p.hash.match(/^#route-(\d+)$/);return m?m[1]:null;}catch(e){return null;}}
  function findRoute(ref,routes){
    var i,r,slug;
    if(ref.type==='url'){
      var gmid=gmapId(ref.val),kcid=kcfrId(ref.val),gid=garminId(ref.val);
      for(i=0;i<routes.length;i++){r=routes[i];
        if(gmid!=null&&String(r.route_id)===gmid)return r;
        if(kcid!=null&&String(r.route_id)===kcid)return r;
        if(r.garmin_url===ref.val)return r;
        if(gid&&r.garmin_url&&garminId(r.garmin_url)===gid)return r;
      }
      return null;
    }
    for(i=0;i<routes.length;i++){r=routes[i];slug=r.display_name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');if(slug===ref.val||r.route_id===ref.val)return r;}
    return null;
  }
  function parseStatus(desc){
    var text=stripHtml(desc||''),kinds=['cancelled','moved','urgent','update'],i,m;
    for(i=0;i<kinds.length;i++){
      m=text.match(new RegExp('^'+kinds[i]+'\\s*:\\s*(.*)$','im'));
      if(m)return{kind:kinds[i],msg:m[1].trim()};
    }
    return null;
  }

  /* ── fallback chip for unmatched URL routes ── */
  function buildFallbackChip(item){
    var ps='display:inline-flex;align-items:center;gap:6px;background:rgba(186,56,48,.2);border:1px solid rgba(186,56,48,.35);border-radius:6px;padding:4px 10px;font-size:.75rem;color:var(--kc-red-text,#F28C84);text-decoration:none';
    var wrap=document.createElement('div');
    wrap.style.cssText='display:flex;align-items:center;gap:8px;margin-top:10px';
    var lbl=document.createElement('span');
    lbl.style.cssText='font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--kc-text-muted,#8A8A9A)';
    lbl.textContent=item.routeType==='run'?'Run route':item.routeType==='walk'?'Walk route':'Route';
    var a=document.createElement('a');
    a.href=item.fallbackUrl;a.target='_blank';a.rel='noopener';a.style.cssText=ps;
    a.innerHTML='&#x2B23; View route';
    wrap.appendChild(lbl);wrap.appendChild(a);
    return wrap;
  }

  /* ── build one event row element ── */
  function buildEventRow(e,routes){
    var start=e.start.dateTime||e.start.date;
    var status=parseStatus(e.description);
    var refs=parseRefs(e.description);
    var matched=refs.map(function(r){var f=findRoute(r,routes);if(f)return{route:f,routeType:r.routeType};if(r.type==='url')return{route:null,routeType:r.routeType,fallbackUrl:r.val};return null;}).filter(Boolean);
    var loc=(e.location||'').split(',')[0].trim();
    var cancelled=status&&status.kind==='cancelled';

    var row=document.createElement('div');
    row.style.cssText='background:var(--kc-surface,#212129);border-radius:10px;padding:14px 16px;margin-bottom:8px;border:1px solid var(--kc-border,rgba(255,255,255,.09));opacity:'+(cancelled?'0.55':'1');

    /* header row: title + badge */
    var header=document.createElement('div');
    header.style.cssText='display:flex;align-items:flex-start;gap:10px;margin-bottom:4px';
    var titleEl=document.createElement('div');
    titleEl.style.cssText='font-weight:600;font-size:.95rem;flex:1;line-height:1.3';
    titleEl.textContent=e.summary||'Event';
    header.appendChild(titleEl);
    if(status){
      var bc=status.kind==='moved'?'#F5A623':status.kind==='update'?'#6BA3E8':'var(--kc-red-text,#F28C84)';
      var bb=status.kind==='moved'?'rgba(180,100,0,.25)':status.kind==='update'?'rgba(14,58,140,.25)':'rgba(186,56,48,.25)';
      var badge=document.createElement('span');
      badge.style.cssText='font-size:.68rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:4px;padding:2px 7px;background:'+bb+';color:'+bc+';flex-shrink:0';
      badge.textContent=status.kind;
      header.appendChild(badge);
    }
    row.appendChild(header);

    /* time */
    var t=fmtTime(start);
    if(t){var tEl=document.createElement('div');tEl.style.cssText='font-size:.85rem;color:var(--kc-text-muted,#8A8A9A);margin-bottom:2px';tEl.textContent=t;row.appendChild(tEl);}

    /* location */
    if(loc){var lEl=document.createElement('div');lEl.style.cssText='font-size:.85rem;color:var(--kc-text-muted,#8A8A9A)';lEl.textContent=loc;row.appendChild(lEl);}

    /* status message */
    if(status&&status.msg){
      var mc=status.kind==='moved'?'#F5A623':status.kind==='update'?'#6BA3E8':'var(--kc-red-text,#F28C84)';
      var msgEl=document.createElement('div');
      msgEl.style.cssText='font-size:.85rem;margin-top:4px;color:'+mc;
      msgEl.textContent=status.msg;
      row.appendChild(msgEl);
    }

    /* extra description */
    var extra=extraDesc(e.description,130);
    if(extra){var xEl=document.createElement('p');xEl.style.cssText='font-size:.85rem;color:var(--kc-text-muted,#8A8A9A);margin:8px 0 0;line-height:1.45';xEl.textContent=extra;row.appendChild(xEl);}

    /* route section */
    matched.forEach(function(item){
      if(item.route&&window.KCRT){
        var labelRow=document.createElement('div');
        labelRow.style.cssText='font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--kc-text-muted,#8A8A9A);margin-top:10px';
        labelRow.textContent=item.routeType==='run'?'Run route':item.routeType==='walk'?'Walk route':'Route';
        row.appendChild(labelRow);
        row.appendChild(window.KCRT.renderMiniCard(item.route,item.routeType));
      }else if(item.fallbackUrl){
        row.appendChild(buildFallbackChip(item));
      }
    });

    return row;
  }

  /* ── build date group fragment ── */
  function buildGroups(groups,order,routes){
    var frag=document.createDocumentFragment();
    order.forEach(function(key){
      var groupWrap=document.createElement('div');
      groupWrap.style.cssText='margin-bottom:28px';
      var dateLabel=document.createElement('div');
      dateLabel.style.cssText='font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--kc-text-muted,#8A8A9A);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--kc-border,rgba(255,255,255,.09))';
      dateLabel.textContent=fmtDate(key);
      groupWrap.appendChild(dateLabel);
      groups[key].forEach(function(e){groupWrap.appendChild(buildEventRow(e,routes));});
      frag.appendChild(groupWrap);
    });
    return frag;
  }

  function render(events,routes){
    if(!events.length){root.innerHTML='<p style="color:var(--kc-text-muted,#8A8A9A);padding:8px 0">No upcoming events scheduled. Check back soon.</p>';return;}
    var now=new Date();
    var cutoff=new Date(now.getTime()+INITIAL_DAYS*86400000);
    var initGroups={},initOrder=[],moreGroups={},moreOrder=[];
    events.forEach(function(e){
      var s=e.start.dateTime||e.start.date,k=dayKey(s);
      var d=new Date(s.length===10?s+'T12:00:00':s);
      if(d<=cutoff){
        if(!initGroups[k]){initGroups[k]=[];initOrder.push(k);}
        initGroups[k].push(e);
      }else{
        if(!moreGroups[k]){moreGroups[k]=[];moreOrder.push(k);}
        moreGroups[k].push(e);
      }
    });

    root.innerHTML='';
    root.appendChild(buildGroups(initGroups,initOrder,routes));

    if(moreOrder.length){
      var moreCount=0;
      moreOrder.forEach(function(k){moreCount+=moreGroups[k].length;});
      var moreWrap=document.createElement('div');
      moreWrap.id='kc-sched-more-wrap';
      moreWrap.style.cssText='margin-top:8px;padding-top:16px;border-top:1px solid var(--kc-border,rgba(255,255,255,.09))';
      var btn=document.createElement('button');
      btn.id='kc-sched-more';
      btn.style.cssText='background:none;border:none;cursor:pointer;font-size:.9rem;font-weight:500;color:var(--kc-link,#80A6D9);padding:0';
      btn.textContent='Show '+moreCount+' more events →';
      btn.addEventListener('click',function(){
        moreWrap.parentNode.removeChild(moreWrap);
        root.appendChild(buildGroups(moreGroups,moreOrder,routes));
      });
      moreWrap.appendChild(btn);
      root.appendChild(moreWrap);
    }
  }

  /* ── load KCRT module ── */
  function loadKCRT(cb){
    if(window.KCRT){cb();return;}
    var s=document.createElement('script');
    s.src=KCRT_JS;
    s.onload=cb;
    s.onerror=function(){console.warn('kc-schedule-events: could not load KCRT, routes will fall back to links');cb();};
    document.head.appendChild(s);
  }

  function load(){
    var now=new Date(),max=new Date(now.getTime()+DAYS*86400000);
    var url='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(CAL)+'/events?key='+KEY+'&singleEvents=true&orderBy=startTime&timeMin='+now.toISOString()+'&timeMax='+max.toISOString()+'&maxResults=200';
    Promise.all([fetch(url),fetch(ROUTES)])
      .then(function(rs){
        if(!rs[0].ok)throw new Error('Calendar '+rs[0].status);
        return Promise.all([rs[0].json(),rs[1].ok?rs[1].json():Promise.resolve([])]);
      })
      .then(function(data){render(data[0].items||[],data[1]);})
      .catch(function(err){console.error('kc-sched:',err);root.innerHTML='<p style="color:var(--kc-red-text,#F28C84);font-size:.9rem">Could not load events. Please try again later.</p>';});
  }

  loadKCRT(function(){load();});
})();
