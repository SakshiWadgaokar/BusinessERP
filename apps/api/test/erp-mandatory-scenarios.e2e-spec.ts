import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import { AppModule } from '../src/app.module';
import { getEnv } from '../src/common/config/env';

jest.setTimeout(60000);

describe('Mandatory Production ERP Scenarios #1–#24 (Live PostgreSQL E2E)', () => {
  let app: INestApplication;
  const env = getEnv();
  const prefix = `/${env.API_PREFIX}`;
  const runTag = crypto.randomBytes(4).toString('hex');

  let adminToken = '';
  let dealerAToken = '';
  let dealerBToken = '';
  let employeeToken = '';

  let mainWhId = '';
  let factoryLocId = '';
  let scrapLocId = '';
  let kgUomId = '';
  let pcsUomId = '';

  let steelRawId = '';
  let nailRawId = '';
  let bucketFgId = '';
  let dealerAId = '';
  let dealerBId = '';
  let employeeRamId = '';
  let orderId = '';
  let orderItemId = '';
  let invoiceId = '';
  let jobCardId = '';
  let scrapId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix(env.API_PREFIX);
    await app.init();

    // Sign in as seeded Super Admin
    const loginRes = await request(app.getHttpServer())
      .post(`${prefix}/auth/login`)
      .send({
        email: process.env.SEED_SUPER_ADMIN_EMAIL || 'owner@businesserp.local',
        password: process.env.SEED_SUPER_ADMIN_PASSWORD || 'ChangeMe@2026!',
      })
      .expect(200);
    adminToken = loginRes.body.accessToken;

    // Fetch seeded locations & UoMs
    const [locRes, uomRes] = await Promise.all([
      request(app.getHttpServer())
        .get(`${prefix}/inventory/locations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get(`${prefix}/inventory/uoms`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200),
    ]);

    mainWhId = locRes.body.find((l: any) => l.code === 'MAIN-WH').id;
    factoryLocId = locRes.body.find((l: any) => l.code === 'FACTORY-01').id;
    scrapLocId = locRes.body.find((l: any) => l.code === 'SCRAP-YARD').id;
    kgUomId = uomRes.body.find((u: any) => u.code === 'KG').id;
    pcsUomId = uomRes.body.find((u: any) => u.code === 'PCS').id;

    // Seed items + opening stock for scenarios
    const steelRes = await request(app.getHttpServer())
      .post(`${prefix}/inventory/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: `STL-${runTag}`,
        name: `CR Steel Sheet ${runTag}`,
        itemType: 'RAW_MATERIAL',
        uomId: kgUomId,
        standardCost: '150',
        standardSellPrice: '200.00',
        minStockLevel: '20',
        reorderLevel: '50',
        visibleToDealers: true,
      })
      .expect(201);
    steelRawId = steelRes.body.id;

    const nailRes = await request(app.getHttpServer())
      .post(`${prefix}/inventory/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: `NAIL-${runTag}`,
        name: `Steel Rivet Nail ${runTag}`,
        itemType: 'RAW_MATERIAL',
        uomId: pcsUomId,
        standardCost: '5',
        standardSellPrice: '10.00',
        minStockLevel: '10',
        reorderLevel: '50',
        visibleToDealers: false,
      })
      .expect(201);
    nailRawId = nailRes.body.id;

    const bucketRes = await request(app.getHttpServer())
      .post(`${prefix}/inventory/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: `BKT-${runTag}`,
        name: `Steel Bucket ${runTag}`,
        itemType: 'FINISHED_GOOD',
        uomId: pcsUomId,
        standardCost: '120',
        standardSellPrice: '200.00',
        minStockLevel: '5',
        reorderLevel: '20',
        visibleToDealers: true,
      })
      .expect(201);
    bucketFgId = bucketRes.body.id;

    // Opening Stock: 100 kg Steel (₹150/kg), 100 pcs Nails (₹5/pc), 20 Steel Buckets (₹120/pc)
    for (const [itemId, qty, cost] of [
      [steelRawId, '100', '150'],
      [nailRawId, '100', '5'],
      [bucketFgId, '20', '120'],
    ]) {
      await request(app.getHttpServer())
        .post(`${prefix}/inventory/opening-stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `open-${runTag}-${itemId}`)
        .send({ itemId, locationId: mainWhId, quantity: qty, unitCost: cost, reason: 'Opening test stock' })
        .expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('Scenarios #1–#9 & #21: Dealer lifecycle, Order -> Approve -> Dispatch -> Invoice -> Partial Payment -> Admin KPI & Isolation', async () => {
    // #1 Create Dealer A & Dealer B
    const dARes = await request(app.getHttpServer())
      .post(`${prefix}/dealers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dealerName: 'Rajesh Traders',
        businessName: `Rajesh Steel Traders ${runTag}`,
        contactPerson: 'Rajesh Kumar',
        mobile: '9876543210',
        email: `dealer-a-${runTag}@example.com`,
        paymentTermsDays: 30,
        creditLimit: '50000.00',
        openingBalance: '0.00',
        address: {
          addressLine1: '12 Industrial Estate',
          city: 'Pune',
          state: 'Maharashtra',
          postalCode: '411001',
        },
        createPortalLogin: true,
        portalPassword: 'DealerPass@2026!',
      })
      .expect(201);
    dealerAId = dARes.body.id;

    const dBRes = await request(app.getHttpServer())
      .post(`${prefix}/dealers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dealerName: 'Competitor Distributors',
        businessName: `Competitor Corp ${runTag}`,
        contactPerson: 'Vikram Singh',
        mobile: '9876500000',
        email: `dealer-b-${runTag}@example.com`,
        creditLimit: '20000.00',
        openingBalance: '0.00',
        address: {
          addressLine1: '45 Market Road',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
        },
        createPortalLogin: true,
        portalPassword: 'DealerPass@2026!',
      })
      .expect(201);
    dealerBId = dBRes.body.id;

    // #2 Log in as Dealer A and Dealer B
    const dALogin = await request(app.getHttpServer())
      .post(`${prefix}/auth/login`)
      .send({ email: `dealer-a-${runTag}@example.com`, password: 'DealerPass@2026!' })
      .expect(200);
    dealerAToken = dALogin.body.accessToken;

    const dBLogin = await request(app.getHttpServer())
      .post(`${prefix}/auth/login`)
      .send({ email: `dealer-b-${runTag}@example.com`, password: 'DealerPass@2026!' })
      .expect(200);
    dealerBToken = dBLogin.body.accessToken;

    // #3 Dealer A submits order for 10 Steel Buckets @ ₹200 = ₹2,000
    const ordRes = await request(app.getHttpServer())
      .post(`${prefix}/orders`)
      .set('Authorization', `Bearer ${dealerAToken}`)
      .send({
        items: [{ itemId: bucketFgId, quantity: '10' }],
        submitImmediately: true,
      })
      .expect(201);
    orderId = ordRes.body.id;
    orderItemId = ordRes.body.items[0].id;
    expect(Number(ordRes.body.totalAmount)).toBe(2000);

    // Dealer cannot approve own order
    await request(app.getHttpServer())
      .post(`${prefix}/orders/${orderId}/approve`)
      .set('Authorization', `Bearer ${dealerAToken}`)
      .send({ sourceLocationId: mainWhId })
      .expect(403);

    // #4 Admin approves order (reserves 10 units, onHand stays 20 until dispatch)
    await request(app.getHttpServer())
      .post(`${prefix}/orders/${orderId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceLocationId: mainWhId })
      .expect(201);

    const balAfterApprove = await request(app.getHttpServer())
      .get(`${prefix}/inventory/balances?locationId=${mainWhId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const bktAfterApprove = balAfterApprove.body.find((b: any) => b.itemId === bucketFgId);
    expect(Number(bktAfterApprove.quantityOnHand)).toBe(20);
    expect(Number(bktAfterApprove.quantityReserved)).toBe(10);

    // #5 & #6 Dispatch order & generate Invoice atomically
    const dispRes = await request(app.getHttpServer())
      .post(`${prefix}/orders/${orderId}/dispatches`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `disp-${runTag}-1`)
      .send({
        sourceLocationId: mainWhId,
        vehicleNumber: 'MH12AB1234',
        generateInvoice: true,
        items: [{ orderItemId, quantity: '10' }],
      })
      .expect(201);
    expect(dispRes.body.orderStatus).toBe('DISPATCHED');
    invoiceId = dispRes.body.invoice.id;

    // Verify stock reduced to 10 onHand, 0 reserved
    const balAfterDispatch = await request(app.getHttpServer())
      .get(`${prefix}/inventory/balances?locationId=${mainWhId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const bktAfterDispatch = balAfterDispatch.body.find((b: any) => b.itemId === bucketFgId);
    expect(Number(bktAfterDispatch.quantityOnHand)).toBe(10);
    expect(Number(bktAfterDispatch.quantityReserved)).toBe(0);

    // Generate Invoice PDF & verify short-lived signed URL
    const pdfRes = await request(app.getHttpServer())
      .get(`${prefix}/documents/invoices/${invoiceId}/pdf`)
      .set('Authorization', `Bearer ${dealerAToken}`)
      .expect(200);
    expect(pdfRes.body.url).toContain('/documents/');

    // #7 & #23 Record partial payment ₹1,000 & test duplicate Idempotency-Key replay!
    const payIdemKey = `pay-${runTag}-1`;
    const payRes1 = await request(app.getHttpServer())
      .post(`${prefix}/finance/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', payIdemKey)
      .send({
        dealerId: dealerAId,
        amount: '1000.00',
        paymentMode: 'UPI',
        transactionRef: `UTR-${runTag}`,
        allocations: [{ invoiceId, allocatedAmount: '1000.00' }],
      })
      .expect(201);
    expect(payRes1.body.dealerOutstandingAfter).toBe('1000.00');

    // Duplicate retry with same Idempotency-Key must replay without double crediting!
    const payRes2 = await request(app.getHttpServer())
      .post(`${prefix}/finance/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', payIdemKey)
      .send({
        dealerId: dealerAId,
        amount: '1000.00',
        paymentMode: 'UPI',
        transactionRef: `UTR-${runTag}`,
        allocations: [{ invoiceId, allocatedAmount: '1000.00' }],
      })
      .expect(201);
    expect(payRes2.headers['x-idempotency-replayed']).toBe('true');
    expect(payRes2.body.payment.id).toBe(payRes1.body.payment.id);

    // #8 Verify Dealer A financial summary: ₹2,000 billed, ₹1,000 paid, ₹1,000 outstanding (50%)
    const summaryRes = await request(app.getHttpServer())
      .get(`${prefix}/dealers/me/summary`)
      .set('Authorization', `Bearer ${dealerAToken}`)
      .expect(200);
    expect(summaryRes.body.totalBilled).toBe('2000.00');
    expect(summaryRes.body.totalPaid).toBe('1000.00');
    expect(summaryRes.body.outstandingBalance).toBe('1000.00');
    expect(summaryRes.body.paymentCompletionPct).toBe('50.00');

    // #9 Verify Admin Dashboard reflects sales, cash received, and outstanding payments
    const dashRes = await request(app.getHttpServer())
      .get(`${prefix}/analytics/dashboard?range=today`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Number(dashRes.body.kpis.totalSalesToday)).toBeGreaterThanOrEqual(2000);
    expect(Number(dashRes.body.kpis.cashReceivedToday)).toBeGreaterThanOrEqual(1000);
    expect(Number(dashRes.body.kpis.outstandingDealerPayments)).toBeGreaterThanOrEqual(1000);

    // #21 Verify Dealer B CANNOT access Dealer A's profile, order, invoice, ledger, or PDF
    await request(app.getHttpServer())
      .get(`${prefix}/dealers/${dealerAId}`)
      .set('Authorization', `Bearer ${dealerBToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${prefix}/orders/${orderId}`)
      .set('Authorization', `Bearer ${dealerBToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${prefix}/finance/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${dealerBToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${prefix}/finance/ledger/${dealerAId}`)
      .set('Authorization', `Bearer ${dealerBToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${prefix}/documents/${pdfRes.body.documentId}/download-url`)
      .set('Authorization', `Bearer ${dealerBToken}`)
      .expect(403);
  });

  it('Scenarios #10–#20 & #22: Employee, Job Card, Issue/Consume/Return/Defect, Finished Goods, Scrap, Costing, Audit & RBAC', async () => {
    // Create Employee Ram
    const empRes = await request(app.getHttpServer())
      .post(`${prefix}/employees`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: `Ram Sharma ${runTag}`,
        mobile: '9822001122',
        email: `ram-${runTag}@example.com`,
        designation: 'Fabricator',
        department: 'Production',
        joiningDate: '2026-01-15',
        assignedLocationId: factoryLocId,
        hourlyLaborRate: '100.00',
        createPortalLogin: true,
        portalPassword: 'WorkerPass@2026!',
      })
      .expect(201);
    employeeRamId = empRes.body.id;

    // Login as Employee Ram
    const empLogin = await request(app.getHttpServer())
      .post(`${prefix}/auth/login`)
      .send({ email: `ram-${runTag}@example.com`, password: 'WorkerPass@2026!' })
      .expect(200);
    employeeToken = empLogin.body.accessToken;

    // #22 Verify employee CANNOT modify financial information
    await request(app.getHttpServer())
      .post(`${prefix}/finance/payments`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('Idempotency-Key', `emp-illegal-${runTag}`)
      .send({ dealerId: dealerAId, amount: '500.00', paymentMode: 'CASH' })
      .expect(403);

    // #15 Create Job Card: manufacture 1 Steel Bucket (10 kg steel + 2 nails)
    const jcRes = await request(app.getHttpServer())
      .post(`${prefix}/job-cards`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        finishedProductId: bucketFgId,
        targetQuantity: '1',
        locationId: factoryLocId,
        employeeIds: [employeeRamId],
        materials: [
          { itemId: steelRawId, requiredQuantity: '10' },
          { itemId: nailRawId, requiredQuantity: '2' },
        ],
      })
      .expect(201);
    jobCardId = jcRes.body.id;

    // #10 & #11 Issue 10 kg steel -> warehouse drops 100 kg -> 90 kg
    const steelIssue = await request(app.getHttpServer())
      .post(`${prefix}/job-cards/${jobCardId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `iss-stl-${runTag}`)
      .send({
        employeeId: employeeRamId,
        itemId: steelRawId,
        sourceLocationId: mainWhId,
        quantity: '10',
      })
      .expect(201);
    expect(Number(steelIssue.body.warehouseBalanceAfter)).toBe(90);

    // #13 Return 2 kg unused steel -> warehouse increases 90 kg -> 92 kg
    const steelRet = await request(app.getHttpServer())
      .post(`${prefix}/job-cards/${jobCardId}/returns`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `ret-stl-${runTag}`)
      .send({
        employeeId: employeeRamId,
        itemId: steelRawId,
        destLocationId: mainWhId,
        quantity: '2',
        reason: 'Unused steel returned to main warehouse',
      })
      .expect(201);
    expect(Number(steelRet.body.warehouseBalanceAfter)).toBe(92);

    // #12 Record actual consumption of 8 kg steel
    await request(app.getHttpServer())
      .post(`${prefix}/job-cards/${jobCardId}/consumption`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ itemId: steelRawId, consumedQuantity: '8', defectiveQuantity: '0' })
      .expect(201);

    // #14 Issue 2 nails -> 1 defective -> replacement issue 1 nail -> consume 2 good + 1 defective
    await request(app.getHttpServer())
      .post(`${prefix}/job-cards/${jobCardId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `iss-nail-1-${runTag}`)
      .send({ employeeId: employeeRamId, itemId: nailRawId, sourceLocationId: mainWhId, quantity: '2' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`${prefix}/job-cards/${jobCardId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `iss-nail-rep-${runTag}`)
      .send({
        employeeId: employeeRamId,
        itemId: nailRawId,
        sourceLocationId: mainWhId,
        quantity: '1',
        isReplacement: true,
        notes: 'Replacement for 1 defective nail',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`${prefix}/job-cards/${jobCardId}/consumption`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ itemId: nailRawId, consumedQuantity: '2', defectiveQuantity: '1' })
      .expect(201);

    // #16 Record Finished Goods output (1 bucket, 2 labor hours)
    const prodRes = await request(app.getHttpServer())
      .post(`${prefix}/job-cards/${jobCardId}/production`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('Idempotency-Key', `prod-${runTag}-1`)
      .send({
        goodQuantity: '1',
        rejectedQuantity: '0',
        destLocationId: mainWhId,
        laborHours: 2,
      })
      .expect(201);
    expect(prodRes.body.finishedGoodsReceipt).toBeDefined();

    // Add overhead cost and verify #19 Production Costing (8kg*150=1200 + 3*5=15 + 2hr*100=200 + 85 overhead = 1500)
    await request(app.getHttpServer())
      .post(`${prefix}/job-cards/${jobCardId}/costs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ costType: 'OVERHEAD', description: 'Power & welding consumables', amount: '85.00' })
      .expect(201);

    const costRes = await request(app.getHttpServer())
      .get(`${prefix}/job-cards/${jobCardId}/costing`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(costRes.body.costingComplete).toBe(true);
    expect(Number(costRes.body.totalProductionCost)).toBe(1500);
    expect(Number(costRes.body.costPerFinishedUnit)).toBe(1500);

    // #17 Record Scrap with unique Scrap ID (SCRAP-YYYY-NNNNNN)
    const scrapRes = await request(app.getHttpServer())
      .post(`${prefix}/scrap`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        itemId: nailRawId,
        quantity: '1',
        category: 'DEFECTIVE_RAW_MATERIAL',
        reason: 'Bent defective rivet nail',
        jobCardId,
        locationId: factoryLocId,
        estimatedValue: '2.00',
      })
      .expect(201);
    scrapId = scrapRes.body.id;
    expect(scrapRes.body.scrapCode).toMatch(/^SCRAP-\d{4}-\d{6}$/);

    // #18 Verify scrap & confirm scrap inventory increases at Scrap Storage Area
    await request(app.getHttpServer())
      .post(`${prefix}/scrap/${scrapId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ approved: true, scrapStorageLocationId: scrapLocId })
      .expect(201);

    const scrapBal = await request(app.getHttpServer())
      .get(`${prefix}/inventory/balances?locationId=${scrapLocId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const scrapItemBal = scrapBal.body.find((b: any) => b.itemId === nailRawId);
    expect(Number(scrapItemBal.quantityOnHand)).toBe(1);

    // Close Job Card & confirm closed Job Card blocks silent edits
    await request(app.getHttpServer())
      .post(`${prefix}/job-cards/${jobCardId}/close`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`${prefix}/job-cards/${jobCardId}/costs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ costType: 'OTHER', description: 'Unauthorized edit after close', amount: '10.00' })
      .expect(400);

    // #20 Verify audit logs captured sensitive actions
    const auditRes = await request(app.getHttpServer())
      .get(`${prefix}/audit-logs?limit=50`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const actions = auditRes.body.data.map((a: any) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(['SCRAP_VERIFIED', 'JOB_CARD_CLOSED', 'MATERIAL_ISSUED', 'PAYMENT_RECORDED']),
    );
  });

  it('Scenario #24: Concurrent stock issues cannot create negative balances', async () => {
    // Remaining steel in MAIN-WH is 92 kg; fire 5 concurrent issues of 30 kg each (150 kg total)
    const jc2 = await request(app.getHttpServer())
      .post(`${prefix}/job-cards`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        finishedProductId: bucketFgId,
        targetQuantity: '10',
        locationId: factoryLocId,
        employeeIds: [employeeRamId],
        materials: [{ itemId: steelRawId, requiredQuantity: '150' }],
      })
      .expect(201);

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((idx) =>
        request(app.getHttpServer())
          .post(`${prefix}/job-cards/${jc2.body.id}/issues`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', `conc-${runTag}-${idx}`)
          .send({
            employeeId: employeeRamId,
            itemId: steelRawId,
            sourceLocationId: mainWhId,
            quantity: '30',
          }),
      ),
    );

    const succeeded = results.filter((r) => r.status === 201);
    const failed = results.filter((r) => r.status === 400);
    expect(succeeded.length).toBe(3); // 3 * 30 = 90 kg <= 92 kg
    expect(failed.length).toBe(2); // 4th & 5th blocked!

    const balRes = await request(app.getHttpServer())
      .get(`${prefix}/inventory/balances?locationId=${mainWhId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const steelBal = balRes.body.find((b: any) => b.itemId === steelRawId);
    expect(Number(steelBal.quantityOnHand)).toBe(2); // 92 - 90 = 2 kg (never negative!)
  });
});
