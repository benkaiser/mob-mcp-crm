---
# mob-crm-erun
title: Project Scaffolding
status: todo
type: epic
priority: high
created_at: 2026-02-09T00:05:33Z
updated_at: 2026-02-09T00:06:43Z
parent: mob-crm-bkbs
blocking:
    - mob-crm-zbag
    - mob-crm-aq0e
---

Set up the project from scratch with all tooling and configuration.

## Scope
- Initialize npm project with TypeScript
- Configure tsconfig.json (strict mode)
- Set up Vitest for testing
- Set up tsup or tsc for building
- Configure ESLint
- Set up dev server with auto-reload (tsx watch or nodemon)
- Create npm scripts (dev, build, start, test, test:watch, lint)
- Set up project directory structure (src/, tests/, public/)
- Add .gitignore
- Configure MOB_DATA_DIR environment variable handling