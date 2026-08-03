---
# mob-crm-tktc
title: Include resolved contact-method deep links in contact profile (MCP + web)
status: completed
type: feature
created_at: 2026-08-03T04:08:28Z
updated_at: 2026-08-03T04:08:28Z
---

getContactProfile (used by MCP contact_get and web GET /contacts/:id) now enriches each contact method with a resolved 'link' (tel:, mailto:, https://m.me/…) using the user's built-in/override/custom link templates, so MCP consumers get ready-to-use links. Added web type + integration test.