import 'dotenv/config';
import {
  DealerStatus,
  EmployeeStatus,
  InventoryTransactionType,
  InvoiceStatus,
  JobCardStatus,
  LedgerEntryType,
  OrderStatus,
  PaymentMode,
  PaymentVerificationStatus,
  PrismaClient,
  UserStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { ROLES } from '../packages/shared/src/permissions';

const prisma = new PrismaClient();

async function hashPw(pw: string) {
  return argon2.hash(pw, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
}

async function ensureUserWithRole(params: {
  email: string;
  fullName: string;
  phone: string;
  password: string;
  roleCode: string;
}) {
  const email = params.email.toLowerCase();
  const role = await prisma.role.findUniqueOrThrow({ where: { code: params.roleCode } });
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        fullName: params.fullName,
        phone: params.phone,
        passwordHash: await hashPw(params.password),
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: role.id } },
      },
    });
  }
  return user;
}

async function main() {
  const superAdmin = await prisma.user.findFirstOrThrow({
    where: { userRoles: { some: { role: { code: ROLES.SUPER_ADMIN } } } },
  });

  const mainWh = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'MAIN-WH' } });
  const factoryLoc = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'FACTORY-01' } });

  // Enable GST in business settings so bills show CGST/SGST columns clearly
  await prisma.systemSetting.upsert({
    where: { key: 'gstEnabled' },
    update: { value: true as any },
    create: { key: 'gstEnabled', value: true as any, description: 'Enable optional GST calculation on invoices' },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'businessAddress' },
    update: { value: 'MIDC Industrial Area, Pune, Maharashtra, India' as any },
    create: { key: 'businessAddress', value: 'MIDC Industrial Area, Pune, Maharashtra, India' as any },
  });

  // 1. Dealer Portal Account
  const dealerUser = await ensureUserWithRole({
    email: 'dealer@businesserp.local',
    fullName: 'Satyajit Agro Agencies',
    phone: '9822112233',
    password: 'Dealer@2026!',
    roleCode: ROLES.DEALER,
  });

  let dealer = await prisma.dealer.findUnique({ where: { userId: dealerUser.id } });
  if (!dealer) {
    dealer = await prisma.dealer.create({
      data: {
        dealerCode: 'DLR-DEMO1',
        userId: dealerUser.id,
        dealerName: 'Satyajit Deshmukh',
        businessName: 'Satyajit Dairy & Agro Distributors',
        contactPerson: 'Satyajit Deshmukh',
        mobile: '9822112233',
        email: dealerUser.email,
        gstin: '27AABCS1429B1ZB',
        status: DealerStatus.ACTIVE,
        paymentTermsDays: 30,
        paymentTermsLabel: 'Net 30 Days',
        creditLimit: '500000.00',
        openingBalance: '0.00',
        outstandingBalance: '0.00',
        createdById: superAdmin.id,
        addresses: {
          create: {
            label: 'Primary',
            addressLine1: 'Plot 14, Krishi Market Yard',
            city: 'Pune',
            state: 'Maharashtra',
            postalCode: '411037',
            country: 'India',
            isDefault: true,
          },
        },
        creditSettings: {
          create: {
            creditLimit: '500000.00',
            paymentTermsDays: 30,
            enforceHardBlock: false,
            allowBackorders: false,
            canViewStockQty: true,
          },
        },
      },
    });
  }

  // 2. Employee / Factory Portal Account
  const empUser = await ensureUserWithRole({
    email: 'employee@businesserp.local',
    fullName: 'Ramesh Patil',
    phone: '9823445566',
    password: 'Employee@2026!',
    roleCode: ROLES.EMPLOYEE,
  });

  let employee = await prisma.employee.findUnique({ where: { userId: empUser.id } });
  if (!employee) {
    employee = await prisma.employee.create({
      data: {
        employeeCode: 'EMP-DEMO1',
        userId: empUser.id,
        fullName: 'Ramesh Patil',
        mobile: '9823445566',
        email: empUser.email,
        designation: 'Senior Assembly Technician',
        department: 'Milking Machine Assembly',
        joiningDate: new Date('2025-06-01'),
        assignedLocationId: factoryLoc.id,
        hourlyLaborRate: '150.00',
        status: EmployeeStatus.ACTIVE,
        createdById: superAdmin.id,
      },
    });
  }

  // 3. Accountant & Inventory Manager Portal Accounts
  await ensureUserWithRole({
    email: 'accountant@businesserp.local',
    fullName: 'Priya Kulkarni',
    phone: '9850112233',
    password: 'Accountant@2026!',
    roleCode: ROLES.ACCOUNTANT,
  });

  await ensureUserWithRole({
    email: 'inventory@businesserp.local',
    fullName: 'Vikram Joshi',
    phone: '9850445566',
    password: 'Inventory@2026!',
    roleCode: ROLES.INVENTORY_MANAGER,
  });

  // Set sample HSN & indicative tax/prices on key Dairy catalog items + opening stock so all 3 portals work immediately
  const sampleProducts = [
    { sku: 'MM-NANO-001', hsn: '84341000', rate: '24000.00', cost: '17500.0000', tax: '12.00', qty: '15.0000' },
    { sku: 'SP-CLW-003', hsn: '84349010', rate: '1850.00', cost: '1200.0000', tax: '18.00', qty: '60.0000' },
    { sku: 'VP-150-001', hsn: '84141000', rate: '9500.00', cost: '6800.0000', tax: '18.00', qty: '25.0000' },
    { sku: 'CC-FWD-001', hsn: '84361000', rate: '18500.00', cost: '13200.0000', tax: '12.00', qty: '12.0000' },
    { sku: 'RM-COW-001', hsn: '40169100', rate: '2200.00', cost: '1500.0000', tax: '18.00', qty: '80.0000' },
  ];

  const itemMap = new Map<string, any>();
  for (const sp of sampleProducts) {
    const item = await prisma.item.findUnique({ where: { sku: sp.sku } });
    if (!item) continue;
    const updated = await prisma.item.update({
      where: { id: item.id },
      data: {
        hsnSacCode: sp.hsn,
        standardSellPrice: sp.rate,
        standardCost: sp.cost,
        defaultTaxRate: sp.tax,
      },
    });
    itemMap.set(sp.sku, updated);

    const existingBal = await prisma.inventoryBalance.findUnique({
      where: { itemId_locationId: { itemId: item.id, locationId: mainWh.id } },
    });
    if (!existingBal) {
      await prisma.inventoryBalance.create({
        data: {
          itemId: item.id,
          locationId: mainWh.id,
          quantityOnHand: sp.qty,
          quantityReserved: '0.0000',
          averageUnitCost: sp.cost,
        },
      });
      await prisma.inventoryTransaction.create({
        data: {
          transactionNo: `TXN-INIT-${sp.sku}`,
          itemId: item.id,
          destLocationId: mainWh.id,
          transactionType: InventoryTransactionType.OPENING_STOCK,
          quantity: sp.qty,
          unitCost: sp.cost,
          totalCost: (Number(sp.qty) * Number(sp.cost)).toFixed(2),
          balanceAfter: sp.qty,
          referenceType: 'OpeningStock',
          reason: 'Initial showroom / warehouse stock',
          performedById: superAdmin.id,
          approvedById: superAdmin.id,
        },
      });
    }
  }

  // Create one real multi-item Invoice + Partial Payment for Satyajit Dairy so Sales Register & Dealer Portal immediately show real data
  const existingDemoInv = await prisma.salesInvoice.findUnique({ where: { invoiceNumber: 'INV-2627-900001' } });
  const nano = itemMap.get('MM-NANO-001');
  const claw = itemMap.get('SP-CLW-003');
  if (!existingDemoInv && nano && claw) {
    // 1x Nano Milking Machine (24000 + 12% GST = 26880) + 2x Milk Claws (3700 + 18% GST = 4366) = 31246.00
    const inv = await prisma.salesInvoice.create({
      data: {
        invoiceNumber: 'INV-2627-900001',
        dealerId: dealer.id,
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 86400000),
        subtotal: '27700.00',
        taxAmount: '3546.00',
        totalAmount: '31246.00',
        paidAmount: '20000.00',
        outstandingAmount: '11246.00',
        status: InvoiceStatus.PARTIALLY_PAID,
        paymentTerms: 'Net 30 Days',
        issuedById: superAdmin.id,
        items: {
          create: [
            {
              itemId: nano.id,
              description: nano.name,
              quantity: '1.0000',
              unitRate: '24000.00',
              taxRate: '12.00',
              taxAmount: '2880.00',
              lineTotal: '26880.00',
              unitCost: '17500.0000',
            },
            {
              itemId: claw.id,
              description: claw.name,
              quantity: '2.0000',
              unitRate: '1850.00',
              taxRate: '18.00',
              taxAmount: '666.00',
              lineTotal: '4366.00',
              unitCost: '1200.0000',
            },
          ],
        },
      },
    });

    const pay = await prisma.payment.create({
      data: {
        paymentNumber: 'PAY-2627-900001',
        receiptNumber: 'RCPT-2627-900001',
        dealerId: dealer.id,
        amount: '20000.00',
        unallocatedAmount: '0.00',
        paymentMode: PaymentMode.UPI,
        transactionRef: 'UPI-6328941122',
        verificationStatus: PaymentVerificationStatus.VERIFIED,
        verifiedById: superAdmin.id,
        verifiedAt: new Date(),
        recordedById: superAdmin.id,
        allocations: {
          create: { invoiceId: inv.id, allocatedAmount: '20000.00' },
        },
      },
    });

    await prisma.dealerLedgerEntry.createMany({
      data: [
        {
          dealerId: dealer.id,
          entryType: LedgerEntryType.SALES_INVOICE,
          referenceType: 'SalesInvoice',
          referenceId: inv.id,
          referenceNumber: inv.invoiceNumber,
          debitAmount: '31246.00',
          creditAmount: '0.00',
          runningBalance: '31246.00',
          description: `Sales Invoice ${inv.invoiceNumber}`,
          createdById: superAdmin.id,
        },
        {
          dealerId: dealer.id,
          entryType: LedgerEntryType.PAYMENT,
          referenceType: 'Payment',
          referenceId: pay.id,
          referenceNumber: pay.receiptNumber,
          debitAmount: '0.00',
          creditAmount: '20000.00',
          runningBalance: '11246.00',
          description: `Payment received via UPI (${pay.receiptNumber})`,
          createdById: superAdmin.id,
        },
      ],
    });

    await prisma.dealer.update({
      where: { id: dealer.id },
      data: { outstandingBalance: '11246.00' },
    });
  }

  // Create one assigned Job Card for Employee Ramesh Patil so Employee Portal immediately shows live work
  const existingJc = await prisma.jobCard.findUnique({ where: { jobCardNumber: 'JC-2627-900001' } });
  const pump = itemMap.get('VP-150-001');
  if (!existingJc && nano && claw && pump) {
    await prisma.jobCard.create({
      data: {
        jobCardNumber: 'JC-2627-900001',
        finishedProductId: nano.id,
        targetQuantity: '5.0000',
        locationId: factoryLoc.id,
        status: JobCardStatus.IN_PROGRESS,
        notes: 'Assemble 5x Nano Milking Machines for upcoming dealer dispatches',
        createdById: superAdmin.id,
        assignments: { create: { employeeId: employee.id, assignedBy: superAdmin.id } },
        plannedMaterials: {
          create: [
            { itemId: pump.id, requiredQuantity: '5.0000', issuedQuantity: '5.0000' },
            { itemId: claw.id, requiredQuantity: '5.0000', issuedQuantity: '5.0000' },
          ],
        },
      },
    });
  }

  console.log('Portal users (Dealer, Employee, Accountant, Inventory Manager) and sample GST bill/Job Card ready.');
}

main()
  .catch((err) => {
    console.error('Portal seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
