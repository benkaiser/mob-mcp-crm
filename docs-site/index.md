# Mob documentation

<p class="lead">Mob is a personal CRM for remembering people, conversations, reminders, gifts, debts, and the small details that make relationships easier to care for.</p>

<div class="cards">
  <div class="card"><strong>Use the web app</strong><br>Browse contacts, log activities, manage reminders, import data, and configure settings from <code>/app/</code>.</div>
  <div class="card"><strong>Talk over MCP</strong><br>Connect an AI client to <code>/mcp</code> and use natural language to create, find, and maintain CRM records.</div>
  <div class="card"><strong>Automate with REST</strong><br>Use API tokens with <code>/api/v1</code> for external integrations, export, and CRUD workflows.</div>
</div>

## Documentation sections

- **Usage** explains every Mob data type and the main user workflows.
- **API** maps web UI capabilities, internal web API routes, public REST API endpoints, and MCP tools.
- **MCP** explains client configuration and the context-saving <code>prime</code> plus consolidated <code>*_manage</code> tool design.

## Generated from markdown

This site is authored in `docs-site/*.md` and generated at build time by `npm run build:docs`. The generated HTML is served unauthenticated at `/docs/` by the Express server.
