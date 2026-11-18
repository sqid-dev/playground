// sqid-playground: argv in, a running Driftwood site out.
//
//   sqid-playground [--port 3000] [--site <id>] [--no-open] [--api <origin>]
//
// Signs in through the sqid CLI's credentials (run `sqid auth login` once, or let this do it),
// finds the account's Sandbox site, allows this origin on it, and serves the site with the
// Sqid panel docked on the right.

import { createServer } from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createApp } from './server.js';
import { Bridge } from './sqid.js';

const USAGE = `Usage: sqid-playground [options]

Runs the Sqid Playground on localhost: a real-looking website (Driftwood) with the Sqid panel
docked on the side. Watch a visitor get identified, try the scenarios and recipes, see the
record that goes out, then go live on your own site.

Options:
  --port <n>      Port to listen on (default 3000; if it is busy, the next free one)
  --site <id>     Use this site instead of the account's Sandbox
  --no-open       Do not open the browser
  --api <origin>  Sqid API origin (default https://app.sqid.dev)
  -h, --help      This text

Needs a Sqid sign-in: run "npx -y @sqid-dev/sqid auth login" first, or this will ask.`;

export function parse(argv){
  let flags = { port : 3000, open : true };
  for(let i = 0; i < argv.length; i++){
    let a = argv[i];
    if(a === '-h' || a === '--help'){ flags.help = true; }
    else if(a === '--no-open'){ flags.open = false; }
    else if(a === '--port'){ flags.port = Number(argv[++i]); flags.portGiven = true; }
    else if(a === '--site'){ flags.site = argv[++i]; }
    else if(a === '--api'){ flags.api = argv[++i]; }
    else if(a.startsWith('--port=')){ flags.port = Number(a.slice(7)); flags.portGiven = true; }
    else { throw Object.assign(new Error(`Unknown option ${a}\n\n${USAGE}`), { exit : 2 }); }
  }
  if(!Number.isInteger(flags.port) || flags.port < 1 || flags.port > 65535){ throw Object.assign(new Error('--port must be a number between 1 and 65535'), { exit : 2 }); }
  return flags;
}

export async function main(argv){
  let flags = parse(argv);
  if(flags.help){ console.log(USAGE); return; }

  let bridge = new Bridge(flags);
  process.stdout.write('Sqid Playground\n');

  // Take the port before signing in, so a busy port never costs a sign-in. The default (3000) moves to the
  // next free port; a --port the person chose is kept, or the run stops and says so.
  let app = createApp(bridge);
  let server = createServer(app);
  let port = await listenFree(server, flags.port, flags.portGiven ? 0 : 20);
  if(port !== flags.port){ process.stdout.write(`  Port ${flags.port} is in use, so the Playground runs on ${port}.\n`); }
  flags.port = port;
  let origin = `http://localhost:${port}`;

  let ready = await bridge.prepare(origin);   // signs in if needed, finds the Sandbox, allows the origin
  process.stdout.write(`  Signed in as ${ready.email}\n`);
  process.stdout.write(`  Site: ${ready.site.name} (${ready.site.id})${ready.site.sandbox ? ', Sandbox' : ''}\n`);
  if(ready.originError){
    process.stdout.write(`  Could not check the site's allowed origins (${ready.originError}). Nothing was changed.\n`);
    process.stdout.write(`  If the panel says the SDK did not load, add ${origin} to the site in the console (SDKs, allowed origins).\n`);
  }else{
    process.stdout.write(`  Origin ${origin} ${ready.originAdded ? 'added to the site (its other origins are kept)' : 'already allowed'}\n`);
  }

  process.stdout.write(`\n  Open ${origin}\n\n`);

  if(flags.open){ openBrowser(origin); }
  return server;
}

// Something already answering on localhost:<port> (IPv4 or IPv6) counts as busy, even when the OS would let
// us bind the other address family; then listen, and on EADDRINUSE try the next port.
function answers(port, host){
  return new Promise((resolve) => {
    let sock = net.connect({ port, host });
    let done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(400, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}
export async function listenFree(server, start, tries){
  for(let port = start; port <= Math.min(65535, start + tries); port++){
    let busy = (await answers(port, '127.0.0.1')) || (await answers(port, '::1'));
    if(!busy){
      let ok = await new Promise((resolve, reject) => {
        let onError = (error) => { server.off('listening', onListen); error.code === 'EADDRINUSE' ? resolve(false) : reject(error); };
        let onListen = () => { server.off('error', onError); resolve(true); };
        server.once('error', onError); server.once('listening', onListen);
        server.listen(port);
      });
      if(ok){ return port; }
    }
  }
  let msg = tries ? `Ports ${start} to ${start + tries} are all in use. Pass a free one with --port.` : `Port ${start} is in use. Pass a different one with --port, or leave --port out and the Playground picks a free one.`;
  throw Object.assign(new Error(msg), { exit : 1 });
}

function openBrowser(url){
  let cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try{ spawn(cmd, [url], { stdio : 'ignore', detached : true, shell : process.platform === 'win32' }).unref(); }catch(error){ /* the URL is printed */ }
}
