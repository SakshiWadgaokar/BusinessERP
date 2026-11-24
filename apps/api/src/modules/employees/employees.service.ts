import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, UserStatus } from '@prisma/client';
import { PaginationQuery, ROLES } from '@erp/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import { AuditService } from '../../common/services/audit.service';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedUser } from '../../common/types/auth-user.type';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly auditService: AuditService,
    private readonly authService: AuthService,
  ) {}

  async list(query: PaginationQuery & { status?: string; department?: string }) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.department) where.department = { contains: query.department, mode: 'insensitive' };
    if (query.search) {
      where.OR = [
        { employeeCode: { contains: query.search, mode: 'insensitive' } },
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { designation: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: query.sortOrder },
        include: {
          assignedLocation: { select: { id: true, code: true, name: true } },
          _count: { select: { jobCardAssignments: true, productionRecords: true, scrapRecords: true } },
        },
      }),
      this.prisma.employee.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async create(input: any, actor: AuthenticatedUser) {
    if (input.createPortalLogin && !input.portalPassword) {
      throw new BadRequestException('Portal password is required when creating an employee login.');
    }
    const passwordHash =
      input.createPortalLogin && input.portalPassword
        ? await this.authService.hashPassword(input.portalPassword)
        : null;

    return this.prisma.runInTransaction(async (tx) => {
      let userId: string | null = null;
      if (input.createPortalLogin && passwordHash) {
        const empRole = await tx.role.findUniqueOrThrow({ where: { code: ROLES.EMPLOYEE } });
        const user = await tx.user.create({
          data: {
            fullName: input.fullName,
            email: input.email.toLowerCase(),
            phone: input.mobile,
            passwordHash,
            status: UserStatus.ACTIVE,
            createdById: actor.userId,
            userRoles: { create: { roleId: empRole.id, assignedBy: actor.userId } },
          },
        });
        userId = user.id;
      }

      const employeeCode = await this.sequenceService.next('EMPLOYEE', tx, { useFiscalYear: false });
      const employee = await tx.employee.create({
        data: {
          employeeCode,
          userId,
          fullName: input.fullName,
          mobile: input.mobile,
          email: input.email.toLowerCase(),
          designation: input.designation,
          department: input.department,
          joiningDate: new Date(input.joiningDate),
          assignedLocationId: input.assignedLocationId ?? null,
          hourlyLaborRate: input.hourlyLaborRate ?? null,
          status: EmployeeStatus.ACTIVE,
          createdById: actor.userId,
        },
        include: { assignedLocation: true },
      });

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'EMPLOYEE_CREATED',
          entityType: 'Employee',
          entityId: employee.id,
          referenceNo: employeeCode,
          afterValue: { fullName: employee.fullName, designation: employee.designation },
        },
        tx,
      );

      return employee;
    });
  }

  async update(id: string, input: any, actor: AuthenticatedUser) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Employee not found.');

    return this.prisma.runInTransaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
          ...(input.designation !== undefined ? { designation: input.designation } : {}),
          ...(input.department !== undefined ? { department: input.department } : {}),
          ...(input.assignedLocationId !== undefined ? { assignedLocationId: input.assignedLocationId } : {}),
          ...(input.hourlyLaborRate !== undefined ? { hourlyLaborRate: input.hourlyLaborRate } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedById: actor.userId,
        },
      });

      if (input.status && input.status !== EmployeeStatus.ACTIVE && existing.userId) {
        await tx.userSession.updateMany({
          where: { userId: existing.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await this.auditService.record(
        {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          action: 'EMPLOYEE_UPDATED',
          entityType: 'Employee',
          entityId: id,
          referenceNo: existing.employeeCode,
          beforeValue: { status: existing.status, designation: existing.designation },
          afterValue: { status: updated.status, designation: updated.designation },
        },
        tx,
      );

      return updated;
    });
  }

  async getEmployeeSummary(employeeId: string, actor: AuthenticatedUser) {
    const isElevated = actor.roles.some((r) =>
      ([ROLES.SUPER_ADMIN, ROLES.ADMIN_MANAGER, ROLES.INVENTORY_MANAGER, ROLES.ACCOUNTANT] as string[]).includes(r),
    );
    const resolvedId = employeeId === 'me' ? actor.employeeId || '' : employeeId;
    if (!isElevated && actor.employeeId !== resolvedId) {
      throw new ForbiddenException('You can only view your own employee record.');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: resolvedId },
      include: { assignedLocation: true },
    });
    if (!employee) throw new NotFoundException('Employee not found.');

    const [assignments, issuesAgg, returnsAgg, prodAgg, scrapAgg, recentActivity] = await Promise.all([
      this.prisma.jobCardAssignment.findMany({
        where: { employeeId: resolvedId, isActive: true },
        include: {
          jobCard: {
            include: {
              finishedProduct: { select: { sku: true, name: true, uom: { select: { code: true } } } },
              location: { select: { name: true } },
            },
          },
        },
        orderBy: { assignedAt: 'desc' },
      }),
      this.prisma.materialIssue.aggregate({
        where: { employeeId: resolvedId },
        _sum: { quantity: true },
        _count: true,
      }),
      this.prisma.materialReturn.aggregate({
        where: { employeeId: resolvedId },
        _sum: { quantity: true },
        _count: true,
      }),
      this.prisma.productionRecord.aggregate({
        where: { employeeId: resolvedId, recordType: 'OUTPUT' },
        _sum: { goodQuantity: true, rejectedQuantity: true },
      }),
      this.prisma.scrapRecord.aggregate({
        where: { employeeId: resolvedId },
        _sum: { quantity: true },
        _count: true,
      }),
      this.prisma.employeeActivity.findMany({
        where: { employeeId: resolvedId },
        orderBy: { occurredAt: 'desc' },
        take: 25,
      }),
    ]);

    const pendingJobCards = assignments.filter(
      (a) => !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(a.jobCard.status),
    );
    const completedJobCards = assignments.filter((a) =>
      ['COMPLETED', 'CLOSED'].includes(a.jobCard.status),
    );

    return {
      employee,
      stats: {
        totalAssigned: assignments.length,
        pendingTasks: pendingJobCards.length,
        completedTasks: completedJobCards.length,
        totalMaterialIssuedQty: issuesAgg._sum.quantity?.toString() ?? '0',
        totalMaterialReturnedQty: returnsAgg._sum.quantity?.toString() ?? '0',
        totalProductionGoodQty: prodAgg._sum.goodQuantity?.toString() ?? '0',
        totalProductionRejectedQty: prodAgg._sum.rejectedQuantity?.toString() ?? '0',
        totalScrapQty: scrapAgg._sum.quantity?.toString() ?? '0',
        scrapCount: scrapAgg._count,
      },
      assignedJobCards: assignments.map((a) => a.jobCard),
      recentActivity,
    };
  }
}
