/**
 * Generates an executive-grade PDF explaining all Business ERP workflows,
 * portals, features, and technical specifications.
 *
 * Usage: node scripts/generate-spec-pdf.js
 * Output: docs/Business_ERP_Complete_Workflow_and_Specifications.pdf
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const OUT_PATH = path.resolve(__dirname, '..', 'docs', 'Business_ERP_Complete_Workflow_and_Specifications.pdf');

const COLORS = {
  navy: '#1B2A4A',
  navyLight: '#2B4270',
  accent: '#2563EB',
  teal: '#0F766E',
  text: '#0F172A',
  muted: '#475569',
  subtle: '#64748B',
  border: '#CBD5E1',
  rowAlt: '#F8FAFC',
  calloutBg: '#EFF6FF',
  calloutBorder: '#2563EB',
  warnBg: '#FEF3C7',
  warnBorder: '#D97706',
  white: '#FFFFFF',
};

const PAGE_W = 595.28; // A4 width
const PAGE_H = 841.89; // A4 height
const MARGIN = 46;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_H - 58;

function createDoc() {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: 'Business ERP — Complete Workflow, Features & Technical Specifications',
      Author: 'Business ERP Documentation',
      Subject: 'Manufacturing, Inventory, GST Billing & Distribution ERP Specifications',
      Keywords: 'ERP, Manufacturing, Inventory, GST Billing, Dealer Portal, Employee Portal, Next.js, NestJS, PostgreSQL',
    },
  });

  let isCover = true;

  function ensureSpace(neededHeight) {
    if (doc.y + neededHeight > BOTTOM_LIMIT) {
      doc.addPage();
      isCover = false;
      doc.y = MARGIN + 16;
    }
  }

  function sectionHeader(num, title, subtitle) {
    ensureSpace(120);
    if (doc.y > MARGIN + 24) {
      doc.moveDown(0.7);
    }
    const y = doc.y;
    // Left accent pill
    doc.rect(MARGIN, y, 5, 24).fill(COLORS.accent);
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(COLORS.navy)
      .text(`${num}. ${title}`, MARGIN + 13, y + 3, { width: CONTENT_W - 13 });
    if (subtitle) {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(COLORS.subtle)
        .text(subtitle, MARGIN + 13, doc.y + 1, { width: CONTENT_W - 13 });
    }
    doc.moveDown(0.35);
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN + CONTENT_W, doc.y)
      .lineWidth(0.8)
      .strokeColor(COLORS.border)
      .stroke();
    doc.moveDown(0.5);
  }

  function subHeader(title) {
    ensureSpace(72);
    doc.moveDown(0.35);
    doc
      .font('Helvetica-Bold')
      .fontSize(11.5)
      .fillColor(COLORS.navyLight)
      .text(title, MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.25);
  }

  function paragraph(text) {
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.text);
    const h = doc.heightOfString(text, { width: CONTENT_W, lineGap: 2.5 });
    ensureSpace(h + 8);
    doc.text(text, MARGIN, doc.y, { width: CONTENT_W, lineGap: 2.5 });
    doc.moveDown(0.4);
  }

  function bulletList(items) {
    for (const item of items) {
      let lead = '';
      let body = item;
      if (typeof item === 'object' && item.lead) {
        lead = item.lead;
        body = item.body;
      }
      const fullStr = lead ? `${lead} ${body}` : body;
      doc.font('Helvetica').fontSize(9.2);
      const h = doc.heightOfString(fullStr, { width: CONTENT_W - 16, lineGap: 2 });
      ensureSpace(h + 6);
      const y = doc.y;
      doc.circle(MARGIN + 5, y + 5, 2).fill(COLORS.accent);
      if (lead) {
        doc
          .font('Helvetica-Bold')
          .fontSize(9.2)
          .fillColor(COLORS.text)
          .text(lead + ' ', MARGIN + 14, y, { width: CONTENT_W - 14, continued: true, lineGap: 2 });
        doc.font('Helvetica').fillColor(COLORS.muted).text(body, { lineGap: 2 });
      } else {
        doc
          .font('Helvetica')
          .fontSize(9.2)
          .fillColor(COLORS.text)
          .text(body, MARGIN + 14, y, { width: CONTENT_W - 14, lineGap: 2 });
      }
      doc.moveDown(0.22);
    }
    doc.moveDown(0.2);
  }

  function numberedSteps(steps) {
    steps.forEach((step, idx) => {
      const lead = step.lead || '';
      const body = step.body || step;
      const fullStr = lead ? `${lead} ${body}` : body;
      doc.font('Helvetica').fontSize(9.2);
      const h = doc.heightOfString(fullStr, { width: CONTENT_W - 26, lineGap: 2 });
      ensureSpace(Math.max(h + 8, 22));
      const y = doc.y;
      doc.roundedRect(MARGIN, y + 1, 17, 14, 3).fill(COLORS.navy);
      doc
        .font('Helvetica-Bold')
        .fontSize(8.2)
        .fillColor(COLORS.white)
        .text(String(idx + 1), MARGIN, y + 4, { width: 17, align: 'center' });
      if (lead) {
        doc
          .font('Helvetica-Bold')
          .fontSize(9.2)
          .fillColor(COLORS.text)
          .text(lead + ' ', MARGIN + 24, y + 1, { width: CONTENT_W - 24, continued: true, lineGap: 2 });
        doc.font('Helvetica').fillColor(COLORS.muted).text(body, { lineGap: 2 });
      } else {
        doc
          .font('Helvetica')
          .fontSize(9.2)
          .fillColor(COLORS.text)
          .text(body, MARGIN + 24, y + 1, { width: CONTENT_W - 24, lineGap: 2 });
      }
      doc.moveDown(0.32);
    });
    doc.moveDown(0.15);
  }

  function callout(title, text, variant = 'info') {
    const bg = variant === 'warn' ? COLORS.warnBg : COLORS.calloutBg;
    const border = variant === 'warn' ? COLORS.warnBorder : COLORS.calloutBorder;
    doc.font('Helvetica').fontSize(9);
    const bodyH = doc.heightOfString(text, { width: CONTENT_W - 26, lineGap: 2 });
    const boxH = bodyH + 28;
    ensureSpace(boxH + 10);
    const y = doc.y;
    doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 4).fill(bg);
    doc.rect(MARGIN, y, 4, boxH).fill(border);
    doc
      .font('Helvetica-Bold')
      .fontSize(9.3)
      .fillColor(COLORS.navy)
      .text(title, MARGIN + 12, y + 8, { width: CONTENT_W - 22 });
    doc
      .font('Helvetica')
      .fontSize(8.9)
      .fillColor(COLORS.text)
      .text(text, MARGIN + 12, y + 21, { width: CONTENT_W - 22, lineGap: 2 });
    doc.y = y + boxH + 8;
  }

  function drawTable(headers, rows, colWidths) {
    const padX = 6;
    const padY = 5;
    const headerH = 22;

    function drawHeaderRow() {
      const y = doc.y;
      doc.rect(MARGIN, y, CONTENT_W, headerH).fill(COLORS.navy);
      let x = MARGIN;
      headers.forEach((h, i) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(8.4)
          .fillColor(COLORS.white)
          .text(h, x + padX, y + 6.5, { width: colWidths[i] - padX * 2, lineBreak: false });
        x += colWidths[i];
      });
      doc.y = y + headerH;
    }

    ensureSpace(headerH + 28);
    drawHeaderRow();

    rows.forEach((row, rIdx) => {
      doc.font('Helvetica').fontSize(8.3);
      let maxH = 14;
      row.forEach((cell, i) => {
        const ch = doc.heightOfString(String(cell), { width: colWidths[i] - padX * 2, lineGap: 1.5 });
        if (ch > maxH) maxH = ch;
      });
      const rowH = maxH + padY * 2;

      if (doc.y + rowH > BOTTOM_LIMIT) {
        doc.addPage();
        isCover = false;
        doc.y = MARGIN + 16;
        drawHeaderRow();
      }

      const y = doc.y;
      if (rIdx % 2 === 1) {
        doc.rect(MARGIN, y, CONTENT_W, rowH).fill(COLORS.rowAlt);
      }
      doc
        .rect(MARGIN, y, CONTENT_W, rowH)
        .lineWidth(0.4)
        .strokeColor(COLORS.border)
        .stroke();

      let x = MARGIN;
      row.forEach((cell, i) => {
        doc
          .font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8.3)
          .fillColor(i === 0 ? COLORS.navy : COLORS.text)
          .text(String(cell), x + padX, y + padY, { width: colWidths[i] - padX * 2, lineGap: 1.5 });
        x += colWidths[i];
      });
      doc.y = y + rowH;
    });

    doc.moveDown(0.55);
  }

  // ==========================================================================
  // COVER PAGE
  // ==========================================================================
  doc.rect(0, 0, PAGE_W, 215).fill(COLORS.navy);
  doc.rect(0, 215, PAGE_W, 5).fill(COLORS.accent);

  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor('#93C5FD')
    .text('SYSTEM ARCHITECTURE, WORKFLOW & FEATURE SPECIFICATION MANUAL', MARGIN, 38, {
      characterSpacing: 1.1,
    });

  doc
    .font('Helvetica-Bold')
    .fontSize(30)
    .fillColor(COLORS.white)
    .text('Business ERP', MARGIN, 62);

  doc
    .font('Helvetica')
    .fontSize(12.5)
    .fillColor('#E2E8F0')
    .text(
      'End-to-End Manufacturing, Multi-Warehouse Inventory, GST Billing, Dealer Distribution & Factory Operations Platform',
      MARGIN,
      104,
      { width: CONTENT_W, lineGap: 3 },
    );

  // Badges on cover
  const badges = ['Next.js 15 + React 19', 'NestJS 11 REST API', 'PostgreSQL 17 + Prisma', '5 Role Portals', 'Vercel + Neon Cloud'];
  let bx = MARGIN;
  const by = 166;
  badges.forEach((b) => {
    doc.font('Helvetica-Bold').fontSize(8.1);
    const bw = doc.widthOfString(b) + 15;
    doc.roundedRect(bx, by, bw, 21, 4).fill(COLORS.navyLight);
    doc.fillColor(COLORS.white).text(b, bx + 7.5, by + 6, { lineBreak: false });
    bx += bw + 7;
  });

  // Document Meta Summary Grid
  doc.y = 238;
  doc
    .font('Helvetica-Bold')
    .fontSize(11.5)
    .fillColor(COLORS.navy)
    .text('Document Overview & System Snapshot', MARGIN, doc.y);
  doc.moveDown(0.35);

  drawTable(
    ['Specification Attribute', 'Implemented System Detail'],
    [
      ['Application Name', 'Business ERP (Version 1.0.0 — Production Release)'],
      ['Architecture Pattern', 'Centralized TypeScript Monorepo (packages/shared, apps/api, apps/web, prisma)'],
      ['Frontend Stack', 'Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Recharts, Zod'],
      ['Backend Stack', 'NestJS 11 (Express), Prisma ORM 6, Argon2id Auth, PDFKit, ExcelJS, Socket.IO'],
      ['Database Engine', 'PostgreSQL 17 (DECIMAL(18,2) currency, DECIMAL(18,4) qty/cost, append-only ledgers)'],
      ['Portals & Roles', '5 Unified Login Portals across 6 RBAC Roles (Owner, Manager, Accountant, Dealer, Employee, Inventory)'],
      ['GST Billing & Reports', '22-Column GST Sales Register (CGST/SGST/IGST auto-split), Invoice/Receipt/Challan PDFs, Excel/CSV'],
      ['Seeded Product Catalog', '7 Categories & 30 Dairy/Agri Products with Editable Cost, Selling Price, GST % & HSN'],
      ['Cloud Deployment', '100% Free Cloud Ready: Vercel Serverless (Web + API) + Neon Managed PostgreSQL 17'],
      ['Quality Verification', '15 Unit Tests + 24 Live PostgreSQL E2E Business Scenarios + Backup/Restore Drill (#25)'],
    ],
    [150, CONTENT_W - 150],
  );

  // Table of Contents box on cover (compact single-line rows so it fits comfortably on page 1)
  const tocY = doc.y + 4;
  const tocItems = [
    ['1. System Architecture & Cloud', 'Monorepo layers, same-origin API proxy, serverless runtime & Neon PostgreSQL'],
    ['2. Multi-Portal & RBAC Matrix', 'All 6 roles, 5 portals, entity isolation, permission overrides & seeded accounts'],
    ['3. End-to-End Business Workflows', 'Order-to-Cash, Festive Offers, Inventory/GRN, Manufacturing Job Cards & Scrap'],
    ['4. 22-Column GST Billing & PDFs', 'Intra/Inter-state GST split, Sales Register, Invoice/Receipt/Challan PDFs & Excel'],
    ['5. Product Catalog & Pricing', '7 categories, 30 products, live Cost/Selling/GST edits & inline category creation'],
    ['6. Analytics, Reports & Shortcuts', '19 live KPIs, Recharts trends, Reports Hub & role-aware keyboard shortcuts'],
    ['7. Database, API & Security', '11 table groups, atomic sequences, idempotency keys, Argon2id, CSRF & audit logs'],
    ['8. Deployment, Backups & QA', 'Vercel + Neon setup, Render/Docker blueprints, pg_dump backups & 25 QA scenarios'],
  ];
  const tocH = 34 + tocItems.length * 16.5 + 8;
  doc.roundedRect(MARGIN, tocY, CONTENT_W, tocH, 6).fill(COLORS.rowAlt).lineWidth(0.7).strokeColor(COLORS.border).stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(COLORS.navy)
    .text('Contents of This Specification Manual', MARGIN + 12, tocY + 10, { lineBreak: false });

  let ty = tocY + 30;
  tocItems.forEach(([title, desc]) => {
    doc.font('Helvetica-Bold').fontSize(8.3).fillColor(COLORS.navy).text(title, MARGIN + 12, ty, { width: 170, lineBreak: false });
    doc.font('Helvetica').fontSize(8.0).fillColor(COLORS.subtle).text(desc, MARGIN + 184, ty + 0.3, { width: CONTENT_W - 196, lineBreak: false });
    ty += 16.5;
  });

  // ==========================================================================
  // SECTION 1 — SYSTEM ARCHITECTURE & CLOUD INFRASTRUCTURE
  // ==========================================================================
  doc.addPage();
  isCover = false;
  doc.y = MARGIN + 16;

  sectionHeader(
    '1',
    'System Architecture & Cloud Infrastructure',
    'Centralized monorepo serving Web, API, Shared Contracts, and PostgreSQL 17 with zero data duplication.',
  );

  paragraph(
    'Business ERP is engineered around a single source of truth: one normalized PostgreSQL 17 relational database, one centralized NestJS REST API (/api/v1), one shared TypeScript contract package (@erp/shared), and one Next.js App Router web application serving all 5 role-based portals. Every financial calculation, stock mutation, GST computation, discount application, and authorization check executes strictly on the server.',
  );

  drawTable(
    ['Workspace Package', 'Path', 'Core Responsibility'],
    [
      ['@erp/shared', 'packages/shared/', 'Canonical RBAC permission catalog (all modules), 6 role definitions, domain enums, Zod validation schemas, and currency/quantity decimal helpers.'],
      ['@erp/api', 'apps/api/', 'NestJS 11 REST API (/api/v1), Prisma ORM client, Argon2id auth, rotating HttpOnly sessions, PDFKit & ExcelJS generators, Socket.IO gateway, and Vercel serverless adapter (src/serverless.ts).'],
      ['@erp/web', 'apps/web/', 'Next.js 15 App Router UI with 43+ portal routes, same-origin /api/v1 rewrite proxy, Recharts Executive Dashboard, GST Sales Register, Dealer & Employee Portals, and Global Keyboard Shortcuts.'],
      ['Prisma Database Layer', 'prisma/', 'Single schema.prisma (60+ normalized models), ordered SQL migrations, core metadata seeder, 30-product dairy/agro catalog seeder, and multi-portal user seeder.'],
      ['Operations Scripts', 'scripts/', 'Automated PostgreSQL pg_dump backup with SHA-256 checksum & retention pruning (backup-db.ps1), clean-DB restore drill (restore-verify.ps1), and spec PDF generator.'],
    ],
    [110, 95, CONTENT_W - 205],
  );

  subHeader('Same-Origin API Proxy & Serverless Runtime Design');
  bulletList([
    {
      lead: 'Zero-CORS Browser Architecture:',
      body: 'All frontend API requests, PDF bill downloads, and CSV/Excel exports call relative /api/v1/* paths. Next.js rewrites (apps/web/next.config.ts) forward /api/v1/:path* server-side to INTERNAL_API_URL (the Vercel API or local port 4000), keeping authentication cookies same-origin across browsers and mobile devices.',
    },
    {
      lead: 'Serverless NestJS Cold-Start Optimization:',
      body: 'apps/api/src/serverless.ts initializes NestFactory with ExpressAdapter once per warm serverless container and caches the Express app instance. Pre-compiled CommonJS output (dist/src/serverless.js) is invoked by apps/api/api/index.js for full decorator metadata compatibility on Vercel.',
    },
    {
      lead: 'Resilient Serverless PDF Storage:',
      body: 'Supports private S3-compatible object storage (AWS S3 / Cloudflare R2 with AES-256 encryption and 300s presigned URLs) as well as local_private mode (using writable /tmp/erp-storage on Vercel). If a serverless cold start evicts /tmp, DocumentsService automatically regenerates Sales Invoices, Payment Receipts, and Delivery Challans on-the-fly from PostgreSQL.',
    },
    {
      lead: 'Cloud PostgreSQL Connection Pooling:',
      body: 'Prisma targets both native Windows/Linux and rhel-openssl-3.0.x (Vercel Lambda). Production uses Neon pooled connections (-pooler) for serverless scale while migrations run over direct TCP.',
    },
  ]);

  // ==========================================================================
  // SECTION 2 — MULTI-PORTAL EXPERIENCE & RBAC
  // ==========================================================================
  sectionHeader(
    '2',
    'Multi-Portal Experience & Role-Based Access Control (RBAC)',
    'One unified login screen that dynamically renders role-tailored navigation, dashboards, and isolated data views.',
  );

  paragraph(
    'Users sign in at /login using the interactive Portal Selector (or direct email/password entry). Upon authentication, the system computes effective permissions by merging RolePermission grants with per-user UserPermissionOverride grants/revocations. Both the sidebar navigation and every backend controller enforce permissions independently.',
  );

  drawTable(
    ['Role Code', 'Portal Interface', 'Primary Capabilities & Strict Boundaries'],
    [
      ['SUPER_ADMIN', 'Admin / Owner Portal', 'Unrestricted access to all 19 KPIs, Dealers, Orders, Inventory, Editable Cost/Selling/GST Pricing, Promotional Offers, Purchasing, Finance, Job Cards, Scrap, Users, Role Permissions, System Settings, and Audit Logs. Permissions cannot be revoked.'],
      ['ADMIN_MANAGER', 'Admin Operations Portal', 'Manages Dealers, Order Approvals/Dispatches, Inventory, Purchasing, Employees, Job Cards, Scrap, and Operational Reports. Financial mutation permissions (payments, credit notes, expenses) are NOT granted by default unless explicitly assigned by Owner.'],
      ['ACCOUNTANT', 'Finance & Billing Portal', 'Records/verifies/reverses Dealer Payments, allocates multi-invoice payments, generates GST Sales Register & Invoice/Receipt PDFs, manages Credit Notes, Expenses, Production Overhead Costs, and Financial Reports. Cannot alter warehouse stock or production output.'],
      ['DEALER', 'Isolated Dealer Portal', 'Strictly isolated self-service portal: views active festive offers, browses products, places orders (with 1-click offer discount), tracks My Orders & delivery status, downloads own GST Invoices & Payment Receipts, views Purchase History and read-only Ledger/Credit Utilization. Backend strictly filters every query by dealerId = currentUser.dealerId.'],
      ['EMPLOYEE', 'Mobile-First Factory Portal', 'Views assigned Job Cards, logs actual raw material consumption and defective quantities, submits material/replacement requests, returns unused stock, records finished production output, logs factory scrap, and reviews personal work history. Zero access to financial balances or dealer pricing.'],
      ['INVENTORY_MANAGER', 'Warehouse & Stock Portal', 'Full multi-location stock overview, adds new products & inline categories, edits Cost/Selling/GST pricing, records Opening Stock, Goods Receipts (GRN), Warehouse/Factory Transfers, Job Card Material Issues/Returns, Stock Adjustment Requests, and Scrap Verification/Disposal.'],
    ],
    [116, 102, CONTENT_W - 218],
  );

  subHeader('Seeded Portal Accounts (Ready in Neon Cloud Database)');
  drawTable(
    ['Portal Role', 'Default Login Email', 'Default Seed Password', 'Landing Experience'],
    [
      ['Admin / Owner', 'owner@businesserp.local', 'ChangeMe@2026!', '19-KPI Executive Dashboard & Full ERP Sidebar'],
      ['Dealer Portal', 'dealer@businesserp.local', 'Dealer@2026!', 'Dealer Dashboard + Active Diwali/Festive Offer Banner'],
      ['Employee / Factory', 'employee@businesserp.local', 'Employee@2026!', 'Assigned Job Cards, Material Requests & Production Entry'],
      ['Accountant', 'accountant@businesserp.local', 'Accountant@2026!', 'GST Sales Register, Payments, Ledger & Financial Reports'],
      ['Inventory Manager', 'inventory@businesserp.local', 'Inventory@2026!', 'Product Catalog, Multi-Warehouse Stock, GRN & Transfers'],
    ],
    [100, 145, 105, CONTENT_W - 350],
  );

  callout(
    'Configurable RBAC & Audit Trail',
    'The Owner can customize permissions for any non-Super-Admin role at /admin/roles (PUT /api/v1/roles/:code/permissions) or grant/revoke specific permissions for individual users at /admin/users (PATCH /api/v1/users/:id). Every RBAC modification is permanently logged in audit_logs with before/after permission arrays.',
  );

  // ==========================================================================
  // SECTION 3 — CORE END-TO-END BUSINESS WORKFLOWS
  // ==========================================================================
  sectionHeader(
    '3',
    'Core End-to-End Business Workflows',
    'Five tightly integrated operational lifecycles backed by atomic PostgreSQL transactions.',
  );

  subHeader('3.1 Dealer Order-to-Cash Workflow (10-State Lifecycle)');
  paragraph(
    'Orders flow through a strictly enforced 10-state lifecycle: DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED -> PARTIALLY_DISPATCHED -> DISPATCHED -> DELIVERED -> COMPLETED (with REJECTED and CANCELLED terminal branches). Stock and financial balances change only at legally defined milestones.',
  );
  numberedSteps([
    {
      lead: 'Order Placement (Dealer or Admin):',
      body: 'Dealer logs into /dealer/place-order, selects products and quantities, and optionally applies an active Promotional Offer (e.g., Diwali 10% OFF). Backend validates active dealer status, calculates line subtotals, applies offer discount before GST, computes GST, and checks Credit Limit.',
    },
    {
      lead: 'Credit Limit Enforcement:',
      body: 'Configurable via System Settings as SOFT_BLOCK (flags warning for Admin review) or HARD_BLOCK (rejects order creation when outstanding balance + order total exceeds dealer creditLimit).',
    },
    {
      lead: 'Order Approval & Stock Reservation:',
      body: 'Admin/Manager reviews the submitted order at /orders, selects the source warehouse (e.g., Main Warehouse), and approves (POST /orders/:id/approve). Available stock is RESERVED (reservedQuantity increases) without reducing physical on-hand stock yet.',
    },
    {
      lead: 'Partial or Full Dispatch + Atomic Invoicing:',
      body: 'Authorized staff dispatches partial or full quantities with vehicle/transporter details (POST /orders/:id/dispatches with Idempotency-Key). Inside ONE atomic PostgreSQL transaction: (a) stock reservation releases, (b) physical stock deducts via append-only InventoryTransaction (DISPATCH), (c) sequential GST Sales Invoice (INV-YYYY-NNNNNN) is created, and (d) Dealer Ledger is debited.',
    },
    {
      lead: 'Delivery Confirmation & Challan:',
      body: 'Delivery Challan PDF is generated on demand; delivery receipt is confirmed (POST /orders/dispatches/:id/confirm-delivery) moving order state to DELIVERED / COMPLETED.',
    },
    {
      lead: 'Payment Recording, Allocation & Non-Destructive Reversal:',
      body: 'Accountant records Cash / UPI / NEFT / RTGS / Cheque payments (POST /finance/payments with Idempotency-Key), allocating across one or multiple open invoices (or keeping excess as Unallocated Advance). Dealer Ledger credits automatically and a Payment Receipt PDF is generated. Errors are corrected via non-destructive Reversal or Credit Notes—never hard-deleted.',
    },
  ]);

  subHeader('3.2 Promotional Offers & Festive Discounts Workflow (e.g., Diwali 10% OFF)');
  numberedSteps([
    {
      lead: 'Owner Creates Offer (/admin/offers):',
      body: 'Owner defines Title (e.g., "Diwali Dhamaka 10% OFF"), Promo Code (e.g., DIWALI10), Discount Type (PERCENTAGE or FLAT_AMOUNT), Discount Value, optional Minimum Order Amount, Valid From/Until dates, and Active status.',
    },
    {
      lead: 'Instant Dealer Portal Broadcast:',
      body: 'Upon creating an active offer (POST /api/v1/offers), the backend automatically creates persistent Notification records for every active Dealer user account and broadcasts a real-time Socket.IO event so dealers immediately see an unread bell alert.',
    },
    {
      lead: 'Dealer Dashboard Banner & 1-Click Avail:',
      body: 'On /dealer/dashboard, active offers appear as a prominent festive banner showing the code, discount %, validity dates, and a 1-click "Avail Offer & Place Order" button that pre-selects the offer on /dealer/place-order.',
    },
    {
      lead: 'Server-Side Pricing Enforcement:',
      body: 'When the order is submitted with promotionalOfferId, the backend independently verifies offer validity, active flag, date window, and minimum order threshold, then computes discountAmount and persists offer snapshot metadata on DealerOrder and SalesInvoice—preventing client-side price tampering.',
    },
  ]);

  subHeader('3.3 Multi-Location Inventory & Procurement (PO -> GRN -> WAC) Workflow');
  numberedSteps([
    {
      lead: 'Unlimited Stock Locations:',
      body: 'Supports Main Warehouses, Factory Floors, Scrap Storage Areas, and branch warehouses (/inventory/warehouses). Each (item, location) pair maintains live quantityOnHand, reservedQuantity, availableQuantity, and Weighted Average Cost (WAC).',
    },
    {
      lead: 'Opening Stock & Inter-Location Transfers:',
      body: 'Opening balances initialize stock with unit cost. Transfers move stock atomically between locations (TRANSFER_OUT + TRANSFER_IN ledger entries) while preserving exact WAC valuation.',
    },
    {
      lead: 'Approval-Gated Stock Adjustments:',
      body: 'Stock count variances or write-offs are submitted as Stock Adjustment Requests (/inventory) and only mutate balances after explicit Admin approval, preventing silent shrinkage.',
    },
    {
      lead: 'Purchase Orders & Partial GRN:',
      body: 'Creating a Supplier PO (/purchases) does NOT change inventory. When goods arrive, Warehouse records a Goods Receipt Note (GRN) capturing acceptedQuantity vs. rejectedQuantity. Only acceptedQuantity enters inventory and recalculates row-locked Weighted Average Cost (WAC).',
    },
    {
      lead: 'Low-Stock Alerts & Replenishment Costing:',
      body: 'Any item whose total on-hand stock falls at or below reorderLevel triggers real-time Low-Stock Alerts with automatic replenishment quantity and estimated restocking cost.',
    },
  ]);

  subHeader('3.4 Manufacturing Job Cards, Material Custody & Production Costing');
  numberedSteps([
    {
      lead: 'Job Card Creation & Employee Assignment:',
      body: 'Admin creates a Job Card (JC-YYYY-NNNNNN) at /manufacturing/job-cards specifying target finished product, planned quantity, factory location, BOM/required raw materials, and assigned factory technicians.',
    },
    {
      lead: 'Material Issue vs. Actual Consumption Separation:',
      body: 'Inventory Manager issues raw materials to the Job Card (POST /job-cards/:id/issues). Warehouse stock deducts immediately while the Job Card tracks issuedQuantity separately from consumedQuantity.',
    },
    {
      lead: 'Shop-Floor Consumption, Defective Replacement & Returns:',
      body: 'Assigned Employees log actual consumedQuantity and defectiveQuantity on /employee/job-cards. If materials are defective, employees submit a Material Replacement Request (/employee/material-requests). Unused materials are returned via Material Return, restoring warehouse stock.',
    },
    {
      lead: 'Finished Goods Receipt & Transparent Unit Costing:',
      body: 'Recording completed output (POST /job-cards/:id/production) credits Finished Goods inventory at the calculated unit cost (Direct Materials + Labor + Overhead). If labor or overhead entries are missing, the costing breakdown transparently displays an Incomplete Costing disclosure flag.',
    },
    {
      lead: 'Locked Closure & Audited Reopening:',
      body: 'Once closed (POST /job-cards/:id/close), a Job Card is locked against edits. Any post-closure correction requires an explicit, reason-mandatory Reopen action recorded in audit_logs.',
    },
  ]);

  subHeader('3.5 Scrap & Waste Recovery Workflow');
  numberedSteps([
    {
      lead: 'Scrap Recording:',
      body: 'Factory staff or supervisors log scrap linked to a Job Card or warehouse (/scrap or /employee/scrap), issuing a unique sequential Scrap ID (SCRAP-YYYY-NNNNNN) with estimated recovery value.',
    },
    {
      lead: 'Supervisor Verification:',
      body: 'Supervisor/Inventory Manager verifies scrap (POST /scrap/:id/verify), transferring verified weight/quantity into the Scrap Storage location.',
    },
    {
      lead: 'Reuse, Sale or Disposal Tracking:',
      body: 'Scrap Disposal (POST /scrap/:id/dispose) deducts Scrap Inventory and records actual Realized Recovery separately from Estimated Value for accurate variance and scrap valuation reporting.',
    },
  ]);

  // ==========================================================================
  // SECTION 4 — 22-COLUMN GST BILLING & SALES REGISTER
  // ==========================================================================
  sectionHeader(
    '4',
    '22-Column GST Sales Register & Bill PDF Specification',
    'Exact retail & wholesale GST invoice format with automatic CGST/SGST vs. IGST tax determination.',
  );

  paragraph(
    'Both the consolidated Sales Register (/finance/invoices & /reports) and every individual Bill / Sales Invoice PDF follow a standardized navy-header landscape 22-column GST format. The backend compares the configured business state (System Settings) against the dealer shipping/billing state to automatically split GST into equal CGST + SGST halves (intra-state) or full IGST (inter-state).',
  );

  drawTable(
    ['Col #', 'Column Header', 'Calculation / Data Source Specification'],
    [
      ['1 – 5', 'Sr | Sale Type | Invoice No | Date | Customer', 'Sequential row index, Wholesale/Retail sale type, sequential Invoice No (INV-YYYY-NNNNNN), DD-MM-YYYY date, and Dealer business name.'],
      ['6 – 9', 'Product Name | HSN | Qty | Rate', 'Line item name, HSN/SAC tax code, dispatched quantity, and unit selling rate (DECIMAL(18,2)).'],
      ['10', 'Taxable', 'Line taxable value after applicable promotional/line discount: (Qty x Rate) - Discount.'],
      ['11 – 14', 'CGST % | CGST | SGST % | SGST', 'Intra-state GST split: each receives half of item taxRatePercent (e.g., 18% -> 9% CGST + 9% SGST). Shows 0.00 for inter-state sales.'],
      ['15 – 16', 'IGST % | IGST', 'Inter-state GST: full item taxRatePercent applied when dealer state differs from business state; 0.00 for intra-state sales.'],
      ['17 – 18', 'Item Total | Grand Total', 'Item Total = Taxable + CGST + SGST + IGST per line. Grand Total = total invoice amount across all line items of the bill.'],
      ['19 – 22', 'Paid | Payment Type | Outstanding | Status', 'Total allocated payment amount, payment mode(s) (UPI/NEFT/Cash/Credit), remaining balance (Grand Total - Paid), and status badge (PAID / PARTIAL / UNPAID).'],
    ],
    [44, 158, CONTENT_W - 202],
  );

  bulletList([
    { lead: 'Summary & Subtotals:', body: 'Includes Retail/Wholesale subtotals and a navy-highlighted GRAND TOTAL row summing Invoice Count, Taxable, CGST, SGST, IGST, Item Total, Grand Total, Paid, and Outstanding.' },
    { lead: 'Multi-Format Exports:', body: 'One-click Landscape PDF Bill download (individual invoice or full register), Excel (.xlsx) workbook export via ExcelJS, Payment Receipt PDF, and Delivery Challan PDF.' },
    { lead: 'Dealer Portal Parity:', body: 'Dealers can view and download their own GST bills and payment receipts directly from /dealer/invoices and /dealer/payments with strict server-side ownership checks.' },
  ]);

  // ==========================================================================
  // SECTION 5 — PRODUCT CATALOG & EDITABLE PRICING
  // ==========================================================================
  sectionHeader(
    '5',
    'Product Catalog, Editable Pricing & Rapid Entry',
    'Pre-loaded dairy & agricultural equipment catalog with owner/inventory manager live pricing & category controls.',
  );

  paragraph(
    'Both the Owner (Super Admin) and Inventory Manager can add unlimited products, create new product categories inline without leaving the form, save multiple items rapidly via "Save & Add Another", and edit Cost Price (Standard Cost), Selling Price, GST Rate (%), and HSN/SAC code directly from the catalog (/items, /items/finished-goods, /items/raw-materials).',
  );

  drawTable(
    ['#', 'Seeded Product Category', 'Count', 'Representative Equipment & Products'],
    [
      ['1', 'Milking Machines', '12', 'Nano Single/Double Bucket, Single/Double Bucket Oil/Dry Vacuum, Trolley & Fixed Cow/Buffalo Milking Machines'],
      ['2', 'Chaff Cutters', '4', '2 HP & 3 HP Heavy Duty Chaff Cutters, Mini Chaff Cutter, Motorised Fodder Cutter'],
      ['3', 'Spare Parts & Accessories', '5', 'Milking Claw Assembly, Pulsator (Pneumatic/Electronic), Silicon Liners Set, Vacuum Pump Vanes, SS Lid & Gasket'],
      ['4', 'Dairy & Milk Handling', '3', 'SS Milk Cans (40L / 20L), Milk Cream Separator, Digital Milk Weighing Scale'],
      ['5', 'Cow Comfort & Farm Care', '2', 'Heavy Duty Cow Rubber Mats, Automatic Cow Drinking Water Bowl'],
      ['6', 'Brush Cutters & Agri Tools', '2', '4-Stroke Backpack Brush Cutter, Handheld Agricultural Sprayer'],
      ['7', 'Power Sprayers & Washing', '2', 'HTP High-Pressure Power Sprayer, Portable Pressure Washer Pump'],
    ],
    [24, 145, 42, CONTENT_W - 211],
  );

  bulletList([
    { lead: 'Editable Pricing & Tax Fields:', body: 'Owner and Inventory Manager can update standardCost (Cost Price), defaultSellingPrice (Selling Price), taxRatePercent (GST %), and hsnSacCode at any time via PATCH /api/v1/inventory/items/:id, with live margin preview and audit logging.' },
    { lead: 'Inline Category Creation:', body: 'Inside the Add Product modal, clicking "+ New Category" creates a category immediately via POST /api/v1/inventory/categories and auto-selects it.' },
    { lead: 'Rapid Multi-Product Entry:', body: 'Supports "Save & Add Another" (keeps category, UoM, item type, and GST % selected while resetting name/SKU/prices) for rapid bulk catalog onboarding.' },
  ]);

  // ==========================================================================
  // SECTION 6 — ANALYTICS, REPORTS & KEYBOARD SHORTCUTS
  // ==========================================================================
  sectionHeader(
    '6',
    'Executive Analytics (19 KPIs), Reports Hub & Keyboard Shortcuts',
    'Real-time operational visibility and power-user keyboard navigation across all portals.',
  );

  subHeader('6.1 Executive Dashboard — 19 Live Business KPIs');
  paragraph(
    'Available to Owner / Admin at /dashboard with instant date-range filters (Today, Yesterday, Last 7 Days, Last 30 Days, This Month, Custom Range) and interactive Recharts charts (Sales vs. Cash Collected trend, Top Dealers, Category Breakdown, Production vs. Scrap):',
  );

  drawTable(
    ['Analytics Domain', 'Live KPI Metrics Tracked'],
    [
      ['Sales & Revenue', 'Total Sales Revenue, Cash Collected, Total Dealer Receivables (Outstanding), Overdue Receivables, Average Order Value, Active Orders Count'],
      ['Inventory & Purchasing', 'Total Stock Valuation (WAC), Low-Stock SKU Count, Replenishment Cost Estimate, Total Purchase Spend, Pending Supplier Payables'],
      ['Manufacturing & Scrap', 'Active Job Cards, Finished Units Produced, Total Production Cost, Verified Scrap Quantity, Estimated vs. Realized Scrap Recovery'],
      ['Profitability & Operations', 'Total Operating Expenses, Gross Margin / Net Operating Position, Active Dealers & Active Employees'],
    ],
    [135, CONTENT_W - 135],
  );

  subHeader('6.2 Reports Hub & Multi-Format Exports (/reports)');
  bulletList([
    { lead: 'Built-In Business Reports:', body: '22-Column GST Sales Register, Dealer Outstanding & Aging, Multi-Location Inventory Valuation, Low-Stock Replenishment, Manufacturing Job Card Costing, Scrap Valuation & Recovery, and Profit & Loss Summary.' },
    { lead: 'Instant Exports:', body: 'Every report supports filtered CSV, formatted Excel (.xlsx), and printable PDF downloads via GET /api/v1/reports/:type/export?format=csv|xlsx|pdf.' },
  ]);

  subHeader('6.3 Role-Aware Global Keyboard Shortcuts');
  paragraph(
    'Built directly into the application shell (apps/web/src/components/layout/app-shell.tsx) so owners, accountants, inventory managers, dealers, and factory staff can navigate hands-free without touching the mouse. Shortcuts pause automatically while typing inside input fields.',
  );

  drawTable(
    ['Shortcut Keys', 'Action / Navigation Target', 'Available Roles'],
    [
      ['Ctrl + K   or   /', 'Focus Global Search bar (searches Orders, Dealers, Items, Invoices, Job Cards)', 'All Roles'],
      ['Alt + N', 'Role-smart Quick Create (Add Product on Items, Place Order for Dealers, New Offer, etc.)', 'Role-Aware'],
      ['Shift + ?', 'Open / close interactive Keyboard Shortcuts Help Modal', 'All Roles'],
      ['Esc', 'Close any open modal, drawer, or search dropdown', 'All Roles'],
      ['G then D', 'Go to Dashboard (Admin / Dealer / Employee Dashboard)', 'All Roles'],
      ['G then O', 'Go to Orders (/orders or /dealer/orders)', 'Admin, Dealer, Inventory'],
      ['G then I', 'Go to Product Catalog (/items)', 'Admin, Inventory'],
      ['G then P', 'Go to Finance Payments (/finance/payments or /dealer/payments)', 'Admin, Accountant, Dealer'],
      ['G then F', 'Go to GST Invoices & Sales Register (/finance/invoices or /dealer/invoices)', 'Admin, Accountant, Dealer'],
      ['G then R', 'Go to Reports Hub (/reports)', 'Admin, Accountant, Inventory'],
      ['G then L', 'Go to Dealer Ledger (/finance/ledger or /dealer/ledger)', 'Admin, Accountant, Dealer'],
      ['G then J', 'Go to Manufacturing Job Cards (/manufacturing/job-cards or /employee/job-cards)', 'Admin, Employee, Inventory'],
      ['G then S', 'Go to Scrap Management (/scrap or /employee/scrap)', 'Admin, Employee, Inventory'],
      ['G then U', 'Go to User Management (/admin/users)', 'Super Admin'],
    ],
    [95, 295, CONTENT_W - 390],
  );

  // ==========================================================================
  // SECTION 7 — DATABASE, API & SECURITY SPECIFICATIONS
  // ==========================================================================
  sectionHeader(
    '7',
    'Database Design, REST API & Security Specifications',
    'Enterprise-grade data integrity, financial precision, and defense-in-depth security controls.',
  );

  subHeader('7.1 PostgreSQL 17 Schema & Integrity Rules (11 Table Groups)');
  bulletList([
    { lead: 'Zero Floating-Point Errors:', body: 'Every monetary column uses DECIMAL(18, 2); every quantity and unit cost uses DECIMAL(18, 4) with Decimal.js arithmetic across backend services.' },
    { lead: 'Append-Only Financial & Stock Ledgers:', body: 'inventory_transactions, dealer_ledger_entries, payments, scrap_movements, and audit_logs are strictly append-only. Foreign keys enforce onDelete: Restrict to prevent accidental cascade deletion of business history.' },
    { lead: 'Race-Free Document Numbering:', body: 'SequenceService uses a single atomic PostgreSQL upsert (INSERT INTO document_sequences ... ON CONFLICT (code) DO UPDATE SET last_number = last_number + 1 RETURNING ...) verified 10/10 unique under parallel concurrency.' },
    { lead: '11 Normalized Domains:', body: '(1) Identity & RBAC, (2) Dealers & Ledgers, (3) Employees, (4) Catalog & BOM, (5) Multi-Location Inventory, (6) Suppliers & Purchasing, (7) Orders, Dispatches & Sales Invoices, (8) Finance, Payments, Credit Notes & Expenses, (9) Manufacturing & Job Cards, (10) Scrap & Disposals, (11) Promotional Offers, Documents, Notifications, Audit Logs, Settings & Idempotency Keys.' },
  ]);

  subHeader('7.2 REST API & Idempotency Protection (/api/v1)');
  drawTable(
    ['API Module', 'Key Endpoints', 'Special Safeguards'],
    [
      ['Auth & Sessions', 'POST /auth/login, /refresh, /logout, /change-password, /forgot-password, /reset-password, GET /auth/me', 'Argon2id, 5-attempt lockout, HttpOnly refresh cookie, X-CSRF-Token check'],
      ['Users, Roles & Settings', 'GET|POST /users, PATCH /users/:id, GET /roles, PUT /roles/:code/permissions, GET|PATCH /settings, GET /audit-logs', 'Super Admin protection, immutable before/after AuditLog'],
      ['Dealers & Orders', 'GET|POST /dealers, GET /dealers/me/summary, GET|POST /orders, POST /orders/:id/{approve,reject,cancel,dispatches}', 'Server-side dealer isolation, Idempotency-Key on dispatches'],
      ['Offers & Notifications', 'GET|POST /offers, GET /offers/active, PATCH /offers/:id, GET /notifications, PATCH /notifications/:id/read', 'Auto-broadcasts offers to active dealers; server-enforced discount math'],
      ['Inventory & Purchasing', 'GET|POST /inventory/{items,categories,locations}, PATCH /inventory/items/:id, POST /opening-stock, /transfers, /adjustments, /purchasing/*', 'Row-locked WAC updates, Idempotency-Key on stock mutations & GRN'],
      ['Finance & Documents', 'GET /finance/{summary,invoices,ledger/:dealerId}, POST /finance/{payments,payments/:id/reverse,credit-notes,expenses}, GET /documents/*', 'Idempotency-Key on payments & credit notes, signed short-lived PDF URLs'],
      ['Manufacturing & Scrap', 'GET|POST /job-cards, POST /job-cards/:id/{material-requests,issues,consumption,returns,production,close,reopen}, GET|POST /scrap/*', 'Issued vs. consumed separation, locked closure, SCRAP-YYYY-NNNNNN'],
      ['Analytics & Reports', 'GET /analytics/dashboard, GET /reports/search, GET /reports/sales-register, GET /reports/:type/export', '22-column GST split, CSV/XLSX/PDF export streaming'],
    ],
    [102, 240, CONTENT_W - 342],
  );

  subHeader('7.3 Security Architecture & Hardening Controls');
  bulletList([
    { lead: 'Password Hashing & Lockout:', body: 'Argon2id (memoryCost: 65536 KB, timeCost: 3, parallelism: 1). Strong password schema requires 10+ characters with uppercase, lowercase, number, and special character. 5 failed logins lock the account for 15 minutes and log AUTH_ACCOUNT_LOCKED.' },
    { lead: 'Token & Cookie Security:', body: '15-minute JWT Access Tokens live strictly in React memory (never localStorage). Refresh tokens rotate on every use, are stored as SHA-256 hashes in user_sessions, and travel via HttpOnly + SameSite=Lax + Secure cookies with double-submit X-CSRF-Token validation.' },
    { lead: 'Immediate Session Revocation:', body: 'Suspending/deactivating a user or changing/resetting a password immediately revokes all active user_sessions across all devices.' },
    { lead: 'HTTP Hardening & Error Masking:', body: 'Helmet security headers (CSP, HSTS, X-Frame-Options, nosniff), global & route-specific rate limiting (@nestjs/throttler), Zod input validation on every DTO, and GlobalExceptionFilter hiding raw stack traces and database internals.' },
  ]);

  // ==========================================================================
  // SECTION 8 — DEPLOYMENT, BACKUPS & QA VERIFICATION
  // ==========================================================================
  sectionHeader(
    '8',
    'Cloud Deployment, Backup Strategy & QA Verification',
    'Zero-cost 24/7 cloud hosting on Vercel + Neon, with automated backups and full test verification.',
  );

  subHeader('8.1 Live Free Cloud Topology (Vercel + Neon PostgreSQL)');
  drawTable(
    ['Layer', 'Platform (Free Tier)', 'Configuration & Purpose'],
    [
      ['Web Portal', 'Vercel Hobby (apps/web)', 'Next.js 15 frontend with INTERNAL_API_URL rewrite proxying /api/v1/* same-origin over HTTPS.'],
      ['Backend API', 'Vercel Hobby (apps/api)', 'NestJS 11 serverless function (api/index.js -> dist/src/serverless.js) with 30s timeout and auto-regenerating PDFs.'],
      ['Database', 'Neon Managed PostgreSQL 17', 'Cloud PostgreSQL (Singapore/Mumbai AWS) with TLS (?sslmode=require) and pooled (-pooler) connections for serverless runtime.'],
      ['Source Control', 'GitHub (SakshiWadgaokar/BusinessERP)', 'Clean main branch with automatic Vercel redeploys on push; .env & local secrets strictly gitignored.'],
    ],
    [85, 150, CONTENT_W - 235],
  );

  subHeader('8.2 Upgrade Paths & Disaster Recovery');
  bulletList([
    { lead: 'One-Click Commercial Scale-Up:', body: 'Repository includes render.yaml (Render Blueprints) and docker-compose.yml + Dockerfiles for instant migration to dedicated VPS (AWS ap-south-1 Mumbai / DigitalOcean Bengaluru) or Render Starter whenever commercial volume grows.' },
    { lead: 'Automated Backups & Restore Drills:', body: 'scripts/backup-db.ps1 performs compressed custom-format pg_dump backups with SHA-256 checksums and configurable 30-day retention pruning. scripts/restore-verify.ps1 restores into a clean temporary database to prove recoverability.' },
  ]);

  subHeader('8.3 Quality Assurance & Verification Summary');
  callout(
    'All 25 Mandatory QA Scenarios Verified Passing',
    'Unit Tests: 5/5 Jest suites (15/15 tests covering Auth, PermissionsGuard, ZodValidationPipe, IdempotencyInterceptor, StorageService). Live PostgreSQL E2E Tests: 2/2 suites passing all 24 mandatory end-to-end business workflows (RBAC isolation, credit limits, stock reservation/dispatch, WAC costing, partial GRN, Job Card custody/costing/closure, scrap recovery, payment idempotency/reversals, 10x concurrent sequence generation, PDF generation, and audit logs). Disaster Recovery Drill #25 verified live pg_dump + clean database restore.',
  );

  // ==========================================================================
  // ADD RUNNING HEADERS & FOOTERS WITH PAGE NUMBERS
  // ==========================================================================
  const range = doc.bufferedPageRange();
  const totalPages = range.count;

  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    if (i === 0) {
      // Cover page footer
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLORS.subtle)
        .text('Business ERP — Complete Workflow, Features & Technical Specifications  |  Version 1.0.0', MARGIN, PAGE_H - 30, {
          width: CONTENT_W,
          align: 'center',
          lineBreak: false,
        });
      doc.page.margins.bottom = savedBottom;
      continue;
    }

    // Running Header
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(COLORS.navy)
      .text('BUSINESS ERP', MARGIN, 22, { lineBreak: false });
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLORS.subtle)
      .text('Complete Workflow, Features & Technical Specifications', MARGIN + 75, 22, {
        width: CONTENT_W - 75,
        align: 'right',
        lineBreak: false,
      });
    doc
      .moveTo(MARGIN, 35)
      .lineTo(MARGIN + CONTENT_W, 35)
      .lineWidth(0.5)
      .strokeColor(COLORS.border)
      .stroke();

    // Running Footer
    doc
      .moveTo(MARGIN, PAGE_H - 40)
      .lineTo(MARGIN + CONTENT_W, PAGE_H - 40)
      .lineWidth(0.5)
      .strokeColor(COLORS.border)
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLORS.subtle)
      .text('Business ERP Documentation  •  Complete System Specification', MARGIN, PAGE_H - 31, {
        width: CONTENT_W - 90,
        lineBreak: false,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(COLORS.navy)
      .text(`Page ${i + 1} of ${totalPages}`, MARGIN + CONTENT_W - 85, PAGE_H - 31, {
        width: 85,
        align: 'right',
        lineBreak: false,
      });

    doc.page.margins.bottom = savedBottom;
  }

  return doc;
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
const doc = createDoc();
const stream = fs.createWriteStream(OUT_PATH);
doc.pipe(stream);
doc.end();

stream.on('finish', () => {
  const stat = fs.statSync(OUT_PATH);
  console.log(`PDF_GENERATED path=${OUT_PATH} bytes=${stat.size}`);
});
stream.on('error', (err) => {
  console.error('PDF_ERROR', err);
  process.exit(1);
});
