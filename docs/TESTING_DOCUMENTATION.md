# Testing & Quality Assurance Documentation

## Test Suites
1. **Unit Tests (`npm run test:api`):**
   - `auth.service.spec.ts` — Argon2id hashing/verification, brute-force account lockout, lockout rejection.
   - `permissions.guard.spec.ts` — Super Admin access, Employee blocked from finance, Dealer blocked from order approval, Accountant granted payment access.
   - `idempotency.interceptor.spec.ts` — Missing key rejection, duplicate payment replay, payload conflict 409.
   - `storage.service.spec.ts` — MIME allowlist, file size limit, HMAC signed URL verification & tamper/expiry rejection.
   - `zod-validation.pipe.spec.ts` — Input normalization and structured `fieldErrors`.
2. **End-to-End Integration, Security & Concurrency Tests (`npm run test:e2e`):**
   - `phase2-foundation.e2e-spec.ts` — Health/DB readiness, 401 protection, Super Admin login, CSRF refresh rotation, audit trail, 10x concurrent unique document sequences.
   - `erp-mandatory-scenarios.e2e-spec.ts` — Automated live PostgreSQL verification of Mandatory Scenarios **#1 through #24** (Order-to-Cash, Stock Reservation vs. Dispatch, Partial Payment & Idempotency Replay, Admin KPI reconciliation, Dealer Isolation 403, Employee Financial Block 403, Material Issue/Consume/Return/Defective+Replacement, Finished Goods, Production Costing, Unique Scrap ID & Scrap Inventory, Closed Job Card Lock, Audit Logs, and Concurrent Stock Issue Negative-Stock Prevention).
3. **Backup & Restore Verification (Mandatory Scenario #25):**
   - Verified via `scripts/backup-db.ps1` + `scripts/restore-verify.ps1` against PostgreSQL 17.
