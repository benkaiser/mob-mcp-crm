---
# mob-crm-fexk
title: Tight transparent edge-to-edge favicon
status: completed
type: task
created_at: 2026-05-30T14:04:47Z
updated_at: 2026-05-30T14:04:47Z
---

Cropped the Bubble Roo favicon to the kangaroo's bounding box (transparent, edge-to-edge) for crisp small-size rendering.

- favicon.svg: viewBox cropped to 301 271 1500 1500 (tight square around content bbox x329-1774 y474-1568), transparent, no background rect.
- favicon-32.png: transparent 32x32 PNG fallback for browsers without SVG favicon support.
- apple-touch-icon.png: 180x180 WITH azure #F5F9FF background + ~12% inset (iOS fills transparent apple icons black, so this one keeps a bg).
- index.html updated: SVG favicon, transparent favicon-32 PNG, dedicated apple-touch-icon.
- PWA icons (icon-192/512/maskable) unchanged — they intentionally keep the background.
- Rebuilt web; assets verified in dist-web.