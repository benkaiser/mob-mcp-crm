# Self-hosting Mob

<p class="lead">Run Mob on your own infrastructure with Node.js 20+, SQLite, and optional SMTP for account email flows.</p>

## Prerequisites

- Node.js 20 or newer.
- npm.
- Persistent disk for SQLite data in production.
- A public HTTPS origin if you want remote web, MCP, OAuth, or API access.
- Optional SMTP credentials for email verification and password reset delivery.

## Install

Clone the repository, install dependencies, then build the server, web app, and docs site:

```bash
npm install
npm run build
```

Start the built server with:

```bash
npm start
```

By default Mob listens on port `3000`, stores SQLite files in `./data`, serves the web app at `/app/`, the documentation at `/docs/`, the MCP endpoint at `/mcp`, and the public REST API at `/api/v1`.

## Key environment variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port for the Express server. | `3000` |
| `MOB_DATA_DIR` | Directory for persistent SQLite database files. Put this on durable storage. | `./data` |
| `MOB_BASE_URL` | Public origin used for OAuth metadata, email links, and absolute URLs. | `http://localhost:$PORT` |
| `MOB_HOSTED` | Set to `true` for hosted-style deployment behavior such as secure public-origin assumptions. | unset |
| `MOB_FORGETFUL` | Set to `true` to enable ephemeral forgetful mode without passing a CLI flag. | unset |
| `ENV` | Set to `production` for production/beta UI flags. | unset |

### Email / SMTP

Email is optional. If `SMTP_HOST` is not set, Mob logs a warning and skips sending account emails. Configure SMTP when you want verification and password reset emails delivered:

| Variable | Purpose | Default |
|---|---|---|
| `SMTP_HOST` | SMTP server hostname; enables email delivery when set. | unset |
| `SMTP_PORT` | SMTP port. | `587` |
| `SMTP_SECURE` | `true` for implicit TLS, usually port `465`. | `false` unless port is `465` |
| `SMTP_USER` | SMTP username, if required. | unset |
| `SMTP_PASS` | SMTP password, if required. | unset |
| `MAIL_FROM` | From address for Mob emails. | `Mob <no-reply@localhost>` |

Example production environment:

```bash
export NODE_ENV=production
export ENV=production
export PORT=3000
export MOB_BASE_URL=https://mob.example.com
export MOB_DATA_DIR=/var/lib/mob-crm
export SMTP_HOST=smtp.example.com
export SMTP_PORT=587
export SMTP_SECURE=false
export SMTP_USER=apikey
export SMTP_PASS=secret
export MAIL_FROM="Mob <no-reply@example.com>"
npm start
```

## Persistent mode

Persistent mode is the default. Users create accounts with email and password, OAuth with PKCE protects MCP clients, web sessions use cookies, and CRM data is stored permanently in SQLite under `MOB_DATA_DIR`.

```bash
MOB_DATA_DIR=/var/lib/mob-crm MOB_BASE_URL=https://mob.example.com npm start
```

Back up the entire data directory and test restores regularly.

## Forgetful mode

Forgetful mode is for demos, testing, or short-lived privacy-sensitive sessions. It bypasses login, gives each session isolated ephemeral data, and destroys data when the session ends or expires.

```bash
npm start -- --forgetful
# or
MOB_FORGETFUL=true npm start
```

Use forgetful mode for public demos, not as a substitute for production backups.

## Deployment notes

- Put Mob behind HTTPS before exposing it publicly.
- Set `MOB_BASE_URL` to the exact public origin, including `https://`.
- Store `MOB_DATA_DIR` on persistent storage, not an ephemeral container filesystem.
- Restrict filesystem permissions on the data directory because it contains user CRM data and auth records.
- Configure SMTP before relying on verification or password reset flows.
- Keep `/docs/` and `/api/v1/docs` public if you want built-in docs available; application data remains authenticated.
- Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before upgrading deployments.
