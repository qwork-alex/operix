# Plano de Implementacao Para Amanha

## Contexto

Este projeto saiu da infra do Lovable/Supabase e esta em migracao para uma
stack propria em VPS com:

- `frontend` React/Vite em Docker
- `api` Node/Express
- `postgres` em Docker
- autenticacao propria com JWT

A base da migracao ja esta funcional e os principais blocos de autenticacao,
workspace, billing de plataforma, invoices operacionais e clientes
operacionais ja foram movidos para a API propria.

## O que ja esta concluido

- Docker com `frontend`, `api` e `postgres`
- autenticacao JWT propria
- contexto de conta/workspace/perfil sem depender do Supabase Auth
- billing de plataforma e Stripe pela API propria
- `PaymentsScreen` migrada
- `UpcomingBillsScreen` migrada
- `InvoicesScreen` migrada
- `ImportInvoiceDialog` migrado
- `SendInvoiceDialog` migrado
- `ClientsScreen` migrada
- modelo Prisma para dominio operacional de faturacao:
  - `BillingClient`
  - `BillingSupplier`
  - `BillingInvoice`
  - `BillingAttachment`
  - `InvoiceSendLog`
  - `BackendEventLog`
- endpoints operacionais de clientes, invoices, anexos e auditoria
- build Docker e smoke tests dos fluxos migrados de invoices e clientes

## Prioridade de amanha

### 1. Fechar o billing operacional que ainda depende de Supabase

Arquivos prioritarios:

- `src/components/billing/ReportsScreen.tsx`
- `src/components/billing/ReconciliationScreen.tsx`

Objetivo:

- remover queries/mutations diretas com `supabase`
- substituir por `apiRequest(...)`
- expor no backend os endpoints que faltarem para relatorios e conciliacao
- preservar a UX atual sem abrir um novo modelo paralelo

### 2. Completar lacunas funcionais abertas na migracao recente

- pagamentos no detalhe do cliente:
  - hoje a aba existe, mas o endpoint operacional devolve `payments: []`
  - decidir se:
    - modelamos `billing_payments` no Prisma, ou
    - mapeamos oficialmente os pagamentos administrativos/transferencias para
      o dominio operacional
- envio real de email de invoice:
  - hoje `SendInvoiceDialog` grava logs com `provider = simulated`
  - falta integrar SMTP ou provedor transacional real
- OCR/extracao automatica:
  - `ImportInvoiceDialog` esta manual-first
  - falta um substituto self-hosted ou backend-driven para `extract-invoice`

### 3. Continuar a retirada global do Supabase

Estado atual levantado no frontend:

- ainda existem referencias ao cliente Supabase em `87` arquivos
- ainda existem `421` ocorrencias de uso ligado a:
  - `storage.from(...)`
  - `createSignedUrl(...)`
  - `supabase.functions.invoke(...)`
  - acesso direto a tabelas

Isso significa que o billing operacional avancou bastante, mas a migracao total
do produto ainda esta longe de terminar.

## Backlog detalhado

### Billing

#### `ReportsScreen.tsx`

Falta:

- mapear todas as consultas ao Supabase
- criar endpoint consolidado de relatorios no backend
- validar filtros, agregacoes e metricas
- confirmar se o backend usa invoices operacionais, invoices de plataforma ou
  ambos
- adicionar smoke test focado em leitura de relatorios

#### `ReconciliationScreen.tsx`

Falta:

- mapear dependencias em:
  - conciliacoes
  - pagamentos
  - comprovativos/anexos
  - eventuais rotinas automatizadas
- criar/ajustar endpoints backend para listar, editar e reconciliar
- decidir o modelo definitivo entre dominio operacional e `manual_bank_transfers`
- validar regras de status e impacto financeiro

#### Clientes

Ja migrado, mas ainda falta:

- preencher a aba de pagamentos com dados reais
- decidir se os anexos em `data_url` ficam apenas como transicao
- futuramente trocar anexos para storage proprio:
  - S3
  - MinIO
  - disco local com rota autenticada

#### Invoices operacionais

Ja migrado, mas ainda falta:

- OCR real
- envio real de email
- possivel download/armazenamento estruturado de PDF em storage proprio
- testes mais focados em casos de regressao de status:
  - `pending`
  - `partial`
  - `paid`
  - `overdue`
  - `cancelled`

### Backend/API

Falta:

- ampliar a cobertura de rotas para os modulos restantes ainda presos ao Supabase
- consolidar uma estrategia unica para anexos e arquivos
- revisar se todos os endpoints administrativos estao com controle de role
- adicionar mais testes automatizados backend onde houver regra critica
- eventualmente separar dominios grandes em routers/modulos proprios para evitar
  crescimento excessivo de `billing.ts`

### Banco/Prisma

Falta:

- decidir o destino do dominio legado `billing_payments`
- avaliar se reconciliacao precisa de modelos Prisma dedicados
- revisar indexes para consultas de relatorios e conciliacao
- revisar a estrategia atual de `prisma db push` e considerar migracoes formais
  quando o esquema estabilizar

### Storage

Falta:

- remover dependencia restante de Supabase Storage
- definir backend oficial para arquivos
- criar estrategia de acesso autenticado a anexos
- definir convencao de persistencia:
  - invoices
  - comprovativos
  - avatars
  - fotos operacionais
  - documentos de frota

### Realtime

Falta:

- mapear onde o app ainda depende de realtime do Supabase
- decidir substituto:
  - WebSocket
  - SSE
  - polling controlado
- migrar primeiro os fluxos mais criticos para a operacao

### Edge Functions

Ainda ha dependencias importantes de funcoes Supabase, incluindo areas como:

- company lookup
- extracao de documentos
- automacoes
- reconciliacao
- processamento de emails
- integracoes auxiliares

Falta:

- inventariar quais funcoes ja tem substituto na API
- mover o que falta para:
  - rotas Express
  - jobs/workers
  - servicos externos configurados no backend

## Ordem recomendada de execucao amanha

1. Migrar `ReportsScreen.tsx`
2. Migrar `ReconciliationScreen.tsx`
3. Definir o destino de `billing_payments` para fechar a aba de pagamentos dos clientes
4. Escolher a estrategia oficial de storage
5. Levantar o proximo lote de modulos fora do billing com maior dependencia de Supabase

## Validacoes obrigatorias amanha

Ao final de cada bloco migrado:

- rodar `docker compose build api frontend`
- subir com `docker compose up -d api frontend`
- executar smoke test autenticado dos novos endpoints
- validar a tela no navegador
- verificar regressao de permissao por role

## Riscos conhecidos

- os diagnosticos locais do editor continuam poluidos por dependencias nao
  resolvidas no host, entao a referencia confiavel continua a ser o build Docker
- anexos em `data_url` resolvem a migracao, mas nao sao a solucao final de
  storage
- `SendInvoiceDialog` ainda nao envia email real
- `ImportInvoiceDialog` ainda nao extrai OCR automaticamente
- relatorios e conciliacao podem depender de tabelas/fluxos legados que ainda
  nao foram espelhados integralmente no Prisma

## Resultado esperado ao fim de amanha

Se a prioridade acima for concluida, devemos terminar o dia com:

- todo o bloco principal de billing/admin fora do Supabase
- relatorios e conciliacao servidos pela API propria
- uma decisao clara sobre pagamentos operacionais
- backlog seguinte preparado para storage, realtime e modulos operacionais fora
  do billing
