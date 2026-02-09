# 🦘 Mob — AI-First Personal CRM

**Mob** is a personal CRM you interact with entirely through natural language. Built as an [MCP](https://modelcontextprotocol.io/) server, there are no forms, no dashboards, no buttons — just talk about your relationships and Mob keeps track.

> *"Mob" is the name for a group of kangaroos.*

## What It Does

Mob helps you maintain meaningful relationships by remembering everything about the people in your life:

- **Contacts** — Store names, birthdays, addresses, work info, food preferences, and more
- **Relationships** — Map how people are connected (family, friends, colleagues, partners)
- **Activities** — Log phone calls, coffee dates, dinners, and shared experiences
- **Life Events** — Record milestones like graduations, weddings, new jobs, and moves
- **Reminders** — Never forget a birthday, follow-up, or check-in
- **Notes** — Pin important things to remember about someone
- **Gifts & Debts** — Track gift ideas and money owed
- **Tags & Groups** — Organize contacts into social circles

## How It Works

Mob is an **MCP server**. You connect to it with an MCP-compatible AI client, and interact using natural language:

```
You: "Add a new contact: Sarah Chen, she works at Google as a senior engineer"
You: "Log that I had coffee with Mike yesterday at Blue Bottle"
You: "When is Tom's birthday?"
You: "Remind me to call Lisa next Tuesday"
You: "Who haven't I talked to in a while?"
```

The AI assistant interprets your intent and calls the appropriate MCP tools behind the scenes.

## Connecting

### MCP Connection Details

| Setting | Value |
|---------|-------|
| **Transport** | SSE (Server-Sent Events) |
| **Server URL** | `http://localhost:3000/mcp` |
| **Auth** | OAuth 2.0 with PKCE |

### Recommended Client

We recommend **[Joey MCP Client](https://github.com/benkaiser/joey-mcp-client)** for connecting to Mob.

### Connecting with other MCP clients

Any MCP-compatible client that supports SSE transport and OAuth can connect. Configure your client with the server URL above and it will be guided through the OAuth flow.

## Operating Modes

### Persistent Mode (Default)

Full-featured mode with user accounts. Create an account with your name, email, and password. Your data is stored permanently in a local SQLite database.

```bash
mob-crm start
```

### Forgetful Mode

Ephemeral mode for demos or privacy-sensitive use. No login required — data exists only for the session and is automatically destroyed on disconnect or after 2 hours.

```bash
mob-crm start --forgetful
```

## Development

### Prerequisites

- Node.js 20+
- npm

### Getting Started

```bash
# Install dependencies
npm install

# Run in development mode (auto-reload)
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Start production server
npm start
```

### Deployment

Mob stores its data in a SQLite database. For deployment, configure the `MOB_DATA_DIR` environment variable to point to a persistent storage directory:

```bash
# Set the data directory for SQLite storage
export MOB_DATA_DIR=/var/data/mob-crm

# Start the server
npm start
```

The server will create and manage its SQLite database files in the specified directory. Ensure this directory is on persistent storage (not an ephemeral filesystem) to retain data across restarts.

### Project Structure

```
mob-mcp-crm/
├── docs/
│   └── FEATURES.md          # Full feature specification
├── src/
│   ├── server/               # MCP server setup, SSE transport
│   ├── auth/                 # OAuth PKCE flow, account management
│   ├── db/                   # SQLite schema, migrations, queries
│   ├── services/             # Business logic per entity
│   ├── tools/                # MCP tool definitions and handlers
│   └── notifications/        # Notification generation and delivery
├── tests/
│   ├── unit/                 # Pure function tests
│   ├── integration/          # Service + database tests
│   └── e2e/                  # MCP protocol tests
└── public/
    └── index.html            # Homepage / landing page
```

## Documentation

- **[Feature Specification](docs/FEATURES.md)** — Comprehensive specification covering all entities, MCP tools, auth, elicitation, and testing strategy

## License

MIT
