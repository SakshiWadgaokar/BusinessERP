# Role-Permission Matrix

Canonical permission definitions live in `packages/shared/src/permissions.ts` and are seeded into PostgreSQL (`roles`, `permissions`, `role_permissions`) by `prisma/seed.ts`.

## Roles
1. **`SUPER_ADMIN` (Super Admin / Owner):** Full permissions across all modules. Permissions cannot be restricted.
2. **`ADMIN_MANAGER` (Admin / Operations Manager):** Operational management (dealers, orders, inventory, purchasing, employees, job cards, scrap, operational reports). **Financial permissions (`payments:*`, `expenses:*`, `invoices:generate`, `credit_notes:manage`, `reports:finance`) are NOT granted by default** and must be explicitly assigned by Super Admin.
3. **`ACCOUNTANT` (Accountant):** Payments recording/verification, dealer ledgers, invoice/receipt generation, expenses, credit notes, costing overhead, and financial reports. Cannot mutate inventory balances or manufacturing production records.
4. **`DEALER` (Dealer):** Strictly isolated self-service portal (`dealers:own_read`, `dealers:own_update`, `orders:create`, `orders:read`, `invoices:read`, `payments:read`, `ledger:read`). All backend queries enforce `dealerId = currentUser.dealerId`.
5. **`EMPLOYEE` (Employee / Factory Worker):** Assigned Job Cards, material requests, production updates, and scrap recording. Cannot view or modify financial records, dealer balances, or warehouse stock directly.
6. **`INVENTORY_MANAGER` (Inventory Manager):** Multi-location stock overview, goods receipts, material issues/returns, transfers, adjustment requests, scrap verification/disposal, and inventory reports.

## Configurable Overrides
- Super Admin can modify role permission sets via `PUT /api/v1/roles/:code/permissions` (except `SUPER_ADMIN`).
- Super Admin can apply per-user grants or revocations via `user_permission_overrides` through `PATCH /api/v1/users/:id`.
- Every RBAC change is recorded in `audit_logs` with before/after permission arrays.
