# Software Requirements Specification (SRS)

## 1. Purpose & Scope
Commercial Manufacturing & Distribution **Business ERP** serving 3 interconnected portals (Admin, Dealer, Employee/Factory) and 6 role-based interfaces (Super Admin, Admin/Manager, Accountant, Dealer, Employee, Inventory Manager) on one centralized NestJS API, PostgreSQL 17 database, and private S3-compatible document store.

## 2. Implemented Functional Modules
- **Identity, Auth & RBAC:** Argon2id hashing, brute-force lockout, rotating HttpOnly refresh cookies, CSRF verification, configurable role permissions and per-user overrides.
- **Dealer Management & Portal:** Dealer onboarding, credit limits, isolated portal logins, self-service ordering, read-only financial summary & ledger, invoice/receipt PDF downloads.
- **Order-to-Cash Workflow:** 10-state order lifecycle, credit limit enforcement (Soft/Hard Block), approval-time stock reservation, dispatch-time physical stock deduction, partial/multi-dispatch, atomic invoice generation, and delivery confirmation.
- **Multi-Location Inventory & Purchasing:** Unified item catalog, unlimited stock locations, append-only stock movement ledger, Weighted Average Cost (WAC), opening stock, warehouse/factory transfers, approval-gated stock adjustments, low-stock alerts with replenishment costing, suppliers, purchase orders, and partial accepted/rejected goods receipts (GRN).
- **Finance & Documents:** Append-only dealer ledger, idempotency-protected multi-invoice payment recording & allocations, non-destructive payment reversals, credit notes, operating expenses, PDFKit invoice/receipt/challan generation stored privately with short-lived signed URLs.
- **Employees, Job Cards & Production Costing:** Employee portal, Job Card lifecycle with locked closure & audited reopen, material requests/replacements, approved issues (distinct from consumption), actual consumption & defective material tracking, material returns, finished goods receipts, and transparent production costing with incomplete-data disclosure.
- **Scrap Management:** Unique sequential Scrap IDs (`SCRAP-YYYY-NNNNNN`), supervisor verification into Scrap Inventory, reuse/sale/disposal workflows tracking estimated vs. realized recovery separately.
- **Analytics, Real-Time & Reports:** 19-KPI Admin Dashboard, Recharts visualizations, role-scoped Socket.IO real-time events, in-app notifications, global role-aware search, and CSV/Excel/PDF report exports.
