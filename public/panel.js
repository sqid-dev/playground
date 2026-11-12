// The Sqid panel. Six tabs: Start, Live, Scenarios, Recipes, Delivery, Go live. It listens to
// the real SDK on this page (window.squid), to the page (sqid:page events from site.js) and to
// the local API (/_sqid/*). Nothing here is mocked: what it shows is what Sqid did.
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
    set(k, v){ localStorage.setItem('sqid.playground.' + k, JSON.stringify(v)); },
    sget(k, d){ try{ let v = JSON.parse(sessionStorage.getItem('sqid.playground.' + k)); return v == null ? d : v; }catch(error){ return d; } },
    sset(k, v){ sessionStorage.setItem('sqid.playground.' + k, JSON.stringify(v)); }
  };

  // ---- state --------------------------------------------------------------------------------
  const S = {
    tab       : store.get('tab', 'start'),
    state     : null,          // /_sqid/state
    connected : false,
    visitor   : null,          // engine.visitor()
    traits    : null,          // visitor.identified detail
    identified: null,
    timeToId  : null,
    log       : store.sget('log', []),
    done      : store.get('done', {}),   // scenario id -> true
    record    : null,          // last visitor record from the API
    recordErr : null,
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
    if(S.tab === 'live' || S.tab === 'start' || S.tab === 'scenarios'){ render(); }
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
    if(tries <= 0){ log('sdk', 'the SDK did not load: is this origin allowed on the site?', 'pg-yel'); return render(); }
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
    tab(name){ S.tab = name; store.set('tab', name); render(); },
    hide(){ S.hidden = true; store.set('hidden', true); document.body.classList.add('pg-panel-hidden'); mountShow(); },
    again(){
      // Replay the reveal: the page loads as a stranger and Sqid resolves the person again. The
      // Sandbox pins one person to this device (a new visitor id gets the same person back), so a
      // different person needs a private window or another device until the SDK has a reset call.
      S.log = []; store.sset('log', []); recordFor = null;
      sessionStorage.removeItem('rc.exit');
      location.reload();
    },
    toggleRecipe(key){ window.SqidRecipes.toggle(key); window.SqidRecipes.apply(S.traits); render(); },
    showCode(key){ S.code = S.code === key ? null : key; render(); },
    copy(text, btn){ navigator.clipboard?.writeText(text).then(() => { btn.textContent = 'Copied'; setTimeout(() => btn.textContent = 'Copy', 1200); }); },
    async addWebhook(form){
      let url = form.url.value.trim(); let btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try{ let r = await post('/_sqid/webhooks', { url, event : 'identification' }); S.webhooks = r.webhooks || []; log('webhook', `added ${url}`, 'pg-ok'); form.url.value = ''; }
      catch(error){ log('webhook', `could not add: ${error.message}`, 'pg-yel'); }
      btn.disabled = false; render();
    },
    async testWebhook(id, btn){
      btn.disabled = true; btn.textContent = 'Sending…';
      try{ let r = await post(`/_sqid/webhooks/${id}/test`); log('webhook', `test delivery: ${r?.status || r?.response?.status || 'sent'}`, 'pg-ok'); S.lastTest = r; }
      catch(error){ log('webhook', `test failed: ${error.message}`, 'pg-yel'); }
      btn.disabled = false; btn.textContent = 'Send test'; render();
    },
    async sample(){ try{ S.sample = await get('/_sqid/sample'); }catch(error){ S.sample = { error : error.message }; } S.showSample = true; render(); },
    async createSite(form){
      let btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Creating…';
      try{ let r = await post('/_sqid/sites', { name : form.name.value.trim(), url : form.url.value.trim() }); S.goLive = { site : r.site, snippet : r.snippet, origins : r.origins, at : Date.now() }; store.set('golive', S.goLive); log('go live', `site "${r.site.name}" created`, 'pg-ok'); pollSite(); }
      catch(error){ S.goLiveErr = error.message; }
      btn.disabled = false; btn.textContent = 'Create site and get my snippet'; render();
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

  // ---- svg bits -----------------------------------------------------------------------------------
  const ICON = {
    done : '<svg width="18" height="18" viewBox="0 0 20 20" role="img" aria-label="done"><circle cx="10" cy="10" r="9" fill="#22d3ee"></circle><path d="M6 10.5l2.5 2.5L14 7.5" stroke="#0b0b0d" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
    now  : '<svg width="18" height="18" viewBox="0 0 20 20" role="img" aria-label="current"><circle cx="10" cy="10" r="8" stroke="#22d3ee" stroke-width="2" fill="none"></circle><circle cx="10" cy="10" r="3" fill="#22d3ee"></circle></svg>',
    todo : '<svg width="18" height="18" viewBox="0 0 20 20" role="img" aria-label="pending"><circle cx="10" cy="10" r="8" stroke="#52525b" stroke-width="2" fill="none"></circle></svg>',
    arrow: '<svg width="20" height="20" viewBox="0 0 22 22" role="img" aria-label="became"><path d="M3 11h14M12 6l5 5-5 5" stroke="#22d3ee" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
  };

  // ---- render -------------------------------------------------------------------------------------
  function render(){
    if(S.hidden){ return; }
    let st = S.state;
    root.innerHTML = `
      <div class="pg-top">
        <span class="dot" aria-hidden="true"></span><span class="name">SQID ${cfg.site.sandbox ? 'SANDBOX' : 'SITE'}</span>
        <span class="site" title="${esc(cfg.site.id)}">${esc(cfg.site.name || '')}</span>
        <span class="conn ${S.connected ? 'on' : ''}"><i></i>${S.connected ? 'Connected' : 'Connecting'}</span>
        <button class="pg-btn" data-act="hide" title="Hide the panel">Hide</button>
      </div>
      <div class="pg-tabs" role="tablist">${['start', 'live', 'scenarios', 'recipes', 'delivery', 'golive'].map(k => `<button role="tab" aria-selected="${S.tab === k}" data-tab="${k}">${{ start : 'Start', live : 'Live', scenarios : 'Scenarios', recipes : 'Recipes', delivery : 'Delivery', golive : 'Go live' }[k]}</button>`).join('')}</div>
      <div class="pg-body">${({ start : tabStart, live : tabLive, scenarios : tabScenarios, recipes : tabRecipes, delivery : tabDelivery, golive : tabGoLive }[S.tab] || tabStart)(st)}</div>`;
    wire();
  }

  function reveal(){
    let v = S.visitor, tr = S.traits;
    let anon = `<div class="who anon"><span class="k">Anonymous</span><span class="n">Visitor ${esc(String(v?.meta?.user_id || '').slice(0, 6) || '…')}…</span><span class="m">${esc(deviceLine())}</span></div>`;
    let known = S.identified
      ? `<div class="who known"><span class="k">Identified${S.timeToId != null ? ` in ${(S.timeToId / 1000).toFixed(2)} s` : ''}</span><span class="n">${esc(cap(tr?.name) || tr?.email || '')}</span><span class="m">${esc([cap(tr?.company_role), cap(tr?.company)].filter(Boolean).join(' · '))}</span></div>`
      : S.identified === false
        ? `<div class="who anon"><span class="k">Still anonymous</span><span class="n">Sqid could not identify this visitor</span><span class="m">that happens on real sites too</span></div>`
        : `<div class="who anon"><span class="k">Resolving…</span><span class="n">Sqid is looking</span><span class="m">${S.connected ? 'connected, waiting for the answer' : 'connecting'}</span></div>`;
    return `<div class="pg-reveal">${anon}${ICON.arrow}${known}</div>`;
  }
  function deviceLine(){ let ua = navigator.userAgent; let dev = /Mobi/.test(ua) ? 'mobile' : 'desktop'; let ref = document.referrer ? new URL(document.referrer).hostname : 'direct'; return `${dev} · ${ref} · ${cfg.path}`; }

  function tabStart(st){
    let hooks = S.webhooks || [];
    let steps = [
      { t : 'Signed in to Sqid', s : st?.email ? `${st.email}${st.plan?.has ? ` · ${st.plan.name || 'Developer'} plan` : ''}` : (st?.error ? st.error : 'checking…'), ok : !!st?.email },
      { t : `${cfg.site.sandbox ? 'Sandbox' : 'Site'} provisioned`, s : st ? `${st.site.name} · ${location.origin} allowed` : '…', ok : !!st?.site },
      { t : 'Script added to layout', s : S.connected ? 'This page loads it. Connected.' : 'This page loads it; waiting for the connection.', ok : S.connected },
      { t : 'Webhook wired', s : hooks.length ? `${hooks.length} endpoint${hooks.length > 1 ? 's' : ''} on the site` : 'Where should identified visitors go? Add your endpoint in Delivery, or just watch the record there.', ok : hooks.length > 0, cta : hooks.length ? null : 'delivery' },
      { t : 'Stream is live', s : S.identified ? 'A visitor was identified on this page.' : 'Confirmed on the first identification.', ok : !!S.identified }
    ];
    let firstTodo = steps.findIndex(x => !x.ok);
    return `
      <h2 class="pg-h">Set up Sqid</h2>
      <p class="pg-p">Five steps. The site on the left is your test site. Nothing here costs credits.</p>
      <ol class="pg-steps">${steps.map((x, i) => `<li class="pg-step ${x.ok ? '' : i === firstTodo ? 'now' : 'todo'}">${x.ok ? ICON.done : i === firstTodo ? ICON.now : ICON.todo}<div class="body"><span class="t">${esc(x.t)}</span><span class="s">${esc(x.s)}</span>${!x.ok && x.cta ? `<div class="pg-row"><button class="pg-btn primary" data-tab="${x.cta}">Open Delivery</button></div>` : ''}</div></li>`).join('')}</ol>
      <div class="pg-card">
        <div class="pg-row"><span class="pg-label">THIS VISITOR</span><button class="pg-btn grow-0" style="margin-left:auto" data-act="again">Watch it again</button></div>
        ${reveal()}
        <span class="pg-p" style="font-size:12px">${S.identified ? 'The page loaded as a stranger. Sqid resolved the person and the headline changed. The full record is in Delivery.' : 'The page loaded as a stranger. When Sqid resolves the person, this flips and the headline on the left changes.'}</span>
      </div>
      <div class="pg-foot">
        <span class="pg-label">SAME THING FROM A TERMINAL OR CLAUDE</span>
        <pre class="pg-mono">npx -y @sqid-dev/playground
<span class="pg-muted">/sqid:setup   in Claude Code</span></pre>
      </div>`;
  }

  function tabLive(){
    return `
      <div class="pg-row"><h2 class="pg-h">Live</h2><button class="pg-btn" style="margin-left:auto" data-act="clearlog">Clear</button></div>
      <p class="pg-p">Everything the SDK and the page did, newest first. Survives navigation within this tab session.</p>
      <div class="pg-log">${S.log.length ? S.log.map(e => `<div class="ev"><span class="at">${esc(e.at)}</span><span><span class="k ${esc(e.cls)}">${esc(e.kind)}</span>  <span class="d">${esc(e.detail)}</span>${e.page && e.page !== cfg.path ? ` <span class="pg-muted">${esc(e.page)}</span>` : ''}</span></div>`).join('') : '<span class="pg-muted">Nothing yet.</span>'}</div>`;
  }

  function tabScenarios(){
    let tr = S.traits;
    return `
      <div>
        <span class="pg-label">WHO YOU ARE</span>
        <div class="pg-card hi" style="margin-top:8px">
          <div class="pg-row"><div class="grow"><div><b>${esc(cap(tr?.name) || (S.identified === false ? 'Unknown visitor' : 'Resolving…'))}</b></div><div class="pg-muted" style="font-size:12px">${esc(tr ? [cap(tr.company_role), cap(tr.company), tr.email].filter(Boolean).join(' · ') : 'the Sandbox gives every new visitor one made-up person')}</div></div><button class="pg-btn" data-act="again">Watch it again</button></div>
        </div>
        <p class="pg-p" style="font-size:12px;margin-top:8px">Sandbox test people, like Stripe test cards. Real sites resolve real people; the Sandbox hands out one of fifty and never spends a credit. This device keeps its person; a private window or another device gets a different one.</p>
      </div>
      <div>
        <span class="pg-label">THINGS TO TRY</span>
        <ul class="pg-list" style="margin-top:8px">${SCENARIOS.map(s => { let on = s.where === cfg.path; return `<li class="pg-item ${on && !S.done[s.id] ? 'now' : ''}">${S.done[s.id] ? ICON.done : on ? ICON.now : ICON.todo}<span>${esc(s.t)}</span><span class="r">${S.done[s.id] ? 'done' : s.where ? (on ? '<span class="pg-acc">this page</span>' : `<a href="${s.where}">${esc(s.label)}</a>`) : esc(s.label)}</span></li>`; }).join('')}</ul>
      </div>
      <div class="pg-card">
        <span class="pg-label">WHAT THE SDK SAW HERE</span>
        <div class="pg-log">${S.log.filter(e => e.page === cfg.path).slice(0, 6).map(e => `<div class="ev"><span class="at">${esc(e.at)}</span><span><span class="k ${esc(e.cls)}">${esc(e.kind)}</span>  <span class="d">${esc(e.detail)}</span></span></div>`).join('') || '<span class="pg-muted">Nothing on this page yet.</span>'}</div>
        <span class="pg-p" style="font-size:12px">On a real site with Signals on, these shapes become moments (choosing_options, form_stall, cart_stall, deliberation). The Sandbox shows the raw behaviour only.</span>
      </div>`;
  }

  function tabRecipes(){
    let R = window.SqidRecipes, on = R.enabled();
    let open = S.code && R.all[S.code] ? S.code : null;
    return `
      <p class="pg-p">Turn a recipe on and this site changes. Each one is the code from the docs, running against the live profile.</p>
      <ul class="pg-list">${Object.entries(R.all).map(([k, r]) => `<li class="pg-item ${open === k ? 'now' : ''}" style="cursor:pointer" data-code="${k}"><button class="pg-toggle ${on.includes(k) && !r.locked ? 'on' : ''}" data-recipe="${k}" ${r.locked ? 'disabled' : ''} aria-label="toggle ${esc(r.title)}"><i></i></button><span>${esc(r.title)}</span><span class="r ${r.locked ? 'pg-yel' : ''}">${esc(r.where)}</span></li>`).join('')}</ul>
      ${open ? `<div>
        <div class="pg-row"><span class="pg-label">${esc(R.all[open].title.toUpperCase())}</span><a href="${R.all[open].docs}" target="_blank" rel="noopener" style="margin-left:auto;font-size:12px">Docs</a><button class="pg-btn" data-copy="${open}">Copy</button></div>
        <pre class="pg-mono" style="margin-top:8px">${esc(R.all[open].code)}</pre>
        <span class="pg-p" style="font-size:12px;display:block;margin-top:6px">${R.all[open].locked ? 'Sandbox sites never receive moments. Add a card and put Sqid on a real site to see this one fire.' : S.traits ? `Running with ${esc(cap(S.traits.name) || S.traits.email)}'s profile. Click "Be someone else" in Scenarios to see it change.` : 'Waiting for an identified visitor.'}</span>
      </div>` : '<span class="pg-muted">Click a recipe to see its code.</span>'}`;
  }

  function tabDelivery(st){
    let rec = S.record;
    let json = rec ? JSON.stringify(rec, null, 2) : null;
    let hooks = S.webhooks || [];
    return `
      <div>
        <span class="pg-label">WHERE IT GOES</span>
        <ul class="pg-list" style="margin-top:8px">
          ${hooks.map(h => `<li class="pg-item"><i style="width:8px;height:8px;border-radius:4px;background:${h.enabled ? '#4ade80' : '#52525b'};flex-shrink:0"></i><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(h.url)}">${esc(h.url)}</span><span class="r"><button class="pg-btn" data-test="${esc(h.id)}">Send test</button></span></li>`).join('')}
          <li class="pg-item"><form class="pg-row grow" data-form="webhook" style="width:100%"><input class="pg-input" name="url" type="url" placeholder="https://your-app.com/api/sqid" required><button class="pg-btn primary" type="submit">Add</button></form></li>
        </ul>
        <span class="pg-p" style="font-size:12px;display:block;margin-top:6px">Any https endpoint works, a request catcher included. Identified visitors on this site are delivered there as the record below.</span>
      </div>
      <div>
        <div class="pg-row"><span class="pg-label">THIS VISITOR'S RECORD</span><span class="pg-mono pg-acc" style="font-size:11px">${rec ? 'profile ' + esc(String(S.visitor?.meta?.user_id || '').slice(0, 8)) + '…' : ''}</span>${json ? `<button class="pg-btn" style="margin-left:auto" data-copytext="record">Copy JSON</button>` : ''}</div>
        ${json ? `<pre class="pg-mono" style="margin-top:8px;max-height:360px;overflow:auto" id="pg-record">${esc(json)}</pre>` : `<span class="pg-p" style="font-size:12px;display:block;margin-top:8px">${S.recordErr ? `Could not read the record: ${esc(S.recordErr)}` : S.identified ? 'Loading from the visitor API…' : 'Appears once this visitor is identified. It is the same record a webhook delivers.'}</span>`}
        <div class="pg-row" style="margin-top:8px"><button class="pg-btn" data-act="sample">Show a webhook sample</button><a href="https://docs.sqid.dev/sdk/events" target="_blank" rel="noopener" style="margin-left:auto;font-size:12px">All the fields</a></div>
        ${S.showSample ? `<pre class="pg-mono" style="margin-top:8px;max-height:280px;overflow:auto">${esc(JSON.stringify(S.sample, null, 2))}</pre>` : ''}
      </div>
      <div class="pg-card warn">
        <span class="pg-label">MOMENTS ARE OFF IN THE SANDBOX</span>
        <span class="pg-p" style="font-size:12px;color:#d4d4d8">Add a card to start the free credit and Signals turns on for your real site. The form stall or cart stall you cause here would then arrive as a moment with an instruction for your agent.</span>
        <div class="pg-row"><a class="pg-btn yellow" href="${esc(st?.console || 'https://app.sqid.dev')}/billing" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;color:#0b0b0d">Start free credit</a><a href="https://docs.sqid.dev/guides/signals" target="_blank" rel="noopener" style="font-size:12px">About moments</a></div>
      </div>`;
  }

  function tabGoLive(st){
    let g = S.goLive;
    return `
      <h2 class="pg-h">Put Sqid on your own thing</h2>
      <p class="pg-p">Same account, same snippet shape. Three ways in; each ends with the stream live and real identifications arriving.</p>
      <div class="pg-card hi">
        <div class="pg-row"><b>My website</b><span class="r pg-acc" style="margin-left:auto;font-size:11px">most people</span></div>
        ${g ? `
          <div class="pg-p" style="font-size:12px">Site <b style="color:#fafafa">${esc(g.site.name)}</b> created for ${esc(g.origins.join(', '))}. Paste this before &lt;/head&gt; on every page, deploy, open the site once.</div>
          <pre class="pg-mono" id="pg-snippet">${esc(g.snippet)}</pre>
          <div class="pg-row"><button class="pg-btn primary" data-copytext="snippet">Copy snippet</button><span class="pg-mono" style="font-size:11px;color:${g.status?.connected ? '#4ade80' : '#a1a1aa'}">${g.status?.connected ? 'Connected: the stream is live' : g.status?.deployed ? 'Page view seen, waiting for the connection…' : 'Waiting for the first page view…'}</span><button class="pg-btn" style="margin-left:auto" data-act="forget">Done</button></div>
          <a href="${esc(st?.console || 'https://app.sqid.dev')}" target="_blank" rel="noopener" style="font-size:12px">Open the console</a>`
        : `
          <form data-form="site" style="display:flex;flex-direction:column;gap:8px">
            <label class="pg-muted" style="font-size:12px">Public URL<input class="pg-input" name="url" type="url" placeholder="https://www.yourcompany.com" required style="margin-top:4px"></label>
            <label class="pg-muted" style="font-size:12px">Name (optional)<input class="pg-input" name="name" type="text" placeholder="Marketing site" maxlength="50" style="margin-top:4px"></label>
            <button class="pg-btn primary" type="submit">Create site and get my snippet</button>
            ${S.goLiveErr ? `<span class="pg-yel" style="font-size:12px">${esc(S.goLiveErr)}</span>` : ''}
          </form>
          <span class="pg-p" style="font-size:12px">Makes the site on your account, shows the one script tag, then waits here for the first real page view.</span>`}
      </div>
      <div class="pg-card">
        <b>My app, from my editor</b>
        <span class="pg-p" style="font-size:12px">Claude Code pastes the snippet into your layout and writes the webhook handler in your framework.</span>
        <pre class="pg-mono">claude mcp add --transport http sqid https://mcp.sqid.dev/mcp
/sqid:setup</pre>
        <pre class="pg-mono">npx -y @sqid-dev/sqid init</pre>
      </div>
      <div class="pg-card">
        <b>Embedded in my product</b>
        <span class="pg-p" style="font-size:12px">Identify visitors inside your own app or on your customers' sites. Server-side enrichment, the visitor API, and OEM terms for resale.</span>
        <div class="pg-row"><a href="https://docs.sqid.dev/api-reference/overview" target="_blank" rel="noopener" style="font-size:12px">API reference</a><a href="https://sqid.dev/#oem" target="_blank" rel="noopener" style="font-size:12px">OEM program</a></div>
      </div>
      <div class="pg-card" style="background:#0e2a30;border-color:#155e75">
        <div class="pg-row"><b>${esc(st?.plan?.name || 'Developer')} plan${st?.plan?.has ? '' : ' (starts with your first site)'}</b><span class="r" style="margin-left:auto;color:#a5f3fc">${st?.plan?.has ? 'you are on it' : 'free'}</span></div>
        <span class="pg-p" style="font-size:12px;color:#d4d4d8">Real identifications start as soon as your site connects. Add a card to unlock the free credit, moments, and higher caps. No charge until you use it.</span>
        <div class="pg-row"><a class="pg-btn accent" href="${esc(st?.console || 'https://app.sqid.dev')}/billing" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;color:#0b0b0d">Add a card</a><a href="https://sqid.dev/pricing" target="_blank" rel="noopener" style="font-size:12px">Compare plans</a></div>
      </div>`;
  }

  // ---- wiring ---------------------------------------------------------------------------------------
  function wire(){
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => A.tab(b.dataset.tab)));
    root.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      let a = b.dataset.act;
      if(a === 'hide'){ A.hide(); } if(a === 'again'){ A.again(); } if(a === 'sample'){ A.sample(); } if(a === 'forget'){ A.forgetGoLive(); }
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
