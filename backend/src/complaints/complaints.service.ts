import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';

@Injectable()
export class ComplaintsService {
  constructor(private readonly prisma: PrismaService) {}

  // Flattens the join-table include into a plain `suggestedConditions:
  // [{id, name}]` array on each complaint — the admin mapping editor and
  // "Kontrollë e re" both want the simple shape, not the raw link rows.
  private toResponseShape(complaint: any) {
    const { suggestedConditionLinks, ...rest } = complaint;
    return {
      ...rest,
      suggestedConditions: (suggestedConditionLinks || [])
        .map((l: any) => l.suggestedCondition)
        .filter((sc: any) => sc && !sc.deletedAt)
        .map((sc: any) => ({ id: sc.id, name: sc.name })),
    };
  }

  // `activeOnly` is what "Kontrollë e re" uses for the "Ankesat kryesore"
  // checkbox list — an admin who deactivates a complaint stops offering it
  // for new plans without breaking the display of plans that already used it.
  async findAll(activeOnly = false) {
    const complaints = await this.prisma.complaint.findMany({
      where: { deletedAt: null, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { name: 'asc' },
      include: { suggestedConditionLinks: { include: { suggestedCondition: true } } },
    });
    return complaints.map((c) => this.toResponseShape(c));
  }

  async findOne(id: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, deletedAt: null },
      include: { suggestedConditionLinks: { include: { suggestedCondition: true } } },
    });
    if (!complaint) throw new NotFoundException('Ankesa nuk u gjet');
    return this.toResponseShape(complaint);
  }

  async create(dto: CreateComplaintDto) {
    const existing = await this.prisma.complaint.findFirst({ where: { name: dto.name, deletedAt: null } });
    if (existing) throw new ConflictException('Kjo ankesë ekziston tashmë');
    const { suggestedConditionIds, ...rest } = dto;
    const complaint = await this.prisma.complaint.create({
      data: {
        ...rest,
        ...(suggestedConditionIds?.length
          ? { suggestedConditionLinks: { create: suggestedConditionIds.map((suggestedConditionId) => ({ suggestedConditionId })) } }
          : {}),
      },
      include: { suggestedConditionLinks: { include: { suggestedCondition: true } } },
    });
    return this.toResponseShape(complaint);
  }

  async update(id: string, dto: UpdateComplaintDto) {
    const existing = await this.prisma.complaint.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Ankesa nuk u gjet');
    const { suggestedConditionIds, ...rest } = dto;

    if (suggestedConditionIds !== undefined) {
      await this.setSuggestedConditions(id, suggestedConditionIds);
    }

    const complaint = await this.prisma.complaint.update({
      where: { id },
      data: rest,
      include: { suggestedConditionLinks: { include: { suggestedCondition: true } } },
    });
    return this.toResponseShape(complaint);
  }

  // Replaces the full set of linked suggested conditions for this complaint
  // — used both by PATCH /complaints/:id (when suggestedConditionIds is
  // sent alongside other fields) and the dedicated PATCH
  // /complaints/:id/suggested-conditions endpoint.
  async setSuggestedConditions(complaintId: string, suggestedConditionIds: string[]) {
    const complaint = await this.prisma.complaint.findFirst({ where: { id: complaintId, deletedAt: null } });
    if (!complaint) throw new NotFoundException('Ankesa nuk u gjet');

    await this.prisma.$transaction([
      this.prisma.complaintSuggestedCondition.deleteMany({ where: { complaintId } }),
      ...(suggestedConditionIds.length
        ? [
            this.prisma.complaintSuggestedCondition.createMany({
              data: suggestedConditionIds.map((suggestedConditionId) => ({ complaintId, suggestedConditionId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    return this.findOne(complaintId);
  }

  async remove(id: string) {
    const existing = await this.prisma.complaint.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Ankesa nuk u gjet');
    // Rename to free the DB-level unique constraint on `name` so the same
    // name can be re-created immediately without hitting a P2002 violation.
    const freedName = `${existing.name}_deleted_${Date.now()}`;
    await this.prisma.complaint.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, name: freedName },
    });
    return { message: 'Ankesa u fshi me sukses' };
  }
}
