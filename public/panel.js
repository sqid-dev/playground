// The Sqid panel. The first screen is the reveal (an anonymous visitor becomes a person) with two
// next steps: "Send this to my app" (webhooks) and "Put Sqid on my site" (a real site and its
// snippet). Live events, things to try and the recipes sit behind Explore.
//
// It listens to the real SDK on this page (window.squid), to the page (sqid:page events from
// site.js) and to the local API (/_sqid/*). Nothing here is mocked: what it shows is what Sqid did.
(function(){
  'use strict';
  const cfg   = window.SQID_PLAYGROUND || { site : {}, page : '' };
  const root  = document.getElementById('sqid-panel');
  if(!root){ return; }
  const cap   = (s) => String(s || '').replace(/\b[a-z]/g, c => c.toUpperCase());
  const esc   = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&' : '&amp;', '<' : '&lt;', '>' : '&gt;', '"' : '&quot;', "'" : '&#39;' }[c]));
  const t0    = performance.timeOrigin ? performance.now() : 0;
  const since = () => ((performance.now() - t0) / 1000).toFixed(2) + 's';
  const store = {
    get(k, d){ try{ let v = JSON.parse(localStorage.getItem('sqid.playground.' + k)); return v == null ? d : v; }catch(error){ return d; } },
    set(k, v){ try{ localStorage.setItem('sqid.playground.' + k, JSON.stringify(v)); }catch(error){ /* private mode */ } },
    sget(k, d){ try{ let v = JSON.parse(sessionStorage.getItem('sqid.playground.' + k)); return v == null ? d : v; }catch(error){ return d; } },
    sset(k, v){ try{ sessionStorage.setItem('sqid.playground.' + k, JSON.stringify(v)); }catch(error){ /* private mode */ } }
  };
  const VIEWS    = ['home', 'send', 'golive', 'explore'];
  const EXPLORE  = { live : 'Live events', scenarios : 'Things to try', recipes : 'Recipes' };
  const CONSOLE  = () => S.state?.console || 'https://app.sqid.dev';

  // ---- svg bits -----------------------------------------------------------------------------------
  const ICON = {
    done : '<svg width="16" height="16" viewBox="0 0 20 20" role="img" aria-label="done"><circle cx="10" cy="10" r="9" fill="#22d3ee"></circle><path d="M6 10.5l2.5 2.5L14 7.5" stroke="#0b0b0d" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
    now  : '<svg width="16" height="16" viewBox="0 0 20 20" role="img" aria-label="current"><circle cx="10" cy="10" r="8" stroke="#22d3ee" stroke-width="2" fill="none"></circle><circle cx="10" cy="10" r="3" fill="#22d3ee"></circle></svg>',
    todo : '<svg width="16" height="16" viewBox="0 0 20 20" role="img" aria-label="pending"><circle cx="10" cy="10" r="8" stroke="#52525b" stroke-width="2" fill="none"></circle></svg>',
    arrow: '<svg width="20" height="20" viewBox="0 0 22 22" role="img" aria-label="became"><path d="M3 11h14M12 6l5 5-5 5" stroke="#22d3ee" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
    next : '<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
  };

  // ---- state --------------------------------------------------------------------------------
  const S = {
    view      : VIEWS.includes(store.get('view', 'home')) ? store.get('view', 'home') : 'home',
    explore   : EXPLORE[store.get('explore', 'live')] ? store.get('explore', 'live') : 'live',
    state     : null,          // /_sqid/state
    connected : false,
    sdkFailed : false,
    visitor   : null,          // engine.visitor()
    traits    : null,          // visitor.identified detail
    identified: null,
    timeToId  : null,
    log       : store.sget('log', []),
    done      : store.get('done', {}),   // scenario id -> true
    record    : null,          // the visitor's full record from the console
    recordErr : null,
    showRecord: false,
    details   : false,         // setup checklist open
    note      : null,          // a message under "Be someone new"
    webhooks  : [],
    goLive    : store.get('golive', null),
    hidden    : store.get('hidden', false)
  };
  if(S.hidden){ document.body.classList.add('pg-panel-hidden'); }

  // ---- log ----------------------------------------------------------------------------------
  function log(kind, detail, cls){
    S.log.unshift({ at : since(), page : cfg.path, kind, detail, cls : cls || 'pg-muted', t : Date.now() });
    S.log = S.log.slice(0, 80);
    store.sset('log', S.log);
    if(S.view === 'explore' || S.view === 'home'){ render(); }
  }

  // ---- scenarios ----------------------------------------------------------------------------
  const SCENARIOS = [
    { id : 'arrive',   t : 'Get identified on arrival',           where : '/',        label : 'home' },
    { id : 'variants', t : 'Switch sizes without buying',         where : '/desk',    label : 'a desk' },
    { id : 'identify', t : 'Sign in and call squid.identify()',   where : '/signin',  label : 'Sign in' },
    { id : 'form',     t : 'Start the demo form, stop halfway',   where : '/demo',    label : 'Book a demo' },
    { id : 'cart',     t : 'Add to cart, then go quiet',          where : '/cart',    label : 'Cart' },
    { id : 'pricing',  t : 'Come back to Pricing three times',    where : '/pricing', label : 'Pricing' },
    { id : 'label',    t : 'Click a labelled button (key event)', where : null,       label : 'any page' },
    { id : 'exit',     t : 'Move the mouse to leave (exit intent)', where : null,     label : 'any page' }
  ];
  function done(id){ if(S.done[id]){ return; } S.done[id] = true; store.set('done', S.done); }

  document.addEventListener('sqid:page', e => {
    let d = e.detail;
    if(d.what === 'variant_switch'){ log('variants', `${d.option}: ${d.value}  (${d.switches} switches, ${d.hovers} hovers)`, 'pg-vio'); if(d.switches >= 3){ done('variants'); } }
    if(d.what === 'variant_hover'){ log('variants', `hovering between options (${d.hovers} looks, ${d.switches} switches)`, 'pg-vio'); }
    if(d.what === 'add_to_cart'){ log('page', `add to cart: ${d.size}, ${d.finish}, qty ${d.qty}`); }
    if(d.what === 'cart_stall'){ log('behaviour', `cart untouched for ${d.after_s}s (cart stall shape)`, 'pg-yel'); done('cart'); }
    if(d.what === 'discount_declined'){ log('behaviour', 'discount code declined (discount_codes shape)', 'pg-yel'); }
    if(d.what === 'form_stall'){ log('behaviour', `form stalled after ${d.fields.join(', ')} (form_stall shape)`, 'pg-yel'); done('form'); }
    if(d.what === 'form_submit'){ log('page', `demo form submitted (${d.fields.length} fields)`); }
    if(d.what === 'identify'){ log('identify', `squid.identify({ email: "${d.email}" })`, 'pg-acc'); done('identify'); }
    if(d.what === 'label_click'){ log('click', `${d.type} "${d.label}"`); done('label'); }
    if(d.what === 'pricing_visit'){ log('page', `pricing visit ${d.visits} this session${d.visits >= 3 ? ' (deliberation shape)' : ''}`); if(d.visits >= 3){ done('pricing'); } }
    if(d.what === 'exit_intent'){ log('behaviour', 'pointer left the page (exit intent)', 'pg-yel'); done('exit'); }
    render();
  });
  document.addEventListener('sqid:recipe', e => log('recipe', `${e.detail.recipe}: ${e.detail.text}`, 'pg-acc'));

  // ---- the SDK --------------------------------------------------------------------------------
  function whenSquid(cb, tries = 200){
    if(window.squid && window.squid.engine){ return cb(window.squid); }
    if(tries <= 0){ S.sdkFailed = true; log('sdk', 'the SDK did not load: is this origin allowed on the site?', 'pg-yel'); return render(); }
    setTimeout(() => whenSquid(cb, tries - 1), 100);
  }
  whenSquid(squid => {
    log('sdk', `loaded v${squid.VERSION || '?'}`, 'pg-ok');
    squid.connection().then(c => { S.connected = !!c?.online; log('connected', `device ${String(c?.device || '').slice(0, 8)}… id ${String(c?.id || '').slice(0, 8)}…`, 'pg-ok'); render(); }).catch(() => {});
    let engine = new squid.engine();
    const snap = () => { try{ S.visitor = engine.visitor(); }catch(error){ S.visitor = null; } };
    engine.on('visitor.synced', e => { snap(); log('visitor.synced', S.visitor?.identified ? 'identified' : 'unknown'); });
    engine.on('visitor.identified', e => {
      snap(); S.traits = e.detail; S.identified = true; S.timeToId = e.detail?.time_to_id ?? null;
      log('visitor.identified', `${cap(e.detail?.name) || e.detail?.email || '?'} · ${cap(e.detail?.company)} · ${cap(e.detail?.company_role)}${S.timeToId != null ? `  (${S.timeToId} ms)` : ''}`, 'pg-acc');
      done('arrive');
      window.SqidRecipes && window.SqidRecipes.apply(e.detail);
      loadRecord(); render();
    });
    engine.on('visitor.unknown', e => { snap(); S.traits = null; S.identified = false; S.timeToId = e.detail?.time_to_id ?? null; log('visitor.unknown', `anonymous (${S.timeToId ?? '?'} ms)`); window.SqidRecipes && window.SqidRecipes.apply(null); render(); });
    engine.on('visitor.moment', e => log('visitor.moment', `${e.detail?.kind} → ${e.detail?.decision?.action}: ${e.detail?.decision?.instruction || ''}`, 'pg-yel'));
    engine.on('error', e => log('error', e.detail?.message || String(e.detail), 'pg-yel'));
    snap(); render();
  });

  // ---- local API ------------------------------------------------------------------------------
  async function get(path){ let r = await fetch(path); let d = await r.json().catch(() => null); if(!r.ok){ throw Object.assign(new Error(d?.message || r.statusText), { data : d }); } return d; }
  async function post(path, body){ let r = await fetch(path, { method : 'POST', headers : { 'content-type' : 'application/json' }, body : JSON.stringify(body || {}) }); let d = await r.json().catch(() => null); if(!r.ok){ throw Object.assign(new Error(d?.message || r.statusText), { data : d }); } return d; }
  async function loadState(){ try{ S.state = await get('/_sqid/state'); S.webhooks = S.state.webhooks || []; }catch(error){ S.state = { error : error.message }; } render(); }
  let recordFor = null;
  async function loadRecord(){
    let id = S.visitor?.meta?.user_id; if(!id || recordFor === id){ return; }
    recordFor = id; S.record = null; S.recordErr = null;
    try{ S.record = await get(`/_sqid/visitors/${encodeURIComponent(id)}`); }catch(error){ S.recordErr = error.message; }
    render();
  }
  loadState();

  // ---- actions ----------------------------------------------------------------------------------
  const A = {
    go(view){ S.view = VIEWS.includes(view) ? view : 'home'; store.set('view', S.view); render(); root.querySelector('.pg-body')?.scrollTo(0, 0); },
    explore(key){ S.explore = key; store.set('explore', key); S.view = 'explore'; store.set('view', 'explore'); render(); },
    hide(){ S.hidden = true; store.set('hidden', true); document.body.classList.add('pg-panel-hidden'); mountShow(); },
    again(){
      // Replay the reveal: the page loads as a stranger and Sqid resolves the same person again.
      S.log = []; store.sset('log', []); recordFor = null;
      try{ sessionStorage.removeItem('rc.exit'); }catch(error){ /* ignore */ }
      location.reload();
    },
    async someoneNew(btn){
      // Matching is by device, so a private window usually comes back as the same person. On a
      // Sandbox, squid.anonymouse() forgets the made-up identity and the next load gets a new one.
      let squid = window.squid;
      if(!squid || typeof squid.anonymouse !== 'function'){
        S.note = 'This version of the Sqid script cannot reset the visitor. In the console, open this person under Identities and use Forget identity, then reload.';
        return render();
      }
      btn.disabled = true; btn.textContent = 'Resetting…';
      try{
        let r = await squid.anonymouse();
        if(r && r.forgotten === false){
          S.note = 'This is a real site, not the Sandbox: the visitor was marked inactive, but the same person will come back. A new test person is a Sandbox feature.';
          btn.disabled = false; btn.textContent = 'Be someone new'; return render();
        }
        log('reset', 'squid.anonymouse(): identity forgotten, reloading', 'pg-acc');
        S.log = []; store.sset('log', []); recordFor = null;
        location.reload();
      }catch(error){
        S.note = `Could not reset (${error.message}). In the console, open this person under Identities and use Forget identity, then reload.`;
        btn.disabled = false; btn.textContent = 'Be someone new'; render();
      }
    },
    toggleRecipe(key){ window.SqidRecipes.toggle(key); window.SqidRecipes.apply(S.traits); render(); },
    showCode(key){ S.code = S.code === key ? null : key; render(); },
    copy(text, btn){ navigator.clipboard?.writeText(text).then(() => { let was = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => btn.textContent = was, 1200); }); },
    async addWebhook(form){
      let url = form.url.value.trim(); let btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      S.hookErr = null;
      try{ let r = await post('/_sqid/webhooks', { url, event : 'identification' }); S.webhooks = r.webhooks || []; log('webhook', `added ${url}`, 'pg-ok'); form.url.value = ''; }
      catch(error){ S.hookErr = error.message; log('webhook', `could not add: ${error.message}`, 'pg-yel'); }
      btn.disabled = false; render();
    },
    async testWebhook(id, btn){
      btn.disabled = true; btn.textContent = 'Sending…';
      try{ let r = await post(`/_sqid/webhooks/${id}/test`); let status = r?.status || r?.response?.status || 'sent'; S.lastTest = { id, ok : true, text : `Test sent. Your app answered: ${status}.` }; log('webhook', `test delivery: ${status}`, 'pg-ok'); }
      catch(error){ S.lastTest = { id, ok : false, text : `The test did not go through: ${error.message}` }; log('webhook', `test failed: ${error.message}`, 'pg-yel'); }
      btn.disabled = false; btn.textContent = 'Send a test'; render();
    },
    async sample(){
      if(S.showSample){ S.showSample = false; return render(); }
      S.showSample = true; render();
      if(!S.sample){ try{ S.sample = await get('/_sqid/sample'); }catch(error){ S.sample = { error : error.message }; } render(); }
    },
    async createSite(form){
      let btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Creating…';
      S.goLiveErr = null;
      try{ let r = await post('/_sqid/sites', { name : form.name.value.trim(), url : form.url.value.trim() }); S.goLive = { site : r.site, snippet : r.snippet, origins : r.origins, at : Date.now() }; store.set('golive', S.goLive); log('go live', `site "${r.site.name}" created`, 'pg-ok'); pollSite(); }
      catch(error){ S.goLiveErr = error.message; }
      btn.disabled = false; btn.textContent = 'Create my site'; render();
    },
    forgetGoLive(){ S.goLive = null; store.set('golive', null); render(); }
  };
  let polling = null;
  function pollSite(){
    if(polling || !S.goLive?.site?.id){ return; }
    polling = setInterval(async () => {
      try{ let s = await get(`/_sqid/sites/${S.goLive.site.id}/status`); if(s){ S.goLive.status = s; store.set('golive', S.goLive); if(s.connected){ clearInterval(polling); polling = null; log('go live', `${s.name} is connected: the stream is live`, 'pg-ok'); } render(); } }catch(error){ /* keep trying */ }
    }, 5000);
  }
  if(S.goLive && !S.goLive.status?.connected){ pollSite(); }

  // ---- render -------------------------------------------------------------------------------------
  function render(){
    if(S.hidden){ return; }
    // Keep what someone is typing: renders happen on every SDK or page event.
    let typed = [...root.querySelectorAll('input[name]')].map(i => [i.closest('form')?.dataset.form + ':' + i.name, i.value, document.activeElement === i]);
    let body = ({ home : viewHome, send : viewSend, golive : viewGoLive, explore : viewExplore }[S.view] || viewHome)(S.state);
    root.innerHTML = `
      <div class="pg-top">
        <span class="dot" aria-hidden="true"></span><span class="name">Sqid</span>
        <span class="site" title="${esc(cfg.site.id)}">${cfg.site.sandbox ? 'Sandbox' : esc(cfg.site.name || '')}</span>
        <span class="conn ${S.connected ? 'on' : ''}" title="${S.connected ? 'Connected' : 'Connecting'}"><i></i><span class="lbl">${S.connected ? 'Connected' : 'Connecting'}</span></span>
        <button class="pg-btn ghost ${S.view === 'explore' ? 'on' : ''}" data-act="explore" aria-pressed="${S.view === 'explore'}">Explore</button>
        <button class="pg-btn ghost" data-act="hide" title="Hide the panel">Hide</button>
      </div>
      <div class="pg-body">${S.view !== 'home' ? `<button class="pg-back" data-go="home">&larr; Back</button>` : ''}${body}</div>`;
    for(let [key, value, focused] of typed){
      let [form, name] = key.split(':');
      let el = root.querySelector(`form[data-form="${form}"] input[name="${name}"]`);
      if(el){ el.value = value; if(focused){ el.focus(); } }
    }
    wire();
  }

  // One line for the five setup checks; the list is behind "Details".
  function status(st){
    let hooks = S.webhooks || [];
    let steps = [
      { t : 'Signed in to Sqid', s : st?.email ? `${st.email}${st.plan?.has ? ` (${st.plan.name || 'Developer'} plan)` : ''}` : st?.error || 'checking…', ok : !!st?.email },
      { t : `${cfg.site.sandbox ? 'Sandbox site' : 'Site'} ready`, s : st?.site ? `${st.site.name}, ${location.origin} allowed` : '…', ok : !!st?.site },
      { t : 'Sqid script on this page', s : S.sdkFailed ? 'It did not load. Add this address to the site\'s allowed origins in the console.' : S.connected ? 'Loaded and connected.' : 'Loading…', ok : S.connected },
      { t : 'Somewhere to send records', s : hooks.length ? `${hooks.length} web address${hooks.length > 1 ? 'es' : ''} (webhooks)` : 'None yet. Optional: "Send this to my app".', ok : hooks.length > 0, optional : true },
      { t : 'A visitor identified', s : S.identified ? 'Yes, on this page.' : 'Happens on the first identification.', ok : !!S.identified }
    ];
    let line, cls;
    if(st?.error){ line = 'Not signed in to Sqid. Restart the playground to sign in.'; cls = 'warn'; }
    else if(S.sdkFailed){ line = 'The Sqid script did not load on this page.'; cls = 'warn'; }
    else if(!S.connected){ line = 'Connecting to Sqid…'; cls = ''; }
    else if(S.identified){ line = `Working. ${cfg.site.sandbox ? 'Test site, no credits used.' : ''}`; cls = 'ok'; }
    else { line = 'Connected. Waiting for the answer…'; cls = ''; }
    return `
      <div class="pg-status ${cls}">
        <i aria-hidden="true"></i><span class="txt">${esc(line)}</span>
        <button class="pg-link" data-act="details" aria-expanded="${S.details}">${S.details ? 'Hide details' : 'Details'}</button>
      </div>
      ${S.details ? `<ul class="pg-checks">${steps.map(x => `<li>${x.ok ? ICON.done : ICON.todo}<div><span class="t">${esc(x.t)}${x.optional ? ' <span class="pg-muted">(optional)</span>' : ''}</span><span class="s">${esc(x.s)}</span></div></li>`).join('')}</ul>` : ''}`;
  }

  function reveal(){
    let v = S.visitor, tr = S.traits;
    let anon = `<div class="who anon"><span class="k">Anonymous visitor</span><span class="n">No name yet</span><span class="m">${esc(deviceLine())}</span></div>`;
    let known = S.identified
      ? `<div class="who known"><span class="k">Identified</span><span class="n">${esc(cap(tr?.name) || tr?.email || '')}</span><span class="m">${esc(cap(tr?.company) || '')}</span></div>`
      : S.identified === false
        ? `<div class="who anon"><span class="k">Still anonymous</span><span class="n">Not identified</span><span class="m">that happens on real sites too</span></div>`
        : `<div class="who anon"><span class="k">Looking…</span><span class="n">Sqid is working</span><span class="m">${S.connected ? 'connected' : 'connecting'}</span></div>`;
    return `<div class="pg-reveal">${anon}${ICON.arrow}${known}</div>`;
  }
  function deviceLine(){ let ua = navigator.userAgent; let dev = /Mobi/.test(ua) ? 'phone' : 'computer'; let ref = 'came in directly'; try{ if(document.referrer){ ref = `from ${new URL(document.referrer).hostname}`; } }catch(error){ /* ignore */ } return `${dev}, ${ref}`; }

  function viewHome(st){
    let tr = S.traits;
    let secs = S.timeToId != null ? (S.timeToId / 1000).toFixed(2) : null;
    let headline = S.identified
      ? `Sqid knew who this was${secs ? ` in ${secs} seconds` : ''}.`
      : S.identified === false ? 'Sqid could not tell who this visitor is.' : 'A stranger just opened this page.';
    let rows = S.identified ? [['Name', cap(tr?.name) || tr?.email], ['Company', cap(tr?.company)], ['Title', cap(tr?.company_role)]].filter(r => r[1]) : [];
    let json = S.record ? JSON.stringify(S.record, null, 2) : null;
    return `
      ${status(st)}
      <div class="pg-card hi pg-hero">
        <h2 class="pg-h">${esc(headline)}</h2>
        ${reveal()}
        ${rows.length ? `<dl class="pg-facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : `<p class="pg-p small">${S.identified === false ? 'No identity came back for this visitor.' : 'When Sqid works out who it is, their name, company and title appear here, and the site on the left changes its headline.'}</p>`}
        ${S.identified ? `
          <button class="pg-link" data-act="record" aria-expanded="${S.showRecord}">${S.showRecord ? 'Hide the full record' : 'See the full record'}</button>
          ${S.showRecord ? (json
            ? `<pre class="pg-mono pg-scroll" id="pg-record">${esc(json)}</pre><div class="pg-row"><button class="pg-btn" data-copytext="record">Copy</button><span class="pg-muted small">This is what "Send this to my app" delivers.</span></div>`
            : `<p class="pg-p small">${S.recordErr ? `Could not read the record: ${esc(S.recordErr)}` : 'Loading…'}</p>`) : ''}` : ''}
        <div class="pg-row pg-wrap">
          <button class="pg-btn" data-act="someone-new">Be someone new</button>
          <button class="pg-link" data-act="again">Replay</button>
        </div>
        ${S.note ? `<p class="pg-p small pg-yel">${esc(S.note)}</p>` : ''}
        ${cfg.site.sandbox ? '<p class="pg-p small">This is your Sandbox: every visitor is one of fifty made-up test people, and nothing costs credits.</p>' : ''}
      </div>
      <div class="pg-next">
        <button class="pg-cta" data-go="send"><span><b>Send this to my app</b><span>Get each identified visitor's record at a web address you choose.</span></span>${ICON.next}</button>
        <button class="pg-cta" data-go="golive"><span><b>Put Sqid on my site</b><span>Create your site and copy one line of code into it.</span></span>${ICON.next}</button>
      </div>`;
  }

  function viewSend(st){
    let hooks = S.webhooks || [];
    return `
      <h2 class="pg-h">Send this to my app</h2>
      <p class="pg-p">Each time Sqid identifies a visitor, it sends their record to a web address in your app (a webhook). Any https address works, including a free request catcher if you just want to look.</p>
      ${hooks.length ? `<ul class="pg-list">${hooks.map(h => `<li class="pg-item"><i class="pg-dot ${h.enabled ? 'on' : ''}" aria-hidden="true"></i><span class="pg-url" title="${esc(h.url)}">${esc(h.url)}</span><span class="r"><button class="pg-btn" data-test="${esc(h.id)}">Send a test</button></span></li>${S.lastTest?.id === h.id ? `<li class="pg-p small ${S.lastTest.ok ? 'pg-ok' : 'pg-yel'}">${esc(S.lastTest.text)}</li>` : ''}`).join('')}</ul>` : ''}
      <form class="pg-form" data-form="webhook">
        <label class="pg-muted small" for="pg-hook-url">${hooks.length ? 'Add another address' : 'Your app\'s address'}</label>
        <div class="pg-row"><input class="pg-input" id="pg-hook-url" name="url" type="url" placeholder="https://your-app.com/api/sqid" required><button class="pg-btn primary" type="submit">Add</button></div>
        ${S.hookErr ? `<span class="pg-yel small">${esc(S.hookErr)}</span>` : ''}
      </form>
      <div>
        <button class="pg-link" data-act="sample" aria-expanded="${!!S.showSample}">${S.showSample ? 'Hide the example' : 'See an example of what gets sent'}</button>
        ${S.showSample ? `<pre class="pg-mono pg-scroll" style="margin-top:8px">${S.sample ? esc(JSON.stringify(S.sample, null, 2)) : 'Loading…'}</pre>` : ''}
      </div>
      <p class="pg-p small">Sandbox records are marked <span class="pg-mono">"sandbox": true</span>. Moments (Signals) are only sent from a real site, never from the Sandbox. <a href="https://docs.sqid.dev/sdk/events" target="_blank" rel="noopener">All the fields</a></p>`;
  }

  function viewGoLive(st){
    let g = S.goLive;
    return `
      <h2 class="pg-h">Put Sqid on my site</h2>
      ${g ? `
        <p class="pg-p">Your site <b class="pg-strong">${esc(g.site.name)}</b> is ready for ${esc(g.origins.join(', '))}. Paste this just before <span class="pg-mono">&lt;/head&gt;</span> on every page, publish, then open your site once.</p>
        <pre class="pg-mono" id="pg-snippet">${esc(g.snippet)}</pre>
        <div class="pg-row pg-wrap"><button class="pg-btn primary" data-copytext="snippet">Copy the code</button><span class="small" style="color:${g.status?.connected ? '#4ade80' : '#a1a1aa'}">${g.status?.connected ? 'Connected. Your site is live.' : g.status?.deployed ? 'Seen a page view, connecting…' : 'Waiting for the first visit…'}</span></div>
        <div class="pg-row pg-wrap"><a href="${esc(CONSOLE())}" target="_blank" rel="noopener" class="small">Open the console</a><button class="pg-link" data-act="forget">Start over</button></div>`
      : `
        <p class="pg-p">Give your website's address. Sqid adds the site to your account and gives you one line of code to paste into it.</p>
        <form class="pg-form" data-form="site">
          <label class="pg-muted small">Website address<input class="pg-input" name="url" type="url" placeholder="https://www.yourcompany.com" required></label>
          <label class="pg-muted small">Name (optional)<input class="pg-input" name="name" type="text" placeholder="Marketing site" maxlength="50"></label>
          <button class="pg-btn primary big" type="submit">Create my site</button>
          ${S.goLiveErr ? `<span class="pg-yel small">${esc(S.goLiveErr)}</span>` : ''}
        </form>`}
      <div class="pg-card">
        <b>Paying for it</b>
        <p class="pg-p small">The Sandbox is free. A real site uses prepaid credits on the Developer plan: $0.25 each. Add a card and you get 25 welcome credits. Nothing is charged unless you buy credits or turn on auto-reload. With no credits left, your site stops identifying new visitors until you add more.</p>
        <div class="pg-row pg-wrap"><a class="pg-btn accent" href="${esc(CONSOLE())}/billing?add=card" target="_blank" rel="noopener">Add a card</a><a href="https://sqid.dev/pricing" target="_blank" rel="noopener" class="small">Pricing</a></div>
      </div>
      <button class="pg-link" data-act="more" aria-expanded="${!!S.showMore}">${S.showMore ? 'Hide other ways' : 'Other ways: from my code editor, or inside my product'}</button>
      ${S.showMore ? `
        <div class="pg-card">
          <b>From my code editor</b>
          <p class="pg-p small">Claude Code adds the code to your layout and writes the webhook handler for your framework. In a terminal (or in Claude Code, type ! first):</p>
          <pre class="pg-mono">claude mcp add --transport http --scope user sqid https://mcp.sqid.dev/mcp</pre>
          <p class="pg-p small">Then in Claude Code: <span class="pg-mono">/mcp</span>, pick sqid, Authenticate (your browser signs you in), and type <span class="pg-mono">/sqid:setup</span>. <a href="https://docs.sqid.dev/getting-started/agents" target="_blank" rel="noopener">Step by step</a></p>
          <pre class="pg-mono">npx -y @sqid-dev/sqid init</pre>
        </div>
        <div class="pg-card">
          <b>Inside my product</b>
          <p class="pg-p small">Identify visitors in your own app or on your customers' sites, with the visitor API and server-side enrichment. Reselling it is the OEM plan: OEM Launch is $675/month with 500 identifications/month included.</p>
          <div class="pg-row pg-wrap"><a href="https://docs.sqid.dev/api-reference/overview" target="_blank" rel="noopener" class="small">API reference</a><a href="https://sqid.dev/#oem" target="_blank" rel="noopener" class="small">OEM plan</a></div>
        </div>` : ''}`;
  }

  function viewExplore(){
    let body = ({ live : exLive, scenarios : exScenarios, recipes : exRecipes }[S.explore] || exLive)();
    return `
      <div class="pg-seg" role="tablist">${Object.entries(EXPLORE).map(([k, t]) => `<button role="tab" aria-selected="${S.explore === k}" data-explore="${k}">${t}</button>`).join('')}</div>
      ${body}`;
  }

  function exLive(){
    return `
      <div class="pg-row"><p class="pg-p grow">Everything the Sqid script and the page did, newest first.</p><button class="pg-btn" data-act="clearlog">Clear</button></div>
      <div class="pg-log">${S.log.length ? S.log.map(e => `<div class="ev"><span class="at">${esc(e.at)}</span><span><span class="k ${esc(e.cls)}">${esc(e.kind)}</span>  <span class="d">${esc(e.detail)}</span>${e.page && e.page !== cfg.path ? ` <span class="pg-muted">${esc(e.page)}</span>` : ''}</span></div>`).join('') : '<span class="pg-muted">Nothing yet.</span>'}</div>`;
  }

  function exScenarios(){
    return `
      <p class="pg-p">Things to do on the site on the left. Each one shows up under Live events as Sqid sees it.</p>
      <ul class="pg-list">${SCENARIOS.map(s => { let on = s.where === cfg.path; return `<li class="pg-item ${on && !S.done[s.id] ? 'now' : ''}">${S.done[s.id] ? ICON.done : on ? ICON.now : ICON.todo}<span class="grow">${esc(s.t)}</span><span class="r">${S.done[s.id] ? 'done' : s.where ? (on ? '<span class="pg-acc">this page</span>' : `<a href="${s.where}">${esc(s.label)}</a>`) : esc(s.label)}</span></li>`; }).join('')}</ul>
      <div class="pg-card">
        <span class="pg-label">ON THIS PAGE</span>
        <div class="pg-log">${S.log.filter(e => e.page === cfg.path).slice(0, 6).map(e => `<div class="ev"><span class="at">${esc(e.at)}</span><span><span class="k ${esc(e.cls)}">${esc(e.kind)}</span>  <span class="d">${esc(e.detail)}</span></span></div>`).join('') || '<span class="pg-muted">Nothing on this page yet.</span>'}</div>
        <p class="pg-p small">On a real site with Signals on, these become moments (choosing_options, form_stall, cart_stall, deliberation). The Sandbox never sends moments; it shows the raw behaviour only.</p>
      </div>`;
  }

  function exRecipes(){
    let R = window.SqidRecipes, on = R.enabled();
    let open = S.code && R.all[S.code] ? S.code : null;
    return `
      <p class="pg-p">Turn a recipe on and the site changes. Each one is the code from the docs, running on this visitor.</p>
      <ul class="pg-list">${Object.entries(R.all).map(([k, r]) => `<li class="pg-item ${open === k ? 'now' : ''}" style="cursor:pointer" data-code="${k}"><button class="pg-toggle ${on.includes(k) && !r.locked ? 'on' : ''}" data-recipe="${k}" ${r.locked ? 'disabled' : ''} aria-label="toggle ${esc(r.title)}"><i></i></button><span class="grow">${esc(r.title)}</span><span class="r ${r.locked ? 'pg-yel' : ''}">${esc(r.where)}</span></li>`).join('')}</ul>
      ${open ? `<div>
        <div class="pg-row"><span class="pg-label grow">${esc(R.all[open].title.toUpperCase())}</span><a href="${R.all[open].docs}" target="_blank" rel="noopener" class="small">Docs</a><button class="pg-btn" data-copy="${open}">Copy</button></div>
        <pre class="pg-mono" style="margin-top:8px">${esc(R.all[open].code)}</pre>
        <p class="pg-p small" style="margin-top:6px">${R.all[open].locked ? 'The Sandbox never sends moments. Put Sqid on a real site and turn Signals on to see this one fire.' : S.traits ? `Running with ${esc(cap(S.traits.name) || S.traits.email)}'s profile. "Be someone new" on the first screen changes it.` : 'Waiting for an identified visitor.'}</p>
      </div>` : '<span class="pg-muted small">Click a recipe to see its code.</span>'}`;
  }

  // ---- wiring ---------------------------------------------------------------------------------------
  function wire(){
    root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => A.go(b.dataset.go)));
    root.querySelectorAll('[data-explore]').forEach(b => b.addEventListener('click', () => A.explore(b.dataset.explore)));
    root.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      let a = b.dataset.act;
      if(a === 'hide'){ A.hide(); } if(a === 'again'){ A.again(); } if(a === 'sample'){ A.sample(); } if(a === 'forget'){ A.forgetGoLive(); }
      if(a === 'someone-new'){ A.someoneNew(b); }
      if(a === 'explore'){ A.go(S.view === 'explore' ? 'home' : 'explore'); }
      if(a === 'details'){ S.details = !S.details; render(); }
      if(a === 'record'){ S.showRecord = !S.showRecord; render(); }
      if(a === 'more'){ S.showMore = !S.showMore; render(); }
      if(a === 'clearlog'){ S.log = []; store.sset('log', []); render(); }
    }));
    root.querySelectorAll('[data-recipe]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); A.toggleRecipe(b.dataset.recipe); }));
    root.querySelectorAll('[data-code]').forEach(li => li.addEventListener('click', () => A.showCode(li.dataset.code)));
    root.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); A.copy(window.SqidRecipes.all[b.dataset.copy].code, b); }));
    root.querySelectorAll('[data-copytext]').forEach(b => b.addEventListener('click', () => { let el = document.getElementById(b.dataset.copytext === 'record' ? 'pg-record' : 'pg-snippet'); if(el){ A.copy(el.textContent, b); } }));
    root.querySelectorAll('[data-test]').forEach(b => b.addEventListener('click', () => A.testWebhook(b.dataset.test, b)));
    let wf = root.querySelector('form[data-form="webhook"]'); wf && wf.addEventListener('submit', e => { e.preventDefault(); A.addWebhook(wf); });
    let sf = root.querySelector('form[data-form="site"]'); sf && sf.addEventListener('submit', e => { e.preventDefault(); A.createSite(sf); });
  }
  function mountShow(){
    if(document.getElementById('pg-show')){ return; }
    let b = document.createElement('button'); b.id = 'pg-show'; b.className = 'pg-btn primary'; b.textContent = 'Sqid panel';
    b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:60;height:36px;box-shadow:0 8px 24px rgba(0,0,0,.25)';
    b.addEventListener('click', () => { S.hidden = false; store.set('hidden', false); document.body.classList.remove('pg-panel-hidden'); b.remove(); render(); });
    document.body.appendChild(b);
  }
  if(S.hidden){ mountShow(); } else { render(); }
  window.SqidRecipes && window.SqidRecipes.apply(null);
})();
