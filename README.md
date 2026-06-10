# QW Nexus

## Stack atual

- Frontend: `Vite + React + TypeScript`
- Infra nova: `Docker Compose`
- Banco novo: `Postgres`
- API nova: `Node + Express + Prisma + JWT`

## Subir em Docker

1. Copie `.env.example` para `.env`
2. Ajuste senhas, portas e chaves
3. Rode:

```bash
docker compose up --build
```

## Servicos

- Frontend: `http://localhost:8080`
- API: `http://localhost:4000/api`
- Healthcheck API: `http://localhost:4000/api/health`
- Postgres: `localhost:5432`

## Backend proprio

O backend inicial fica em `backend/` e ja expõe:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

## Migracao do Supabase

O projeto ainda possui forte acoplamento ao Supabase no frontend legado.
O diagnostico tecnico e o plano de migracao estao em:

- `docs/migracao-supabase-postgres.md`
