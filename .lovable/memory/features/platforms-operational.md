---
name: Platforms Operational Entity
description: Canonical platforms table + state log + optional FK on service_orders. Lifecycle states active/paused/archived/degraded with realtime UI controls in dashboard.
type: feature
---

# Platforms Operational Entity

- **Tables**: `platforms` (workspace-scoped, slug unique per ws, state enum, heartbeat & ingest timestamps, color, metadata) + `platform_state_log` (audit of every state transition via BEFORE UPDATE trigger).
- **States**: `active` · `paused` · `archived` · `degraded`.
- **FK**: `service_orders.platform_id` nullable, links to canonical entity. Legacy `service_orders.platform` text kept for backward compatibility.
- **Backfill**: distinct `(workspace_id, lower(trim(platform)))` from service_orders inserted as `active`. Service order FK linking is deferred to app layer because the SO ownership trigger requires an authenticated user.
- **RLS**: workspace members read/insert/update; only admins delete. Uses `is_workspace_member(auth.uid(), workspace_id)`.
- **Realtime**: both tables in `supabase_realtime` publication with `REPLICA IDENTITY FULL`.
- **Hook**: `usePlatforms()` — query + realtime channel `platforms-{ws}` + `setState` mutation with optimistic update + `create` mutation.
- **UI**: `PlatformsPanel` (cards grid with status badge, pulse dot when active, heartbeat/ingest "tempo atrás", inline buttons Ativar/Pausar/Arquivar). Rendered on `/` dashboard.
- **KPIs**: `useOperationalKpis` + `OperationalKPIs` — 6 cards (Plataformas Ativas, Degradadas, Alertas, Eventos 24h, Técnicos Ativos, Clientes Ativos) replace the previous financial KPIs.
- **Events**: `OperationalEventsStream` merges `ai_alerts`, `ai_recommendations`, `automation_executions`, `discrepancies`, `hail_events`, `backend_event_logs` into a single realtime feed (max 30).
