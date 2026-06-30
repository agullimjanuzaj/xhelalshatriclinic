import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, buildPaginationMeta } from '../common/dto/pagination.dto';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: PaginationDto & { userId?: string; entity?: string; action?: string }) {
    const { page = 1, limit = 50, userId, entity, action } = dto;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (userId) where.userId = userId;
    if (entity) where.entity = entity;
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data: logs, meta: buildPaginationMeta(total, page, limit) };
  }
}
