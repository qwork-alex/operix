# Plug Multi-Workspace Context Engine into Real Modules

Conectar a infraestrutura já existente (`useContextualWorkspace`,
`ContextualWorkspacePicker`, `scopeQuery`, triggers DB
`set_workspace_id_from_creator` + `set_year_reference`) nos pontos de
**criação** de cada módulo, sem tocar em lógica, RLS, cálculos ou UI
existente.

## Princípio de segurança

- O DB **já** preenche `workspace_id` e `year_reference` via triggers
  quando o insert não trouxer esses campos. Logo: se o hook não estiver
  carregado/decidido, o sistema continua funcionando como hoje.
- Picker só aparece quando o usuário tem **2+ workspaces** com acesso
  ao módulo. Usuário single-workspace: zero diferença visual.
- Nenhuma query existente, RLS, função ou trigger é alterada.

## Mudanças por módulo (todas aditivas)

### 1. Ordens de Serviço (criação / upload)
- `src/components/service-orders/FileUploadZone.tsx` (ou wrapper de upload)
  - `const ctx = useContextualWorkspace("service_orders")`
  - Renderizar `<ContextualWorkspacePicker ctx={ctx} />` no header do uploader.
  - No insert do hook `useServiceOrders.create`, anexar `workspace_id: ctx.resolvedWorkspaceId ?? undefined` via prop opcional. Fallback: trigger.

### 2. Ordens de Pagamento
- `src/hooks/usePaymentOrders.ts` → aceitar `workspaceId?` opcional em payload.
- `src/components/payment-orders/*` (tela de criação) → montar picker `"payment_orders"`.

### 3. Faturamento (invoices + listas)
- `src/components/billing/ImportInvoiceDialog.tsx`
  - Picker `"billing"` no topo do dialog.
  - Passar `workspace_id` no insert de `billing_invoices` (linhas 248) e `billing_attachments` (251).

### 4. Financeiro / Despesas (Contabilidade)
- `src/components/financial/ExpenseSpreadsheet.tsx` (ou modal de nova despesa)
  - Picker `"financial"` na linha de criação.
  - Anexar `workspace_id` no insert de `financial_records`.

### 5. Frota — Trajetos
- `src/components/fleet/TripsModule.tsx`
  - Picker `"fleet"` no botão "Iniciar trajeto".
  - Anexar `workspace_id` no insert de `fleet_trips` (linha 498).

### 6. Documentos / Uploads gerais
- `src/components/file-manager/EmbeddedFileManager.tsx`
  - Picker `"documents"` no toolbar quando estamos em escopo global (não em SO/OP filhos).
  - Anexar `workspace_id` nos 3 inserts em `documents`.

## Compatibilidade

- Todos os campos novos são **opcionais**; quando ausentes, o trigger
  `set_workspace_id_from_creator` preenche via `app_users.workspace_id`
  do criador (comportamento atual).
- Nenhuma policy, função, view, índice ou cálculo é alterado.
- Não toca: `useServiceOrders.update`, OS↔OP sync, status engine,
  reconciliação, distribution math, billing totals.

## Validação pós-implementação

Smoke manual (sem migrations):
1. Login com usuário single-workspace → nenhum picker visível, criar
   OS / OP / invoice / despesa / trip / upload funciona.
2. Login com usuário multi-workspace → picker aparece nos 6 fluxos;
   após confirmar, picker colapsa para chip discreto.
3. Verificar via `select workspace_id from <tabela> order by created_at
   desc limit 5` que novos registros carregam o ws escolhido.
4. Garantir que OS↔OP↔Faturamento↔Financeiro continuam sincronizando
   (status engine intacto).

## Fora do escopo

- Não reorganiza árvores visuais (`groupByYearWorkspaceUser` continua
  disponível para refator futuro).
- Não migra dados antigos.
- Não troca RLS para filtrar por `workspace_id` (Fase 3 separada).
- Não altera contabilidade / globe / módulos de leitura.

## Arquivos tocados (estimado)

- `src/hooks/useServiceOrders.ts` (assinatura create + 1 linha payload)
- `src/hooks/usePaymentOrders.ts` (assinatura create + 1 linha)
- `src/components/service-orders/FileUploadZone.tsx`
- `src/components/payment-orders/*` (entry de criação)
- `src/components/billing/ImportInvoiceDialog.tsx`
- `src/components/financial/ExpenseSpreadsheet.tsx`
- `src/components/fleet/TripsModule.tsx`
- `src/components/file-manager/EmbeddedFileManager.tsx`
- `.lovable/memory/auth/contextual-action-engine.md` (notas de wiring)

Nenhuma migration. Nenhuma edge function alterada.
