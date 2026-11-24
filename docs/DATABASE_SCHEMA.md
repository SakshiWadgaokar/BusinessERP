# Database Schema Reference

The single source of truth for the PostgreSQL 17 schema is `prisma/schema.prisma`.

## Precision & Integrity Standards
- **Monetary values:** `DECIMAL(18, 2)` — floating-point types are prohibited.
- **Quantities & Unit Costs:** `DECIMAL(18, 4)`.
- **Foreign Keys:** Financial, inventory, manufacturing, and audit tables enforce `onDelete: Restrict` to prevent accidental cascade deletion of business history.
- **Append-Only Tables:** `inventory_transactions`, `dealer_ledger_entries`, `payments`, `scrap_movements`, and `audit_logs`.

## Table Groups
1. **Identity & RBAC:** `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `user_permission_overrides`, `user_sessions`, `password_reset_tokens`
2. **Dealers:** `dealers`, `dealer_addresses`, `dealer_credit_settings`, `dealer_ledger_entries`
3. **Employees:** `employees`, `employee_activity`
4. **Catalog & BOM:** `units_of_measurement`, `item_categories`, `items`, `bills_of_materials`, `bill_of_material_items`
5. **Multi-Location Inventory:** `stock_locations`, `inventory_balances`, `inventory_transactions`, `stock_reservations`, `stock_transfers`, `stock_transfer_items`, `stock_adjustments`, `stock_adjustment_items`
6. **Suppliers & Purchasing:** `suppliers`, `purchase_orders`, `purchase_order_items`, `goods_receipts`, `goods_receipt_items`, `supplier_invoices`, `supplier_payments`
7. **Orders, Dispatches & Invoicing:** `dealer_orders`, `dealer_order_items`, `dispatches`, `dispatch_items`, `delivery_confirmations`, `sales_invoices`, `sales_invoice_items`
8. **Finance:** `payments`, `payment_allocations`, `credit_notes`, `expense_categories`, `expenses`, `financial_adjustments`
9. **Manufacturing & Job Cards:** `job_cards`, `job_card_assignments`, `job_card_materials`, `material_requests`, `material_request_items`, `material_issues`, `material_returns`, `production_records`, `production_costs`, `finished_goods_receipts`
10. **Scrap:** `scrap_records`, `scrap_movements`, `scrap_disposals`
11. **Documents, Notifications & Platform Integrity:** `documents`, `notifications`, `notification_preferences`, `audit_logs`, `system_settings`, `document_sequences`, `idempotency_keys`, `approval_records`, `backup_logs`
