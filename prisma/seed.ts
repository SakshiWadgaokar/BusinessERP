import 'dotenv/config';
import { PrismaClient, StockLocationType, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  ROLES,
  RoleCode,
} from '../packages/shared/src/permissions';

const prisma = new PrismaClient();

const ROLE_DESCRIPTIONS: Record<RoleCode, { name: string; description: string }> = {
  [ROLES.SUPER_ADMIN]: {
    name: 'Super Admin / Owner',
    description: 'Complete business visibility and administrative control',
  },
  [ROLES.ADMIN_MANAGER]: {
    name: 'Admin / Operations Manager',
    description: 'Operational management with configurable permissions (no automatic financial permissions)',
  },
  [ROLES.ACCOUNTANT]: {
    name: 'Accountant',
    description: 'Financial transactions, dealer ledgers, invoices, receipts, and expenses',
  },
  [ROLES.DEALER]: {
    name: 'Dealer',
    description: 'Isolated dealer self-service portal for orders, invoices, and payments',
  },
  [ROLES.EMPLOYEE]: {
    name: 'Employee / Factory Worker',
    description: 'Assigned Job Cards, material requests/consumption, production, and scrap reporting',
  },
  [ROLES.INVENTORY_MANAGER]: {
    name: 'Inventory Manager',
    description: 'Multi-location warehouse stock receipts, issues, returns, transfers, and adjustments',
  },
};

async function main() {
  console.log('Seeding Business ERP core metadata...');

  // 1. Seed Permissions
  for (const code of ALL_PERMISSIONS) {
    const [moduleName] = code.split(':');
    await prisma.permission.upsert({
      where: { code },
      update: { module: moduleName },
      create: {
        code,
        module: moduleName,
        description: `Permission to ${code.replace(':', ' ')}`,
      },
    });
  }

  const allPerms = await prisma.permission.findMany();
  const permByCode = new Map(allPerms.map((p) => [p.code, p.id]));

  // 2. Seed Roles & Default Role-Permission Mappings
  for (const roleCode of Object.values(ROLES)) {
    const meta = ROLE_DESCRIPTIONS[roleCode];
    const role = await prisma.role.upsert({
      where: { code: roleCode },
      update: { name: meta.name, description: meta.description },
      create: {
        code: roleCode,
        name: meta.name,
        description: meta.description,
        isSystem: true,
      },
    });

    const existingLinks = await prisma.rolePermission.count({ where: { roleId: role.id } });
    if (existingLinks === 0 || roleCode === ROLES.SUPER_ADMIN) {
      const targetPermCodes = DEFAULT_ROLE_PERMISSIONS[roleCode];
      for (const permCode of targetPermCodes) {
        const permId = permByCode.get(permCode);
        if (!permId) continue;
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permId } },
          update: {},
          create: { roleId: role.id, permissionId: permId },
        });
      }
    }
  }

  // 3. Seed Default Units of Measurement
  const defaultUoms = [
    { code: 'KG', name: 'Kilogram', precision: 3 },
    { code: 'GM', name: 'Gram', precision: 2 },
    { code: 'MT', name: 'Metric Ton', precision: 4 },
    { code: 'PCS', name: 'Pieces', precision: 0 },
    { code: 'NOS', name: 'Numbers', precision: 0 },
    { code: 'BOX', name: 'Box', precision: 0 },
    { code: 'MTR', name: 'Meter', precision: 2 },
    { code: 'LTR', name: 'Liter', precision: 2 },
  ];
  for (const uom of defaultUoms) {
    await prisma.unitOfMeasurement.upsert({
      where: { code: uom.code },
      update: { name: uom.name, precision: uom.precision },
      create: uom,
    });
  }

  // 4. Seed Default Stock Locations
  const defaultLocations = [
    { code: 'MAIN-WH', name: 'Main Warehouse', locationType: StockLocationType.MAIN_WAREHOUSE },
    { code: 'FACTORY-01', name: 'Factory Floor', locationType: StockLocationType.FACTORY },
    { code: 'SCRAP-YARD', name: 'Scrap Storage Area', locationType: StockLocationType.SCRAP_STORAGE },
  ];
  for (const loc of defaultLocations) {
    await prisma.stockLocation.upsert({
      where: { code: loc.code },
      update: { name: loc.name, locationType: loc.locationType },
      create: loc,
    });
  }

  // 5. Seed Default Expense Categories
  const expenseCategories = [
    'Electricity & Utilities',
    'Factory Rent & Maintenance',
    'Transport & Logistics',
    'Salaries & Wages',
    'Machinery Maintenance',
    'Office & Administrative',
    'Miscellaneous Operating Expense',
  ];
  for (const name of expenseCategories) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // 6. Seed Default Business Settings
  const defaultSettings: Array<{ key: string; value: unknown; description: string }> = [
    { key: 'businessName', value: 'Business ERP', description: 'Legal business name printed on invoices and receipts' },
    { key: 'businessAddress', value: 'Industrial Area, India', description: 'Registered business address' },
    { key: 'businessPhone', value: '', description: 'Official business phone' },
    { key: 'businessEmail', value: '', description: 'Official business email' },
    { key: 'gstEnabled', value: false, description: 'Enable optional GST calculation on invoices' },
    { key: 'gstin', value: null, description: 'Business GSTIN (if applicable)' },
    { key: 'currencyCode', value: 'INR', description: 'Primary accounting currency code' },
    { key: 'currencySymbol', value: '₹', description: 'Currency display symbol' },
    { key: 'costingMethod', value: 'WEIGHTED_AVERAGE', description: 'Inventory and production costing method (WEIGHTED_AVERAGE | FIFO)' },
    { key: 'creditLimitMode', value: 'SOFT_BLOCK', description: 'Credit limit enforcement (SOFT_BLOCK | HARD_BLOCK)' },
    { key: 'allowBackorders', value: false, description: 'Allow orders beyond available stock as backorders' },
    { key: 'allowNegativeStock', value: false, description: 'Strictly block negative stock by default' },
    { key: 'invoicePrefix', value: 'INV', description: 'Sales invoice number prefix' },
    { key: 'receiptPrefix', value: 'RCPT', description: 'Payment receipt number prefix' },
    { key: 'orderPrefix', value: 'ORD', description: 'Dealer order number prefix' },
    { key: 'jobCardPrefix', value: 'JC', description: 'Job Card number prefix' },
    { key: 'scrapPrefix', value: 'SCRAP', description: 'Scrap ID prefix' },
    { key: 'defaultPaymentTermsDays', value: 30, description: 'Default payment due term in days' },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: {
        key: setting.key,
        value: setting.value as any,
        description: setting.description,
      },
    });
  }

  // 7. Seed Document Sequences
  const sequences = [
    { code: 'DEALER', prefix: 'DLR', padding: 5 },
    { code: 'EMPLOYEE', prefix: 'EMP', padding: 5 },
    { code: 'SUPPLIER', prefix: 'SUP', padding: 5 },
    { code: 'ORDER', prefix: 'ORD', padding: 6 },
    { code: 'DISPATCH', prefix: 'DISP', padding: 6 },
    { code: 'INVOICE', prefix: 'INV', padding: 6 },
    { code: 'PAYMENT', prefix: 'PAY', padding: 6 },
    { code: 'RECEIPT', prefix: 'RCPT', padding: 6 },
    { code: 'CREDIT_NOTE', prefix: 'CN', padding: 6 },
    { code: 'EXPENSE', prefix: 'EXP', padding: 6 },
    { code: 'PO', prefix: 'PO', padding: 6 },
    { code: 'GRN', prefix: 'GRN', padding: 6 },
    { code: 'INV_TXN', prefix: 'TXN', padding: 7 },
    { code: 'TRANSFER', prefix: 'TRF', padding: 6 },
    { code: 'ADJUSTMENT', prefix: 'ADJ', padding: 6 },
    { code: 'JOB_CARD', prefix: 'JC', padding: 6 },
    { code: 'MAT_REQ', prefix: 'MREQ', padding: 6 },
    { code: 'MAT_ISSUE', prefix: 'MISS', padding: 6 },
    { code: 'MAT_RET', prefix: 'MRET', padding: 6 },
    { code: 'FG_RCPT', prefix: 'FGR', padding: 6 },
    { code: 'SCRAP', prefix: 'SCRAP', padding: 6 },
    { code: 'SCRAP_DISP', prefix: 'SDISP', padding: 6 },
    { code: 'SUP_PAY', prefix: 'SPAY', padding: 6 },
    { code: 'FIN_ADJ', prefix: 'FADJ', padding: 6 },
  ];
  for (const seq of sequences) {
    await prisma.documentSequence.upsert({
      where: { code: seq.code },
      update: {},
      create: seq,
    });
  }

  // 8. Seed Initial Super Admin User (from environment variables only)
  const adminEmail = (process.env.SEED_SUPER_ADMIN_EMAIL || 'owner@businesserp.local').toLowerCase();
  const adminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD || 'ChangeMe@2026!';
  const adminName = process.env.SEED_SUPER_ADMIN_NAME || 'System Owner';

  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { code: ROLES.SUPER_ADMIN },
  });

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const passwordHash = await argon2.hash(adminPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    const user = await prisma.user.create({
      data: {
        fullName: adminName,
        email: adminEmail,
        passwordHash,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: {
            roleId: superAdminRole.id,
          },
        },
      },
    });
    console.log(`Created initial Super Admin account: ${user.email}`);
  } else {
    console.log(`Super Admin account already exists: ${existingAdmin.email}`);
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
