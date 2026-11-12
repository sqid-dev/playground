// The docs recipes, runnable on this site. Each one is the code from docs.sqid.dev/recipes,
// trimmed to what the page needs, and shown in the panel as is. `apply` is called by the
// panel with the visitor's traits whenever a recipe is on and the visitor changes.
(function(){
  'use strict';
  const page = () => document.body.dataset.page;
  const cap = (s) => String(s || '').replace(/\b[a-z]/g, c => c.toUpperCase());
  const first = (v) => cap(v?.firstName || (v?.name || '').split(' ')[0] || '') || null;
  const company = (v) => v?.company ? cap(v.company) : null;

  const RECIPES = {
    dom : {
      title : 'DOM personalisation', where : 'home h1', docs : 'https://docs.sqid.dev/recipes/dom-personalization',
      code : `const engine = new squid.engine();

engine.on('visitor.identified', (e) => {
  const v = e.detail;
  document.querySelector('h1').textContent =
    \`Welcome back, \${v.firstName}. \${v.company}'s desks ship in 3 days.\`;
});

engine.on('visitor.unknown', () => {
  // leave the default headline
});`,
      apply(v, on){
        for(let [id, text] of [['hero-title', v && on ? `Welcome back, ${first(v)}. ${company(v)}'s desks ship in 3 days.` : null], ['teams-title', v && on ? `${company(v)}, outfit a floor without a spreadsheet.` : null]]){
          let el = document.getElementById(id); if(!el){ continue; }
          el.textContent = text || el.dataset.default;
        }
        let sub = document.getElementById('hero-sub');
        if(sub){ sub.textContent = v && on ? 'The headline just changed because Sqid identified you. The panel shows what it knew, and when.' : sub.dataset.default; }
      }
    },
    pricing : {
      title : 'Pricing personalisation', where : '/pricing', docs : 'https://docs.sqid.dev/recipes/pricing-personalization',
      code : `// Sqid tells you who the visitor is. Which plan fits them is your data:
// route the profile through your backend and let it answer.
const engine = new squid.engine({ sp: 'https://api.example.com' });

engine.on('visitor.identified', (e) => {
  const v = e.detail;                    // Sqid's traits + your fields
  document.querySelector('#pricing-title').textContent = \`Pricing for \${v.company}\`;
  document.querySelector(\`#plan-\${v.accountType.toLowerCase()}\`).classList.add('featured');
});`,
      apply(v, on){
        if(page() !== 'pricing'){ return; }
        this._on = on;
        let t = document.getElementById('pricing-title'), s = document.getElementById('pricing-sub'), pill = document.getElementById('pricing-pill');
        let plans = { starter : document.getElementById('plan-starter'), team : document.getElementById('plan-team'), enterprise : document.getElementById('plan-enterprise') };
        let badge = document.getElementById('plan-team-badge');
        const reset = () => { t.textContent = t.dataset.default; s.textContent = s.dataset.default; pill.classList.add('hidden'); badge.classList.add('hidden'); Object.values(plans).forEach(p => p.classList.remove('featured')); };
        const show = (d) => {
          if(!this._on){ return; }
          let plan = String(d.accountType || '').toLowerCase();
          t.textContent = `Pricing for ${company(d)}`;
          s.textContent = `Your account is on ${d.accountType}. (That came from the mock "your database", not from Sqid: Sqid supplied who you are.)`;
          pill.classList.remove('hidden');
          Object.entries(plans).forEach(([k, el]) => el.classList.toggle('featured', k === plan));
          badge.classList.toggle('hidden', plan !== 'team');
        };
        if(!(v && on)){ reset(); return; }
        if(this._last){ show(this._last); }
        if(this._engine || !window.squid?.engine){ return; }
        // The same service-provider pattern the docs recipe uses, against the playground's mock backend.
        this._engine = new window.squid.engine({ sp : location.origin + '/_sqid/sp' });
        this._engine.on('visitor.identified', e => { this._last = e.detail; show(e.detail); });
      }
    },
    chat : {
      title : 'Chat integration', where : 'widget', docs : 'https://docs.sqid.dev/recipes/chat-integration',
      code : `const engine = new squid.engine();

engine.on('visitor.identified', (e) => {
  const v = e.detail;
  // Intercom / Drift / Crisp / Zendesk all have an identify call:
  window.Intercom?.('update', { email: v.email, name: v.name, company: { name: v.company } });
  openChat(\`Hi \${v.firstName}, want the Team quote for \${v.company}?\`);
});`,
      apply(v, on){
        let w = document.getElementById('rc-chat');
        if(!(v && on)){ w && w.remove(); return; }
        if(!w){ w = document.createElement('div'); w.id = 'rc-chat'; w.className = 'rc-chat'; document.body.appendChild(w); }
        w.innerHTML = `<div class="avatar" aria-hidden="true">D</div><div class="msg"><strong>Hi ${esc(first(v))}, want the Team quote for ${esc(company(v))}?</strong><span>The widget was handed the profile, so it never asks for an email.</span></div>`;
      }
    },
    prefill : {
      title : 'Form prefill', where : '/demo', docs : 'https://docs.sqid.dev/recipes/form-prefill',
      code : `const engine = new squid.engine();

engine.on('visitor.identified', (e) => {
  const v = e.detail;
  const form = document.querySelector('#demo-form');
  form.name.value    = v.name;
  form.email.value   = v.email;
  form.company.value = v.company;
});`,
      apply(v, on){
        let form = document.getElementById('demo-form'); if(!form){ return; }
        for(let [k, val] of [['name', v?.name], ['email', v?.email], ['company', company(v)]]){
          let input = form.elements[k]; if(!input){ continue; }
          if(v && on && val && !input.dataset.typed){ input.value = k === 'email' ? val : cap(val); input.classList.add('prefilled'); }
          else if(!on && input.classList.contains('prefilled')){ input.value = ''; input.classList.remove('prefilled'); }
        }
        form.addEventListener('input', e => { e.target.dataset.typed = '1'; e.target.classList.remove('prefilled'); }, { once : false });
      }
    },
    exit : {
      title : 'Exit intent', where : 'any page', docs : 'https://docs.sqid.dev/recipes/exit-intent',
      code : `const engine = new squid.engine();
let visitor = null;
engine.on('visitor.identified', (e) => { visitor = e.detail; });

document.addEventListener('mouseleave', (e) => {
  if (e.clientY > 0 || !visitor) return;
  showPopup(\`Before you go, \${visitor.firstName}: want us to send \${visitor.company} a quote?\`);
}, { once: true });`,
      apply(v, on){
        this._visitor = v; this._on = on;
        if(this._wired){ return; } this._wired = true;
        document.addEventListener('sqid:page', e => {
          if(e.detail.what !== 'exit_intent' || !this._on || !this._visitor || sessionStorage.getItem('rc.exit')){ return; }
          sessionStorage.setItem('rc.exit', '1');
          let m = document.createElement('div'); m.className = 'rc-exit'; m.setAttribute('role', 'dialog');
          m.innerHTML = `<div class="box"><h3>Before you go, ${esc(first(this._visitor))}</h3><p>Want us to send ${esc(company(this._visitor))} a quote for the Team tier? No forms, we already know where to send it.</p><div class="hero-actions"><button class="btn btn-dark" type="button">Send the quote</button><button class="btn btn-ghost" type="button">No thanks</button></div><p class="hint">Exit intent recipe. Suppressed for existing customers on a real site.</p></div>`;
          m.querySelectorAll('button').forEach(b => b.addEventListener('click', () => m.remove()));
          document.body.appendChild(m);
        });
      }
    },
    analytics : {
      title : 'Analytics enrichment', where : 'console', docs : 'https://docs.sqid.dev/recipes/analytics-enrichment',
      code : `const engine = new squid.engine();

engine.on('visitor.identified', (e) => {
  const v = e.detail;
  const uid = v.id || engine.visitor().meta.user_id;   // your id if you set one, else Sqid's
  // Segment / Mixpanel / Amplitude / PostHog: one identify call each
  window.analytics?.identify(uid, { email: v.email, company: v.company, title: v.company_role });
  window.posthog?.identify(uid, { email: v.email, company: v.company });
});`,
      apply(v, on){
        if(!(v && on)){ return; }
        let uid = v.id || document.cookie.match(/squid_vid=([^;]+)/)?.[1] || null;
        console.log('[analytics] identify', uid, { email : v.email, company : v.company, title : v.company_role });
        document.dispatchEvent(new CustomEvent('sqid:recipe', { detail : { recipe : 'analytics', text : `identify(${uid}) sent to the analytics stubs (see the browser console)` } }));
      }
    },
    sp : {
      title : 'Service provider (your database)', where : 'built-in mock', docs : 'https://docs.sqid.dev/recipes/local-database',
      code : `// Browser: route the profile through your backend first
const engine = new squid.engine({ sp: 'https://api.yourapp.com' });

engine.on('visitor.identified', (e) => {
  // e.detail is YOUR server's answer: Sqid's traits + your fields
  const v = e.detail;
  if (v.accountType === 'Team') showAccountManagerBanner(v);
});

// Server: POST /visitor_details receives the traits
app.post('/visitor_details', async (req, res) => {
  const row = await db.customers.findByEmail(req.body.email);
  res.json({ ...req.body, ...row });
});`,
      apply(v, on){
        if(!on || this._engine || !window.squid?.engine){ return; }
        this._engine = new window.squid.engine({ sp : location.origin + '/_sqid/sp' });
        this._engine.on('visitor.identified', e => document.dispatchEvent(new CustomEvent('sqid:recipe', { detail : { recipe : 'sp', text : `your database answered: ${e.detail.accountType} customer since ${e.detail.customerSince}, lifetime value $${e.detail.lifetimeValue}`, data : e.detail } })));
        this._engine.on('error', e => document.dispatchEvent(new CustomEvent('sqid:recipe', { detail : { recipe : 'sp', text : `service provider error: ${e.detail?.message || e.detail}` } })));
      }
    },
    moment : {
      title : 'React to a moment (chat opens)', where : 'needs a real site', docs : 'https://docs.sqid.dev/guides/signals', locked : true,
      code : `const engine = new squid.engine();

engine.on('visitor.moment', (e) => {
  const m = e.detail;              // { decision_id, kind, decision: { action, instruction }, ... }
  if (m.decision.action !== 'engage') return;
  openChat(m.decision.instruction); // e.g. "Offer to help with the signup form, in one line."
});`,
      apply(){ /* Sandbox sites never receive moments */ }
    }
  };

  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({ '&' : '&amp;', '<' : '&lt;', '>' : '&gt;', '"' : '&quot;', "'" : '&#39;' }[c])); }

  const KEY = 'sqid.playground.recipes';
  const DEFAULT_ON = ['dom', 'chat', 'prefill'];
  function enabled(){ try{ let s = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(s) ? s : DEFAULT_ON; }catch(error){ return DEFAULT_ON; } }
  function setEnabled(list){ localStorage.setItem(KEY, JSON.stringify(list)); }

  window.SqidRecipes = {
    all : RECIPES,
    enabled,
    toggle(key){ let on = enabled(); let next = on.includes(key) ? on.filter(k => k !== key) : [...on, key]; setEnabled(next); return next; },
    apply(visitor){
      let on = enabled();
      for(let [key, r] of Object.entries(RECIPES)){ try{ r.apply(visitor, on.includes(key)); }catch(error){ console.warn('[recipe]', key, error); } }
    }
  };
})();
