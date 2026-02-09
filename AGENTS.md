**IMPORTANT**: before you do anything else, run the `beans prime` command and heed its output.
**IMPORTANT**: Read files in their entirety, do not read portions of files unless the contents are longer than 2000 lines.

# AGENTS.md — Instructions for AI Agents

## Project Overview

**Mob** is an AI-first Personal CRM built as an MCP (Model Context Protocol) server using Node.js and TypeScript. Users interact with the CRM entirely through natural language via MCP clients — there is no traditional GUI.

The name "Mob" comes from the term for a group of kangaroos.

## Key Documentation

- **[docs/FEATURES.md](docs/FEATURES.md)** — The comprehensive feature specification. This is the single source of truth for what Mob does and how it works. Read this before making any changes to the codebase.

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript (strict mode)
- **Protocol:** MCP with SSE transport
- **Database:** SQLite (via better-sqlite3)
- **Auth:** OAuth 2.0 with PKCE flow
- **Testing:** Vitest with in-memory SQLite
- **Build:** tsup or tsc (see package.json)

## Architecture

```
src/
├── server/               # MCP server setup, SSE transport, session management
├── auth/                 # OAuth PKCE flow, account creation, token management
├── db/                   # SQLite schema, migrations, connection management
│   └── migrations/       # Ordered SQL migration files
├── services/             # Business logic (one file per entity)
├── tools/                # MCP tool definitions and handlers (one file per entity group)
├── notifications/        # Notification generation, birthday checks, reminder checks
└── index.ts              # Entry point
```

### Key Architectural Decisions

1. **Service layer pattern:** All business logic lives in `src/services/`. MCP tools are thin wrappers that validate input and delegate to services. This keeps the logic testable without starting the MCP server.

2. **Two operating modes:**
   - **Persistent mode** (default): User accounts with email/password, permanent SQLite storage.
   - **Forgetful mode** (`--forgetful` flag): Ephemeral sessions, no login, data auto-destroyed on disconnect or after 2 hours.

3. **MCP Elicitation:** When creating contacts and other entities, use MCP elicitation to present structured forms to the user, pre-filled with data parsed from their natural language input.

4. **Session notifications:** On MCP session connect, check for overdue reminders, upcoming birthdays, and pending notifications and deliver them immediately.

5. **Soft deletes:** All primary entities use a `deleted_at` timestamp instead of hard deletes.

6. **Data directory:** The `MOB_DATA_DIR` environment variable controls where SQLite files are stored. Defaults to `./data` in development.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Development server with auto-reload
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Lint the codebase
```

## Testing Guidelines

- **Every MCP tool** needs at least a happy-path test and an error-case test.
- Tests use **in-memory SQLite** — no file system or network dependencies.
- Test files mirror the source structure: `src/services/contacts.ts` → `tests/integration/contacts.test.ts`.
- Use the shared fixtures in `tests/fixtures/` for seed data and helpers.
- Target **≥90% coverage** on the service layer.

## Work Tracking

This project uses **[beans](https://github.com/trybeans/cli)** for issue tracking. Issues are stored as markdown files in the `.beans/` directory.

```bash
beans list                    # List all issues
beans show <id>               # Show issue details
beans create "Title" -t task  # Create a new issue
beans prime                   # Get full agent instructions for beans
```

Always check beans for existing issues before starting work. Update bean status as you work, and include bean file changes in your commits.

## Conventions

- **Tool naming:** `{entity}_{action}` (e.g., `contact_create`, `reminder_list`)
- **File naming:** kebab-case for files, PascalCase for types/interfaces
- **Commits:** Conventional commits style (feat:, fix:, chore:, test:, docs:)
- **Error handling:** All service methods throw typed errors; MCP tool handlers catch and return structured error responses
