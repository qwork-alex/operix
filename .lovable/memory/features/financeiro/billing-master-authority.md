---
name: Billing Master Authority
description: Phase 3 — Billing invoices are the source of truth for paid/partial/pending. Triggers propagate to OPs, SOs, and Financial Received. financial_events table logs the flow.
type: feature
---

## Flow

```
SO → Expected (financial_records source='service_orders')
OP → linked to SO via group_id
Billing Invoice → metadata.linked_payment_orders[uuid]
  ├─ billing_invoices_autostatus    (pending|partial|paid from paid_amount)
  ├─ billing_invoices_propagate_status → updates OP.status; emits invoice.status.updated + op.status.synced
  ├─ sync_so_status_from_po (existing)  → cascades SO.status from OPs
  └─ trg_billing_sync_financial → sync_financial_received_from_billing(invoice_id)
        ├─ UPSERTs financial_records source='billing' (proportional paid_amount * op.total / sum(op.totals))
        └─ emits invoice.created | invoice.updated | financial.received.updated
```

## Key rules

- **Expected** revenue: `financial_records.source='service_orders'` (unchanged).
- **Received** revenue: `financial_records.source='billing'` for OPs with invoices; legacy `source='payment_orders'` only when OP has no invoice (`payment_order_has_invoice(op_id)` gate in `sync_financial_records_from_orders`).
- Never overwrite OP status from UI when invoice exists — trigger will reassert it.
- `workspace_id` is set on every emitted record/event (multi-workspace safe with Phase 2.5 RLS).

## DB additions

- table `financial_events` (RLS: select for workspace members; writes via security definer only)
- fn `emit_financial_event(ws, type, entity_type, entity_id, payload)`
- fn `sync_financial_received_from_billing(invoice_id)`
- fn `payment_order_has_invoice(op_id)`
- fn `trg_billing_sync_financial()` + trigger `billing_invoices_sync_financial`
- Updated: `billing_invoices_propagate_status`, `sync_financial_records_from_orders`

## Frontend

- `useFinancialEvents(workspaceId)` — read-only audit hook.
- No UI redesign. Existing aggregations work because new billing records carry correct amount/status.

## Migration philosophy

Additive only. Legacy `source='payment_orders'` rows coexist; new flow only kicks in when invoice is attached to OP.
