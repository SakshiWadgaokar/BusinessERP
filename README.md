# Business ERP

Production-grade Manufacturing & Distribution **Business ERP**.

## Architecture Overview

- **`packages/shared` (`@erp/shared`):** Canonical RBAC permission catalog & default role-permission mappings, domain enums, Zod validation schemas, and currency/quantity formatters.
- **`apps/api` (`@erp/api`):** Centralized NestJS REST API (`/api/v1`) + Socket.IO Gateway (`/events`) + Prisma ORM + PostgreSQL 17 + Argon2id Auth + Private S3-compatible document storage + PDFKit/ExcelJS generators.
- **`apps/web` (`@erp/web`):** Next.js App Router + React + TypeScript + Tailwind CSS multi-portal UI covering all 6 role interfaces (Super Admin, Admin/Manager, Accountant, Dealer, Employee/Factory, Inventory Manager).
- **`prisma/`:** Normalized PostgreSQL 17 relational schema, SQL migrations, and idempotent bootstrap seeder.
- **`scripts/`:** Automated PostgreSQL backup (`backup-db.ps1`) and clean-database restore verification (`restore-verify.ps1`).

## Setup & Running Locally

1. Copy `.env.example` to `.env` and configure `DATABASE_URL` and secrets.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate Prisma Client, apply migrations, and seed roles, permissions, locations, UoMs, and Super Admin:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate:deploy
   npm run prisma:seed
   ```
4. Build and run:
   ```bash
   npm run build
   npm run dev:api   # http://localhost:4000/api/v1 (Swagger: /api/docs)
   npm run dev:web   # http://localhost:3000
   ```

## Testing & Backup Verification

```bash
npm run test:api   # Jest unit tests (auth, RBAC, idempotency, validation, storage)
npm run test:e2e   # Live PostgreSQL 17 E2E tests (Mandatory Scenarios #1–#24)
powershell -ExecutionPolicy Bypass -File scripts/backup-db.ps1
powershell -ExecutionPolicy Bypass -File scripts/restore-verify.ps1   # Mandatory Scenario #25
```

## Project Documentation (All 14 Living Docs)

- [SRS](docs/SRS.md)
- [System Architecture](docs/SYSTEM_ARCHITECTURE.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [ER Diagram](docs/ER_DIAGRAM.md)
- [API Documentation](docs/API_DOCUMENTATION.md)
- [Role-Permission Matrix](docs/ROLE_PERMISSION_MATRIX.md)
- [Business Workflows](docs/BUSINESS_WORKFLOWS.md)
- [Security Guidelines](docs/SECURITY_GUIDELINES.md)
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Backup & Recovery](docs/BACKUP_AND_RECOVERY.md)
- [Testing Documentation](docs/TESTING_DOCUMENTATION.md)
- [User Manual](docs/USER_MANUAL.md)
- [Changelog](CHANGELOG.md)
