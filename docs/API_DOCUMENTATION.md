# API Documentation

**Base URL:** `/api/v1`  
**OpenAPI / Swagger (non-production):** `/api/docs`  
**Authentication:** `Authorization: Bearer <accessToken>` + `HttpOnly` refresh cookie (`erp_refresh_token`) + `X-CSRF-Token` header on `/auth/refresh`.  
**Idempotency:** Required `Idempotency-Key` header on `POST /orders/:id/dispatches`, `POST /finance/payments`, `POST /finance/credit-notes`, `POST /inventory/opening-stock`, `POST /inventory/transfers`, `POST /purchasing/purchase-orders/:id/receipts`, `POST /job-cards/:id/issues`, `POST /job-cards/:id/returns`, and `POST /job-cards/:id/production`.

## Endpoint Index
- **Health:** `GET /health`, `GET /health/ready`
- **Auth:** `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`, `POST /auth/forgot-password`, `POST /auth/reset-password`
- **Users & RBAC:** `GET|POST /users`, `GET|PATCH /users/:id`, `GET /roles`, `GET /roles/permissions`, `PUT /roles/:code/permissions`
- **Settings & Audit:** `GET|PATCH /settings`, `GET /audit-logs`
- **Dealers:** `GET|POST /dealers`, `GET|PATCH /dealers/me`, `GET /dealers/me/summary`, `GET|PATCH /dealers/:id`, `GET /dealers/:id/summary`, `GET /dealers/:id/purchases`
- **Orders & Dispatches:** `GET|POST /orders`, `GET /orders/:id`, `POST /orders/:id/submit`, `POST /orders/:id/approve`, `POST /orders/:id/reject`, `POST /orders/:id/cancel`, `POST /orders/:id/dispatches`, `POST /orders/dispatches/:dispatchId/confirm-delivery`
- **Inventory & Catalog:** `GET /inventory/uoms`, `GET /inventory/categories`, `GET|POST /inventory/locations`, `GET|POST /inventory/items`, `PATCH /inventory/items/:id`, `GET /inventory/balances`, `GET /inventory/transactions`, `GET /inventory/low-stock`, `POST /inventory/opening-stock`, `POST /inventory/transfers`, `GET|POST /inventory/adjustments`, `POST /inventory/adjustments/:id/decision`
- **Purchasing:** `GET|POST /purchasing/suppliers`, `GET|POST /purchasing/purchase-orders`, `POST /purchasing/purchase-orders/:id/receipts`, `GET|POST /purchasing/supplier-invoices`, `POST /purchasing/supplier-payments`
- **Finance:** `GET /finance/summary`, `GET /finance/invoices`, `GET /finance/invoices/:id`, `GET /finance/ledger/:dealerId`, `GET|POST /finance/payments`, `POST /finance/payments/:id/reverse`, `POST /finance/credit-notes`, `GET /finance/expense-categories`, `GET|POST /finance/expenses`
- **Documents:** `GET /documents/search`, `GET /documents/invoices/:invoiceId/pdf`, `GET /documents/payments/:paymentId/receipt-pdf`, `GET /documents/dispatches/:dispatchId/challan-pdf`, `GET /documents/:id/download-url`, `GET /documents/:id/stream`
- **Employees & Job Cards:** `GET|POST /employees`, `GET /employees/me/dashboard`, `GET /employees/:id/summary`, `PATCH /employees/:id`, `GET|POST /job-cards`, `GET /job-cards/:id`, `POST /job-cards/:id/material-requests`, `POST /job-cards/:id/issues`, `POST /job-cards/:id/consumption`, `POST /job-cards/:id/returns`, `POST /job-cards/:id/production`, `GET /job-cards/:id/costing`, `POST /job-cards/:id/costs`, `POST /job-cards/:id/close`, `POST /job-cards/:id/reopen`
- **Scrap:** `GET|POST /scrap`, `GET /scrap/summary`, `POST /scrap/:id/verify`, `POST /scrap/:id/dispose`
- **Analytics, Reports & Notifications:** `GET /analytics/dashboard`, `GET /reports/search`, `GET /reports/:type`, `GET /reports/:type/export?format=csv|xlsx|pdf`, `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`
