---
# mob-crm-4ol5
title: Configure dev server with auto-reload
status: completed
type: task
priority: high
created_at: 2026-02-09T00:06:54Z
updated_at: 2026-02-09T00:12:58Z
parent: mob-crm-erun
---

Set up a development server that automatically reloads on file changes.

## Checklist
- [x] Configure tsx watch mode for auto-reload (tsx watch src/index.ts)
- [x] Add npm run dev script
- [x] Verify auto-reload works when saving a file
- [x] Add npm run build script (tsup or tsc)
- [x] Add npm start script (runs built output with node)
- [x] Add environment variable support: PORT (default 3000), MOB_DATA_DIR (default ./data)