---
name: Hardening Fase A1 (RLS leaks)
description: Tapou 3 vazamentos (discrepancies, drivers, sod) + flag is_system_owner como fallback ao email do owner
type: feature
---

Aplicado em Fase A1 do hardening de identidade:

- `discrepancies.SELECT` agora exige admin/partner OU dono da SO relacionada (via EXISTS em service_orders.user_id/assigned_user_id/created_by). Antes: qualquer authenticated.
- `drivers.SELECT` agora exige admin/partner OU `created_by = auth.uid()`. Antes: qualquer technician via tudo.
- `service_order_distributions.SELECT` ampliado: além de admin/partner, dono da SO vê o próprio breakdown (via EXISTS em service_orders).
- `profiles.is_system_owner` boolean (default false) — owner atual marcado.
- `is_user_active(uid)` aceita is_system_owner=true OR email='qwork@qworkgroup.com' OR não banido. Email mantido como fallback duplo.
- Tabela `rls_validation_logs` criada para auditoria temporária (somente admin lê/escreve).

Próximo: Fase A2 (profiles_public + clients restrita) — não aplicar antes de validar 24h.
