// The Driftwood site plus the panel's small local API under /_sqid. Everything under /_sqid talks
// to Sqid through the Bridge with the signed-in person's own credentials; nothing is stored here.

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, PAGES } from './layout.js';
import { localRecord } from './sqid.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp(bridge){
  let app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit : '64kb' }));
  app.use(express.urlencoded({ extended : false }));
  app.use('/assets', express.static(path.join(here, '..', 'public'), { maxAge : 0 }));

  // Only this machine talks to the local API (the site itself is fine to open from anywhere on the LAN).
  app.use('/_sqid', (req, res, next) => {
    let host = String(req.headers.host || '').split(':')[0];
    if(!['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)){ return res.status(403).json({ error : 'local_only' }); }
    next();
  });

  app.get('/_sqid/state', wrap(async () => bridge.state()));
  app.get('/_sqid/sample', wrap(async (req) => bridge.sample(req.query.event || 'identification')));
  app.get('/_sqid/visitors/:id', wrap(async (req) => bridge.visitor(req.params.id)));
  app.get('/_sqid/visitors/:id/events', wrap(async (req) => bridge.visitorEvents(req.params.id)));
  app.get('/_sqid/webhooks', wrap(async () => bridge.webhooks()));
  app.post('/_sqid/webhooks', wrap(async (req) => {
    let url = String(req.body?.url || '').trim();
    if(!/^https:\/\//i.test(url)){ throw Object.assign(new Error('The endpoint must be an https URL'), { status : 400 }); }
    await bridge.addWebhook(url, req.body?.event || 'identification');
    return { ok : true, webhooks : await bridge.webhooks() };
  }));
  app.post('/_sqid/webhooks/:id/test', wrap(async (req) => bridge.testWebhook(req.params.id)));
  app.post('/_sqid/sites', wrap(async (req) => bridge.createSite({ name : String(req.body?.name || '').slice(0, 50), url : String(req.body?.url || '') })));
  app.get('/_sqid/sites/:id/status', wrap(async (req) => bridge.siteStatus(req.params.id)));

  // The service-provider recipe: what "your database" adds to the profile. Sqid POSTs the traits here.
  app.post('/_sqid/sp/visitor_details', (req, res) => res.json(localRecord(req.body || {})));

  // The site
  for(let [route, page] of Object.entries(PAGES)){
    app.get(route, (req, res) => res.type('html').send(render(page, { bridge, path : route, query : req.query })));
  }
  app.post('/cart/add', (req, res) => res.redirect(303, '/cart?added=1'));
  app.post('/demo', (req, res) => res.redirect(303, '/demo?sent=1'));
  app.post('/signin', (req, res) => res.redirect(303, `/?signed_in=1&email=${encodeURIComponent(String(req.body?.email || ''))}`));
  app.post('/cart/checkout', (req, res) => res.redirect(303, '/cart?ordered=1'));

  app.use((req, res) => res.status(404).type('html').send(render('notfound', { bridge, path : req.path, query : {} })));
  return app;
}

function wrap(fn){
  return async (req, res) => {
    try{ res.json(await fn(req) ?? null); }
    catch(error){
      let status = error?.status || (error?.code === 'unauthorized' ? 401 : 500);
      res.status(status).json({ error : error?.code || 'error', message : error?.message || String(error), remedy : error?.remedy || undefined });
    }
  };
}
