import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/server.js';
import { parse } from '../src/index.js';
import { localRecord, originsOf, withOrigin, Bridge } from '../src/sqid.js';
import fs from 'node:fs';

// A bridge that never touches Sqid.
function fakeBridge(){
  let hooks = [];
  return {
    site : { id : 'abc123', name : 'Sandbox', sandbox : true, origins : ['http://localhost:3000'] },
    snippet(){ return `<script>/* sqid ${this.site.id} */</script>`; },
    async state(){ return { email : 'dev@example.com', plan : { has : true, name : 'Developer' }, site : this.site, snippet : this.snippet(), webhooks : hooks, console : 'https://app.sqid.dev' }; },
    async webhooks(){ return hooks; },
    async addWebhook(url){ hooks.push({ id : String(hooks.length + 1), url, event : 'visitor.identification.created.v2', enabled : true }); },
    async testWebhook(id){ if(!hooks.find(h => h.id === id)){ throw Object.assign(new Error('No such webhook'), { status : 404 }); } return { status : 200 }; },
    async sample(){ return { namespace : 'visitor.identification.created.v2' }; },
    async visitor(id){ if(id === 'missing'){ throw Object.assign(new Error('not found'), { status : 404 }); } return { profile : { id }, traits : { first_name : 'ava' } }; },
    async visitorEvents(){ return { items : [] }; },
    async createSite({ name, url }){ if(!/^https:/.test(url)){ throw Object.assign(new Error('Give the site\'s public URL'), { status : 400 }); } return { site : { id : 'real1', name : name || 'example.com' }, snippet : '<script>real</script>', origins : [new URL(url).origin] }; },
    async siteStatus(id){ return { id, name : 'x', deployed : false, connected : false }; }
  };
}

async function listen(app){
  let server = createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let base = `http://127.0.0.1:${server.address().port}`;
  return { base, close : () => new Promise(r => server.close(r)) };
}

test('options parse', () => {
  assert.deepEqual(parse([]), { port : 3000, open : true });
  assert.equal(parse(['--port', '4100', '--no-open']).port, 4100);
  assert.equal(parse(['--site', 'Sandbox']).site, 'Sandbox');
  assert.throws(() => parse(['--port', 'x']), /--port/);
  assert.throws(() => parse(['--nope']), /Unknown option/);
});

test('pages render with the snippet before </head> and the panel after the site', async () => {
  let { base, close } = await listen(createApp(fakeBridge()));
  try{
    for(let path of ['/', '/desk', '/pricing', '/demo', '/cart', '/signin', '/teams', '/desks']){
      let r = await fetch(base + path);
      assert.equal(r.status, 200, path);
      let html = await r.text();
      assert.match(html, /sqid abc123/, `${path} has the snippet`);
      assert.ok(html.indexOf('sqid abc123') < html.indexOf('</head>'), `${path}: snippet before </head>`);
      assert.match(html, /id="sqid-panel"/, `${path} has the panel`);
      assert.match(html, /window\.SQID_PLAYGROUND = \{"site":\{"id":"abc123"/, `${path} tells the panel the site`);
      assert.match(html, /name="robots" content="noindex"/);
    }
    let nf = await fetch(base + '/nope'); assert.equal(nf.status, 404);
    let desk = await (await fetch(base + '/desk')).text();
    assert.match(desk, /action="\/cart\/add"/, 'the variant picker is inside a cart form, as the SDK expects');
    assert.match(desk, /<input type="radio" name="size"/);
  }finally{ await close(); }
});

test('the local API serves state, webhooks, visitor records and site creation', async () => {
  let { base, close } = await listen(createApp(fakeBridge()));
  let json = async (path, init) => { let r = await fetch(base + path, init); return { status : r.status, body : await r.json() }; };
  try{
    let st = await json('/_sqid/state');
    assert.equal(st.status, 200); assert.equal(st.body.site.id, 'abc123'); assert.equal(st.body.email, 'dev@example.com');

    assert.equal((await json('/_sqid/webhooks', { method : 'POST', headers : { 'content-type' : 'application/json' }, body : JSON.stringify({ url : 'http://insecure' }) })).status, 400, 'https only');
    let added = await json('/_sqid/webhooks', { method : 'POST', headers : { 'content-type' : 'application/json' }, body : JSON.stringify({ url : 'https://catcher.example/x' }) });
    assert.equal(added.status, 200); assert.equal(added.body.webhooks.length, 1);
    assert.equal((await json('/_sqid/webhooks/1/test', { method : 'POST' })).body.status, 200);
    assert.equal((await json('/_sqid/webhooks/9/test', { method : 'POST' })).status, 404);

    assert.equal((await json('/_sqid/visitors/v1')).body.traits.first_name, 'ava');
    assert.equal((await json('/_sqid/visitors/missing')).status, 404);
    assert.equal((await json('/_sqid/sample')).body.namespace, 'visitor.identification.created.v2');

    let bad = await json('/_sqid/sites', { method : 'POST', headers : { 'content-type' : 'application/json' }, body : JSON.stringify({ url : 'ftp://x' }) });
    assert.equal(bad.status, 400);
    let ok = await json('/_sqid/sites', { method : 'POST', headers : { 'content-type' : 'application/json' }, body : JSON.stringify({ url : 'https://www.example.com', name : 'Marketing' }) });
    assert.equal(ok.status, 200); assert.equal(ok.body.site.id, 'real1'); assert.match(ok.body.snippet, /real/);

    let sp = await json('/_sqid/sp/visitor_details', { method : 'POST', headers : { 'content-type' : 'application/json' }, body : JSON.stringify({ email : 'ava.thornton@test.squid.io', name : 'ava thornton' }) });
    assert.equal(sp.body.name, 'ava thornton'); assert.ok(['Starter', 'Team', 'Enterprise'].includes(sp.body.accountType));
  }finally{ await close(); }
});

test('the local API refuses hosts other than localhost', async () => {
  let { base, close } = await listen(createApp(fakeBridge()));
  try{
    // fetch refuses to set Host; plain http does not.
    let { request } = await import('node:http');
    let status = (path) => new Promise((resolve, reject) => request(base + path, { headers : { host : 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject).end());
    assert.equal(await status('/_sqid/state'), 403);
    assert.equal(await status('/'), 200, 'the site itself is fine');
  }finally{ await close(); }
});

test('localRecord is deterministic per email and keeps the traits', () => {
  let a = localRecord({ email : 'ava.thornton@test.squid.io', firstName : 'ava' });
  let b = localRecord({ email : 'ava.thornton@test.squid.io', firstName : 'ava' });
  assert.deepEqual(a, b); assert.equal(a.firstName, 'ava'); assert.ok(a.lifetimeValue > 0);
});

// A site row as platform2 returns it: origins live only in the jwt payload (site, app).
const jwtFor = (site, app) => `h.${Buffer.from(JSON.stringify({ sdk_id : 's1', site, app })).toString('base64url')}.sig`;

test('originsOf reads the jwt the console reads; withOrigin only adds', () => {
  assert.deepEqual(originsOf({ jwt : jwtFor('https://a.com,https://www.a.com', 'https://app.a.com') }), { site : ['https://a.com', 'https://www.a.com'], app : ['https://app.a.com'] });
  assert.deepEqual(originsOf({ jwt : jwtFor('', null) }), { site : [], app : [] });
  assert.equal(originsOf({ site_origins : ['https://a.com'] }), null, 'no jwt: unknown, not empty');
  assert.equal(originsOf({ jwt : 'x.%%%.y' }), null);

  let cur = { site : ['https://a.com'], app : ['https://a.com', 'https://app.a.com'] };
  assert.deepEqual(withOrigin(cur, 'http://localhost:3000'), { site : ['https://a.com', 'http://localhost:3000'], app : ['https://a.com', 'https://app.a.com', 'http://localhost:3000'] });
  assert.equal(withOrigin({ site : ['http://localhost:3000'], app : ['http://localhost:3000'] }, 'http://localhost:3000'), null);
  assert.deepEqual(cur.site, ['https://a.com'], 'input untouched');
});

// A fake console API recording every call.
function fakeApi({ jwt, failShow = false } = {}){
  let calls = [];
  let call = async (method, path, opts = {}) => {
    calls.push({ method, path, body : opts.body });
    if(method === 'GET' && path === '/api/sqid/me'){ return { email : 'dev@example.com' }; }
    if(method === 'GET' && path === '/api/sqid/projects'){ return [{ _id : 'sb1', name : 'Sandbox', sandbox : true, jwt }]; }
    if(method === 'GET' && path === '/api/projects/sb1'){ if(failShow){ throw new Error('boom'); } return { _id : 'sb1', name : 'Sandbox', jwt }; }
    if(method === 'PATCH' && path === '/api/projects/sb1'){ return { ok : true }; }
    if(method === 'GET' && /\/key_events$/.test(path)){ return { items : [] }; }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { call, calls };
}
const signedIn = async () => ({ access_token : 't' });

test('prepare keeps the origins set in the console and adds only the local one', async () => {
  let { call, calls } = fakeApi({ jwt : jwtFor('https://staging.example.com', 'https://staging.example.com') });
  let b = new Bridge({}, { api : call, readCredentials : signedIn });
  let r = await b.prepare('http://localhost:3000');
  assert.equal(r.originAdded, true);
  assert.ok(calls.some(c => c.method === 'GET' && c.path === '/api/projects/sb1'), 'reads the site itself');
  let patch = calls.find(c => c.method === 'PATCH');
  assert.deepEqual(patch.body.site_origins, ['https://staging.example.com', 'http://localhost:3000']);
  assert.deepEqual(patch.body.product_origins, ['https://staging.example.com', 'http://localhost:3000']);
});

test('prepare writes nothing when the origin is already there or the origins cannot be read', async () => {
  let a = fakeApi({ jwt : jwtFor('https://x.com,http://localhost:3000', 'http://localhost:3000') });
  let r = await new Bridge({}, { api : a.call, readCredentials : signedIn }).prepare('http://localhost:3000');
  assert.equal(r.originAdded, false); assert.equal(r.originError, null);
  assert.ok(!a.calls.some(c => c.method === 'PATCH'));

  let b = fakeApi({ jwt : jwtFor('https://x.com', 'https://x.com'), failShow : true });
  let r2 = await new Bridge({}, { api : b.call, readCredentials : signedIn }).prepare('http://localhost:3000');
  assert.equal(r2.originAdded, false); assert.match(r2.originError, /boom/);
  assert.ok(!b.calls.some(c => c.method === 'PATCH'), 'never PATCHes origins it could not read');
});

test('visitor events use the console route /key_events', async () => {
  let { call, calls } = fakeApi({ jwt : jwtFor('http://localhost:3000', 'http://localhost:3000') });
  let b = new Bridge({}, { api : call, readCredentials : signedIn });
  await b.prepare('http://localhost:3000');
  await b.visitorEvents('0123456789abcdef01234567');
  assert.ok(calls.some(c => c.path === '/api/projects/sb1/profiles/0123456789abcdef01234567/key_events'));
});

test('panel wording: first screen, no private-window advice, accurate billing and prices', () => {
  let panel = fs.readFileSync(new URL('../public/panel.js', import.meta.url), 'utf8');
  let readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for(let text of [panel, readme]){
    assert.doesNotMatch(text, /private window (gets|to be)|a private window or another device gets/i);
    assert.doesNotMatch(text, /No charge until you use it|Signals turns on/);
  }
  assert.match(panel, /Send this to my app/); assert.match(panel, /Put Sqid on my site/);
  assert.match(panel, /Be someone new/); assert.match(panel, /squid\.anonymouse\(\)/);
  assert.match(panel, /\$0\.25 each/); assert.match(panel, /25 welcome credits/);
  assert.match(panel, /\$675\/month with 500 identifications\/month included/);
  let prices = [...(panel + readme).matchAll(/\$\d[\d,.]*/g)].map(m => m[0]);
  assert.deepEqual([...new Set(prices)].sort(), ['$0.25', '$675'], 'no other prices');
});
