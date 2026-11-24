import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PaginationQuery, ROLES } from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/services/storage.service';
import { AuditService } from '../../common/services/audit.service';
import { SettingsService } from '../settings/settings.service';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { PdfService } from './pdf.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditService: AuditService,
    private readonly settingsService: SettingsService,
    private readonly pdfService: PdfService,
  ) {}

  private isDealerOnly(actor: AuthenticatedUser): boolean {
    return (
      actor.roles.includes(ROLES.DEALER) &&
      !actor.roles.some((r) =>
        ([ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.ACCOUNTANT, ROLES.INVENTORY_MANAGER] as string[]).includes(r),
      )
    );
  }

  async search(
    query: PaginationQuery & { documentType?: string; dealerId?: string; entityType?: string },
    actor: AuthenticatedUser,
  ) {
    const where: any = {};
    if (this.isDealerOnly(actor)) {
      where.ownerDealerId = actor.dealerId;
    } else if (query.dealerId) {
      where.ownerDealerId = query.dealerId;
    }
    if (query.documentType) where.documentType = query.documentType;
    if (query.entityType) where.entityType = query.entityType;
    if (query.search) {
      where.OR = [
        { fileName: { contains: query.search, mode: 'insensitive' } },
        { referenceNo: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.documentDate = {};
      if (query.dateFrom) where.documentDate.gte = new Date(query.dateFrom);
      if (query.dateTo) where.documentDate.lte = new Date(query.dateTo);
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async getSignedDownloadUrl(documentId: string, actor: AuthenticatedUser) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found.');

    if (this.isDealerOnly(actor) && doc.ownerDealerId !== actor.dealerId) {
      throw new ForbiddenException('You are not authorized to download this document.');
    }

    return this.storage.createShortLivedDownloadUrl({
      documentId: doc.id,
      storageKey: doc.storageKey,
      fileName: doc.fileName,
    });
  }

  async streamVerifiedLocalDocument(documentId: string, expUnix: number, sig: string) {
    this.storage.verifyLocalDownloadSignature(documentId, expUnix, sig);
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found.');
    try {
      const buffer = await this.storage.readLocalPrivateObject(doc.storageKey);
      return { doc, buffer };
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
      // On serverless runtimes (e.g., Vercel /tmp), regenerate standard PDFs on-the-fly from PostgreSQL
      const regenerated = await this.regenerateDocumentBuffer(doc);
      if (regenerated) {
        return { doc, buffer: regenerated };
      }
      throw new NotFoundException('Document file is unavailable.');
    }
  }

  private async regenerateDocumentBuffer(doc: {
    documentType: DocumentType;
    entityId: string | null;
  }): Promise<Buffer | null> {
    if (!doc.entityId) return null;
    const settings = await this.settingsService.getAll();

    if (doc.documentType === DocumentType.SALES_INVOICE) {
      const invoice = await this.prisma.salesInvoice.findUnique({
        where: { id: doc.entityId },
        include: {
          dealer: { include: { addresses: { where: { isDefault: true }, take: 1 } } },
          items: { include: { item: { include: { uom: true } } } },
          allocations: { include: { payment: { select: { paymentMode: true, verificationStatus: true } } } },
        },
      });
      return invoice ? this.pdfService.generateSalesInvoicePdf(invoice, settings) : null;
    }

    if (doc.documentType === DocumentType.PAYMENT_RECEIPT) {
      const payment = await this.prisma.payment.findUnique({
        where: { id: doc.entityId },
        include: {
          dealer: true,
          allocations: { include: { invoice: { select: { invoiceNumber: true } } } },
        },
      });
      return payment ? this.pdfService.generatePaymentReceiptPdf(payment, settings) : null;
    }

    if (doc.documentType === DocumentType.DELIVERY_CHALLAN) {
      const dispatch = await this.prisma.dispatch.findUnique({
        where: { id: doc.entityId },
        include: {
          order: { include: { dealer: true } },
          sourceLocation: true,
          items: { include: { item: { include: { uom: true } } } },
        },
      });
      return dispatch ? this.pdfService.generateDeliveryChallanPdf(dispatch, settings) : null;
    }

    return null;
  }

  async getOrGenerateInvoicePdf(invoiceId: string, actor: AuthenticatedUser) {
    const invoice = await this.prisma.salesInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        dealer: { include: { addresses: { where: { isDefault: true }, take: 1 } } },
        items: { include: { item: { include: { uom: true } } } },
        allocations: { include: { payment: { select: { paymentMode: true, verificationStatus: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    if (this.isDealerOnly(actor) && invoice.dealerId !== actor.dealerId) {
      throw new ForbiddenException('You are not authorized to access this invoice.');
    }

    const settings = await this.settingsService.getAll();
    const pdfBuffer = await this.pdfService.generateSalesInvoicePdf(invoice, settings);
    const fileName = `${invoice.invoiceNumber}.pdf`;

    const stored = await this.storage.putPrivateObject({
      folder: 'invoices',
      fileName,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    });

    const doc = await this.prisma.document.create({
      data: {
        documentType: DocumentType.SALES_INVOICE,
        fileName,
        mimeType: 'application/pdf',
        fileSizeBytes: stored.fileSizeBytes,
        storageKey: stored.storageKey,
        storageBucket: stored.storageBucket,
        checksumSha256: stored.checksumSha256,
        entityType: 'SalesInvoice',
        entityId: invoice.id,
        referenceNo: invoice.invoiceNumber,
        ownerDealerId: invoice.dealerId,
        amount: invoice.totalAmount,
        documentDate: invoice.invoiceDate,
        uploadedById: actor.userId,
      },
    });

    await this.prisma.salesInvoice.update({
      where: { id: invoice.id },
      data: { pdfDocumentId: doc.id },
    });

    const signed = await this.storage.createShortLivedDownloadUrl({
      documentId: doc.id,
      storageKey: doc.storageKey,
      fileName: doc.fileName,
    });

    return { documentId: doc.id, fileName: doc.fileName, ...signed };
  }

  async getOrGenerateReceiptPdf(paymentId: string, actor: AuthenticatedUser) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        dealer: true,
        allocations: { include: { invoice: { select: { invoiceNumber: true } } } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found.');
    if (this.isDealerOnly(actor) && payment.dealerId !== actor.dealerId) {
      throw new ForbiddenException('You are not authorized to access this receipt.');
    }

    const settings = await this.settingsService.getAll();
    const pdfBuffer = await this.pdfService.generatePaymentReceiptPdf(payment, settings);
    const fileName = `${payment.receiptNumber}.pdf`;

    const stored = await this.storage.putPrivateObject({
      folder: 'receipts',
      fileName,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    });

    const doc = await this.prisma.document.create({
      data: {
        documentType: DocumentType.PAYMENT_RECEIPT,
        fileName,
        mimeType: 'application/pdf',
        fileSizeBytes: stored.fileSizeBytes,
        storageKey: stored.storageKey,
        storageBucket: stored.storageBucket,
        checksumSha256: stored.checksumSha256,
        entityType: 'Payment',
        entityId: payment.id,
        referenceNo: payment.receiptNumber,
        ownerDealerId: payment.dealerId,
        amount: payment.amount,
        documentDate: payment.paymentDate,
        uploadedById: actor.userId,
      },
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { receiptDocumentId: doc.id },
    });

    const signed = await this.storage.createShortLivedDownloadUrl({
      documentId: doc.id,
      storageKey: doc.storageKey,
      fileName: doc.fileName,
    });

    return { documentId: doc.id, fileName: doc.fileName, ...signed };
  }

  async getOrGenerateChallanPdf(dispatchId: string, actor: AuthenticatedUser) {
    const dispatch = await this.prisma.dispatch.findUnique({
      where: { id: dispatchId },
      include: {
        order: { include: { dealer: true } },
        sourceLocation: true,
        items: { include: { item: { include: { uom: true } } } },
      },
    });
    if (!dispatch) throw new NotFoundException('Dispatch not found.');
    if (this.isDealerOnly(actor) && dispatch.order.dealerId !== actor.dealerId) {
      throw new ForbiddenException('Access denied.');
    }

    const settings = await this.settingsService.getAll();
    const pdfBuffer = await this.pdfService.generateDeliveryChallanPdf(dispatch, settings);
    const fileName = `CHALLAN-${dispatch.dispatchNumber}.pdf`;

    const stored = await this.storage.putPrivateObject({
      folder: 'challans',
      fileName,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    });

    const doc = await this.prisma.document.create({
      data: {
        documentType: DocumentType.DELIVERY_CHALLAN,
        fileName,
        mimeType: 'application/pdf',
        fileSizeBytes: stored.fileSizeBytes,
        storageKey: stored.storageKey,
        storageBucket: stored.storageBucket,
        checksumSha256: stored.checksumSha256,
        entityType: 'Dispatch',
        entityId: dispatch.id,
        referenceNo: dispatch.dispatchNumber,
        ownerDealerId: dispatch.order.dealerId,
        documentDate: dispatch.dispatchedAt,
        uploadedById: actor.userId,
      },
    });

    await this.auditService.record({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: 'DELIVERY_CHALLAN_GENERATED',
      entityType: 'Document',
      entityId: doc.id,
      referenceNo: dispatch.dispatchNumber,
    });

    const signed = await this.storage.createShortLivedDownloadUrl({
      documentId: doc.id,
      storageKey: doc.storageKey,
      fileName: doc.fileName,
    });

    return { documentId: doc.id, fileName: doc.fileName, ...signed };
  }
}
