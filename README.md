# Xhelal Shatri Clinic — Sistemi i Menaxhimit të Klinikës së Fizioterapisë

Sistem i plotë për menaxhimin e klinikës së fizioterapisë me shumë degë. I ndërtuar me Next.js 15, NestJS, PostgreSQL dhe Prisma ORM.

## Degët
- Prishtina
- Peja
- Istog

## Rolet
- **ADMIN** — Qasje e plotë
- **MANAGER** — Menaxhimi i degës dhe pacientëve
- **PHYSIOTHERAPIST** — Trajtimi dhe seancat

## Stack Teknologjik

### Frontend
- Next.js 15 (App Router)
- TypeScript
- TailwindCSS
- Shadcn/UI
- React Query (TanStack Query v5)
- Zustand
- NextAuth.js v5
- PWA (next-pwa)

### Backend
- NestJS 10
- TypeScript
- Prisma ORM
- PostgreSQL 16
- JWT Authentication
- RBAC Guards
- Audit Logging

### Infrastruktura
- Docker + Docker Compose
- Nginx (reverse proxy)

---

## Fillimi i Shpejtë

### Parakushtet
- Docker Desktop
- Node.js 20+
- pnpm

### 1. Klono projektin
```bash
git clone <repo-url> xhelal-shatri-clinic
cd xhelal-shatri-clinic
```

### 2. Konfiguro variablat e mjedisit
```bash
cp .env.example .env
# Edito .env me vlerat e tua
```

### 3. Nis me Docker
```bash
docker compose up -d
```

### 4. Krijo databazën dhe sedin
```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma db seed
```

### 5. Hap aplikacionin
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- API Docs (Swagger): http://localhost:4000/api

---

## Zhvillimi Lokal

### Backend
```bash
cd backend
pnpm install
pnpm prisma migrate dev
pnpm prisma db seed
pnpm start:dev
```

### Frontend
```bash
cd frontend
pnpm install
pnpm dev
```

---

## Kredencialet e Paracaktuara (Seed)

| Roli | Email | Fjalëkalimi |
|------|-------|-------------|
| Admin | admin@xhelalshatri.com | Admin123! |
| Manager Prishtina | manager.prishtina@xhelalshatri.com | Manager123! |
| Manager Peja | manager.peja@xhelalshatri.com | Manager123! |
| Manager Istog | manager.istog@xhelalshatri.com | Manager123! |
| Fizioterapist | fizio1@xhelalshatri.com | Fizio123! |

---

## Struktura e Projektit

```
xhelal-shatri-clinic/
├── backend/                  # NestJS API
│   ├── src/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── branches/
│   │   ├── patients/
│   │   ├── treatment-plans/
│   │   ├── sessions/
│   │   ├── treatments/
│   │   ├── payments/
│   │   ├── notifications/
│   │   ├── reports/
│   │   ├── pdf/
│   │   ├── dashboard/
│   │   ├── audit-logs/
│   │   └── prisma/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── Dockerfile
├── frontend/                 # Next.js 15
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── hooks/
│   │   ├── store/
│   │   └── types/
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Komandat e Dobishme

```bash
# Shiko logjet
docker compose logs -f backend
docker compose logs -f frontend

# Resetimi i databazës
docker compose exec backend npx prisma migrate reset

# Prisma Studio
docker compose exec backend npx prisma studio

# Build production
docker compose -f docker-compose.prod.yml up -d
```

---

## Licenca
© 2025 Xhelal Shatri Clinic. Të gjitha të drejtat e rezervuara.
