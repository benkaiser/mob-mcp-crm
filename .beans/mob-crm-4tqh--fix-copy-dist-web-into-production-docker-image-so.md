---
# mob-crm-4tqh
title: 'Fix: copy dist-web into production Docker image so /app SPA is served'
status: completed
type: bug
priority: high
created_at: 2026-06-22T01:08:29Z
updated_at: 2026-06-22T01:08:33Z
---

The Dockerfile builder runs 'npm run build' which produces dist-web/, but the production stage only copies /app/dist (not /app/dist-web). As a result the deployed container 404s on /app because express.static can't find dist-web. Fix by adding 'COPY --from=builder /app/dist-web ./dist-web'. Runtime resolves webDir to /app/dist-web via __dirname/../dist-web.