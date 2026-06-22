---
# mob-crm-wbf4
title: Restrict outbound webhook targets for hosted beta
status: completed
type: bug
priority: high
created_at: 2026-06-22T03:03:24Z
updated_at: 2026-06-22T03:51:05Z
---

If webhooks are enabled for hosted users, user-controlled webhook URLs can SSRF internal services. Require HTTPS URLs, block localhost/link-local/private/reserved IPs after DNS resolution, re-check redirects, set strict timeouts, and document/verify production egress firewall controls. Confirm MOB_HOSTED=true keeps this gated from free users.