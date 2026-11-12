# Sqid Playground

A real-looking website with the Sqid panel docked on the side. Open it and watch yourself get
identified. Try the scenarios, switch recipes on and off, read the record that goes out, then put
Sqid on your own site from the same panel.

The site is **Driftwood**, a made-up standing-desk company: a home page, a product with sizes and
finishes, pricing, a demo form, a cart and a sign-in. Everything on it exists so you can see what
Sqid does with it. The panel shows what the SDK on the page actually did; nothing is mocked.

```sh
npx -y @sqid-dev/playground
```

That signs you in to Sqid (browser), finds your account's Sandbox site, allows `http://localhost:3000`
on it, and opens the site. The Sandbox hands every new visitor one of fifty made-up people and never
spends a credit, so the identification, the webhook record and the recipes all run for real.

From Claude Code, the Sqid MCP server offers the same thing when you say "set up Sqid" and have no
website to paste the snippet into.

## What you can try

| Tab | What it does |
| --- | --- |
| **Start** | The five-step checklist (signed in, site, script, webhook, stream live) and the reveal: anonymous visitor, then the person, with the time it took. "Watch it again" makes you a new visitor. |
| **Live** | Every SDK event and page action, newest first: connected, `visitor.identified`, clicks, variant switches, form stalls. |
| **Scenarios** | Who you are right now, and a checklist of things to try on the site: switch sizes without buying, sign in and call `squid.identify()`, stall on the form, sit on the cart, return to pricing, labelled clicks, exit intent. |
| **Recipes** | The docs recipes, live on this site: DOM personalisation, pricing personalisation, chat, form prefill, exit intent, analytics, the service-provider pattern against a built-in mock database. Toggle one and the page changes; the code shown is the code from the docs. |
| **Delivery** | Your webhooks on the site (add any https endpoint, send a test), this visitor's full record from the visitor API, and a webhook sample. |
| **Go live** | Create a real site from its URL and get the snippet, the MCP and CLI one-liners for your app, the API and OEM links for embedding, and the plan box with "Add a card". |

Moments (Signals) never fire on a Sandbox site. Add a card in the console and turn Signals on for a
real site to see `visitor.moment` and the moment webhook.

## Options

```
sqid-playground [--port 3000] [--site <id|name>] [--no-open] [--api <origin>]
```

Sign-in is the sqid CLI's: `~/.config/sqid/credentials.json`, or `SQID_TOKEN`. `npx -y @sqid-dev/sqid auth login`
signs in ahead of time; otherwise the playground asks on first run.

## How it works

- `src/index.js` parses the options and starts the server.
- `src/sqid.js` is the bridge to the account: sign-in, the Sandbox, origins, webhooks, the visitor
  API (with a key bound to the site), creating a real site. It reuses the sqid CLI's modules, so there
  is one copy of auth.
- `src/server.js` serves the pages and a small local API under `/_sqid` (localhost only).
- `src/layout.js` and `src/pages/` are Driftwood. The real Sqid snippet goes before `</head>`.
- `public/panel.js` is the panel; `public/recipes.js` the recipes; `public/site.js` the site's own
  behaviour (variant picker, cart, sign-in calling `squid.identify`).

Nothing is stored except what the CLI already keeps. Scenario progress and recipe toggles live in
your browser's localStorage.

## Development

```sh
git clone https://github.com/sqid-dev/playground && cd playground
npm install
npm test
npm start
```

MIT. Driftwood and every person the Sandbox hands out are fictional.
