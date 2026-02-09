---
# mob-crm-4ol5
title: Configure dev server with auto-reload
status: todo
type: task
priority: high
created_at: 2026-02-09T00:06:54Z
updated_at: 2026-02-09T00:06:54Z
parent: mob-crm-erun
---

Set up a development server that automatically reloads on file changes.

## Checklist
- [ ] Configure tsx watch mode for auto-reload (tsx watch src/index.ts)
- [ ] Add npm run dev script
- [ ] Verify auto-reload works when saving a file
- [ ] Add npm run build script (tsup or tsc)
- [ ] Add npm start script (runs built output with node)
- [ ] Add environment variable support: PORT (default 3000), MOB_DATA_DIR (default ./data)