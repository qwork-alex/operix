# Migração de Armazenamento: Supabase Storage → MinIO

## Contexto

O frontend se comunicava diretamente com o Supabase Storage via SDK JS. O objetivo é substituir
esse armazenamento por um container MinIO auto-hospedado, mantendo os mesmos nomes de buckets
e campos `storage_path` no banco de dados.

---

## Arquitetura Adotada (Proxy Seguro)

MinIO **não é exposto** diretamente ao browser. Todo acesso de arquivo passa pelo backend.

- **Uploads**: frontend → `POST /storage/upload` (JWT) → backend → MinIO
- **Arquivos privados**: frontend → `GET /storage/file/:bucket/*path?token=JWT` → backend stream do MinIO
- **Arquivos públicos** (avatars, hail-reports, marketplace, logos): `GET /storage/public/:bucket/*path` → backend serve sem auth
- **Delete**: frontend → `DELETE /storage/files` (JWT) → backend → MinIO
- **MinIO Console** (porta 9001): apenas em `127.0.0.1` para administração local
- **MinIO API** (porta 9000): rede interna Docker apenas, não exposta ao host
- **Nomes dos buckets**: idênticos ao Supabase (sem mudança nos campos `storage_path` do banco)

### URLs de arquivo no frontend

| Tipo | Formato |
|------|---------|
| Arquivo privado | `{VITE_API_URL}/storage/file/{bucket}/{path}?token={jwt}` |
| Arquivo público | `{VITE_API_URL}/storage/public/{bucket}/{path}` |

O token JWT vai como query param para que `<img src>` e links de download funcionem sem fetch adicional.
O mesmo JWT já usado pelo app (expira em 7d conforme configurado).

---

## Buckets

| Bucket               | Visibilidade | Usado por                                          |
|----------------------|--------------|----------------------------------------------------|
| `uploads`            | Privado      | Documentos, frota, ordens de serviço, combustível, notas fiscais |
| `avatars`            | Público      | Fotos de perfil dos usuários                       |
| `hail-reports`       | Público      | Fotos de eventos de granizo (dashboard)            |
| `marketplace`        | Público      | Fotos de anúncios do marketplace                   |
| `logos`              | Público      | Logos de empresas                                  |
| `production-photos`  | Privado      | Fotos de ordens de produção (antes/durante/depois) |
| `accounting-receipts`| Privado      | Recibos de contabilidade                           |
| `billing-receipts`   | Privado      | Recibos de faturamento                             |
| `payment-proofs`     | Privado      | Comprovantes de pagamento                          |
| `invoice-pdfs`       | Privado      | PDFs de notas fiscais geradas                      |

---

## Etapas de Implementação

### ✅ Etapa 1 — Arquivo de plano criado

Este arquivo.

> **Status da migração: CONCLUÍDA** — Todos os arquivos foram migrados. TypeScript compilando sem erros no backend e frontend.

---

### Etapa 2 — Docker Compose: adicionar container MinIO

**Arquivo:** `docker-compose.yml`

Adicionar serviço `minio` com volume persistente. **Porta 9000 não exposta ao host** (rede interna Docker). Console 9001 apenas em loopback para administração local.

```yaml
minio:
  image: minio/minio:latest
  container_name: qw_nexus_minio
  restart: unless-stopped
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
    MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
  ports:
    - "127.0.0.1:${MINIO_CONSOLE_PORT:-9001}:9001"   # console: só loopback
  # porta 9000 (API S3) não exposta — backend acessa via rede interna Docker
  volumes:
    - minio_data:/data
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
    interval: 10s
    timeout: 5s
    retries: 5

volumes:
  minio_data:
```

Adicionar `minio` como dependência do serviço `api`.

---

### Etapa 3 — Variáveis de ambiente

**Arquivos:** `.env.example`, `backend/.env.example`, `docker-compose.yml` (seção `api`)

```env
# MinIO
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_CONSOLE_PORT=9001
MINIO_ENDPOINT=http://minio:9000        # interno: backend → minio via rede Docker
```

Não há `MINIO_PUBLIC_URL` — o browser nunca acessa MinIO diretamente.

---

### Etapa 4 — Backend: cliente MinIO

**Instalar:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `multer`, `@types/multer`

**Criar:** `backend/src/lib/minio.ts`

- Cliente S3 (`S3Client`) apontando para `MINIO_ENDPOINT`
- Função `ensureBuckets()`: cria os 10 buckets se não existirem e aplica política pública de leitura nos 4 buckets públicos
- Exportar o cliente e a função

**Chamar `ensureBuckets()`** em `backend/src/index.ts` no startup.

---

### Etapa 5 — Backend: rota de storage

**Criar:** `backend/src/routes/storage.ts`

| Método   | Rota                           | Auth | Descrição                                          |
|----------|--------------------------------|------|----------------------------------------------------|
| `POST`   | `/storage/upload`              | JWT  | Multipart upload; retorna `{ path, bucket }`      |
| `GET`    | `/storage/file/:bucket/*`      | JWT via `?token=` | Stream do arquivo do MinIO ao browser  |
| `GET`    | `/storage/public/:bucket/*`    | Nenhuma | Stream de arquivos de buckets públicos       |
| `DELETE` | `/storage/files`               | JWT  | Deleta um ou mais arquivos de um bucket            |

- Rotas `/file` e `/upload` e `/files`: middleware `authenticateToken` (header ou query param `token`)
- Rota `/public`: sem auth, apenas para buckets explicitamente listados como públicos

**Registrar** a rota em `backend/src/index.ts`.

---

### Etapa 6 — Frontend: camada de abstração `src/lib/storage.ts`

Wrapper que substitui `supabase.storage`. Constrói URLs do backend sem depender do MinIO diretamente:

```ts
uploadFile(bucket: string, path: string, file: File | Blob, contentType?: string): Promise<{ path: string }>
// POST /storage/upload com JWT no header Authorization

getFileUrl(bucket: string, path: string): string
// Buckets públicos  → `{VITE_API_URL}/storage/public/{bucket}/{path}`
// Buckets privados  → `{VITE_API_URL}/storage/file/{bucket}/{path}?token={jwt}`

deleteFiles(bucket: string, paths: string[]): Promise<void>
// DELETE /storage/files com JWT no header Authorization
```

`getFileUrl` substitui tanto `getPublicUrl` quanto `createSignedUrl` — a distinção público/privado fica encapsulada na lib.
Usa `VITE_API_URL` e o token JWT do localStorage.

---

### Etapa 7 — Frontend: substituir chamadas Supabase storage

Substituir `supabase.storage.from(bucket).*` por funções de `src/lib/storage.ts` nos 12 arquivos:

| Arquivo                                                         | Operações                                      |
|-----------------------------------------------------------------|------------------------------------------------|
| `src/components/dashboard/HailReportDialog.tsx`                 | uploadFile, getFileUrl                         |
| `src/components/fleet/DriversModule.tsx`                        | uploadFile                                     |
| `src/components/fleet/VehiclesModule.tsx`                       | uploadFile                                     |
| `src/components/fleet/FleetDocumentsModule.tsx`                 | uploadFile, deleteFiles, getFileUrl (×4)       |
| `src/components/fleet/FuelLogsModule.tsx`                       | uploadFile, deleteFiles                        |
| `src/hooks/useProductionPhotos.ts`                              | uploadFile, deleteFiles, getFileUrl            |
| `src/hooks/useMarketplace.ts`                                   | getFileUrl, deleteFiles                        |
| `src/hooks/useUserAvatar.ts`                                    | uploadFile, getFileUrl, deleteFiles            |
| `src/hooks/useServiceOrderPhotos.ts`                            | uploadFile, deleteFiles, getFileUrl            |
| `src/components/billing/ImportInvoiceDialog.tsx`                | uploadFile                                     |
| `src/components/file-manager/EmbeddedFileManager.tsx`           | getFileUrl (×2), deleteFiles, deleteFiles[]    |
| `src/pages/ModulePages.tsx`                                     | deleteFiles, deleteFiles[], uploadFile, getFileUrl (×3) |

---

## O que NÃO muda

- Banco de dados: campos `storage_path` continuam iguais
- Autenticação do app: JWT do backend
- Nomes dos buckets: idênticos
- Lógica de negócio dos componentes

---

## Variáveis de ambiente finais (resumo)

| Variável              | Onde            | Valor padrão              |
|-----------------------|-----------------|---------------------------|
| `MINIO_ROOT_USER`     | Backend/Compose | `minioadmin`              |
| `MINIO_ROOT_PASSWORD` | Backend/Compose | `minioadmin`              |
| `MINIO_ENDPOINT`      | Backend         | `http://minio:9000`       |
| `MINIO_CONSOLE_PORT`  | Compose         | `9001`                    |

> Não há variável `MINIO_PUBLIC_URL` nem `VITE_MINIO_*` — MinIO não é acessado pelo browser.
