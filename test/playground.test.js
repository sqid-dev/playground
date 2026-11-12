import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/server.js';
import { parse } from '../src/index.js';
import { localRecord } from '../src/sqid.js';

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
