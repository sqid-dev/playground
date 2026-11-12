// Driftwood page shell: nav, the page body, the Sqid snippet before </head>, the panel after the
// body. One template, every page.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here  = path.dirname(fileURLToPath(import.meta.url));
const pages = path.join(here, 'pages');

export const PAGES = {
  '/'        : 'home',
  '/desks'   : 'desks',
  '/desk'    : 'desk',
  '/pricing' : 'pricing',
  '/demo'    : 'demo',
  '/cart'    : 'cart',
  '/signin'  : 'signin',
  '/teams'   : 'teams'
};

const TITLES = {
  home     : 'Driftwood: standing desks for teams',
  desks    : 'Desks',
  desk     : 'Driftwood Rise',
  pricing  : 'Team pricing',
  demo     : 'Book a demo',
  cart     : 'Your cart',
  signin   : 'Sign in',
  teams    : 'Driftwood for teams',
  notfound : 'Not found'
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&' : '&amp;', '<' : '&lt;', '>' : '&gt;', '"' : '&quot;', "'" : '&#39;' }[c]));

function body(page){
  let file = path.join(pages, `${page}.html`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '<section class="wrap"><h1>Not found</h1><p>That page is not part of the demo.</p></section>';
}

export function render(page, { bridge, path : route, query }){
  let site = bridge.site;
  let nav = (href, label) => `<a href="${href}"${route === href ? ' aria-current="page" class="on"' : ''}>${label}</a>`;
  let flash = '';
  if(query.added)     { flash = `<div class="flash" role="status">Added to your cart. Now leave it there for a bit; that is a cart stall.</div>`; }
  if(query.sent)      { flash = `<div class="flash" role="status">Demo requested. That was a conversion key event; the panel's Live tab has it.</div>`; }
  if(query.ordered)   { flash = `<div class="flash" role="status">Order placed (not really). Thanks for testing.</div>`; }
  if(query.signed_in) { flash = `<div class="flash" role="status">Signed in as ${esc(query.email)}. The page called squid.identify() with that email.</div>`; }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(TITLES[page] || 'Driftwood')} · Driftwood</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/panel.css">
<script>window.SQID_PLAYGROUND = ${JSON.stringify({ site : { id : site.id, name : site.name, sandbox : !!site.sandbox }, page, path : route })};</script>
${bridge.snippet()}
</head>
<body data-page="${esc(page)}">
<div class="pg-shell">
<div class="pg-site">
<header class="site-nav">
  <a href="/" class="brand" aria-label="Driftwood home">Driftwood</a>
  <nav>${nav('/desks', 'Desks')}${nav('/teams', 'Teams')}${nav('/pricing', 'Pricing')}</nav>
  <div class="nav-right">${nav('/signin', 'Sign in')}<a href="/cart" class="cart-link" data-sqid-label="view_cart" data-sqid-type="key_event">Cart <span id="cart-count">0</span></a><a href="/demo" class="btn btn-dark" data-sqid-label="book_demo_nav" data-sqid-type="key_event">Book a demo</a></div>
</header>
${flash}
<main id="main">
${body(page)}
</main>
<footer class="site-footer">
  <span>Driftwood is a made-up company. This site exists so you can watch Sqid work.</span>
  <span><a href="https://docs.sqid.dev">Sqid docs</a> · <a href="https://github.com/sqid-dev/playground">Source</a></span>
</footer>
</div>
<aside class="pg-panel" id="sqid-panel" aria-label="Sqid panel"></aside>
</div>
<script src="/assets/recipes.js"></script>
<script src="/assets/site.js"></script>
<script src="/assets/panel.js"></script>
</body>
</html>`;
}
