(function(){
  'use strict';
  var CAL='kansascityfrontrunners@gmail.com';
  var KEY='GOOGLE_CALENDAR_API_KEY';
  var ROUTES='https://kcfrontrunners.github.io/routes/data/routes.json';
  var KCRT_JS='https://kcfrontrunners.github.io/routes/js/kc-route-modal.js';
  var DAYS=30;
  var MAX=3;

  /* ── utilities ── */
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function stripHtml(h){return(h||'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&#(\d+);/g,function(_,n){return String.fromCharCode(parseInt(n,10));}).replace(/&#x([0-9a-f]+);/gi,function(_,n){return String.fromCharCode(parseInt(n,16));});}
  function fmtTime(s){if(!s||s.length===10)return'';var d=new Date(s);return d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/Chicago'});}
  function parseStatus(desc){
    var text=stripHtml(desc||''),kinds=['cancelled','moved','urgent','update'],i,m;
    for(i=0;i<kinds.length;i++){m=text.match(new RegExp('^'+kinds[i]+'\\s*:\\s*(.*)$','im'));if(m)return{kind:kinds[i],msg:m[1].trim()};}
    return null;
  }
  function parseRefs(desc){
    var text=stripHtml(desc||''),refs=[],m;
    var pat=/^((?:run|walk)\s+)?route(?:\s*\([^)]*\))?\s*:\s*(.+)$/gim;
    while((m=pat.exec(text))!==null){
      var prefix=(m[1]||'').trim().toLowerCase();
      var v=m[2].trim();
      var routeType=prefix==='run'?'run':prefix==='walk'?'walk':'';
      refs.push(v.match(/^https?:\/\//)?{type:'url',val:v,routeType:routeType}:{type:'slug',val:v.toLowerCase(),routeType:routeType});
    }
    return refs;
  }
  function extraDesc(desc,maxLen){
    maxLen=maxLen||100;
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
  function mapsUrl(loc){return'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(loc);}

  /* ── relative date label ── */
  function relLabel(e){
    var s=e.start.dateTime||e.start.date;
    var todayStr=(new Date()).toLocaleDateString('en-CA',{timeZone:'America/Chicago'});
    var eventStr=s.length===10?s:(new Date(s)).toLocaleDateString('en-CA',{timeZone:'America/Chicago'});
    var tp=todayStr.split('-').map(Number),ep=eventStr.split('-').map(Number);
    var diff=Math.round((new Date(ep[0],ep[1]-1,ep[2])-new Date(tp[0],tp[1]-1,tp[2]))/86400000);
    var day=diff===0?'TODAY':diff===1?'TOMORROW':(new Date(s.length===10?s+'T12:00:00':s)).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'America/Chicago'}).toUpperCase();
    var t=fmtTime(s);
    return t?day+' · '+esc(t):day;
  }

  /* ── find "When we meet" section ── */
  function findSection(){
    var el=document.getElementById('kc-when-we-meet');
    if(el)return el;
    var ss=document.querySelectorAll('.wp-block-group.alignfull');
    for(var i=0;i<ss.length;i++){
      if(ss[i].querySelector('a[href="/schedule"]')&&getComputedStyle(ss[i]).backgroundColor!=='rgba(0, 0, 0, 0)')return ss[i];
    }
    return null;
  }

  var PIN='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;flex-shrink:0"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

  /* ── fallback chip for unmatched URL routes ── */
  function buildFallbackChip(item){
    var ps='display:inline-flex;align-items:center;gap:6px;background:rgba(186,56,48,.2);border:1px solid rgba(186,56,48,.35);border-radius:6px;padding:4px 10px;font-size:.78rem;font-weight:600;color:var(--kc-red-text,#F28C84);text-decoration:none';
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

  /* ── render one event card (returns DOM element) ── */
  function renderCard(e,routes){
    var start=e.start.dateTime||e.start.date;
    var status=parseStatus(e.description);
    var refs=parseRefs(e.description);
    var matched=refs.map(function(r){var f=findRoute(r,routes);if(f)return{route:f,routeType:r.routeType};if(r.type==='url')return{route:null,routeType:r.routeType,fallbackUrl:r.val};return null;}).filter(Boolean);
    var loc=(e.location||'').trim();
    var locShort=loc?loc.split(',')[0].trim():'';
    var cancelled=status&&status.kind==='cancelled';

    var outer=document.createElement('div');
    outer.style.cssText='background:var(--kc-surface,#212129);border:1px solid rgba(255,255,255,.09);border-radius:12px;overflow:hidden;margin-bottom:12px';

    /* status banner */
    if(status){
      var bc=status.kind==='moved'?'#F5A623':status.kind==='update'?'#6BA3E8':'#F28C84';
      var bb=status.kind==='moved'?'rgba(180,100,0,.35)':status.kind==='update'?'rgba(14,58,140,.35)':'rgba(186,56,48,.35)';
      var banner=document.createElement('div');
      banner.style.cssText='background:'+bb+';color:'+bc+';padding:7px 22px;font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase';
      banner.textContent=status.kind+(status.msg?': '+status.msg:'');
      outer.appendChild(banner);
    }

    /* body */
    var body=document.createElement('div');
    body.style.cssText='padding:22px 24px;opacity:'+(cancelled?'0.5':'1');

    /* date */
    var dateEl=document.createElement('div');
    dateEl.style.cssText='font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--kc-red-text,#F28C84);margin-bottom:8px';
    dateEl.innerHTML=relLabel(e);
    body.appendChild(dateEl);

    /* event name */
    var nameEl=document.createElement('p');
    nameEl.style.cssText='font-size:1.15rem;font-weight:700;color:var(--wp--preset--color--contrast,#F0EDE8);margin:0 0 14px;line-height:1.3';
    nameEl.textContent=e.summary||'Event';
    body.appendChild(nameEl);

    /* location */
    if(locShort){
      var locEl=document.createElement('a');
      locEl.href=mapsUrl(loc);locEl.target='_blank';locEl.rel='noopener';
      locEl.style.cssText='display:inline-flex;align-items:center;gap:6px;font-size:.9rem;color:#C5C2BC;text-decoration:none;margin-bottom:'+(matched.length?'12':'0')+'px';
      locEl.innerHTML=PIN+' '+esc(locShort);
      body.appendChild(locEl);
    }

    /* extra description */
    var extra=extraDesc(e.description,100);
    if(extra){
      var extraEl=document.createElement('p');
      extraEl.style.cssText='font-size:.85rem;color:var(--kc-text-muted,#8A8A9A);margin:10px 0 0;line-height:1.45';
      extraEl.textContent=extra;
      body.appendChild(extraEl);
    }

    /* route section */
    matched.forEach(function(item){
      if(item.route&&window.KCRT){
        var labelRow=document.createElement('div');
        labelRow.style.cssText='font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--kc-text-muted,#8A8A9A);margin-top:12px';
        labelRow.textContent=item.routeType==='run'?'Run route':item.routeType==='walk'?'Walk route':'Route';
        body.appendChild(labelRow);
        body.appendChild(window.KCRT.renderMiniCard(item.route,item.routeType));
      }else if(item.fallbackUrl){
        body.appendChild(buildFallbackChip(item));
      }
    });

    outer.appendChild(body);
    return outer;
  }

  /* ── news card ── */
  function renderNewsCard(post){
    var title=stripHtml((post.title&&post.title.rendered)||'');
    var excerpt=stripHtml((post.excerpt&&post.excerpt.rendered)||'');
    if(excerpt.length>160)excerpt=excerpt.slice(0,159).replace(/\s\S*$/,'')+'…';
    var date=post.date?new Date(post.date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'America/Chicago'}):'';
    var html='<div style="background:var(--kc-surface,#212129);border:1px solid rgba(255,255,255,.09);border-top:3px solid var(--kc-red,#C0392B);border-radius:12px;padding:22px 24px;margin-bottom:12px">';
    if(date)html+='<div style="font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--kc-text-muted,#C4C4D4);margin-bottom:8px">'+esc(date)+'</div>';
    html+='<p style="font-size:1.05rem;font-weight:700;color:var(--wp--preset--color--contrast,#F0EDE8);margin:0 0 8px;line-height:1.35">'+esc(title)+'</p>';
    if(excerpt)html+='<p style="font-size:.88rem;color:var(--kc-text-muted,#C4C4D4);margin:0 0 14px;line-height:1.5">'+esc(excerpt)+'</p>';
    if(post.link)html+='<a href="'+esc(post.link)+'" style="font-size:.85rem;font-weight:600;color:var(--kc-red-text,#F28C84);text-decoration:none">Read more →</a>';
    html+='</div>';
    return html;
  }
  function showNewsSection(posts){
    var old=document.getElementById('kc-home-news');
    if(old)old.parentNode.removeChild(old);
    if(!posts||!posts.length)return;
    var section=findSection();
    if(!section)return;
    var el=document.createElement('div');
    el.id='kc-home-news';
    el.setAttribute('style','max-width:var(--wp--style--global--wide-size,960px);margin:0 auto;width:100%;padding:0 0 32px');
    var inner='<h2 style="font-size:1.5rem;font-weight:700;color:var(--wp--preset--color--contrast,#F0EDE8);margin:0 0 16px">Club news</h2>';
    posts.forEach(function(p){inner+=renderNewsCard(p);});
    el.innerHTML=inner;
    section.parentNode.insertBefore(el,section);
  }

  /* ── photo gallery ── */
  function shuffle(arr){var a=arr.slice(),i=a.length,j,t;while(i--){j=Math.floor(Math.random()*(i+1));t=a[i];a[i]=a[j];a[j]=t;}return a;}
  function renderGallery(photos){
    var gallery=document.querySelector('.wp-block-gallery.alignwide');
    if(!gallery||!photos||!photos.length)return;
    var picked=shuffle(photos).slice(0,4);
    var html='';
    picked.forEach(function(p){
      var sizes=p.media_details&&p.media_details.sizes;
      var src=(sizes&&sizes.medium&&sizes.medium.source_url)||p.source_url;
      var alt=p.alt_text||'KC Frontrunners photo';
      html+='<figure class="wp-block-image size-medium has-custom-border"><img src="'+esc(src)+'" alt="'+esc(alt)+'" loading="lazy" style="border-radius:8px"></figure>';
    });
    gallery.innerHTML=html;
  }

  /* ── today alert banner ── */
  function todayAlert(events){
    var tz='America/Chicago';
    var todayStr=(new Date()).toLocaleDateString('en-CA',{timeZone:tz});
    var priority=['urgent','cancelled','moved','update'];
    for(var p=0;p<priority.length;p++){
      for(var i=0;i<events.length;i++){
        var e=events[i];
        var s=e.start.dateTime||e.start.date;
        var eDay=s.length===10?s:(new Date(s)).toLocaleDateString('en-CA',{timeZone:tz});
        if(eDay!==todayStr)continue;
        var st=parseStatus(e.description);
        if(st&&st.kind===priority[p])return{kind:st.kind,msg:st.msg,summary:e.summary||''};
      }
    }
    return null;
  }
  function showAlertBanner(alert){
    var old=document.getElementById('kc-alert-banner');
    if(old)old.parentNode.removeChild(old);
    if(!alert)return;
    var pal={
      cancelled:{bg:'rgba(110,16,12,.97)',border:'rgba(186,56,48,.55)',text:'#FFE0DC',badge:'#F28C84'},
      moved:    {bg:'rgba(100,58,0,.97)', border:'rgba(200,130,0,.55)',text:'#FFE8C4',badge:'#F5A623'},
      urgent:   {bg:'rgba(90,66,0,.97)',  border:'rgba(210,165,0,.55)',text:'#FFF4C2',badge:'#F5D020'},
      update:   {bg:'rgba(14,42,90,.97)', border:'rgba(36,108,192,.55)',text:'#C8DEFF',badge:'#6BA3E8'},
    };
    var c=pal[alert.kind]||pal.urgent;
    var body=alert.msg||(alert.summary||'See the schedule for details.');
    var el=document.createElement('div');
    el.id='kc-alert-banner';
    el.setAttribute('style','width:100%;box-sizing:border-box;background:'+c.bg+';border-bottom:1px solid '+c.border+';padding:14px 24px;display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap');
    el.innerHTML=
      '<span style="flex-shrink:0;margin-top:2px;font-size:.68rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;background:'+c.badge+';color:#1a0800;border-radius:4px;padding:3px 9px">'+esc(alert.kind)+'</span>'+
      '<span style="flex:1;min-width:200px;font-size:.95rem;line-height:1.55;color:'+c.text+'">'+esc(body)+'</span>';
    var hero=document.getElementById('kc-hero');
    if(hero&&hero.parentNode)hero.parentNode.insertBefore(el,hero);
  }

  /* ── inject into page ── */
  function inject(events,routes,posts,photos){
    showAlertBanner(todayAlert(events));
    showNewsSection(posts||[]);
    renderGallery(photos||[]);
    var section=findSection();
    if(!section)return;

    var now=new Date();
    var upcoming=[];
    for(var i=0;i<events.length&&upcoming.length<MAX;i++){
      var s=events[i].start.dateTime||events[i].start.date;
      if(new Date(s.length===10?s+'T12:00:00':s)>now)upcoming.push(events[i]);
    }

    var wrap=document.createElement('div');
    wrap.id='kc-home-upcoming';
    wrap.style.cssText='max-width:var(--wp--style--global--wide-size,960px);margin:0 auto;width:100%';

    var h2=document.createElement('h2');
    h2.style.cssText='font-size:1.5rem;font-weight:700;color:var(--wp--preset--color--contrast,#F0EDE8);margin:0 0 20px';
    h2.textContent='Coming up';
    wrap.appendChild(h2);

    if(upcoming.length){
      upcoming.forEach(function(e){wrap.appendChild(renderCard(e,routes));});
      var more=document.createElement('div');
      more.style.cssText='margin-top:16px';
      more.innerHTML='<a href="/schedule" style="font-size:.9rem;font-weight:500;color:var(--kc-link,#80A6D9);text-decoration:none">View full schedule →</a>';
      wrap.appendChild(more);
    }else{
      var none=document.createElement('p');
      none.style.cssText='color:var(--kc-text-muted,#8A8A9A)';
      none.innerHTML='No upcoming events scheduled. <a href="/schedule" style="color:var(--kc-link,#80A6D9)">Check the full schedule</a>.';
      wrap.appendChild(none);
    }

    section.innerHTML='';
    section.appendChild(wrap);
    section.style.visibility='visible';
  }

  /* ── load KCRT module ── */
  function loadKCRT(cb){
    if(window.KCRT){cb();return;}
    var s=document.createElement('script');
    s.src=KCRT_JS;
    s.onload=cb;
    s.onerror=function(){console.warn('kc-home-events: could not load KCRT, routes will fall back to links');cb();};
    document.head.appendChild(s);
  }

  /* ── fetch ── */
  function load(){
    var now=new Date(),max=new Date(+now+DAYS*86400000);
    var calUrl='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(CAL)+'/events?key='+KEY+'&singleEvents=true&orderBy=startTime&timeMin='+now.toISOString()+'&timeMax='+max.toISOString()+'&maxResults=50';
    var newsUrl='https://kcfrontrunners.org/wp-json/wp/v2/posts?sticky=true&per_page=3&_fields=id,title,excerpt,date,link&orderby=date&order=desc';
    var photosUrl='https://kcfrontrunners.org/wp-json/wp/v2/media?media_type=image&parent=494&per_page=20&orderby=date&order=desc&_fields=id,source_url,alt_text,media_details';
    Promise.all([fetch(calUrl),fetch(ROUTES),fetch(newsUrl),fetch(photosUrl)])
      .then(function(rs){
        if(!rs[0].ok)throw new Error('Cal '+rs[0].status);
        return Promise.all([rs[0].json(),rs[1].ok?rs[1].json():Promise.resolve([]),rs[2].ok?rs[2].json():Promise.resolve([]),rs[3].ok?rs[3].json():Promise.resolve([])]);
      })
      .then(function(data){inject(data[0].items||[],data[1],data[2],data[3]);})
      .catch(function(err){
        console.error('kc-home-events:',err);
        var s=findSection();if(s)s.style.visibility='visible';
      });
  }

  loadKCRT(function(){load();});
})();
