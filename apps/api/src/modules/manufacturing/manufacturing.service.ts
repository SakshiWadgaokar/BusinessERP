import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryTransactionType,
  JobCardStatus,
  MaterialRequestStatus,
  Prisma,
  ProductionCostType,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { PaginationQuery, ROLES } from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import { AuditService } from '../../common/services/audit.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthenticatedUser } from '../../common/types/auth-user.type';

@Injectable()
export class ManufacturingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly auditService: AuditService,
    private readonly inventoryLedger: InventoryLedgerService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private isEmployeeOnly(actor: AuthenticatedUser): boolean {
    return (
      actor.roles.includes(ROLES.EMPLOYEE) &&
      !actor.roles.some((r) =>
        ([ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.INVENTORY_MANAGER, ROLES.ACCOUNTANT] as string[]).includes(r),
      )
    );
  }

  private assertEditableJobCard(status: JobCardStatus) {
    if (status === JobCardStatus.CLOSED || status === JobCardStatus.CANCELLED) {
      throw new BadRequestException({
        errorCode: 'JOB_CARD_LOCKED',
        message: `Job Card is ${status} and cannot be edited. An authorized manager must reopen it with an audit reason.`,
      });
    }
  }

  private async recalculateJobCardCosting(tx: Prisma.TransactionClient, jobCardId: string) {
    const jc = await tx.jobCard.findUniqueOrThrow({
      where: { id: jobCardId },
      include: { productionCosts: true },
    });

    let materialCost = new Decimal(0);
    let laborCost = new Decimal(0);
    let overheadCost = new Decimal(0);
    let hasLaborOrOverhead = false;

    for (const c of jc.productionCosts) {
      const amt = new Decimal(c.amount.toString());
      if (c.costType === ProductionCostType.RAW_MATERIAL || c.costType === ProductionCostType.CONSUMABLE) {
        materialCost = materialCost.plus(amt);
      } else if (c.costType === ProductionCostType.DIRECT_LABOR) {
        laborCost = laborCost.plus(amt);
        hasLaborOrOverhead = true;
      } else {
        overheadCost = overheadCost.plus(amt);
        hasLaborOrOverhead = true;
      }
    }

    const totalCost = materialCost.plus(laborCost).plus(overheadCost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const finishedQty = new Decimal(jc.finishedQuantity.toString());
    const costPerUnit = finishedQty.greaterThan(0)
      ? totalCost.dividedBy(finishedQty).toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
      : null;
    const costingComplete = materialCost.greaterThan(0) && hasLaborOrOverhead && finishedQty.greaterThan(0);

    return tx.jobCard.update({
      where: { id: jobCardId },
      data: {
        totalMaterialCost: materialCost.toFixed(2),
        totalLaborCost: laborCost.toFixed(2),
        totalOverheadCost: overheadCost.toFixed(2),
        totalProductionCost: totalCost.toFixed(2),
        costPerUnit: costPerUnit ? costPerUnit.toFixed(4) : null,
        costingComplete,
      },
    });
  }

  async listJobCards(
    query: PaginationQuery & { status?: string; locationId?: string },
    actor: AuthenticatedUser,
  ) {
    const where: any = {};
    if (this.isEmployeeOnly(actor)) {
      where.assignments = { some: { employeeId: actor.employeeId || '', isActive: true } };
    }
    if (query.status) where.status = query.status;
    if (query.locationId) where.locationId = query.locationId;
    if (query.search) {
      where.OR = [
        { jobCardNumber: { contains: query.search, mode: 'insensitive' } },
        { finishedProduct: { name: { contains: query.search, mode: 'insensitive' } } },
        { finishedProduct: { sku: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.jobCard.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          finishedProduct: { select: { id: true, sku: true, name: true, uom: { select: { code: true } } } },
          location: { select: { id: true, code: true, name: true } },
          supervisor: { select: { id: true, employeeCode: true, fullName: true } },
          assignments: {
            where: { isActive: true },
            include: { employee: { select: { id: true, employeeCode: true, fullName: true } } },
          },
          plannedMaterials: {
            include: { item: { select: { id: true, sku: true, name: true, uom: { select: { code: true } } } } },
          },
        },
      }),
      this.prisma.jobCard.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async findJobCard(id: string, actor: AuthenticatedUser) {
    const jc = await this.prisma.jobCard.findUnique({
      where: { id },
      include: {
        finishedProduct: { include: { uom: true } },
        location: true,
        supervisor: true,
        assignments: { include: { employee: true } },
        plannedMaterials: { include: { item: { include: { uom: true } } } },
        materialRequests: {
          include: {
            employee: { select: { fullName: true, employeeCode: true } },
            items: { include: { item: { select: { sku: true, name: true, uom: { select: { code: true } } } } } },
          },
          orderBy: { createdAt: 'desc' },
        },
        materialIssues: {
          include: {
            employee: { select: { fullName: true, employeeCode: true } },
            item: { select: { sku: true, name: true, uom: { select: { code: true } } } },
            sourceLocation: { select: { code: true, name: true } },
          },
          orderBy: { issuedAt: 'desc' },
        },
        materialReturns: {
          include: {
            employee: { select: { fullName: true } },
            item: { select: { sku: true, name: true } },
            destLocation: { select: { name: true } },
          },
          orderBy: { returnedAt: 'desc' },
        },
        productionRecords: {
          include: { employee: { select: { fullName: true } } },
          orderBy: { recordedAt: 'desc' },
        },
        productionCosts: { orderBy: { recordedAt: 'desc' } },
        finishedGoodsReceipts: {
          include: { destLocation: { select: { name: true } } },
          orderBy: { receivedAt: 'desc' },
        },
        scrapRecords: {
          include: { item: { select: { sku: true, name: true } } },
          orderBy: { recordedAt: 'desc' },
        },
      },
    });
    if (!jc) throw new NotFoundException('Job Card not found.');

    if (
      this.isEmployeeOnly(actor) &&
      !jc.assignments.some((a) => a.employeeId === actor.employeeId && a.isActive)
    ) {
      throw new ForbiddenException('You are not assigned to this Job Card.');
    }

    return jc;
  }

  async createJobCard(input: any, actor: AuthenticatedUser) {
    const jc = await this.prisma.runInTransaction(async (tx) => {
      const jobCardNumber = await this.sequenceService.next('JOB_CARD', tx);
      const created = await tx.jobCard.create({
        data: {
          jobCardNumber,
          finishedProductId: input.finishedProductId,
          targetQuantity: input.targetQuantity,
          locationId: input.locationId,
          supervisorId: input.supervisorId ?? null,
          status: JobCardStatus.ASSIGNED,
          plannedStartDate: input.plannedStartDate ? new Date(input.plannedStartDate) : null,
          plannedCompletionDate: input.plannedCompletionDate ? new Date(input.plannedCompletionDate) : null,
          notes: input.notes ?? null,
          createdById: actor.userId,
          assignments: {
            create: input.employeeIds.map((employeeId: string) => ({
              employeeId,
              assignedBy: actor.userId,
            })),
          },
          plannedMaterials: {
            create: input.materials.map((m: any) => ({
              itemId: m.itemId,
              requiredQuantity: m.requiredQuantity,
            })),
          },
        },
        include: {
          finishedProduct: true,
          assignments: { include: { employee: true } },
          plannedMaterials: { include: { item: true } },
        },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'JOB_CARD_CREATED',
          entityType: 'JobCard',
          entityId: created.id,
          referenceNo: jobCardNumber,
          afterValue: {
            finishedProductId: input.finishedProductId,
            targetQuantity: input.targetQuantity,
            assignedCount: input.employeeIds.length,
          },
        },
        tx,
      );

      return created;
    });

    const userIds = jc.assignments
      .map((a) => a.employee.userId)
      .filter((id): id is string => Boolean(id));
    if (userIds.length > 0) {
      await this.notifications.notify({
        userIds,
        category: 'JOB_CARD',
        title: `New Job Card Assigned: ${jc.jobCardNumber}`,
        message: `You have been assigned to manufacture ${jc.targetQuantity} of ${jc.finishedProduct.name}.`,
        entityType: 'JobCard',
        entityId: jc.id,
      });
    }

    return jc;
  }

  async createMaterialRequest(jobCardId: string, input: any, actor: AuthenticatedUser) {
    const jc = await this.findJobCard(jobCardId, actor);
    this.assertEditableJobCard(jc.status);

    const employeeId = actor.employeeId || jc.assignments[0]?.employeeId;
    if (!employeeId) {
      throw new BadRequestException('No employee associated with this material request.');
    }

    const req = await this.prisma.runInTransaction(async (tx) => {
      const requestNumber = await this.sequenceService.next('MAT_REQ', tx);
      const created = await tx.materialRequest.create({
        data: {
          requestNumber,
          jobCardId,
          employeeId,
          isReplacement: Boolean(input.isReplacement),
          status: MaterialRequestStatus.PENDING,
          reason: input.reason ?? null,
          items: {
            create: input.items.map((i: any) => ({
              itemId: i.itemId,
              requestedQuantity: i.requestedQuantity,
            })),
          },
        },
        include: { items: true },
      });

      if (jc.status === JobCardStatus.ASSIGNED || jc.status === JobCardStatus.OPEN) {
        await tx.jobCard.update({
          where: { id: jobCardId },
          data: { status: JobCardStatus.MATERIAL_PENDING },
        });
      }

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'MATERIAL_REQUEST_SUBMITTED',
          entityType: 'MaterialRequest',
          entityId: created.id,
          referenceNo: requestNumber,
          afterValue: { jobCardNumber: jc.jobCardNumber, isReplacement: input.isReplacement },
        },
        tx,
      );

      return created;
    });

    await this.notifications.notify({
      roleCodes: [ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.INVENTORY_MANAGER],
      category: 'MATERIAL_REQUEST',
      title: `Material Request ${req.requestNumber}`,
      message: `${input.isReplacement ? 'Replacement material' : 'Material'} requested for Job Card ${jc.jobCardNumber}.`,
      entityType: 'JobCard',
      entityId: jobCardId,
    });

    return req;
  }

  /**
   * Issues raw material from warehouse to an employee for a Job Card.
   * Atomically reduces warehouse stock (`MATERIAL_ISSUE`) and increments `issuedQuantity`
   * WITHOUT marking it consumed until actual consumption is recorded.
   */
  async issueMaterial(jobCardId: string, input: any, actor: AuthenticatedUser) {
    const jc = await this.prisma.jobCard.findUnique({
      where: { id: jobCardId },
      include: { plannedMaterials: true },
    });
    if (!jc) throw new NotFoundException('Job Card not found.');
    this.assertEditableJobCard(jc.status);

    const qty = new Decimal(input.quantity);
    if (qty.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Issue quantity must be positive.');
    }

    const issue = await this.prisma.runInTransaction(async (tx) => {
      const issueNumber = await this.sequenceService.next('MAT_ISSUE', tx);

      const move = await this.inventoryLedger.recordMovement(tx, {
        itemId: input.itemId,
        locationId: input.sourceLocationId,
        sourceLocationId: input.sourceLocationId,
        destLocationId: jc.locationId,
        transactionType: InventoryTransactionType.MATERIAL_ISSUE,
        quantityDelta: qty.negated(),
        referenceType: 'JobCard',
        referenceId: jc.id,
        referenceNumber: jc.jobCardNumber,
        reason: input.isReplacement
          ? `Replacement issue ${issueNumber} for ${jc.jobCardNumber}`
          : `Material issue ${issueNumber} for ${jc.jobCardNumber}`,
        performedById: actor.userId,
        approvedById: actor.userId,
      });

      const createdIssue = await tx.materialIssue.create({
        data: {
          issueNumber,
          jobCardId,
          requestId: input.requestId ?? null,
          employeeId: input.employeeId,
          itemId: input.itemId,
          sourceLocationId: input.sourceLocationId,
          quantity: qty.toFixed(4),
          unitCost: move.averageUnitCost.toFixed(4),
          isReplacement: Boolean(input.isReplacement),
          issuedById: actor.userId,
          notes: input.notes ?? null,
        },
        include: { item: true, employee: true },
      });

      // Upsert JobCardMaterial issuedQuantity (never overwriting historical MaterialIssue rows!)
      const existingPlan = await tx.jobCardMaterial.findUnique({
        where: { jobCardId_itemId: { jobCardId, itemId: input.itemId } },
      });
      if (existingPlan) {
        await tx.jobCardMaterial.update({
          where: { id: existingPlan.id },
          data: {
            issuedQuantity: new Decimal(existingPlan.issuedQuantity.toString()).plus(qty).toFixed(4),
          },
        });
      } else {
        await tx.jobCardMaterial.create({
          data: {
            jobCardId,
            itemId: input.itemId,
            requiredQuantity: qty.toFixed(4),
            issuedQuantity: qty.toFixed(4),
          },
        });
      }

      if (input.requestId) {
        await tx.materialRequest.update({
          where: { id: input.requestId },
          data: {
            status: MaterialRequestStatus.ISSUED,
            approvedById: actor.userId,
            approvedAt: new Date(),
          },
        });
      }

      if ([JobCardStatus.OPEN, JobCardStatus.ASSIGNED, JobCardStatus.MATERIAL_PENDING].includes(jc.status as any)) {
        await tx.jobCard.update({
          where: { id: jobCardId },
          data: { status: JobCardStatus.IN_PROGRESS },
        });
      }

      await tx.employeeActivity.create({
        data: {
          employeeId: input.employeeId,
          activityType: 'MATERIAL_ISSUED',
          referenceId: createdIssue.id,
          summary: `Issued ${qty.toString()} of ${createdIssue.item.name} for ${jc.jobCardNumber}`,
        },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'MATERIAL_ISSUED',
          entityType: 'MaterialIssue',
          entityId: createdIssue.id,
          referenceNo: issueNumber,
          afterValue: {
            jobCardNumber: jc.jobCardNumber,
            itemId: input.itemId,
            quantity: qty.toFixed(4),
            isReplacement: Boolean(input.isReplacement),
            warehouseBalanceAfter: move.balanceAfter.toFixed(4),
          },
        },
        tx,
      );

      return { issue: createdIssue, warehouseBalanceAfter: move.balanceAfter.toFixed(4) };
    });

    this.realtime.emitToRoles(
      [ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.INVENTORY_MANAGER],
      'dashboard.refresh',
      { reason: 'MATERIAL_ISSUED' },
    );

    return issue;
  }

  /**
   * Records actual raw material consumption and/or defective material on a Job Card.
   * Validates against unconsumed floor balance (`issued - consumed - returned - defective`).
   */
  async recordConsumption(jobCardId: string, input: any, actor: AuthenticatedUser) {
    const jc = await this.findJobCard(jobCardId, actor);
    this.assertEditableJobCard(jc.status);

    const consumed = new Decimal(input.consumedQuantity || '0');
    const defective = new Decimal(input.defectiveQuantity || '0');
    const totalAccountedNow = consumed.plus(defective);
    if (totalAccountedNow.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Either consumedQuantity or defectiveQuantity must be positive.');
    }

    const employeeId = actor.employeeId || jc.assignments[0]?.employeeId;
    if (!employeeId) throw new BadRequestException('No employee associated with Job Card.');

    return this.prisma.runInTransaction(async (tx) => {
      const mat = await tx.jobCardMaterial.findUnique({
        where: { jobCardId_itemId: { jobCardId, itemId: input.itemId } },
        include: { item: true },
      });
      if (!mat) {
        throw new BadRequestException('Material has not been issued to this Job Card yet.');
      }

      const issued = new Decimal(mat.issuedQuantity.toString());
      const prevConsumed = new Decimal(mat.consumedQuantity.toString());
      const prevReturned = new Decimal(mat.returnedQuantity.toString());
      const prevDefective = new Decimal(mat.defectiveQuantity.toString());
      const pendingOnFloor = issued.minus(prevConsumed).minus(prevReturned).minus(prevDefective);

      if (totalAccountedNow.greaterThan(pendingOnFloor)) {
        throw new BadRequestException(
          `Cannot account for ${totalAccountedNow.toFixed(4)} units. Unaccounted issued material on floor: ${pendingOnFloor.toFixed(4)}.`,
        );
      }

      await tx.jobCardMaterial.update({
        where: { id: mat.id },
        data: {
          consumedQuantity: prevConsumed.plus(consumed).toFixed(4),
          defectiveQuantity: prevDefective.plus(defective).toFixed(4),
        },
      });

      const rec = await tx.productionRecord.create({
        data: {
          jobCardId,
          employeeId,
          recordType: defective.greaterThan(0) && consumed.isZero() ? 'DEFECT' : 'CONSUMPTION',
          itemId: input.itemId,
          goodQuantity: consumed.toFixed(4),
          rejectedQuantity: defective.toFixed(4),
          notes: input.notes ?? null,
        },
      });

      // Determine weighted average unit cost from material issues for this job card & item
      const issues = await tx.materialIssue.findMany({
        where: { jobCardId, itemId: input.itemId },
      });
      let sumQty = new Decimal(0);
      let sumVal = new Decimal(0);
      for (const iss of issues) {
        const q = new Decimal(iss.quantity.toString());
        sumQty = sumQty.plus(q);
        sumVal = sumVal.plus(q.times(iss.unitCost.toString()));
      }
      const avgIssueCost = sumQty.greaterThan(0) ? sumVal.dividedBy(sumQty) : new Decimal(0);
      const consumedCost = totalAccountedNow.times(avgIssueCost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      if (consumedCost.greaterThan(0)) {
        await tx.productionCost.create({
          data: {
            jobCardId,
            costType: ProductionCostType.RAW_MATERIAL,
            description: `Material consumption (${mat.item.name}): ${consumed.toFixed(2)} good, ${defective.toFixed(2)} defective`,
            amount: consumedCost.toFixed(2),
            recordedById: actor.userId,
          },
        });
      }

      const updatedJc = await this.recalculateJobCardCosting(tx, jobCardId);

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'MATERIAL_CONSUMPTION_RECORDED',
          entityType: 'JobCard',
          entityId: jobCardId,
          referenceNo: jc.jobCardNumber,
          afterValue: {
            itemId: input.itemId,
            consumedQuantity: consumed.toFixed(4),
            defectiveQuantity: defective.toFixed(4),
            materialCostAdded: consumedCost.toFixed(2),
          },
        },
        tx,
      );

      return { record: rec, totalMaterialCost: updatedJc.totalMaterialCost.toString() };
    });
  }

  /**
   * Returns unused issued material from a Job Card back into warehouse stock (`MATERIAL_RETURN`).
   */
  async returnMaterial(jobCardId: string, input: any, actor: AuthenticatedUser) {
    const jc = await this.findJobCard(jobCardId, actor);
    this.assertEditableJobCard(jc.status);

    const qty = new Decimal(input.quantity);
    if (qty.lessThanOrEqualTo(0)) throw new BadRequestException('Return quantity must be positive.');
    const employeeId = input.employeeId || actor.employeeId || jc.assignments[0]?.employeeId;

    return this.prisma.runInTransaction(async (tx) => {
      const mat = await tx.jobCardMaterial.findUnique({
        where: { jobCardId_itemId: { jobCardId, itemId: input.itemId } },
      });
      if (!mat) throw new BadRequestException('Material was never issued to this Job Card.');

      const pendingOnFloor = new Decimal(mat.issuedQuantity.toString())
        .minus(mat.consumedQuantity.toString())
        .minus(mat.returnedQuantity.toString())
        .minus(mat.defectiveQuantity.toString());

      if (qty.greaterThan(pendingOnFloor)) {
        throw new BadRequestException(
          `Cannot return ${qty.toFixed(4)}. Unused issued material remaining on floor: ${pendingOnFloor.toFixed(4)}.`,
        );
      }

      const returnNumber = await this.sequenceService.next('MAT_RET', tx);
      const lastIssue = await tx.materialIssue.findFirst({
        where: { jobCardId, itemId: input.itemId },
        orderBy: { issuedAt: 'desc' },
      });

      const move = await this.inventoryLedger.recordMovement(tx, {
        itemId: input.itemId,
        locationId: input.destLocationId,
        sourceLocationId: jc.locationId,
        destLocationId: input.destLocationId,
        transactionType: InventoryTransactionType.MATERIAL_RETURN,
        quantityDelta: qty,
        unitCost: lastIssue?.unitCost?.toString(),
        referenceType: 'JobCard',
        referenceId: jobCardId,
        referenceNumber: jc.jobCardNumber,
        reason: `Material return ${returnNumber}: ${input.reason}`,
        performedById: actor.userId,
      });

      const ret = await tx.materialReturn.create({
        data: {
          returnNumber,
          jobCardId,
          employeeId,
          itemId: input.itemId,
          destLocationId: input.destLocationId,
          quantity: qty.toFixed(4),
          reason: input.reason,
          receivedById: actor.userId,
        },
      });

      await tx.jobCardMaterial.update({
        where: { id: mat.id },
        data: { returnedQuantity: new Decimal(mat.returnedQuantity.toString()).plus(qty).toFixed(4) },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'MATERIAL_RETURNED',
          entityType: 'MaterialReturn',
          entityId: ret.id,
          referenceNo: returnNumber,
          afterValue: {
            jobCardNumber: jc.jobCardNumber,
            quantity: qty.toFixed(4),
            warehouseBalanceAfter: move.balanceAfter.toFixed(4),
          },
        },
        tx,
      );

      return { materialReturn: ret, warehouseBalanceAfter: move.balanceAfter.toFixed(4) };
    });
  }

  /**
   * Records finished production output and receives good units into finished goods inventory.
   */
  async recordProductionOutput(jobCardId: string, input: any, actor: AuthenticatedUser) {
    const jc = await this.findJobCard(jobCardId, actor);
    this.assertEditableJobCard(jc.status);

    const goodQty = new Decimal(input.goodQuantity || '0');
    const rejQty = new Decimal(input.rejectedQuantity || '0');
    if (goodQty.plus(rejQty).lessThanOrEqualTo(0)) {
      throw new BadRequestException('Good or rejected output quantity must be positive.');
    }

    const employeeId = actor.employeeId || jc.assignments[0]?.employeeId;
    if (!employeeId) throw new BadRequestException('No employee assigned to this Job Card.');

    const result = await this.prisma.runInTransaction(async (tx) => {
      const prodRec = await tx.productionRecord.create({
        data: {
          jobCardId,
          employeeId,
          recordType: 'OUTPUT',
          itemId: jc.finishedProductId,
          goodQuantity: goodQty.toFixed(4),
          rejectedQuantity: rejQty.toFixed(4),
          laborHours: input.laborHours ?? null,
          batchNumber: input.batchNumber ?? null,
          notes: input.notes ?? null,
        },
      });

      // Automatically post direct labor cost if employee hourlyLaborRate & laborHours are provided
      if (input.laborHours && input.laborHours > 0) {
        const emp = await tx.employee.findUnique({ where: { id: employeeId } });
        if (emp?.hourlyLaborRate) {
          const laborCost = new Decimal(input.laborHours)
            .times(emp.hourlyLaborRate.toString())
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
          if (laborCost.greaterThan(0)) {
            await tx.productionCost.create({
              data: {
                jobCardId,
                costType: ProductionCostType.DIRECT_LABOR,
                description: `Direct labor (${emp.fullName}, ${input.laborHours} hrs)`,
                amount: laborCost.toFixed(2),
                recordedById: actor.userId,
              },
            });
          }
        }
      }

      const nextFinished = new Decimal(jc.finishedQuantity.toString()).plus(goodQty);
      const nextRejected = new Decimal(jc.rejectedQuantity.toString()).plus(rejQty);

      await tx.jobCard.update({
        where: { id: jobCardId },
        data: {
          finishedQuantity: nextFinished.toFixed(4),
          rejectedQuantity: nextRejected.toFixed(4),
          status: nextFinished.greaterThanOrEqualTo(jc.targetQuantity.toString())
            ? JobCardStatus.UNDER_REVIEW
            : JobCardStatus.IN_PROGRESS,
        },
      });

      const costedJc = await this.recalculateJobCardCosting(tx, jobCardId);

      let fgReceipt: any = null;
      if (goodQty.greaterThan(0)) {
        const receiptNumber = await this.sequenceService.next('FG_RCPT', tx);
        const unitCost = costedJc.costPerUnit
          ? new Decimal(costedJc.costPerUnit.toString())
          : new Decimal(jc.finishedProduct.standardCost.toString());

        await this.inventoryLedger.recordMovement(tx, {
          itemId: jc.finishedProductId,
          locationId: input.destLocationId,
          sourceLocationId: jc.locationId,
          destLocationId: input.destLocationId,
          transactionType: InventoryTransactionType.FINISHED_GOODS_RECEIPT,
          quantityDelta: goodQty,
          unitCost,
          referenceType: 'JobCard',
          referenceId: jobCardId,
          referenceNumber: jc.jobCardNumber,
          reason: `Finished Goods Receipt ${receiptNumber} from ${jc.jobCardNumber}`,
          performedById: actor.userId,
        });

        fgReceipt = await tx.finishedGoodsReceipt.create({
          data: {
            receiptNumber,
            jobCardId,
            destLocationId: input.destLocationId,
            quantity: goodQty.toFixed(4),
            unitCost: unitCost.toFixed(4),
            receivedById: actor.userId,
            notes: input.notes ?? null,
          },
        });
      }

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'PRODUCTION_OUTPUT_RECORDED',
          entityType: 'JobCard',
          entityId: jobCardId,
          referenceNo: jc.jobCardNumber,
          afterValue: {
            goodQuantity: goodQty.toFixed(4),
            rejectedQuantity: rejQty.toFixed(4),
            costPerUnit: costedJc.costPerUnit?.toString() ?? null,
            costingComplete: costedJc.costingComplete,
          },
        },
        tx,
      );

      return { productionRecord: prodRec, finishedGoodsReceipt: fgReceipt, jobCard: costedJc };
    });

    this.realtime.emitToRoles(
      [ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.INVENTORY_MANAGER],
      'dashboard.refresh',
      { reason: 'PRODUCTION_OUTPUT_RECORDED' },
    );

    return result;
  }

  async addProductionCost(jobCardId: string, input: any, actor: AuthenticatedUser) {
    const jc = await this.prisma.jobCard.findUnique({ where: { id: jobCardId } });
    if (!jc) throw new NotFoundException('Job Card not found.');
    this.assertEditableJobCard(jc.status);

    return this.prisma.runInTransaction(async (tx) => {
      const cost = await tx.productionCost.create({
        data: {
          jobCardId,
          costType: input.costType,
          description: input.description,
          amount: new Decimal(input.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
          recordedById: actor.userId,
        },
      });
      const updatedJc = await this.recalculateJobCardCosting(tx, jobCardId);

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'PRODUCTION_COST_ADDED',
          entityType: 'JobCard',
          entityId: jobCardId,
          referenceNo: jc.jobCardNumber,
          afterValue: { costType: input.costType, amount: cost.amount.toString() },
        },
        tx,
      );

      return { cost, jobCard: updatedJc };
    });
  }

  async getCostingBreakdown(jobCardId: string, actor: AuthenticatedUser) {
    const jc = await this.findJobCard(jobCardId, actor);
    const missingComponents: string[] = [];
    if (new Decimal(jc.totalMaterialCost.toString()).isZero()) missingComponents.push('RAW_MATERIAL');
    if (new Decimal(jc.totalLaborCost.toString()).isZero()) missingComponents.push('DIRECT_LABOR');
    if (new Decimal(jc.totalOverheadCost.toString()).isZero()) missingComponents.push('OVERHEAD');

    const totalScrapEstimated = jc.scrapRecords.reduce(
      (acc, s) => acc.plus(s.estimatedValue.toString()),
      new Decimal(0),
    );
    const totalScrapRealized = jc.scrapRecords.reduce(
      (acc, s) => acc.plus(s.realizedValue.toString()),
      new Decimal(0),
    );

    return {
      jobCardNumber: jc.jobCardNumber,
      finishedProduct: jc.finishedProduct.name,
      finishedQuantity: jc.finishedQuantity.toString(),
      rejectedQuantity: jc.rejectedQuantity.toString(),
      totalMaterialCost: jc.totalMaterialCost.toString(),
      totalLaborCost: jc.totalLaborCost.toString(),
      totalOverheadCost: jc.totalOverheadCost.toString(),
      totalProductionCost: jc.totalProductionCost.toString(),
      costPerFinishedUnit: jc.costPerUnit?.toString() ?? null,
      costingComplete: jc.costingComplete,
      missingComponents,
      costingNotice: jc.costingComplete
        ? 'All primary cost categories recorded.'
        : `Incomplete cost calculation — missing: ${missingComponents.join(', ')}.`,
      scrapSummary: {
        scrapQuantity: jc.scrapQuantity.toString(),
        estimatedScrapValue: totalScrapEstimated.toFixed(2),
        realizedScrapRecoveryValue: totalScrapRealized.toFixed(2),
      },
      lineItems: jc.productionCosts,
    };
  }

  async closeJobCard(jobCardId: string, actor: AuthenticatedUser) {
    const jc = await this.prisma.jobCard.findUnique({ where: { id: jobCardId } });
    if (!jc) throw new NotFoundException('Job Card not found.');
    if (jc.status === JobCardStatus.CLOSED || jc.status === JobCardStatus.CANCELLED) {
      throw new BadRequestException(`Job Card is already ${jc.status}.`);
    }

    return this.prisma.runInTransaction(async (tx) => {
      const closed = await tx.jobCard.update({
        where: { id: jobCardId },
        data: {
          status: JobCardStatus.CLOSED,
          actualCompletionDate: new Date(),
          closedById: actor.userId,
          closedAt: new Date(),
        },
      });
      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'JOB_CARD_CLOSED',
          entityType: 'JobCard',
          entityId: jobCardId,
          referenceNo: jc.jobCardNumber,
          beforeValue: { status: jc.status },
          afterValue: { status: JobCardStatus.CLOSED, finishedQuantity: jc.finishedQuantity.toString() },
        },
        tx,
      );
      return closed;
    });
  }

  async reopenJobCard(jobCardId: string, reason: string, actor: AuthenticatedUser) {
    const jc = await this.prisma.jobCard.findUnique({ where: { id: jobCardId } });
    if (!jc) throw new NotFoundException('Job Card not found.');
    if (jc.status !== JobCardStatus.CLOSED) {
      throw new BadRequestException('Only closed Job Cards can be reopened.');
    }

    return this.prisma.runInTransaction(async (tx) => {
      const reopened = await tx.jobCard.update({
        where: { id: jobCardId },
        data: {
          status: JobCardStatus.IN_PROGRESS,
          reopenCount: { increment: 1 },
        },
      });
      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'JOB_CARD_REOPENED',
          entityType: 'JobCard',
          entityId: jobCardId,
          referenceNo: jc.jobCardNumber,
          beforeValue: { status: JobCardStatus.CLOSED },
          afterValue: { status: JobCardStatus.IN_PROGRESS, reason, reopenCount: reopened.reopenCount },
        },
        tx,
      );
      return reopened;
    });
  }
}
