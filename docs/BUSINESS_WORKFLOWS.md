# Business Workflows

## 1. Dealer Order-to-Cash Workflow
1. Dealer logs into Dealer Portal and submits an order (`POST /orders`).
2. Backend calculates pricing and optional GST, verifies active status, credit limit (`SOFT_BLOCK` or `HARD_BLOCK`), and available stock.
3. Admin/Manager reviews and approves (`POST /orders/:id/approve`), selecting a source warehouse. Stock is **reserved**, not yet deducted.
4. Authorized staff dispatches partial or full quantity (`POST /orders/:id/dispatches`). In one atomic PostgreSQL transaction: reservation releases, physical stock decreases (`DISPATCH`), Sales Invoice is generated, and Dealer Ledger is debited.
5. Accountant records full/partial/advance payment (`POST /finance/payments` with `Idempotency-Key`), allocating across invoices, crediting Dealer Ledger, and issuing a Receipt PDF.

## 2. Procurement & Goods Receipt Workflow
1. Admin creates a Purchase Order (`POST /purchasing/purchase-orders`). Inventory does **not** change on PO creation.
2. Warehouse receives goods via GRN (`POST /purchasing/purchase-orders/:id/receipts`) recording accepted vs. rejected quantities. Only accepted quantity enters inventory and updates Weighted Average Cost (WAC).

## 3. Manufacturing Job Card & Material Custody Workflow
1. Admin creates Job Card (`POST /job-cards`) assigning product, target qty, required raw materials, and employees.
2. Material is issued from warehouse (`POST /job-cards/:id/issues`). Warehouse stock drops immediately; Job Card records `issuedQuantity` (not yet consumed).
3. Employee records actual `consumedQuantity` and `defectiveQuantity` (`POST /job-cards/:id/consumption`), requests replacement material if defective, and returns unused material (`POST /job-cards/:id/returns`), which restores warehouse stock.
4. Finished output (`POST /job-cards/:id/production`) credits Finished Goods inventory and recalculates unit production cost.
5. Closing a Job Card locks it against silent edits; amendments require audited reopening (`POST /job-cards/:id/reopen`).

## 4. Scrap & Waste Workflow
1. Employee/Supervisor logs scrap (`POST /scrap`), generating a unique `SCRAP-YYYY-NNNNNN` ID.
2. Supervisor/Inventory Manager verifies (`POST /scrap/:id/verify`), transferring verified scrap into Scrap Storage inventory.
3. Disposal/Reuse/Sale (`POST /scrap/:id/dispose`) deducts Scrap Inventory and records realized recovery separately from estimated value.
