// sqid-playground: argv in, a running Driftwood site out.
//
//   sqid-playground [--port 3000] [--site <id>] [--no-open] [--api <origin>]
//
// Signs in through the sqid CLI's credentials (run `sqid auth login` once, or let this do it),
// finds the account's Sandbox site, allows this origin on it, and serves the site with the
// Sqid panel docked on the right.

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createApp } from './server.js';
import { Bridge } from './sqid.js';

const USAGE = `Usage: sqid-playground [options]

Runs the Sqid Playground on localhost: a real-looking website (Driftwood) with the Sqid panel
docked on the side. Watch a visitor get identified, try the scenarios and recipes, see the
record that goes out, then go live on your own site.

Options:
  --port <n>      Port to listen on (default 3000)
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
    else if(a === '--port'){ flags.port = Number(argv[++i]); }
    else if(a === '--site'){ flags.site = argv[++i]; }
    else if(a === '--api'){ flags.api = argv[++i]; }
    else if(a.startsWith('--port=')){ flags.port = Number(a.slice(7)); }
    else { throw Object.assign(new Error(`Unknown option ${a}\n\n${USAGE}`), { exit : 2 }); }
  }
  if(!Number.isInteger(flags.port) || flags.port < 1 || flags.port > 65535){ throw Object.assign(new Error('--port must be a number between 1 and 65535'), { exit : 2 }); }
  return flags;
}

export async function main(argv){
  let flags = parse(argv);
  if(flags.help){ console.log(USAGE); return; }

  let bridge = new Bridge(flags);
  let origin = `http://localhost:${flags.port}`;

  process.stdout.write('Sqid Playground\n');
  let ready = await bridge.prepare(origin);   // signs in if needed, finds the Sandbox, allows the origin
  process.stdout.write(`  Signed in as ${ready.email}\n`);
  process.stdout.write(`  Site: ${ready.site.name} (${ready.site.id})${ready.site.sandbox ? ', Sandbox' : ''}\n`);
  process.stdout.write(`  Origin ${origin} ${ready.originAdded ? 'allowed on the site' : 'already allowed'}\n`);

  let app = createApp(bridge);
  let server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(flags.port, resolve); });
  process.stdout.write(`\n  Open ${origin}\n\n`);

  if(flags.open){ openBrowser(origin); }
  return server;
}

function openBrowser(url){
  let cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try{ spawn(cmd, [url], { stdio : 'ignore', detached : true, shell : process.platform === 'win32' }).unref(); }catch(error){ /* the URL is printed */ }
}
