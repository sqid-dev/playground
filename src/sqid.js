// The bridge to the person's Sqid account. Everything the panel needs from Sqid goes through
// here, with the sqid CLI's own modules (credentials, API, site resolution, SDK keys), so the
// playground never holds a second copy of auth. Nothing is cached across runs except what the
// CLI already keeps in ~/.config/sqid/credentials.json.

import os from 'node:os';
import { api } from '@sqid-dev/sqid/src/api.js';
import { readCredentials, writeCredentials } from '@sqid-dev/sqid/src/credentials.js';
import { siteRow, snippetFor, toOrigins } from '@sqid-dev/sqid/src/project.js';
import { sdkKeyFor, publicApi } from '@sqid-dev/sqid/src/sdkkey.js';
import { EVENTS } from '@sqid-dev/sqid/src/commands/webhook.js';
import { loginLoopback, userinfo } from '@sqid-dev/sqid/src/oauth.js';

// Sites with their allowed origins (the CLI's siteRow leaves origins out).
async function listSites(flags){
  let rows = await api('GET', '/api/sqid/projects', { flags });
  return (rows || []).map(p => ({ ...siteRow(p), origins : (p.site_origins || []).map(String) }));
}

export class Bridge {
  constructor(flags = {}){
    this.flags = flags;
    this.site  = null;
    this.me    = null;
  }

  // Sign in if needed, pick the site, allow this origin on it.
  async prepare(origin){
    let creds = await readCredentials();
    if(!creds?.access_token){
      process.stdout.write('  Not signed in to Sqid. Opening your browser to sign in...\n');
      let tokens = await loginLoopback({ onUrl : (url, { opened }) => process.stdout.write(opened ? `  If it did not open: ${url}\n` : `  Open this link to sign in: ${url}\n`) });
      let info = await userinfo(tokens.access_token).catch(() => null);
      await writeCredentials({ ...tokens, email : info?.email, user_id : info?.sub || info?.user_id, issued_on : os.hostname(), issued_at : new Date().toISOString() });
      creds = await readCredentials();
    }
    this.me = await api('GET', '/api/sqid/me', { flags : this.flags });

    let sites = await listSites(this.flags);
    let site  = this.flags.site ? sites.find(s => s.id === this.flags.site || s.name === this.flags.site) : sites.find(s => s.sandbox);
    if(this.flags.site && !site){ throw Object.assign(new Error(`No site "${this.flags.site}" on this account.`), { exit : 2 }); }
    if(!site){
      // The account has no Sandbox (deleted, or an older account): make it again.
      let made = await api('POST', '/api/sqid/sandbox', { flags : this.flags, body : {} });
      sites = await listSites(this.flags);
      site  = sites.find(s => s.id === String(made?.sdk_id)) || sites.find(s => s.sandbox);
      if(!site){ throw new Error('Sqid did not return a Sandbox site.'); }
    }
    this.site = site;

    // Allow this origin on the site (the snippet loads nothing from an origin the site does not list).
    let originAdded = false;
    let current = (site.origins || []).map(String);
    if(!current.includes(origin)){
      let next = toOrigins([...current, origin].join(','));
      await api('PATCH', `/api/projects/${site.id}`, { flags : this.flags, body : { name : site.name, site_origins : next, product_origins : next } });
      this.site = { ...site, origins : next };
      originAdded = true;
    }
    return { email : this.me?.email || this.me?.user?.email || creds?.email || 'you', site : this.site, originAdded };
  }

  snippet(id = this.site.id){ return snippetFor(id); }

  // What the panel's Start tab needs, in one call.
  async state(){
    let [me, hooks] = await Promise.all([
      api('GET', '/api/sqid/me', { flags : this.flags }).catch(() => this.me),
      this.webhooks().catch(() => [])
    ]);
    this.me = me || this.me;
    return {
      email    : me?.email || me?.user?.email || null,
      plan     : { has : !!me?.account?.hasSubscription, name : me?.account?.plan?.name || me?.billing?.plan || null, card : !!(me?.billing?.card || me?.account?.card) },
      features : me?.features || {},
      site     : { id : this.site.id, name : this.site.name, sandbox : !!this.site.sandbox, origins : this.site.origins || [] },
      snippet  : this.snippet(),
      webhooks : hooks,
      console  : this.flags.api || 'https://app.sqid.dev'
    };
  }

  async webhooks(){
    let r = await api('GET', `/api/sqid/sdks/${this.site.id}/webhooks`, { flags : this.flags });
    let list = Array.isArray(r) ? r : r?.webhooks || [];
    return list.map(w => ({ id : String(w._id || w.id), url : w.url, event : w.namespace || w.event, enabled : w.enabled !== false, health : w.health || null, name : w.name || null }));
  }

  async addWebhook(url, eventKey = 'identification'){
    let ev = EVENTS[eventKey] || EVENTS.identification;
    let base = ev.v2 ? `/api/sqid/sdks/${this.site.id}/v2` : `/api/sdks/${this.site.id}`;
    let body = ev.v2 ? { url, namespace : ev.namespace, name : 'Playground' } : { url, namespace : ev.namespace, name : 'Playground' };
    return api('POST', `${base}/webhook`, { flags : this.flags, body });
  }

  async testWebhook(id){
    let hooks = await this.webhooks();
    let w = hooks.find(h => h.id === id);
    if(!w){ throw Object.assign(new Error('No such webhook'), { status : 404 }); }
    let ev = Object.values(EVENTS).find(e => e.namespace === w.event) || EVENTS.identification;
    let base = ev.v2 ? `/api/sqid/sdks/${this.site.id}/v2` : `/api/sdks/${this.site.id}`;
    return api('POST', `${base}/webhook/test`, { flags : this.flags, body : { webhook_id : id } });
  }

  // A sample of the record a webhook delivers (nothing is sent).
  async sample(eventKey = 'identification'){
    let ev = EVENTS[eventKey] || EVENTS.identification;
    let base = ev.v2 ? `/api/sqid/sdks/${this.site.id}/v2` : `/api/sdks/${this.site.id}`;
    return api('POST', `${base}/webhook/preview`, { flags : this.flags, body : { namespace : ev.namespace } });
  }

  // The live visitor's full record from the public visitor API, with a key bound to the site.
  async visitor(id){
    let key = await sdkKeyFor(this.site, this.flags);
    let r = await publicApi('GET', `/visitors/${encodeURIComponent(id)}`, { key });
    if(!r.ok){ throw Object.assign(new Error(r.data?.message || r.data?.error || `visitor lookup failed (${r.status})`), { status : r.status }); }
    return r.data;
  }

  async visitorEvents(id){
    let key = await sdkKeyFor(this.site, this.flags);
    let r = await publicApi('GET', `/visitors/${encodeURIComponent(id)}/key-events`, { key });
    return r.ok ? r.data : { error : r.data?.error || r.status };
  }

  // Go live: a real site on the account, with its snippet.
  async createSite({ name, url }){
    let origins = toOrigins(url);
    if(!origins.length){ throw Object.assign(new Error('Give the site\'s public URL, e.g. https://www.example.com'), { status : 400 }); }
    let me = await api('GET', '/api/sqid/me', { flags : this.flags });
    if(!me?.account?.hasSubscription){
      try{ await api('POST', '/api/sqid/billing/start', { flags : this.flags, body : {} }); }catch(error){ /* the project route starts it too */ }
    }
    let sites = await listSites(this.flags);
    let same  = sites.find(s => !s.sandbox && s.name?.toLowerCase() === String(name || '').toLowerCase());
    let site  = same;
    if(!site){
      let created = await api('POST', '/api/projects', { flags : this.flags, body : { name : name || new URL(origins[0]).hostname, site_origins : origins, product_origins : origins, avatar_index : 1 } });
      let id = String(created?._id || created?.id || created?.sdk_id || '');
      sites = await listSites(this.flags);
      site  = sites.find(s => s.id === id) || sites.find(s => !s.sandbox && s.origins?.includes(origins[0]));
    }
    if(!site){ throw new Error('Sqid did not return the new site.'); }
    return { site, snippet : snippetFor(site.id), origins };
  }

  async siteStatus(id){
    let sites = await listSites(this.flags);
    let s = sites.find(x => x.id === id);
    return s ? { id : s.id, name : s.name, deployed : !!s.deployed, connected : !!s.connected } : null;
  }
}

// Deterministic "your database" for the service-provider recipe: what a customer's own backend
// would add to a Sqid profile. Keyed on the email so the same fixture person always gets the same answer.
export function localRecord(traits = {}){
  let email = String(traits.email || '').toLowerCase();
  let n = [...email].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  let plans = ['Starter', 'Team', 'Team', 'Enterprise'];
  return {
    ...traits,
    accountType   : plans[n % plans.length],
    customerSince : `${2021 + (n % 5)}-0${1 + (n % 9)}-1${n % 9}`,
    lifetimeValue : 749 * (1 + (n % 40)),
    openTickets   : n % 3,
    source        : 'your database (mock)'
  };
}
