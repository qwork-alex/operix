# Comunicação Operacional Externa do Agente IA

Transformar o QWork Agent num posto de comando que pode reportar problemas para fora do produto — com aprovação humana, anti-spam e múltiplos canais.

## O que o utilizador vai ver

1. **Nova secção em Configurações → Agente Operacional**
   - Contactos administrativos: WhatsApp admin, WhatsApp programador, e-mail de alertas, URL de webhook genérico.
   - Toggle por canal (WhatsApp / Email / Webhook) e por severidade (info / warning / critical).
   - Cooldown global (minutos) e janela de deduplicação.

2. **Fluxo de aprovação dentro do AgentPanel**
   - Quando o agente deteta um sinal `warn`/`error`, mostra um cartão "Reportar este problema?" com:
     - severidade detectada
     - canais que serão usados
     - botão **Gerar relatório** → pré-visualização (módulo, rota, timeline, screenshot opcional, análise)
     - botões **Enviar agora** / **Descartar**
   - Só envia depois da aprovação explícita do utilizador.

3. **Histórico de alertas enviados** (nova aba na secção do agente)
   - Lista os últimos N relatórios: severidade, canais, estado (`queued`/`sent`/`failed`), timestamp, link para ver payload.
   - Mostra estado de cooldown ativo ("próximo envio possível em 04m21s").

4. **Feedback de reparação**
   - Quando o sinal que originou o alerta deixa de estar ativo, o agente acrescenta automaticamente uma mensagem local no chat ("Problema corrigido — Realtime estabilizado") e marca o alerta como `resolved`. Não envia segunda notificação externa (sem spam).

## Severidades

| Nível | Quando | Canais sugeridos (default) |
|-------|--------|-----------------------------|
| `info` | Apenas log local | nenhum |
| `warning` | Sinais `warn` (plataforma degradada, radar parado >4h) | Email |
| `critical` | Sinais `error` (runtime errors recorrentes, realtime caído) | Email + WhatsApp admin |
| `operational` | Alertas marcados manualmente como operacionais | Webhook |

## Como funciona por dentro

### Tabelas novas (`supabase/migrations`)

- `agent_alert_settings` — singleton por workspace
  - `workspace_id` (FK), `admin_whatsapp`, `dev_whatsapp`, `alert_email`, `webhook_url`
  - `channels_enabled` jsonb (ex: `{whatsapp:true,email:true,webhook:false}`)
  - `severity_routing` jsonb (mapa severidade → canais)
  - `cooldown_minutes` int default 10
  - `dedupe_window_minutes` int default 30
  - RLS: apenas admin/owner do workspace lê/escreve.

- `agent_alerts` — append-only
  - `id`, `workspace_id`, `created_by`, `severity`, `signal_id`, `title`, `detail`
  - `payload` jsonb (relatório completo: route, module, timeline, analysis, screenshot data url opcional)
  - `channels` text[] (canais usados)
  - `status` text (`pending_approval` / `approved` / `sent` / `partial` / `failed` / `discarded` / `resolved`)
  - `dedupe_key` text (hash de `signal_id + module + dia`)
  - `sent_at`, `resolved_at`
  - Index em (`workspace_id`,`dedupe_key`,`created_at`) para cooldown lookup.
  - RLS: workspace members veem; só admin escreve via edge function.

### Edge function `agent-dispatch-alert`

Recebe `{ alert_id }` autenticado. Carrega o alerta, valida:
- workspace do utilizador,
- cooldown (last alert mesmo `dedupe_key` < N min ⇒ 429 `cooldown_active`),
- canais ativos vs severidade.

Envia em paralelo:
- **Email** via Lovable Emails (`send-transactional-email`) com template HTML rico (severidade, módulo, timeline, análise, screenshot inline se < 200 KB).
- **WhatsApp** via Twilio connector (gateway). Texto curto + link para o produto. Só envia se número estiver configurado.
- **Webhook** POST JSON cru para `webhook_url` (assinatura HMAC com `LOVABLE_API_KEY` truncado como segredo de integridade — sem expor).

Atualiza `agent_alerts.status` a `sent` / `partial` / `failed` e regista `email_send_log` / `backend_event_logs`.

### Cliente

- `src/hooks/useAgentAlertSettings.ts` — get/update das settings com TanStack Query.
- `src/hooks/useAgentAlerts.ts` — lista alertas + mutation `approveAndSend`, `discard`.
- `src/lib/agentAlertEngine.ts` — pega nos sinais do `useOperationalSignals`, calcula severidade, gera `dedupe_key`, e propõe alerta. Aplica cooldown localmente (anti-spam de UI).
- `src/components/agent/AgentAlertCard.tsx` — cartão de aprovação dentro do AgentPanel.
- `src/components/agent/AgentAlertHistory.tsx` — nova tab "Alertas" no AgentPanel.
- `src/components/settings/AgentAlertsSettings.tsx` — painel em Configurações.

### Anti-spam (regras combinadas)

1. **Cooldown** por `dedupe_key`: ignora aprovações repetidas dentro de `cooldown_minutes`.
2. **Deduplicação**: se já existe alerta com o mesmo `dedupe_key` em `dedupe_window_minutes` com status `pending_approval` ou `sent`, atualiza o existente em vez de criar novo.
3. **Agrupamento**: se 3+ sinais `warn` no mesmo módulo dentro de 5 min, cria um único alerta "Múltiplas anomalias em <módulo>" com todos os signal IDs no payload.
4. **Resolução automática**: quando o sinal correspondente sai do snapshot durante `dedupe_window_minutes`, marca o alerta como `resolved` (sem nova notificação).

### Segurança

- Edge function valida JWT, confirma membership do workspace, e que o utilizador tem papel `admin` ou `socio` antes de despachar.
- Nada é enviado sem registo em `agent_alerts` com `approved_by = auth.uid()`.
- Toggle global "Pausar alertas externos" disponível para o admin.

## Pré-requisitos / dependências externas

- **Email**: usa Lovable Emails (já no projeto se houver domínio configurado).
- **WhatsApp**: requer connector Twilio ativado (será sugerido na UI se ainda não estiver — sem bloquear o resto).
- **Webhook**: nenhum, é só URL pública do destinatário.

## Fora de scope desta fase

- Push notifications nativas.
- Reply-bidirecional via WhatsApp (apenas envio).
- Templates personalizáveis pelo utilizador (template fixo nesta fase, parametrizável depois).
