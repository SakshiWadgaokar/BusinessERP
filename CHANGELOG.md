# Changelog

All notable changes to Business ERP are documented here by implementation phase.

## [1.0.0] — Phases 3–9: Complete Production ERP System
- **Phase 3 (Dealers & Orders):** Implemented Dealer onboarding, credit settings, isolated Dealer Portal (Place Order, My Orders, Purchase History, Invoices, Payments, Read-Only Ledger, Profile), and 10-state Order Workflow with approval stock reservation, partial/full dispatch stock deduction, automatic invoicing, and delivery confirmation.
- **Phase 4 (Inventory & Purchasing):** Implemented Products & Raw Materials catalog, unlimited Stock Locations/Warehouses, append-only Inventory Ledger with row-locked WAC costing, Opening Stock, Warehouse/Factory Transfers, approval-gated Stock Adjustments, Low-Stock Alerts with replenishment costing, Suppliers, Purchase Orders, Partial Accepted/Rejected Goods Receipts (GRN), and Supplier Invoices/Payments.
- **Phase 5 (Finance & Documents):** Implemented append-only Dealer Ledger, idempotency-protected Multi-Invoice Payment Recording & Allocations, Non-Destructive Payment Reversals, Credit Notes, Operating Expenses, and PDFKit Sales Invoice / Payment Receipt / Delivery Challan PDF generation stored privately with short-lived signed download URLs.
- **Phase 6 (Employees, Job Cards & Production Costing):** Implemented Employee Management & Mobile-First Employee Portal, Job Card lifecycle with locked closure & audited reopening, Material Requests/Replacements, Approved Material Issues (distinct from consumption), Actual Consumption & Defective Material tracking, Material Returns, Finished Goods Receipts, and transparent Production Costing with incomplete-costing disclosure.
- **Phase 7 (Scrap & Waste Management):** Implemented unique sequential Scrap IDs (`SCRAP-YYYY-NNNNNN`), Supervisor Verification into Scrap Inventory, Reuse/Sale/Disposal workflows tracking Estimated vs. Realized Recovery separately, and Scrap Valuation reporting.
- **Phase 8 (Analytics, Reports, Global Search & Real-Time):** Implemented full 19-KPI Admin Executive Dashboard with date-range filters and Recharts visualizations, Reports Hub with CSV/Excel/PDF exports, role-aware Global Search, and Socket.IO real-time notifications.
- **Phase 9 (QA Hardening, Backup/Restore & Documentation):** Fixed atomic PostgreSQL sequence concurrency (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`), verified all 25 Mandatory QA Scenarios (Unit + Live PostgreSQL E2E #1–#24 + Live Backup/Restore Verification Drill #25), and completed all 14 living documentation files.

## [0.2.0] — Phase 2: Project Foundation
- Initialized monorepo, normalized PostgreSQL 17 Prisma schema & migration (`20261124035457_init_erp_schema`), idempotent seed, Argon2id auth + rotating HttpOnly refresh cookies + CSRF + rate limiting, RBAC guards, Audit/Idempotency/Sequence/Storage services, and Next.js AppShell + Admin screens.

## [0.1.0] — Phase 1: Requirement Analysis & Architecture
- Inspected greenfield repository and produced SRS/RTM, System Architecture, ER Diagram, Role-Permission Matrix, Unresolved Business Decisions, Risk Analysis, and 9-Phase Roadmap.
