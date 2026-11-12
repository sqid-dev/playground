# AGENTS.md

Conventions for anyone (person or agent) changing this repo.

## Shape

Plain Node (18.17+), ES modules, two runtime dependencies: `express` and `@sqid-dev/sqid` (the
sqid CLI, for auth and the API). No build step, no TypeScript, no bundler. Published as
`@sqid-dev/playground`; the installed command is `sqid-playground`.

- `src/index.js` — options in, server out. Holds `USAGE`.
- `src/sqid.js` — `Bridge`: everything that touches the Sqid account. Only file that imports the CLI.
- `src/server.js` — the Express app: pages plus `/_sqid/*` (localhost only).
- `src/layout.js` — the Driftwood shell; `src/pages/<page>.html` are body fragments.
- `public/panel.js` — the panel (six tabs). `public/recipes.js` — the docs recipes, runnable.
  `public/site.js` — the site's own behaviour and the `sqid:page` events the panel listens to.

## Rules

- The panel shows what the SDK did. Never fake an event, a record or a delivery. If something is
  unavailable on the Sandbox (moments), say so in the panel.
- Driftwood is a made-up company and stays that way: no real brands, no real people. The Sandbox's
  fixture people come from Sqid's visitorID service, not from here.
- The site is light; the panel is the only dark surface. Inter for text, JetBrains Mono for code.
  No emoji, no icon fonts; inline SVG only.
- Recipe code shown in the panel must match the recipe at docs.sqid.dev. Change both or neither.
- Nothing is written to disk by this package. Browser state is localStorage/sessionStorage only.
- Keep `/_sqid` behind the localhost check; it acts with the person's own credentials.
- Commit messages: plain, no co-author trailers.

## Checks before a PR

```sh
npm test            # node --test, offline (fake bridge)
npm start -- --no-open   # needs a Sqid sign-in
```
