Plano aprovado COM RESTRIÇÃO TOTAL DE ESCOPO.

Este é um ajuste estrutural mínimo, NÃO uma evolução do sistema.

REGRAS ABSOLUTAS:

1. NÃO alterar nenhuma funcionalidade existente

2. NÃO modificar frontend (zero mudanças visuais ou de lógica de tela)

3. NÃO criar sistema de subscriptions

4. NÃO alterar comportamento de login

5. NÃO alterar RLS atual

6. NÃO remover nada existente

7. NÃO criar fluxos novos

OBJETIVO ÚNICO:

- Garantir separação correta entre usuário e workspace

- Preparar base para RBAC futuro sem impactar o sistema atual

PERMITIDO APENAS:

- Criar tabela memberships (user_id, workspace_id, role)

- Popular memberships com base nos user_roles existentes

- Criar função SQL: effective_role(user_id, workspace_id)

- Garantir que essa função NÃO substitua nada ainda (apenas preparação)

REGRAS DE SEGURANÇA:

- Tudo deve ser idempotente (rodar mais de uma vez sem quebrar)

- Não sobrescrever dados existentes

- Não apagar nenhum registro

- Não alterar relações existentes

IMPORTANTE:

Nenhuma lógica do sistema deve passar a usar memberships ainda.

Nenhuma tela deve ser alterada.

Nenhuma decisão deve ser tomada automaticamente.

Isso é apenas preparação de base.

Se qualquer etapa sair desse escopo, IGNORAR.

Resultado esperado:

Sistema continua funcionando exatamente igual, com nova base pronta para evolução futura.