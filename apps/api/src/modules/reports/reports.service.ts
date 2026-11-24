import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import Decimal from 'decimal.js';
import { PERMISSIONS, ROLES } from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { PdfService, SalesRegisterRow, SalesRegisterSummary } from '../documents/pdf.service';
import { AuthenticatedUser } from '../../common/types/auth-user.type';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly pdfService: PdfService,
  ) {}

  /**
   * Builds the exact 22-column Sales Register (Retail & Wholesale) grouped by invoice
   * with HSN, Taxable, CGST/SGST/IGST, Grand Total, Paid, Payment Type, Outstanding, Status,
   * plus Sale-Type subtotals and GRAND TOTAL.
   */
  async getSalesRegister(dateFrom?: string, dateTo?: string, search?: string): Promise<SalesRegisterSummary> {
    const where: any = { status: { not: 'VOID' } };
    if (dateFrom || dateTo) {
      where.invoiceDate = {};
      if (dateFrom) where.invoiceDate.gte = new Date(dateFrom);
      if (dateTo) where.invoiceDate.lte = new Date(dateTo);
    }
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { dealer: { businessName: { contains: search, mode: 'insensitive' } } },
        { dealer: { dealerCode: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [settings, invoices] = await Promise.all([
      this.settingsService.getAll(),
      this.prisma.salesInvoice.findMany({
        where,
        orderBy: { invoiceDate: 'desc' },
        include: {
          dealer: {
            include: { addresses: { where: { isDefault: true }, take: 1 } },
          },
          items: { include: { item: { select: { name: true, hsnSacCode: true } } } },
          allocations: {
            include: { payment: { select: { paymentMode: true, verificationStatus: true } } },
          },
        },
      }),
    ]);

    const bizName = settings.businessName || 'Business ERP';
    const bizAddr = String(settings.businessAddress || '').toLowerCase();

    const fmtDate = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}-${mm}-${d.getFullYear()}`;
    };

    const rows: SalesRegisterRow[] = [];
    const subMap = new Map<
      string,
      {
        invoiceCount: number;
        taxable: Decimal;
        cgst: Decimal;
        sgst: Decimal;
        igst: Decimal;
        itemTotal: Decimal;
        grandTotal: Decimal;
        paid: Decimal;
        outstanding: Decimal;
      }
    >();

    const grand = {
      invoiceCount: 0,
      taxable: new Decimal(0),
      cgst: new Decimal(0),
      sgst: new Decimal(0),
      igst: new Decimal(0),
      itemTotal: new Decimal(0),
      grandTotal: new Decimal(0),
      paid: new Decimal(0),
      outstanding: new Decimal(0),
    };

    invoices.forEach((inv, index) => {
      const saleType = 'Wholesale';
      const dealerState = String(inv.dealer?.addresses?.[0]?.state || '').toLowerCase();
      const isInterState = Boolean(dealerState && bizAddr && !bizAddr.includes(dealerState));

      const lines = inv.items.map((line) => PdfService.splitGstLine(line, isInterState));
      const modes = Array.from(
        new Set(
          inv.allocations
            .filter((a) => a.payment && a.payment.verificationStatus !== 'REVERSED')
            .map((a) => a.payment.paymentMode.replace(/_/g, ' ')),
        ),
      );
      const paymentType = modes.length > 0 ? modes.join('/') : 'Credit';

      const invGrand = new Decimal(inv.totalAmount.toString());
      const invPaid = new Decimal(inv.paidAmount.toString());
      const invOut = new Decimal(inv.outstandingAmount.toString());

      rows.push({
        sr: index + 1,
        saleType,
        invoiceId: inv.id,
        invoiceNo: inv.invoiceNumber,
        date: fmtDate(inv.invoiceDate),
        customer: inv.dealer.businessName,
        grandTotal: invGrand.toFixed(2),
        paid: invPaid.toFixed(2),
        paymentType,
        outstanding: invOut.toFixed(2),
        status: inv.status === 'PARTIALLY_PAID' ? 'PARTIAL' : inv.status,
        lines,
      });

      const sub = subMap.get(saleType) ?? {
        invoiceCount: 0,
        taxable: new Decimal(0),
        cgst: new Decimal(0),
        sgst: new Decimal(0),
        igst: new Decimal(0),
        itemTotal: new Decimal(0),
        grandTotal: new Decimal(0),
        paid: new Decimal(0),
        outstanding: new Decimal(0),
      };

      sub.invoiceCount += 1;
      sub.grandTotal = sub.grandTotal.plus(invGrand);
      sub.paid = sub.paid.plus(invPaid);
      sub.outstanding = sub.outstanding.plus(invOut);

      grand.invoiceCount += 1;
      grand.grandTotal = grand.grandTotal.plus(invGrand);
      grand.paid = grand.paid.plus(invPaid);
      grand.outstanding = grand.outstanding.plus(invOut);

      for (const l of lines) {
        sub.taxable = sub.taxable.plus(l.taxable);
        sub.cgst = sub.cgst.plus(l.cgst);
        sub.sgst = sub.sgst.plus(l.sgst);
        sub.igst = sub.igst.plus(l.igst);
        sub.itemTotal = sub.itemTotal.plus(l.itemTotal);

        grand.taxable = grand.taxable.plus(l.taxable);
        grand.cgst = grand.cgst.plus(l.cgst);
        grand.sgst = grand.sgst.plus(l.sgst);
        grand.igst = grand.igst.plus(l.igst);
        grand.itemTotal = grand.itemTotal.plus(l.itemTotal);
      }

      subMap.set(saleType, sub);
    });

    const now = new Date();
    const generatedAt = `${fmtDate(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return {
      businessName: bizName,
      generatedAt,
      rows,
      subtotals: Array.from(subMap.entries()).map(([saleType, s]) => ({
        saleType,
        invoiceCount: s.invoiceCount,
        taxable: s.taxable.toFixed(2),
        cgst: s.cgst.toFixed(2),
        sgst: s.sgst.toFixed(2),
        igst: s.igst.toFixed(2),
        itemTotal: s.itemTotal.toFixed(2),
        grandTotal: s.grandTotal.toFixed(2),
        paid: s.paid.toFixed(2),
        outstanding: s.outstanding.toFixed(2),
      })),
      grandTotal: {
        invoiceCount: grand.invoiceCount,
        taxable: grand.taxable.toFixed(2),
        cgst: grand.cgst.toFixed(2),
        sgst: grand.sgst.toFixed(2),
        igst: grand.igst.toFixed(2),
        itemTotal: grand.itemTotal.toFixed(2),
        grandTotal: grand.grandTotal.toFixed(2),
        paid: grand.paid.toFixed(2),
        outstanding: grand.outstanding.toFixed(2),
      },
    };
  }

  async getReportData(type: string, dateFrom?: string, dateTo?: string) {
    const range: any = {};
    if (dateFrom) range.gte = new Date(dateFrom);
    if (dateTo) range.lte = new Date(dateTo);
    const hasRange = Boolean(dateFrom || dateTo);

    switch (type) {
      case 'sales':
      case 'sales-register': {
        const reg = await this.getSalesRegister(dateFrom, dateTo);
        const flatRows: string[][] = [];
        for (const r of reg.rows) {
          r.lines.forEach((l, idx) => {
            flatRows.push([
              idx === 0 ? String(r.sr) : '',
              idx === 0 ? r.saleType : '',
              idx === 0 ? r.invoiceNo : '',
              idx === 0 ? r.date : '',
              idx === 0 ? r.customer : '',
              l.productName,
              l.hsn,
              l.qty,
              l.rate,
              l.taxable,
              l.cgstPct,
              l.cgst,
              l.sgstPct,
              l.sgst,
              l.igstPct,
              l.igst,
              l.itemTotal,
              idx === 0 ? r.grandTotal : '',
              idx === 0 ? r.paid : '',
              idx === 0 ? r.paymentType : '',
              idx === 0 ? r.outstanding : '',
              idx === 0 ? r.status : '',
            ]);
          });
        }
        flatRows.push([
          '',
          `GRAND TOTAL - ${reg.grandTotal.invoiceCount} invoice(s)`,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          reg.grandTotal.taxable,
          '',
          reg.grandTotal.cgst,
          '',
          reg.grandTotal.sgst,
          '',
          reg.grandTotal.igst,
          reg.grandTotal.itemTotal,
          reg.grandTotal.grandTotal,
          reg.grandTotal.paid,
          '',
          reg.grandTotal.outstanding,
          '',
        ]);
        return {
          title: `${reg.businessName} — Sales Register - Retail & Wholesale`,
          columns: [
            'Sr',
            'Sale Type',
            'Invoice No',
            'Date',
            'Customer',
            'Product Name',
            'HSN',
            'Qty',
            'Rate',
            'Taxable',
            'CGST %',
            'CGST',
            'SGST %',
            'SGST',
            'IGST %',
            'IGST',
            'Item Total',
            'Grand Total',
            'Paid',
            'Payment Type',
            'Outstanding',
            'Status',
          ],
          rows: flatRows,
        };
      }

      case 'payments': {
        const rows = await this.prisma.payment.findMany({
          where: hasRange ? { paymentDate: range } : {},
          orderBy: { paymentDate: 'desc' },
          include: { dealer: { select: { dealerCode: true, businessName: true } } },
        });
        return {
          title: 'Payment Collections Report',
          columns: ['Receipt No', 'Date', 'Dealer', 'Mode', 'Reference', 'Amount', 'Status'],
          rows: rows.map((r) => [
            r.receiptNumber,
            r.paymentDate.toISOString().slice(0, 10),
            `${r.dealer.businessName} (${r.dealer.dealerCode})`,
            r.paymentMode,
            r.transactionRef || '-',
            r.amount.toString(),
            r.verificationStatus,
          ]),
        };
      }

      case 'inventory': {
        const rows = await this.prisma.inventoryBalance.findMany({
          include: { item: { include: { uom: true } }, location: true },
          orderBy: [{ location: { name: 'asc' } }, { item: { name: 'asc' } }],
        });
        return {
          title: 'Current Stock & Valuation Report',
          columns: ['SKU', 'Item', 'Type', 'Location', 'On Hand', 'Reserved', 'UoM', 'Avg Unit Cost'],
          rows: rows.map((r) => [
            r.item.sku,
            r.item.name,
            r.item.itemType,
            r.location.name,
            r.quantityOnHand.toString(),
            r.quantityReserved.toString(),
            r.item.uom.code,
            r.averageUnitCost.toString(),
          ]),
        };
      }

      case 'manufacturing': {
        const rows = await this.prisma.jobCard.findMany({
          where: hasRange ? { createdAt: range } : {},
          orderBy: { createdAt: 'desc' },
          include: {
            finishedProduct: { select: { sku: true, name: true } },
            location: { select: { name: true } },
          },
        });
        return {
          title: 'Manufacturing & Job Card Costing Report',
          columns: ['Job Card', 'Product', 'Location', 'Target', 'Finished', 'Scrap', 'Total Cost', 'Cost/Unit', 'Status'],
          rows: rows.map((r) => [
            r.jobCardNumber,
            r.finishedProduct.name,
            r.location.name,
            r.targetQuantity.toString(),
            r.finishedQuantity.toString(),
            r.scrapQuantity.toString(),
            r.totalProductionCost.toString(),
            r.costPerUnit?.toString() ?? 'Incomplete',
            r.status,
          ]),
        };
      }

      case 'scrap': {
        const rows = await this.prisma.scrapRecord.findMany({
          where: hasRange ? { recordedAt: range } : {},
          orderBy: { recordedAt: 'desc' },
          include: {
            item: { select: { name: true, uom: { select: { code: true } } } },
            employee: { select: { fullName: true } },
            jobCard: { select: { jobCardNumber: true } },
          },
        });
        return {
          title: 'Scrap & Waste Valuation Report',
          columns: ['Scrap ID', 'Date', 'Material', 'Qty', 'Category', 'Job Card', 'Employee', 'Est Value', 'Realized Value', 'Status'],
          rows: rows.map((r) => [
            r.scrapCode,
            r.recordedAt.toISOString().slice(0, 10),
            r.item.name,
            `${r.quantity.toString()} ${r.item.uom.code}`,
            r.category,
            r.jobCard?.jobCardNumber || '-',
            r.employee?.fullName || '-',
            r.estimatedValue.toString(),
            r.realizedValue.toString(),
            r.status,
          ]),
        };
      }

      default:
        throw new BadRequestException(`Unsupported report type: ${type}`);
    }
  }

  async exportCsv(type: string, dateFrom?: string, dateTo?: string): Promise<string> {
    const report = await this.getReportData(type, dateFrom, dateTo);
    const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [report.columns.map(escape).join(','), ...report.rows.map((r) => r.map(escape).join(','))].join('\r\n');
  }

  async exportExcel(type: string, dateFrom?: string, dateTo?: string): Promise<Buffer> {
    const report = await this.getReportData(type, dateFrom, dateTo);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(report.title.slice(0, 31));
    ws.addRow(report.columns);
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A4A' } };
    for (const row of report.rows) {
      ws.addRow(row);
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async exportPdf(type: string, dateFrom?: string, dateTo?: string): Promise<Buffer> {
    if (type === 'sales' || type === 'sales-register') {
      const reg = await this.getSalesRegister(dateFrom, dateTo);
      return this.pdfService.generateSalesRegisterPdf(reg);
    }

    const report = await this.getReportData(type, dateFrom, dateTo);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(15).font('Helvetica-Bold').fillColor('#1b2a4a').text(`Business ERP — ${report.title}`);
      doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(`Generated: ${new Date().toLocaleString('en-IN')}`);
      doc.moveDown(1);

      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
      doc.text(report.columns.join('  |  '));
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(8);
      for (const row of report.rows.slice(0, 200)) {
        doc.text(row.join('  |  '));
      }
      doc.end();
    });
  }

  async globalSearch(q: string, actor: AuthenticatedUser) {
    const term = (q || '').trim();
    if (term.length < 2) return { query: term, results: {} };

    const perms = new Set(actor.permissions);
    const isSuper = actor.roles.includes(ROLES.SUPER_ADMIN);
    const can = (p: any) => isSuper || perms.has(p);
    const isDealerOnly =
      actor.roles.includes(ROLES.DEALER) &&
      !actor.roles.some((r) =>
        ([ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.ACCOUNTANT, ROLES.INVENTORY_MANAGER] as string[]).includes(r),
      );

    const results: Record<string, any[]> = {};

    if (can(PERMISSIONS.DEALERS_READ) && !isDealerOnly) {
      results.dealers = await this.prisma.dealer.findMany({
        where: {
          OR: [
            { dealerCode: { contains: term, mode: 'insensitive' } },
            { businessName: { contains: term, mode: 'insensitive' } },
            { dealerName: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, dealerCode: true, businessName: true, status: true },
      });
    }
    if (can(PERMISSIONS.ORDERS_READ)) {
      results.orders = await this.prisma.dealerOrder.findMany({
        where: { ...(isDealerOnly ? { dealerId: actor.dealerId || '' } : {}), orderNumber: { contains: term, mode: 'insensitive' } },
        take: 5,
        select: { id: true, orderNumber: true, status: true, totalAmount: true },
      });
    }
    if (can(PERMISSIONS.INVOICES_READ)) {
      results.invoices = await this.prisma.salesInvoice.findMany({
        where: { ...(isDealerOnly ? { dealerId: actor.dealerId || '' } : {}), invoiceNumber: { contains: term, mode: 'insensitive' } },
        take: 5,
        select: { id: true, invoiceNumber: true, status: true, totalAmount: true },
      });
    }
    if (can(PERMISSIONS.ITEMS_READ)) {
      results.items = await this.prisma.item.findMany({
        where: {
          ...(isDealerOnly ? { visibleToDealers: true } : {}),
          OR: [{ sku: { contains: term, mode: 'insensitive' } }, { name: { contains: term, mode: 'insensitive' } }],
        },
        take: 5,
        select: { id: true, sku: true, name: true, itemType: true },
      });
    }
    if (can(PERMISSIONS.JOB_CARDS_READ) && !isDealerOnly) {
      results.jobCards = await this.prisma.jobCard.findMany({
        where: { jobCardNumber: { contains: term, mode: 'insensitive' } },
        take: 5,
        select: { id: true, jobCardNumber: true, status: true },
      });
    }
    if (can(PERMISSIONS.SCRAP_READ) && !isDealerOnly) {
      results.scrap = await this.prisma.scrapRecord.findMany({
        where: { scrapCode: { contains: term, mode: 'insensitive' } },
        take: 5,
        select: { id: true, scrapCode: true, status: true, category: true },
      });
    }

    return { query: term, results };
  }
}
