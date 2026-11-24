# System Architecture

## Centralized Monorepo Layout

Business ERP uses a single centralized NestJS API, one PostgreSQL 17 relational database, one private S3-compatible document store, and one Next.js App Router frontend serving all portals.

- `packages/shared` (`@erp/shared`): Shared permission matrix (`PERMISSIONS`, `ROLES`, `DEFAULT_ROLE_PERMISSIONS`), domain enums, Zod validation schemas, and currency/quantity formatters.
- `apps/api` (`@erp/api`): Centralized NestJS API (`api/v1`) with Prisma ORM, Argon2id authentication, rotating HttpOnly refresh sessions, CSRF validation, rate limiting (`@nestjs/throttler`), Helmet headers, Pino structured logging, immutable `AuditService`, row-locked `SequenceService`, `IdempotencyInterceptor`, private `StorageService`, and Socket.IO `RealtimeGateway`.
- `apps/web` (`@erp/web`): Next.js App Router frontend with permission-driven role navigation (`AppShell`), automatic refresh-token rotation (`api-client.ts`), and responsive portal layouts.
- `prisma/`: Normalized PostgreSQL schema (`schema.prisma`) and idempotent bootstrap seed (`seed.ts`).

## Architectural Invariants

1. **Backend Source of Truth:** All pricing, taxation, stock balances, dealer ledger balances, production costs, and permissions are computed and enforced exclusively on the backend.
2. **Append-Only Ledgers:** Inventory movements (`inventory_transactions`) and dealer financial movements (`dealer_ledger_entries`) are append-only; corrections use reversals, credit notes, or approved adjustments.
3. **Concurrency & Idempotency:** Critical mutations lock balance and sequence rows inside PostgreSQL transactions (`SELECT ... FOR UPDATE`) and enforce `Idempotency-Key` headers stored in `idempotency_keys`.
4. **Role-Scoped Real-Time Events:** Socket.IO connections authenticate JWT tokens during handshake and join isolated rooms (`user:<id>`, `role:<code>`, `dealer:<id>`, `employee:<id>`).
