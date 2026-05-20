# Fase 3 — Billing como Autoridade Financeira Master

## Objetivo

Reverter o sentido de propagação atual:
- **Antes:** OP define status (paid/partial/pending) → SO espelha. Billing é opcional.
- **Depois:** **Billing** é a fonte da verdade de pagamento real. Billing → OP → SO. Financial "Recebido" só vem de Billing.

Sem quebrar cálculos atuais, comunicação OS↔OP, distribuição de lucro, participação ou isolamento multi-workspace (Fase 2.5).

## Arquitetura final

```text
SO (criada)         → Expected (Financial)
   │
   └─ OP (importada) → vincula a SO (group_id / plate+week)
         │
         └─ Billing Invoice (criada a partir de 1+ OPs)
                │  paid_amount, total_amount
                ├─ status auto: pending|partial|paid  (já existe: billing_invoices_autostatus)
                ├─ propaga → OP.status               (já existe: billing_invoices_propagate_status)
                ├─ propaga → SO.status               (já existe: sync_so_status_from_po cascateia)
                ├─ propaga → Financial.Received      (NOVO: usar Billing, não OP, como fonte)
                └─ recalcula Distribution/Participação sobre valor REAL pago
```

## Mudanças

### 1. Banco (migration aditiva, não destrutiva)

**1a. Tabela `financial_events` (log de eventos)**
- `id, workspace_id, event_type, entity_type, entity_id, payload jsonb, created_at, actor_user_id`
- event_type: `invoice.created | invoice.updated | invoice.payment.updated | invoice.status.updated | op.status.synced | so.status.synced | financial.received.updated`
- RLS: select por workspace member; insert via security definer.

**1b. Função `emit_financial_event(...)`** security definer — insere em `financial_events`.

**1c. Ajustar `billing_invoices_propagate_status`** para também:
- Emitir eventos (`invoice.status.updated`, `op.status.synced`).
- Manter lógica atual de UPDATE em payment_orders.

**1d. Nova função `sync_financial_received_from_billing(invoice_id)`**
- Para cada OP linkada na `metadata->linked_payment_orders`:
  - Calcula `received = sum(billing.paid_amount * (op.total / billing.total_amount))` proporcional, OU usa `paid_amount` direto quando 1 OP = 1 invoice.
- Faz UPSERT em `financial_records` (type='revenue', source='billing'):
  - `amount = received_real` (apenas pagos)
  - `status = invoice.status`
  - `notes = 'Auto-synced from billing invoice'`
- **NÃO toca** registros `source='service_orders'` (Expected) nem `source='payment_orders'` legacy.
- Emite `financial.received.updated`.

**1e. Trigger `trg_billing_sync_financial`** AFTER INSERT/UPDATE de `paid_amount|total_amount|status` em `billing_invoices` → chama `sync_financial_received_from_billing(NEW.id)`.

**1f. Neutralizar OP→Financial (manter compat de leitura)**
- `sync_financial_records_from_orders` continua existindo para SO (Expected), mas **deixa de criar/atualizar** registros `source='payment_orders'` quando existir invoice cobrindo essa OP. Fallback: se OP não está em nenhuma invoice, mantém comportamento antigo (transição segura).

**1g. View `v_financial_summary` (opcional, aditiva)**
- Por workspace + year: `expected` (sum SO totals), `received` (sum billing.paid_amount), `pending = expected - received`.

### 2. Frontend (mínimo, sem mudar UI)

**2a. Bloquear edição manual de status em OP quando vinculada a invoice**
- `PaymentOrdersPage` / dialog de edição: se a OP tem invoice ligada (`billing_invoice_id` via metadata reverso ou nova coluna virtual), desabilitar o select de status com tooltip "Status gerenciado por Faturamento".
- Cálculos/distribuição **inalterados**.

**2b. Hook `useFinancialEvents(workspaceId)`** (novo, opcional)
- Lê últimos N eventos de `financial_events` para painel de auditoria. Não obrigatório para esta fase — apenas a infra fica pronta.

**2c. Queries de "Received" em Financial**
- Onde hoje somam `financial_records WHERE source='payment_orders'`, passar a somar `source='billing'` (com fallback OR `source='payment_orders'` para registros legacy sem invoice).

### 3. Preservação

- ❌ Sem mudanças em: `apply_order_owner`, RLS de fase 2.5, OS↔OP matching, `profit_distribution_*`, `sync_so_status_from_po` (continua funcionando), UI principal.
- ✅ Tudo aditivo. Migration reversível.

## Validações pós-implementação

1. Criar SO → Expected aparece, Received=0.
2. Importar OP → Expected/Received inalterados (sem invoice ainda).
3. Criar Billing Invoice com `paid_amount=0` → status=pending → OP=pending → SO=pending.
4. Atualizar `paid_amount=parcial` → status=partial → OP/SO=partial → Financial Received = parcial.
5. `paid_amount = total` → tudo paid; Received = total real.
6. Editar manualmente status OP vinculada → bloqueado na UI.
7. Cross-workspace: invoice do WS-A não afeta OP/SO do WS-B (RLS + scope).
8. `financial_events` registra cada transição.
9. Sem dupla contagem: Received só por `source='billing'`.

## Riscos

- **Registros legacy** com `source='payment_orders'` precisam ou ser migrados ou continuar coexistindo com filtro. **Plano:** coexistência via OR durante transição; migração explícita em fase futura.
- **OPs sem invoice** continuam usando fluxo antigo (fallback). Aceitável.

## Não inclui

- Migração destrutiva de dados antigos.
- Mudança de UI/UX visível além do disable do select.
- Mudança em regras de distribuição/participação (apenas o **input** muda: valor real pago).
