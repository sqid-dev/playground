// Driftwood's own page behaviour: the bits a real site would have (variant picker, cart count,
// sign-in calling squid.identify). It also tells the panel what the visitor did on the page
// through `sqid:page` events, so scenarios can be ticked off.
(function(){
  'use strict';
  const page = document.body.dataset.page;
  const tell = (what, detail) => document.dispatchEvent(new CustomEvent('sqid:page', { detail : { what, ...detail } }));

  // Wait for the SDK (the snippet loads it async).
  function whenSquid(cb, tries = 150){
    if(window.squid && window.squid.engine){ return cb(window.squid); }
    if(tries <= 0){ return; }
    setTimeout(() => whenSquid(cb, tries - 1), 100);
  }

  // Label the clicks that matter: a real site would do exactly this.
  whenSquid(squid => {
    document.querySelectorAll('[data-sqid-label]').forEach(el => {
      try{ squid.labelClicks({ matches : `[data-sqid-label="${el.dataset.sqidLabel}"]`, label : el.dataset.sqidLabel, type : el.dataset.sqidType || 'key_event' }); }catch(error){ /* older SDK */ }
    });
  });
  document.addEventListener('click', e => {
    let el = e.target.closest('[data-sqid-label]');
    if(el){ tell('label_click', { label : el.dataset.sqidLabel, type : el.dataset.sqidType || 'key_event' }); }
  });

  // Cart count (localStorage, nothing fancy)
  const cartCount = () => Number(localStorage.getItem('driftwood.cart') || 0);
  const el = document.getElementById('cart-count'); if(el){ el.textContent = String(cartCount()); }
  if(page === 'cart' && new URLSearchParams(location.search).get('added')){ localStorage.setItem('driftwood.cart', String(cartCount() + 1)); if(el){ el.textContent = String(cartCount()); } }
  if(page === 'cart' && new URLSearchParams(location.search).get('ordered')){ localStorage.setItem('driftwood.cart', '0'); if(el){ el.textContent = '0'; } }

  // Product page: price and finish follow the picker; count switches for the scenario.
  if(page === 'desk'){
    let form = document.getElementById('product-form');
    let switches = 0, hovers = 0, lastHover = null;
    form.addEventListener('change', e => {
      if(e.target.name === 'size'){ document.getElementById('size-label').textContent = e.target.value; document.getElementById('price').textContent = '$' + e.target.dataset.price; }
      if(e.target.name === 'finish'){ document.getElementById('finish-label').textContent = e.target.value; document.getElementById('desk-art').dataset.finish = e.target.value; }
      switches++; tell('variant_switch', { option : e.target.name, value : e.target.value, switches, hovers });
    });
    form.addEventListener('mouseover', e => {
      let opt = e.target.closest('.opt'); if(!opt || opt === lastHover){ return; }
      lastHover = opt; hovers++;
      if(hovers % 3 === 0){ tell('variant_hover', { hovers, switches }); }
    });
    form.addEventListener('submit', () => tell('add_to_cart', { size : form.size.value, finish : form.finish.value, qty : form.qty.value }));
  }

  // Cart page: a discount code that never works (the discount-codes signal), and sitting still.
  if(page === 'cart'){
    let btn = document.getElementById('apply-code');
    btn && btn.addEventListener('click', () => { document.getElementById('code-error').classList.remove('hidden'); tell('discount_declined', {}); });
    setTimeout(() => tell('cart_stall', { after_s : 45 }), 45 * 1000);
  }

  // Demo form: prefill marker, stall detection (two fields touched, then a minute of nothing).
  if(page === 'demo'){
    let form = document.getElementById('demo-form');
    let touched = new Set(), timer = null;
    form.addEventListener('input', e => {
      touched.add(e.target.name);
      clearTimeout(timer);
      if(touched.size >= 2){ timer = setTimeout(() => tell('form_stall', { fields : [...touched] }), 60 * 1000); }
    });
    form.addEventListener('submit', () => { clearTimeout(timer); tell('form_submit', { fields : [...touched] }); });
  }

  // Sign in: tell Sqid who this is, then let the form go.
  if(page === 'signin'){
    let form = document.getElementById('signin-form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      let email = form.email.value.trim();
      tell('identify', { email });
      whenSquid(async squid => { try{ await squid.identify({ email }); }catch(error){ /* reported by the SDK */ } form.submit(); }, 20);
      setTimeout(() => form.submit(), 2500); // never strand the person
    });
  }

  // Pricing visits (deliberation) and exit intent, counted across pages.
  if(page === 'pricing'){
    let n = Number(sessionStorage.getItem('driftwood.pricing_visits') || 0) + 1;
    sessionStorage.setItem('driftwood.pricing_visits', String(n));
    tell('pricing_visit', { visits : n });
  }
  let exited = false;
  document.addEventListener('mouseleave', e => { if(!exited && e.clientY <= 0){ exited = true; tell('exit_intent', {}); } });
})();
