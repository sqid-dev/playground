# Sqid Playground

A real-looking website with the Sqid panel docked on the side. Open it and watch an anonymous
visitor (you) turn into a person. Then send that record to your app, or put Sqid on your own site,
from the same panel.

The site is **Driftwood**, a made-up standing-desk company: a home page, a product with sizes and
finishes, pricing, a demo form, a cart and a sign-in. Everything on it exists so you can see what
Sqid does with it. The panel shows what the SDK on the page actually did; nothing is mocked.

```sh
npx -y @sqid-dev/playground
```

That signs you in to Sqid (browser), finds your account's Sandbox site, adds `http://localhost:3000`
to its allowed origins (the origins already on the site are kept), and opens the site. The Sandbox hands every new visitor one of fifty made-up people and never
spends a credit, so the identification, the webhook record and the recipes all run for real.

From Claude Code, the Sqid MCP server offers the same thing when you say "set up Sqid" and have no
website to paste the snippet into.

## What you can try

The panel opens on one screen: the reveal.

| Where | What it does |
| --- | --- |
| **First screen** | An anonymous visitor, then the person, with the time it took. Name, company and title, and "See the full record" for everything Sqid returned. A one-line status ("Working", "Connecting", or what is wrong) with **Details** for the setup checks (signed in, site, script, webhook, first identification). |
| **Be someone new** | Calls `await squid.anonymouse()` and reloads. On a Sandbox that forgets the made-up person (it resolves `{ forgotten: true }`), so the next load is a new test person. Matching is by device, so a private window usually comes back as the same person. The console's **Forget identity** on a Test profile does the same. |
| **Send this to my app** | Add any https address as a webhook, send a test, and see an example of what gets sent. |
| **Put Sqid on my site** | Create a real site from its address and copy the one line of code. Below it: what it costs (prepaid credits, below) and, under "Other ways", the Claude Code / CLI one-liners and the API and OEM plan for putting Sqid inside your product. |
| **Explore** | Behind the button at the top. **Live events**: every SDK event and page action, newest first. **Things to try**: switch sizes without buying, sign in and call `squid.identify()`, stall on the form, sit on the cart, return to pricing, labelled clicks, exit intent. **Recipes**: the docs recipes live on this site (DOM and pricing personalisation, chat, form prefill, exit intent, analytics, the service-provider pattern against a built-in mock database); toggle one and the page changes. |

The Sandbox is free: every visitor is one of fifty made-up people and no credits are used. A real
site runs on the Developer plan's prepaid credits, $0.25 each, with 25 welcome credits when you add
a card; nothing is charged unless you buy credits or turn on auto-reload. Putting Sqid inside your
own product is the OEM plan: OEM Launch is $675/month with 500 identifications/month included.

Moments (Signals) never fire on a Sandbox site. Turn Signals on for a real site to see
`visitor.moment` and the moment webhook.

## Options

```
sqid-playground [--port 3000] [--site <id|name>] [--no-open] [--api <origin>]
```

Sign-in is the sqid CLI's: `~/.config/sqid/credentials.json`, or `SQID_TOKEN`. `npx -y @sqid-dev/sqid auth login`
signs in ahead of time; otherwise the playground asks on first run.

## How it works

- `src/index.js` parses the options and starts the server.
- `src/sqid.js` is the bridge to the account: sign-in, the Sandbox, origins (read from the site
  and only ever added to), webhooks, the visitor record, creating a real site. It reuses the sqid CLI's modules, so there
  is one copy of auth.
- `src/server.js` serves the pages and a small local API under `/_sqid` (localhost only).
- `src/layout.js` and `src/pages/` are Driftwood. The real Sqid snippet goes before `</head>`.
- `public/panel.js` is the panel; `public/recipes.js` the recipes; `public/site.js` the site's own
  behaviour (variant picker, cart, sign-in calling `squid.identify`).

Nothing is stored except what the CLI already keeps. Scenario progress, recipe toggles and the
last panel screen live in your browser's localStorage.

## Development

```sh
git clone https://github.com/sqid-dev/playground && cd playground
npm install
npm test
npm start
```

MIT. Driftwood and every person the Sandbox hands out are fictional.
