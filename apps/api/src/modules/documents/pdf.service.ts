import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import Decimal from 'decimal.js';

export interface SalesRegisterLine {
  productName: string;
  hsn: string;
  qty: string;
  rate: string;
  taxable: string;
  cgstPct: string;
  cgst: string;
  sgstPct: string;
  sgst: string;
  igstPct: string;
  igst: string;
  itemTotal: string;
}

export interface SalesRegisterRow {
  sr: number;
  saleType: string;
  invoiceId: string;
  invoiceNo: string;
  date: string;
  customer: string;
  grandTotal: string;
  paid: string;
  paymentType: string;
  outstanding: string;
  status: string;
  lines: SalesRegisterLine[];
}

export interface SalesRegisterSummary {
  businessName: string;
  generatedAt: string;
  rows: SalesRegisterRow[];
  subtotals: Array<{
    saleType: string;
    invoiceCount: number;
    taxable: string;
    cgst: string;
    sgst: string;
    igst: string;
    itemTotal: string;
    grandTotal: string;
    paid: string;
    outstanding: string;
  }>;
  grandTotal: {
    invoiceCount: number;
    taxable: string;
    cgst: string;
    sgst: string;
    igst: string;
    itemTotal: string;
    grandTotal: string;
    paid: string;
    outstanding: string;
  };
}

@Injectable()
export class PdfService {
  private buildPdf(
    options: PDFKit.PDFDocumentOptions,
    draw: (doc: PDFKit.PDFDocument) => void,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument(options);
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      draw(doc);
      doc.end();
    });
  }

  /**
   * Computes CGST/SGST vs IGST split for an invoice line item based on state comparison.
   */
  static splitGstLine(line: {
    quantity: any;
    unitRate: any;
    taxRate: any;
    taxAmount: any;
    lineTotal: any;
    description: string;
    item?: { name?: string; hsnSacCode?: string | null };
  }, isInterState: boolean): SalesRegisterLine {
    const qty = new Decimal(line.quantity.toString());
    const rate = new Decimal(line.unitRate.toString());
    const taxRate = new Decimal(line.taxRate.toString());
    const taxAmt = new Decimal(line.taxAmount.toString());
    const lineTot = new Decimal(line.lineTotal.toString());
    const taxable = lineTot.minus(taxAmt).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    let cgstPct = new Decimal(0);
    let cgst = new Decimal(0);
    let sgstPct = new Decimal(0);
    let sgst = new Decimal(0);
    let igstPct = new Decimal(0);
    let igst = new Decimal(0);

    if (taxRate.greaterThan(0)) {
      if (isInterState) {
        igstPct = taxRate;
        igst = taxAmt;
      } else {
        cgstPct = taxRate.dividedBy(2);
        sgstPct = taxRate.dividedBy(2);
        cgst = taxAmt.dividedBy(2).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        sgst = taxAmt.minus(cgst).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }
    }

    const fmtPct = (d: Decimal) => (d.isZero() ? '0%' : `${d.toFixed(2)}%`);

    return {
      productName: line.item?.name || line.description,
      hsn: line.item?.hsnSacCode || '-',
      qty: qty.toFixed(3),
      rate: rate.toFixed(2),
      taxable: taxable.toFixed(2),
      cgstPct: fmtPct(cgstPct),
      cgst: cgst.toFixed(2),
      sgstPct: fmtPct(sgstPct),
      sgst: sgst.toFixed(2),
      igstPct: fmtPct(igstPct),
      igst: igst.toFixed(2),
      itemTotal: lineTot.toFixed(2),
    };
  }

  /**
   * Generates an A4 Landscape Sales Register PDF matching the exact 22-column
   * navy-header, alternating-band, merged-cell Sales Register format.
   */
  async generateSalesRegisterPdf(register: SalesRegisterSummary): Promise<Buffer> {
    return this.buildPdf(
      { size: 'A4', layout: 'landscape', margin: 20, bufferPages: true },
      (doc) => {
        const pageW = doc.page.width; // 841.89 pt
        const pageH = doc.page.height; // 595.28 pt
        const startX = 20;
        const bottomLimit = pageH - 28;

        // 22 columns summing to ~802 pt
        const cols: Array<{
          key: string;
          label: string;
          width: number;
          align: 'left' | 'right' | 'center';
        }> = [
          { key: 'sr', label: 'Sr', width: 18, align: 'center' },
          { key: 'saleType', label: 'Sale\nType', width: 34, align: 'left' },
          { key: 'invoiceNo', label: 'Invoice\nNo', width: 52, align: 'left' },
          { key: 'date', label: 'Date', width: 42, align: 'left' },
          { key: 'customer', label: 'Customer', width: 58, align: 'left' },
          { key: 'productName', label: 'Product\nName', width: 76, align: 'left' },
          { key: 'hsn', label: 'HSN', width: 32, align: 'left' },
          { key: 'qty', label: 'Qty', width: 28, align: 'right' },
          { key: 'rate', label: 'Rate', width: 36, align: 'right' },
          { key: 'taxable', label: 'Taxable', width: 40, align: 'right' },
          { key: 'cgstPct', label: 'CGST\n%', width: 28, align: 'right' },
          { key: 'cgst', label: 'CGST', width: 32, align: 'right' },
          { key: 'sgstPct', label: 'SGST\n%', width: 28, align: 'right' },
          { key: 'sgst', label: 'SGST', width: 32, align: 'right' },
          { key: 'igstPct', label: 'IGST\n%', width: 28, align: 'right' },
          { key: 'igst', label: 'IGST', width: 32, align: 'right' },
          { key: 'itemTotal', label: 'Item\nTotal', width: 40, align: 'right' },
          { key: 'grandTotal', label: 'Grand\nTotal', width: 40, align: 'right' },
          { key: 'paid', label: 'Paid', width: 38, align: 'right' },
          { key: 'paymentType', label: 'Payment\nType', width: 32, align: 'center' },
          { key: 'outstanding', label: 'Out-\nstanding', width: 34, align: 'right' },
          { key: 'status', label: 'Status', width: 22, align: 'center' },
        ];
        const totalTableWidth = cols.reduce((s, c) => s + c.width, 0);

        const colX: number[] = [];
        let accX = startX;
        for (const c of cols) {
          colX.push(accX);
          accX += c.width;
        }

        const drawHeader = (yPos: number) => {
          const headerH = 22;
          doc.save();
          doc.rect(startX, yPos, totalTableWidth, headerH).fill('#1b2a4a');
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(6.2);
          cols.forEach((c, idx) => {
            doc.text(c.label, colX[idx] + 2, yPos + 3, {
              width: c.width - 4,
              align: c.align,
              lineGap: 1,
            });
            doc.strokeColor('#334155').lineWidth(0.4)
              .moveTo(colX[idx], yPos).lineTo(colX[idx], yPos + headerH).stroke();
          });
          doc.rect(startX, yPos, totalTableWidth, headerH).strokeColor('#1b2a4a').lineWidth(0.6).stroke();
          doc.restore();
          return yPos + headerH;
        };

        // Document title block (Page 1)
        doc.fillColor('#1b2a4a').font('Helvetica-Bold').fontSize(13)
          .text(`${register.businessName} — Sales Register - Retail & Wholesale`, startX, 20);
        doc.fillColor('#64748b').font('Helvetica').fontSize(7.5)
          .text(`Generated: ${register.generatedAt}`, startX, 37);

        let y = drawHeader(54);

        const mergedIndices = new Set([0, 1, 2, 3, 4, 17, 18, 19, 20, 21]);
        const lineH = 15;

        for (let rIdx = 0; rIdx < register.rows.length; rIdx++) {
          const row = register.rows[rIdx];
          const itemCount = Math.max(1, row.lines.length);
          const blockH = itemCount * lineH;

          if (y + blockH > bottomLimit) {
            doc.addPage();
            y = drawHeader(22);
          }

          const bgColor = rIdx % 2 === 1 ? '#eef3f8' : '#ffffff';
          doc.save();
          doc.rect(startX, y, totalTableWidth, blockH).fill(bgColor);

          // Draw item sub-rows
          for (let lIdx = 0; lIdx < row.lines.length; lIdx++) {
            const line = row.lines[lIdx];
            const ly = y + lIdx * lineH;

            // Internal horizontal divider between item rows (only across non-merged columns 5..16)
            if (lIdx > 0) {
              doc.strokeColor('#cbd5e1').lineWidth(0.35)
                .moveTo(colX[5], ly)
                .lineTo(colX[17], ly)
                .stroke();
            }

            doc.fillColor('#0f172a').font('Helvetica').fontSize(5.9);
            const itemValues: Record<number, string> = {
              5: line.productName,
              6: line.hsn,
              7: line.qty,
              8: line.rate,
              9: line.taxable,
              10: line.cgstPct,
              11: line.cgst,
              12: line.sgstPct,
              13: line.sgst,
              14: line.igstPct,
              15: line.igst,
              16: line.itemTotal,
            };

            Object.entries(itemValues).forEach(([idxStr, val]) => {
              const ci = Number(idxStr);
              doc.text(val, colX[ci] + 2, ly + 4, {
                width: cols[ci].width - 4,
                align: cols[ci].align,
                ellipsis: true,
                lineBreak: false,
              });
            });
          }

          // Vertically centered merged invoice-level columns
          const midY = y + (blockH - 7) / 2;
          doc.fillColor('#0f172a').font('Helvetica').fontSize(5.9);
          const mergedValues: Record<number, string> = {
            0: String(row.sr),
            1: row.saleType,
            2: row.invoiceNo,
            3: row.date,
            4: row.customer,
            17: row.grandTotal,
            18: row.paid,
            19: row.paymentType,
            20: row.outstanding,
            21: row.status === 'PARTIALLY_PAID' ? 'PARTIAL' : row.status,
          };

          Object.entries(mergedValues).forEach(([idxStr, val]) => {
            const ci = Number(idxStr);
            doc.text(val, colX[ci] + 2, midY, {
              width: cols[ci].width - 4,
              align: cols[ci].align,
              ellipsis: true,
              lineBreak: false,
            });
          });

          // Draw vertical column lines & outer border for the invoice block
          doc.strokeColor('#94a3b8').lineWidth(0.4);
          cols.forEach((c, idx) => {
            doc.moveTo(colX[idx], y).lineTo(colX[idx], y + blockH).stroke();
          });
          doc.rect(startX, y, totalTableWidth, blockH).strokeColor('#64748b').lineWidth(0.5).stroke();
          doc.restore();

          y += blockH;
        }

        // Draw Subtotals & GRAND TOTAL rows
        const drawSummaryRow = (
          label: string,
          totals: SalesRegisterSummary['grandTotal'],
          bg: string,
        ) => {
          const rowH = 16;
          if (y + rowH > bottomLimit) {
            doc.addPage();
            y = drawHeader(22);
          }
          doc.save();
          doc.rect(startX, y, totalTableWidth, rowH).fill(bg);
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(6.1);
          doc.text(label, colX[1] + 2, y + 5, { width: colX[9] - colX[1] - 4, align: 'left' });

          const map: Record<number, string> = {
            9: totals.taxable,
            11: totals.cgst,
            13: totals.sgst,
            15: totals.igst,
            16: totals.itemTotal,
            17: totals.grandTotal,
            18: totals.paid,
            20: totals.outstanding,
          };
          Object.entries(map).forEach(([idxStr, val]) => {
            const ci = Number(idxStr);
            doc.text(val, colX[ci] + 2, y + 5, { width: cols[ci].width - 4, align: 'right' });
          });

          doc.strokeColor('#64748b').lineWidth(0.5);
          cols.forEach((c, idx) => {
            if (idx >= 9 || idx === 0) {
              doc.moveTo(colX[idx], y).lineTo(colX[idx], y + rowH).stroke();
            }
          });
          doc.rect(startX, y, totalTableWidth, rowH).stroke();
          doc.restore();
          y += rowH;
        };

        for (const sub of register.subtotals) {
          drawSummaryRow(
            `${sub.saleType} subtotal - ${sub.invoiceCount} invoice(s)`,
            sub,
            '#e8eff7',
          );
        }
        drawSummaryRow(
          `GRAND TOTAL - ${register.grandTotal.invoiceCount} invoice(s)`,
          register.grandTotal,
          '#dbe6f4',
        );
      },
    );
  }

  /**
   * Generates a single Bill / Sales Invoice PDF using the exact same navy-header
   * GST columnar format (Taxable, CGST %, CGST, SGST %, SGST, IGST %, IGST, Item Total, Grand Total, Paid, Outstanding, Status).
   */
  async generateSalesInvoicePdf(invoice: any, settings: Record<string, any>): Promise<Buffer> {
    const bizName = settings.businessName || 'Business ERP';
    const bizState = String(settings.businessAddress || '').toLowerCase();
    const dealerState = String(invoice.dealer?.addresses?.[0]?.state || '').toLowerCase();
    const isInterState = Boolean(dealerState && bizState && !bizState.includes(dealerState));

    const lines = invoice.items.map((line: any) => PdfService.splitGstLine(line, isInterState));
    const paymentModes = Array.from(
      new Set((invoice.allocations || []).map((a: any) => a.payment?.paymentMode).filter(Boolean)),
    );
    const paymentType = paymentModes.length > 0 ? paymentModes.join('/') : 'Credit';

    const totals = lines.reduce(
      (acc: any, l: SalesRegisterLine) => ({
        taxable: acc.taxable.plus(l.taxable),
        cgst: acc.cgst.plus(l.cgst),
        sgst: acc.sgst.plus(l.sgst),
        igst: acc.igst.plus(l.igst),
        itemTotal: acc.itemTotal.plus(l.itemTotal),
      }),
      {
        taxable: new Decimal(0),
        cgst: new Decimal(0),
        sgst: new Decimal(0),
        igst: new Decimal(0),
        itemTotal: new Decimal(0),
      },
    );

    const fmtDate = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}-${mm}-${d.getFullYear()}`;
    };

    const now = new Date();
    const registerPayload: SalesRegisterSummary = {
      businessName: bizName,
      generatedAt: `${fmtDate(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      rows: [
        {
          sr: 1,
          saleType: 'Wholesale',
          invoiceId: invoice.id,
          invoiceNo: invoice.invoiceNumber,
          date: fmtDate(new Date(invoice.invoiceDate)),
          customer: invoice.dealer?.businessName || 'Dealer',
          grandTotal: new Decimal(invoice.totalAmount.toString()).toFixed(2),
          paid: new Decimal(invoice.paidAmount.toString()).toFixed(2),
          paymentType,
          outstanding: new Decimal(invoice.outstandingAmount.toString()).toFixed(2),
          status: invoice.status === 'PARTIALLY_PAID' ? 'PARTIAL' : invoice.status,
          lines,
        },
      ],
      subtotals: [],
      grandTotal: {
        invoiceCount: 1,
        taxable: totals.taxable.toFixed(2),
        cgst: totals.cgst.toFixed(2),
        sgst: totals.sgst.toFixed(2),
        igst: totals.igst.toFixed(2),
        itemTotal: totals.itemTotal.toFixed(2),
        grandTotal: new Decimal(invoice.totalAmount.toString()).toFixed(2),
        paid: new Decimal(invoice.paidAmount.toString()).toFixed(2),
        outstanding: new Decimal(invoice.outstandingAmount.toString()).toFixed(2),
      },
    };

    return this.generateSalesRegisterPdf(registerPayload);
  }

  async generatePaymentReceiptPdf(payment: any, settings: Record<string, any>): Promise<Buffer> {
    return this.buildPdf({ size: 'A4', margin: 45 }, (doc) => {
      const bizName = settings.businessName || 'Business ERP';
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#1b2a4a').text(bizName);
      doc.fontSize(14).fillColor('#0f172a').text('PAYMENT RECEIPT', { align: 'right' });
      doc.moveDown(1);

      doc.fontSize(10).font('Helvetica');
      doc.text(`Receipt Number: ${payment.receiptNumber}`);
      doc.text(`Payment Number: ${payment.paymentNumber}`);
      doc.text(`Payment Date: ${new Date(payment.paymentDate).toLocaleDateString('en-IN')}`);
      doc.text(`Dealer: ${payment.dealer.businessName} (${payment.dealer.dealerCode})`);
      doc.text(`Payment Mode: ${payment.paymentMode}`);
      if (payment.transactionRef) doc.text(`Transaction Reference: ${payment.transactionRef}`);
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(12).text(`Amount Received: INR ${Number(payment.amount).toFixed(2)}`);
      doc.font('Helvetica').fontSize(10).text(`Unallocated Advance: INR ${Number(payment.unallocatedAmount).toFixed(2)}`);
      doc.text(`Dealer Current Outstanding Balance: INR ${Number(payment.dealer.outstandingBalance).toFixed(2)}`);

      if (payment.allocations?.length > 0) {
        doc.moveDown(1);
        doc.font('Helvetica-Bold').text('Allocated Invoices:');
        doc.font('Helvetica');
        for (const a of payment.allocations) {
          doc.text(`- ${a.invoice.invoiceNumber}: INR ${Number(a.allocatedAmount).toFixed(2)}`);
        }
      }

      doc.moveDown(2);
      doc.fontSize(8).fillColor('#64748b').text('Official Receipt generated by Business ERP.');
    });
  }

  async generateDeliveryChallanPdf(dispatch: any, settings: Record<string, any>): Promise<Buffer> {
    return this.buildPdf({ size: 'A4', margin: 45 }, (doc) => {
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#1b2a4a').text(settings.businessName || 'Business ERP');
      doc.fontSize(14).text('DELIVERY CHALLAN', { align: 'right' });
      doc.moveDown(1);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Challan / Dispatch No: ${dispatch.dispatchNumber}`);
      doc.text(`Order Number: ${dispatch.order.orderNumber}`);
      doc.text(`Dealer: ${dispatch.order.dealer.businessName}`);
      doc.text(`Source Location: ${dispatch.sourceLocation.name}`);
      doc.text(`Dispatch Date: ${new Date(dispatch.dispatchedAt).toLocaleString('en-IN')}`);
      if (dispatch.vehicleNumber) doc.text(`Vehicle: ${dispatch.vehicleNumber}`);
      if (dispatch.transporterName) doc.text(`Transporter: ${dispatch.transporterName}`);
      doc.moveDown(1);
      doc.font('Helvetica-Bold').text('Dispatched Items:');
      doc.font('Helvetica');
      for (const item of dispatch.items) {
        doc.text(`- ${item.item.name} (${item.item.sku}): ${Number(item.dispatchedQuantity)} ${item.item.uom?.code || ''}`);
      }
    });
  }
}
