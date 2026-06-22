---
# mob-crm-yw9i
title: Typed API client + signals data layer
status: completed
type: task
priority: high
created_at: 2026-05-29T13:47:58Z
updated_at: 2026-05-29T15:02:05Z
parent: mob-crm-rl0m
---

A small typed client over `/web/api/*` plus signal-based state utilities, so feature views stay thin.

## Design
- `api.ts`: thin fetch wrapper handling base URL, JSON, envelope unwrapping, error mapping (throws typed ApiError {code,message,details}), CSRF header injection, 401 -> redirect to login.
- Typed methods generated/hand-written per entity (contacts.list, contacts.get, etc.) — start with a generic `request<T>()` + per-entity modules added by feature epics.
- Shared TypeScript types: reuse/duplicate service interface shapes (Contact, Activity, etc.) in a `web/types.ts`; consider exporting service types from src/services for reuse.
- A tiny `useResource` helper (signals) for load/loading/error/refetch patterns; a `useMutation` helper for create/update/delete with optimistic option.
- Toast/error surface hook for mutations.

## Checklist
- [x] Fetch wrapper with envelope unwrap + ApiError + CSRF + 401 handling
- [x] Shared entity types (reuse service interfaces where possible)
- [x] useResource (load/loading/error/refetch) signal helper
- [x] useMutation helper (with optional optimistic update + toast)
- [x] Tests for client error mapping + helpers (where practical)
